import "server-only";
import { z } from "zod";
import { defineTasks, jsonTask } from "@/lib/ai/define";
import type { PageImage } from "@/lib/domain";

const pageImage = z.object({
  page: z.number().int().min(1),
  image: z.string().regex(/^data:image\/(jpeg|png|webp);base64,/),
  text: z.string().max(20_000),
});

const slide = z.object({
  heading: z.string(),
  body: z.string(),
  code: z.object({ lang: z.string(), text: z.string() }).nullish(),
});

const SYSTEM = `You read pages of course material (slides, textbook pages, handouts) whose text layer is missing or thin.
For each page return its full text in reading order. For a slide, also return its heading, body and any code block with its language, preserving indentation.
For a textbook page, return the section number it belongs to (like "§5.2") and the printed page label (like "p. 92") when visible.
Write math in Unicode, not LaTeX.`;

export const materialTasks = defineTasks("material", {
  read: jsonTask({
    profile: "vision",
    maxTokens: 12_000,
    input: z.object({ pages: z.array(pageImage).min(1).max(3) }),
    output: z.object({
      pages: z.array(
        z.object({
          page: z.number().int(),
          text: z.string(),
          slide: slide.nullish().transform((v) => v ?? undefined),
          section: z.string().nullish().transform((v) => v ?? undefined),
          label: z.string().nullish().transform((v) => v ?? undefined),
        }),
      ),
    }),
    prompt: ({ pages }) => ({
      system: SYSTEM,
      user: pages.flatMap((p: PageImage) => [
        { type: "text" as const, text: `Page ${p.page}\nText layer:\n${p.text.trim() || "(none)"}` },
        { type: "image" as const, dataUrl: p.image },
      ]),
    }),
    example: {
      pages: [{ page: 1, image: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", text: "Lecture 8: Trees" }],
    },
    mock: ({ pages }) => ({ pages: pages.map((p) => ({ page: p.page, text: p.text.trim() || `Page ${p.page}` })) }),
  }),
});
