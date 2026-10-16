import type { Metadata } from "next";
import Script from "next/script";
import { Geist, Geist_Mono, Newsreader, Libre_Franklin } from "next/font/google";
import { Providers } from "@/components/Providers";
import {
  BRIEF_SHARE_DESCRIPTION,
  BRIEF_SHARE_TITLE,
  BRIEF_SITE_URL,
} from "@/lib/brief/shareAttribution";
import "./globals.css";

const GA_MEASUREMENT_ID = "G-R3CGC4MY67";
const UMAMI_WEBSITE_ID = "240653cf-dc5e-47b0-a798-e8fbc5d1e73e";

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
  metadataBase: new URL(BRIEF_SITE_URL),
  title: BRIEF_SHARE_TITLE,
  description: BRIEF_SHARE_DESCRIPTION,
  openGraph: {
    title: BRIEF_SHARE_TITLE,
    description: BRIEF_SHARE_DESCRIPTION,
    url: BRIEF_SITE_URL,
    siteName: BRIEF_SHARE_TITLE,
    type: "website",
    images: [
      { url: "/stewardship-brief-logo.png", alt: BRIEF_SHARE_TITLE },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: BRIEF_SHARE_TITLE,
    description: BRIEF_SHARE_DESCRIPTION,
    images: ["/stewardship-brief-logo.png"],
  },
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
        <Providers>{children}</Providers>
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
        <Script
          src="https://cloud.umami.is/script.js"
          data-website-id={UMAMI_WEBSITE_ID}
          strategy="afterInteractive"
        />
      </body>
    </html>
  );
}
