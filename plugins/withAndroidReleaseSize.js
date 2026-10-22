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
 * The keep rules for the libraries our own modules link (JNA/UniFFI, sshj,
 * BouncyCastle, the gomobile bridge, the GPUI JNI host) are consumer rules of
 * those modules (modules/ghostex-native and modules/gx-chat-core,
 * android/proguard-rules.pro). React Native, Expo modules, ML Kit and Play
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

const RULES_BEGIN = '# BEGIN plugins/withAndroidReleaseSize.js';
const RULES_END = '# END plugins/withAndroidReleaseSize.js';
const APP_RULES = `${RULES_BEGIN}
# react-native-worklets ships its keep rules but does not wire them as consumer
# rules (same lines as node_modules/react-native-worklets/android/proguard-rules.pro).
-keep class com.swmansion.worklets.** { *; }
-keep class com.facebook.react.fabric.** { *; }
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

function withAppProguardRules(config) {
  return withDangerousMod(config, [
    'android',
    async (cfg) => {
      const file = path.join(cfg.modRequest.platformProjectRoot, 'app', 'proguard-rules.pro');
      const contents = fs.readFileSync(file, 'utf8');
      const begin = contents.indexOf(RULES_BEGIN);
      const end = contents.indexOf(RULES_END);
      const base = begin === -1 ? contents : contents.slice(0, begin) + contents.slice(end + RULES_END.length + 1);
      fs.writeFileSync(file, `${base.trimEnd()}\n\n${APP_RULES}`);
      return cfg;
    },
  ]);
}

module.exports = function withAndroidReleaseSize(config) {
  return withAppProguardRules(withReleaseGradleProperties(config));
};
