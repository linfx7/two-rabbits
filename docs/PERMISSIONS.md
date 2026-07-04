# Permission Justification — Two Rabbits

**Two Rabbits** is a specialized developer tool designed to simulate diverse browser configurations and environments. For testing and development purposes, it overrides the locale- and environment-related signals a page can read — system time zone, browser language, Internationalization (Intl) locale, installed fonts, timezone offset, and User-Agent — on domains the user explicitly configures.

Every permission requested serves a single, narrowly scoped purpose tied directly to that functionality. The extension **does not collect user data, does not use remote code, and makes no network requests to any developer-operated server.**

## Single purpose

To simulate browser locale and environment configurations on a per-domain basis for development, QA, and testing — nothing more.

## Permissions

### `scripting`
Injects the on-device simulation routine into the **MAIN world** of the domains the user has explicitly configured, so the simulated values (time zone, language, Intl, User-Agent, and so on) are the ones the page's own JavaScript observes. MAIN-world injection is required because overrides applied in an isolated content-script world would be invisible to the page. The injected code is bundled with the extension — no remote code is loaded or evaluated.

### `storage`
Saves the user's configuration — the list of configured domains and the chosen simulation profile for each — locally on the device via `chrome.storage.local`. No data is sent to or synced with any developer server.

### `webNavigation`
Detects when the user navigates to a configured domain — including single-page-app route changes (`pushState` / `replaceState`) that do not trigger a full page load — so the simulation can be applied as early as possible, before the page reads the real values. Navigation URLs are matched in memory against the user's configured domain list; they are not stored or transmitted.

### `declarativeNetRequest`
Ensures that, for configured domains, the `Accept-Language` and `User-Agent` HTTP request headers reflect the simulated environment (not just the JavaScript-layer values), so the simulation is consistent at the network layer too. This is implemented with static, locally evaluated dynamic rules processed by the browser. No request body is read, and no data is sent to the developer.

### `activeTab`
Allows the popup, when the user explicitly clicks the extension's action, to read the active tab's URL in order to show whether a simulation profile applies to the current site and to let the user toggle it. Access is scoped to that explicit user invocation.

### `tabs`
Lets the popup identify the active tab's site (to display and toggle the effective profile) and, when the user enables simulation for the current tab, reload that tab so the simulation takes effect. The extension does not read page content and does not store tab data.

### Optional host permission (`*://*/*`)
Requested **per domain**, at the moment the user explicitly adds a domain, via `chrome.permissions.request()` tied to a user gesture. The extension never holds blanket host access — permission exists only for the specific origins the user added, and it can be revoked by removing the domain. This is required so that both the MAIN-world simulation and the header rewriting can take effect on those origins.

## Data handling summary

- No personally identifiable information is collected.
- No analytics, telemetry, advertising, or crash reporting.
- No remote code is loaded or evaluated.
- The only data stored is the user's own configuration, locally on the device.
- See [PRIVACY.md](./PRIVACY.md) for the full privacy policy.
