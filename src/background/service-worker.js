// Service worker: keeps config in memory, injects applySpoof into the MAIN world
// for matched domains as early as possible, and maintains declarativeNetRequest
// dynamic rules so Accept-Language / User-Agent headers are rewritten server-side.

import { applySpoof } from '../inject/apply-spoof.js';
import { resolveProfile, STORAGE_KEY } from '../data/presets.js';

const REAL_UA = (typeof navigator !== 'undefined' && navigator.userAgent) || '';

/** @type {{ [domain: string]: { enabled: boolean, preset?: string, profile?: object } }} */
let rules = {};
/** @type {{ domain: string, profile: object }[]} resolved + enabled rules */
let enabled = [];

async function load() {
  const data = await chrome.storage.local.get(STORAGE_KEY);
  const parsed = (data && data[STORAGE_KEY]) || { version: 1, rules: {} };
  rules = parsed.rules || {};
  rebuildEnabled();
  await syncDnrRules();
}

function rebuildEnabled() {
  enabled = [];
  for (const [domain, rule] of Object.entries(rules)) {
    if (rule && rule.enabled) {
      enabled.push({ domain: domain.toLowerCase(), profile: resolveProfile(rule, REAL_UA) });
    }
  }
}

function matchRule(url) {
  let host;
  try { host = new URL(url).hostname.toLowerCase(); } catch (_) { return null; }
  // longest-suffix match: a rule for "example.com" matches "example.com" and "sub.example.com"
  let best = null;
  for (const r of enabled) {
    if (host === r.domain || host.endsWith('.' + r.domain)) {
      if (!best || r.domain.length > best.domain.length) best = r;
    }
  }
  return best;
}

// Inject applySpoof into the tab's MAIN world. `injectImmediately` + the
// onCommitted timing make it land before the page's own scripts in the common
// case. The profile is already resolved in memory (no async storage read here).
async function injectIntoTab(tabId, url) {
  const r = matchRule(url);
  if (!r) return;
  try {
    await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      world: 'MAIN',
      injectImmediately: true,
      func: applySpoof,
      args: [r.profile],
    });
  } catch (_) {
    // tab restricted (chrome://, webstore, …) or gone — ignore
  }
}

function onNav(details) {
  if (!details.url) return;
  injectIntoTab(details.tabId, details.url);
}

chrome.webNavigation.onCommitted.addListener(onNav);
// SPA navigations don't fire onCommitted — catch pushState/replaceState too.
chrome.webNavigation.onHistoryStateUpdated.addListener(onNav);

// ---- declarativeNetRequest: rewrite request headers ----------------------

const HEADER_RESOURCE_TYPES = [
  'main_frame', 'sub_frame', 'xmlhttprequest', 'script', 'stylesheet',
  'image', 'font', 'media', 'websocket', 'other',
];

function buildDnrRules() {
  const addRules = [];
  enabled.forEach((r, i) => {
    if (!r.profile) return;
    const requestHeaders = [];
    if (r.profile.acceptLanguage) {
      requestHeaders.push({ header: 'accept-language', operation: 'set', value: r.profile.acceptLanguage });
    }
    if (r.profile.ua) {
      requestHeaders.push({ header: 'user-agent', operation: 'set', value: r.profile.ua });
    }
    if (!requestHeaders.length) return;
    addRules.push({
      id: 100 + i,
      priority: 1,
      action: { type: 'modifyHeaders', requestHeaders },
      condition: { requestDomains: [r.domain], resourceTypes: HEADER_RESOURCE_TYPES },
    });
  });
  return addRules;
}

async function syncDnrRules() {
  try {
    const existing = await chrome.declarativeNetRequest.getDynamicRules();
    const removeRuleIds = existing.map((r) => r.id);
    const addRules = buildDnrRules();
    await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds, addRules });
  } catch (_) {
    // DNR unavailable or insufficient permissions — JS-layer spoof still works
  }
}

// ---- config persistence + change propagation -----------------------------

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes[STORAGE_KEY]) {
    load();
  }
});

// The options/popup call this after editing storage so DNR rules + in-memory
// state refresh immediately (storage.onChanged also fires, this is belt+braces).
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg && msg.type === 'locale-spoof:reload') {
    load().then(() => sendResponse({ ok: true }));
    return true; // async
  }
  if (msg && msg.type === 'locale-spoof:status' && msg.url) {
    sendResponse(matchRule(msg.url));
    return false;
  }
});

// re-inject into already-open tabs that match after a config change is tricky
// (scripts already ran); reload is the reliable reset. We surface a helper for
// the popup to trigger a tab reload when toggling on for the active tab.

chrome.runtime.onInstalled.addListener(() => { load(); });
chrome.runtime.onStartup.addListener(() => { load(); });
load();
