#!/usr/bin/env node
/** Headless self-check: parse sample CSV + build PDF bytes starting with %PDF */
import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = __dirname;

function mustExist(rel) {
  const p = path.join(root, rel);
  if (!fs.existsSync(p)) throw new Error("Missing: " + rel);
  return p;
}

const required = [
  "index.html",
  "css/app.css",
  "js/app.js",
  "js/transform.js",
  "js/pdf.js",
  "manifest.webmanifest",
  "sw.js",
  "netlify.toml",
  "_headers",
  "README_DE.md",
  "DEPLOY.txt",
  "vendor/pdf-lib.min.js",
  "vendor/xlsx.full.min.js",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/apple-touch-icon.png",
  "icons/drop-cloud-icon.png",
  "samples/Kreditoren_August_2024.csv",
];

console.log("== File presence ==");
for (const r of required) {
  mustExist(r);
  console.log(" OK", r);
}

// Load pdf-lib UMD into globalThis
const code = fs.readFileSync(path.join(root, "vendor/pdf-lib.min.js"), "utf8");
const sandbox = { exports: {}, module: { exports: {} } };
const load = new Function(
  "exports",
  "module",
  "self",
  "window",
  "globalThis",
  code +
    "\n;return typeof PDFLib !== 'undefined' ? PDFLib : (module.exports.PDFDocument ? module.exports : exports);"
);
globalThis.PDFLib = load(sandbox.exports, sandbox.module, globalThis, globalThis, globalThis);
if (!globalThis.PDFLib?.PDFDocument) throw new Error("PDFLib failed to load");

const { transformBuffer } = await import(pathToFileURL(path.join(root, "js/transform.js")).href);
const { buildPdfBytes } = await import(pathToFileURL(path.join(root, "js/pdf.js")).href);

const csvPath = path.join(root, "samples/Kreditoren_August_2024.csv");
const buf = fs.readFileSync(csvPath);
const result = transformBuffer(buf, "Kreditoren_August_2024.csv");
console.log("== Transform ==");
console.log(" title:", result.title);
console.log(" rows:", result.rows.length);
console.log(" pdf:", result.pdfFilename);
if (result.monthName !== "August" || result.year !== 2024) {
  throw new Error(`Unexpected period ${result.monthName} ${result.year}`);
}
if (result.kind !== "eingang") throw new Error("Expected kind eingang");
if (result.pdfFilename !== "Rechnungseingang 2024 08.pdf") {
  throw new Error("Unexpected pdf name: " + result.pdfFilename);
}
if (result.rows.length < 6) throw new Error("Expected >= 6 sample rows");

const pdfBytes = await buildPdfBytes(result);
const outPath = path.join(root, "samples/_selfcheck_out.pdf");
fs.writeFileSync(outPath, pdfBytes);
const head = Buffer.from(pdfBytes.slice(0, 5)).toString("ascii");
console.log("== PDF ==");
console.log(" bytes:", pdfBytes.length);
console.log(" magic:", head);
console.log(" wrote:", outPath);
if (head !== "%PDF-") throw new Error("PDF magic mismatch: " + head);

console.log("\nSELF_CHECK_OK");
