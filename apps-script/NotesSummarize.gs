/* ============================================================
 * NotesSummarize.gs - Internal Note Helper backend (Option B)
 *
 * Deploy: Apps Script editor -> New project -> paste this -> Deploy ->
 *   New deployment -> type "Web app" -> Execute as: Me ->
 *   Who has access: Anyone (or your domain) -> Deploy -> copy the /exec URL
 *   and paste it into config.js as DASHBOARD_CONFIG.notesWebAppUrl.
 *
 * The LLM API key lives ONLY here, in Script Properties
 * (Project Settings -> Script Properties -> add LLM_API_KEY).
 * It is NEVER sent to the browser. The dashboard only POSTs the raw notes.
 *
 * Channel is forced to 'Aircall' per the team requirement.
 * The function returns ONLY the 4-line internal-note format:
 *   || Channel: Aircall
 *   || Email: ...
 *   || Complaint: ...
 *   || Resolution: ...
 * ============================================================ */

var NOTES_PROP_KEY = 'LLM_API_KEY';

function doGet(e) { return _cors(ContentService.createTextOutput('Note Helper API. POST action=summarizeNotes.')); }

function doPost(e) {
  try {
    var payload = _parseBody(e);
    var action = payload.action || (payload.payload && payload.payload.action);
    if (action !== 'summarizeNotes') {
      return _cors(_json({ ok: false, error: 'Unknown action.' }));
    }
    var notes = (payload.notes || (payload.payload && payload.payload.notes) || '').toString().trim();
    if (!notes) return _cors(_json({ ok: false, error: 'No notes provided.' }));

    var text = summarizeNotes(notes);
    return _cors(_json({ ok: true, text: text }));
  } catch (err) {
    return _cors(_json({ ok: false, error: String(err) }));
  }
}

/* Calls the LLM (OpenAI-compatible) server-side and returns the || format. */
function summarizeNotes(notes) {
  var apiKey = PropertiesService.getScriptProperties().getProperty(NOTES_PROP_KEY) || '';
  if (!apiKey) {
    // Graceful fallback if no key is set yet.
    return '|| Channel: Aircall\n|| Customer Name: \n|| Email: \n|| Complaint: ' + notes.replace(/\s+/g, ' ').trim() + '\n|| Resolution: ';
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

  var url = 'https://api.openai.com/v1/chat/completions';
  var body = {
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: notes }
    ],
    temperature: 0.2,
    max_tokens: 400
  };
  var opts = {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + apiKey },
    payload: JSON.stringify(body),
    muteHttpExceptions: true
  };
  var resp = UrlFetchApp.fetch(url, opts);
  var data = JSON.parse(resp.getContentText());
  var content = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '';
  content = content.trim();
  // Safety: if the model strayed from the format, coerce it back.
  if (content.indexOf('|| Channel') !== 0) {
    content = '|| Channel: Aircall\n' + content;
  }
  return content;
}

/* --- plumbing (mirrors LeaveSubmit.gs) --- */
function _parseBody(e) {
  var p = e && e.parameter ? e.parameter : {};
  if (p.payload) { try { return JSON.parse(p.payload); } catch (x) {} }
  if (e && e.postData && e.postData.contents) {
    try { return JSON.parse(e.postData.contents); } catch (x) {}
  }
  return p;
}
function _json(obj) { return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON); }
function _cors(out) {
  // Apps Script web apps already send permissive CORS headers; this is a no-op safety wrapper.
  return out;
}
