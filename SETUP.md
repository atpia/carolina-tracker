# Setting up the tracker

This takes about 15 minutes, once. Everything here is free.

You need:
- A Google account to own the Sheet that stores the data.
- This GitHub repo, which hosts the app at **https://atpia.github.io/carolina-tracker/**.
- Optionally, a Discord channel for reminders.

## 1. Create the Google Sheet

1. Go to [sheets.new](https://sheets.new) and name the spreadsheet **Carolina tracker**.
2. Open **File → Settings** and set the time zone to yours. This only affects how times look in the Sheet.
3. Open **Extensions → Apps Script**. A code editor opens in a new tab.
4. Delete everything in `Code.gs` and paste in the whole contents of [`apps-script/Code.gs`](apps-script/Code.gs). Use the **Raw** button on GitHub so you can copy it all. Click the 💾 save icon.
5. In the toolbar, make sure the function dropdown next to **Debug** says **setup** (not `onOpen`), then click **Run**. The Execution log at the bottom should end with "Execution completed".
6. Google asks for permission. Click **Review permissions**, choose your account, then **Advanced → Go to Untitled project (unsafe) → Allow**. The warning appears because you wrote the script yourself and Google hasn't reviewed it. The script can only touch this one spreadsheet and send messages to Discord.

Back in the Sheet you'll now have three tabs along the bottom (you may need to reload the page):

| Tab | What it's for |
| --- | --- |
| **Events** | Every feeding, diaper and dose. Each row records who logged it and who last edited it. Deleted entries stay here with `deleted = TRUE`, so nothing is ever lost. |
| **Users** | One row per caregiver with their personal code. Rename "Caregiver 2" and "Caregiver 3" to real names. |
| **Settings** | Feeding window (2 to 4 hours), medication interval (4 hours), diaper checks (2 hours after a change, 1 hour after a clean check), daily goals, Discord options. |

## 2. Turn the script into a web app

1. In the Apps Script tab, click **Deploy → New deployment**.
2. Click the ⚙️ gear next to "Select type" and choose **Web app**.
3. Set **Execute as: Me** and **Who has access: Anyone**. "Anyone" is needed so the app can reach the script. The script still rejects every request that doesn't carry one of the personal codes.
4. Click **Deploy** and copy the **Web app URL**. It ends in `/exec`.
5. In the Sheet, go to the **Settings** tab and paste that URL into the `apiUrl` value.
6. Reload the Sheet. A **Baby tracker** menu appears. Click **Baby tracker → 2. Refresh setup links**.

The **Users** tab now has a personal setup link for each person in the `setupLink` column.

## 3. Set up each phone

Send each person **only their own** setup link, for example in a Discord DM. Then on each phone:

**iPhone (Safari)**
1. Open https://atpia.github.io/carolina-tracker/ in Safari.
2. Tap **Share → Add to Home Screen**.
3. Open the new home screen icon, paste the personal setup link into the first box, and tap **Connect**.

The home screen app keeps its own storage on iPhone, which is why the link gets pasted inside it rather than opened in Safari.

**Android (Chrome)**
1. Open the personal setup link in Chrome. It connects right away.
2. Tap **⋮ → Add to Home screen** (or **Install app**).

To remove someone's access, set their `active` cell to `FALSE` in the Users tab. Their phone shows "Couldn't sign in" the next time it syncs, and keeps any entries it hadn't synced yet in case the code works again. To give them a new code, type any new code in the `code` cell (letters, numbers and dashes) and run **Refresh setup links** again.

## 4. Discord reminders (optional)

1. In Discord, open **Server Settings → Integrations → Webhooks → New Webhook**. Pick the channel, give it a name, then **Copy Webhook URL**.
2. Paste that URL into `discordWebhook` in the Sheet's Settings tab.
3. Click **Baby tracker → Send a test Discord message** and check the channel.
4. Click **Baby tracker → 3. Turn on Discord reminders**. Google may ask for permission once more. If `discordWebhook` is blank, it says so instead of turning reminders on.

The script checks every 5 minutes and posts once for each of these:
- 🍼 the feeding window opens (2 hours after the last feeding ended), and ⏰ again if no one has fed her by 4 hours
- ⏱️ a feeding timer has been running for 3 hours, in case someone forgot to stop it
- 🧷 a diaper check is due: 2 hours after a wet or stool diaper, or 1 hour after a check that found it clean
- 💊 mom's next dose is allowed, naming which medication is next
- 🌿 mom's probiotics haven't been logged yet that day, at the hour in `probioticReminderHour` (20, so 8 PM, by default; type `off` to skip it). The hour uses the script's time zone, set under Project Settings in the Apps Script editor
- ☀️ the baby's Vitamin D hasn't been logged yet that day, at the hour in `vitaminDReminderHour` (also 20 by default; `off` skips it)

Times in the messages show in each person's own time zone. Turn individual reminders on or off with `remindFeeding`, `remindDiaper` and `remindMeds`. Set `announceEntries` to `TRUE` if you also want a message every time someone logs something.

## Changing things later

- **Intervals and the baby's name:** edit the Settings tab. The app picks up changes the next time it's opened.
- **Updating the script:** paste the new code, then go to **Deploy → Manage deployments → ✏️ Edit → Version: New version → Deploy**. The URL stays the same, so the phones keep working. Then click **Baby tracker → 1. Set up tabs and codes** once more. It adds any new columns and settings and leaves your data, codes and existing settings alone.
- **Daily goals:** `targetFeedsPerDay` and `targetWetPerDay` show a goal on the app's Today card, for example 8 feeds and 6 wet diapers. They're 0 by default, which hides them.
- **Units:** each phone picks ml or oz under Settings in the app. Amounts are always stored in ml.

## Free tier limits

- **GitHub Pages:** free for public repositories. The repo holds only code. No baby data or codes are ever stored in it.
- **Google Apps Script (free Gmail account):** 90 minutes of trigger run time per day. The 5-minute reminder check takes about a second, which works out to roughly 5 minutes a day. App requests from the phones don't count against that limit.
- **Discord webhooks:** free, with a limit of about 30 messages per minute per channel, far more than this uses.
