import type { Metadata } from "next";
import { Assistant } from "next/font/google";
import { cn } from "@/lib/utils";
import "./globals.css";

// Excaliflow's interface font (ADR 0001); Board text uses the renderer's own fonts.
const assistant = Assistant({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "Flowcam Studio",
};

// Follow the system's light or dark setting before first paint (PRODUCT.md §4).
const followSystemTheme = `if (matchMedia("(prefers-color-scheme: dark)").matches) document.documentElement.classList.add("dark")`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={cn("font-sans", assistant.variable)} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: followSystemTheme }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
