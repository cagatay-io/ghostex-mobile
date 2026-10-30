// Expo's default Metro config, plus Markdown as an asset type: Settings › Licences reads the bundled
// THIRD_PARTY_NOTICES.md as a file, so it ships with the build and its over-the-air updates unchanged.
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
config.resolver.assetExts.push('md');

module.exports = config;
