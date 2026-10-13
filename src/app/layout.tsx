import type { ReactNode } from "react";
import type { Metadata, Viewport } from "next";
import { Fraunces, Outfit } from "next/font/google";
import { PwaRegister } from "@/components/pwa-register";
import "./globals.css";

const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-outfit",
});

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
});

export const metadata: Metadata = {
  title: {
    default: "Partage",
    template: "%s · Partage",
  },
  description:
    "Partage d'écran consenti entre un téléphone et un ordinateur. Chacun choisit de montrer son écran ou de regarder.",
  applicationName: "Partage",
  appleWebApp: {
    capable: true,
    title: "Partage",
    statusBarStyle: "default",
  },
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#f6f1e7",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr" className={`${outfit.variable} ${fraunces.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <PwaRegister />
        {children}
      </body>
    </html>
  );
}
