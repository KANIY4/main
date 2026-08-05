# Meridian Sample — Android APK

A minimal, installable Android app used to prove out the APK build pipeline: a tap
counter plus the device/OS it's running on. No Gradle, no third-party dependencies —
it builds straight from the Android SDK build-tools.

## Quick start

```bash
export ANDROID_HOME=/path/to/android-sdk
./build.sh
# built: android/build/meridian-sample-debug.apk
```

Install on a connected device:

```bash
adb install -r android/build/meridian-sample-debug.apk
```

To install by copying the file to a phone, enable **Install unknown apps** for whatever
app opens the file (Files, Chrome, Drive). The APK is debug-signed, so Play Protect will
show a "unsafe app blocked" style warning — that is expected for any app not distributed
through the Play Store.

## Prerequisites

| Requirement | Version |
| --- | --- |
| JDK | 17 or newer |
| Android SDK platform | `platforms;android-34` |
| Android SDK build-tools | `build-tools;34.0.0` |

Install the SDK pieces with the commandline tools:

```bash
sdkmanager "platforms;android-34" "build-tools;34.0.0"
```

## Build reference

| Setting | Value |
| --- | --- |
| Application ID | `com.kaniy4.sample` |
| minSdkVersion | 24 (Android 7.0) |
| targetSdkVersion | 34 (Android 14) |
| Output | `android/build/meridian-sample-debug.apk` (~16 KB) |
| Signing | debug keystore, APK Signature Scheme v2 + v3 |

## How `build.sh` works

Gradle is skipped on purpose — the app has no library dependencies, so the raw
build-tools chain is faster and needs no network access at build time.

1. `aapt2 compile` — compiles `res/` into a resources archive.
2. `aapt2 link` — merges resources with the manifest, emits the resource table and `R.java`.
3. `javac` — compiles `src/` plus the generated `R.java` against `android.jar`.
4. `d8` — converts the JVM class files to `classes.dex`.
5. `zipalign` — aligns the archive on 4-byte boundaries for mmap at runtime.
6. `apksigner` — signs with the debug keystore and verifies the result.

## Signing

`build.sh` reuses `~/.android/debug.keystore` and generates it on first run. That key is a
throwaway with the well-known Android debug password — fine for local installs and CI test
builds, and unusable for Play Store distribution.

For a release build, generate your own keystore, keep it out of version control, and pass
the credentials through environment variables or CI secrets:

```bash
keytool -genkeypair -keystore release.jks -alias upload \
    -keyalg RSA -keysize 2048 -validity 10000
```

Never commit a keystore or its passwords to the repository.

## Known constraint

`MainActivity` implements `View.OnClickListener` directly rather than using an anonymous
inner class. `d8` 8.2.2 (build-tools 34.0.0) throws an internal `NullPointerException` when
dexing the anonymous inner class emitted by JDK 21's `javac -source 8`. Implementing the
interface on the activity sidesteps it and reads better anyway.

## CI

`.github/workflows/android-apk.yml` builds this app on every push that touches `android/`
and uploads the APK as a downloadable workflow artifact (kept 30 days). Publishing a GitHub
Release also builds the APK and attaches it to that release as a permanent download link.
