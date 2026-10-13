import { PEER_ID_PATTERN } from "@/lib/codes";

export type Role = "sharer" | "watcher" | null;

export type SessionDescriptionPayload = {
  type: string;
  sdp: string;
};

export type IceCandidatePayload = {
  candidate?: string;
  sdpMid?: string | null;
  sdpMLineIndex?: number | null;
  usernameFragment?: string | null;
};

export type SignalPayload =
  | { type: "reset"; generation: number }
  | { type: "bye"; generation: number }
  | { type: "offer"; generation: number; to: string; sdp: SessionDescriptionPayload }
  | { type: "answer"; generation: number; to: string; sdp: SessionDescriptionPayload }
  | { type: "ice"; generation: number; to: string; candidate: IceCandidatePayload };

export type StoredSignal = {
  id: number;
  from: string;
  payload: SignalPayload;
};

export type PublicParticipant = {
  id: string;
  role: Role;
  lastSeen: number;
};

export type SessionView = {
  you: PublicParticipant;
  others: PublicParticipant[];
};

export type ChatMessage = {
  id: number;
  from: string;
  text: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isGeneration(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0 && value < 1_000_000_000;
}

function isPeerId(value: unknown): value is string {
  return typeof value === "string" && PEER_ID_PATTERN.test(value);
}

function isSdp(value: unknown): value is SessionDescriptionPayload {
  if (!isRecord(value)) return false;
  return (
    typeof value.type === "string" &&
    value.type.length < 20 &&
    typeof value.sdp === "string" &&
    value.sdp.length > 0 &&
    value.sdp.length < 100_000
  );
}

export function parseSignal(value: unknown): SignalPayload | null {
  if (!isRecord(value) || !isGeneration(value.generation)) return null;
  if (value.type === "reset") {
    return { type: "reset", generation: value.generation };
  }
  if (value.type === "bye") {
    return { type: "bye", generation: value.generation };
  }
  if ((value.type === "offer" || value.type === "answer") && isPeerId(value.to) && isSdp(value.sdp)) {
    return { type: value.type, generation: value.generation, to: value.to, sdp: value.sdp };
  }
  if (value.type === "ice" && isPeerId(value.to) && isRecord(value.candidate)) {
    const candidate = value.candidate;
    if (candidate.candidate != null && typeof candidate.candidate !== "string") return null;
    if (typeof candidate.candidate === "string" && candidate.candidate.length > 2_000) return null;
    return {
      type: "ice",
      generation: value.generation,
      to: value.to,
      candidate: {
        candidate: typeof candidate.candidate === "string" ? candidate.candidate : undefined,
        sdpMid: typeof candidate.sdpMid === "string" ? candidate.sdpMid : null,
        sdpMLineIndex: typeof candidate.sdpMLineIndex === "number" ? candidate.sdpMLineIndex : null,
        usernameFragment:
          typeof candidate.usernameFragment === "string" ? candidate.usernameFragment : null,
      },
    };
  }
  return null;
}

export function parseRole(value: unknown): Role | undefined {
  if (value === null) return null;
  if (value === "sharer" || value === "watcher") return value;
  return undefined;
}
