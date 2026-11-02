/**
 * CDXC:Release 2026-10-15 DECISION: the released APK was 229 MB. The user chose,
 * on top of shipping arm64-v8a only (GHOSTEX_ANDROID_ABIS in
 * .github/workflows/release-gpui-android.yml), to compress the native libraries
 * in the APK and to turn on R8 code shrinking for release builds. Resource
 * shrinking stays off: it would save under 1 MB (all of res/ is 1.3 MB) and
 * React Native resolves some resources by name at run time, which the shrinker
 * cannot see.
 *
 * Compressed libraries are unpacked by Android at install, so the installed app
 * takes about the uncompressed library size on top of the APK; that trades a
 * smaller download for a slightly slower install.
 *
 * CDXC:Release 2026-10-22 DECISION: the user chose to drop BouncyCastle's Picnic
 * tables (lowmcL1/L3/L5.bin.properties, 1.2 MB in the APK). Only a Picnic signature
 * reads them; sshj and the replaced "BC" provider never ask for Picnic.
 *
 * The keep rules for the libraries our own module links (sshj, BouncyCastle,
 * the gomobile bridge) are consumer rules of that module
 * (modules/ghostex-native/android/proguard-rules.pro). React Native, Expo modules, ML Kit and Play
 * services ship their own consumer rules; this plugin adds only the app-level
 * rules for libraries whose rules are not wired as consumer files.
 */
const { withDangerousMod, withGradleProperties } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

const RELEASE_GRADLE_PROPERTIES = {
  'android.enableMinifyInReleaseBuilds': 'true',
  'android.enableShrinkResourcesInReleaseBuilds': 'false',
  'expo.useLegacyPackaging': 'true',
  'android.packagingOptions.excludes': '/org/bouncycastle/pqc/crypto/picnic/**',
};

/**
 * CDXC:RemotePairing 2026-11-02 WHY:
 * Issue #394: the Android Scan code camera never read a QR in release builds ("not scanning",
 * while the phone's own camera read the same QR). Since R8 was turned on (10-15), ML Kit's
 * registrars (BarcodeRegistrar, VisionCommonRegistrar, CommonComponentRegistrar) shipped
 * without their no-argument constructors: the rule ML Kit pulls in through firebase-components
 * 16.1.0 keeps the classes but not the constructors, and R8 full mode drops them. ML Kit then
 * cannot build a barcode scanner, expo-camera never attaches its analyzer, and onBarcodeScanned
 * never fires, with no error on screen (expo/expo#52274, fixed in expo-camera by #52377 with this
 * same rule). Debug builds were unaffected. Keep it until the app resolves an expo-camera or
 * firebase-components (19.0.0+) that ships the rule.
 */
const RULES_BEGIN = '# BEGIN plugins/withAndroidReleaseSize.js';
const RULES_END = '# END plugins/withAndroidReleaseSize.js';
const APP_RULES = `${RULES_BEGIN}
# react-native-worklets ships its keep rules but does not wire them as consumer
# rules (same lines as node_modules/react-native-worklets/android/proguard-rules.pro).
-keep class com.swmansion.worklets.** { *; }
-keep class com.facebook.react.fabric.** { *; }
# ML Kit builds its component registrars (barcode, vision, common) by reflection through
# their no-argument constructors; see CDXC:RemotePairing above APP_RULES.
-keep class * implements com.google.firebase.components.ComponentRegistrar { void <init>(); }
${RULES_END}
`;

function withReleaseGradleProperties(config) {
  return withGradleProperties(config, (cfg) => {
    for (const [key, value] of Object.entries(RELEASE_GRADLE_PROPERTIES)) {
      const existing = cfg.modResults.find((item) => item.type === 'property' && item.key === key);
      if (existing) {
        existing.value = value;
      } else {
        cfg.modResults.push({ type: 'property', key, value });
      }
    }
    return cfg;
  });
}

/** Writes this plugin's rules block into `file`, replacing the block a previous run wrote. */
function writeAppProguardRules(file) {
  const contents = fs.readFileSync(file, 'utf8');
  const begin = contents.indexOf(RULES_BEGIN);
  const end = contents.indexOf(RULES_END);
  const base = begin === -1 ? contents : contents.slice(0, begin) + contents.slice(end + RULES_END.length + 1);
  fs.writeFileSync(file, `${base.trimEnd()}\n\n${APP_RULES}`);
}

function withAppProguardRules(config) {
  return withDangerousMod(config, [
    'android',
    async (cfg) => {
      writeAppProguardRules(path.join(cfg.modRequest.platformProjectRoot, 'app', 'proguard-rules.pro'));
      return cfg;
    },
  ]);
}

module.exports = function withAndroidReleaseSize(config) {
  return withAppProguardRules(withReleaseGradleProperties(config));
};
module.exports.writeAppProguardRules = writeAppProguardRules;
