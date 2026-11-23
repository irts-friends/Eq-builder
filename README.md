# EQ Request Builder

Web-based Emergency Quota (EQ) Request Builder for railway officers to extract booking details from ticket PDFs or 139 SMS replies, verify officer rosters, look up Sr. DCM CUG contacts, and inspect halting train routes.

## Repository Structure

- `index.html` — Page structure and UI layout
- `styles.css` — Layout, light/dark theme tokens, form states, and `.trr-*` train route timeline styles
- `app.js` — Ticket PDF & 139 SMS parser, message builder, `localStorage` reference persistence, request verification, Sr. DCM directory lookup, and `directory-data.xlsx` loader
- `train-route.js` — RailRadar train route lookup (`haltsOnly=true`), toggle show/hide behavior, and 7-day `localStorage` cache
- `directory-data.xlsx` — Excel workbook containing two sheets:
  - `IRTS_Officers` (`S. No.`, `Officer Name`, `Batch`)
  - `Sr_DCM_Contacts` (`S. No.`, `Zone`, `Division`, `Designation Label`, `CUG Number`)

## GitHub Pages Deployment

1. Upload `index.html`, `styles.css`, `app.js`, `train-route.js`, and `directory-data.xlsx` to the root of your GitHub repository.
2. Go to **Settings → Pages**, select your branch (`main`) and `/ (root)` folder, and save.
3. Open the published GitHub Pages URL in Google Chrome.
