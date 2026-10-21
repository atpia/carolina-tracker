# Carolina tracker

A small phone-friendly app for tracking a newborn's feedings and diapers, plus mom's alternating ibuprofen and Tylenol doses and daily probiotics. Built with React and [shadcn/ui](https://ui.shadcn.com), hosted free on GitHub Pages, with a Google Sheet as the database.

- **Feedings:** left, right or both breasts, formula, or expressed milk. Start/stop timer or times you enter by hand, a 1 to 5 confidence score for breastfeeding, and offered vs. left-over amount (or % drank) for bottles. ml or oz.
- **Next feeding window:** 2 to 4 hours after the last feeding ended.
- **Diapers:** wet, stool, both, or "checked, still clean", with a countdown to the next check.
- **Mom's medication:** shows which one is next and a countdown to when it's allowed. Probiotics are once a day: the card shows whether today's has been taken.
- **Shared:** each caregiver has a personal code, and every entry records who logged or last edited it.
- **Discord reminders** (optional) when a feeding, diaper check or dose is due.

Setup instructions are in [SETUP.md](SETUP.md). The Google Apps Script backend is in [`apps-script/Code.gs`](apps-script/Code.gs).

## Development

```sh
npm install
npm run dev
```

Open the app and choose "Try it first with demo data" to use it without a Sheet. Pushing to `main` deploys to GitHub Pages.
