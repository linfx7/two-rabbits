# Two Rabbits

_A specialized developer tool designed to simulate diverse browser configurations and environments._

A Chrome (MV3) extension that mocks six locale-fingerprint signals — **system timezone, browser language, installed Chinese fonts, Intl locale, timezone offset, and emoji/User-Agent** — for user-configured domains only, so a configured site observes the chosen locale profile while every other site keeps your real values.

## What it spoofs

| Signal | Read via | Override |
|---|---|---|
| System timezone | `Intl.DateTimeFormat().resolvedOptions().timeZone` | wrap `Intl.DateTimeFormat`, inject `timeZone` |
| Browser language | `navigator.language` / `languages` | redefine getters |
| Installed Chinese fonts | canvas width-probing + `document.fonts.check` | neutralize `measureText` to the generic family; blacklist `document.fonts.check` |
| Intl locale | `Intl.NumberFormat`/`Collator`/… resolved locale | wrap Intl formatters, force default locale |
| Timezone offset | `Date.prototype.getTimezoneOffset()` | compute from the spoofed zone via `Intl` `longOffset` (DST-correct, no tzdb) |
| Emoji / UA | `navigator.userAgent` / `userAgentData` / `platform` | redefine getters + rewrite request headers |

`Accept-Language` and `User-Agent` **request headers** are also rewritten via `declarativeNetRequest` (needs per-domain host permission, requested on enable). Timezone offset is always derived from the chosen timezone, so it can't drift out of sync.

## Install (load unpacked)

1. Go to `chrome://extensions`.
2. Enable **Developer mode** (top-right).
3. Click **Load unpacked** and select this folder.
4. Pin the extension and open **Options** to add a domain.

## Use

- **Options page:** add a domain (e.g. `browserleaks.com`), pick a **preset** (🇺🇸 US, 🇬🇧 UK, …) and enable it. Grant the host-permission prompt (needed for header rewriting).
- **Popup:** toggle spoofing for the current site; shows the effective profile.
- **Self-test page:** applies a preset directly and shows PASS/FAIL for all six signals. Open it from Options or the popup.

## Verify

1. Add `browserleaks.com` (or the scanner that produced the screenshot) with preset **🇺🇸 US**, enable it, reload the tab.
2. On the site, the six signals should read as the US profile (timezone `America/New_York`, languages `en-US,en`, no Chinese fonts, Intl `en-US`, offset for UTC-5/-4, UA = Windows Chrome).
3. DevTools → Network → a request on that domain: `Accept-Language` and `User-Agent` reflect the preset.
4. Open the **self-test page** → all six PASS.
5. Disable the rule (or visit a non-configured domain) → real values return.

Console quick-checks on a spoofed page:
```js
navigator.languages
Intl.DateTimeFormat().resolvedOptions().timeZone
new Date().getTimezoneOffset()
Intl.NumberFormat().resolvedOptions().locale
navigator.userAgentData.platform
```

## How injection works

Overrides must run in the page's **MAIN world** (isolated-world content scripts are invisible to the page). The service worker keeps the config in memory and, on `webNavigation.onCommitted` / `onHistoryStateUpdated`, calls `chrome.scripting.executeScript({ world:'MAIN', injectImmediately:true, func: applySpoof, args:[profile] })` — landing before the page's own scripts. `applySpoof` is fully self-contained because `func` is serialized via `toString()`.

## Structure

```
manifest.json
src/
  background/service-worker.js   webNavigation → MAIN-world inject; DNR header rules; in-memory config
  inject/apply-spoof.js          the self-contained applySpoof(profile) (all 6 signals)
  data/presets.js                country presets, UA vendor templates, resolveProfile()
  data/store.js                  storage + host-permission helpers
  options/ options.html|.js      domain CRUD + preset picker
  popup/   popup.html|.js        current-site toggle + effective profile
  test/    test.html|.js         in-page PASS/FAIL for all 6 signals
```

## Limitations / future

- Pixel-level canvas emoji replacement and full `Date` method spoofing (`toString`/`getHours`) are not done — emoji is best-effort via UA.
- `navigator.userAgentData` is replaced with a consistent object; high-entropy hints are synthesized.
- Firefox MV3 port not provided (MAIN-world + DNR parity differ).

## Privacy & permissions

- [Privacy Policy](docs/PRIVACY.md) — data handling for the Chrome Web Store.
- [Permission Justification](docs/PERMISSIONS.md) — why each manifest permission is needed.

## License

MIT — see [LICENSE](LICENSE).
