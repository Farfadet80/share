import { errorResponse, json, markLive, readJson, routeCode } from "@/lib/api-response";
import { postChat } from "@/lib/store";

export async function POST(request: Request, context: { params: Promise<{ code: string }> }) {
  await markLive();
  const { code: rawCode } = await context.params;
  const code = routeCode(rawCode);
  if (!code) return errorResponse("invalide");
  const body = await readJson(request);
  if (!body || typeof body !== "object" || !("peerId" in body) || !("text" in body) || typeof body.text !== "string") {
    return errorResponse("invalide");
  }
  const result = postChat(code, String(body.peerId), body.text);
  if (!result.ok) return errorResponse(result.error);
  return json({ message: result.message });
}
