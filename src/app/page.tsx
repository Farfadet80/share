import { Suspense } from "react";
import { HomeScreen } from "@/components/home-screen";

function Opening() {
  return (
    <main className="grid min-h-dvh place-items-center px-4">
      <p className="text-base">Ouverture…</p>
    </main>
  );
}

async function HomeWithJoin({ searchParams }: { searchParams: Promise<{ join?: string }> }) {
  const params = await searchParams;
  return <HomeScreen joinHint={params.join ?? null} />;
}

export default function Home({ searchParams }: { searchParams: Promise<{ join?: string }> }) {
  return (
    <Suspense fallback={<Opening />}>
      <HomeWithJoin searchParams={searchParams} />
    </Suspense>
  );
}
