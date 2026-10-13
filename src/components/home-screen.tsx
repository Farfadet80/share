"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CODE_PATTERN, joinCode, peerStorageKey } from "@/lib/codes";
import { ApiError, requestJson, sessionErrorText } from "@/lib/client-api";

const fieldClass =
  "h-14 rounded-lg border-input bg-secondary px-4 text-center text-xl tracking-[0.28em] uppercase";

function joinErrorText(hint: string | null): string | null {
  if (hint === "vide") return "Entrez le code.";
  if (hint === "court") return "Le code fait 5 caractères.";
  if (hint === "invalide") return "Code illisible. Pas de I, O, 0 ni 1.";
  return null;
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
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))]">
      <header className="flex items-center justify-between">
        <h1 className="text-lg font-medium">Partage</h1>
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

      <div className="flex flex-1 flex-col justify-center gap-3">
        {error ? (
          <p role="alert" className="text-base text-destructive">
            {error}
          </p>
        ) : null}

        <Button
          type="button"
          className="h-14 w-full rounded-lg text-base"
          disabled={pending !== null}
          onClick={() => void createSession()}
        >
          {pending === "create" ? "Création…" : "Créer une session"}
        </Button>

        <p className="py-1 text-center text-sm text-muted-foreground">ou</p>

        <form className="flex flex-col gap-3" method="get" action="/rejoindre" onSubmit={joinSession}>
          <label className="sr-only" htmlFor="session-code">
            Code de la session
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
          <Button type="submit" variant="secondary" className="h-14 w-full rounded-lg text-base" disabled={pending !== null}>
            {pending === "join" ? "Ouverture…" : "Rejoindre"}
          </Button>
        </form>
      </div>
    </main>
  );
}
