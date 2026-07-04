import { PRESETS, resolveProfile } from '../data/presets.js';
import { loadState, upsertRule, deleteRule, normalizeDomain, ensureHostPermission, removeHostPermission } from '../data/store.js';

const $ = (id) => document.getElementById(id);
const domainEl = $('domain');
const statusEl = $('status');
const toggleEl = $('toggle');
const presetEl = $('preset');
const profileEl = $('profile');
const REAL_UA = navigator.userAgent;

for (const [k, v] of Object.entries(PRESETS)) {
  const opt = document.createElement('option');
  opt.value = k; opt.textContent = v.label;
  presetEl.appendChild(opt);
}

let currentDomain = '';
let activeTabId = null;

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

function renderProfile(rule) {
  if (!rule) { profileEl.innerHTML = '<div class="muted">No profile — real values used.</div>'; return; }
  const p = resolveProfile(rule, REAL_UA);
  const offset = (() => {
    try {
      const f = new Intl.DateTimeFormat('en-US', { timeZone: p.timezone, timeZoneName: 'longOffset' });
      const tz = f.formatToParts(new Date()).find((x) => x.type === 'timeZoneName').value;
      return tz.replace('GMT', 'UTC');
    } catch (_) { return '?'; }
  })();
  profileEl.innerHTML = `
    <div><span class="muted">Timezone</span><b>${p.timezone}</b></div>
    <div><span class="muted">Offset</span><b>${offset}</b></div>
    <div><span class="muted">Languages</span><b>${p.languages.join(', ')}</b></div>
    <div><span class="muted">Intl locale</span><b>${p.intlLocale}</b></div>
    <div><span class="muted">Accept-Lang</span><b>${p.acceptLanguage}</b></div>
    <div><span class="muted">UA</span><b title="${p.ua}">${p.uaVendor}</b></div>`;
}

function isSpoofable(url) {
  return !!url && /^https?:\/\//.test(url);
}

async function refresh() {
  const tab = await getActiveTab();
  activeTabId = tab ? tab.id : null;
  const url = tab && tab.url ? tab.url : '';
  const host = isSpoofable(url) ? normalizeDomain(new URL(url).hostname) : '';
  currentDomain = host;
  domainEl.textContent = host || '(this page)';

  if (!host) {
    statusEl.textContent = 'open an http(s) site to spoof it';
    toggleEl.checked = false;
    toggleEl.disabled = true;
    presetEl.disabled = true;
    profileEl.innerHTML = '<div class="muted">No spoofable page.</div>';
    return;
  }
  toggleEl.disabled = false;
  presetEl.disabled = false;

  const state = await loadState();
  const rule = (state.rules || {})[host];
  if (rule) {
    toggleEl.checked = !!rule.enabled;
    if (rule.preset) presetEl.value = rule.preset;
    statusEl.textContent = rule.enabled ? 'spoofing active' : 'rule exists — disabled';
    renderProfile(rule);
  } else {
    toggleEl.checked = false;
    presetEl.value = 'US';
    statusEl.textContent = 'no rule for this site yet';
    renderProfile(null);
  }
}

toggleEl.addEventListener('change', async () => {
  if (!currentDomain) return;
  if (toggleEl.checked) {
    const ok = await ensureHostPermission(currentDomain);
    if (!ok) {
      toggleEl.checked = false;
      statusEl.textContent = 'host permission denied — enable in the prompt';
      return;
    }
    const rule = { enabled: true, preset: presetEl.value || 'US' };
    await upsertRule(currentDomain, rule);
    statusEl.textContent = 'spoofing on — reloading…';
    if (activeTabId != null) { try { await chrome.tabs.reload(activeTabId); } catch (_) {} }
    window.close();
  } else {
    const state = await loadState();
    const rule = state.rules[currentDomain];
    if (rule) { rule.enabled = false; await upsertRule(currentDomain, rule); }
    await removeHostPermission(currentDomain);
    statusEl.textContent = 'disabled';
    if (activeTabId != null) { try { await chrome.tabs.reload(activeTabId); } catch (_) {} }
    window.close();
  }
});

presetEl.addEventListener('change', async () => {
  if (!currentDomain) return;
  const state = await loadState();
  const rule = state.rules[currentDomain] || { enabled: false, preset: presetEl.value };
  rule.preset = presetEl.value;
  await upsertRule(currentDomain, rule);
  refresh();
});

$('options').addEventListener('click', (e) => { e.preventDefault(); chrome.runtime.openOptionsPage(); });
$('test').addEventListener('click', (e) => { e.preventDefault(); chrome.tabs.create({ url: chrome.runtime.getURL('src/test/test.html') }); });
$('reload').addEventListener('click', async (e) => {
  e.preventDefault();
  if (activeTabId != null) chrome.tabs.reload(activeTabId);
});

refresh();
