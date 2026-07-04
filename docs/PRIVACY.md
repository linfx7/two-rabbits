# Privacy Policy — Two Rabbits

_Last updated: July 4, 2026_

**Two Rabbits** is a specialized developer tool designed to simulate diverse browser configurations and environments. It lets you override — for testing and development purposes — the locale- and environment-related signals your browser exposes (such as time zone, browser language, Internationalization locale, installed fonts, and User-Agent) on a per-domain basis that you explicitly configure.

The short version: **Two Rabbits does not collect, transmit, or sell your personal data. It contains no analytics, no telemetry, and no advertising. Your configuration stays on your device.**

## 1. Data we collect

**None.** Two Rabbits does not collect personally identifiable information, browsing history, page content, credentials, or any other personal data. There is no account, no sign-in, and no server operated by the developer that receives your data.

## 2. Data stored on your device

The only thing the extension stores is **your own configuration**: the list of domains you chose to simulate environments for, and the simulation profile (a built-in preset) you selected for each. This is saved locally using the browser's built-in `chrome.storage.local` facility — on your machine, and it is never synced to any server operated by the developer.

You can erase this configuration at any time by removing domains in the Options page, revoking a domain's access, or uninstalling the extension (uninstallation removes all of the extension's local data).

## 3. How your browser environment is modified

For the domains you explicitly configure, Two Rabbits temporarily adjusts the values those pages can read — for example, it may report a different time zone, language, or User-Agent. **This adjustment runs entirely on your device**, by overriding browser JavaScript APIs in the page and, for HTTP request headers (`Accept-Language`, `User-Agent`), by adjusting those headers locally through the browser's `declarativeNetRequest` feature.

No real or simulated data is sent to the developer. The only thing that travels over the network is the ordinary HTTP traffic your browser already makes to those sites; the headers on those requests reflect the simulated values — which is exactly the behavior you enabled.

## 4. Third parties

Two Rabbits does **not** use any third-party analytics, advertising, tracking, or crash-reporting services, and it does not load remote scripts or remote code. The extension communicates only between its own on-device components (popup, options page, and background service worker).

## 5. Permissions

A detailed, permission-by-permission explanation is in [PERMISSIONS.md](./PERMISSIONS.md). In summary, the permissions let the extension: save your local configuration, detect when you navigate to a configured domain, apply the simulation on-device, and adjust request headers for configured domains — nothing more.

## 6. Your choices

- Add or remove a configured domain at any time from the Options page.
- Toggle simulation on or off for the current site from the popup.
- Grant or revoke per-domain host access; access is requested only for the domains you add, and only when you take an explicit action.
- Uninstall the extension to remove all of its associated data.

## 7. Children's privacy

Two Rabbits is a developer tool and is not directed at children. It does not knowingly collect data from anyone.

## 8. Changes to this policy

If this policy changes, the updated version will be published with a revised date before a new version of the extension is released.

## 9. Contact

Questions about this policy? Contact: **linfx7@gmail.com**
