// fcmBackgroundHandler.js - FCM Background Message Handler
// React Native Firebase auto-initializes from google-services.json
// Just use messaging() directly - it uses the auto-initialized default app

const isWeb = (
  typeof window !== 'undefined' && 
  typeof navigator !== 'undefined' && 
  (navigator.product === 'Gecko' || navigator.product === 'WebKit' || navigator.product === 'Blink')
) || (
  typeof process !== 'undefined' && 
  process.env && 
  process.env.EXPO_PUBLIC_PLATFORM === 'web'
);

const isJest = typeof jest !== 'undefined';
const shouldRegister = !isWeb && !isJest;

if (shouldRegister) {
  try {
    // React Native Firebase auto-initializes from google-services.json
    // Just try to use messaging - it will use the auto-initialized default app
    let messagingModule = null;
    try {
      messagingModule = require('@react-native-firebase/messaging');
    } catch (requireError) {
      // Module doesn't exist - this is OK, app wasn't built with FCM
      console.log('ℹ️ @react-native-firebase/messaging not available - using Expo notifications');
    }
    
    // Only continue if module was loaded successfully
    if (messagingModule && messagingModule.default) {
      const messaging = messagingModule.default;
      
      if (typeof messaging === 'function') {
        let messagingInstance = null;
        try {
          // Get messaging instance - uses auto-initialized default app
          messagingInstance = messaging();
        } catch (instanceError) {
          console.log('ℹ️ Could not get FCM messaging instance:', instanceError.message);
        }
        
        if (messagingInstance && typeof messagingInstance.setBackgroundMessageHandler === 'function') {
          messagingInstance.setBackgroundMessageHandler(async remoteMessage => {
            try {
              console.log('🔔 FCM Background Message received (app closed/background):', {
                title: remoteMessage?.notification?.title,
                body: remoteMessage?.notification?.body,
                data: remoteMessage?.data
              });
              
              // NOTE: When app is closed, FCM automatically displays the notification
              // from the 'notification' payload. This handler is mainly for logging.
              // When app is in background, the notification is also auto-displayed.
              // We don't need to manually show it here.
              
              return Promise.resolve();
            } catch (handlerError) {
              console.error('Error in FCM background handler:', handlerError);
              return Promise.resolve();
            }
          });
          
          console.log('✅ FCM Background message handler registered');
          console.log('   - Notifications will work when app is CLOSED (auto-displayed by FCM)');
          console.log('   - Notifications will work when app is in BACKGROUND (auto-displayed by FCM)');
          console.log('   - Works in both DEVELOPMENT and PRODUCTION builds');
        }
      }
    }
  } catch (e) {
    console.log('ℹ️ FCM background handler setup failed - using Expo notifications');
  }
}

export {};
