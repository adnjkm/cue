import type { Box, PageInput } from "./types";

export const MAX_PAGES = 30;
const LONG_EDGE = 1400;
const MAX_PAGE_CHARS = 1_400_000;

export class UnreadableError extends Error {}

function canvasToJpeg(canvas: HTMLCanvasElement): string {
  let url = canvas.toDataURL("image/jpeg", 0.8);
  if (url.length > MAX_PAGE_CHARS) url = canvas.toDataURL("image/jpeg", 0.6);
  return url;
}

function drawScaled(source: CanvasImageSource, w: number, h: number): HTMLCanvasElement {
  const scale = Math.min(1, LONG_EDGE / Math.max(w, h));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

async function loadPdfjs() {
  const pdfjs = await import("pdfjs-dist");
  if (!pdfjs.GlobalWorkerOptions.workerPort) {
    pdfjs.GlobalWorkerOptions.workerPort = new Worker(new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url), {
      type: "module",
    });
  }
  return pdfjs;
}

type PageSource =
  | { kind: "pdf"; count: number; render: (i: number) => Promise<Omit<PageInput, "page">> }
  | { kind: "image"; render: () => Promise<Omit<PageInput, "page">> };

async function openFile(file: File): Promise<PageSource> {
  const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
  if (isPdf) {
    const pdfjs = await loadPdfjs();
    const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
    return {
      kind: "pdf",
      count: doc.numPages,
      async render(i) {
        const page = await doc.getPage(i);
        const base = page.getViewport({ scale: 1 });
        const viewport = page.getViewport({ scale: LONG_EDGE / Math.max(base.width, base.height) });
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(viewport.width);
        canvas.height = Math.round(viewport.height);
        const ctx = canvas.getContext("2d")!;
        await page.render({ canvas, canvasContext: ctx, viewport, background: "#ffffff" }).promise;
        const content = await page.getTextContent();
        const text = content.items.map((it) => ("str" in it ? it.str + (it.hasEOL ? "\n" : " ") : "")).join("");
        return { image: canvasToJpeg(canvas), text: text.replace(/[ \t]+\n/g, "\n").trim() };
      },
    };
  }
  if (/^image\/(png|jpe?g|webp)$/.test(file.type)) {
    return {
      kind: "image",
      async render() {
        const bitmap = await createImageBitmap(file);
        const canvas = drawScaled(bitmap, bitmap.width, bitmap.height);
        bitmap.close();
        return { image: canvasToJpeg(canvas), text: "" };
      },
    };
  }
  throw new UnreadableError(`${file.name} is not a PDF, PNG or JPG.`);
}

/** Renders every page of every file to a JPEG plus its text layer, in order, capped at MAX_PAGES. */
export async function renderPages(
  files: File[],
  onProgress: (page: number, total: number) => void,
  signal: AbortSignal,
): Promise<PageInput[]> {
  const sources = await Promise.all(files.map(openFile));
  const plan = sources.flatMap((s) =>
    s.kind === "pdf"
      ? Array.from({ length: s.count }, (_, i) => () => s.render(i + 1))
      : [() => s.render()],
  );
  const capped = plan.slice(0, MAX_PAGES);
  const pages: PageInput[] = [];
  for (const [i, render] of capped.entries()) {
    signal.throwIfAborted();
    onProgress(i + 1, capped.length);
    pages.push({ page: i + 1, ...(await render()) });
  }
  return pages;
}

/** Crops a normalized box out of a page image, with a little breathing room around it. */
export async function cropFigure(pageImage: string, box: Box): Promise<string> {
  const img = new Image();
  img.src = pageImage;
  await img.decode();
  const pad = 0.012;
  const x0 = Math.max(0, box[0] - pad) * img.naturalWidth;
  const y0 = Math.max(0, box[1] - pad) * img.naturalHeight;
  const x1 = Math.min(1, box[2] + pad) * img.naturalWidth;
  const y1 = Math.min(1, box[3] + pad) * img.naturalHeight;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(x1 - x0);
  canvas.height = Math.round(y1 - y0);
  canvas.getContext("2d")!.drawImage(img, x0, y0, x1 - x0, y1 - y0, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.85);
}
