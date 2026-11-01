// The native module's XCTest bundle (modules/ghostex-native/ios/Tests, the `Tests` test spec in
// GhostexNative.podspec) needs CocoaPods to install the pod with that test spec. Expo's autolinking
// adds local modules without test specs, but it leaves a pod alone that the Podfile already lists, so
// this plugin lists GhostexNative itself, with the same path autolinking uses plus `:testspecs`.
// `pod install` then also creates the GhostexNative-Unit-Tests target and scheme
// (`xcodebuild test -scheme GhostexNative-Unit-Tests`); the app target builds and links exactly as before.
const { withPodfile } = require('expo/config-plugins');

const POD_LINE = "  pod 'GhostexNative', :path => '../modules/ghostex-native/ios', :testspecs => ['Tests']";
const ANCHOR = /^(\s*)use_expo_modules!/m;

function withGhostexNativeTests(config) {
  return withPodfile(config, (cfg) => {
    const contents = cfg.modResults.contents;
    if (contents.includes(POD_LINE)) return cfg;
    if (!ANCHOR.test(contents)) {
      throw new Error('withGhostexNativeTests: the generated Podfile has no use_expo_modules! line to precede.');
    }
    cfg.modResults.contents = contents.replace(ANCHOR, `${POD_LINE}\n$&`);
    return cfg;
  });
}

module.exports = withGhostexNativeTests;
