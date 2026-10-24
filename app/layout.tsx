import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";

const timeless = localFont({
  src: [
    { path: "./fonts/TimelessSans-Regular.ttf", weight: "400", style: "normal" },
    { path: "./fonts/TimelessSans-Medium.ttf", weight: "500", style: "normal" },
  ],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Cue Practice",
  description: "Drop in a past exam. NVIDIA Nemotron turns it into practice questions.",
};

export const viewport: Viewport = { themeColor: "#FFFFFF", colorScheme: "light" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={timeless.variable}>
      <body>{children}</body>
    </html>
  );
}
