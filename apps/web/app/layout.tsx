import type { Metadata } from "next";
import { Kalam, Urbanist } from "next/font/google";
import { AnimatedBackground } from "@/components/AnimatedBackground";
import "./globals.css";

const urbanist = Urbanist({ variable: "--font-urbanist", subsets: ["latin"] });
const kalam = Kalam({ variable: "--font-kalam", subsets: ["latin"], weight: ["400", "700"] });

export const metadata: Metadata = {
  metadataBase: new URL("https://getflowcam.com"),
  title: {
    default: "Flowcam: Draw it. Present it. Share it.",
    template: "%s · Flowcam",
  },
  description:
    "Flowcam is a studio for explainer creators and online teachers: build a hand-drawn diagram, present it step by step on camera, and share a polished video. Join the waitlist.",
  openGraph: { siteName: "Flowcam", type: "website" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${urbanist.variable} ${kalam.variable} antialiased`}>
      <body className="min-h-full">
        <AnimatedBackground />
        {children}
      </body>
    </html>
  );
}
