import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { SourcePeek } from "@/components/cue/source";
import { Boot } from "@/components/cue/shell";
import { Toaster } from "@/components/ui/toast";
import { TooltipProvider } from "@/components/ui/tooltip";
import { DEMO_CLOCK_SCRIPT } from "@/lib/demo-clock";
import "./globals.css";

const timeless = localFont({
  src: [
    // Paper sets body text at weight 420. The range keeps 420 on the Regular file; CSS matching would otherwise pick Medium.
    { path: "./fonts/TimelessSans-Regular.ttf", weight: "400 499", style: "normal" },
    { path: "./fonts/TimelessSans-Medium.ttf", weight: "500", style: "normal" },
  ],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Cue",
  description: "Plan your term, take lecture notes, study and practice with NVIDIA Nemotron.",
};

export const viewport: Viewport = { themeColor: "oklch(100% 0 0)", colorScheme: "light" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${timeless.variable} max-md:scroll-pt-16 max-md:scroll-pb-20`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: DEMO_CLOCK_SCRIPT }} />
      </head>
      <body className="relative">
        <div className="isolate">
          <TooltipProvider>{children}</TooltipProvider>
        </div>
        <SourcePeek />
        <Toaster />
        <Boot />
      </body>
    </html>
  );
}
