"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { CODE_PATTERN, MAX_PARTICIPANTS, normalizeCode, peerStorageKey, STUN_URL } from "@/lib/codes";
import { ApiError, requestJson, sessionErrorText } from "@/lib/client-api";
import type { ChatMessage, PublicParticipant, Role, SessionView, SignalPayload, StoredSignal } from "@/lib/signals";

type Phase = "checking" | "joining" | "ready" | "fatal";
type MediaMode = "none" | "local" | "remote";
type LinkState = "idle" | "connecting" | "connected" | "failed";
type FullscreenVideo = HTMLVideoElement & {
  webkitEnterFullscreen?: () => void;
  webkitExitFullscreen?: () => void;
  webkitDisplayingFullscreen?: boolean;
  webkitSupportsFullscreen?: boolean;
};

function isIphone() {
  return /iPhone|iPod/.test(navigator.userAgent);
}

function isIpad() {
  const agent = navigator.userAgent;
  if (isIphone()) return false;
  if (/iPad/.test(agent)) return true;
  // iPadOS se présente souvent comme un Mac, avec plusieurs points tactiles.
  return /Macintosh/.test(agent) && navigator.maxTouchPoints > 1;
}

let volumeControlLocked: boolean | null = null;

function mediaVolumeIsLocked() {
  if (volumeControlLocked !== null) return volumeControlLocked;
  const probe = document.createElement("video");
  probe.volume = 0.35;
  volumeControlLocked = Math.abs(probe.volume - 0.35) > 0.01;
  return volumeControlLocked;
}

function shareVolumeNeedsGraph() {
  return isIphone() || isIpad() || mediaVolumeIsLocked();
}

type ShareAudioGraph = {
  context: AudioContext;
  gain: GainNode;
  source: MediaStreamAudioSourceNode | null;
  sourceIds: string;
  detached: boolean;
};

function applyShareGain(graph: ShareAudioGraph, volume: number) {
  const now = graph.context.currentTime || 0;
  graph.gain.gain.value = volume;
  graph.gain.gain.cancelScheduledValues(now);
  graph.gain.gain.setValueAtTime(volume, now);
}

function createShareGraph(): ShareAudioGraph {
  const context = new AudioContext();
  const gain = context.createGain();
  gain.gain.value = 1;
  gain.connect(context.destination);
  return { context, gain, source: null, sourceIds: "", detached: false };
}

function destroyShareGraph(graph: ShareAudioGraph) {
  graph.source?.disconnect();
  graph.gain.disconnect();
  void graph.context.close().catch(() => undefined);
}

function pictureKey(stream: MediaStream) {
  return stream.getVideoTracks().map((track) => track.id).join(",");
}

function elementPictureKey(video: HTMLVideoElement) {
  const current = video.srcObject;
  if (!(current instanceof MediaStream)) return "";
  return pictureKey(current);
}

function videoStoleShareAudio(video: HTMLVideoElement) {
  const current = video.srcObject;
  return current instanceof MediaStream && current.getAudioTracks().length > 0;
}

function keepVideoOnGraph(video: HTMLVideoElement, stream: MediaStream) {
  video.defaultMuted = true;
  video.muted = true;
  video.playsInline = true;
  video.dataset.shareAudio = "graph";
  if (videoStoleShareAudio(video) || elementPictureKey(video) !== pictureKey(stream)) {
    video.srcObject = new MediaStream(stream.getVideoTracks());
  }
}

function reviveShareGraph(graph: ShareAudioGraph, stream: MediaStream, volume: number, video: HTMLVideoElement, forceRebind: boolean) {
  const tracks = stream.getAudioTracks().filter((track) => track.readyState === "live");
  const sourceIds = tracks.map((track) => track.id).join(",");
  const stolen = videoStoleShareAudio(video);
  if (tracks.length && (forceRebind || stolen || graph.context.state !== "running" || !graph.source || graph.sourceIds !== sourceIds)) {
    const next = graph.context.createMediaStreamSource(new MediaStream(tracks));
    next.connect(graph.gain);
    graph.source?.disconnect();
    graph.source = next;
    graph.sourceIds = sourceIds;
  }
  applyShareGain(graph, volume);
  graph.detached = true;
  keepVideoOnGraph(video, stream);
  video.dataset.shareGain = String(volume);
  video.dataset.shareBound = graph.source ? "1" : "0";
  return graph.context.resume().then(() => {
    video.dataset.shareContext = graph.context.state;
  });
}

function attachShareGraph(graph: ShareAudioGraph, stream: MediaStream, volume: number, video: HTMLVideoElement) {
  const firstSplit = !graph.detached;
  if (firstSplit) {
    try {
      video.pause();
    } catch {
      // La reprise se fait juste après, dans le même geste.
    }
    video.srcObject = null;
  }
  return reviveShareGraph(graph, stream, volume, video, firstSplit);
}

const NO_CAPTURE =
  "Safari ne peut pas envoyer l'écran d'un iPhone ou d'un iPad. Pour montrer un écran, c'est l'ordinateur qui appuie sur « Je partage mon écran ». Ce téléphone sert à le regarder.";

const NOT_SECURE =
  "Le navigateur bloque la vidéo car cette page n'est pas ouverte en adresse sécurisée (https ou localhost). Sur un téléphone, il faut une adresse https. Sur cet ordinateur, ouvrez localhost.";

type Link = {
  pc: RTCPeerConnection;
  generation: number;
  ice: RTCIceCandidateInit[];
};

type RoomRefs = {
  peerId: string;
  since: number;
  localGeneration: number;
  links: Map<string, Link>;
  pendingOffers: Set<string>;
  pendingIce: Map<string, RTCIceCandidateInit[]>;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  remoteGeneration: number;
  others: PublicParticipant[];
  stopping: false | true;
  restarting: boolean;
  sharePending: boolean;
};

function iceKey(remoteId: string, generation: number) {
  return `${remoteId}:${generation}`;
}

function chatAuthor(authorId: string, youId: string, knownIds: string[]) {
  if (authorId === youId) return "Vous";
  const guests = knownIds.filter((id) => id !== youId).sort();
  const index = guests.indexOf(authorId);
  return index >= 0 ? `Invité ${index + 1}` : "Invité";
}

function presenceText(total: number) {
  if (total <= 1) return "Vous êtes seul.";
  if (total >= MAX_PARTICIPANTS) return "Vous êtes cinq. La session est complète.";
  const words = ["", "seul", "deux", "trois", "quatre", "cinq"];
  return `Vous êtes ${words[total] ?? String(total)}.`;
}

function asDescription(sdp: { type: string; sdp: string }): RTCSessionDescriptionInit {
  const type = sdp.type === "answer" || sdp.type === "pranswer" || sdp.type === "rollback" ? sdp.type : "offer";
  return { type, sdp: sdp.sdp };
}

function subscribeBrowser() {
  return () => {};
}

async function captureDisplay(): Promise<MediaStream> {
  try {
    return await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
  } catch (error) {
    const name = error instanceof DOMException ? error.name : "";
    if (name === "NotAllowedError" || name === "AbortError") throw error;
    return navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
  }
}

function describeCaptureError(error: unknown): string {
  const name = error instanceof DOMException ? error.name : "";
  if (name === "NotAllowedError" || name === "AbortError") {
    return "Vous avez fermé la demande du navigateur. Rien n'a été envoyé. Appuyez à nouveau quand vous voulez partager.";
  }
  if (name === "NotSupportedError" || name === "NotFoundError" || name === "SecurityError") {
    return NO_CAPTURE;
  }
  return "Le navigateur n'a pas pu capturer l'écran. Réessayez, ou demandez à l'autre appareil de partager.";
}

export function RoomScreen({ code: rawCode }: { code: string }) {
  const router = useRouter();
  const code = normalizeCode(rawCode);
  const codeValid = CODE_PATTERN.test(code);
  const videoRef = useRef<FullscreenVideo>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const roomRef = useRef<RoomRefs>({
    peerId: "",
    since: 0,
    localGeneration: 0,
    links: new Map(),
    pendingOffers: new Set(),
    pendingIce: new Map(),
    localStream: null,
    remoteStream: null,
    remoteGeneration: 0,
    others: [],
    stopping: false,
    restarting: false,
    sharePending: false,
  });
  const handleSignalRef = useRef<(signal: StoredSignal) => Promise<void>>(async () => {});
  const ensureOffersRef = useRef<() => Promise<void>>(async () => {});
  const closeAllRef = useRef<() => void>(() => {});

  const [phase, setPhase] = useState<Phase>(codeValid ? "joining" : "fatal");
  const [fatal, setFatal] = useState<string | null>(
    codeValid ? null : "Ce code n'est pas valable. Il contient 5 caractères, sans 0, 1, O ni I.",
  );
  const [linkWarning, setLinkWarning] = useState<string | null>(null);
  const [captureMessage, setCaptureMessage] = useState<string | null>(null);
  const [youRole, setYouRole] = useState<Role>(null);
  const [others, setOthers] = useState<PublicParticipant[]>([]);
  const [media, setMedia] = useState<MediaMode>("none");
  const [link, setLink] = useState<LinkState>("idle");
  const canCapture = useSyncExternalStore(
    subscribeBrowser,
    () => Boolean(navigator.mediaDevices?.getDisplayMedia),
    () => null as boolean | null,
  );
  const secure = useSyncExternalStore(subscribeBrowser, () => window.isSecureContext, () => null as boolean | null);
  const [sharePending, setSharePending] = useState(false);
  const [copied, setCopied] = useState(false);
  const [streamVersion, setStreamVersion] = useState(0);
  const [soundBlocked, setSoundBlocked] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [immersive, setImmersive] = useState(false);
  const [shareVolume, setShareVolume] = useState(1);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatOpen, setChatOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [chatError, setChatError] = useState<string | null>(null);
  const chatSeenRef = useRef(0);
  const chatTimerRef = useRef(0);
  const [gainRoute, setGainRoute] = useState(false);
  const [needsPlay, setNeedsPlay] = useState(false);
  const volumeRef = useRef(1);
  const gainRef = useRef<ShareAudioGraph | null>(null);
  volumeRef.current = shareVolume;

  useEffect(() => {
    const latest = messages.at(-1)?.id ?? 0;
    if (latest <= chatSeenRef.current) return;
    chatSeenRef.current = latest;
    setChatOpen(true);
    window.clearTimeout(chatTimerRef.current);
    chatTimerRef.current = window.setTimeout(() => setChatOpen(false), 10_000);
  }, [messages]);

  useEffect(() => {
    return () => window.clearTimeout(chatTimerRef.current);
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || phase !== "ready" || media === "none") return;
    const sync = () => setNeedsPlay(video.paused);
    sync();
    video.addEventListener("pause", sync);
    video.addEventListener("play", sync);
    video.addEventListener("webkitendfullscreen", sync);
    return () => {
      video.removeEventListener("pause", sync);
      video.removeEventListener("play", sync);
      video.removeEventListener("webkitendfullscreen", sync);
    };
  }, [media, phase, streamVersion]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const stream =
      media === "local" ? roomRef.current.localStream : media === "remote" ? roomRef.current.remoteStream : null;
    const remoteAudio = media === "remote" && (stream?.getAudioTracks().length ?? 0) > 0;
    let graph = gainRef.current;
    const keepGraph =
      video.dataset.shareAudio === "graph" ||
      Boolean(graph && graph.context.state !== "closed") ||
      (shareVolumeNeedsGraph() && volumeRef.current !== 1);
    if (stream && remoteAudio && keepGraph) {
      if (!graph || graph.context.state === "closed") {
        graph = createShareGraph();
        gainRef.current = graph;
        setGainRoute(true);
      }
      const stolen = videoStoleShareAudio(video);
      void reviveShareGraph(graph, stream, volumeRef.current, video, stolen || graph.context.state !== "running");
    } else {
      if (video.srcObject !== stream) video.srcObject = stream;
      delete video.dataset.shareAudio;
      video.muted = !remoteAudio || volumeRef.current === 0;
      if (!shareVolumeNeedsGraph()) video.volume = volumeRef.current;
    }
    if (!stream) return;
    void video
      .play()
      .then(() => {
        setNeedsPlay(false);
        if (remoteAudio) setSoundBlocked(false);
      })
      .catch(() => {
        setNeedsPlay(true);
        if (remoteAudio) setSoundBlocked(true);
      });
  }, [media, streamVersion]);

  function bumpStream() {
    setStreamVersion((value) => value + 1);
  }

  function releaseShareAudio() {
    const graph = gainRef.current;
    gainRef.current = null;
    if (graph) destroyShareGraph(graph);
    const video = videoRef.current;
    if (video) delete video.dataset.shareAudio;
    setGainRoute(false);
  }

  function clearStage() {
    roomRef.current.remoteStream = null;
    roomRef.current.remoteGeneration = 0;
    setMedia("none");
    setLink("idle");
    setSoundBlocked(false);
    releaseShareAudio();
    const video = videoRef.current;
    if (video) video.srcObject = null;
  }

  function closeLink(remoteId: string) {
    const link = roomRef.current.links.get(remoteId);
    roomRef.current.links.delete(remoteId);
    for (const key of roomRef.current.pendingIce.keys()) {
      if (key.startsWith(`${remoteId}:`)) roomRef.current.pendingIce.delete(key);
    }
    if (!link) return;
    link.pc.onicecandidate = null;
    link.pc.ontrack = null;
    link.pc.onconnectionstatechange = null;
    link.pc.close();
  }

  function closeAllLinks() {
    for (const remoteId of [...roomRef.current.links.keys()]) closeLink(remoteId);
    roomRef.current.pendingIce.clear();
  }

  function refreshLinkState() {
    const states = [...roomRef.current.links.values()].map((link) => link.pc.connectionState);
    if (states.includes("connected")) setLink("connected");
    else if (states.includes("connecting") || states.includes("new")) setLink("connecting");
    else if (states.includes("failed")) setLink("failed");
    else setLink("idle");
  }

  function stopLocal() {
    const stream = roomRef.current.localStream;
    roomRef.current.localStream = null;
    if (!stream) return;
    for (const track of stream.getTracks()) {
      track.onended = null;
      track.stop();
    }
  }

  function queueIce(remoteId: string, generation: number, candidate: RTCIceCandidateInit) {
    const key = iceKey(remoteId, generation);
    const queued = roomRef.current.pendingIce.get(key) ?? [];
    queued.push(candidate);
    roomRef.current.pendingIce.set(key, queued);
  }

  async function flushIce(remoteId: string, generation: number) {
    const link = roomRef.current.links.get(remoteId);
    if (!link?.pc.remoteDescription || link.generation !== generation) return;
    const key = iceKey(remoteId, generation);
    const queued = [...link.ice, ...(roomRef.current.pendingIce.get(key) ?? [])];
    link.ice = [];
    roomRef.current.pendingIce.delete(key);
    for (const candidate of queued) {
      try {
        await link.pc.addIceCandidate(candidate);
      } catch {
        // Candidat tardif ou déjà appliqué.
      }
    }
  }

  async function postSignal(payload: SignalPayload) {
    await requestJson(`/api/sessions/${code}/signal`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ peerId: roomRef.current.peerId, payload }),
    });
  }

  function rememberOthers(next: PublicParticipant[]) {
    roomRef.current.others = next;
    setOthers(next);
  }

  async function postRole(role: Role) {
    const data = await requestJson<SessionView>(`/api/sessions/${code}/role`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ peerId: roomRef.current.peerId, role }),
    });
    setYouRole(data.you.role);
    rememberOthers(data.others);
  }

  function openLink(remoteId: string, generation: number) {
    if (!window.isSecureContext || typeof RTCPeerConnection === "undefined") {
      throw new Error("insecure");
    }
    if (!roomRef.current.localStream) {
      for (const id of [...roomRef.current.links.keys()]) {
        if (id !== remoteId) closeLink(id);
      }
    }
    closeLink(remoteId);
    const pc = new RTCPeerConnection({ iceServers: [{ urls: STUN_URL }] });
    const link: Link = { pc, generation, ice: [] };
    roomRef.current.links.set(remoteId, link);
    pc.onicecandidate = (event) => {
      if (!event.candidate || roomRef.current.links.get(remoteId) !== link) return;
      void postSignal({
        type: "ice",
        generation,
        to: remoteId,
        candidate: event.candidate.toJSON(),
      }).catch(() => {
        setLinkWarning("Un élément de la connexion n'a pas pu être envoyé. La vidéo peut quand même démarrer.");
      });
    };
    pc.ontrack = (event) => {
      if (roomRef.current.localStream || roomRef.current.links.get(remoteId) !== link) return;
      if (roomRef.current.remoteGeneration !== generation) {
        roomRef.current.remoteGeneration = generation;
        roomRef.current.remoteStream = new MediaStream();
      }
      const stream = roomRef.current.remoteStream ?? new MediaStream();
      roomRef.current.remoteStream = stream;
      const incoming = event.streams[0];
      const tracks = incoming ? incoming.getTracks() : [event.track];
      for (const track of tracks) {
        if (track.readyState === "ended") continue;
        if (!stream.getTracks().includes(track)) stream.addTrack(track);
      }
      setMedia("remote");
      bumpStream();
    };
    pc.onconnectionstatechange = () => {
      if (roomRef.current.links.get(remoteId) !== link) return;
      refreshLinkState();
    };
    setLink("connecting");
    return link;
  }

  function linkSendsStream(link: Link, stream: MediaStream) {
    const sending = new Set(link.pc.getSenders().map((sender) => sender.track).filter((track) => track && track.readyState === "live"));
    const tracks = stream.getTracks().filter((track) => track.readyState === "live");
    return tracks.length > 0 && tracks.every((track) => sending.has(track));
  }

  async function sendOffer(remoteId: string, stream: MediaStream) {
    const generation = ++roomRef.current.localGeneration;
    const link = openLink(remoteId, generation);
    for (const mediaTrack of stream.getTracks()) link.pc.addTrack(mediaTrack, stream);
    const offer = await link.pc.createOffer();
    await link.pc.setLocalDescription(offer);
    if (roomRef.current.links.get(remoteId) !== link || roomRef.current.stopping || roomRef.current.restarting) {
      return generation;
    }
    await postSignal({
      type: "offer",
      generation,
      to: remoteId,
      sdp: { type: offer.type ?? "offer", sdp: offer.sdp ?? "" },
    });
    return generation;
  }

  async function ensureOffers() {
    const stream = roomRef.current.localStream;
    if (!stream || roomRef.current.stopping || roomRef.current.restarting) return;
    const present = new Set(roomRef.current.others.map((person) => person.id));
    for (const remoteId of [...roomRef.current.links.keys()]) {
      if (!present.has(remoteId)) closeLink(remoteId);
    }
    for (const person of roomRef.current.others) {
      if (roomRef.current.pendingOffers.has(person.id)) continue;
      const existing = roomRef.current.links.get(person.id);
      if (existing && linkSendsStream(existing, stream)) continue;
      roomRef.current.pendingOffers.add(person.id);
      let generation = 0;
      let failed = false;
      try {
        generation = await sendOffer(person.id, stream);
      } catch (error) {
        failed = true;
        closeLink(person.id);
        if (error instanceof Error && error.message === "insecure") throw error;
        setLink("failed");
      } finally {
        const current = roomRef.current.links.get(person.id);
        if (failed || !current || current.generation === generation) roomRef.current.pendingOffers.delete(person.id);
      }
    }
    refreshLinkState();
  }

  ensureOffersRef.current = ensureOffers;
  closeAllRef.current = closeAllLinks;

  handleSignalRef.current = async (signal: StoredSignal) => {
    const payload = signal.payload;
    const from = signal.from;
    if (payload.type === "reset") {
      const wasSharing = Boolean(roomRef.current.localStream);
      if (wasSharing) {
        stopLocal();
        closeAllLinks();
        clearStage();
        setYouRole("watcher");
        return;
      }
      const current = roomRef.current.links.get(from);
      if (current && current.generation > payload.generation) return;
      closeLink(from);
      clearStage();
      return;
    }

    if (payload.type === "bye") {
      const hadLink = roomRef.current.links.has(from);
      closeLink(from);
      if (hadLink && !roomRef.current.localStream) clearStage();
      refreshLinkState();
      return;
    }

    if (payload.to !== roomRef.current.peerId) return;

    if (payload.type === "ice") {
      const link = roomRef.current.links.get(from);
      if (link && payload.generation < link.generation) return;
      if (!link || !link.pc.remoteDescription || link.generation !== payload.generation) {
        queueIce(from, payload.generation, payload.candidate);
        return;
      }
      try {
        await link.pc.addIceCandidate(payload.candidate);
      } catch {
        queueIce(from, payload.generation, payload.candidate);
      }
      return;
    }

    if (payload.type === "answer") {
      const link = roomRef.current.links.get(from);
      if (!link || payload.generation !== link.generation) return;
      await link.pc.setRemoteDescription(asDescription(payload.sdp));
      await flushIce(from, payload.generation);
      return;
    }

    if (payload.type !== "offer" || roomRef.current.localStream) return;
    const link = openLink(from, payload.generation);
    await link.pc.setRemoteDescription(asDescription(payload.sdp));
    await flushIce(from, payload.generation);
    const answer = await link.pc.createAnswer();
    await link.pc.setLocalDescription(answer);
    await postSignal({
      type: "answer",
      generation: payload.generation,
      to: from,
      sdp: { type: answer.type ?? "answer", sdp: answer.sdp ?? "" },
    });
  };

  useEffect(() => {
    if (!codeValid) return;
    let cancelled = false;
    const stored = sessionStorage.getItem(peerStorageKey(code));
    const peerId = stored && stored.length > 0 ? stored : crypto.randomUUID();
    sessionStorage.setItem(peerStorageKey(code), peerId);
    roomRef.current.peerId = peerId;

    void (async () => {
      try {
        const data = await requestJson<SessionView>(`/api/sessions/${code}/join`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ peerId }),
        });
        if (cancelled) return;
        setYouRole(data.you.role);
        rememberOthers(data.others);
        setPhase("ready");
      } catch (caught) {
        if (cancelled) return;
        setFatal(caught instanceof ApiError ? sessionErrorText(caught.code) : sessionErrorText("reseau"));
        setPhase("fatal");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [code, codeValid]);

  useEffect(() => {
    if (phase !== "ready") return;
    let cancelled = false;
    let timer = 0;
    let running = false;
    let failures = 0;

    async function tick() {
      if (cancelled || running) return;
      running = true;
      try {
        const data = await requestJson<SessionView & { signals: StoredSignal[]; messages: ChatMessage[] }>(
          `/api/sessions/${code}/poll?peerId=${encodeURIComponent(roomRef.current.peerId)}&since=${roomRef.current.since}`,
        );
        if (cancelled) return;
        failures = 0;
        setLinkWarning(null);
        if (!roomRef.current.localStream && !roomRef.current.sharePending) {
          setYouRole(data.you.role);
        }
        rememberOthers(data.others);
        if (Array.isArray(data.messages)) {
          setMessages((current) => {
            const byId = new Map<number, ChatMessage>();
            for (const message of current) byId.set(message.id, message);
            for (const message of data.messages) byId.set(message.id, message);
            const merged = [...byId.values()].sort((a, b) => a.id - b.id).slice(-40);
            if (
              merged.length === current.length &&
              merged.every((message, index) => message.id === current[index]?.id && message.text === current[index]?.text)
            ) {
              return current;
            }
            return merged;
          });
        }
        for (const signal of data.signals) {
          try {
            await handleSignalRef.current(signal);
          } catch (error) {
            if (error instanceof Error && error.message === "insecure") setCaptureMessage(NOT_SECURE);
            else setLink("failed");
          }
          roomRef.current.since = signal.id;
        }
        if (roomRef.current.localStream) await ensureOffersRef.current();
      } catch (caught) {
        failures += 1;
        if (failures >= 3) {
          setLinkWarning(caught instanceof ApiError ? sessionErrorText(caught.code) : sessionErrorText("reseau"));
        }
      } finally {
        running = false;
        if (!cancelled) {
          timer = window.setTimeout(tick, document.hidden ? 2000 : 700);
        }
      }
    }

    timer = window.setTimeout(tick, 200);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [code, phase]);

  useEffect(() => {
    return () => {
      stopLocal();
      closeAllRef.current();
      if (gainRef.current) destroyShareGraph(gainRef.current);
      gainRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (phase !== "ready") return;
    const video = videoRef.current;
    function syncFullscreen() {
      const webkit = Boolean(videoRef.current?.webkitDisplayingFullscreen);
      setFullscreen(Boolean(document.fullscreenElement) || webkit);
      void keepShareLevel(true);
    }
    document.addEventListener("fullscreenchange", syncFullscreen);
    video?.addEventListener("webkitbeginfullscreen", syncFullscreen);
    video?.addEventListener("webkitendfullscreen", syncFullscreen);
    return () => {
      document.removeEventListener("fullscreenchange", syncFullscreen);
      video?.removeEventListener("webkitbeginfullscreen", syncFullscreen);
      video?.removeEventListener("webkitendfullscreen", syncFullscreen);
    };
  }, [phase]);

  useEffect(() => {
    if (!immersive) return;
    const stage = stageRef.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function fit() {
      const viewport = window.visualViewport;
      if (!stage) return;
      stage.style.top = `${viewport?.offsetTop ?? 0}px`;
      stage.style.left = `${viewport?.offsetLeft ?? 0}px`;
      stage.style.right = "auto";
      stage.style.bottom = "auto";
      stage.style.width = `${viewport?.width ?? window.innerWidth}px`;
      stage.style.height = `${viewport?.height ?? window.innerHeight}px`;
    }
    fit();
    window.visualViewport?.addEventListener("resize", fit);
    window.visualViewport?.addEventListener("scroll", fit);
    return () => {
      document.body.style.overflow = previousOverflow;
      if (stage) {
        stage.style.top = "";
        stage.style.left = "";
        stage.style.right = "";
        stage.style.bottom = "";
        stage.style.width = "";
        stage.style.height = "";
      }
      window.visualViewport?.removeEventListener("resize", fit);
      window.visualViewport?.removeEventListener("scroll", fit);
    };
  }, [immersive]);

  async function publishStream(stream: MediaStream) {
    roomRef.current.restarting = true;
    stopLocal();
    closeAllLinks();
    const [track] = stream.getVideoTracks();
    if (track) {
      track.onended = () => {
        void stopSharing();
      };
    }

    try {
      await postRole("sharer");
      const generation = ++roomRef.current.localGeneration;
      await postSignal({ type: "reset", generation });
      roomRef.current.localStream = stream;
      roomRef.current.restarting = false;
      await ensureOffers();
      setMedia("local");
      bumpStream();
    } catch (caught) {
      roomRef.current.restarting = false;
      stopLocal();
      closeAllLinks();
      clearStage();
      setCaptureMessage(
        caught instanceof Error && caught.message === "insecure" ? NOT_SECURE : "Le partage n'a pas pu démarrer. Réessayez.",
      );
    } finally {
      roomRef.current.sharePending = false;
      setSharePending(false);
    }
  }

  async function shareFromGesture() {
    setCaptureMessage(null);
    if (secure === false || !window.isSecureContext) {
      setCaptureMessage(NOT_SECURE);
      return;
    }
    if (!navigator.mediaDevices?.getDisplayMedia) {
      setCaptureMessage(NO_CAPTURE);
      return;
    }
    if (roomRef.current.sharePending) return;
    roomRef.current.sharePending = true;
    setSharePending(true);

    let stream: MediaStream;
    try {
      // L'appel reste dans le geste du clic pour que le navigateur affiche sa demande d'autorisation.
      // audio: true fait proposer le son de l'onglet ou du système. Sans piste audio, la vidéo continue.
      stream = await captureDisplay();
    } catch (error) {
      setCaptureMessage(describeCaptureError(error));
      roomRef.current.sharePending = false;
      setSharePending(false);
      return;
    }

    await publishStream(stream);
  }

  async function stopSharing() {
    if (roomRef.current.stopping) return;
    roomRef.current.stopping = true;
    try {
      stopLocal();
      closeAllLinks();
      clearStage();
      const generation = ++roomRef.current.localGeneration;
      await postSignal({ type: "reset", generation });
      await postRole(null);
    } catch {
      setCaptureMessage("L'arrêt n'a pas été confirmé par la session. La capture locale est tout de même coupée.");
    } finally {
      roomRef.current.stopping = false;
    }
  }

  async function sendChat(event: FormEvent) {
    event.preventDefault();
    const text = draft.trim();
    if (!text || !roomRef.current.peerId) return;
    setDraft("");
    try {
      const data = await requestJson<{ message: ChatMessage }>(`/api/sessions/${code}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ peerId: roomRef.current.peerId, text }),
      });
      setMessages((current) =>
        current.some((message) => message.id === data.message.id) ? current : [...current, data.message].slice(-40),
      );
      setChatError(null);
    } catch {
      setDraft(text);
      setChatError("Le message n'est pas parti.");
    }
  }

  async function watch() {
    setCaptureMessage(null);
    if (roomRef.current.localStream) {
      await stopSharing();
    }
    try {
      await postRole("watcher");
    } catch {
      setLinkWarning(sessionErrorText("reseau"));
    }
  }

  function keepShareLevel(forceRebind = false) {
    const video = videoRef.current;
    const stream = roomRef.current.remoteStream;
    if (!video || !stream) return Promise.resolve();
    const volume = volumeRef.current;
    const graph = gainRef.current;
    if (graph && graph.context.state !== "closed" && video.dataset.shareAudio === "graph") {
      return reviveShareGraph(graph, stream, volume, video, forceRebind).catch(() => undefined);
    }
    if (graph?.context.state === "closed" && video.dataset.shareAudio === "graph") {
      gainRef.current = null;
      ensureShareAudio(stream, volume, video);
      return Promise.resolve();
    }
    if (!shareVolumeNeedsGraph()) {
      video.muted = volume === 0;
      video.volume = volume;
    }
    return Promise.resolve();
  }

  function ensureShareAudio(stream: MediaStream, volume: number, video: HTMLVideoElement) {
    if (!gainRef.current) gainRef.current = createShareGraph();
    attachShareGraph(gainRef.current, stream, volume, video);
    setGainRoute(true);
    return gainRef.current;
  }

  function changeShareVolume(next: number) {
    const value = Math.min(1, Math.max(0, next));
    volumeRef.current = value;
    setShareVolume(value);
    const video = videoRef.current;
    const stream = roomRef.current.remoteStream;
    const hasAudio = (stream?.getAudioTracks().length ?? 0) > 0;
    if (!video || !stream || !hasAudio) return;
    if (!shareVolumeNeedsGraph()) {
      video.volume = value;
      video.muted = value === 0;
      delete video.dataset.shareAudio;
      return;
    }
    const graph = ensureShareAudio(stream, value, video);
    void graph.context.resume().then(() => setSoundBlocked(false)).catch(() => setSoundBlocked(true));
  }

  function enableSound() {
    const video = videoRef.current;
    if (!video) return;
    if (gainRef.current || video.dataset.shareAudio === "graph") {
      void keepShareLevel(true)
        .then(() => video.play())
        .then(() => {
          setNeedsPlay(false);
          setSoundBlocked(false);
        })
        .catch(() => setSoundBlocked(true));
      return;
    }
    video.muted = volumeRef.current === 0;
    if (!shareVolumeNeedsGraph()) video.volume = volumeRef.current;
    void video.play().then(() => setSoundBlocked(false)).catch(() => setSoundBlocked(true));
  }

  async function resumePlayback() {
    const video = videoRef.current;
    if (!video) return;
    try {
      await keepShareLevel(true);
      await video.play();
      setNeedsPlay(false);
      setSoundBlocked(false);
    } catch {
      setNeedsPlay(true);
      setSoundBlocked(true);
    }
  }

  function isFullscreen() {
    const video = videoRef.current;
    return Boolean(document.fullscreenElement) || Boolean(video?.webkitDisplayingFullscreen);
  }

  function openIosFullscreen() {
    // Le lecteur natif de Safari isole la vidéo et coupe le gain du partage.
    // Le plein écran de la page laisse ce gain, et le curseur, en place.
    setImmersive(true);
  }

  async function toggleFullscreen() {
    const video = videoRef.current;
    const stage = stageRef.current;
    if (immersive || isFullscreen()) {
      setImmersive(false);
      if (document.fullscreenElement) await document.exitFullscreen().catch(() => undefined);
      else video?.webkitExitFullscreen?.();
      await keepShareLevel(true);
      if (video?.srcObject) void video.play().then(() => setNeedsPlay(false)).catch(() => setNeedsPlay(true));
      return;
    }
    if (isIphone()) {
      openIosFullscreen();
      await keepShareLevel(true);
      return;
    }
    if (isIpad()) {
      const target = stage ?? video;
      if (target?.requestFullscreen) {
        try {
          await target.requestFullscreen();
          await keepShareLevel(true);
          return;
        } catch {
          // Safari iPad peut refuser le plein écran système pour un flux WebRTC.
        }
      }
      openIosFullscreen();
      await keepShareLevel(true);
      return;
    }
    const target = stage ?? video;
    if (target?.requestFullscreen) {
      try {
        await target.requestFullscreen();
        await keepShareLevel(true);
      } catch {
        setImmersive(true);
        await keepShareLevel(true);
      }
      return;
    }
    openIosFullscreen();
    await keepShareLevel(true);
  }

  async function leave() {
    stopLocal();
    closeAllLinks();
    const peerId = roomRef.current.peerId;
    sessionStorage.removeItem(peerStorageKey(code));
    if (peerId) {
      await requestJson(`/api/sessions/${code}/leave`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ peerId }),
      }).catch(() => undefined);
    }
    router.push("/");
  }

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
      setLinkWarning("La copie a échoué. Lisez le code à voix haute.");
    }
  }

  if (phase === "fatal") {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-4 px-4">
        <h1 className="text-lg font-medium">Session indisponible</h1>
        <p role="alert" className="text-base">
          {fatal}
        </p>
        <Button type="button" className="h-12 rounded-lg text-base" onClick={() => router.push("/")}>
          Accueil
        </Button>
      </main>
    );
  }

  if (phase !== "ready") {
    return (
      <main className="grid min-h-dvh place-items-center px-4">
        <p className="text-base">Connexion… {codeValid ? code : ""}</p>
      </main>
    );
  }

  const peerSharing = others.some((person) => person.role === "sharer");
  const iShare = youRole === "sharer";
  const roomSize = others.length + 1;
  const localAudio = (roomRef.current.localStream?.getAudioTracks().length ?? 0) > 0;
  const remoteAudio = (roomRef.current.remoteStream?.getAudioTracks().length ?? 0) > 0;
  const expanded = fullscreen || immersive;
  const stalePeer = others.some((person) => Date.now() - person.lastSeen > 45_000);
  const waitingForImage = !iShare && peerSharing && media !== "remote";

  return (
    <main className="mx-auto flex h-dvh w-full max-w-3xl flex-col px-3 pt-[max(0.5rem,env(safe-area-inset-top))] pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <header className="flex items-start justify-between gap-2 pb-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="sr-only">Code {code}</p>
            <div
              data-testid="session-code"
              className="font-mono text-base tracking-[0.18em]"
              onCopy={(event) => {
                event.preventDefault();
                event.clipboardData.setData("text/plain", code);
              }}
            >
              {code}
            </div>
            <button type="button" className="h-11 px-1 text-sm text-primary" onClick={() => void copyCode()}>
              {copied ? "Copié" : "Copier"}
            </button>
          </div>
          <p className="text-xs text-muted-foreground" data-testid="presence">
            {presenceText(roomSize)}
          </p>
        </div>
        <div className="flex shrink-0 gap-1">
          <Button
            type="button"
            variant="ghost"
            data-testid="refresh-button"
            className="h-11 px-2 text-sm"
            onClick={() => window.location.reload()}
          >
            Actualiser
          </Button>
          <Button type="button" variant="ghost" className="h-11 px-2 text-sm" onClick={() => void leave()}>
            Quitter
          </Button>
        </div>
      </header>

      {secure === false ? (
        <p role="alert" className="pb-2 text-sm text-destructive">
          {NOT_SECURE}
        </p>
      ) : null}
      {canCapture === false ? (
        <p id="capture-unsupported" role="status" data-testid="capture-unsupported" className="pb-2 text-sm text-muted-foreground">
          {NO_CAPTURE}
        </p>
      ) : null}
      {captureMessage ? (
        <p role="alert" data-testid="capture-error" className="pb-2 text-sm text-destructive">
          {captureMessage}
        </p>
      ) : null}
      {linkWarning ? (
        <p role="status" className="pb-2 text-sm text-muted-foreground">
          {linkWarning}
        </p>
      ) : null}
      {stalePeer ? (
        <p role="status" className="pb-2 text-sm text-muted-foreground">
          Un invité ne répond plus. La session reste ouverte.
        </p>
      ) : null}

      <section
        ref={stageRef}
        data-testid="stage"
        data-immersive={immersive ? "true" : "false"}
        className={
          immersive
            ? "fixed inset-0 z-[80] flex h-dvh w-full flex-col gap-2 bg-black px-3 pt-[max(0.5rem,env(safe-area-inset-top))] pb-[max(0.75rem,env(safe-area-inset-bottom))]"
            : "flex min-h-0 flex-1 flex-col gap-2 [&:fullscreen]:h-full [&:fullscreen]:bg-black [&:fullscreen]:p-3"
        }
      >
        <div
          className={
            immersive
              ? "relative min-h-0 w-full flex-1 overflow-hidden bg-black"
              : "relative min-h-0 w-full flex-1 overflow-hidden rounded-lg bg-black [&:fullscreen]:min-h-0 [&:fullscreen]:flex-1"
          }
        >
          <video
            ref={videoRef}
            data-testid="stage-video"
            autoPlay
            playsInline
            muted={media !== "remote" || !remoteAudio || shareVolume === 0 || gainRoute}
            className={media === "none" ? "invisible h-full w-full" : "h-full w-full object-contain"}
          />
          {media === "none" ? (
            <div className="absolute inset-0 flex items-center justify-center px-6 text-center text-[#d1d1d6]">
              <p className="text-sm" data-testid="stage-empty">
                {waitingForImage
                  ? "Connexion…"
                  : others.length > 0
                    ? "Personne ne partage."
                    : "En attente d'un partage."}
              </p>
            </div>
          ) : null}
          {needsPlay ? (
            <button
              type="button"
              data-testid="play-button"
              className="absolute top-1/2 left-1/2 z-30 h-12 -translate-x-1/2 -translate-y-1/2 bg-black px-5 text-base text-white"
              onClick={() => void resumePlayback()}
            >
              Lecture
            </button>
          ) : null}
          <form
            data-testid="chat"
            className="absolute right-2 bottom-2 z-20 flex w-[min(14rem,72%)] flex-col items-end gap-1"
            onSubmit={(event) => void sendChat(event)}
          >
            {chatOpen ? (
            <ul data-testid="chat-log" data-open="true" aria-live="polite" className="flex max-h-28 w-full flex-col items-end justify-end gap-1 overflow-hidden">
              {messages.slice(-6).map((message) => (
                <li
                  key={message.id}
                  data-testid="chat-line"
                  className="max-w-full bg-black px-2 py-0.5 text-right text-sm leading-snug text-white"
                >
                  <span className="text-[#aeaeb2]">
                    {chatAuthor(message.from, roomRef.current.peerId, [
                      roomRef.current.peerId,
                      ...others.map((person) => person.id),
                    ])}{" "}
                  </span>
                  {message.text}
                </li>
              ))}
            </ul>
            ) : null}
            <div className="flex w-full gap-1">
              <input
                data-testid="chat-input"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                maxLength={180}
                enterKeyHint="send"
                autoComplete="off"
                aria-label="Message"
                placeholder="Message"
                className="h-11 min-w-0 flex-1 border-0 bg-black px-3 text-base text-white outline-none placeholder:text-[#8e8e93]"
              />
              <button
                type="submit"
                data-testid="chat-send"
                className="h-11 shrink-0 bg-[#3a3a3c] px-3 text-sm text-white"
              >
                Envoyer
              </button>
            </div>
            {chatError ? <p className="text-xs text-white">{chatError}</p> : null}
          </form>
        </div>
        {media === "remote" ? (
          <div className="flex flex-col gap-2">
            {soundBlocked ? (
              <Button
                type="button"
                data-testid="enable-sound"
                className="h-12 w-full rounded-lg text-base"
                onClick={enableSound}
              >
                Activer le son
              </Button>
            ) : null}
            {remoteAudio ? (
              <label className="flex flex-col gap-1" htmlFor="share-volume">
                <span className="flex items-center justify-between text-sm">
                  <span>Volume du partage</span>
                  <span data-testid="share-volume-value">{Math.round(shareVolume * 100)} %</span>
                </span>
                <input
                  id="share-volume"
                  data-testid="share-volume"
                  data-audio-route={gainRoute ? "gain" : "element"}
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={Math.round(shareVolume * 100)}
                  onChange={(event) => changeShareVolume(Number(event.target.value) / 100)}
                  className="h-11 w-full cursor-pointer accent-primary"
                />
              </label>
            ) : null}
          </div>
        ) : null}
        {media !== "none" ? (
          <Button
            type="button"
            variant="secondary"
            data-testid="fullscreen-button"
            className="h-12 w-full rounded-lg text-base"
            onClick={() => void toggleFullscreen()}
          >
            {expanded ? "Quitter le plein écran" : "Plein écran"}
          </Button>
        ) : null}
        <p className="text-xs text-muted-foreground" data-testid="media-mode">
          {iShare
            ? localAudio
              ? "Vous partagez, avec le son."
              : "Vous partagez, sans son."
            : media === "remote"
              ? remoteAudio
                ? "Écran reçu, avec le son."
                : "Écran reçu, sans son."
              : youRole === "watcher"
                ? "En attente du partage."
                : "Partager, ou regarder."}
        </p>
        <p className="sr-only" data-testid="link-state">
          {link}
        </p>
      </section>

      {link === "failed" ? (
        <p role="alert" className="pt-2 text-sm text-destructive">
          Image impossible. Arrêtez le partage, puis relancez-le.
        </p>
      ) : null}

      <div className="flex flex-col gap-2 pt-2">
        {iShare ? (
          <Button
            type="button"
            variant="destructive"
            className="h-12 w-full rounded-lg bg-destructive text-base text-white hover:bg-destructive/90"
            onClick={() => void stopSharing()}
          >
            Arrêter le partage
          </Button>
        ) : (
          <>
            {canCapture === false && youRole !== "watcher" && !peerSharing ? (
              <Button
                type="button"
                data-testid="watch-button"
                className="h-12 w-full rounded-lg text-base"
                onClick={() => void watch()}
              >
                Je regarde
              </Button>
            ) : null}
            <Button
              type="button"
              data-testid="share-button"
              className="h-12 w-full rounded-lg text-base"
              disabled={sharePending || canCapture === false}
              aria-describedby={canCapture === false ? "capture-unsupported" : undefined}
              onClick={() => void shareFromGesture()}
            >
              {sharePending && canCapture !== false
                ? "Autorisation…"
                : peerSharing
                  ? "Partager à la place"
                  : "Je partage mon écran"}
            </Button>
            {canCapture !== false && youRole !== "watcher" && !peerSharing ? (
              <Button
                type="button"
                variant="secondary"
                data-testid="watch-button"
                className="h-12 w-full rounded-lg text-base"
                onClick={() => void watch()}
              >
                Je regarde
              </Button>
            ) : null}
          </>
        )}
      </div>
    </main>
  );
}
