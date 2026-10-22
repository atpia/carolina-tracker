# Setting up the tracker

This takes about 15 minutes, once. Everything here is free.

You need:
- A Google account to own the Sheet that stores the data.
- This GitHub repo, which hosts the app at **https://atpia.github.io/carolina-tracker/**.
- Optionally, a Discord channel for reminders. Reminders can also come to the phones as notifications (section 8).
- Optionally, Home Assistant with Nabu Casa, to flash a light when a breastfeed runs long.

## 1. Create the Google Sheet

1. Go to [sheets.new](https://sheets.new) and name the spreadsheet **Carolina tracker**.
2. Open **File → Settings** and set the time zone to yours. This only affects how times look in the Sheet.
3. Open **Extensions → Apps Script**. A code editor opens in a new tab.
4. Delete everything in `Code.gs` and paste in the whole contents of [`apps-script/Code.gs`](apps-script/Code.gs). Use the **Raw** button on GitHub so you can copy it all. Click the 💾 save icon.
5. In the toolbar, make sure the function dropdown next to **Debug** says **setup** (not `onOpen`), then click **Run**. The Execution log at the bottom should end with "Execution completed".
6. Google asks for permission. Click **Review permissions**, choose your account, then **Advanced → Go to Untitled project (unsafe) → Allow**. The warning appears because you wrote the script yourself and Google hasn't reviewed it. The script can only touch this one spreadsheet and send messages to Discord and Home Assistant.

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
2. Tap **Install app** under the app's **Settings → Home screen and notifications** (or **⋮ → Add to Home screen**).

Once it's on the home screen it opens full screen, works offline and shows a number on its icon when a feed, diaper check or dose is due. On Android, press and hold the icon for shortcuts that go straight to logging a feeding, a diaper or medicine, or to the calendar.

To remove someone's access, set their `active` cell to `FALSE` in the Users tab. Their phone shows "Couldn't sign in" the next time it syncs, and keeps any entries it hadn't synced yet in case the code works again. To give them a new code, type any new code in the `code` cell (letters, numbers and dashes) and run **Refresh setup links** again.

## 4. Discord reminders (optional)

1. In Discord, open **Server Settings → Integrations → Webhooks → New Webhook**. Pick the channel, give it a name, then **Copy Webhook URL**.
2. Paste that URL into `discordWebhook` in the Sheet's Settings tab.
3. Click **Baby tracker → Send a test Discord message** and check the channel.
4. Click **Baby tracker → 3. Turn on reminders (Discord and Home Assistant)**. Google may ask for permission once more. If both `discordWebhook` and `haWebhookUrl` are blank, it says so instead of turning reminders on.

The script checks every 5 minutes and posts once for each of these:
- 🍼 the feeding window opens (2 hours after the last feeding ended), and ⏰ again if no one has fed her by 4 hours
- ⏱️ a feeding timer has been running for 3 hours, in case someone forgot to stop it
- 🧷 a diaper check is due: 2 hours after a wet or stool diaper, or 1 hour after a check that found it clean
- ⏰ a running breastfeeding timer passes `breastLimitMin` minutes (15 by default, 0 turns it off). A both-sides feed gets a 🔄 switch nudge at the limit and the warning at twice it. Reminders run every 5 minutes, so this can arrive a few minutes after the app starts flashing
- 💊 mom's next dose is allowed, naming which medication is next
- 🌿 mom's probiotics haven't been logged yet that day, at the hour in `probioticReminderHour` (20, so 8 PM, by default; type `off` to skip it). The hour uses the script's time zone, set under Project Settings in the Apps Script editor
- ☀️ the baby's Vitamin D hasn't been logged yet that day, at the hour in `vitaminDReminderHour` (also 20 by default; `off` skips it)

Times in the messages show in each person's own time zone. Turn individual reminders on or off with `remindFeeding`, `remindDiaper` and `remindMeds`. Set `announceEntries` to `TRUE` if you also want a message every time someone logs something.

## 5. Appointments calendar

Appointments added in the app's **Calendar** tab are saved in the Sheet's **Appointments** tab and copied to a Google Calendar. The copy is one way: add, edit and delete appointments in the app. Changes made in Google Calendar are not read back, and the next edit in the app overwrites them.

1. Click **Baby tracker → 4. Set up appointments calendar**. Google asks for permission once more, this time to manage your calendars (the same **Advanced → Go to … → Allow** steps as before). It makes a calendar called **Carolina's appointments** and saves its ID in Settings → `calendarId`.
2. Deploy a new version: **Deploy → Manage deployments → ✏️ Edit → Version: New version → Deploy**. The web app needs this to start using the calendar.
3. To let others see the appointments, open [Google Calendar](https://calendar.google.com), point at **Carolina's appointments** under "My calendars", then **⋮ → Settings and sharing → Share with specific people**, and add their Google accounts.

To use a calendar you already have instead, paste its ID (Google Calendar → its **Settings and sharing → Integrate calendar → Calendar ID**) into `calendarId`, then run **Baby tracker → Copy all appointments to the calendar again**. That menu item also retries any appointment the app marks with a crossed-out calendar icon.

Places you go often can be saved under **Saved places** at the bottom of the Calendar tab (or with **Save this address as a place** while making an appointment). They're stored in the Sheet's **Places** tab, and tapping one fills in its address. The address is what goes into the calendar event's location, so tapping it in Google Calendar opens Maps.

In Google Calendar each event's title starts with the baby's name from Settings → `babyName`, for example **Carolina - Two-week checkup**. The app shows the plain title. After changing `babyName`, run **Copy all appointments to the calendar again** to update the existing events.

Each appointment gets an hour in the calendar when no end time is set. Google Calendar's own notifications for that calendar apply, so set them under the calendar's **Settings and sharing → Event notifications**.

## 6. Flash a light with Home Assistant (optional)

When a running breastfeeding timer passes `breastLimitMin` (15 minutes per side by default, so 30 for a both-sides feed), the Sheet calls a Home Assistant webhook, and an automation flashes a light. It goes out once per feed. Any phone with the app open asks for it the moment the limit passes; if no phone has the app open, the 5-minute reminder check sends it instead, up to 15 minutes late. A feed that went past the limit more than 15 minutes ago never flashes, so turning this on in the middle of a long feed stays quiet. Setting `breastLimitMin` to 0 turns it off along with the rest of the limit warnings.

### In Home Assistant

1. Go to **Settings → Automations & scenes → Create automation → Create new automation**, then **⋮ → Edit in YAML**.
2. Paste this. It pulses `light.living_room_reading_light` five times, from 75% down to 10% over a second each way, then puts the light back how it was (off, if it was off). For a different light, change the entity ID in all four places. Find it under **Settings → Devices & services → Entities**.
3. Change the `webhook_id` to something long and random. Anyone with the URL can flash the light, so treat it like a password. A password manager's generator works, or add a **Webhook** trigger in the visual editor and copy the ID it makes up.
4. **Save**. Home Assistant may warn that `scene.before_feed_limit_flash` doesn't exist. That's expected: the first step makes it each time the automation runs.

```yaml
alias: Breastfeeding limit light
description: >-
  Flash the light when the baby tracker's breastfeeding timer passes the
  per-side limit
triggers:
  - trigger: webhook
    webhook_id: carolina-feed-limit-CHANGE-THIS-TO-SOMETHING-RANDOM
    allowed_methods:
      - POST
    # The Sheet calls from Google's servers, outside your home network.
    local_only: false
actions:
  # Remember how the light was, so it goes back afterwards.
  - action: scene.create
    data:
      scene_id: before_feed_limit_flash
      snapshot_entities:
        - light.living_room_reading_light
  - repeat:
      count: 5
      sequence:
        - action: light.turn_on
          data:
            transition: 1
            brightness_pct: 75
          target:
            entity_id: light.living_room_reading_light
        - delay:
            seconds: 1
        - action: light.turn_on
          data:
            brightness_pct: 10
            transition: 1
          target:
            entity_id: light.living_room_reading_light
        - delay:
            seconds: 1
  - action: scene.turn_on
    target:
      entity_id: scene.before_feed_limit_flash
mode: single
```

The delays match the `transition` times, so each fade finishes before the next one starts. Some lights (Philips Hue, for example) can also flash on their own: the `repeat` block can be swapped for a single `light.turn_on` with `flash: long`.

The webhook also sends details you can use in the automation, for example in a notification: `{{ trigger.json.side }}` ("Left breast"), `{{ trigger.json.minutes }}`, `{{ trigger.json.by }}` (who started the timer) and `{{ trigger.json.baby }}`. The test from the Sheet's menu sends `{{ trigger.json.event }}` as `test` instead of `breast_limit`, if you want the automation to tell them apart.

### The webhook URL

The URL is your Nabu Casa address with `/api/webhook/` and the `webhook_id` on the end, for example:

```
https://abcdefghijklmnop.ui.nabu.casa/api/webhook/carolina-feed-limit-CHANGE-THIS-TO-SOMETHING-RANDOM
```

Find your Nabu Casa address under **Settings → Home Assistant Cloud → Remote access**. Remote access has to be on.

### In the Sheet

1. Paste the latest [`apps-script/Code.gs`](apps-script/Code.gs) into the Apps Script editor (replace everything) and save.
2. Deploy a new version: **Deploy → Manage deployments → ✏️ Edit → Version: New version → Deploy**. The phones need this to ask for the light the moment the limit passes.
3. Reload the Sheet and click **Baby tracker → 1. Set up tabs and codes**. It adds the new `haWebhookUrl` row to the Settings tab and leaves everything else alone.
4. Paste the webhook URL into `haWebhookUrl`.
5. Click **Baby tracker → Send a test Home Assistant alert**. The light should flash. Home Assistant answers every webhook URL the same way, even one with a mistyped ID, so if the Sheet says "Sent!" but nothing flashes, check the `webhook_id` against the URL and look at the automation's **Traces**.
6. Click **Baby tracker → 3. Turn on reminders (Discord and Home Assistant)**, if you haven't before, so the 5-minute check can send it when no phone has the app open. Google may ask for permission to connect to an external service.

Nothing changes on the phones. Once they reload, the app's **Settings → Schedule** shows "Flash a light at the limit: Home Assistant". To turn the light off, clear `haWebhookUrl`.

## 7. Reading light switch in the app (optional)

The app's **Now** tab can show a **Reading light** card with an on/off button and a brightness slider, for turning the light on during a night feed without leaving the app. Moving the slider while the light is off turns it on at that brightness. The card shows the light's real state, including changes made at the wall switch or in Home Assistant, and checks again every 30 seconds while the app is open.

The Sheet talks to Home Assistant's API with a long-lived access token. That token can do anything in Home Assistant, so:
- it's saved in the script's own storage, not in a Sheet cell, so people the Sheet is shared with can't read it
- it never goes to the phones
- the app can only switch and dim the one light in Settings → `readingLight`

### In Home Assistant

1. Click your name at the bottom left, open the **Security** tab, and under **Long-lived access tokens** click **Create token**. Name it **Baby tracker** and copy it. Home Assistant shows it only once.

Nothing else is needed in Home Assistant: no automation for this one.

### In the Sheet

1. Paste the latest [`apps-script/Code.gs`](apps-script/Code.gs), deploy a new version, and run **Baby tracker → 1. Set up tabs and codes**, the same as in section 6. It adds the `haUrl` and `readingLight` rows.
2. Put your Nabu Casa address (for example `https://abcdefghijklmnop.ui.nabu.casa`, without `/api/webhook/…`) into `haUrl`. `readingLight` is already `light.living_room_reading_light`; change it for a different light.
3. Click **Baby tracker → Save Home Assistant token**, paste the token, and click **OK**. It answers with the light's current state, or says what's wrong.

Reload the app on each phone and the card appears on the **Now** tab. To take the light out of the app, run **Save Home Assistant token** again with an empty box. To cut off the token entirely, delete it in Home Assistant under **Security → Long-lived access tokens**.

## 8. Notifications on the phones (optional)

The reminders in section 4 can also arrive as ordinary phone notifications, from the Sheet, without Discord. Discord keeps working; use either or both. They go through Google's and Apple's free push services, which need no account or sign-up.

Notifications on iPhone need iOS 16.4 or later and only work in the app opened from the home screen, not in a Safari tab.

### In the Sheet

1. Paste the latest [`apps-script/Code.gs`](apps-script/Code.gs) into the Apps Script editor (replace everything) and save.
2. Deploy a new version: **Deploy → Manage deployments → ✏️ Edit → Version: New version → Deploy**. The phones need this to sign up.
3. If reminders aren't on yet, click **Baby tracker → 3. Turn on reminders**. It now works with no Discord webhook, as long as a phone has turned notifications on.

### On each phone

1. Open the app from the home screen and go to **Settings → Home screen and notifications**.
2. Tap **Turn on notifications** and allow them when the phone asks.
3. Tap **Send a test**. A notification should arrive within a few seconds.

Each person does this on their own phone. To check them all at once, click **Baby tracker → Send a test notification to phones** in the Sheet; it says which phones it reached.

A tap on a notification opens the app. A newer reminder of the same kind (feeding, diaper, medicine) replaces the older one instead of stacking up. Reminders older than an hour are dropped rather than delivered late, for example to a phone that was off overnight.

To stop them on one phone, tap **Turn off** in the same place, or turn notifications off for the app in the phone's settings. The Sheet forgets a phone by itself once its push address stops working.

The Sheet keeps each phone's push address, and its own signing key, in the script's storage (Project Settings → Script Properties), not in a tab. If that key is ever deleted, each phone needs to turn notifications off and on again.

## Changing things later

- **Intervals and the baby's name:** edit the Settings tab. The app picks up changes the next time it's opened.
- **Updating the script:** paste the new code, then go to **Deploy → Manage deployments → ✏️ Edit → Version: New version → Deploy**. The URL stays the same, so the phones keep working. Then click **Baby tracker → 1. Set up tabs and codes** once more. It adds any new columns and settings and leaves your data, codes and existing settings alone.
- **Daily goals:** `targetFeedsPerDay` and `targetWetPerDay` show a goal on the app's Today card, for example 8 feeds and 6 wet diapers. They're 0 by default, which hides them.
- **Units:** each phone picks ml or oz under Settings in the app. Amounts are always stored in ml.

## Free tier limits

- **GitHub Pages:** free for public repositories. The repo holds only code. No baby data or codes are ever stored in it.
- **Google Apps Script (free Gmail account):** 90 minutes of trigger run time per day. The 5-minute reminder check takes about a second, which works out to roughly 5 minutes a day. App requests from the phones don't count against that limit.
- **Google Calendar:** a free account can create about 5,000 calendar events a day, far more than appointments need.
- **Phone notifications:** free. Google's and Apple's push services don't charge or need an account. Each reminder takes about a second of the 90 minutes, per phone.
- **Discord webhooks:** free, with a limit of about 30 messages per minute per channel, far more than this uses.
