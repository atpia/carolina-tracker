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
  'confidence', 'notes', 'by', 'createdAt', 'updatedAt', 'updatedBy', 'deleted', 'doseMg',
];
var USER_HEADERS = ['name', 'code', 'active', 'setupLink'];
var DEFAULT_SETTINGS = [
  ['babyName', 'Carolina', 'Shown at the top of the app'],
  ['feedMinH', 2, 'Hours after a feeding ends when the next window opens'],
  ['feedMaxH', 4, 'Hours after a feeding ends when the next one is due'],
  ['medIntervalH', 4, "Hours between mom's doses (alternating ibuprofen and Tylenol)"],
  ['diaperAfterChangeH', 2, 'Hours until the next diaper check after a wet or stool diaper'],
  ['diaperAfterCleanH', 1, 'Hours until the next check after one that found the diaper clean'],
  ['targetFeedsPerDay', 0, 'Daily feeding goal shown on the Today card (0 hides it)'],
  ['targetWetPerDay', 0, 'Daily wet diaper goal shown on the Today card (0 hides it)'],
  ['appUrl', 'https://atpia.github.io/carolina-tracker/', 'Where the app is hosted, used for setup links'],
  ['apiUrl', '', 'Web app URL from Deploy → Manage deployments (ends in /exec), used for setup links'],
  ['discordWebhook', '', 'Discord channel webhook URL for reminders (leave blank for none)'],
  ['remindFeeding', true, 'Discord alert when the feeding window opens and when it is overdue'],
  ['remindDiaper', true, 'Discord alert when a diaper check is due'],
  ['remindMeds', true, "Discord alert when mom's next dose is due"],
  ['probioticReminderHour', 20, "Hour of the day (0-23, so 20 is 8 PM) for a Discord nudge if mom's probiotics are not logged yet that day. Type off for none"],
  ['announceEntries', false, 'Also post every new entry to Discord'],
];
var DATE_FIELDS = { start: true, end: true, createdAt: true, updatedAt: true };
var TEXT_FIELDS = { id: true, type: true, kind: true, notes: true, by: true, updatedBy: true };
var NUMBER_FIELDS = { amountStartMl: true, amountEndMl: true, percent: true, confidence: true, doseMg: true };
var EDITABLE_FIELDS = [
  'type', 'kind', 'start', 'end', 'amountStartMl', 'amountEndMl', 'percent', 'confidence', 'doseMg', 'notes',
];
var KINDS = {
  feeding: { left: true, right: true, both: true, formula: true, expressed: true },
  diaper: { wet: true, stool: true, both: true, dry: true },
  med: { ibuprofen: true, tylenol: true, probiotic: true },
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
    .addItem('3. Turn on Discord reminders', 'enableReminders')
    .addSeparator()
    .addItem('Send a test Discord message', 'testDiscord')
    .addItem('Turn off Discord reminders', 'turnOffReminders')
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
  ibuprofen: 'Ibuprofen', tylenol: 'Tylenol', probiotic: 'Probiotics',
};

function label_(e) {
  if (e.type === 'diaper' && e.kind === 'both') return 'Wet + stool diaper';
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
  if (!String(settingsWithDefaults_().discordWebhook || '').trim()) {
    toast_('Paste a Discord webhook URL into Settings → discordWebhook first, then turn reminders on.');
    return;
  }
  disableReminders();
  ScriptApp.newTrigger('checkReminders').timeBased().everyMinutes(5).create();
  toast_('Discord reminders are on. They are checked every 5 minutes.');
}

/** The menu item. disableReminders stays silent so enableReminders can reuse it. */
function turnOffReminders() {
  disableReminders();
  toast_('Discord reminders are off.');
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
  if (!String(s.discordWebhook || '').trim()) return;
  var H = 3600000;
  var now = Date.now();
  var events = listEvents_(3);
  var props = PropertiesService.getScriptProperties();
  var sent = JSON.parse(props.getProperty('sentReminders') || '[]');
  var messages = [];

  function once(key, due, message) {
    // Skip anything more than 6 hours stale, e.g. right after reminders are first turned on.
    if (now < due || now - due > 6 * H || sent.indexOf(key) >= 0) return;
    sent.push(key);
    messages.push(message);
  }

  if (truthy_(s.remindFeeding)) {
    var feed = latest_(events, function (e) { return e.type === 'feeding'; });
    if (feed && !feed.end) {
      // Still going: no window yet, the same as the app. A timer this old was probably never stopped.
      once('feedstale:' + feed.id, new Date(feed.start).getTime() + STALE_TIMER_H * H,
        '⏱️ Feeding timer has been running ' + STALE_TIMER_H + ' hours. Did someone forget to stop it?');
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
    var med = latest_(events, function (e) { return e.type === 'med' && e.kind !== 'probiotic'; });
    if (med) {
      var tookAt = new Date(med.start).getTime();
      var next = med.kind === 'ibuprofen' ? 'Tylenol' : 'Ibuprofen';
      once('med:' + med.id, tookAt + Number(s.medIntervalH) * H,
        '💊 Mom can take **' + next + '** now. Last dose was ' + label_(med) + ' at ' + ts_(tookAt) + '.');
    }
  }

  var probioticHour = String(s.probioticReminderHour).trim().toLowerCase();
  if (probioticHour !== 'off' && probioticHour !== 'none') {
    var tz = Session.getScriptTimeZone();
    var today = Utilities.formatDate(new Date(now), tz, 'yyyy-MM-dd');
    var hourNow = Number(Utilities.formatDate(new Date(now), tz, 'H'));
    var taken = events.some(function (e) {
      return e.type === 'med' && e.kind === 'probiotic' && Utilities.formatDate(new Date(e.start), tz, 'yyyy-MM-dd') === today;
    });
    if (!taken && hourNow >= Number(probioticHour)) {
      once('probiotic:' + today, now, '🌿 Probiotics have not been logged today. Has mom taken them?');
    }
  }

  if (messages.length && postDiscord_(messages.join('\n'), s)) {
    props.setProperty('sentReminders', JSON.stringify(sent.slice(-100)));
  }
}
