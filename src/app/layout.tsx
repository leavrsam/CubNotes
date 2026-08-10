import type { Metadata, Viewport } from "next";
import { Toaster } from "react-hot-toast";
import "./globals.css";

export const metadata: Metadata = {
  title: "CubNotes",
  description: "AI-powered infinite canvas workspace",
};

export const viewport: Viewport = {
  viewportFit: "cover",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

import { ThemeProvider } from "@/components/ThemeProvider";
import { AccentProvider } from "@/components/AccentProvider";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // We remove className="dark" from HTML so next-themes can manage it
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className="antialiased h-screen w-screen overflow-hidden bg-zinc-950 text-zinc-50 flex"
      >
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
          <AccentProvider>
            {children}
            <Toaster position="bottom-right" />
          </AccentProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
