import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import PwaRegister from "@/components/PwaRegister";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap"
});

export const viewport: Viewport = {
  themeColor: "#ffffff",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover"
};

export const metadata: Metadata = {
  title: "Edirne Sosyal Yardımlaşma ve Dayanışma Vakfı Başkanlığı - Kömür Dağıtım ve Sorgulama Sistemi",
  description: "T.C. Edirne Valiliği - Edirne Sosyal Yardımlaşma ve Dayanışma Vakfı Başkanlığı Kömür Dağıtım, Sorgulama ve Saha Takip Sistemi",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Edirne SYDV Kömür Takip"
  },
  icons: {
    icon: "/edirne-sydv-logo.png",
    apple: "/icons/icon-192x192.png"
  }
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="tr" className={inter.variable}>
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="format-detection" content="telephone=no" />
      </head>
      <body className="antialiased">
        <PwaRegister />
        {children}
      </body>
    </html>
  );
}
