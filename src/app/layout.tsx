import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import Script from "next/script";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });

export const viewport: Viewport = {
  themeColor: "#030b14",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  title: "BreatheOS — Cardiovascular Meditation & Breathing Training",
  description: "A progressive breathing system that lowers blood pressure, expands lung capacity, and trains your cardiovascular system — guided by science.",
  keywords: ["BreatheOS","breathing exercises","blood pressure","cardiovascular","meditation","vagus nerve","lung capacity"],
  authors: [{ name: "BreatheOS" }],
  manifest: "/manifest.json",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "BreatheOS" },
  openGraph: {
    title: "BreatheOS — Cardiovascular Meditation",
    description: "Progressive breathing training system for cardiovascular health",
    type: "website",
    images: [{ url: "/og-image.svg", width: 1200, height: 630, alt: "BreatheOS" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "BreatheOS",
    description: "Progressive breathing training for cardiovascular health",
    images: ["/og-image.svg"],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="apple-touch-icon" href="/icons/icon.svg" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="mobile-web-app-capable" content="yes" />
      </head>
      <body className={`${geistSans.variable} antialiased`}
        style={{ margin: 0, padding: 0, background: "#030b14", overscrollBehavior: "none" }}>
        {children}
        <Toaster />
        <Script id="sw" strategy="afterInteractive">{`
          if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('/sw.js').catch(() => {});
          }
        `}</Script>
      </body>
    </html>
  );
}
