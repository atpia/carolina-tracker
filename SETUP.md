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

Once it's on the home screen it opens full screen, works offline and shows a number on its icon when a feed, diaper check or dose is due. Without a connection it opens with the entries it last saw and keeps anything you log until it can send it. The header says how old the data is. On Android, press and hold the icon for shortcuts that start or stop a feed, log a wet or wet + stool diaper in one tap, or go straight to medicine or the calendar. For Siri on iPhone, and one-tap buttons that don't open the app, see section 9.

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

### Turning Discord off

To pause Discord without losing the webhook, do any of these. Each one changes the same `discordOn` setting, so it's off for everyone:
- In the app: **Settings → Home screen and notifications → Discord messages, for everyone**. The switch only shows once the Sheet has a webhook.
- In the Sheet: **Baby tracker → Turn Discord messages on or off**.
- In the Settings tab: set `discordOn` to `FALSE`.

While it's off, nothing goes to Discord: no reminders, no `announceEntries` messages and no test message. Phone notifications (section 8) and the Home Assistant light keep working. Reminders missed while Discord was off aren't posted later when you turn it back on. To remove Discord completely, clear `discordWebhook` instead.

The switch needs the script from this version. After pasting it, click **Baby tracker → 1. Set up tabs and codes** so the `discordOn` row appears (see "Changing things later").

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

### Running feed notification

While a feed runs, every phone with notifications on shows it: which feed, when it started and who started it. It comes up even when the app is closed, because the Sheet sends it the moment a feed starts, from the app, Siri or a widget. When the feed ends, the Sheet replaces it on every phone with how long it went ("Feed stopped · Left breast, 3:10 to 3:32 PM (22 min), stopped by Mom"). The phone that started or stopped the feed in its own app is left out, since its app has already done it.

- **Android:** the notification shows how long the feed has been going and has a **Stop feed** button. Stopping works with the app closed, and offline too: the stop waits on the phone and is sent when the connection is back. A tap on the "Feed stopped" notice that follows opens the entry to add how it went.
- **iPhone:** iOS doesn't allow buttons or a running clock on web app notifications, so it shows the start time, and a tap opens the app. Stop the feed there, or with Siri (section 9). iPhones may also play their usual notification sound for these, as iOS doesn't seem to honour the "silent" setting web apps ask for. If that's too much, turn the sound off for the app in the iPhone's **Settings → Notifications**, or turn the feed notification off in the app.

Each phone can turn it off under **Settings → Home screen and notifications → Running feed in notifications**. The app tells the Sheet, so it stops sending them to that phone.

This needs the script from November 2026 or later: paste the latest [`apps-script/Code.gs`](apps-script/Code.gs) and deploy a new version (see **Updating the script** below). With an older script, the notice only shows on the phone whose app saw the feed.

Reminders and feed notices from the Sheet also let the app sync in the background, which is the only background time iPhone gives web apps: each one gives it a few seconds to send entries waiting on the phone and fetch new ones. Android also syncs on its own from time to time.

## 9. Siri, widgets and one-tap buttons (optional)

Start and stop feeds and log diapers by voice or with one tap, without opening the app. Neither iPhone nor Android lets a web app put a widget on the home screen or answer Siri, so this goes through a free shortcuts app that sends a link to the Sheet. The links are listed in the app under **Settings → Siri, widgets and one-tap buttons**, each with a **Copy link** button, and the steps below are there too.

These need the script from November 2026 or later. If yours is older, paste the latest [`apps-script/Code.gs`](apps-script/Code.gs) and deploy a new version (see **Updating the script** below). Until then the links reply with an error.

**Only one feed runs at a time.** Starting a feed while another is going doesn't start it: Siri says which one is running and since when, and to stop it first. The app does the same: its **Start timer** button is off while a feed is going. A timer left on for more than 3 hours counts as forgotten, so it doesn't block a new feed, and Siri mentions it so it can be fixed in the app.

| Link ends in | What it does |
| --- | --- |
| `do=feed-left`, `do=feed-right`, `do=feed-both` | Starts that breast feed. |
| `do=feed-formula&unit=oz&amount=`, `do=feed-expressed&…` | Starts a bottle feed. The shortcut puts the amount offered after `amount=`. Without one it still starts, and the app asks for it. |
| `do=feed-stop&unit=oz&ask=1` | Stops whatever feed is going, then asks how it went: "How did it go, from 1 to 5?" for the breast, "What percent did Carolina drink?" for a bottle (or how much, if no amount was given at the start). |
| `do=feed-details&unit=oz&value=` | The answer to that question. The shortcut puts the number after `value=`. It goes to the feed that ended last, within the hour. |
| `do=feed-stop` | Stops the running feed, with no question. For widgets. |
| `do=feed` | One button for both: stops the running feed, or starts the other side from last time. |
| `do=diaper-wet`, `do=diaper-dry`, `do=diaper-both`, `do=diaper-stool` | Logs that diaper now (dry means checked and still clean). |

Each link replies with one sentence, like "Wet diaper logged at 3:42 PM.", which Siri reads out. The amounts are in the unit set in the app (ml or oz) when the link was copied.

Each link contains that person's personal code, so treat it like the setup link: keep it on their own phone and don't share it. Entries made this way show up as logged by that person.

**If a question isn't answered.** Siri can be told "cancel", or the question can time out. The feed is still stopped. The next time the app is opened on that phone, it asks: a card at the top of the Now screen with 1 to 5 for the breast, or 25% to 100% for a bottle. **Skip** leaves the feed as it is. The same happens for a feed stopped by a widget, the notification's Stop button or the app's icon shortcuts.

### iPhone: Siri and the Shortcuts app

Make one shortcut per thing you want to say. The name of the shortcut is what you say to Siri, so pick something short and easy to say, like **Start left**, **Start right**, **Start formula**, **Start expressed**, **Stop feeding**, **Wet diaper**, **Dry diaper** and **Both diapers**. Do this on her phone, from the app opened from the home screen, so the links carry her code.

**A simple shortcut (diapers, breast feeds)**
1. In the tracker, go to **Settings → Siri, widgets and one-tap buttons** and tap **Copy link** next to it.
2. Open the **Shortcuts** app, tap **+**, then search for and add **Get Contents of URL**.
3. Tap the URL in it and paste the link.
4. Tap the **▸** arrow beside it and change **Method** from GET to **POST**.
5. Add **Show Result** and tap its text to pick **Contents of URL**. This is what Siri reads out.
6. Tap the name at the top, rename it to what you'll say (e.g. **Wet diaper**), and tap **Done**.

**Formula and expressed milk (asks how much)**
1. In a new shortcut, add **Ask for Input** first. Set **Input Type** to **Number** and the prompt to e.g. **How many oz?**
2. Add **Get Contents of URL** and paste the **Start formula** link. It ends with `amount=`.
3. Tap at the very end of the link, then tap **Provided Input** in the bar above the keyboard, so the link ends with `amount=` followed by the blue **Provided Input** bubble.
4. Set **Method** to **POST**, add **Show Result** with **Contents of URL**, and name it **Start formula**.
5. Make **Start expressed** the same way with the **Start expressed milk** link.

**Stop feeding (then asks how it went)**
1. Add **Get Contents of URL** with the **Stop feeding** link, and set **Method** to **POST**.
2. Add **If**. It picks **Contents of URL** by itself; set the condition to **contains** and type `?` (a question mark).
3. Between **If** and **Otherwise**, add **Ask for Input**. Set **Input Type** to **Number**, and for the prompt, tap the variable **Contents of URL**. Siri then asks the question the Sheet sends back ("Left breast feed stopped after 22 min. How did it go, from 1 to 5?").
4. Below it, still above **Otherwise**, add another **Get Contents of URL**. Paste the **Stop feeding: the answer** link, put **Provided Input** at the end after `value=`, and set **Method** to **POST**.
5. Below that, add **Show Result** and pick the second **Contents of URL** (it says e.g. "Saved. Left breast feed, 4 out of 5.").
6. Between **Otherwise** and **End If**, add **Show Result** with the first **Contents of URL**, for when there was nothing to ask ("No feed is running.").
7. Name it **Stop feeding**.

**Using them with the phone locked**
1. Run each new shortcut once from the Shortcuts app with the phone unlocked. The first time, iOS asks whether it may connect to Google (script.google.com, and possibly script.googleusercontent.com): tap **Always Allow**. Until then, Siri stops at that question when the phone is locked.
2. In **Settings → Siri** (called **Siri & Search** or **Apple Intelligence & Siri** on some versions), turn on **Allow Siri When Locked**. Turn on listening for **"Siri" or "Hey Siri"** to use it hands-free.
3. Lock the phone and try one: "Hey Siri, wet diaper". If Siri asks to unlock, run that shortcut once more unlocked and check its connection was allowed.

They also work from a **Shortcuts widget** on the home or lock screen, from **Control Center**, from the **Action button** (iPhone 15 Pro and later) and from **Back Tap** (**Settings → Accessibility → Touch → Back Tap**). Buttons on the lock screen may ask for Face ID first; Siri doesn't.

Shortcuts need a connection: offline, Siri says it couldn't connect and nothing is logged, so log it in the app instead.

### Android

- **Without any other app:** press and hold the tracker's home screen icon. Its shortcuts start or stop a feed and log a wet or wet + stool diaper. Drag one onto the home screen to keep it there as its own icon. These open the app for a moment, work offline, and show an **Undo** button.
- **Without opening the app:** install **HTTP Shortcuts** (free, from the Play Store). Create a shortcut, set the method to **POST**, paste a link, and under **Response Handling** choose to show the response as a toast or notification. Add it to the home screen from the app, or put several on its home screen widget. On Android, the app lists the plain **Stop feeding** link, without the question.

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
