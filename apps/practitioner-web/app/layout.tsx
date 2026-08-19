import type { Metadata } from "next";
import { AppShell } from "../src/components/app-shell";
import { EveAgentDock } from "../src/components/eve-agent-dock";
import "./globals.css";

export const metadata: Metadata = {
  title: "SportsAgentsLab MEF",
  description: "Evidence-first practitioner workstation preview"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <AppShell>{children}</AppShell>
        <EveAgentDock />
      </body>
    </html>
  );
}
