/** A4 landscape PDF matching converter/pdf_writer.py (pdf-lib) */

import { OUTPUT_HEADERS, OUTPUT_HEADERS_EINNAHMEN } from "./transform.js";

const COLOR_TITLE = rgb(255, 192, 0); // Ausgaben (orange)
const COLOR_TITLE_EINNAHMEN = rgb(198, 224, 180); // Lindgrün
const COLOR_HEADER = rgb(217, 217, 217);
const COLOR_ZEBRA = rgb(242, 242, 242);
const COLOR_BORDER = rgb(176, 176, 176);
const COLOR_WHITE = rgb(255, 255, 255);
const COLOR_BLACK = rgb(0, 0, 0);

const MAX_LIEFERANT = 42;
const MM = 72 / 25.4;

function rgb(r, g, b) {
  // pdf-lib expects 0..1
  return { type: "RGB", red: r / 255, green: g / 255, blue: b / 255 };
}

function fmtEuro(v) {
  const n = Math.round(Number(v) * 100) / 100;
  const neg = n < 0;
  const abs = Math.abs(n);
  const fixed = abs.toFixed(2);
  const [intPart, dec] = fixed.split(".");
  const withDots = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${neg ? "-" : ""}${withDots},${dec} €`;
}

function fmtDate(d) {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}.${mm}.${yyyy}`;
}

function abbrev(text, maxLen = MAX_LIEFERANT) {
  const t = String(text || "").trim();
  if (t.length <= maxLen) return t;
  return t.slice(0, maxLen - 1) + "…";
}

function winAnsiSafe(s) {
  // Helvetica WinAnsi – keep €, umlauts, ellipsis; map exotic dashes
  return String(s)
    .replace(/—/g, "-")
    .replace(/–/g, "-")
    .replace(/[\u0100-\uFFFF]/g, (ch) => {
      if (ch === "…" || ch === "€") return ch;
      // common German already in Latin-1; leave BMP Latin-1 alone via earlier pass
      return "?";
    });
}

/**
 * @param {import('./transform.js').transformBuffer extends Function ? any : any} result
 * @returns {Promise<Uint8Array>}
 */
export async function buildPdfBytes(result) {
  const { PDFDocument, StandardFonts, rgb: pdfRgb } = PDFLib;
  // Use pdf-lib's rgb helper when available
  const toColor = (c) => pdfRgb(c.red, c.green, c.blue);

  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

  const pageW = 841.89; // A4 landscape
  const pageH = 595.28;
  const left = 12 * MM;
  const right = 12 * MM;
  const top = 10 * MM;
  const bottom = 14 * MM;
  const usableW = pageW - left - right;

  const colFracs = [0.22, 0.09, 0.1, 0.09, 0.14, 0.11, 0.07, 0.1, 0.08];
  const colWidths = colFracs.map((f) => usableW * f);

  const titleH = 18;
  const headerH = 16;
  const spacerH = 4;
  const rowH = 16;
  const headerBlockH = titleH + headerH + spacerH;

  const availH = pageH - top - bottom - headerBlockH - 2;
  const rowsPerPage = Math.max(8, Math.floor(availH / rowH) - 2);

  const allRows = result.rows;
  const chunks = [];
  for (let i = 0; i < allRows.length; i += rowsPerPage) {
    chunks.push(allRows.slice(i, i + rowsPerPage));
  }
  if (!chunks.length) chunks.push([]);
  const totalPages = chunks.length;

  const sumBrutto = allRows.reduce((a, r) => a + r.brutto, 0);
  const sumNetto = allRows.reduce((a, r) => a + r.netto, 0);
  const sumUst = allRows.reduce((a, r) => a + r.ust, 0);

  const isAusgang = result.kind === "ausgang";
  const accentColor = isAusgang ? COLOR_TITLE_EINNAHMEN : COLOR_TITLE;
  const colHeaders = isAusgang ? OUTPUT_HEADERS_EINNAHMEN : OUTPUT_HEADERS;

  function drawCentered(page, text, x, y, w, h, fnt, size, color = COLOR_BLACK) {
    const safe = winAnsiSafe(text);
    const tw = fnt.widthOfTextAtSize(safe, size);
    const tx = x + Math.max(0, (w - tw) / 2);
    const ty = y + (h - size) / 2 + 1;
    page.drawText(safe, { x: tx, y: ty, size, font: fnt, color: toColor(color) });
  }

  function drawLeft(page, text, x, y, w, h, fnt, size, color = COLOR_BLACK, pad = 3) {
    let safe = winAnsiSafe(text);
    const maxW = w - pad * 2;
    while (safe.length > 1 && fnt.widthOfTextAtSize(safe, size) > maxW) {
      safe = safe.slice(0, -1);
    }
    const ty = y + (h - size) / 2 + 1;
    page.drawText(safe, {
      x: x + pad,
      y: ty,
      size,
      font: fnt,
      color: toColor(color),
    });
  }

  function strokeRect(page, x, y, w, h) {
    page.drawRectangle({
      x,
      y,
      width: w,
      height: h,
      borderColor: toColor(COLOR_BORDER),
      borderWidth: 0.4,
      color: undefined,
    });
  }

  function fillRect(page, x, y, w, h, color) {
    page.drawRectangle({
      x,
      y,
      width: w,
      height: h,
      color: toColor(color),
      borderWidth: 0,
    });
  }

  function drawHeaderBlock(page, yTop) {
    // yTop is top of content area (from bottom origin: pageH - top)
    let y = yTop - titleH;
    // Title row
    fillRect(page, left, y, usableW, titleH, accentColor);
    strokeRect(page, left, y, usableW, titleH);
    drawCentered(page, result.title, left, y, usableW, titleH, fontBold, 12);

    y -= headerH;
    fillRect(page, left, y, usableW, headerH, COLOR_HEADER);
    let x = left;
    for (let i = 0; i < colHeaders.length; i++) {
      const w = colWidths[i];
      strokeRect(page, x, y, w, headerH);
      drawCentered(page, colHeaders[i], x, y, w, headerH, fontBold, 9);
      x += w;
    }

    y -= spacerH; // spacer (empty)
    return y;
  }

  function cellValues(row) {
    // Display euro with € then convert for WinAnsi in draw (EUR)
    return [
      { text: abbrev(row.lieferant), align: "left", bold: false },
      { text: row.kreditor, align: "center", bold: false },
      { text: row.rn, align: "center", bold: false },
      { text: fmtDate(row.datum), align: "center", bold: false },
      { text: abbrev(row.notiz, 28), align: "left", bold: false },
      { text: fmtEuro(row.brutto), align: "center", bold: false },
      { text: row.steuer, align: "center", bold: false },
      { text: fmtEuro(row.netto), align: "center", bold: false },
      { text: fmtEuro(row.ust), align: "center", bold: false },
    ];
  }

  for (let pageIdx = 0; pageIdx < chunks.length; pageIdx++) {
    const page = doc.addPage([pageW, pageH]);
    const isLast = pageIdx === chunks.length - 1;
    const chunk = chunks[pageIdx];

    let y = drawHeaderBlock(page, pageH - top);
    y -= 2; // small spacer like Python Spacer(1,2)

    // Data rows – draw from current y downward
    const dataTop = y;
    for (let i = 0; i < chunk.length; i++) {
      const rowY = dataTop - (i + 1) * rowH;
      if (i % 2 === 1) {
        fillRect(page, left, rowY, usableW, rowH, COLOR_ZEBRA);
      } else {
        fillRect(page, left, rowY, usableW, rowH, COLOR_WHITE);
      }
      let x = left;
      const cells = cellValues(chunk[i]);
      for (let c = 0; c < cells.length; c++) {
        const w = colWidths[c];
        strokeRect(page, x, rowY, w, rowH);
        const cell = cells[c];
        if (cell.align === "left") {
          drawLeft(page, cell.text, x, rowY, w, rowH, font, 8);
        } else {
          drawCentered(page, cell.text, x, rowY, w, rowH, font, 8);
        }
        x += w;
      }
    }

    if (isLast && chunk.length) {
      const spacerIdxY = dataTop - chunk.length * rowH - 6;
      const sumY = spacerIdxY - rowH;

      const sums = [
        null,
        null,
        null,
        null,
        null,
        fmtEuro(sumBrutto),
        null,
        fmtEuro(sumNetto),
        fmtEuro(sumUst),
      ];
      let x = left;
      for (let c = 0; c < sums.length; c++) {
        const w = colWidths[c];
        if (sums[c] != null) {
          fillRect(page, x, sumY, w, rowH, accentColor);
          strokeRect(page, x, sumY, w, rowH);
          drawCentered(page, sums[c], x, sumY, w, rowH, fontBold, 9);
        }
        x += w;
      }
    }

    // Footer
    page.drawText(winAnsiSafe(`Seite ${pageIdx + 1}/${totalPages}`), {
      x: left,
      y: 8 * MM,
      size: 8,
      font,
      color: toColor(COLOR_BLACK),
    });
  }

  const bytes = await doc.save();
  return bytes;
}
