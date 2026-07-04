import { PRESETS, resolveProfile } from '../data/presets.js';
import { applySpoof } from '../inject/apply-spoof.js';

const $ = (id) => document.getElementById(id);
const REAL_UA = navigator.userAgent;

// populate presets
const presetSel = $('preset');
for (const [k, v] of Object.entries(PRESETS)) {
  const o = document.createElement('option');
  o.value = k; o.textContent = v.label;
  presetSel.appendChild(o);
}
presetSel.value = 'US';

// ---- font-probing helpers (declared before `real` so the `const`s are    --
// initialized; `real` calls detectInstalledFonts() at the top, and a `const`
// referenced from a hoisted function is in the TDZ until its line runs) ----
const FONT_PROBE_TEXT = 'mmmmmmmmmmlli期 lan 嵐';
const PROBE_FONTS = ['PingFang SC', 'Microsoft YaHei', 'Hiragino Sans GB', 'SimSun', 'Noto Sans CJK SC'];

function measureWith(font) {
  const c = document.createElement('canvas').getContext('2d');
  c.font = font;
  return c.measureText(FONT_PROBE_TEXT).width;
}

// canvas width-probe: returns the subset of PROBE_FONTS whose width differs
// from the generic baseline (i.e. detected as installed).
function detectInstalledFonts() {
  const baseline = measureWith('72px monospace');
  const installed = [];
  for (const f of PROBE_FONTS) {
    const w = measureWith(`72px "${f}", monospace`);
    if (Math.abs(w - baseline) > 0.01) installed.push(f);
  }
  return installed;
}

// ---- capture REAL values before any spoofing (page just loaded) ----------
const real = {
  tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
  lang: navigator.language,
  langs: navigator.languages.slice(),
  intlLocale: Intl.NumberFormat().resolvedOptions().locale,
  offset: new Date().getTimezoneOffset(),
  ua: navigator.userAgent,
  platform: (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform,
  detectedFonts: detectInstalledFonts(),
};

// expected offset for a zone, computed with the real (un-spoofed) Intl
function expectedOffset(tz) {
  const f = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'longOffset' });
  const tzPart = f.formatToParts(new Date()).find((p) => p.type === 'timeZoneName').value;
  if (!tzPart || tzPart === 'GMT' || tzPart === 'UTC') return 0;
  const m = tzPart.replace('GMT', '').match(/^([+-])(\d{1,2})(?::(\d{2}))?$/);
  if (!m) return null;
  const sign = m[1] === '-' ? -1 : 1;
  return -(sign * (parseInt(m[2], 10) * 60 + (m[3] ? parseInt(m[3], 10) : 0)));
}

// ---- render ---------------------------------------------------------------
function row(signal, realVal, spoofed, expected, pass) {
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td><b>${signal}</b></td>
    <td class="mono">${realVal}</td>
    <td class="mono">${spoofed}</td>
    <td class="mono">${expected}</td>
    <td class="${pass ? 'ok' : 'bad'}">${pass ? '✓ PASS' : '✗ FAIL'}</td>`;
  return tr;
}

function run() {
  const profile = resolveProfile({ enabled: true, preset: presetSel.value, profile: {} }, REAL_UA);

  // apply the spoof IN THIS PAGE, then read back
  applySpoof(profile);

  const sTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const sLang = navigator.language;
  const sLangs = navigator.languages.slice();
  const sLocale = Intl.NumberFormat().resolvedOptions().locale;
  const sOffset = new Date().getTimezoneOffset();
  const sUa = navigator.userAgent;
  const sPlatform = (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform;
  const sFonts = detectInstalledFonts();

  const expOffset = expectedOffset(profile.timezone);

  const rows = [
    ['System timezone', real.tz, sTz, profile.timezone, sTz === profile.timezone],
    ['Browser language', real.langs.join(','), sLangs.join(','), profile.languages.join(','), sLangs.join(',') === profile.languages.join(',')],
    ['Installed CN fonts', real.detectedFonts.join(', ') || '(none)', sFonts.join(', ') || '(none)', '(none)', sFonts.length === 0],
    ['Intl locale', real.intlLocale, sLocale, profile.intlLocale, sLocale.toLowerCase().startsWith(profile.intlLocale.split('-')[0].toLowerCase())],
    ['Timezone offset', real.offset, sOffset, expOffset, sOffset === expOffset],
    ['Emoji / UA', real.platform, sPlatform, profile.userAgentData.platform, sPlatform === profile.userAgentData.platform && sUa.includes(profile.uaVendor.includes('windows') ? 'Windows' : profile.uaVendor.includes('mac') ? 'Macintosh' : 'Linux')],
  ];

  const body = $('body');
  body.innerHTML = '';
  for (const r of rows) body.appendChild(row(...r));

  const passed = rows.filter((r) => r[4]).length;
  $('note').textContent = `${passed}/${rows.length} signals spoofed correctly. Real values were captured on page load (before spoofing). To re-run against real values, click Reset page.`;
}

$('apply').addEventListener('click', run);
$('reset').addEventListener('click', () => location.reload());

// show real values immediately
(function showReal() {
  const body = $('body');
  body.innerHTML = '';
  for (const [name, val] of [
    ['System timezone', real.tz],
    ['Browser language', real.langs.join(',')],
    ['Installed CN fonts', real.detectedFonts.join(', ') || '(none)'],
    ['Intl locale', real.intlLocale],
    ['Timezone offset', real.offset],
    ['Emoji / UA', real.platform],
  ]) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td><b>${name}</b></td><td class="mono">${val}</td><td class="muted" colspan="3">click “Apply &amp; test”</td>`;
    body.appendChild(tr);
  }
  $('note').textContent = 'These are your REAL locale fingerprints (the ones the scanner sees without spoofing).';
})();
