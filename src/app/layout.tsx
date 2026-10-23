import type { Metadata, Viewport } from "next";
import { Toaster } from "react-hot-toast";
import "./globals.css";

export const metadata: Metadata = {
  title: "Motif",
  description: "AI-powered infinite spatial canvas & meeting workspace",
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon.png", type: "image/png", sizes: "32x32" },
      { url: "/favicon-48.png", type: "image/png", sizes: "48x48" },
      { url: "/icon.png", type: "image/png", sizes: "512x512" },
      { url: "/logo.png", type: "image/png", sizes: "512x512" },
    ],
    shortcut: "/favicon.ico",
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Motif",
  },
};

export const viewport: Viewport = {
  themeColor: "#09090b",
  viewportFit: "cover",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

import { ThemeProvider } from "@/components/ThemeProvider";
import { AccentProvider } from "@/components/AccentProvider";
import { ServiceWorkerRegistration } from "@/components/ServiceWorkerRegistration";
import { AppUpdatePrompt } from "@/components/AppUpdatePrompt";

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
            <ServiceWorkerRegistration />
            {children}
            <AppUpdatePrompt />
            <Toaster position="bottom-right" />
          </AccentProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
