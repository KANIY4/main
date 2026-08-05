#!/usr/bin/env bash
#
# Builds a debug-signed APK using the Android SDK build-tools directly
# (aapt2 + javac + d8 + zipalign + apksigner) — no Gradle, no network at build time.
#
# Requirements:
#   - JDK 17 or newer on PATH
#   - ANDROID_HOME pointing at an SDK with:
#       platforms/android-34
#       build-tools/34.0.0
#
# Usage: ./build.sh   (output: build/meridian-sample-debug.apk)

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUILD_TOOLS_VERSION="34.0.0"
COMPILE_SDK="android-34"
MIN_SDK=24
TARGET_SDK=34
APK_NAME="meridian-sample-debug.apk"

SDK_HOME="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}"
if [[ -z "$SDK_HOME" ]]; then
    echo "error: set ANDROID_HOME (or ANDROID_SDK_ROOT) to your Android SDK path" >&2
    exit 1
fi

BUILD_TOOLS="$SDK_HOME/build-tools/$BUILD_TOOLS_VERSION"
ANDROID_JAR="$SDK_HOME/platforms/$COMPILE_SDK/android.jar"

for required in "$BUILD_TOOLS/aapt2" "$BUILD_TOOLS/d8" "$BUILD_TOOLS/zipalign" "$BUILD_TOOLS/apksigner" "$ANDROID_JAR"; do
    if [[ ! -e "$required" ]]; then
        echo "error: missing $required" >&2
        echo "hint: sdkmanager \"platforms;$COMPILE_SDK\" \"build-tools;$BUILD_TOOLS_VERSION\"" >&2
        exit 1
    fi
done

OUT="$PROJECT_DIR/build"
rm -rf "$OUT"
mkdir -p "$OUT/res" "$OUT/gen" "$OUT/classes" "$OUT/dex"

echo "==> aapt2 compile"
"$BUILD_TOOLS/aapt2" compile --dir "$PROJECT_DIR/res" -o "$OUT/res/resources.zip"

echo "==> aapt2 link"
"$BUILD_TOOLS/aapt2" link \
    -o "$OUT/unsigned-unaligned.apk" \
    -I "$ANDROID_JAR" \
    --manifest "$PROJECT_DIR/AndroidManifest.xml" \
    --java "$OUT/gen" \
    --min-sdk-version "$MIN_SDK" \
    --target-sdk-version "$TARGET_SDK" \
    --auto-add-overlay \
    "$OUT/res/resources.zip"

echo "==> javac"
find "$PROJECT_DIR/src" "$OUT/gen" -name '*.java' > "$OUT/sources.txt"
javac \
    -source 8 -target 8 \
    -bootclasspath "$ANDROID_JAR" \
    -classpath "$ANDROID_JAR" \
    -d "$OUT/classes" \
    -nowarn \
    @"$OUT/sources.txt" 2>&1 | grep -v 'bootstrap class path' || true

echo "==> d8"
find "$OUT/classes" -name '*.class' -print0 | xargs -0 \
    "$BUILD_TOOLS/d8" --lib "$ANDROID_JAR" --min-api "$MIN_SDK" --output "$OUT/dex"

echo "==> package dex"
cp "$OUT/unsigned-unaligned.apk" "$OUT/staged.apk"
(cd "$OUT/dex" && zip -q "$OUT/staged.apk" classes.dex)

echo "==> zipalign"
"$BUILD_TOOLS/zipalign" -f -p 4 "$OUT/staged.apk" "$OUT/aligned.apk"

# Debug keystore: reused if present, generated on first run.
# This is a throwaway key with the well-known Android debug password.
# It is fine for local installs and CI test builds, and must NEVER be used
# for a Play Store release — release builds need your own private keystore.
KEYSTORE="${DEBUG_KEYSTORE:-$HOME/.android/debug.keystore}"
if [[ ! -f "$KEYSTORE" ]]; then
    echo "==> generating debug keystore at $KEYSTORE"
    mkdir -p "$(dirname "$KEYSTORE")"
    keytool -genkeypair \
        -keystore "$KEYSTORE" \
        -storepass android -keypass android \
        -alias androiddebugkey \
        -keyalg RSA -keysize 2048 -validity 10000 \
        -dname "CN=Android Debug,O=Android,C=US"
fi

echo "==> apksigner"
"$BUILD_TOOLS/apksigner" sign \
    --ks "$KEYSTORE" \
    --ks-pass pass:android \
    --key-pass pass:android \
    --ks-key-alias androiddebugkey \
    --out "$OUT/$APK_NAME" \
    "$OUT/aligned.apk"

"$BUILD_TOOLS/apksigner" verify --print-certs "$OUT/$APK_NAME" > /dev/null

rm -f "$OUT/unsigned-unaligned.apk" "$OUT/staged.apk" "$OUT/aligned.apk" "$OUT/sources.txt"

echo
echo "built: $OUT/$APK_NAME ($(du -h "$OUT/$APK_NAME" | cut -f1))"
