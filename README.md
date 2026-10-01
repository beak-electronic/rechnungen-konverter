# Rechnungen Konverter (PWA)

Offline-fähige PWA: **Kreditoren- / Rechnungseingang-CSV** (Semikolon, oft Windows-1252) oder **XLSX** in **ein PDF** umwandeln:

`Rechnungseingang {Monat} {Jahr}.pdf`

**Live:** https://beak-electronic.github.io/rechnungen-konverter/

**Version:** 1.5

## Ablauf

1. App öffnen (HTTPS oder `localhost`)
2. CSV/XLSX in die Drop-Zone ziehen oder **Datei wählen…**
3. Fortschritt „Umwandlung läuft…“
4. PDF öffnet sich in neuem Tab; bei Popup-Blocker **PDF öffnen** tippen
5. Bei Bedarf **Download** / **Teilen** (iOS)

## Lokal starten

```bash
cd rechnungen-konverter
python3 -m http.server 8080
```

Dann http://localhost:8080

> Hinweis: Manche Browser blockieren ES-Module / Service Worker bei `file://`. Ein lokaler Server oder GitHub Pages ist zuverlässiger.

## Beispiel

`samples/Kreditoren_August_2024.csv` → `Rechnungseingang August 2024.pdf`

## Windows Chrome

Nach dem Deploy unter HTTPS: Adressleiste → Install-Symbol → App installieren.
Manifest: `display: "standalone"`, Icons 192/512 (`any` abgerundet, `maskable` vollflächig).

## iPhone / iPad – Zum Home-Bildschirm

1. Site in **Safari** öffnen (https).
2. Teilen-Taste → **Zum Home-Bildschirm** → Hinzufügen.
3. App „Rechnungen Konverter“ starten (Standalone-PWA, offline nach erstem Laden).

## Technik

- Statische PWA: `index.html`, `css/`, `js/`, `icons/`, `manifest.webmanifest`, `sw.js`
- Vendor lokal: `pdf-lib`, SheetJS (`xlsx`) unter `vendor/` (kein CDN zur Laufzeit nötig)
- Optional Netlify: `netlify.toml`, `_headers` (Drop alternativ zu Pages)

## Deploy

Primär: **GitHub Pages** (`main` / `/` → https://beak-electronic.github.io/rechnungen-konverter/).
Siehe auch `DEPLOY.txt`. Kein Build-Schritt.

## Hinweis

Echte Rechnungsdaten und persönliche Firmendaten gehören nicht ins Repository.

## PWA-Identität (GitHub Pages)

Diese App läuft unter `/rechnungen-konverter/` und hat eine eigene Manifest-`id` (`/rechnungen-konverter/`), damit Chrome sie nicht mit anderen BEAK-Apps auf derselben Domain vermischt.
