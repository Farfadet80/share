import { MAX_PARTICIPANTS } from "@/lib/codes";

export class ApiError extends Error {
  code: string;

  constructor(code: string) {
    super(code);
    this.code = code;
  }
}

export async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...init });
  const data = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) {
    throw new ApiError(typeof data.error === "string" ? data.error : "reseau");
  }
  return data;
}

export function sessionErrorText(code: string | undefined): string {
  switch (code) {
    case "inconnu":
      return "Ce code ne correspond à aucune session en cours. Vérifiez-le, ou créez une nouvelle session.";
    case "complet":
      return `Cette session a déjà ${MAX_PARTICIPANTS} personnes. Demandez un nouveau code.`;
    case "invalide":
      return "Ce code n'est pas valable. Il contient 5 caractères, sans 0, 1, O ni I.";
    case "absent":
      return "La session ne vous reconnaît plus. Revenez à l'accueil et entrez le code à nouveau.";
    default:
      return "La liaison avec Share a été coupée. Réessayez dans un instant.";
  }
}
