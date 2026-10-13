"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { CODE_PATTERN, joinCode, peerStorageKey } from "@/lib/codes";
import { ApiError, requestJson, sessionErrorText } from "@/lib/client-api";

const fieldClass =
  "h-14 rounded-2xl px-4 text-center text-xl font-semibold tracking-[0.28em] uppercase md:text-xl";

function joinErrorText(hint: string | null): string | null {
  if (hint === "vide") return "Entrez le code affiché sur l'autre appareil.";
  if (hint === "court") return "Le code fait 5 caractères. Les espaces ne comptent pas.";
  if (hint === "invalide") return "Relisez le code : les lettres I et O, et les chiffres 0 et 1, ne sont pas utilisés.";
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
      setError("Entrez le code affiché sur l'autre appareil.");
      return;
    }
    if (!CODE_PATTERN.test(normalized)) {
      setError(
        normalized.length < 5
          ? "Le code fait 5 caractères. Les espaces ne comptent pas."
          : "Relisez le code : les lettres I et O, et les chiffres 0 et 1, ne sont pas utilisés.",
      );
      return;
    }
    setError(null);
    setPending("join");
    router.push(`/session/${normalized}`);
  }

  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-6 px-4 py-8 pb-[max(2rem,env(safe-area-inset-bottom))]">
      <header className="flex flex-col gap-3">
        <div className="flex justify-end">
          <Button
            type="button"
            variant="outline"
            data-testid="refresh-button"
            className="h-11 rounded-2xl px-4 text-sm"
            onClick={() => window.location.reload()}
          >
            Actualiser
          </Button>
        </div>
        <p className="text-sm font-semibold tracking-wide text-primary uppercase">Écran partagé, jusqu&apos;à cinq</p>
        <h1 className="font-heading text-5xl leading-none text-balance">Partage</h1>
        <p className="text-lg leading-relaxed text-muted-foreground">
          Montrez votre écran à plusieurs personnes, ou regardez celui d&apos;un invité. Rien n&apos;est capturé tant que
          la personne qui partage n&apos;a pas appuyé sur le bouton : le navigateur demande alors l&apos;autorisation.
        </p>
      </header>

      {error ? (
        <p role="alert" className="rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-base text-destructive">
          {error}
        </p>
      ) : null}

      <Card className="rounded-3xl">
        <CardHeader>
          <CardTitle className="font-heading text-2xl">Créer une session</CardTitle>
          <CardDescription className="text-base">Un code court s&apos;affiche, à lire à voix haute ou à copier.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            type="button"
            className="h-14 w-full rounded-2xl text-base"
            disabled={pending !== null}
            onClick={() => void createSession()}
          >
            {pending === "create" ? "Création de la session…" : "Créer une session"}
          </Button>
        </CardContent>
      </Card>

      <Card className="rounded-3xl">
        <CardHeader>
          <CardTitle className="font-heading text-2xl">Rejoindre</CardTitle>
          <CardDescription className="text-base">Vous avez déjà un code ? Saisissez-le ici.</CardDescription>
        </CardHeader>
        <CardContent>
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
            <Button type="submit" variant="secondary" className="h-14 w-full rounded-2xl text-base" disabled={pending !== null}>
              {pending === "join" ? "Ouverture de la session…" : "Rejoindre"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <p className="text-sm leading-relaxed text-muted-foreground">
        Cinq personnes au maximum, une seule envoie l&apos;écran. Pas de prise de contrôle à distance. Sur iPhone ou
        iPad, Safari ne peut pas envoyer l&apos;écran : le téléphone regarde celui de l&apos;ordinateur.
      </p>
    </main>
  );
}
