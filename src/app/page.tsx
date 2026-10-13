import { Suspense } from "react";
import { HomeScreen } from "@/components/home-screen";

function Opening() {
  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center gap-3 px-4 py-10">
      <p className="text-sm font-semibold tracking-wide text-primary uppercase">Partage</p>
      <h1 className="font-heading text-4xl">Ouverture de Partage…</h1>
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
