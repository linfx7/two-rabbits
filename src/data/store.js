// Shared storage + host-permission helpers for options/popup.
import { STORAGE_KEY } from './presets.js';

export async function loadState() {
  const data = await chrome.storage.local.get(STORAGE_KEY);
  return data[STORAGE_KEY] || { version: 1, rules: {} };
}

export async function saveState(state) {
  await chrome.storage.local.set({ [STORAGE_KEY]: state });
  // tell the service worker to refresh in-memory config + DNR rules immediately
  try { await chrome.runtime.sendMessage({ type: 'locale-spoof:reload' }); } catch (_) {}
}

export async function upsertRule(domain, rule) {
  const key = domain.toLowerCase().trim();
  const state = await loadState();
  state.rules[key] = rule;
  await saveState(state);
  return state;
}

export async function deleteRule(domain) {
  const key = domain.toLowerCase().trim();
  const state = await loadState();
  delete state.rules[key];
  await saveState(state);
  return state;
}

// Normalize a user-typed domain: strip scheme/path, keep the bare host.
export function normalizeDomain(input) {
  if (!input) return '';
  let s = input.trim().toLowerCase();
  s = s.replace(/^[a-z]+:\/\//, '');
  s = s.split('/')[0];
  s = s.split('?')[0];
  s = s.replace(/^www\./, '');
  return s;
}

// Request host access for a domain. Must be called from a user gesture.
// We call chrome.permissions.request() FIRST (no preceding await) so the user
// activation is intact — awaiting contains() first can drop the gesture.
// Returns true if granted (or already held).
export async function ensureHostPermission(domain) {
  const origins = [`*://*.${domain}/*`];
  try {
    return await chrome.permissions.request({ origins });
  } catch (_) {
    // not invoked from a gesture, or request blocked — check if already granted
    try { return await chrome.permissions.contains({ origins }); } catch (e) { return false; }
  }
}

export async function removeHostPermission(domain) {
  const origins = [`*://*.${domain}/*`];
  try { await chrome.permissions.remove({ origins }); } catch (_) {}
}
