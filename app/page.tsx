"use client";

import dynamic from "next/dynamic";

// Client only: the app reads localStorage on first render and renders PDFs with canvas.
const App = dynamic(() => import("@/components/App"), { ssr: false });

export default function Page() {
  return <App />;
}
