import { markLive, json } from "@/lib/api-response";
import { createSession } from "@/lib/store";


export async function POST() {
  await markLive();
  return json(createSession());
}
