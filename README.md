# Carolina tracker

A small phone-friendly app for tracking a newborn's feedings and diapers, plus mom's alternating ibuprofen and Tylenol doses and daily probiotics. Built with React and [shadcn/ui](https://ui.shadcn.com), hosted free on GitHub Pages, with a Google Sheet as the database.

- **Feedings:** left, right or both breasts, formula, or expressed milk. Start/stop timer or times you enter by hand, a 1 to 5 confidence score for breastfeeding, and offered vs. left-over amount (or % drank) for bottles, which is required. ml or oz.
- **Next feeding window:** 2 to 4 hours after the last feeding ended.
- **Diapers:** wet, stool, both, or "checked, still clean", with a countdown to the next check.
- **Mom's medication:** shows which one is next and a countdown to when it's allowed. Probiotics are once a day: the card shows whether today's has been taken.
- **Vitamin D:** the baby's daily drops, shown on the Feeding card and in the "Due now" banner until logged.
- **Temperature:** log readings (rectal, armpit, forehead or ear) in °F or °C. Reports graph them against the 100.4 °F fever line.
- **Shared:** each caregiver has a personal code, and every entry records who logged or last edited it.
- **Reminders** (optional) when a feeding, diaper check or dose is due, as phone notifications, in Discord, or both. Discord can be switched off for everyone from the app without removing it.
- **Home screen app** for iPhone and Android: full screen, a badge on the icon when something is due, and Android shortcuts straight to logging.
- **Offline first:** opens at once with the last saved entries, even with no connection or a slow one. Entries made offline wait on the phone and sync when the connection is back, in the background too where the phone allows it.
- **Running feed notification** on every phone, even with the app closed: the start time, plus a Stop button and elapsed time on Android. Only one feed runs at a time.
- **Siri and one-tap buttons** to start and stop feeds and log diapers without opening the app, even with the phone locked: Siri and the Shortcuts app on iPhone (it asks how the feed went, or the app asks next time it's opened), HTTP Shortcuts or the icon's shortcuts on Android.
- **Home Assistant light** (optional) that flashes when a breastfeed passes the per-side limit, and a reading light switch with brightness in the app.

Setup instructions are in [SETUP.md](SETUP.md). The Google Apps Script backend is in [`apps-script/Code.gs`](apps-script/Code.gs).

## Development

```sh
npm install
npm run dev
```

Open the app and choose "Try it first with demo data" to use it without a Sheet. Pushing to `main` deploys to GitHub Pages.
