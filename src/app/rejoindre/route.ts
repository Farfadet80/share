import { CODE_PATTERN, joinCode } from "@/lib/codes";
import { NextResponse } from "next/server";

function redirectTo(request: Request, pathname: string, search = "") {
  const incoming = new URL(request.url);
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const hostHeader = request.headers.get("host")?.trim();
  const host = [forwardedHost, hostHeader, incoming.host].find((value) => value && !value.startsWith("0.0.0.0")) ?? incoming.host;
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const proto = forwardedProto || incoming.protocol.replace(":", "") || "https";
  return NextResponse.redirect(new URL(`${pathname}${search ? `?${search}` : ""}`, `${proto}://${host}`));
}

export async function GET(request: Request) {
  const raw = new URL(request.url).searchParams.get("code") ?? "";
  const code = joinCode(raw);
  if (!CODE_PATTERN.test(code)) {
    const reason = code.length === 0 ? "vide" : code.length < 5 ? "court" : "invalide";
    return redirectTo(request, "/", `join=${reason}`);
  }
  return redirectTo(request, `/session/${code}`);
}
