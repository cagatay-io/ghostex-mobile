const app = require('./app.json');

function releaseBuildNumber(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) {
    throw new Error(`GHOSTEX_RELEASE_VERSION must be MAJOR.MINOR.PATCH, got ${version}`);
  }
  return Number(match[1]) * 10000 + Number(match[2]) * 100 + Number(match[3]);
}

// Android in-app self-update from GitHub Releases. The app is distributed as a
// sideloaded APK today, so it checks GitHub for a newer release and installs it
// through the system package installer. Google Play rejects apps that install
// other packages, so set GHOSTEX_ANDROID_SELF_UPDATE=0 before a Play Store
// build: that blocks the REQUEST_INSTALL_PACKAGES permission in the manifest
// on the next `expo prebuild` and makes `ANDROID_SELF_UPDATE_ENABLED`
// (src/config/featureFlags.ts) false, which removes the update check and UI.
// The permission is blocked (tools:node="remove"), not just left out, so a
// prebuild over an android/ folder generated for the GitHub APK, or a library
// that declares it, cannot carry it into the Play build.
// `tooling/release-mobile/android.sh` (GHOSTEX_ANDROID_DISTRIBUTION=play)
// fails the build when it is still there.
const ANDROID_SELF_UPDATE_PERMISSION = 'android.permission.REQUEST_INSTALL_PACKAGES';

function androidSelfUpdateEnabled() {
  const raw = process.env.GHOSTEX_ANDROID_SELF_UPDATE;
  if (raw === undefined || raw === '' || raw === '1') return true;
  if (raw === '0') return false;
  throw new Error(`GHOSTEX_ANDROID_SELF_UPDATE must be 0 or 1, got ${raw}`);
}

module.exports = () => {
  const version = process.env.GHOSTEX_RELEASE_VERSION || app.expo.version;
  const buildNumber = process.env.GHOSTEX_RELEASE_BUILD_NUMBER || String(releaseBuildNumber(version));
  const androidSelfUpdate = androidSelfUpdateEnabled();
  const basePermissions = app.expo.android.permissions ?? [];
  const baseBlockedPermissions = app.expo.android.blockedPermissions ?? [];

  return {
    ...app.expo,
    version,
    extra: {
      ...app.expo.extra,
      androidSelfUpdate,
    },
    ios: {
      ...app.expo.ios,
      buildNumber,
    },
    android: {
      ...app.expo.android,
      versionCode: Number(buildNumber),
      permissions: androidSelfUpdate ? [...basePermissions, ANDROID_SELF_UPDATE_PERMISSION] : basePermissions,
      blockedPermissions: androidSelfUpdate
        ? baseBlockedPermissions
        : [...baseBlockedPermissions, ANDROID_SELF_UPDATE_PERMISSION],
    },
  };
};
