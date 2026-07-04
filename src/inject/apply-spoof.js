// MAIN-world spoof entry point.
//
// CRITICAL: `applySpoof` must be fully self-contained. It is passed to
// chrome.scripting.executeScript({ func }) which serializes it via toString()
// and re-evaluates it in the page's MAIN world. It therefore CANNOT close over
// any module-scope binding or use import/export. Only the `profile` argument
// and page-global constructors (Intl, Date, navigator, document, …) are usable.
//
// `profile` = { timezone, languages[], intlLocale, ua, platform, userAgentData }

export function applySpoof(profile) {
  if (!profile || !profile.timezone) return;

  const SPOOF_TZ = String(profile.timezone);
  const LANGS = Object.freeze((profile.languages || ['en-US', 'en']).map(String));
  const LOCALE = String(profile.intlLocale || LANGS[0] || 'en-US');

  // ---- small helpers (all self-contained) --------------------------------

  function overrideGetter(obj, prop, getter) {
    // instance first (shadows prototype getter), then prototype as fallback
    try {
      Object.defineProperty(obj, prop, { get: getter, configurable: true, enumerable: true });
      return;
    } catch (_) {}
    try {
      Object.defineProperty(Object.getPrototypeOf(obj), prop, { get: getter, configurable: true, enumerable: true });
    } catch (_) {}
  }

  // Make a wrapper look native: patch its toString so it returns the original's
  // native source. Defends naive `fn.toString()` fingerprinting of the override.
  function nativize(wrapper, original, name) {
    try {
      const native = `function ${name}() { [native code] }`;
      const ts = wrapper.toString.bind(wrapper);
      Object.defineProperty(wrapper, 'toString', { value: () => native, configurable: true, enumerable: false });
      // also harden toString itself
      Object.defineProperty(wrapper.toString, 'toString', { value: () => 'function toString() { [native code] }', configurable: true, enumerable: false });
    } catch (_) {}
  }

  // ========================================================================
  // 1 + 4. Intl.DateTimeFormat  (timezone + locale)
  // ========================================================================
  const OrigDTF = Intl.DateTimeFormat;
  function PatchedDTF(...args) {
    let [locale, options] = args;
    options = options ? Object.assign({}, options) : {};
    if (options.timeZone == null) options.timeZone = SPOOF_TZ;
    if (locale === undefined) locale = LOCALE;
    return new OrigDTF(locale, options);
  }
  PatchedDTF.prototype = OrigDTF.prototype;
  if (typeof OrigDTF.supportedLocalesOf === 'function') {
    PatchedDTF.supportedLocalesOf = function (...a) { return OrigDTF.supportedLocalesOf.apply(OrigDTF, a); };
    nativize(PatchedDTF.supportedLocalesOf, OrigDTF.supportedLocalesOf, 'supportedLocalesOf');
  }
  Intl.DateTimeFormat = PatchedDTF;
  nativize(PatchedDTF, OrigDTF, 'DateTimeFormat');

  // ========================================================================
  // 4. Other Intl formatters — force default locale to LOCALE
  // ========================================================================
  function patchIntlFormatter(namespaceName, ctorName) {
    const NS = window[namespaceName];
    const Ctor = NS && NS[ctorName];
    if (typeof Ctor !== 'function') return;
    function Patched(...args) {
      let [locale, options] = args;
      if (locale === undefined) locale = LOCALE;
      return new Ctor(locale, options);
    }
    Patched.prototype = Ctor.prototype;
    if (typeof Ctor.supportedLocalesOf === 'function') {
      Patched.supportedLocalesOf = function (...a) { return Ctor.supportedLocalesOf.apply(Ctor, a); };
      nativize(Patched.supportedLocalesOf, Ctor.supportedLocalesOf, 'supportedLocalesOf');
    }
    NS[ctorName] = Patched;
    nativize(Patched, Ctor, ctorName);
  }
  patchIntlFormatter('Intl', 'NumberFormat');
  patchIntlFormatter('Intl', 'Collator');
  patchIntlFormatter('Intl', 'PluralRules');
  patchIntlFormatter('Intl', 'RelativeTimeFormat');
  patchIntlFormatter('Intl', 'ListFormat');
  patchIntlFormatter('Intl', 'Segmenter');

  // ========================================================================
  // 5. Date.prototype.getTimezoneOffset  (DST-correct, via real Intl longOffset)
  // ========================================================================
  let offsetDTF;
  try {
    offsetDTF = new OrigDTF('en-US', { timeZone: SPOOF_TZ, timeZoneName: 'longOffset' });
  } catch (_) {
    offsetDTF = new OrigDTF('en-US', { timeZone: SPOOF_TZ, timeZoneName: 'shortOffset' });
  }
  function zoneOffsetMinutes(date) {
    try {
      const parts = offsetDTF.formatToParts(date);
      let tz = '';
      for (const p of parts) if (p.type === 'timeZoneName') { tz = p.value; break; }
      // tz: "GMT+08:00", "GMT-05:00", "GMT+05:30", "GMT", "UTC"
      if (!tz || tz === 'GMT' || tz === 'UTC') return 0;
      const m = tz.replace('GMT', '').match(/^([+-])(\d{1,2})(?::(\d{2}))?$/);
      if (!m) return null;
      const sign = m[1] === '-' ? -1 : 1;
      const eastOfUtc = sign * (parseInt(m[2], 10) * 60 + (m[3] ? parseInt(m[3], 10) : 0));
      return -eastOfUtc; // getTimezoneOffset: positive = west of UTC
    } catch (_) {
      return null;
    }
  }
  const OrigGetTZ = Date.prototype.getTimezoneOffset;
  Date.prototype.getTimezoneOffset = function () {
    const o = zoneOffsetMinutes(this);
    return o == null ? OrigGetTZ.call(this) : o;
  };
  nativize(Date.prototype.getTimezoneOffset, OrigGetTZ, 'getTimezoneOffset');

  // ========================================================================
  // 2. navigator.language / languages
  // ========================================================================
  overrideGetter(navigator, 'language', () => LANGS[0]);
  overrideGetter(navigator, 'languages', () => LANGS);

  // ========================================================================
  // 3. Installed fonts — neutralize canvas width-probing + document.fonts.check
  // ========================================================================
  const GENERIC_FAMILIES = ['monospace', 'sans-serif', 'serif', 'cursive', 'fantasy', 'system-ui', 'ui-monospace', 'ui-sans-serif', 'ui-serif', 'ui-rounded'];
  const CHINESE_FONTS = [
    'PingFang SC', 'PingFang TC', 'PingFang HK', 'Hiragino Sans GB',
    'STHeiti', 'STSong', 'STKaiti', 'STFangsong', 'STXihei', 'STZhongsong',
    'SimSun', 'NSimSun', 'SimHei', 'FangSong', 'KaiTi', 'Microsoft YaHei', 'Microsoft JhengHei',
    'WenQuanYi Micro Hei', 'WenQuanYi Zen Hei',
    'Noto Sans CJK SC', 'Noto Sans CJK TC', 'Noto Sans SC', 'Noto Sans TC',
    'Noto Serif CJK SC', 'Noto Serif CJK TC', 'Noto Serif SC',
    'Source Han Sans SC', 'Source Han Sans CN', 'Source Han Serif SC', 'Source Han Serif CN',
    'LXGW WenKai',
  ];

  // Reduce any ctx.font to "<prefix up to size> <single generic family>" so the
  // measured width no longer depends on a specific (Chinese) font name.
  function neutralizeFont(fontStr) {
    if (!fontStr || typeof fontStr !== 'string') return fontStr;
    const lower = fontStr.toLowerCase();
    let generic = null;
    for (const g of GENERIC_FAMILIES) {
      const idx = lower.indexOf(g);
      if (idx !== -1) { generic = g; break; }
    }
    if (!generic) return fontStr; // no generic anchor → leave untouched (rare)
    const sizeMatch = fontStr.match(/(\d+(?:\.\d+)?(?:px|pt|em|rem|ex|ch|vh|vw|%))/i);
    if (!sizeMatch) return generic; // looks like a bare family list
    const sizeEnd = fontStr.indexOf(sizeMatch[0]) + sizeMatch[0].length;
    let prefixEnd = sizeEnd;
    // include a trailing "/line-height" if present
    const lh = fontStr.slice(sizeEnd).match(/^\/\s*\d+(?:\.\d+)?\s*/);
    if (lh) prefixEnd += lh[0].length;
    return fontStr.slice(0, prefixEnd) + ' ' + generic;
  }

  const Ctx2D = window.CanvasRenderingContext2D && CanvasRenderingContext2D.prototype;
  if (Ctx2D && typeof Ctx2D.measureText === 'function') {
    const realMeasure = Ctx2D.measureText;
    let scratch = null;
    function getScratch() {
      if (!scratch) {
        try { scratch = document.createElement('canvas').getContext('2d'); } catch (_) { scratch = null; }
      }
      return scratch;
    }
    Ctx2D.measureText = function (text) {
      try {
        const orig = this.font;
        const neu = neutralizeFont(orig);
        if (neu !== orig) {
          const s = getScratch();
          if (s) { s.font = neu; return realMeasure.call(s, text); }
        }
      } catch (_) {}
      return realMeasure.call(this, text);
    };
    nativize(Ctx2D.measureText, realMeasure, 'measureText');
  }

  if (document.fonts && typeof document.fonts.check === 'function') {
    const realCheck = document.fonts.check.bind(document.fonts);
    document.fonts.check = function (font, text) {
      try {
        const lower = String(font || '').toLowerCase();
        for (const f of CHINESE_FONTS) {
          if (lower.indexOf(f.toLowerCase()) !== -1) return false;
        }
      } catch (_) {}
      return realCheck(font, text);
    };
    nativize(document.fonts.check, realCheck, 'check');
  }

  // ========================================================================
  // 6. Emoji / User-Agent — navigator.userAgent / platform / userAgentData
  // ========================================================================
  if (profile.ua) {
    overrideGetter(navigator, 'userAgent', () => profile.ua);
    try { overrideGetter(navigator, 'appVersion', () => String(profile.ua).replace(/^Mozilla\//, '')); } catch (_) {}
  }
  if (profile.platform) {
    overrideGetter(navigator, 'platform', () => profile.platform);
  }
  if (profile.userAgentData) {
    // userAgentData is a getter on Navigator.prototype; replace the whole object.
    const uaData = profile.userAgentData;
    const proxy = {
      brands: uaData.brands,
      mobile: uaData.mobile,
      platform: uaData.platform,
      getHighEntropyValues(hints) {
        return Promise.resolve(Object.assign({}, uaData, {
          architecture: 'x86',
          bitness: '64',
          model: '',
          platformVersion: uaData.platform === 'Windows' ? '15.0.0' : uaData.platform === 'macOS' ? '10.15.7' : '6.5.0',
          uaFullVersion: (String(profile.ua).match(/Chrome\/([\d.]+)/) || [, '124.0.0.0'])[1],
          fullVersionList: uaData.brands,
        }));
      },
      toJSON() { return { brands: uaData.brands, mobile: uaData.mobile, platform: uaData.platform }; },
    };
    overrideGetter(navigator, 'userAgentData', () => proxy);
  }
}
