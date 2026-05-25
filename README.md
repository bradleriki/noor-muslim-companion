# Noor — Muslim Companion

A daily companion web app for Muslims. Built with React, runs in any modern browser on mobile and desktop.

## Features

- **Prayer Times** — Five daily prayers calculated for your GPS location, with 7 calculation methods (ISNA, MWL, Umm al-Qura, Karachi, Egyptian, Gulf, Diyanet).
- **Qibla Compass** — Great-circle bearing to the Kaaba in Mecca, with live compass on devices that support DeviceOrientation.
- **Quran Reader** — All 114 Surahs with Arabic (Uthmani script) and Sahih International English translation.
- **Halal Scanner** — Look up products by barcode against the Open Food Facts database; flags haram and questionable ingredients.
- **Daily Verse** — A rotating verse displayed on the home screen.
- **Hijri Date** — Shown alongside the Gregorian date.

## Tech Stack

- React 18 (Create React App)
- Lucide React icons
- Google Fonts: Cormorant Garamond, Inter, Amiri (for Arabic)
- localStorage for settings persistence
- No backend — everything runs in the browser

## APIs Used

| API | Purpose | Auth |
|---|---|---|
| [Aladhan](https://aladhan.com/prayer-times-api) | Prayer times + Hijri date | None |
| [Quran.com v4](https://quran.api-docs.io/) | Surahs, verses, translations | None |
| [Open Food Facts](https://world.openfoodfacts.org/data) | Barcode → ingredients | None |

All three are free and require no API keys.

## Getting Started Locally

You'll need Node.js installed (v18 or newer recommended).

```bash
# Install dependencies
npm install

# Run the dev server
npm start

# Open http://localhost:3000
```

## Deploy to Cloudflare Pages

1. Push this repo to GitHub.
2. In Cloudflare dashboard, go to **Workers & Pages** → **Create application** → **Pages** → **Connect to Git**.
3. Pick this repository.
4. Build settings:
   - **Framework preset**: Create React App
   - **Build command**: `npm run build`
   - **Build output directory**: `build`
5. Click **Save and Deploy**.

Cloudflare auto-rebuilds on every push to `main`.

## Project Structure

```
muslim-companion/
├── public/
│   ├── index.html          # HTML shell, Google Fonts links
│   └── manifest.json       # PWA manifest
├── src/
│   ├── index.js            # React entry point
│   ├── index.css           # Global styles (the design system)
│   └── App.js              # Single unified component with all 5 features
├── package.json
└── README.md
```

## Roadmap

**v1 (now)** — Prayer times, Qibla, Quran reader, manual barcode lookup, daily verse, settings.

**v1.1** — Camera-based barcode scanning (using `@zxing/library` or `quagga2`).

**v1.2** — Adhan audio notifications, prayer-time push notifications (requires service worker).

**v1.3** — Surah bookmarks, last-read position, recitation audio playback.

**v1.4** — Tasbih counter, dua collections, mosque finder.

**v2** — Native wrappers (Capacitor) for iOS and Android app store distribution.

## Important Disclaimer

The halal scanner is an **automated screening tool**, not a certification. Ingredients can be sourced from halal or non-halal origins (e.g. gelatin from beef vs. pork), and recipes change over time. Always verify with the manufacturer or look for certified halal logos before consuming a product. Noor is a personal companion, not a religious authority — consult qualified scholars for matters of fiqh.

## License

Personal project. All rights reserved by the author. Built with care.
