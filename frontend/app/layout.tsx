import type { Metadata } from "next";
import "./globals.css";
import ClientProviders from "../components/ClientProviders";

export const metadata: Metadata = {
  title: "Smartflo Auto-Dialer & Telecom CRM",
  description: "Automated Outbound Calling with IVR Audio Playback and Keypad Response Logging",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased bg-slate-950 text-slate-100">
        <ClientProviders>{children}</ClientProviders>
      </body>
    </html>
  );
}
