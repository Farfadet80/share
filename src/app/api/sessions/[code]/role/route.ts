import { errorResponse, json, markLive, readJson, routeCode } from "@/lib/api-response";
import { parseRole } from "@/lib/signals";
import { setRole } from "@/lib/store";


export async function POST(request: Request, context: { params: Promise<{ code: string }> }) {
  await markLive();
  const { code: rawCode } = await context.params;
  const code = routeCode(rawCode);
  if (!code) return errorResponse("invalide");
  const body = await readJson(request);
  if (!body || typeof body !== "object" || !("peerId" in body) || !("role" in body)) {
    return errorResponse("invalide");
  }
  const role = parseRole(body.role);
  if (role === undefined) return errorResponse("invalide");
  const result = setRole(code, String(body.peerId), role);
  if (!result.ok) return errorResponse(result.error);
  return json({ you: result.you, others: result.others });
}
