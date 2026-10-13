export const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const CODE_LENGTH = 5;
export const CODE_PATTERN = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{5}$/;

export const STUN_URL = "stun:stun.l.google.com:19302";
export const MAX_PARTICIPANTS = 5;

export const PEER_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function normalizeCode(input: string): string {
  return input.trim().toUpperCase().replace(/\s+/g, "");
}

export function joinCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, CODE_LENGTH);
}

export function peerStorageKey(code: string): string {
  return `partage.peer.${code}`;
}
