import { useEffect } from "react";

/** Names the tab and the page a screen reader announces after a client navigation, once the screen knows its own title. */
export function useDocumentTitle(title: string | undefined) {
  useEffect(() => {
    if (title) document.title = `${title} · Cue`;
  }, [title]);
}
