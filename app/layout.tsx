import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "EmergentRPG",
  description:
    "An experimental, systemic open-world RPG where story emerges from autonomous NPCs, factions, and a reactive world.",
  manifest: "/manifest.webmanifest",
  applicationName: "EmergentRPG",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "EmergentRPG",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#0b0d10",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
