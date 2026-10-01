/** Rechnungen Konverter – UI, file drop, Sichern (iPad Share / Mac+Windows Download) */

import { transformBuffer } from "./transform.js";
import { buildPdfBytes } from "./pdf.js";

const $ = (sel) => document.querySelector(sel);

const dropZone = $("#drop-zone");
const fileInput = $("#file-input");
const idleView = $("#view-idle");
const progressView = $("#view-progress");
const successView = $("#view-success");
const errorView = $("#view-error");
const chipName = $("#chip-name");
const successTitle = $("#success-title");
const successFile = $("#success-file");
const successMeta = $("#success-meta");
const errorMsg = $("#error-msg");
const btnSave = $("#btn-save");
const btnNew = $("#btn-new");
const btnRetry = $("#btn-retry");
const toastEl = $("#toast");

/** @type {{ blob: Blob, url: string, filename: string } | null} */
let lastPdf = null;

function show(view) {
  for (const el of [idleView, progressView, successView, errorView]) {
    el.classList.add("hidden");
  }
  view.classList.remove("hidden");
}

function toast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.remove("hidden");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => toastEl.classList.add("hidden"), 3200);
}

function revokeLastUrl() {
  if (lastPdf?.url) {
    try {
      URL.revokeObjectURL(lastPdf.url);
    } catch {
      /* ignore */
    }
  }
}

function canSharePdfFile(file) {
  if (typeof navigator.share !== "function") return false;
  if (typeof navigator.canShare !== "function") return true;
  try {
    return navigator.canShare({ files: [file] });
  } catch {
    return false;
  }
}

/** Mac / Windows / Desktop → Download; iPad / iPhone → Share-Sheet */
function preferDownloadSave() {
  const ua = navigator.userAgent || "";
  const isIOS =
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const isMac = /Macintosh/.test(ua) && !isIOS;
  return isMac || (!isIOS && !/Android/i.test(ua));
}

function downloadBlob(blob, filename) {
  const a = document.createElement("a");
  const url = URL.createObjectURL(blob);
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

async function finishSaveBlob(blob, name) {
  const file = new File([blob], name, { type: "application/pdf" });

  if (preferDownloadSave()) {
    if (window.showSaveFilePicker) {
      try {
        const handle = await window.showSaveFilePicker({
          suggestedName: name,
          types: [{ description: "PDF", accept: { "application/pdf": [".pdf"] } }],
        });
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
        toast("PDF gespeichert");
        return;
      } catch (err) {
        if (err && err.name === "AbortError") {
          toast("Speichern abgebrochen");
          return;
        }
        console.warn("showSaveFilePicker failed", err);
      }
    }
    downloadBlob(blob, name);
    toast("Download gestartet");
    return;
  }

  if (canSharePdfFile(file)) {
    try {
      await navigator.share({ files: [file] });
      toast("Über Teilen-Menü gespeichert");
      return;
    } catch (err) {
      if (err && err.name === "AbortError") {
        toast("Speichern abgebrochen");
        return;
      }
      console.warn("navigator.share failed", err);
    }
  }

  downloadBlob(blob, name);
  toast("Download gestartet");
}

async function processFile(file) {
  if (!file) return;
  const lower = file.name.toLowerCase();
  if (!/\.(csv|txt|xlsx|xlsm)$/.test(lower)) {
    showError("Bitte eine CSV- oder XLSX-Datei wählen.");
    return;
  }

  show(progressView);
  chipName.textContent = file.name;

  try {
    const buf = await file.arrayBuffer();
    await new Promise((r) => setTimeout(r, 40));
    const result = transformBuffer(buf, file.name);
    const pdfBytes = await buildPdfBytes(result);
    const blob = new Blob([pdfBytes], { type: "application/pdf" });

    revokeLastUrl();
    const url = URL.createObjectURL(blob);
    lastPdf = { blob, url, filename: result.pdfFilename };

    const label = result.kind === "ausgang" ? "Rechnungsausgang" : "Rechnungseingang";
    successTitle.textContent = `Fertig: ${label} ${result.monthName} ${result.year}`;
    successFile.textContent = result.pdfFilename;
    successMeta.textContent = `${result.rows.length} Zeilen · ${result.title}`;
    show(successView);
  } catch (err) {
    console.error(err);
    showError(err?.message || String(err));
  }
}

function showError(msg) {
  errorMsg.textContent = msg;
  show(errorView);
}

function onFiles(fileList) {
  const file = fileList && fileList[0];
  if (file) processFile(file);
}

dropZone.addEventListener("click", () => fileInput.click());
dropZone.addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    fileInput.click();
  }
});

["dragenter", "dragover"].forEach((ev) => {
  dropZone.addEventListener(ev, (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropZone.classList.add("dragover", "is-over");
  });
});
["dragleave", "drop"].forEach((ev) => {
  dropZone.addEventListener(ev, (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropZone.classList.remove("dragover", "is-over");
  });
});
dropZone.addEventListener("drop", (e) => {
  onFiles(e.dataTransfer?.files);
});

fileInput.addEventListener("change", () => {
  onFiles(fileInput.files);
  fileInput.value = "";
});

$("#btn-pick").addEventListener("click", (e) => {
  e.stopPropagation();
  fileInput.click();
});

const btnPick = $("#btn-pick");
["dragenter", "dragover"].forEach((ev) => {
  btnPick.addEventListener(ev, (e) => {
    e.preventDefault();
    e.stopPropagation();
    btnPick.classList.add("is-over");
  });
});
["dragleave", "drop"].forEach((ev) => {
  btnPick.addEventListener(ev, (e) => {
    e.preventDefault();
    e.stopPropagation();
    btnPick.classList.remove("is-over");
  });
});
btnPick.addEventListener("drop", (e) => {
  onFiles(e.dataTransfer?.files);
});

btnSave.addEventListener("click", async () => {
  if (!lastPdf) return;
  await finishSaveBlob(lastPdf.blob, lastPdf.filename);
});

btnNew.addEventListener("click", () => {
  show(idleView);
});
btnRetry.addEventListener("click", () => {
  show(idleView);
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch((err) => {
      console.warn("SW register failed", err);
    });
  });
}
