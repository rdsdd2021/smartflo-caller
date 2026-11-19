import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Smartflo Auto-Dialer & DTMF Logger",
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
        {children}
      </body>
    </html>
  );
}
