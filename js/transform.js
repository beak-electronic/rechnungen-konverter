/** Port of converter/transform.py – Kreditoren CSV/XLSX → normalized rows */

export const GERMAN_MONTHS = {
  1: "Januar",
  2: "Februar",
  3: "März",
  4: "April",
  5: "Mai",
  6: "Juni",
  7: "Juli",
  8: "August",
  9: "September",
  10: "Oktober",
  11: "November",
  12: "Dezember",
};

export const COLUMN_MAP = [
  ["Name des Lieferanten", "Lieferant"],
  ["Kreditorennummer", "Kreditor"],
  ["Rechnungsnummer", "RN"],
  ["Datum der Rechnung", "Datum"],
  ["Notiz", "Notiz"],
  ["Gesamtbetrag brutto", "Brutto"],
  ["Steuersatz", "Steuer"],
  ["Nettobetrag", "Netto"],
];

export const OUTPUT_HEADERS = COLUMN_MAP.map(([, dst]) => dst).concat(["UST"]);

/** Rechnungsexport / Debitoren → Rechnungsausgang PDF */
export const EINNAHMEN_COLUMN_MAP = [
  ["Name des Kunden", "Kunde"],
  ["Debitorennummer", "Debitor"],
  ["Rechnungsnummer", "RN"],
  ["Datum der Rechnung", "Datum"],
  ["Notiz", "Notiz"],
  ["Gesamtbetrag brutto", "Brutto"],
  ["Steuersatz", "Steuer"],
  ["Nettobetrag", "Netto"],
];

export const OUTPUT_HEADERS_EINNAHMEN = EINNAHMEN_COLUMN_MAP.map(([, dst]) => dst).concat(["UST"]);

/** Second header cell (column B / index 1) decides the path. */
export function detectKind(filename = "", headers = []) {
  const second = normHeader(headers[1] || "").toLowerCase();
  if (second === "kundennummer") return "ausgang";
  if (second === "kreditorennummer") return "eingang";
  throw new Error(
    "Unbekannter Export: In der zweiten Spalte der Kopfzeile muss „Kreditorennummer“ (Rechnungseingang) oder „Kundennummer“ (Rechnungsausgang) stehen.\nGefunden: " +
      (headers[1] != null && String(headers[1]).trim() !== "" ? headers[1] : "(leer)") +
      "\nGefundene Spalten: " +
      headers.join(", ")
  );
}

function normHeader(h) {
  return String(h || "")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseGermanNumber(value) {
  if (value == null || value === "") return 0;
  if (typeof value === "number") return Math.round(value * 100) / 100;
  let s = String(value).trim();
  if (!s) return 0;
  s = s.replace(/€/g, "").replace(/EUR/gi, "").replace(/\s/g, "").trim();
  if (s.includes(",") && s.includes(".")) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (s.includes(",")) {
    s = s.replace(",", ".");
  }
  const n = Number(s);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

export function parseDate(value) {
  if (value == null || value === "") return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    // Excel serial (days since 1899-12-30)
    const epoch = Date.UTC(1899, 11, 30);
    const ms = epoch + Math.round(value) * 86400000;
    const d = new Date(ms);
    return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  }
  const s = String(value).trim();
  if (!s) return null;
  if (/^\d+(\.\d+)?$/.test(s)) {
    const num = Number(s);
    if (num > 20000 && num < 80000) {
      const epoch = Date.UTC(1899, 11, 30);
      const ms = epoch + Math.round(num) * 86400000;
      const d = new Date(ms);
      return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
    }
  }
  const formats = [
    /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/,
    /^(\d{1,2})\.(\d{1,2})\.(\d{2})$/,
    /^(\d{4})-(\d{1,2})-(\d{1,2})$/,
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/,
    /^(\d{1,2})-(\d{1,2})-(\d{4})$/,
  ];
  for (const re of formats) {
    const m = s.match(re);
    if (!m) continue;
    let d, mo, y;
    if (re.source.startsWith("^(\\d{4})")) {
      y = Number(m[1]);
      mo = Number(m[2]);
      d = Number(m[3]);
    } else {
      d = Number(m[1]);
      mo = Number(m[2]);
      y = Number(m[3]);
      if (y < 100) y += 2000;
    }
    const dt = new Date(y, mo - 1, d);
    if (dt.getFullYear() === y && dt.getMonth() === mo - 1 && dt.getDate() === d) {
      return dt;
    }
  }
  return null;
}

function findSourceKey(headers, wanted) {
  const wantedN = normHeader(wanted).toLowerCase();
  for (const h of headers) {
    if (normHeader(h).toLowerCase() === wantedN) return h;
  }
  for (const h of headers) {
    const hn = normHeader(h).toLowerCase();
    if (wantedN.includes(hn) || hn.includes(wantedN)) return h;
  }
  return null;
}

function decodeCsvBytes(buf) {
  const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  // Prefer windows-1252 (typical Kreditoren export), then utf-8 / latin-1
  const encodings = ["windows-1252", "utf-8", "iso-8859-1"];
  // If UTF-8 BOM, force utf-8
  if (u8.length >= 3 && u8[0] === 0xef && u8[1] === 0xbb && u8[2] === 0xbf) {
    return { text: new TextDecoder("utf-8").decode(u8), encoding: "utf-8" };
  }
  // Heuristic: if valid UTF-8 without replacements and contains non-ASCII, prefer UTF-8
  try {
    const utf = new TextDecoder("utf-8", { fatal: true }).decode(u8);
    const hasHigh = [...utf].some((c) => c.charCodeAt(0) > 127);
    const as1252 = new TextDecoder("windows-1252").decode(u8);
    // If utf-8 fatal succeeds AND looks like real UTF-8 (e.g. ü as C3 BC), use it
    if (hasHigh) {
      // Count C3/C2 lead bytes in raw → typical UTF-8 umlauts
      let utfLeads = 0;
      for (let i = 0; i < u8.length - 1; i++) {
        if (u8[i] === 0xc3 || u8[i] === 0xc2) utfLeads++;
      }
      if (utfLeads > 0) return { text: utf, encoding: "utf-8" };
    } else {
      return { text: utf, encoding: "utf-8" };
    }
  } catch {
    /* fall through to windows-1252 */
  }
  for (const enc of encodings) {
    try {
      const text = new TextDecoder(enc).decode(u8);
      return { text, encoding: enc };
    } catch {
      continue;
    }
  }
  return { text: new TextDecoder("windows-1252").decode(u8), encoding: "windows-1252" };
}

function parseCsvText(text) {
  const sample = text.slice(0, 4096);
  const delim = (sample.split(";").length >= sample.split(",").length) ? ";" : ",";
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  // Simple CSV parse (semicolon/comma, quoted fields)
  function splitLine(line) {
    const out = [];
    let cur = "";
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (inQ) {
        if (c === '"') {
          if (line[i + 1] === '"') {
            cur += '"';
            i++;
          } else {
            inQ = false;
          }
        } else {
          cur += c;
        }
      } else if (c === '"') {
        inQ = true;
      } else if (c === delim) {
        out.push(cur);
        cur = "";
      } else {
        cur += c;
      }
    }
    out.push(cur);
    return out;
  }

  let headerIdx = 0;
  while (headerIdx < lines.length && !lines[headerIdx].trim()) headerIdx++;
  if (headerIdx >= lines.length) throw new Error("CSV ohne Spaltenköpfe");
  const headerCells = splitLine(lines[headerIdx]).map(normHeader);
  const rows = [];
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    const cells = splitLine(line);
    const obj = {};
    let any = false;
    for (let j = 0; j < headerCells.length; j++) {
      const h = headerCells[j];
      if (!h) continue;
      const v = cells[j] != null ? cells[j] : "";
      obj[h] = v;
      if (String(v).trim()) any = true;
    }
    if (any) rows.push(obj);
  }
  return { headers: headerCells.filter(Boolean), rows };
}

function parseXlsxArrayBuffer(buf) {
  if (typeof XLSX === "undefined") {
    throw new Error("SheetJS (XLSX) nicht geladen");
  }
  const wb = XLSX.read(buf, { type: "array", cellDates: true, raw: false });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) throw new Error("Leere Excel-Datei");
  const ws = wb.Sheets[sheetName];
  const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "", raw: true });
  if (!aoa.length) throw new Error("Leere Excel-Datei");
  const headers = aoa[0].map((h) => normHeader(h == null ? "" : String(h)));
  const rows = [];
  for (let i = 1; i < aoa.length; i++) {
    const values = aoa[i] || [];
    if (!values.some((v) => v != null && String(v).trim() !== "")) continue;
    const d = {};
    for (let j = 0; j < headers.length; j++) {
      if (!headers[j]) continue;
      d[headers[j]] = values[j] != null ? values[j] : "";
    }
    rows.push(d);
  }
  return { headers: headers.filter(Boolean), rows };
}

function formatSteuer(sv) {
  if (sv == null || sv === "") return "";
  if (typeof sv === "number") {
    if (sv <= 1) return `${Math.round(sv * 100)}%`;
    return `${Math.round(sv)}%`;
  }
  let steuerVal = String(sv).trim();
  if (steuerVal && !steuerVal.endsWith("%")) {
    const n = parseGermanNumber(steuerVal);
    if (n <= 1) steuerVal = `${Math.round(n * 100)}%`;
    else steuerVal = `${Math.round(n)}%`;
  }
  return steuerVal;
}

function invoiceNumberSortValue(value) {
  // RNs commonly contain prefixes/separators (e.g. "RE-2024-0815").
  // Compare the digits numerically; empty/non-numeric RNs sort last.
  const digits = String(value ?? "").match(/\d+/g)?.join("") || "";
  if (!digits) return Number.POSITIVE_INFINITY;
  const number = Number(digits);
  return Number.isFinite(number) ? number : Number.POSITIVE_INFINITY;
}
/**
 * @param {ArrayBuffer|Uint8Array} buf
 * @param {string} filename
 */
export function transformBuffer(buf, filename = "input.csv") {
  const name = String(filename || "").toLowerCase();
  let headers;
  let rawRows;
  if (name.endsWith(".xlsx") || name.endsWith(".xlsm")) {
    ({ headers, rows: rawRows } = parseXlsxArrayBuffer(buf));
  } else if (name.endsWith(".csv") || name.endsWith(".txt") || !name.includes(".")) {
    const { text } = decodeCsvBytes(buf);
    ({ headers, rows: rawRows } = parseCsvText(text));
  } else {
    try {
      const { text } = decodeCsvBytes(buf);
      ({ headers, rows: rawRows } = parseCsvText(text));
    } catch {
      ({ headers, rows: rawRows } = parseXlsxArrayBuffer(buf));
    }
  }

  const kind = detectKind(filename, headers);
  const columnMap = kind === "ausgang" ? EINNAHMEN_COLUMN_MAP : COLUMN_MAP;
  const required = kind === "ausgang"
    ? ["Kunde", "Datum", "Brutto", "Netto"]
    : ["Lieferant", "Datum", "Brutto", "Netto"];

  const keyMap = {};
  for (const [src, dst] of columnMap) {
    keyMap[dst] = findSourceKey(headers, src);
  }

  const missing = columnMap
    .filter(([, dst]) => keyMap[dst] == null && required.includes(dst))
    .map(([src]) => src);
  if (missing.length) {
    throw new Error(
      "Pflichtspalten fehlen: " +
        missing.join(", ") +
        "\nGefundene Spalten: " +
        headers.join(", ")
    );
  }

  const rows = [];
  for (const raw of rawRows) {
    if (!Object.values(raw).some((v) => v != null && String(v).trim() !== "")) continue;

    const partyKey = kind === "ausgang" ? keyMap.Kunde : keyMap.Lieferant;
    const party = partyKey ? String(raw[partyKey] ?? "").trim() : "";
    const datumKey = keyMap.Datum;
    const d = datumKey ? parseDate(raw[datumKey]) : null;
    if (!party && !d) continue;

    const brutto = parseGermanNumber(keyMap.Brutto ? raw[keyMap.Brutto] : 0);
    const netto = parseGermanNumber(keyMap.Netto ? raw[keyMap.Netto] : 0);
    const ust = Math.round((brutto - netto) * 100) / 100;
    const steuer = keyMap.Steuer ? formatSteuer(raw[keyMap.Steuer]) : "";
    if (!d) continue;

    const base = {
      lieferant: party || "—", // PDF cell 1 (Kunde / Lieferant)
      rn: keyMap.RN ? String(raw[keyMap.RN] ?? "").trim() : "",
      datum: d,
      notiz: keyMap.Notiz ? String(raw[keyMap.Notiz] ?? "").trim() : "",
      brutto,
      steuer,
      netto,
      ust,
      kreditor: "",
    };
    if (kind === "ausgang") {
      base.kreditor = keyMap.Debitor ? String(raw[keyMap.Debitor] ?? "").trim() : "";
    } else {
      base.kreditor = keyMap.Kreditor ? String(raw[keyMap.Kreditor] ?? "").trim() : "";
    }
    rows.push(base);
  }

  if (!rows.length) throw new Error("Keine gültigen Datenzeilen gefunden.");

  const counts = new Map();
  for (const r of rows) {
    const key = `${r.datum.getFullYear()}-${r.datum.getMonth() + 1}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  let best = null;
  let bestN = -1;
  for (const [key, n] of counts) {
    if (n > bestN) {
      bestN = n;
      best = key;
    }
  }
  const [yearStr, monthStr] = best.split("-");
  const year = Number(yearStr);
  const monthNum = Number(monthStr);
  const monthName = GERMAN_MONTHS[monthNum];
  const monthPad = String(monthNum).padStart(2, "0");
  const title =
    kind === "ausgang"
      ? `${year} ${monthName} - Rechnungsausgang`
      : `${year} ${monthName} - Ausgaben`;

  rows.sort((a, b) => {
    const rnA = invoiceNumberSortValue(a.rn);
    const rnB = invoiceNumberSortValue(b.rn);
    if (rnA !== rnB) return rnA < rnB ? -1 : 1;
    const ta = a.datum.getTime() - b.datum.getTime();
    if (ta !== 0) return ta;
    const ls = a.lieferant.localeCompare(b.lieferant, "de");
    if (ls !== 0) return ls;
    return a.rn.localeCompare(b.rn, "de");
  });

  return {
    kind,
    year,
    monthName,
    monthNum,
    rows,
    title,
    pdfFilename:
      kind === "ausgang"
        ? `Rechnungsausgang ${year} ${monthPad}.pdf`
        : `Rechnungseingang ${year} ${monthPad}.pdf`,
  };
}
