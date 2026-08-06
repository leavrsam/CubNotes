import type { Metadata } from "next";
import { Toaster } from "react-hot-toast";
import "./globals.css";

export const metadata: Metadata = {
  title: "CubNotes",
  description: "AI-powered infinite canvas workspace",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className="antialiased h-screen w-screen overflow-hidden bg-zinc-950 text-zinc-50 flex"
      >
        {children}
        <Toaster position="bottom-right" />
      </body>
    </html>
  );
}
