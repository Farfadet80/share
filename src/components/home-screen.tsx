"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ShareMark } from "@/components/share-mark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CODE_PATTERN, joinCode, peerStorageKey } from "@/lib/codes";
import { ApiError, requestJson, sessionErrorText } from "@/lib/client-api";

const fieldClass =
  "h-14 rounded-lg border-[#3a3a3c] bg-[#1c1c1e] px-4 text-center text-xl tracking-[0.28em] uppercase";

function joinErrorText(hint: string | null): string | null {
  if (hint === "vide") return "Entrez le code.";
  if (hint === "court") return "Le code fait 5 caractères.";
  if (hint === "invalide") return "Code illisible. Pas de I, O, 0 ni 1.";
  return null;
}

function SharedScreen() {
  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden="true">
      <div className="absolute top-[6%] right-[4%] w-[78%] sm:top-[18%] sm:right-[7%] sm:w-[42%]">
        <div className="rounded-2xl bg-[#3a3a3c] p-2 sm:p-3">
          <div className="relative aspect-video overflow-hidden rounded-lg bg-[#141414]">
            <img src="/icon-512.png" alt="" className="absolute top-2 left-2 size-10 rounded-md sm:top-3 sm:left-3 sm:size-14" />
            <div className="absolute inset-x-3 bottom-3 top-14 flex flex-col gap-2 sm:inset-x-4 sm:top-20">
              <div className="h-1.5 w-3/5 rounded-full bg-[#d1d1d6]/80" />
              <div className="h-1.5 w-2/5 rounded-full bg-[#8e8e93]" />
              <div className="mt-1 min-h-8 flex-1 rounded-md bg-[#2c2c2e]" />
            </div>
          </div>
        </div>
        <div className="absolute -bottom-7 -left-6 w-14 rounded-xl bg-[#3a3a3c] p-1 sm:-bottom-10 sm:-left-10 sm:w-[4.5rem]">
          <div className="relative aspect-[9/16] overflow-hidden rounded-lg bg-[#141414]">
            <img src="/icon-192.png" alt="" className="absolute top-1.5 left-1/2 size-6 -translate-x-1/2 rounded-sm" />
            <div className="absolute inset-x-1.5 bottom-1.5 top-9 rounded-sm bg-[#2c2c2e]" />
          </div>
        </div>
      </div>
    </div>
  );
}

export function HomeScreen({ joinHint = null }: { joinHint?: string | null }) {
  const router = useRouter();
  const [pending, setPending] = useState<"create" | "join" | null>(null);
  const [error, setError] = useState<string | null>(joinErrorText(joinHint));

  async function createSession() {
    setError(null);
    setPending("create");
    try {
      const data = await requestJson<{ code: string; peerId: string }>("/api/sessions", {
        method: "POST",
      });
      sessionStorage.setItem(peerStorageKey(data.code), data.peerId);
      router.push(`/session/${data.code}`);
    } catch (caught) {
      setError(caught instanceof ApiError ? sessionErrorText(caught.code) : sessionErrorText("reseau"));
      setPending(null);
    }
  }

  function joinSession(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const raw = String(new FormData(event.currentTarget).get("code") ?? "");
    const normalized = joinCode(raw);
    if (normalized.length === 0) {
      setError("Entrez le code.");
      return;
    }
    if (!CODE_PATTERN.test(normalized)) {
      setError(normalized.length < 5 ? "Le code fait 5 caractères." : "Code illisible. Pas de I, O, 0 ni 1.");
      return;
    }
    setError(null);
    setPending("join");
    router.push(`/session/${normalized}`);
  }

  return (
    <main className="min-h-dvh bg-black">
      <div className="mx-auto flex w-full max-w-6xl flex-col px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <header className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <ShareMark className="size-9 shrink-0 rounded-md" />
            <p className="text-xl font-semibold tracking-tight">Share</p>
          </div>
          <Button
            type="button"
            variant="ghost"
            data-testid="refresh-button"
            className="h-11 px-3 text-sm"
            onClick={() => window.location.reload()}
          >
            Actualiser
          </Button>
        </header>

        <section className="relative mt-4 h-[26rem] overflow-hidden rounded-2xl bg-[#101010] sm:h-[30rem]">
          <SharedScreen />
          <div className="absolute inset-0 bg-gradient-to-t from-black from-42% via-black/55 to-transparent sm:bg-gradient-to-r sm:from-black sm:from-28% sm:via-black/35 sm:via-58% sm:to-transparent" />
          <div className="relative flex h-full flex-col justify-end gap-4 p-5 sm:max-w-xl sm:justify-center sm:p-10">
            <h1 className="text-4xl leading-none font-semibold tracking-tight sm:text-6xl">Regarder ensemble.</h1>
            <p className="max-w-sm text-sm leading-relaxed text-[#d1d1d6] sm:text-base">
              L&apos;ordinateur envoie son écran. Les autres le regardent, au même moment.
            </p>
            {error ? (
              <p role="alert" className="text-base text-destructive">
                {error}
              </p>
            ) : null}
            <Button
              type="button"
              className="h-14 w-full rounded-lg text-base sm:w-fit sm:px-8"
              disabled={pending !== null}
              onClick={() => void createSession()}
            >
              {pending === "create" ? "Création…" : "Créer une session"}
            </Button>
          </div>
        </section>

        <form className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end" method="get" action="/rejoindre" onSubmit={joinSession}>
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <label className="text-sm text-[#aeaeb2]" htmlFor="session-code">
              Code
            </label>
            <Input
              id="session-code"
              name="code"
              inputMode="text"
              autoCapitalize="characters"
              autoCorrect="off"
              autoComplete="off"
              spellCheck={false}
              maxLength={32}
              placeholder="K7MPQ"
              aria-invalid={error ? true : undefined}
              className={fieldClass}
            />
          </div>
          <Button
            type="submit"
            variant="secondary"
            className="h-14 w-full rounded-lg text-base sm:w-44"
            disabled={pending !== null}
          >
            {pending === "join" ? "Ouverture…" : "Rejoindre"}
          </Button>
        </form>

        <section className="mt-8">
          <h2 className="text-sm font-semibold tracking-wide text-[#f2f2f7] uppercase">
            <span className="border-b-2 border-[#0a84ff] pb-1">La session</span>
          </h2>
          <dl className="mt-5 grid max-w-lg grid-cols-3 gap-3 text-sm">
            <div>
              <dt className="text-[#8e8e93]">Personnes</dt>
              <dd className="mt-1 text-base text-[#f2f2f7]">Cinq</dd>
            </div>
            <div>
              <dt className="text-[#8e8e93]">Envoi</dt>
              <dd className="mt-1 text-base text-[#f2f2f7]">L&apos;ordinateur</dd>
            </div>
            <div>
              <dt className="text-[#8e8e93]">Lecture</dt>
              <dd className="mt-1 text-base text-[#f2f2f7]">Le téléphone</dd>
            </div>
          </dl>
        </section>
      </div>
    </main>
  );
}
