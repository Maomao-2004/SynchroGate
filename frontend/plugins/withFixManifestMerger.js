const { withAndroidManifest } = require('@expo/config-plugins');

/**
 * Fix manifest merger conflict between expo-notifications and @react-native-firebase/messaging
 * Both try to set com.google.firebase.messaging.default_notification_color
 * This plugin adds tools:replace to allow our value to override
 */
const withFixManifestMerger = (config) => {
  return withAndroidManifest(config, async (config) => {
    const androidManifest = config.modResults;

    // Ensure tools namespace is declared in manifest root
    if (!androidManifest.manifest.$['xmlns:tools']) {
      androidManifest.manifest.$['xmlns:tools'] = 'http://schemas.android.com/tools';
    }

    const mainApplication = androidManifest.manifest.application?.[0];
    if (!mainApplication) {
      return config;
    }

    // Find and fix the notification color meta-data entries
    if (mainApplication['meta-data']) {
      mainApplication['meta-data'] = mainApplication['meta-data'].map((metaData) => {
        const name = metaData.$['android:name'];
        
        // Fix notification color conflict
        if (name === 'com.google.firebase.messaging.default_notification_color') {
          metaData.$['tools:replace'] = 'android:resource';
        }
        
        // Fix notification icon conflict if it exists
        if (name === 'com.google.firebase.messaging.default_notification_icon') {
          metaData.$['tools:replace'] = 'android:resource';
        }
        
        // Fix notification channel id conflict if it exists
        if (name === 'com.google.firebase.messaging.default_notification_channel_id') {
          metaData.$['tools:replace'] = 'android:value';
        }
        
        return metaData;
      });
    }

    return config;
  });
};

module.exports = withFixManifestMerger;
