/* ============================================================
 * NotesSummarize.gs - Internal Note Helper backend (Option B)
 *
 * FREE AI: uses Google Gemini (no credit card needed).
 * Get a free key at https://aistudio.google.com -> Create API key.
 * Add it as Script Property:  LLM_API_KEY = <your Gemini key (AIza...)>
 *
 * Deploy: Apps Script editor -> New project -> paste this -> Deploy ->
 *   New deployment -> Web app -> Execute as: Me ->
 *   Who has access: Anyone -> Deploy -> copy the /exec URL
 *   and paste it into config.js as DASHBOARD_CONFIG.notesWebAppUrl.
 *
 * The LLM API key lives ONLY here, in Script Properties. It is NEVER
 * sent to the browser. The dashboard only POSTs the raw notes.
 *
 * Channel is forced to 'Aircall' per the team requirement.
 * The function returns ONLY the 5-line internal-note format:
 *   || Channel: Aircall
 *   || Customer Name: ...
 *   || Email: ...
 *   || Complaint: ...
 *   || Resolution: ...
 * ============================================================ */

var NOTES_PROP_KEY = 'LLM_API_KEY';

// Default model: Gemini 2.0 Flash (free tier, strong at strict formatting).
// Change to 'gemini-1.5-flash' if you prefer.
var GEMINI_MODEL = 'gemini-2.0-flash';

function doGet(e) {
  return ContentService.createTextOutput('Note Helper API. POST action=summarizeNotes.')
    .setMimeType(ContentService.MimeType.TEXT);
}

function doPost(e) {
  try {
    var payload = _parseBody(e);
    var action = payload.action || (payload.payload && payload.payload.action);
    if (action !== 'summarizeNotes') {
      return _json({ ok: false, error: 'Unknown action.' });
    }
    var notes = (payload.notes || (payload.payload && payload.payload.notes) || '').toString().trim();
    if (!notes) return _json({ ok: false, error: 'No notes provided.' });

    var text = summarizeNotes(notes);
    return _json({ ok: true, text: text });
  } catch (err) {
    return _json({ ok: false, error: String(err && err.message ? err.message : err) });
  }
}

/* Calls Gemini (free) server-side and returns the || format. */
function summarizeNotes(notes) {
  var apiKey = PropertiesService.getScriptProperties().getProperty(NOTES_PROP_KEY) || '';
  if (!apiKey) {
    // Graceful fallback if no key is set yet.
    return '|| Channel: Aircall\n|| Customer Name: \n|| Email: \n|| Complaint: ' +
      notes.replace(/\s+/g, ' ').trim() + '\n|| Resolution: ';
  }

  notes = notes.replace(/\s+/g, ' ').trim();
  var system =
    'You are a senior customer-support note writer for a hearing-aid call center. ' +
    'You are given an agent’s raw notes or a FULL call transcript (which may be messy, long, or full of filler). ' +
    'Condense it into a SHORT BUT DETAILED internal note. Preserve concrete specifics: ' +
    'customer name, email, product/model, the exact issue, any error messages, and the precise ' +
    'resolution steps taken. Drop chit-chat and repetition. ' +
    'Return EXACTLY five lines in this format and nothing else:\n' +
    '|| Channel: Aircall\n' +
    '|| Customer Name: <customer full name if present, else empty>\n' +
    '|| Email: <customer email if present, else empty>\n' +
    '|| Complaint: <1-2 sentences: what went wrong, with key specifics>\n' +
    '|| Resolution: <1-2 sentences: exactly what was done/fixed>\n' +
    'Channel is ALWAYS "Aircall". Never add extra lines, headers, or commentary.';

  var url = 'https://generativelanguage.googleapis.com/v1beta/models/' +
    GEMINI_MODEL + ':generateContent?key=' + apiKey;
  var body = {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: 'user', parts: [{ text: notes }] }],
    generationConfig: { temperature: 0.2, maxOutputTokens: 400 }
  };
  var opts = {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(body),
    muteHttpExceptions: true
  };
  var resp = UrlFetchApp.fetch(url, opts);
  var data = JSON.parse(resp.getContentText());
  var content = '';
  try {
    content = data.candidates[0].content.parts[0].text;
  } catch (x) {
    // Surface API error (e.g. quota) so the dashboard shows a clear message.
    if (data.error && data.error.message) throw new Error(data.error.message);
    throw new Error('Empty Gemini response.');
  }
  content = content.trim();
  if (content.indexOf('|| Channel') !== 0) {
    content = '|| Channel: Aircall\n' + content;
  }
  return content;
}

/* --- plumbing --- */
function _parseBody(e) {
  var p = e && e.parameter ? e.parameter : {};
  if (p.payload) { try { return JSON.parse(p.payload); } catch (x) {} }
  if (e && e.postData && e.postData.contents) {
    try { return JSON.parse(e.postData.contents); } catch (x) {}
  }
  return p;
}
function _json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
