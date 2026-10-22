/**
 * Baby tracker backend. Paste this whole file into Extensions → Apps Script
 * of the Google Sheet that should hold the data. See SETUP.md.
 *
 * The web app is deployed "Execute as: Me" and "Who has access: Anyone", so the
 * URL itself is reachable, but every request must carry a personal code from the
 * Users tab. Without a valid code nothing is read or written.
 */

var EVENT_HEADERS = [
  'id', 'type', 'kind', 'start', 'end', 'amountStartMl', 'amountEndMl', 'percent',
  'confidence', 'notes', 'by', 'createdAt', 'updatedAt', 'updatedBy', 'deleted', 'doseMg', 'tempC',
];
var USER_HEADERS = ['name', 'code', 'active', 'setupLink'];
var DEFAULT_SETTINGS = [
  ['babyName', 'Carolina', 'Shown at the top of the app'],
  ['feedMinH', 2, 'Hours after a feeding ends when the next window opens'],
  ['feedMaxH', 4, 'Hours after a feeding ends when the next one is due'],
  ['breastLimitMin', 15, 'Minutes per breast before a running breastfeeding timer flashes, a reminder goes out and the Home Assistant light flashes (0 turns it off)'],
  ['medIntervalH', 4, "Hours between mom's doses (alternating ibuprofen and Tylenol)"],
  ['diaperAfterChangeH', 2, 'Hours until the next diaper check after a wet or stool diaper'],
  ['diaperAfterCleanH', 1, 'Hours until the next check after one that found the diaper clean'],
  ['targetFeedsPerDay', 0, 'Daily feeding goal shown on the Today card (0 hides it)'],
  ['targetWetPerDay', 0, 'Daily wet diaper goal shown on the Today card (0 hides it)'],
  ['appUrl', 'https://atpia.github.io/carolina-tracker/', 'Where the app is hosted, used for setup links'],
  ['apiUrl', '', 'Web app URL from Deploy → Manage deployments (ends in /exec), used for setup links'],
  ['discordWebhook', '', 'Discord channel webhook URL for reminders (leave blank for none)'],
  ['remindFeeding', true, 'Reminder (Discord and phone notifications) when the feeding window opens and when it is overdue'],
  ['remindDiaper', true, 'Reminder when a diaper check is due'],
  ['remindMeds', true, "Reminder when mom's next dose is due"],
  ['probioticReminderHour', 20, "Hour of the day (0-23, so 20 is 8 PM) for a nudge if mom's probiotics are not logged yet that day. Type off for none"],
  ['vitaminDReminderHour', 20, "Hour of the day (0-23) for a nudge if the baby's Vitamin D is not logged yet that day. Type off for none"],
  ['announceEntries', false, 'Also post every new entry to Discord'],
  ['haUrl', '', 'Your Home Assistant address (https://….ui.nabu.casa) for the reading light in the app. Its access token goes in with Baby tracker → Save Home Assistant token, not here'],
  ['readingLight', 'light.living_room_reading_light', 'Home Assistant entity ID of the light the app can switch and dim'],
  ['haWebhookUrl', '', 'Home Assistant webhook URL (https://….ui.nabu.casa/api/webhook/…) called when a breastfeed passes breastLimitMin, to flash a light. Leave blank for none'],
  ['calendarId', '', 'Google Calendar that appointments are copied to. Filled in by "Set up appointments calendar"'],
];
var DATE_FIELDS = { start: true, end: true, createdAt: true, updatedAt: true };
var TEXT_FIELDS = { id: true, type: true, kind: true, notes: true, by: true, updatedBy: true };
var NUMBER_FIELDS = { amountStartMl: true, amountEndMl: true, percent: true, confidence: true, doseMg: true, tempC: true };
var EDITABLE_FIELDS = [
  'type', 'kind', 'start', 'end', 'amountStartMl', 'amountEndMl', 'percent', 'confidence', 'doseMg', 'tempC', 'notes',
];
var KINDS = {
  feeding: { left: true, right: true, both: true, formula: true, expressed: true },
  diaper: { wet: true, stool: true, both: true, dry: true },
  med: { ibuprofen: true, tylenol: true, probiotic: true, vitamind: true },
  temp: { rectal: true, armpit: true, forehead: true, ear: true },
};

// ---------------------------------------------------------------------------
// Menu and one-time setup

/**
 * Run this first. Keep it the first function in the file so the editor's
 * Run button picks it by default.
 */
function setup() {
  var ss = SpreadsheetApp.getActive();
  if (!ss) {
    throw new Error('This script is not attached to a Sheet. Open your Google Sheet, use Extensions → Apps Script there, and paste the code into that editor.');
  }

  var events = ensureSheet_(ss, 'Events', EVENT_HEADERS);
  // Columns added in later versions of this script go on the end of an existing header row.
  events.getRange(1, 1, 1, EVENT_HEADERS.length).setValues([EVENT_HEADERS]).setFontWeight('bold');
  events.setFrozenRows(1);
  events.getRange('D:E').setNumberFormat('yyyy-mm-dd h:mm am/pm');
  events.getRange('L:M').setNumberFormat('yyyy-mm-dd h:mm am/pm');

  var users = ensureSheet_(ss, 'Users', USER_HEADERS);
  // A Users tab from an older version may be missing the setupLink header.
  users.getRange(1, 1, 1, USER_HEADERS.length).setValues([USER_HEADERS]).setFontWeight('bold');
  users.setFrozenRows(1);
  if (users.getLastRow() < 2) {
    users.getRange(2, 1, 3, 3).setValues([
      ['Abel', newCode_(), true],
      ['Caregiver 2', newCode_(), true],
      ['Caregiver 3', newCode_(), true],
    ]);
  }

  var settings = ensureSheet_(ss, 'Settings', ['key', 'value', 'notes']);
  settings.setFrozenRows(1);
  var existing = readSettings_();
  var missing = DEFAULT_SETTINGS.filter(function (row) { return !(row[0] in existing); });
  if (missing.length) {
    settings.getRange(settings.getLastRow() + 1, 1, missing.length, 3).setValues(missing);
  }

  var appts = ensureSheet_(ss, 'Appointments', APPT_HEADERS);
  appts.getRange(1, 1, 1, APPT_HEADERS.length).setValues([APPT_HEADERS]).setFontWeight('bold');
  appts.setFrozenRows(1);
  appts.getRange('C:D').setNumberFormat('yyyy-mm-dd h:mm am/pm');
  appts.getRange('H:I').setNumberFormat('yyyy-mm-dd h:mm am/pm');

  var places = ensureSheet_(ss, 'Places', PLACE_HEADERS);
  places.getRange(1, 1, 1, PLACE_HEADERS.length).setValues([PLACE_HEADERS]).setFontWeight('bold');
  places.setFrozenRows(1);

  var stray = ss.getSheetByName('Sheet1');
  if (stray && stray.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(stray);

  refreshSetupLinks();
  toast_('Tabs are ready. Rename people in the Users tab, then deploy the web app (see SETUP.md).');
}


function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Baby tracker')
    .addItem('1. Set up tabs and codes', 'setup')
    .addItem('2. Refresh setup links', 'refreshSetupLinks')
    .addItem('3. Turn on reminders (phones, Discord and Home Assistant)', 'enableReminders')
    .addItem('4. Set up appointments calendar', 'setupCalendar')
    .addSeparator()
    .addItem('Send a test notification to phones', 'testPush')
    .addItem('Send a test Discord message', 'testDiscord')
    .addItem('Send a test Home Assistant alert', 'testLight')
    .addItem('Save Home Assistant token', 'saveHaToken')
    .addItem('Turn off reminders', 'turnOffReminders')
    .addItem('Copy all appointments to the calendar again', 'resyncCalendar')
    .addToUi();
}

function refreshSetupLinks() {
  // Defaults fill a cleared appUrl, so a link can't start with "#api=".
  var settings = settingsWithDefaults_();
  var webAppUrl = String(settings.apiUrl || '').trim();
  var sheet = SpreadsheetApp.getActive().getSheetByName('Users');
  if (!sheet || sheet.getLastRow() < 2) return;
  var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 4).getValues();
  var links = rows.map(function (r) {
    if (!webAppUrl || !r[1]) return ['Deploy the web app, paste its URL into Settings → apiUrl, then run "Refresh setup links"'];
    return [String(settings.appUrl) + '#api=' + encodeURIComponent(webAppUrl) + '&code=' + encodeURIComponent(r[1])];
  });
  sheet.getRange(2, 4, links.length, 1).setValues(links);
  toast_(webAppUrl
    ? 'Setup links updated. Send each person only their own link.'
    : 'Paste the web app URL into Settings → apiUrl first.');
}

function ensureSheet_(ss, name, headers) {
  var sheet = ss.getSheetByName(name) || ss.insertSheet(name);
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
  }
  return sheet;
}

function newCode_() {
  // 12 characters from an alphabet without look-alikes (~60 bits).
  var alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, Utilities.getUuid() + Math.random());
  var out = '';
  for (var i = 0; i < 12; i++) out += alphabet[(bytes[i] + 128) % alphabet.length];
  return out.slice(0, 4) + '-' + out.slice(4, 8) + '-' + out.slice(8);
}

function toast_(msg) {
  try {
    SpreadsheetApp.getActive().toast(msg, 'Baby tracker', 8);
  } catch (e) {
    Logger.log(msg);
  }
}

// ---------------------------------------------------------------------------
// Web app

function doGet() {
  return ContentService.createTextOutput('The baby tracker API is running. Open the app link instead.');
}

function doPost(e) {
  var out;
  try {
    var req = JSON.parse(e.postData.contents);
    var user = authenticate_(req.code);
    out = { ok: true, result: handle_(req, user) };
  } catch (err) {
    var message = String(err && err.message ? err.message : err);
    out = { ok: false, error: message };
    // The app keeps the entry and tries again later instead of dropping it.
    if ((err && err.retry) || isServiceError_(message)) out.retry = true;
    // The app signs this phone out and keeps its unsynced entries.
    if (err && err.auth) out.auth = true;
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

function handle_(req, user) {
  switch (req.action) {
    case 'session':
      return { user: user, users: activeUsers_().map(function (u) { return u.name; }), settings: clientSettings_() };
    case 'list':
      return listEvents_(Number(req.days) || 7);
    case 'save':
      var saved = withLock_(function () { return saveEvent_(req.event, user); });
      // Posting to Discord after the lock is released keeps a slow Discord from holding up other phones.
      if (saved.created) announce_(saved.event);
      return saved.event;
    case 'delete':
      return withLock_(function () { return deleteEvent_(req.id, user); });
    case 'lightAlert':
      return lightAlert_(req.id);
    case 'setLight':
      return setLight_(req.light);
    case 'getLight':
      return readingLight_();
    case 'listAppointments':
      return listAppointments_();
    case 'saveAppointment':
      return withLock_(function () { return saveAppointment_(req.appointment, user); });
    case 'deleteAppointment':
      return withLock_(function () { return deleteAppointment_(req.id, user); });
    case 'listPlaces':
      return listPlaces_();
    case 'savePlace':
      return withLock_(function () { return savePlace_(req.place, user); });
    case 'deletePlace':
      return withLock_(function () { return deletePlace_(req.id); });
    case 'pushKey':
      return pushKey_();
    case 'pushSubscribe':
      return pushSubscribe_(req.subscription, user);
    case 'pushUnsubscribe':
      return pushUnsubscribe_(String(req.endpoint || ''));
    case 'pushTest':
      return pushTest_(String(req.endpoint || ''), user);
    default:
      throw new Error('Unknown action');
  }
}

function authenticate_(code) {
  code = String(code || '').trim().toLowerCase();
  var match = code && activeUsers_().filter(function (u) { return u.code === code; })[0];
  if (!match) {
    // Slow down guessing.
    Utilities.sleep(1500);
    var err = new Error('That code is not valid. Ask for your personal setup link.');
    err.auth = true;
    throw err;
  }
  return match.name;
}

function activeUsers_() {
  var sheet = SpreadsheetApp.getActive().getSheetByName('Users');
  if (!sheet || sheet.getLastRow() < 2) return [];
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, 3).getValues()
    .filter(function (r) { return r[0] && r[1] && r[2] !== false && String(r[2]).toUpperCase() !== 'FALSE'; })
    .map(function (r) { return { name: String(r[0]).trim(), code: String(r[1]).trim().toLowerCase() }; });
}

function readSettings_() {
  var sheet = SpreadsheetApp.getActive().getSheetByName('Settings');
  var out = {};
  if (!sheet || sheet.getLastRow() < 2) return out;
  sheet.getRange(2, 1, sheet.getLastRow() - 1, 2).getValues().forEach(function (r) {
    if (r[0]) out[String(r[0]).trim()] = r[1];
  });
  return out;
}

function settingsWithDefaults_() {
  var s = readSettings_();
  DEFAULT_SETTINGS.forEach(function (row) {
    if (!(row[0] in s) || s[row[0]] === '') s[row[0]] = row[1];
  });
  return s;
}

function clientSettings_() {
  var s = settingsWithDefaults_();
  return {
    babyName: String(s.babyName),
    feedMinH: Number(s.feedMinH),
    feedMaxH: Number(s.feedMaxH),
    medIntervalH: Number(s.medIntervalH),
    diaperAfterChangeH: Number(s.diaperAfterChangeH),
    diaperAfterCleanH: Number(s.diaperAfterCleanH),
    targetFeedsPerDay: Number(s.targetFeedsPerDay),
    targetWetPerDay: Number(s.targetWetPerDay),
    breastLimitMin: Number(s.breastLimitMin) || 0,
    // Only whether it's set. The URL works like a password, so it stays in the Sheet.
    lightAlert: !!String(s.haWebhookUrl || '').trim(),
    lightControl: haReady_(s),
  };
}

/** Google's own temporary failures, such as "Service Spreadsheets timed out". Worth retrying. */
function isServiceError_(message) {
  return /^(Exception: )?Service\b|timed out|temporarily unavailable|try again later/i.test(message);
}

function retryable_(message) {
  var err = new Error(message);
  err.retry = true;
  return err;
}

function withLock_(fn) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
  } catch (e) {
    throw retryable_('The Sheet is busy. Try again in a moment.');
  }
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

// ---------------------------------------------------------------------------
// Events

function eventsSheet_() {
  var sheet = SpreadsheetApp.getActive().getSheetByName('Events');
  if (!sheet) throw new Error('Run "Baby tracker → Set up tabs and codes" in the Sheet first.');
  return sheet;
}

function rowToEvent_(row) {
  var e = {};
  EVENT_HEADERS.forEach(function (h, i) {
    var v = row[i];
    if (v === '' || v === null) return;
    // A hand-typed cell that isn't a date or a number is left out rather than breaking every phone's list.
    if (DATE_FIELDS[h]) {
      var ms = time_(v);
      if (!ms) return;
      v = new Date(ms).toISOString();
    } else if (NUMBER_FIELDS[h]) {
      v = Number(v);
      if (isNaN(v)) return;
    } else if (h !== 'deleted') v = String(v);
    e[h] = v;
  });
  return e;
}

function eventToRow_(e) {
  return EVENT_HEADERS.map(function (h) {
    var v = e[h];
    if (v === undefined || v === null) return '';
    if (DATE_FIELDS[h]) return v ? new Date(v) : '';
    // A leading apostrophe keeps text as typed: without it the Sheet turns "3/4" into a date, "10:30" into a
    // time, "007" into 7 and "=2 oz" into a formula. It isn't part of the value read back.
    if (TEXT_FIELDS[h] && v !== '') return "'" + String(v);
    return v;
  });
}

var SCAN_CHUNK = 500;

/**
 * Entries that started in the last `days` days. Rows are appended as they're created, and an entry can't
 * start after it was created or last edited, so this reads up from the bottom in chunks and stops at a
 * chunk where nothing was created or edited since then. That keeps each poll fast as the Sheet grows.
 */
function listEvents_(days) {
  var since = Date.now() - days * 86400000;
  var sheet = eventsSheet_();
  var last = sheet.getLastRow();
  var created = EVENT_HEADERS.indexOf('createdAt');
  var updated = EVENT_HEADERS.indexOf('updatedAt');
  var out = [];
  for (var end = last; end >= 2; end -= SCAN_CHUNK) {
    var start = Math.max(2, end - SCAN_CHUNK + 1);
    var rows = sheet.getRange(start, 1, end - start + 1, EVENT_HEADERS.length).getValues();
    var recent = false;
    rows.forEach(function (row, i) {
      var touched = Math.max(time_(row[created]), time_(row[updated]));
      if (touched >= since || !touched) recent = true;
      var e = rowToEvent_(row);
      if (!e.id || truthy_(e.deleted)) return;
      if (!e.start) {
        Logger.log('Skipping Events row ' + (start + i) + ': the start time is not a date.');
        return;
      }
      if (new Date(e.start).getTime() < since) return;
      delete e.deleted;
      out.push(e);
    });
    if (!recent) break;
  }
  return out;
}

function time_(v) {
  if (v === '' || v === null) return 0;
  var t = (v instanceof Date ? v : new Date(v)).getTime();
  return isNaN(t) ? 0 : t;
}

function findRow_(id) {
  var sheet = eventsSheet_();
  if (!id || sheet.getLastRow() < 2) return 0;
  var hit = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).createTextFinder(String(id)).matchEntireCell(true).findNext();
  return hit ? hit.getRow() : 0;
}

function validate_(e) {
  if (!e || !KINDS.hasOwnProperty(e.type)) throw new Error('Unknown entry type');
  if (!e.kind) throw new Error('Missing entry kind');
  if (!KINDS[e.type].hasOwnProperty(e.kind)) throw new Error('Unknown kind for this entry type');
  if (!e.start || isNaN(new Date(e.start).getTime())) throw new Error('Missing start time');
  // Ten minutes of slack for phone clocks. listEvents_ also counts on entries not starting in the future.
  if (new Date(e.start).getTime() > Date.now() + 10 * 60000) throw new Error('The start time is in the future');
  if (e.end && isNaN(new Date(e.end).getTime())) throw new Error('Bad end time');
  if (e.notes && String(e.notes).length > 1000) throw new Error('Notes are too long');
  checkNumber_(e.percent, 0, 100, 'Percent');
  checkNumber_(e.confidence, 1, 5, 'Confidence');
  checkNumber_(e.amountStartMl, 0, Infinity, 'Amount offered');
  checkNumber_(e.amountEndMl, 0, Infinity, 'Amount left over');
  checkNumber_(e.doseMg, 0, Infinity, 'Dose');
  // Stored in °C. Anything outside this range is a typo, most likely °F typed as °C.
  checkNumber_(e.tempC, 30, 44, 'Temperature');
  if (e.type === 'temp' && (e.tempC === undefined || e.tempC === null || e.tempC === '')) throw new Error('Missing temperature');
}

function checkNumber_(v, min, max, name) {
  if (v === undefined || v === null || v === '') return;
  var n = Number(v);
  if (isNaN(n) || n < min || n > max) {
    throw new Error(name + (max === Infinity ? " can't be negative" : ' must be between ' + min + ' and ' + max));
  }
}

function saveEvent_(input, user) {
  validate_(input);
  var sheet = eventsSheet_();
  var now = new Date().toISOString();
  var row = findRow_(input.id);
  var event;
  if (row) {
    event = rowToEvent_(sheet.getRange(row, 1, 1, EVENT_HEADERS.length).getValues()[0]);
    // Editing an entry someone else deleted would save into a hidden row and look like it worked.
    if (truthy_(event.deleted)) throw new Error('This entry was deleted on another phone.');
    EDITABLE_FIELDS.forEach(function (f) { event[f] = input[f]; });
    event.updatedAt = now;
    event.updatedBy = user;
    sheet.getRange(row, 1, 1, EVENT_HEADERS.length).setValues([eventToRow_(event)]);
  } else {
    event = { id: String(input.id || Utilities.getUuid()), by: user, createdAt: now, updatedAt: now };
    EDITABLE_FIELDS.forEach(function (f) { event[f] = input[f]; });
    sheet.appendRow(eventToRow_(event));
  }
  delete event.deleted;
  return { event: event, created: !row };
}

function deleteEvent_(id, user) {
  var row = findRow_(id);
  if (!row) return true;
  // Soft delete so a mistaken delete can be recovered from the Sheet.
  var sheet = eventsSheet_();
  sheet.getRange(row, EVENT_HEADERS.indexOf('deleted') + 1).setValue(true);
  sheet.getRange(row, EVENT_HEADERS.indexOf('updatedBy') + 1).setValue(user);
  sheet.getRange(row, EVENT_HEADERS.indexOf('updatedAt') + 1).setValue(new Date());
  return true;
}

// ---------------------------------------------------------------------------
// Discord

var LABELS = {
  left: 'Left breast', right: 'Right breast', both: 'Both breasts', formula: 'Formula', expressed: 'Expressed milk',
  wet: 'Wet diaper', stool: 'Stool diaper', dry: 'Diaper check (clean)',
  ibuprofen: 'Ibuprofen', tylenol: 'Tylenol', probiotic: 'Probiotics', vitamind: 'Vitamin D',
};

function label_(e) {
  if (e.type === 'diaper' && e.kind === 'both') return 'Wet + stool diaper';
  if (e.type === 'temp') {
    var f = Math.round((Number(e.tempC) * 9 / 5 + 32) * 10) / 10;
    return 'Temperature ' + f + ' °F (' + e.kind + ')';
  }
  return LABELS[e.kind] || e.kind;
}

/** Discord renders these in each reader's own time zone. */
function ts_(ms, style) {
  return '<t:' + Math.floor(ms / 1000) + ':' + (style || 't') + '>';
}

function postDiscord_(content, settings) {
  var s = settings || settingsWithDefaults_();
  var url = String(s.discordWebhook || '').trim();
  if (!url) return false;
  var res = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({
      content: content,
      username: s.babyName + ' tracker',
      // A name or note containing @everyone or a role mention can't ping the whole server.
      allowed_mentions: { parse: [] },
    }),
    muteHttpExceptions: true,
  });
  return res.getResponseCode() < 300;
}

function announce_(e) {
  var s = settingsWithDefaults_();
  if (!truthy_(s.announceEntries)) return;
  try {
    postDiscord_('📝 ' + e.by + ' logged **' + label_(e) + '** at ' + ts_(new Date(e.start).getTime()), s);
  } catch (err) {
    Logger.log(err);
  }
}

function truthy_(v) {
  return v === true || String(v).toUpperCase() === 'TRUE';
}

function testDiscord() {
  var ok = postDiscord_('👋 The baby tracker can post here. Reminders will show up in this channel.');
  toast_(ok ? 'Sent! Check your Discord channel.' : 'Nothing sent. Paste the webhook URL into Settings → discordWebhook first.');
}

function enableReminders() {
  var s = settingsWithDefaults_();
  if (!String(s.discordWebhook || '').trim() && !String(s.haWebhookUrl || '').trim() && !pushSubs_().length) {
    toast_('Turn on notifications in the app (Settings → Notifications), or paste a Discord webhook URL into Settings → discordWebhook or a Home Assistant one into haWebhookUrl, then turn reminders on.');
    return;
  }
  disableReminders();
  ScriptApp.newTrigger('checkReminders').timeBased().everyMinutes(5).create();
  toast_('Reminders are on. They are checked every 5 minutes.');
}

/** The menu item. disableReminders stays silent so enableReminders can reuse it. */
function turnOffReminders() {
  disableReminders();
  toast_('Reminders are off.');
}

function disableReminders() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'checkReminders') ScriptApp.deleteTrigger(t);
  });
}

function latest_(events, pred) {
  var best = null;
  events.forEach(function (e) {
    if (pred(e) && (!best || new Date(e.start) > new Date(best.start))) best = e;
  });
  return best;
}

/** Matches STALE_TIMER_MS in the app's src/lib/derive.ts. */
var STALE_TIMER_H = 3;

/** Runs every 5 minutes from a trigger. Each reminder is sent once per entry. */
function checkReminders() {
  var s = settingsWithDefaults_();
  var light = !!String(s.haWebhookUrl || '').trim();
  var discord = !!String(s.discordWebhook || '').trim();
  var phones = pushSubs_().length > 0;
  if (!discord && !light && !phones) return;
  var H = 3600000;
  var now = Date.now();
  var events = listEvents_(3);

  // The app usually asks for the light first, the moment the limit passes. This catches it when no phone has
  // the app open. Two caregivers can each have a timer going, the same as the app.
  if (light) {
    events.forEach(function (e) {
      if (e.type !== 'feeding' || e.end) return;
      try {
        flashLight_(e, s, now);
      } catch (err) {
        // A busy Sheet shouldn't hold up the Discord reminders. The next check tries again.
        Logger.log(err);
      }
    });
  }
  var props = PropertiesService.getScriptProperties();
  var sent = JSON.parse(props.getProperty('sentReminders') || '[]');
  var messages = [];

  function once(key, due, message) {
    // Skip anything more than 6 hours stale, e.g. right after reminders are first turned on.
    if (now < due || now - due > 6 * H || sent.indexOf(key) >= 0) return;
    sent.push(key);
    messages.push({ key: key, text: message });
  }

  if (truthy_(s.remindFeeding)) {
    var feed = latest_(events, function (e) { return e.type === 'feeding'; });
    if (feed && !feed.end) {
      // Still going: no window yet, the same as the app. A timer this old was probably never stopped.
      var startedAt = new Date(feed.start).getTime();
      once('feedstale:' + feed.id, startedAt + STALE_TIMER_H * H,
        '⏱️ Feeding timer has been running ' + STALE_TIMER_H + ' hours. Did someone forget to stop it?');
      // Matches breastLimit() in the app: a "both sides" feed gets the limit on each side.
      var limit = Number(s.breastLimitMin) || 0;
      var breast = feed.kind === 'left' || feed.kind === 'right' || feed.kind === 'both';
      if (limit > 0 && breast) {
        if (feed.kind === 'both') {
          once('feedswitch:' + feed.id, startedAt + limit * 60000,
            '🔄 ' + limit + ' minutes on the first side. Time to switch breasts.');
        }
        var sides = feed.kind === 'both' ? 2 : 1;
        once('feedlimit:' + feed.id, startedAt + sides * limit * 60000,
          '⏰ ' + label_(feed) + ' feed has passed ' + (sides * limit) + ' minutes (started ' + ts_(startedAt) + '). Time to wrap up.');
      }
    } else if (feed) {
      var ended = new Date(feed.end).getTime();
      var by = ended + Number(s.feedMaxH) * H;
      var key = feed.id + ':' + ended;
      once('feedopen:' + key, ended + Number(s.feedMinH) * H,
        '🍼 Feeding window is open. Last feed (' + label_(feed) + ') ended ' + ts_(ended) + ', next one due by ' + ts_(by) + '.');
      once('feeddue:' + key, by,
        '⏰ Feeding is due now. It has been ' + s.feedMaxH + ' hours since the last one ended at ' + ts_(ended) + '.');
    }
  }

  if (truthy_(s.remindDiaper)) {
    var check = latest_(events, function (e) { return e.type === 'diaper'; });
    if (check) {
      var checkedAt = new Date(check.start).getTime();
      var wait = check.kind === 'dry' ? Number(s.diaperAfterCleanH) : Number(s.diaperAfterChangeH);
      once('diaper:' + check.id, checkedAt + wait * H,
        '🧷 Time for a diaper check. Last checked ' + ts_(checkedAt, 'R') + ' by ' + check.by + '.');
    }
  }

  if (truthy_(s.remindMeds)) {
    // Probiotics are once a day and stay out of the ibuprofen and Tylenol rotation.
    var med = latest_(events, function (e) { return e.type === 'med' && (e.kind === 'ibuprofen' || e.kind === 'tylenol'); });
    if (med) {
      var tookAt = new Date(med.start).getTime();
      var next = med.kind === 'ibuprofen' ? 'Tylenol' : 'Ibuprofen';
      once('med:' + med.id, tookAt + Number(s.medIntervalH) * H,
        '💊 Mom can take **' + next + '** now. Last dose was ' + label_(med) + ' at ' + ts_(tookAt) + '.');
    }
  }

  var tz = Session.getScriptTimeZone();
  var today = Utilities.formatDate(new Date(now), tz, 'yyyy-MM-dd');
  var hourNow = Number(Utilities.formatDate(new Date(now), tz, 'H'));
  [
    { kind: 'probiotic', hour: s.probioticReminderHour, message: "🌿 Probiotics have not been logged today. Has mom taken them?" },
    { kind: 'vitamind', hour: s.vitaminDReminderHour, message: '☀️ ' + s.babyName + "'s Vitamin D has not been logged today. Has it gone in a bottle?" },
  ].forEach(function (daily) {
    var hour = String(daily.hour).trim().toLowerCase();
    if (hour === 'off' || hour === 'none' || hourNow < Number(hour)) return;
    var taken = events.some(function (e) {
      return e.type === 'med' && e.kind === daily.kind && Utilities.formatDate(new Date(e.start), tz, 'yyyy-MM-dd') === today;
    });
    if (!taken) once(daily.kind + ':' + today, now, daily.message);
  });

  if (!messages.length) return;
  var delivered = false;
  if (discord) {
    try {
      delivered = postDiscord_(messages.map(function (m) { return m.text; }).join('\n'), s);
    } catch (err) {
      Logger.log(err);
    }
  }
  if (phones) {
    // One notification each, so a new feeding reminder replaces the last one instead of piling up.
    messages.forEach(function (m) {
      var tag = PUSH_TAGS[m.key.split(':')[0]] || 'reminder';
      if (pushAll_(plain_(m.text, now), tag, messages.length, s)) delivered = true;
    });
  }
  // Anything that reached nobody is tried again at the next check.
  if (delivered) props.setProperty('sentReminders', JSON.stringify(sent.slice(-100)));
}

/** Which notification a reminder replaces on the phone. */
var PUSH_TAGS = {
  feedstale: 'feed-timer', feedswitch: 'feed-timer', feedlimit: 'feed-timer',
  feedopen: 'feeding', feeddue: 'feeding',
  diaper: 'diaper', med: 'med', probiotic: 'probiotic', vitamind: 'vitamind',
};

// ---------------------------------------------------------------------------
// Phone notifications (Web Push)
//
// Each phone that turns on notifications in the app hands the Sheet a push address at Google (Android) or
// Apple (iPhone). Sending to it is free and needs no account, but the message must be encrypted for that phone
// (RFC 8291) and signed with this script's own key (VAPID, RFC 8292). Apps Script has no ECDSA, ECDH or AES,
// so that math is done below in plain JavaScript with BigInt.

/** How long a push service keeps trying a phone that's off. A reminder older than this isn't worth showing. */
var PUSH_TTL_S = 3600;

function pushSubs_() {
  return JSON.parse(PropertiesService.getScriptProperties().getProperty('pushSubs') || '[]');
}

function savePushSubs_(subs) {
  PropertiesService.getScriptProperties().setProperty('pushSubs', JSON.stringify(subs));
}

/** The script's VAPID key pair, made the first time a phone asks for it. Kept in Script Properties, not the Sheet. */
function vapidKeys_() {
  var props = PropertiesService.getScriptProperties();
  var saved = props.getProperty('vapidKeys');
  if (saved) return JSON.parse(saved);
  return withLock_(function () {
    var again = props.getProperty('vapidKeys');
    if (again) return JSON.parse(again);
    var pair = ecKeyPair_();
    var keys = { privateKey: b64url_(pair.d), publicKey: b64url_(pair.pub) };
    props.setProperty('vapidKeys', JSON.stringify(keys));
    return keys;
  });
}

function pushKey_() {
  return vapidKeys_().publicKey;
}

/** The app sends its push subscription (subscription.toJSON()) when notifications are turned on. */
function pushSubscribe_(input, user) {
  var sub = input || {};
  var keys = sub.keys || {};
  if (!/^https:\/\//.test(String(sub.endpoint || '')) || !keys.p256dh || !keys.auth) throw new Error('Missing push subscription');
  if (String(sub.endpoint).length > 1000) throw new Error('Push address is too long');
  // Fails early on a key that isn't a P-256 point, rather than at the first reminder.
  ecPoint_(b64urlDecode_(keys.p256dh));
  withLock_(function () {
    var subs = pushSubs_().filter(function (s) { return s.endpoint !== sub.endpoint; });
    subs.push({
      endpoint: String(sub.endpoint),
      p256dh: String(keys.p256dh),
      auth: String(keys.auth),
      user: user,
      device: String(sub.device || '').slice(0, 60),
      at: new Date().toISOString(),
    });
    // Script Properties hold 9 KB per value, about 20 phones. Old ones go first.
    savePushSubs_(subs.slice(-20));
  });
  return { reminders: remindersOn_() };
}

function pushUnsubscribe_(endpoint) {
  withLock_(function () {
    savePushSubs_(pushSubs_().filter(function (s) { return s.endpoint !== endpoint; }));
  });
  return true;
}

/** The app's "Send a test" button, to this phone only. */
function pushTest_(endpoint, user) {
  var sub = pushSubs_().filter(function (s) { return s.endpoint === endpoint; })[0];
  if (!sub) throw new Error('This phone is not signed up for notifications. Turn them off and on again.');
  var s = settingsWithDefaults_();
  var status = sendPush_(sub, pushPayload_(s, '👋 Notifications work, ' + user + '. Reminders will show up like this.', 'test'));
  if (status === 404 || status === 410) dropPushSubs_([endpoint]);
  if (status >= 300) throw new Error('The push service refused it (' + status + '). Turn notifications off and on again.');
  return true;
}

/** Whether the 5-minute check is on, or null before the script has been allowed to look (menu item 3 asks). */
function remindersOn_() {
  try {
    return ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === 'checkReminders'; });
  } catch (err) {
    return null;
  }
}

/**
 * Discord's text, readable on a lock screen: no **bold**, and Discord's <t:…> timestamps as clock times in the
 * script's time zone (Project Settings in the Apps Script editor).
 */
function plain_(text, now) {
  var tz = Session.getScriptTimeZone();
  return String(text).replace(/\*\*/g, '').replace(/<t:(\d+):([a-zA-Z])>/g, function (_, secs, style) {
    var ms = Number(secs) * 1000;
    if (style !== 'R') return Utilities.formatDate(new Date(ms), tz, 'h:mm a');
    var mins = Math.round((now - ms) / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return mins + ' min ago';
    var h = Math.round(mins / 6) / 10;
    return h + (h === 1 ? ' hour ago' : ' hours ago');
  });
}

/**
 * A Declarative Web Push message (iOS 18.4 and later show it even if the app's code doesn't run). Every other
 * phone hands it to the app's service worker, which shows the same notification.
 */
function pushPayload_(s, body, tag, badge) {
  var notification = {
    title: String(s.babyName),
    body: body,
    navigate: String(s.appUrl),
    tag: tag,
    lang: 'en-US',
  };
  if (badge) notification.app_badge = badge;
  return JSON.stringify({ web_push: 8030, notification: notification });
}

/** Sends one message to every phone that turned notifications on. True if at least one took it. */
function pushAll_(body, tag, badge, s) {
  var subs = pushSubs_();
  if (!subs.length) return false;
  var payload = pushPayload_(s, body, tag, badge);
  var ok = false;
  var gone = [];
  subs.forEach(function (sub) {
    var status = 0;
    try {
      status = sendPush_(sub, payload);
    } catch (err) {
      Logger.log(err);
    }
    // The phone turned notifications off, or the app was removed from it.
    if (status === 404 || status === 410) gone.push(sub.endpoint);
    if (status >= 200 && status < 300) ok = true;
  });
  if (gone.length) dropPushSubs_(gone);
  return ok;
}

function dropPushSubs_(endpoints) {
  withLock_(function () {
    savePushSubs_(pushSubs_().filter(function (s) { return endpoints.indexOf(s.endpoint) < 0; }));
  });
}

/** VAPID tokens for this run, by push service, so several phones on one service share a signature. */
var vapidCache_ = {};

function sendPush_(sub, payload) {
  var keys = vapidKeys_();
  var aud = String(sub.endpoint).match(/^https:\/\/[^/]+/)[0];
  if (!vapidCache_[aud]) {
    // Apple wants a URL or mailto: for sub. The app's address needs no extra permission to read.
    var claims = { aud: aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: String(settingsWithDefaults_().appUrl) };
    vapidCache_[aud] = vapidJwt_(claims, b64urlDecode_(keys.privateKey));
  }
  var body = encryptPush_(utf8_(payload), b64urlDecode_(sub.p256dh), b64urlDecode_(sub.auth));
  var res = UrlFetchApp.fetch(sub.endpoint, {
    method: 'post',
    payload: Utilities.newBlob(signed_(body), 'application/octet-stream'),
    headers: {
      TTL: String(PUSH_TTL_S),
      Urgency: 'high',
      'Content-Encoding': 'aes128gcm',
      Authorization: 'vapid t=' + vapidCache_[aud] + ', k=' + keys.publicKey,
    },
    muteHttpExceptions: true,
  });
  var code = res.getResponseCode();
  if (code >= 300) Logger.log('Push to ' + aud + ' answered ' + code + ': ' + res.getContentText());
  return code;
}

/** Menu item. Sends a test notification to every phone that turned notifications on. */
function testPush() {
  var subs = pushSubs_();
  if (!subs.length) {
    toast_('No phones have notifications on yet. Turn them on in the app under Settings → Notifications.');
    return;
  }
  var ok = pushAll_('👋 Test from the Sheet. Reminders will show up like this.', 'test', 0, settingsWithDefaults_());
  var left = pushSubs_();
  toast_(ok
    ? 'Sent to ' + left.length + (left.length === 1 ? ' phone: ' : ' phones: ') + left.map(function (s) { return s.user + (s.device ? ' (' + s.device + ')' : ''); }).join(', ')
    : 'No phone accepted it. See Executions in the Apps Script editor for details.');
}

// --- Bytes. Arrays of numbers 0-255; Apps Script's own byte arrays are signed (-128 to 127).

function unsigned_(bytes) {
  return Array.prototype.map.call(bytes, function (b) { return b & 255; });
}

function signed_(bytes) {
  return bytes.map(function (b) { return b > 127 ? b - 256 : b; });
}

function utf8_(text) {
  return unsigned_(Utilities.newBlob(text).getBytes());
}

function b64url_(bytes) {
  return Utilities.base64EncodeWebSafe(signed_(bytes)).replace(/=+$/, '');
}

function b64urlDecode_(text) {
  var s = String(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  while (s.length % 4) s += '=';
  return unsigned_(Utilities.base64DecodeWebSafe(s));
}

function hmac_(key, data) {
  return unsigned_(Utilities.computeHmacSha256Signature(signed_(data), signed_(key)));
}

function sha256_(data) {
  return unsigned_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, signed_(data)));
}

/** HKDF-SHA-256 (RFC 5869) for up to 32 bytes of output. */
function hkdf_(salt, ikm, info, length) {
  return hmac_(hmac_(salt, ikm), info.concat([1])).slice(0, length);
}

/** Apps Script has no secure random API, but its UUIDs come from one. Hashed so each byte is uniform. */
function randomBytes_(n) {
  var out = [];
  while (out.length < n) out = out.concat(sha256_(utf8_(Utilities.getUuid() + Utilities.getUuid() + Date.now())));
  return out.slice(0, n);
}

function bytesToInt_(bytes) {
  var hex = bytes.map(function (b) { return (b < 16 ? '0' : '') + b.toString(16); }).join('');
  return BigInt('0x' + (hex || '0'));
}

function intToBytes_(n, length) {
  var hex = n.toString(16);
  while (hex.length < length * 2) hex = '0' + hex;
  var out = [];
  for (var i = 0; i < length * 2; i += 2) out.push(parseInt(hex.slice(i, i + 2), 16));
  return out;
}

// --- P-256. Made on first use, so a runtime without BigInt only breaks notifications, not the whole script.

var curveCache_ = null;

function curve_() {
  if (!curveCache_) {
    curveCache_ = {
      p: BigInt('0xffffffff00000001000000000000000000000000ffffffffffffffffffffffff'),
      n: BigInt('0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551'),
      b: BigInt('0x5ac635d8aa3a93e7b3ebbd55769886bc651d06b0cc53b0f63bce3c3e27d2604b'),
      g: {
        x: BigInt('0x6b17d1f2e12c4247f8bce6e563a440f277037d812deb33a0f4a13945d898c296'),
        y: BigInt('0x4fe342e2fe1a7f9b8ee7eb4a7c0f9e162bce33576b315ececbb6406837bf51f5'),
      },
    };
  }
  return curveCache_;
}

function mod_(a, m) {
  var r = a % m;
  return r < BigInt(0) ? r + m : r;
}

function inv_(a, m) {
  // Extended Euclid.
  var r0 = mod_(a, m), r1 = m, s0 = BigInt(1), s1 = BigInt(0);
  while (r1 !== BigInt(0)) {
    var q = r0 / r1;
    var t = r0 - q * r1; r0 = r1; r1 = t;
    t = s0 - q * s1; s0 = s1; s1 = t;
  }
  return mod_(s0, m);
}

/** Jacobian doubling for a = -3 (dbl-2001-b). Points are {x, y, z}; null is the point at infinity. */
function ecDouble_(P) {
  if (!P || P.y === BigInt(0)) return null;
  var p = curve_().p;
  var delta = P.z * P.z % p;
  var gamma = P.y * P.y % p;
  var beta = P.x * gamma % p;
  var alpha = BigInt(3) * mod_(P.x - delta, p) * (P.x + delta) % p;
  var x3 = mod_(alpha * alpha - BigInt(8) * beta, p);
  var z3 = mod_((P.y + P.z) * (P.y + P.z) - gamma - delta, p);
  var y3 = mod_(alpha * (BigInt(4) * beta - x3) - BigInt(8) * gamma * gamma, p);
  return { x: x3, y: y3, z: z3 };
}

/** Adds an affine point Q to a Jacobian point P (madd-2007-bl). */
function ecAddAffine_(P, Q) {
  if (!P) return { x: Q.x, y: Q.y, z: BigInt(1) };
  var p = curve_().p;
  var z1z1 = P.z * P.z % p;
  var u2 = Q.x * z1z1 % p;
  var s2 = Q.y * P.z % p * z1z1 % p;
  var h = mod_(u2 - P.x, p);
  var r = mod_(BigInt(2) * (s2 - P.y), p);
  if (h === BigInt(0)) return r === BigInt(0) ? ecDouble_(P) : null;
  var hh = h * h % p;
  var i = BigInt(4) * hh % p;
  var j = h * i % p;
  var v = P.x * i % p;
  var x3 = mod_(r * r - j - BigInt(2) * v, p);
  var y3 = mod_(r * (v - x3) - BigInt(2) * P.y * j, p);
  var z3 = mod_((P.z + h) * (P.z + h) - z1z1 - hh, p);
  return { x: x3, y: y3, z: z3 };
}

/** k·Q for an affine point Q, returned affine. */
function ecMul_(k, Q) {
  var R = null;
  var bits = k.toString(2);
  for (var i = 0; i < bits.length; i++) {
    R = ecDouble_(R);
    if (bits[i] === '1') R = ecAddAffine_(R, Q);
  }
  if (!R) throw new Error('Point at infinity');
  var p = curve_().p;
  var zi = inv_(R.z, p);
  var zi2 = zi * zi % p;
  return { x: R.x * zi2 % p, y: R.y * zi2 % p * zi % p };
}

/** An uncompressed public key (0x04 || x || y), checked to be on the curve. */
function ecPoint_(bytes) {
  var c = curve_();
  if (bytes.length !== 65 || bytes[0] !== 4) throw new Error('Not a P-256 public key');
  var x = bytesToInt_(bytes.slice(1, 33));
  var y = bytesToInt_(bytes.slice(33));
  var rhs = mod_(x * x % c.p * x - BigInt(3) * x + c.b, c.p);
  if (x >= c.p || y >= c.p || y * y % c.p !== rhs) throw new Error('Not a P-256 public key');
  return { x: x, y: y };
}

function ecEncode_(P) {
  return [4].concat(intToBytes_(P.x, 32), intToBytes_(P.y, 32));
}

function ecKeyPair_() {
  var n = curve_().n;
  var d;
  do d = bytesToInt_(randomBytes_(32)); while (d === BigInt(0) || d >= n);
  return { d: intToBytes_(d, 32), pub: ecEncode_(ecMul_(d, curve_().g)) };
}

/** ECDSA P-256 with SHA-256 and a deterministic nonce (RFC 6979). Returns r || s, as JWTs want it. */
function ecdsaSign_(message, dBytes) {
  var c = curve_();
  var d = bytesToInt_(dBytes);
  var h = sha256_(message);
  var z = bytesToInt_(h);
  var x = intToBytes_(d, 32);
  var h1 = intToBytes_(mod_(z, c.n), 32);
  var V = [], K = [];
  for (var i = 0; i < 32; i++) { V.push(1); K.push(0); }
  K = hmac_(K, V.concat([0], x, h1));
  V = hmac_(K, V);
  K = hmac_(K, V.concat([1], x, h1));
  V = hmac_(K, V);
  for (;;) {
    V = hmac_(K, V);
    var k = bytesToInt_(V);
    if (k > BigInt(0) && k < c.n) {
      var r = mod_(ecMul_(k, c.g).x, c.n);
      var s = mod_(inv_(k, c.n) * (z + r * d), c.n);
      if (r !== BigInt(0) && s !== BigInt(0)) return intToBytes_(r, 32).concat(intToBytes_(s, 32));
    }
    K = hmac_(K, V.concat([0]));
    V = hmac_(K, V);
  }
}

function vapidJwt_(claims, dBytes) {
  var input = b64url_(utf8_(JSON.stringify({ typ: 'JWT', alg: 'ES256' }))) + '.' + b64url_(utf8_(JSON.stringify(claims)));
  return input + '.' + b64url_(ecdsaSign_(utf8_(input), dBytes));
}

// --- AES-128-GCM, encryption only.

var aes_ = null;

function aesTables_() {
  if (aes_) return aes_;
  var sbox = [], exp = [], log = [];
  for (var i = 0, x = 1; i < 256; i++) {
    exp[i] = x;
    log[x] = i;
    x ^= (x << 1) ^ (x & 128 ? 0x11b : 0);
  }
  sbox[0] = 0x63;
  for (i = 1; i < 256; i++) {
    var inv = exp[255 - log[i]];
    var s = inv;
    for (var k = 0; k < 4; k++) {
      inv = ((inv << 1) | (inv >> 7)) & 255;
      s ^= inv;
    }
    sbox[i] = s ^ 0x63;
  }
  aes_ = { sbox: sbox };
  return aes_;
}

function aesExpandKey_(key) {
  var sbox = aesTables_().sbox;
  var w = key.slice();
  var rcon = 1;
  for (var i = 16; i < 176; i += 4) {
    var t = w.slice(i - 4, i);
    if (i % 16 === 0) {
      t = [sbox[t[1]] ^ rcon, sbox[t[2]], sbox[t[3]], sbox[t[0]]];
      rcon = (rcon << 1) ^ (rcon & 128 ? 0x11b : 0);
    }
    for (var j = 0; j < 4; j++) w[i + j] = w[i - 16 + j] ^ t[j];
  }
  return w;
}

function xtime_(b) {
  return ((b << 1) ^ (b & 128 ? 0x11b : 0)) & 255;
}

function aesBlock_(w, input) {
  var sbox = aesTables_().sbox;
  var s = [];
  for (var i = 0; i < 16; i++) s[i] = input[i] ^ w[i];
  for (var round = 1; round <= 10; round++) {
    // SubBytes and ShiftRows. The state is column-major: byte r + 4c is row r of column c.
    var t = [];
    for (var c = 0; c < 4; c++) for (var r = 0; r < 4; r++) t[r + 4 * c] = sbox[s[r + 4 * ((c + r) % 4)]];
    if (round < 10) {
      for (c = 0; c < 4; c++) {
        var a0 = t[4 * c], a1 = t[4 * c + 1], a2 = t[4 * c + 2], a3 = t[4 * c + 3];
        var all = a0 ^ a1 ^ a2 ^ a3;
        t[4 * c] = a0 ^ all ^ xtime_(a0 ^ a1);
        t[4 * c + 1] = a1 ^ all ^ xtime_(a1 ^ a2);
        t[4 * c + 2] = a2 ^ all ^ xtime_(a2 ^ a3);
        t[4 * c + 3] = a3 ^ all ^ xtime_(a3 ^ a0);
      }
    }
    for (i = 0; i < 16; i++) s[i] = t[i] ^ w[16 * round + i];
  }
  return s;
}

/** Multiplication in GCM's GF(2^128), on 16-byte blocks held as BigInt. */
function gfMul_(x, y) {
  var R = BigInt('0xe1') << BigInt(120);
  var one = BigInt(1);
  var z = BigInt(0);
  var v = y;
  for (var i = 127; i >= 0; i--) {
    if ((x >> BigInt(i)) & one) z ^= v;
    v = v & one ? (v >> one) ^ R : v >> one;
  }
  return z;
}

/** AES-128-GCM with a 12-byte nonce and no associated data. Returns ciphertext || 16-byte tag. */
function aesGcm_(key, nonce, plaintext) {
  var w = aesExpandKey_(key);
  var zero = [];
  for (var i = 0; i < 16; i++) zero.push(0);
  var H = bytesToInt_(aesBlock_(w, zero));
  var counter = 1;
  function ctr() {
    return nonce.concat([(counter >>> 24) & 255, (counter >>> 16) & 255, (counter >>> 8) & 255, counter & 255]);
  }
  var tagMask = aesBlock_(w, ctr());
  var out = [];
  var ghash = BigInt(0);
  for (i = 0; i < plaintext.length; i += 16) {
    counter++;
    var ks = aesBlock_(w, ctr());
    var chunk = plaintext.slice(i, i + 16).map(function (b, j) { return b ^ ks[j]; });
    out = out.concat(chunk);
    var padded = chunk.concat(zero).slice(0, 16);
    ghash = gfMul_(ghash ^ bytesToInt_(padded), H);
  }
  var lengths = intToBytes_(BigInt(0), 8).concat(intToBytes_(BigInt(plaintext.length * 8), 8));
  ghash = gfMul_(ghash ^ bytesToInt_(lengths), H);
  var tag = intToBytes_(ghash, 16).map(function (b, j) { return b ^ tagMask[j]; });
  return out.concat(tag);
}

/**
 * Encrypts a push message for one phone (RFC 8291, aes128gcm). `seed` is only for tests: a fixed
 * { d, salt } in place of the fresh key pair and salt each message gets.
 */
function encryptPush_(plaintext, uaPublic, authSecret, seed) {
  var ua = ecPoint_(uaPublic);
  var local = seed ? { d: seed.d, pub: ecEncode_(ecMul_(bytesToInt_(seed.d), curve_().g)) } : ecKeyPair_();
  var salt = seed ? seed.salt : randomBytes_(16);
  var shared = intToBytes_(ecMul_(bytesToInt_(local.d), ua).x, 32);
  var ikm = hkdf_(authSecret, shared, utf8_('WebPush: info').concat([0], uaPublic, local.pub), 32);
  var cek = hkdf_(salt, ikm, utf8_('Content-Encoding: aes128gcm').concat([0]), 16);
  var nonce = hkdf_(salt, ikm, utf8_('Content-Encoding: nonce').concat([0]), 12);
  var rs = 4096;
  if (plaintext.length + 17 > rs) throw new Error('Push message is too long');
  // 0x02 marks the last (and only) record.
  var header = salt.concat([0, 0, rs >> 8, rs & 255, local.pub.length], local.pub);
  return header.concat(aesGcm_(cek, nonce, plaintext.concat([2])));
}

// ---------------------------------------------------------------------------
// Home Assistant
//
// Settings → haWebhookUrl is a Home Assistant webhook trigger, reached from outside the house through Nabu Casa.
// An automation on that webhook flashes a light. See SETUP.md.

/** How late a light alert can still go out, e.g. when reminders are first turned on mid-feed. */
var LIGHT_LATE_MS = 15 * 60000;
/** Phone clocks run a little fast or slow, so the app may ask just before the Sheet's clock says it's time. */
var LIGHT_EARLY_MS = 2 * 60000;

/** The app asks for this the moment a timer passes the limit, so the light doesn't wait for the 5-minute check. */
function lightAlert_(id) {
  var row = findRow_(id);
  if (!row) return false;
  var feed = rowToEvent_(eventsSheet_().getRange(row, 1, 1, EVENT_HEADERS.length).getValues()[0]);
  if (truthy_(feed.deleted)) return false;
  return flashLight_(feed, settingsWithDefaults_(), Date.now());
}

/**
 * Calls the Home Assistant webhook once per feed, when a running breastfeed passes the limit. Matches
 * breastLimit() in the app: a "both sides" feed gets the limit on each side, so it flashes at twice it.
 */
function flashLight_(feed, s, now) {
  var url = String(s.haWebhookUrl || '').trim();
  var limit = Number(s.breastLimitMin) || 0;
  var breast = feed.kind === 'left' || feed.kind === 'right' || feed.kind === 'both';
  if (!url || !(limit > 0) || !breast || feed.type !== 'feeding' || feed.end) return false;
  var startedAt = new Date(feed.start).getTime();
  var minutes = (feed.kind === 'both' ? 2 : 1) * limit;
  var overAt = startedAt + minutes * 60000;
  if (now < overAt - LIGHT_EARLY_MS || now - overAt > LIGHT_LATE_MS) return false;

  // Claimed under the lock so the app on two phones and the 5-minute check can't all flash it.
  var props = PropertiesService.getScriptProperties();
  var key = 'light:' + feed.id;
  var claimed = withLock_(function () {
    var sent = JSON.parse(props.getProperty('lightAlerts') || '[]');
    if (sent.indexOf(key) >= 0) return false;
    sent.push(key);
    props.setProperty('lightAlerts', JSON.stringify(sent.slice(-50)));
    return true;
  });
  if (!claimed) return false;

  var ok = false;
  try {
    ok = postLight_(url, {
      event: 'breast_limit',
      baby: String(s.babyName),
      feedId: feed.id,
      side: label_(feed),
      minutes: minutes,
      startedAt: new Date(startedAt).toISOString(),
      by: feed.by || '',
    });
  } catch (err) {
    Logger.log(err);
  }
  if (!ok) {
    // Let the next try (the 5-minute check or another phone) have another go.
    withLock_(function () {
      var sent = JSON.parse(props.getProperty('lightAlerts') || '[]');
      props.setProperty('lightAlerts', JSON.stringify(sent.filter(function (k) { return k !== key; })));
    });
  }
  return ok;
}

function postLight_(url, payload) {
  var res = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  });
  if (res.getResponseCode() >= 300) Logger.log('Home Assistant answered ' + res.getResponseCode() + ': ' + res.getContentText());
  return res.getResponseCode() < 300;
}

// The reading light goes through Home Assistant's REST API with a long-lived access token. The token can do
// anything in Home Assistant, so it lives in Script Properties (not a Sheet cell), never goes to the phones,
// and the app can only switch and dim the one light in Settings → readingLight.

function haToken_() {
  return PropertiesService.getScriptProperties().getProperty('haToken') || '';
}

function haReady_(s) {
  return !!(String(s.haUrl || '').trim() && String(s.readingLight || '').trim() && haToken_());
}

function lightEntity_(s) {
  var entity = String(s.readingLight || '').trim();
  if (!/^light\.[a-z0-9_]+$/.test(entity)) throw new Error('Settings → readingLight should look like light.living_room_reading_light');
  return entity;
}

function haApi_(s, path, payload) {
  if (!haReady_(s)) throw new Error('The reading light is not set up. See SETUP.md, section 7.');
  var options = { method: payload ? 'post' : 'get', headers: { Authorization: 'Bearer ' + haToken_() }, muteHttpExceptions: true };
  if (payload) {
    options.contentType = 'application/json';
    options.payload = JSON.stringify(payload);
  }
  var res;
  try {
    res = UrlFetchApp.fetch(String(s.haUrl).trim().replace(/\/+$/, '') + path, options);
  } catch (err) {
    Logger.log(err);
    throw retryable_("Can't reach Home Assistant. Check Settings → haUrl, or try again in a moment.");
  }
  var code = res.getResponseCode();
  if (code === 401) throw new Error('Home Assistant refused the token. Save a new one with Baby tracker → Save Home Assistant token.');
  if (code === 404) throw new Error('Home Assistant has no ' + lightEntity_(s) + '. Check Settings → readingLight.');
  if (code >= 300) throw new Error('Home Assistant answered ' + code + '.');
  return JSON.parse(res.getContentText() || 'null');
}

/** The light's real state. Brightness is 1-100; while it's off, the brightness it last had from the app. */
function readingLight_() {
  var s = settingsWithDefaults_();
  var state = haApi_(s, '/api/states/' + lightEntity_(s));
  var props = PropertiesService.getScriptProperties();
  var raw = state.attributes && state.attributes.brightness;
  var brightness = raw ? Math.max(1, Math.round(raw / 2.55)) : Number(props.getProperty('readingLightBrightness')) || 50;
  return { on: state.state === 'on', brightness: brightness, available: state.state !== 'unavailable' };
}

/** The app's reading light switch and slider. Brightness is 1-100. */
function setLight_(input) {
  var s = settingsWithDefaults_();
  if (!input || typeof input.on !== 'boolean') throw new Error('Missing light state');
  var brightness = Math.round(Number(input.brightness));
  if (isNaN(brightness) || brightness < 1 || brightness > 100) throw new Error('Brightness must be between 1 and 100');
  var entity = lightEntity_(s);
  if (input.on) haApi_(s, '/api/services/light/turn_on', { entity_id: entity, brightness_pct: brightness });
  else haApi_(s, '/api/services/light/turn_off', { entity_id: entity });
  PropertiesService.getScriptProperties().setProperty('readingLightBrightness', String(brightness));
  // Some lights report their new state a moment after the call returns, so answer with what was asked for.
  return { on: input.on, brightness: brightness, available: true };
}

/** Menu item. Keeps the token out of the Sheet, where anyone the Sheet is shared with could read it. */
function saveHaToken() {
  var ui = SpreadsheetApp.getUi();
  var answer = ui.prompt(
    'Home Assistant token',
    'Paste a long-lived access token (Home Assistant → your profile → Security → Long-lived access tokens). ' +
      'It is saved in the script, not the Sheet. Leave this empty and click OK to remove the saved token.',
    ui.ButtonSet.OK_CANCEL
  );
  if (answer.getSelectedButton() !== ui.Button.OK) return;
  var token = answer.getResponseText().trim();
  var props = PropertiesService.getScriptProperties();
  if (!token) {
    props.deleteProperty('haToken');
    toast_('Home Assistant token removed. The app hides the reading light.');
    return;
  }
  props.setProperty('haToken', token);
  try {
    var light = readingLight_();
    toast_('Token saved. The reading light is ' + (light.on ? 'on at ' + light.brightness + '%' : 'off') + '.');
  } catch (err) {
    toast_('Token saved, but: ' + err.message);
  }
}

function testLight() {
  var s = settingsWithDefaults_();
  var url = String(s.haWebhookUrl || '').trim();
  if (!url) {
    toast_('Nothing sent. Paste the Home Assistant webhook URL into Settings → haWebhookUrl first.');
    return;
  }
  var ok = false;
  try {
    ok = postLight_(url, { event: 'test', baby: String(s.babyName) });
  } catch (err) {
    Logger.log(err);
  }
  toast_(ok
    ? 'Sent! The light should flash. If it does not, check the automation\'s webhook ID and its traces in Home Assistant.'
    : 'Home Assistant did not accept it. Check the URL in Settings → haWebhookUrl, and see Executions for details.');
}

// ---------------------------------------------------------------------------
// Appointments
//
// Appointments live in their own tab and are copied one way to a Google Calendar: the app creates, edits and
// deletes the calendar event, and changes made in Google Calendar are never read back (the next save from
// the app overwrites them).

var APPT_HEADERS = [
  'id', 'title', 'start', 'end', 'location', 'notes', 'by', 'createdAt', 'updatedAt', 'updatedBy', 'deleted',
  'calendarEventId', 'syncError', 'placeName',
];
var APPT_DATE_FIELDS = { start: true, end: true, createdAt: true, updatedAt: true };
var APPT_TEXT_FIELDS = { id: true, title: true, location: true, notes: true, by: true, updatedBy: true, placeName: true };
var APPT_EDITABLE_FIELDS = ['title', 'start', 'end', 'location', 'placeName', 'notes'];
/** Past appointments the app still shows. */
var APPT_PAST_DAYS = 90;

/** Menu item. Makes a calendar for appointments, or checks the one in Settings → calendarId. */
function setupCalendar() {
  var s = settingsWithDefaults_();
  var id = String(s.calendarId || '').trim();
  var cal = id ? CalendarApp.getCalendarById(id) : null;
  if (id && !cal) {
    toast_('No calendar found for Settings → calendarId. Clear the cell to make a new one, or paste a calendar ID from Google Calendar → Settings → Integrate calendar.');
    return;
  }
  if (!cal) {
    cal = CalendarApp.createCalendar(s.babyName + "'s appointments", { color: CalendarApp.Color.PINK });
    setSetting_('calendarId', cal.getId());
  }
  toast_('Appointments will show up in the "' + cal.getName() + '" calendar. Share it from Google Calendar so others see it too.');
}

/**
 * Menu item. Copies every upcoming appointment to the calendar again, e.g. after changing calendarId, and
 * refreshes past ones that are already there, e.g. after the title format changes.
 */
function resyncCalendar() {
  var cal = appointmentsCalendar_();
  if (!cal) {
    toast_('Run "Baby tracker → 4. Set up appointments calendar" first.');
    return;
  }
  var n = withLock_(function () {
    var sheet = appointmentsSheet_();
    if (sheet.getLastRow() < 2) return 0;
    var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, APPT_HEADERS.length).getValues();
    var count = 0;
    rows.forEach(function (row, i) {
      var a = rowToAppointment_(row);
      if (!a.id || !a.start || truthy_(a.deleted)) return;
      // Past appointments already in the calendar get refreshed too, but missing ones aren't added after the fact.
      if (!a.calendarEventId && new Date(a.end || a.start).getTime() < Date.now()) return;
      syncToCalendar_(a, cal);
      sheet.getRange(i + 2, 1, 1, APPT_HEADERS.length).setValues([appointmentToRow_(a)]);
      count++;
    });
    return count;
  });
  toast_(n === 1 ? '1 appointment copied.' : n + ' appointments copied.');
}

function setSetting_(key, value) {
  var sheet = SpreadsheetApp.getActive().getSheetByName('Settings');
  var rows = sheet.getLastRow() < 2 ? [] : sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues();
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i][0]).trim() === key) {
      sheet.getRange(i + 2, 2).setValue(value);
      return;
    }
  }
  var note = DEFAULT_SETTINGS.filter(function (r) { return r[0] === key; })[0];
  sheet.appendRow([key, value, note ? note[2] : '']);
}

function appointmentsCalendar_() {
  var id = String(settingsWithDefaults_().calendarId || '').trim();
  return id ? CalendarApp.getCalendarById(id) : null;
}

function appointmentsSheet_() {
  var sheet = SpreadsheetApp.getActive().getSheetByName('Appointments');
  if (!sheet) throw new Error('Run "Baby tracker → 1. Set up tabs and codes" in the Sheet to add the Appointments tab.');
  return sheet;
}

function rowToAppointment_(row) {
  var a = {};
  APPT_HEADERS.forEach(function (h, i) {
    var v = row[i];
    if (v === '' || v === null) return;
    if (APPT_DATE_FIELDS[h]) {
      var ms = time_(v);
      if (!ms) return;
      v = new Date(ms).toISOString();
    } else if (h !== 'deleted') v = String(v);
    a[h] = v;
  });
  return a;
}

function appointmentToRow_(a) {
  return APPT_HEADERS.map(function (h) {
    var v = a[h];
    if (v === undefined || v === null) return '';
    if (APPT_DATE_FIELDS[h]) return v ? new Date(v) : '';
    if (APPT_TEXT_FIELDS[h] && v !== '') return "'" + String(v);
    return v;
  });
}

/** What the app gets back: the row without the Sheet's bookkeeping. */
function clientAppointment_(a) {
  var out = {};
  Object.keys(a).forEach(function (k) {
    if (k !== 'deleted' && k !== 'calendarEventId') out[k] = a[k];
  });
  out.synced = Boolean(a.calendarEventId) && !a.syncError;
  return out;
}

function listAppointments_() {
  var sheet = appointmentsSheet_();
  if (sheet.getLastRow() < 2) return [];
  var since = Date.now() - APPT_PAST_DAYS * 86400000;
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, APPT_HEADERS.length).getValues()
    .map(rowToAppointment_)
    .filter(function (a) { return a.id && a.start && !truthy_(a.deleted) && new Date(a.start).getTime() >= since; })
    .map(clientAppointment_);
}

function findAppointmentRow_(id) {
  var sheet = appointmentsSheet_();
  if (!id || sheet.getLastRow() < 2) return 0;
  var hit = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).createTextFinder(String(id)).matchEntireCell(true).findNext();
  return hit ? hit.getRow() : 0;
}

function validateAppointment_(a) {
  if (!a) throw new Error('Missing appointment');
  if (!String(a.title || '').trim()) throw new Error('Give the appointment a name');
  if (String(a.title).length > 200) throw new Error('The name is too long');
  if (!a.start || isNaN(new Date(a.start).getTime())) throw new Error('Missing start time');
  if (a.end) {
    if (isNaN(new Date(a.end).getTime())) throw new Error('Bad end time');
    if (new Date(a.end) < new Date(a.start)) throw new Error('The appointment ends before it starts');
  }
  if (a.location && String(a.location).length > 500) throw new Error('The location is too long');
  if (a.notes && String(a.notes).length > 1000) throw new Error('Notes are too long');
}

function saveAppointment_(input, user) {
  validateAppointment_(input);
  var sheet = appointmentsSheet_();
  var now = new Date().toISOString();
  var row = findAppointmentRow_(input.id);
  var a;
  if (row) {
    a = rowToAppointment_(sheet.getRange(row, 1, 1, APPT_HEADERS.length).getValues()[0]);
    if (truthy_(a.deleted)) throw new Error('This appointment was deleted on another phone.');
    a.updatedAt = now;
    a.updatedBy = user;
  } else {
    a = { id: String(input.id || Utilities.getUuid()), by: user, createdAt: now, updatedAt: now };
  }
  APPT_EDITABLE_FIELDS.forEach(function (f) {
    var v = input[f];
    a[f] = typeof v === 'string' ? v.trim() : v;
  });
  // Save the row before touching the calendar, so a calendar problem never loses the appointment.
  if (!row) {
    sheet.appendRow(appointmentToRow_(a));
    row = sheet.getLastRow();
  }
  syncToCalendar_(a, appointmentsCalendar_());
  sheet.getRange(row, 1, 1, APPT_HEADERS.length).setValues([appointmentToRow_(a)]);
  return clientAppointment_(a);
}

function deleteAppointment_(id, user) {
  var row = findAppointmentRow_(id);
  if (!row) return true;
  var sheet = appointmentsSheet_();
  var a = rowToAppointment_(sheet.getRange(row, 1, 1, APPT_HEADERS.length).getValues()[0]);
  if (a.calendarEventId) {
    try {
      var cal = appointmentsCalendar_();
      var ev = cal && cal.getEventById(a.calendarEventId);
      if (ev) ev.deleteEvent();
    } catch (err) {
      Logger.log('Could not remove calendar event for appointment ' + id + ': ' + err);
    }
  }
  // Soft delete like Events, so a mistaken delete can be recovered from the Sheet.
  a.deleted = true;
  a.updatedAt = new Date().toISOString();
  a.updatedBy = user;
  sheet.getRange(row, 1, 1, APPT_HEADERS.length).setValues([appointmentToRow_(a)]);
  return true;
}

/** "Carolina - Two-week checkup", so the baby's appointments stand out in a shared calendar. The app keeps the plain title. */
function calendarTitle_(a) {
  var prefix = String(settingsWithDefaults_().babyName || '').trim();
  return prefix ? prefix + ' - ' + a.title : a.title;
}

/** Create or update the calendar event for `a`, recording its ID or what went wrong on `a`. */
function syncToCalendar_(a, cal) {
  if (!cal) {
    a.syncError = 'No calendar set up yet';
    return;
  }
  try {
    var start = new Date(a.start);
    // Without an end time the calendar shows an hour.
    var end = a.end ? new Date(a.end) : new Date(start.getTime() + 3600000);
    if (end.getTime() === start.getTime()) end = new Date(start.getTime() + 15 * 60000);
    var description = (a.placeName ? 'At ' + a.placeName + '\n\n' : '') + (a.notes ? a.notes + '\n\n' : '') +
      'Added by ' + a.by + ' in the baby tracker app. Edit it there: changes made in Google Calendar get overwritten.';
    var ev = a.calendarEventId ? cal.getEventById(a.calendarEventId) : null;
    if (ev) {
      ev.setTitle(calendarTitle_(a));
      ev.setTime(start, end);
      ev.setLocation(a.location || '');
      ev.setDescription(description);
    } else {
      // Also covers an event someone deleted by hand in Google Calendar: the app's copy wins.
      ev = cal.createEvent(calendarTitle_(a), start, end, { location: a.location || '', description: description });
    }
    a.calendarEventId = ev.getId();
    a.syncError = '';
  } catch (err) {
    a.syncError = String(err && err.message ? err.message : err).slice(0, 200);
    Logger.log('Calendar sync failed for appointment ' + a.id + ': ' + a.syncError);
  }
}

// ---------------------------------------------------------------------------
// Saved places
//
// Names and addresses picked when making an appointment, e.g. "Pediatrician" at "123 Main St". The address is
// what goes into the calendar event's location, so Google Calendar can open it in Maps.

var PLACE_HEADERS = ['id', 'name', 'address', 'by', 'createdAt'];

function placesSheet_() {
  var sheet = SpreadsheetApp.getActive().getSheetByName('Places');
  if (!sheet) throw new Error('Run "Baby tracker → 1. Set up tabs and codes" in the Sheet to add the Places tab.');
  return sheet;
}

function listPlaces_() {
  var sheet = placesSheet_();
  if (sheet.getLastRow() < 2) return [];
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, 3).getValues()
    .filter(function (r) { return r[0] && r[1]; })
    .map(function (r) { return { id: String(r[0]), name: String(r[1]), address: String(r[2]) }; });
}

function findPlaceRow_(id) {
  var sheet = placesSheet_();
  if (!id || sheet.getLastRow() < 2) return 0;
  var hit = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).createTextFinder(String(id)).matchEntireCell(true).findNext();
  return hit ? hit.getRow() : 0;
}

function savePlace_(input, user) {
  var name = String((input && input.name) || '').trim();
  var address = String((input && input.address) || '').trim();
  if (!name) throw new Error('Give the place a name');
  if (name.length > 100) throw new Error('The name is too long');
  if (address.length > 500) throw new Error('The address is too long');
  var sheet = placesSheet_();
  var row = findPlaceRow_(input.id);
  var place = { id: String(input.id || Utilities.getUuid()), name: name, address: address };
  if (row) {
    sheet.getRange(row, 2, 1, 2).setValues([["'" + name, address ? "'" + address : '']]);
  } else {
    sheet.appendRow(["'" + place.id, "'" + name, address ? "'" + address : '', "'" + user, new Date()]);
  }
  return place;
}

/** Places are just shortcuts, so they're removed outright. Appointments keep the address they were saved with. */
function deletePlace_(id) {
  var row = findPlaceRow_(id);
  if (row) placesSheet_().deleteRow(row);
  return true;
}
