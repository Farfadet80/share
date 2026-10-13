import { errorResponse, json, markLive, routeCode } from "@/lib/api-response";
import { pollSession } from "@/lib/store";


export async function GET(request: Request, context: { params: Promise<{ code: string }> }) {
  await markLive();
  const { code: rawCode } = await context.params;
  const code = routeCode(rawCode);
  if (!code) return errorResponse("invalide");
  const url = new URL(request.url);
  const peerId = url.searchParams.get("peerId") ?? "";
  const since = Number(url.searchParams.get("since") ?? "0");
  const result = pollSession(code, peerId, Number.isFinite(since) ? since : 0);
  if (!result.ok) return errorResponse(result.error);
  return json({ you: result.you, others: result.others, signals: result.signals, messages: result.messages });
}
