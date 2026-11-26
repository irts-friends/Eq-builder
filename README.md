# EQ Request Builder & Travelling Allowance Journal

Web-based utility for Indian Railways officers featuring three integrated tools:

1. **Create Request** — Extract booking details from IRCTC ticket PDFs or 139 SMS replies, generate Emergency Quota (EQ) WhatsApp messages, look up Sr. DCM CUG contacts, and inspect halting train routes via RailRadar.
2. **Verify Request** — Verify incoming EQ requests against the IRMS (Traffic) officer roster.
3. **Prepare TA Bill** — Prepare monthly Northern Railway Travelling Allowance (TA) Journals with persistent employee details (excluding Month), add/edit journey entries, import rows from existing TA bill PDFs, auto-sort entries chronologically, preview the formatted 2-page A4 sheet, and download as PDF.

## Repository Structure

- `index.html` — Page structure and UI layout for all three tabs
- `styles.css` — Light/dark theme tokens, form states, train route timeline styles, and A4 TA Journal preview styles
- `app.js` — Tab routing, ticket PDF & 139 SMS parser, EQ message builder, request verifier, and `directory-data.xlsx` reader
- `train-route.js` — RailRadar train route lookup (`haltsOnly=true`), show/hide toggle, and 7-day `localStorage` cache
- `ta-bill.js` — Monthly TA Bill builder, `localStorage` employee persistence (excluding Month), shared add/edit journey form, TA bill PDF row importer, chronological date sorting, live A4 preview, and PDF export
- `directory-data.xlsx` — Excel workbook containing `IRTS_Officers` and `Sr_DCM_Contacts`

## GitHub Pages Deployment

1. Upload `index.html`, `styles.css`, `app.js`, `train-route.js`, `ta-bill.js`, `directory-data.xlsx`, and `README.md` to the root of your GitHub repository.
2. Go to **Settings → Pages**, select your branch (`main`) and `/ (root)` folder, and save.
