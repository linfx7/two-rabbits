// Country/locale presets + UA vendor templates + profile resolution.
//
// A "rule" (stored under chrome.storage.local) looks like:
//   { enabled: true, preset: "US", profile: { timezone: "...", languages: [...] } }
// `profile` may carry any subset of the preset fields and overrides them.
//
// `resolveProfile(rule, realUa)` merges preset + overrides and expands `uaVendor`
// into concrete navigator fields (ua / platform / userAgentData). The Chrome
// version is lifted from the real User-Agent so the spoofed UA is not stale.
//
// tzOffset is intentionally NOT stored here — it is derived from `timezone`
// inside applySpoof via the Intl longOffset trick, so it can never drift.

export const STORAGE_KEY = 'localeSpoof';

export const PRESETS = {
  US: {
    label: '🇺🇸 United States',
    timezone: 'America/New_York',
    languages: ['en-US', 'en'],
    intlLocale: 'en-US',
    acceptLanguage: 'en-US,en;q=0.9',
    uaVendor: 'windows-chrome',
  },
  GB: {
    label: '🇬🇧 United Kingdom',
    timezone: 'Europe/London',
    languages: ['en-GB', 'en'],
    intlLocale: 'en-GB',
    acceptLanguage: 'en-GB,en;q=0.9',
    uaVendor: 'windows-chrome',
  },
  CA: {
    label: '🇨🇦 Canada',
    timezone: 'America/Toronto',
    languages: ['en-CA', 'en', 'fr-CA'],
    intlLocale: 'en-CA',
    acceptLanguage: 'en-CA,en;q=0.9',
    uaVendor: 'windows-chrome',
  },
  AU: {
    label: '🇦🇺 Australia',
    timezone: 'Australia/Sydney',
    languages: ['en-AU', 'en'],
    intlLocale: 'en-AU',
    acceptLanguage: 'en-AU,en;q=0.9',
    uaVendor: 'mac-chrome',
  },
  DE: {
    label: '🇩🇪 Germany',
    timezone: 'Europe/Berlin',
    languages: ['de-DE', 'de', 'en'],
    intlLocale: 'de-DE',
    acceptLanguage: 'de-DE,de;q=0.9,en;q=0.8',
    uaVendor: 'windows-chrome',
  },
  FR: {
    label: '🇫🇷 France',
    timezone: 'Europe/Paris',
    languages: ['fr-FR', 'fr', 'en'],
    intlLocale: 'fr-FR',
    acceptLanguage: 'fr-FR,fr;q=0.9,en;q=0.8',
    uaVendor: 'windows-chrome',
  },
  JP: {
    label: '🇯🇵 Japan',
    timezone: 'Asia/Tokyo',
    languages: ['ja', 'en'],
    intlLocale: 'ja-JP',
    acceptLanguage: 'ja,en;q=0.9',
    uaVendor: 'windows-chrome',
  },
  SG: {
    label: '🇸🇬 Singapore',
    timezone: 'Asia/Singapore',
    languages: ['en-SG', 'en', 'zh-SG', 'ms'],
    intlLocale: 'en-SG',
    acceptLanguage: 'en-SG,en;q=0.9,zh-SG;q=0.8,ms;q=0.7',
    uaVendor: 'windows-chrome',
  },
  TW: {
    label: '🇨🇳 Taiwan, China',
    timezone: 'Asia/Taipei',
    languages: ['zh-TW', 'zh', 'en'],
    intlLocale: 'zh-TW',
    acceptLanguage: 'zh-TW,zh;q=0.9,en;q=0.8',
    uaVendor: 'windows-chrome',
  },
};

// Concrete navigator strings per "vendor". `{chrome}` is replaced with the real
// "Chrome/<ver>" token at resolve time. secChUaPlatform drives navigator.userAgentData.
export const UA_VENDORS = {
  'windows-chrome': {
    ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) {chrome} Safari/537.36',
    platform: 'Win32',
    secChUaPlatform: 'Windows',
  },
  'mac-chrome': {
    ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) {chrome} Safari/537.36',
    platform: 'MacIntel',
    secChUaPlatform: 'macOS',
  },
  'linux-chrome': {
    ua: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) {chrome} Safari/537.36',
    platform: 'Linux x86_64',
    secChUaPlatform: 'Linux',
  },
};

export const VENDOR_OPTIONS = Object.keys(UA_VENDORS);

function majorFromRealUa(realUa) {
  const m = realUa && realUa.match(/Chrome\/(\d+)\./);
  return m ? m[1] : '124';
}

function chromeTokenFromRealUa(realUa) {
  const m = realUa && realUa.match(/Chrome\/[\d.]+/);
  return m ? m[0] : 'Chrome/124.0.0.0';
}

// Merge preset + overrides and expand uaVendor. `realUa` is the service worker's
// own navigator.userAgent (used only to keep the spoofed Chrome version current).
export function resolveProfile(rule, realUa) {
  const preset = rule && rule.preset ? PRESETS[rule.preset] : null;
  const merged = { ...(preset || {}), ...((rule && rule.profile) || {}) };
  delete merged.label;

  const vendorKey = merged.uaVendor || 'windows-chrome';
  const v = UA_VENDORS[vendorKey] || UA_VENDORS['windows-chrome'];
  const chromeToken = chromeTokenFromRealUa(realUa);
  const major = majorFromRealUa(realUa);

  merged.uaVendor = vendorKey;
  merged.ua = v.ua.replace(/\{chrome\}/g, chromeToken);
  merged.platform = v.platform;
  merged.userAgentData = {
    brands: [
      { brand: 'Chromium', version: major },
      { brand: 'Google Chrome', version: major },
      { brand: 'Not/A)Brand', version: '99' },
    ],
    mobile: false,
    platform: v.secChUaPlatform,
  };

  // sane defaults if a rule was built with only overrides
  if (!merged.timezone) merged.timezone = 'America/New_York';
  if (!Array.isArray(merged.languages) || !merged.languages.length) merged.languages = ['en-US', 'en'];
  if (!merged.intlLocale) merged.intlLocale = merged.languages[0];
  if (!merged.acceptLanguage) merged.acceptLanguage = merged.languages.map((l, i) => i === 0 ? l : `${l};q=0.${9 - i}`).join(',');

  return merged;
}
