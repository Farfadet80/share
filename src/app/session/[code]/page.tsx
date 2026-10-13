import { Suspense } from "react";
import type { Metadata } from "next";
import { RoomScreen } from "@/components/room-screen";

export const metadata: Metadata = {
  title: "Session",
};

function PendingSession() {
  return (
    <main className="grid min-h-dvh place-items-center px-4">
      <p className="text-base">Connexion…</p>
    </main>
  );
}

async function SessionContent({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <RoomScreen code={code} />;
}

export default function SessionPage({ params }: { params: Promise<{ code: string }> }) {
  return (
    <Suspense fallback={<PendingSession />}>
      <SessionContent params={params} />
    </Suspense>
  );
}
