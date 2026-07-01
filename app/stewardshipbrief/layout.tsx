import { Newsreader, Libre_Franklin } from "next/font/google";

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

export default function StewardshipBriefLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className={`${newsreader.variable} ${libreFranklin.variable}`}>
      {children}
    </div>
  );
}
