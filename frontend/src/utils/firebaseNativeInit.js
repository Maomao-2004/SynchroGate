// firebaseNativeInit.js - Explicitly initialize React Native Firebase DEFAULT app
// This ensures the default app exists before messaging() is called

import { Platform } from 'react-native';

const firebaseConfig = {
  apiKey: "AIzaSyCUoMISHi3xbhdf_ugGd6UYZy_H9Gp7mzs",
  authDomain: "guardientry-database.firebaseapp.com",
  projectId: "guardientry-database",
  storageBucket: "guardientry-database.firebasestorage.app",
  messagingSenderId: "149886535931",
  appId: "1:149886535931:android:243864d268dc9f2969085e",
};

let defaultApp = null;
let initAttempted = false;

/**
 * Initialize React Native Firebase DEFAULT app
 * This MUST be called before using messaging()
 * 
 * CRITICAL: React Native Firebase should auto-initialize from google-services.json
 * If it doesn't, the Google Services plugin might not be applied in build.gradle
 */
export const initializeFirebaseNative = () => {
  if (Platform.OS === 'web' || initAttempted) {
    return defaultApp;
  }

  initAttempted = true;

  try {
    const rnFirebase = require('@react-native-firebase/app').default;
    
    // CRITICAL: Try to get DEFAULT app first (should be auto-initialized from google-services.json)
    try {
      defaultApp = rnFirebase.app(); // Gets DEFAULT app
      console.log('✅ React Native Firebase DEFAULT app exists (auto-initialized from google-services.json)');
      return defaultApp;
    } catch (getError) {
      // DEFAULT app doesn't exist - this means google-services.json wasn't processed
      console.error('❌ DEFAULT app not found - google-services.json was not processed during build');
      console.error('   ERROR:', getError?.message);
      console.error('   SOLUTION: Rebuild the app - Google Services plugin must be applied');
      console.error('   Check: android/app/build.gradle should have: apply plugin: "com.google.gms.google-services"');
      
      // Try to initialize manually as fallback (might not work if native side isn't configured)
      try {
        console.log('⚠️ Attempting manual initialization (may not work)...');
        defaultApp = rnFirebase.initializeApp(firebaseConfig);
        console.log('✅ React Native Firebase initializeApp() called');
        
        // Try to verify immediately
        try {
          const verifyApp = rnFirebase.app();
          if (verifyApp) {
            console.log('✅ DEFAULT app verified after manual init');
            return defaultApp;
          }
        } catch (verifyError) {
          console.error('❌ Verification failed after manual init:', verifyError?.message);
        }
      } catch (initError) {
        console.error('❌ Manual initialization also failed:', initError?.message);
        console.error('   REBUILD REQUIRED: App must be rebuilt with Google Services plugin enabled');
      }
      
      return null;
    }
  } catch (e) {
    console.error('❌ React Native Firebase not available:', e?.message);
    console.error('   This means @react-native-firebase/app is not properly installed');
    return null;
  }
};

/**
 * Get the DEFAULT Firebase app
 * Initializes if not already done
 */
export const getFirebaseNativeApp = () => {
  if (!initAttempted) {
    return initializeFirebaseNative();
  }
  return defaultApp;
};

// CRITICAL: Initialize immediately on module load
if (Platform.OS !== 'web') {
  initializeFirebaseNative();
}

export default { initializeFirebaseNative, getFirebaseNativeApp };
