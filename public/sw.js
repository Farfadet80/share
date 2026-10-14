const WAITING_HTML = "<!DOCTYPE html>\n<html lang=\"fr\">\n<head>\n  <meta charset=\"utf-8\">\n  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">\n  <title>Share se réveille</title>\n  <style>\n    html, body {\n      margin: 0;\n      height: 100%;\n      background: #000;\n      color: #f2f2f7;\n      font-family: ui-sans-serif, system-ui, -apple-system, \"Segoe UI\", sans-serif;\n    }\n    main {\n      min-height: 100%;\n      display: flex;\n      flex-direction: column;\n      align-items: center;\n      justify-content: center;\n      gap: 1.25rem;\n    }\n    img { width: 72px; height: 72px; }\n    h1 {\n      margin: 0;\n      font-size: 1.35rem;\n      font-weight: 600;\n      letter-spacing: -0.02em;\n    }\n    .wait {\n      width: 10px;\n      height: 10px;\n      border-radius: 50%;\n      background: #0a84ff;\n      animation: pulse 1.2s ease-in-out infinite;\n    }\n    @keyframes pulse { 50% { opacity: 0.2; } }\n  </style>\n</head>\n<body>\n  <main>\n    <img src=\"data:image/png;base64,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\" alt=\"\">\n    <h1>Share se réveille</h1>\n    <div class=\"wait\" role=\"status\" aria-label=\"Share se réveille\"></div>\n  </main>\n  <script>\n    let left = false;\n    function openApp() {\n      if (left) return;\n      left = true;\n      location.reload();\n    }\n    function probe() {\n      if (left) return;\n      const image = new Image();\n      image.onload = openApp;\n      image.src = \"/icon-192.png?t=\" + Date.now();\n    }\n    navigator.serviceWorker.addEventListener(\"message\", function (event) {\n      if (event.data === \"share-ready\") openApp();\n    });\n    probe();\n    setInterval(probe, 3000);\n  </script>\n</body>\n</html>";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate") return;

  event.respondWith(serveNavigation(event.request));
});

async function serveNavigation(request) {
  const pending = fetch(request).then(
    (response) => response,
    () => null,
  );
  let finished = false;
  const result = await Promise.race([
    pending.then((response) => {
      finished = true;
      return response;
    }),
    new Promise((resolve) => {
      setTimeout(() => resolve(null), 2000);
    }),
  ]);

  if (finished && result && result.ok) return result;
  if (result && result.body) result.body.cancel();

  if (!finished) {
    pending.then((response) => {
      if (!response || !response.ok) return;
      return self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
        for (const client of clients) client.postMessage("share-ready");
      });
    });
  }

  return new Response(WAITING_HTML, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
