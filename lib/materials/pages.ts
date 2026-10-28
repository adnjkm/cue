import type { Box, PageImage, RenderedPage } from "@/lib/domain";

export const MAX_PAGES = 60;
const DEFAULT_WIDTH = 1400;
const PAGE_GROUND = "oklch(100% 0 0)";

export class UnreadableError extends Error {}

function toBlob(canvas: HTMLCanvasElement, quality = 0.8): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new UnreadableError("Could not encode the page"))), "image/jpeg", quality));
}

function blank(w: number, h: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(w);
  canvas.height = Math.round(h);
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = PAGE_GROUND;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  return { canvas, ctx };
}

async function loadPdfjs() {
  const pdfjs = await import("pdfjs-dist");
  if (!pdfjs.GlobalWorkerOptions.workerPort) {
    pdfjs.GlobalWorkerOptions.workerPort = new Worker(new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url), { type: "module" });
  }
  return pdfjs;
}

export function isPdf(file: File): boolean {
  return file.type === "application/pdf" || /\.pdf$/i.test(file.name);
}

/**
 * Renders a PDF or image to JPEG Blobs plus each page's text layer. Pass `only` to re-render just the pages
 * a resumed ingest still needs. Long edge defaults to 1400 px, inside the 1240 to 1600 px Super VL reads best.
 */
export async function renderPages(file: File, opts?: { maxPages?: number; widthPx?: number; only?: readonly number[]; onPage?: (done: number, total: number) => void }): Promise<RenderedPage[]> {
  const longEdge = opts?.widthPx ?? DEFAULT_WIDTH;
  if (isPdf(file)) {
    const pdfjs = await loadPdfjs();
    const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
    const count = Math.min(doc.numPages, opts?.maxPages ?? MAX_PAGES);
    const wanted = Array.from({ length: count }, (_, i) => i + 1).filter((n) => !opts?.only || opts.only.includes(n));
    const out: RenderedPage[] = [];
    for (const [done, n] of wanted.entries()) {
      opts?.onPage?.(done + 1, wanted.length);
      const page = await doc.getPage(n);
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: longEdge / Math.max(base.width, base.height) });
      const { canvas, ctx } = blank(viewport.width, viewport.height);
      await page.render({ canvas, canvasContext: ctx, viewport, background: PAGE_GROUND }).promise;
      const content = await page.getTextContent();
      const text = content.items
        .map((it) => ("str" in it ? it.str + (it.hasEOL ? "\n" : " ") : ""))
        .join("")
        .replace(/[ \t]+\n/g, "\n")
        .trim();
      out.push({ index: n, image: await toBlob(canvas), width: canvas.width, height: canvas.height, text });
    }
    return out;
  }
  if (/^image\/(png|jpe?g|webp)$/.test(file.type)) {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, longEdge / Math.max(bitmap.width, bitmap.height));
    const { canvas, ctx } = blank(bitmap.width * scale, bitmap.height * scale);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    opts?.onPage?.(1, 1);
    return [{ index: 1, image: await toBlob(canvas), width: canvas.width, height: canvas.height, text: "" }];
  }
  throw new UnreadableError(`${file.name} is not a PDF, PNG or JPG.`);
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/** What a vision task receives: the data URL is built here, at call time only. */
export async function toPageImage(p: Pick<RenderedPage, "index" | "image" | "text">): Promise<PageImage> {
  return { page: p.index, image: await blobToDataUrl(p.image), text: p.text };
}

/** Crops a normalized box out of a page image, with a little breathing room around it. */
export async function cropFigure(pageImage: Blob, box: Box): Promise<Blob> {
  const bitmap = await createImageBitmap(pageImage);
  const pad = 0.005;
  const x0 = Math.max(0, box[0] - pad) * bitmap.width;
  const y0 = Math.max(0, box[1] - pad) * bitmap.height;
  const x1 = Math.min(1, box[2] + pad) * bitmap.width;
  const y1 = Math.min(1, box[3] + pad) * bitmap.height;
  const { canvas, ctx } = blank(x1 - x0, y1 - y0);
  ctx.drawImage(bitmap, x0, y0, x1 - x0, y1 - y0, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return toBlob(canvas, 0.85);
}

export async function sha256Hex(data: Blob | ArrayBuffer): Promise<string> {
  const buf = data instanceof Blob ? await data.arrayBuffer() : data;
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, "0")).join("");
}
