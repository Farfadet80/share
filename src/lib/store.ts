import { CODE_ALPHABET, CODE_LENGTH, CODE_PATTERN, MAX_PARTICIPANTS, PEER_ID_PATTERN } from "@/lib/codes";
import {
  parseRole,
  type ChatMessage,
  type PublicParticipant,
  type Role,
  type SignalPayload,
  type StoredSignal,
} from "@/lib/signals";

const SESSION_TTL_MS = 4 * 60 * 60 * 1000;
const MAX_SIGNALS = 800;
const MAX_CHAT = 40;
const MAX_CHAT_LENGTH = 180;

type Participant = PublicParticipant;

type Session = {
  code: string;
  createdAt: number;
  nextSignalId: number;
  participants: Participant[];
  signals: StoredSignal[];
  messages: ChatMessage[];
  nextMessageId: number;
};

type Store = {
  sessions: Map<string, Session>;
};

const globalStore = globalThis as typeof globalThis & { __partageStore?: Store };

function store(): Store {
  if (!globalStore.__partageStore) {
    globalStore.__partageStore = { sessions: new Map() };
  }
  return globalStore.__partageStore;
}

function prune(now = Date.now()) {
  for (const [code, session] of store().sessions) {
    if (now - session.createdAt > SESSION_TTL_MS) {
      store().sessions.delete(code);
    }
  }
}

function randomCode(): string {
  const bytes = new Uint8Array(CODE_LENGTH);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => CODE_ALPHABET[byte % CODE_ALPHABET.length]).join("");
}

function view(session: Session, peerId: string) {
  const you = session.participants.find((participant) => participant.id === peerId);
  if (!you) return null;
  const others = session.participants
    .filter((participant) => participant.id !== peerId)
    .map((participant) => ({ id: participant.id, role: participant.role, lastSeen: participant.lastSeen }));
  return {
    you: { id: you.id, role: you.role, lastSeen: you.lastSeen },
    others,
  };
}

export function createSession(): { code: string; peerId: string } {
  prune();
  let code = randomCode();
  while (store().sessions.has(code)) {
    code = randomCode();
  }
  const peerId = crypto.randomUUID();
  const now = Date.now();
  store().sessions.set(code, {
    code,
    createdAt: now,
    nextSignalId: 1,
    participants: [{ id: peerId, role: null, lastSeen: now }],
    signals: [],
    messages: [],
    nextMessageId: 1,
  });
  return { code, peerId };
}

export type SessionError = "invalide" | "inconnu" | "complet" | "absent";

function fail(error: SessionError): { ok: false; error: SessionError } {
  return { ok: false, error };
}

export function joinSession(code: string, peerId: string) {
  prune();
  if (!CODE_PATTERN.test(code) || !PEER_ID_PATTERN.test(peerId)) return fail("invalide");
  const session = store().sessions.get(code);
  if (!session) return fail("inconnu");
  const now = Date.now();
  const existing = session.participants.find((participant) => participant.id === peerId);
  if (!existing) {
    if (session.participants.length >= MAX_PARTICIPANTS) return fail("complet");
    session.participants.push({ id: peerId, role: null, lastSeen: now });
  } else {
    existing.lastSeen = now;
  }
  const snapshot = view(session, peerId);
  if (!snapshot) return fail("absent");
  return { ok: true as const, ...snapshot };
}

function sessionFor(code: string, peerId: string) {
  prune();
  if (!CODE_PATTERN.test(code) || !PEER_ID_PATTERN.test(peerId)) return fail("invalide");
  const session = store().sessions.get(code);
  if (!session) return fail("inconnu");
  const participant = session.participants.find((item) => item.id === peerId);
  if (!participant) return fail("absent");
  participant.lastSeen = Date.now();
  return { ok: true as const, session, participant };
}

export function pollSession(code: string, peerId: string, since: number) {
  const found = sessionFor(code, peerId);
  if (!found.ok) return found;
  const signals = found.session.signals
    .filter((signal) => {
      if (signal.id <= since || signal.from === peerId) return false;
      const target = "to" in signal.payload ? signal.payload.to : undefined;
      return !target || target === peerId;
    })
    .slice(0, 80);
  const snapshot = view(found.session, peerId);
  if (!snapshot) return fail("absent");
  return { ok: true as const, signals, messages: chatMessages(found.session), ...snapshot };
}

function chatMessages(session: Session): ChatMessage[] {
  if (!session.messages) session.messages = [];
  return session.messages;
}

export function postChat(code: string, peerId: string, text: string) {
  const found = sessionFor(code, peerId);
  if (!found.ok) return found;
  const clean = text.replace(/\s+/g, " ").trim().slice(0, MAX_CHAT_LENGTH);
  if (!clean) return fail("invalide");
  if (!found.session.messages) {
    found.session.messages = [];
    found.session.nextMessageId = 1;
  }
  const message: ChatMessage = {
    id: found.session.nextMessageId++,
    from: peerId,
    text: clean,
  };
  found.session.messages.push(message);
  if (found.session.messages.length > MAX_CHAT) {
    found.session.messages.splice(0, found.session.messages.length - MAX_CHAT);
  }
  return { ok: true as const, message };
}

export function pushSignal(code: string, peerId: string, payload: SignalPayload) {
  const found = sessionFor(code, peerId);
  if (!found.ok) return found;
  const signal: StoredSignal = {
    id: found.session.nextSignalId++,
    from: peerId,
    payload,
  };
  found.session.signals.push(signal);
  if (found.session.signals.length > MAX_SIGNALS) {
    found.session.signals.splice(0, found.session.signals.length - MAX_SIGNALS);
  }
  return { ok: true as const, id: signal.id };
}

export function setRole(code: string, peerId: string, role: Role) {
  const found = sessionFor(code, peerId);
  if (!found.ok) return found;
  if (parseRole(role) === undefined) return fail("invalide");
  if (role === "sharer") {
    for (const participant of found.session.participants) {
      if (participant.id === peerId) participant.role = "sharer";
      else if (participant.role === "sharer") participant.role = "watcher";
    }
  } else {
    found.participant.role = role;
  }
  const snapshot = view(found.session, peerId);
  if (!snapshot) return fail("absent");
  return { ok: true as const, ...snapshot };
}

export function leaveSession(code: string, peerId: string) {
  const found = sessionFor(code, peerId);
  if (!found.ok) return found;
  const wasSharer = found.participant.role === "sharer";
  const generation = found.session.nextSignalId;
  found.session.participants = found.session.participants.filter((participant) => participant.id !== peerId);
  if (found.session.participants.length === 0) {
    store().sessions.delete(code);
    return { ok: true as const };
  }
  found.session.signals.push({
    id: found.session.nextSignalId++,
    from: peerId,
    payload: wasSharer ? { type: "reset", generation } : { type: "bye", generation },
  });
  return { ok: true as const };
}
