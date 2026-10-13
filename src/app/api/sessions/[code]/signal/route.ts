import { errorResponse, json, markLive, readJson, routeCode } from "@/lib/api-response";
import { parseSignal } from "@/lib/signals";
import { pushSignal } from "@/lib/store";


export async function POST(request: Request, context: { params: Promise<{ code: string }> }) {
  await markLive();
  const { code: rawCode } = await context.params;
  const code = routeCode(rawCode);
  if (!code) return errorResponse("invalide");
  const body = await readJson(request);
  if (!body || typeof body !== "object" || !("peerId" in body)) return errorResponse("invalide");
  const payload = parseSignal("payload" in body ? body.payload : null);
  if (!payload) return errorResponse("invalide");
  const result = pushSignal(code, String(body.peerId), payload);
  if (!result.ok) return errorResponse(result.error);
  return json({ id: result.id });
}
