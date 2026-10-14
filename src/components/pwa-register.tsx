"use client";

import { useEffect } from "react";

export function PwaRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" }).catch(() => {
      // L'ajout à l'écran d'accueil reste possible sans worker sur iPhone.
    });
  }, []);

  return null;
}
