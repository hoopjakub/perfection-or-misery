# 05 · Updates and the APK

> Part of the [release set](00-README.md). Status: **plan**, 29 September 2026. From the maintainer's answer to website Q5: the Play Store shows "coming soon", the website offers an official build to download, and the app should check on start, silently, whether it's the latest version and let you update.

## 1 · Two kinds of update

| Kind | What changes | How it arrives |
|---|---|---|
| **Over the air (EAS Update)** | JavaScript, styles, images, text, translations, the bundled database if it's an asset | The app downloads it on start and applies it on the next launch; no install |
| **A new build (APK)** | Native code: a new native module (for example `expo-network`, [02](02-OFFLINE.md)), permissions, an Expo SDK upgrade, the app icon | The player downloads and installs a new APK |

Expo's documentation: EAS Update covers "JS, styling, and images", copy, translations and layouts; native code, permissions and SDK upgrades need a new build, and **runtime versions** keep an update from reaching a build whose native code doesn't match ([EAS Update](https://docs.expo.dev/eas-update/introduction/)). It works for any build that includes `expo-updates`, wherever it was installed from, since the update comes from Expo's servers, not from a store. **Probe:** confirm it on a sideloaded preview build before relying on it (a known class of reports is updates not reaching APK installs because of a channel or runtime mismatch). **Couldn't verify:** the free plan's monthly-active-user allowance for updates; read the pricing page when setting it up.

## 2 · The "new build available" check

A sideloaded APK gets no store telling it a new version exists, so the app asks.

- **The source of truth:** a small public record of the latest build: version, build number, the APK's download address, its SHA-256, the minimum version still allowed, and a one-line "what's new". Either a row in a public `app_releases` table (read-only, written by the maintainer) or a `latest.json` file on the website. **Recommendation: the website file**, because it's deployed with the release anyway and needs no database access.
- **On start, silently:** fetch it (in the background, never blocking the Home screen); compare with the app's own build number (`expo-application`).
- **If newer:** a quiet strip on Home, "A new version is out · What's new · Update". If the running version is below the minimum, a full screen instead (for a breaking server change).
- **Update:** download the APK to the app's own storage (`expo-file-system`), check its SHA-256 against the record, and hand it to Android's installer (`expo-intent-launcher` with the install intent). Android then shows its own confirmation, and the first time asks the player to allow installs from this app ("Install unknown apps"). An ordinary app can't install silently; that needs system privileges.
- **Permission:** the app declares `REQUEST_INSTALL_PACKAGES`. **Google Play forbids using it for self-updates,** so the Play Store flavour (when it exists) must not include it or this flow; Play updates through the store. That's a third build difference to keep in `eas.json` (the store flavour).
- **The same signing key** for every build, or Android refuses the update (EAS already signs every build with the same keystore; the App Links fingerprint in P8-174 is that key).

## 3 · Where the APK is hosted

| Option | For | Against |
|---|---|---|
| **GitHub Releases** | Free, stable download addresses, built for binaries, a release page per version | The repository's releases are public |
| Vercel (a file in the site) | One place | Deployments are meant for web files; large binaries count against limits (**couldn't verify** the exact per-file limit) |
| Supabase Storage | Already in use | The free plan's upload limit per file may be below an APK's size (**couldn't verify**) |

**Recommendation: GitHub Releases,** linked from the website's download button and from `latest.json`. **Probe:** the APK's size (a preview build) against each option's limit.

## 4 · Steps

1. `expo-updates` in the app with channels matching the build profiles (`personal`, `legal`); a first over-the-air update to a preview build to prove it.
2. `latest.json` on the website, written by a release script from `app.json`'s version and the build number.
3. The check, the strip, the download, the checksum and the installer hand-off.
4. The store flavour without the install permission.

**Done when.** A preview build shown "A new version is out" installs the next build over itself and keeps the player's data; a tampered APK (wrong checksum) is refused; the store flavour's manifest has no `REQUEST_INSTALL_PACKAGES`.
