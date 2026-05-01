import type { Metadata, Viewport } from "next";
import { Outfit } from "next/font/google";
import "./globals.css";

const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-outfit",
  display: "swap",
});

export const metadata: Metadata = {
  title: "EmergentRPG",
  description:
    "An experimental, systemic open-world RPG where story emerges from autonomous NPCs, factions, and a reactive world.",
  manifest: "/manifest.webmanifest",
  applicationName: "EmergentRPG",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "EmergentRPG",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#f6f1e8",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={outfit.variable}>
      <body>{children}</body>
    </html>
  );
}
