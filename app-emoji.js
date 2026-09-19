/* ============================================================
 * app-emoji.js - emoji + inline-image helpers for cascade text
 * Loaded before app-init.js / app-render.js so cascade renderers
 * can call emojify() / cascTextHtml().
 * ============================================================ */

/* Convert Slack-style :shortcode: emoji tokens (e.g. :blush:, :100:) that agents
 * type into the sheet into real emoji glyphs so they render on the dashboard.
 * Only known codes are replaced - any :word: that isn't a known emoji is left
 * untouched so real labels like ":Return:" stay literal. */
var EMOJI_SHORTCODES = {
  'blush':'😊','smile':'😄','grinning':'😀','slightly_smiling_face':'🙂',
  'wink':'😉','heart_eyes':'😍','joy':'😂','rofl':'🤣','sweat_smile':'😅',
  'thinking':'🤔','eyes':'👀','raised_hands':'🙌','pray':'🙏','folded_hands':'🙏',
  'clap':'👏','tada':'🎉','100':'💯','fire':'🔥','star':'⭐','stars':'🌟',
  'white_check_mark':'✅','check_mark':'✔️','x':'❌','negative_squared_cross_mark':'⭕',
  'warning':'⚠️','exclamation':'❗','bell':'🔔','memo':'📝','pencil':'📝',
  'telephone':'☎️','phone':'📞','email':'📧','envelope':'📧','link':'🔗',
  'point_up':'☝️','bulb':'💡','bulb_light':'💡','warning_sign':'⚠️','alert':'🚨',
  'information_source':'ℹ️','ok_hand':'👌','thumbsup':'👍','thumbsdown':'👎',
  'raised_hand':'✋','wave':'👋','pouting_face':'😡','cry':'😢','sob':'😭',
  'sunglasses':'😎','smirk':'😏','relaxed':'☺️','innocent':'😇','slightly_frowning_face':'🙁',
  'confused':'😕','worried':'😟','sweat':'😓','sleeping':'😴','zzz':'💤',
  'rocket':'🚀','calendar':'📅','date':'📅','clock':'🕐',
  'hourglass':'⌛','stopwatch':'⏱️','mag':'🔍','search':'🔍','pushpin':'📌',
  'book':'📖','books':'📚','notebook':'📓','page_facing_up':'📄','file_folder':'📁',
  'speech_balloon':'💬','question':'❓','grey_question':'❔','exclamation_question':'⁉️',
  'bangbang':'‼️','interrobang':'⁉️','heavy_plus_sign':'➕','heavy_minus_sign':'➖',
  'arrow_up':'⬆️','arrow_down':'⬇️','arrow_right':'➡️','arrow_left':'⬅️',
  'point_right':'👉','point_left':'👈','no_entry':'⛔',
  'negative_squared_cross':'⭕','white_large_square':'⬜','black_large_square':'⬛',
  'ok':'🆗','ng':'🆖','new':'🆕','soon':'🔜','top':'🔝','recycle':'♻️'
};

function emojify(s) {
  if (!s) return s;
  return String(s).replace(/:([a-z0-9_+-]+):/gi, function (m, code) {
    var k = code.toLowerCase();
    // strip noise some codes carry
    k = k.replace(/^(emoji_|emoji-|light_|light-)/, '').replace(/(_light|_emoji)$/, '');
    return EMOJI_SHORTCODES[code.toLowerCase()] || EMOJI_SHORTCODES[k] || m;
  });
}

/* Within already-escaped cascade text, turn image URLs (Google Drive "view"
 * links, direct image files, imgur, lh3) into inline <img> tags. Drive "view"
 * pages don't return image bytes, so rewrite to the lh3 host (same trick the
 * reference-image section uses). Returns HTML safe to inject. */
function inlineCascadeImages(escapedHtml) {
  if (!escapedHtml) return escapedHtml;
  var URL_RE = /https?:\/\/[^<>\s"']+/g;
  return escapedHtml.replace(URL_RE, function (u) {
    var isImg = /\.(png|jpe?g|gif|webp|bmp|svg)(\?|$)/i.test(u) ||
      /drive\.google\.com|docs\.google\.com\/uc|lh3\.googleusercontent\.com|imgur\.com/i.test(u);
    if (!isImg) return u;
    var direct = u.replace(/&amp;/g, '&');
    var m = direct.match(/drive\.google\.com\/file\/d\/([^\/?]+)/) ||
            direct.match(/drive\.google\.com\/open\?id=([^&]+)/) ||
            direct.match(/drive\.google\.com\/uc\?[^&]*id=([^&]+)/);
    var src = m ? 'https://lh3.googleusercontent.com/d/' + m[1] : direct;
    return '<img class="casc-inline-img" src="' + src + '" alt="cascade image" ' +
           'loading="lazy" onclick="openLb(this.src)" onerror="cascImgFallback(this)">';
  });
}

/* Convenience: escape + emojify + inline-images, for plain cascade text. */
function cascTextHtml(s) {
  return inlineCascadeImages(emojify(esc(s)));
}
