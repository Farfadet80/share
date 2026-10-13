import { PEER_ID_PATTERN } from "@/lib/codes";
import { errorResponse, json, markLive, readJson, routeCode } from "@/lib/api-response";
import { joinSession } from "@/lib/store";


export async function POST(request: Request, context: { params: Promise<{ code: string }> }) {
  await markLive();
  const { code: rawCode } = await context.params;
  const code = routeCode(rawCode);
  if (!code) return errorResponse("invalide");
  const body = await readJson(request);
  const peerId = body && typeof body === "object" && "peerId" in body ? String(body.peerId) : "";
  if (!PEER_ID_PATTERN.test(peerId)) return errorResponse("invalide");
  const result = joinSession(code, peerId);
  if (!result.ok) return errorResponse(result.error);
  return json({ you: result.you, others: result.others });
}
