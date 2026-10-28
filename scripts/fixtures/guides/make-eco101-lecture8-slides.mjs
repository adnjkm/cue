#!/usr/bin/env node
// Writes eco101-lecture8-slides.pdf: three landscape slides with a real text layer, so ingest reads them without vision.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SLIDES = [
  ["Lecture 8: Elasticity and total revenue", "ECO101 · Prof. Okafor", "Today we connect elasticity to what sellers earn when they change the price.", "A price rise pays only when buyers keep buying.", "Bring Problem Set 4: question 2 asks about a straight demand line."],
  ["Total revenue", "Total revenue is price times quantity sold.", "When demand is inelastic, a price rise increases total revenue, because quantity barely falls.", "When demand is elastic, a price rise reduces total revenue, because quantity falls a lot."],
  ["Unit elastic demand", "When elasticity is exactly 1, a small price change leaves total revenue unchanged.", "Along a straight demand line, revenue is highest at the midpoint, where demand is unit elastic.", "Above the midpoint demand is elastic; below it, inelastic."],
];

const esc = (s) => s.replace(/[\\()]/g, (c) => `\\${c}`).replace(/·/g, "\\267");
const objects = [];
const add = (body) => objects.push(body) - 1 + 1;

const font = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
const pagesId = objects.length + 1 + SLIDES.length * 2;
const kids = [];
for (const [title, ...lines] of SLIDES) {
  const text = [`BT /F1 32 Tf 56 480 Td (${esc(title)}) Tj ET`, ...lines.map((l, i) => `BT /F1 18 Tf 56 ${410 - i * 36} Td (${esc(l)}) Tj ET`)].join("\n");
  const content = add(`<< /Length ${Buffer.byteLength(text, "latin1")} >>\nstream\n${text}\nendstream`);
  kids.push(add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 960 540] /Resources << /Font << /F1 ${font} 0 R >> >> /Contents ${content} 0 R >>`));
}
add(`<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(" ")}] /Count ${kids.length} >>`);
const catalog = add(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`);

let pdf = "%PDF-1.4\n";
const offsets = [];
objects.forEach((body, i) => {
  offsets.push(Buffer.byteLength(pdf, "latin1"));
  pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
});
const xref = Buffer.byteLength(pdf, "latin1");
pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;

const out = path.join(path.dirname(fileURLToPath(import.meta.url)), "eco101-lecture8-slides.pdf");
fs.writeFileSync(out, Buffer.from(pdf, "latin1"));
console.log(`wrote ${out} (${SLIDES.length} pages)`);
