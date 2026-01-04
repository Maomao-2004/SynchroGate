// metro.config.js
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Add TypeScript file extensions
config.resolver.sourceExts.push('tsx', 'ts');

module.exports = config;
