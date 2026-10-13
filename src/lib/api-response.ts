import { connection } from "next/server";
import { CODE_PATTERN } from "@/lib/codes";
import type { SessionError } from "@/lib/store";

export async function markLive() {
  await connection();
}

export function json(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export function errorResponse(error: SessionError) {
  const status = error === "inconnu" ? 404 : error === "complet" ? 409 : error === "absent" ? 403 : 400;
  return json({ error }, status);
}

export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

export function routeCode(code: string): string | null {
  const normalized = code.trim().toUpperCase();
  return CODE_PATTERN.test(normalized) ? normalized : null;
}
