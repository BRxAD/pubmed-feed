import type { Metadata } from "next";
import Script from "next/script";
import { Geist, Geist_Mono, Newsreader, Libre_Franklin } from "next/font/google";
import "./globals.css";

const GA_MEASUREMENT_ID = "G-R3CGC4MY67";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const newsreader = Newsreader({
  subsets: ["latin"],
  variable: "--font-brief-serif",
  display: "swap",
});

const libreFranklin = Libre_Franklin({
  subsets: ["latin"],
  variable: "--font-brief-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "The Stewardship Brief",
  description:
    "Daily briefing of high-priority antimicrobial stewardship research.",
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${newsreader.variable} ${libreFranklin.variable} antialiased`}
        suppressHydrationWarning
      >
        {children}
        <Script
          src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
          strategy="afterInteractive"
        />
        <Script id="google-analytics" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', '${GA_MEASUREMENT_ID}');
          `}
        </Script>
      </body>
    </html>
  );
}
