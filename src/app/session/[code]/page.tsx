import { Suspense } from "react";
import type { Metadata } from "next";
import { RoomScreen } from "@/components/room-screen";

export const metadata: Metadata = {
  title: "Session",
};

function PendingSession() {
  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center gap-3 px-4 py-10">
      <p className="text-sm font-semibold tracking-wide text-primary uppercase">Partage</p>
      <h1 className="font-heading text-4xl">Connexion à la session…</h1>
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
