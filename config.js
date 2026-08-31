/* ============================================================
 * config.js - dashboard settings.
 *
 * Data comes from data.js, which a GitHub Actions job rebuilds
 * from the Google Sheets every hour. There is no API URL, no
 * token and no Apps Script in the browser.
 * ============================================================ */

/* Shown next to the Last Updated stamp. Set to '' to hide. */
window.DATA_SOURCE_NOTE = 'Auto-updates hourly';

/* Leave Request write endpoint. Leave empty ('') to save submissions as a
 * local draft only (shown after the next hourly sync once wired to the sheet).
 * To write straight to the Google Sheet, deploy a tiny Apps Script web app
 * from the leave-request sheet and paste its URL here. */
window.DASHBOARD_CONFIG = window.DASHBOARD_CONFIG || {};
window.DASHBOARD_CONFIG.leaveWebAppUrl = 'https://script.google.com/macros/s/AKfycbxBF0FZwUavwneXqr9w4iDZXHGm2y0cZowJt8T7YVEfq8BlL1-h-F_EZ00YMHkJ17Emgw/exec';

/* Internal Note Helper (Option B) AI endpoint.
 * Leave empty ('') to use offline best-effort formatting (the page still works
 * and formats notes into the || template without AI).
 * To enable real AI summaries, deploy apps-script/NotesSummarize.gs as a web
 * app (Execute as: Me, Access: Anyone) and paste its /exec URL here. It calls
 * the LLM server-side using a key stored in Script Properties (never exposed
 * to the browser). Channel is forced to 'Aircall' in the backend. */
window.DASHBOARD_CONFIG.notesWebAppUrl = 'https://script.google.com/macros/s/AKfycbxYMUXZGxkYLEXYl3n6_qvqQdyUCOZcTGYF0eYUsI1Ugln95EiviHhMGGX19g1kuNDE/exec'; /* Notes AI summarizer */

/* Per-agent passcode gate for the Leave Request tab (Option B).
 * Each agent types their 4-digit PIN; the Agent field then locks to their name.
 * NOTE: this is a lightweight gate, NOT real security - the map is public in the
 * page source, so anyone can read it. It stops accidental wrong-agent filing.
 * Generated 4-digit PINs; tell each agent their code. */
window.DASHBOARD_CONFIG.agentPins = {
  'Danielle Mae David': '4821',
  'Godwin Arellano Reasol': '7730',
  'Candy Laid': '3196',
  'Mary Claudette Ibong': '6458',
  'Sofhia Mae Santiago': '2047',
  'Cherry Tubongbanua': '8913',
  'Lyra Miclat': '5529',
  'Joemica Cariño': '1364'
};

