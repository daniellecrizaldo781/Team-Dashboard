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
window.DASHBOARD_CONFIG.leaveWebAppUrl = '';
