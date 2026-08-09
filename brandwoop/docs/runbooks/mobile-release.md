# Runbook — Android APK and AAB release

Vercel does not build the Android app. Vercel hosts the portal, the API and the
controlled download page; **Expo EAS** builds and signs the Android artefacts
from the same Git tag as the web release.

## Prerequisites (blocking)

- Decision **D-04**: final application ID, display name and signing credential
  owner. `apps/mobile/app.config.ts` throws on a production build while the
  package name is still the placeholder.
- BrandWoop holds the keystore and an encrypted recovery copy. The development
  team never takes custody.
- Expo project created under a BrandWoop-owned account; `EXPO_TOKEN` stored as
  an environment secret on the `production` GitHub Environment.

## Profiles (`apps/mobile/eas.json`)

| Profile          | Output             | Use                                                              |
| ---------------- | ------------------ | ---------------------------------------------------------------- |
| `development`    | Dev client         | Local development                                                |
| `preview`        | Internal APK       | UAT via authenticated tester link. Never described as production |
| `production`     | AAB                | Play Store submission                                            |
| `production-apk` | Release-signed APK | Direct download from the BrandWoop page                          |

## Release sequence

1. Web release completes and is healthy.
2. Tag the release: `git tag -a v1.0.0 -m "Release 1.0.0" && git push origin v1.0.0`.
3. `release-mobile.yml` fires on the tag, confirms `HEAD` is an exact tag match,
   and builds with the production profile after the environment approver signs off.
4. The workflow downloads the artefact, computes its SHA-256, and writes the
   commit, artefact URL and checksum into the run summary.
5. Record the signing certificate fingerprint (`eas credentials`) in the release
   notes.

## Install verification (before publishing the link)

- Fresh install, upgrade over the previous release, and uninstall.
- Supported Android versions per decision D-09, including one low or mid-range
  physical device.
- Sign-in, camera capture, location-denied path, poor-network upload retry,
  deep links, notification permission prompt, and sign-out.
- Confirm the app requests no background location permission.

## Publishing the download

The download page lives on a BrandWoop domain and shows the version, release
date, SHA-256 checksum, release notes and an installation warning about
enabling installs from unknown sources.

If unauthenticated EAS URLs are disabled, the page brokers an authorised link or
serves an approved copy of the artefact privately. A raw EAS build URL is never
published as the permanent download location.

## Version rules

- `versionCode` increases on every build and is never reused, including for a
  rebuilt release.
- `versionName` matches the Git tag.
- A build from a branch is never distributed as a release.
