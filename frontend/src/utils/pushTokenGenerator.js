// pushTokenGenerator.js - Utility function to generate and save FCM tokens
// Can be called from anywhere (not just React hooks)
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { doc, setDoc } from 'firebase/firestore';
import { db } from './firebaseConfig';
import { updateUserFcmTokenInLinks } from './linkFcmTokenManager';

// Import Firebase initialization - ensures DEFAULT app exists
import { initializeFirebaseNative, getFirebaseNativeApp } from './firebaseNativeInit';

// CRITICAL: Ensure DEFAULT app is initialized before loading messaging
if (Platform.OS !== 'web') {
  initializeFirebaseNative();
}

// Load messaging module (Firebase should already be initialized)
let messaging = null;
if (Platform.OS !== 'web') {
  try {
    const messagingModule = require('@react-native-firebase/messaging');
    if (messagingModule && messagingModule.default && typeof messagingModule.default === 'function') {
      messaging = messagingModule.default;
      console.log('✅ FCM messaging module loaded in pushTokenGenerator');
    }
  } catch (e) {
    console.log('ℹ️ @react-native-firebase/messaging not available (requires custom dev build)');
  }
}

/**
 * Generate and save FCM push token for a user
 * Called on registration and login to ensure tokens are always up to date
 * @param {Object} user - User object with uid, role, parentId, studentId
 * @returns {Promise<string|null>} FCM token or null if not available
 */
export const generateAndSavePushToken = async (user) => {
  console.log('🔔 generateAndSavePushToken called for user:', {
    hasUser: !!user,
    hasUid: !!user?.uid,
    role: user?.role,
    parentId: user?.parentId,
    studentId: user?.studentId
  });

  if (!user || !user.uid) {
    console.log('⚠️ Cannot generate push token - missing user or uid');
    return null;
  }

  if (!Device.isDevice) {
    console.log('ℹ️ Push notifications require a physical device');
    return null;
  }
  
  console.log('✅ Device check passed, proceeding with token generation...');

  try {
    // Request notification permissions
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      console.log('ℹ️ Notification permission not granted');
      return null;
    }

    // Get FCM token
    let fcmToken = null;
    console.log('🔍 Checking FCM availability...', {
      platform: Platform.OS,
      hasMessaging: !!messaging,
      messagingType: typeof messaging
    });
    
    try {
      if (Platform.OS !== 'web' && messaging && typeof messaging === 'function') {
        console.log('✅ FCM messaging module available, attempting to get token...');
        try {
          // Get messaging instance - ensure DEFAULT app exists first
          console.log('🔍 Getting messaging instance...');
          
          // CRITICAL: Ensure DEFAULT app is initialized before calling messaging()
          let app = getFirebaseNativeApp();
          if (!app) {
            // Try to initialize one more time
            app = initializeFirebaseNative();
            if (!app) {
              throw new Error('Firebase DEFAULT app not initialized. REBUILD REQUIRED: google-services.json must be processed during build.');
            }
          }
          
          // Verify DEFAULT app exists
          try {
            const rnFirebase = require('@react-native-firebase/app').default;
            const verifyApp = rnFirebase.app(); // Gets DEFAULT app
            if (!verifyApp) {
              throw new Error('DEFAULT app verification failed - app is null');
            }
            console.log('✅ Firebase DEFAULT app verified');
          } catch (verifyError) {
            console.error('❌ DEFAULT app verification failed:', verifyError?.message);
            console.error('   REBUILD REQUIRED: Check android/app/build.gradle has: apply plugin: "com.google.gms.google-services"');
            throw new Error('Firebase DEFAULT app not available. REBUILD REQUIRED: ' + verifyError?.message);
          }
          
          // Get messaging instance - it uses the DEFAULT app
          const messagingInstance = messaging();
          
          if (!messagingInstance) {
            throw new Error('Messaging instance is null - Firebase may not be initialized');
          }
          
          console.log('✅ Messaging instance created');
          
          console.log('🔍 Messaging instance:', {
            hasInstance: !!messagingInstance,
            hasRequestPermission: typeof messagingInstance?.requestPermission === 'function',
            hasGetToken: typeof messagingInstance?.getToken === 'function'
          });
          
          if (!messagingInstance) {
            throw new Error('Messaging instance is null');
          }
          
          // For Android 13+, request permission
          if (Platform.OS === 'android' && typeof messagingInstance.requestPermission === 'function') {
            console.log('🔍 Requesting FCM permission (Android 13+)...');
            try {
              const authStatus = await messagingInstance.requestPermission();
              console.log('🔍 FCM permission status:', authStatus);
              
              const enabled =
                authStatus === messagingInstance.AuthorizationStatus?.AUTHORIZED ||
                authStatus === messagingInstance.AuthorizationStatus?.PROVISIONAL ||
                authStatus === 1;
              
              console.log('🔍 FCM permission enabled:', enabled);
              
              if (!enabled) {
                console.log('ℹ️ FCM permission not granted');
                return null;
              }
            } catch (permError) {
              console.log('ℹ️ FCM permission request failed (may not be needed):', permError?.message);
              // Continue anyway - older Android versions don't need this
            }
          }
          
          // Get FCM token
          if (typeof messagingInstance.getToken !== 'function') {
            throw new Error('getToken not available');
          }
          
          console.log('🔍 Getting FCM token...');
          fcmToken = await messagingInstance.getToken();
          console.log('✅ FCM token obtained:', fcmToken ? fcmToken.substring(0, 20) + '...' : 'null');
          console.log('✅ FCM token full length:', fcmToken ? fcmToken.length : 0);
          
          if (!fcmToken || fcmToken.trim().length === 0) {
            throw new Error('FCM token is empty');
          }
        } catch (instanceError) {
          console.error('❌ FCM token generation failed:', instanceError?.message || 'Unknown error');
          console.error('   Error details:', {
            message: instanceError?.message,
            code: instanceError?.code,
            stack: instanceError?.stack?.substring(0, 300)
          });
          console.error('   This usually means:');
          console.error('   1. App was not built with @react-native-firebase/messaging');
          console.error('   2. google-services.json is missing or incorrect');
          console.error('   3. Firebase is not properly initialized');
          return null;
        }
      } else {
        console.error('❌ FCM messaging not available - requires custom dev build');
        console.error('   Platform.OS:', Platform.OS);
        console.error('   messaging available:', !!messaging);
        console.error('   messaging type:', typeof messaging);
        return null;
      }
    } catch (fcmError) {
      console.error('❌ FCM error:', fcmError?.message || 'Unknown error');
      console.error('   Error details:', {
        message: fcmError?.message,
        code: fcmError?.code
      });
      return null;
    }
    
    if (!fcmToken) {
      console.log('ℹ️ No FCM token available - push notifications will not work');
      return null;
    }

    // Save token to Firestore
    console.log('🔍 Preparing to save FCM token to Firestore...');
    try {
      const roleLower = String(user?.role || '').toLowerCase();
      const isParent = roleLower === 'parent';
      const isStudent = roleLower === 'student';
      const isDeveloper = roleLower === 'developer';
      const isAdmin = roleLower === 'admin';
      const canonicalParentId = (user?.parentId && String(user.parentId).includes('-')) ? String(user.parentId) : null;
      const studentId = user?.studentId && String(user.studentId).trim().length > 0 ? String(user.studentId).trim() : null;
      
      console.log('🔍 Document ID calculation:', {
        role: roleLower,
        isParent,
        isStudent,
        canonicalParentId,
        studentId,
        uid: user.uid,
        userParentId: user?.parentId,
        userStudentId: user?.studentId
      });
      
      const targetDocId = isParent && canonicalParentId
        ? canonicalParentId
        : (isStudent && studentId) ? studentId 
        : isDeveloper ? "Developer"
        : isAdmin ? "Admin"
        : user.uid;

      console.log('🔍 Target document ID:', targetDocId);
      console.log('🔍 Saving to: users/' + targetDocId);

      if (!targetDocId || targetDocId.trim().length === 0) {
        console.error('❌ Cannot save token - invalid document ID:', targetDocId);
        return fcmToken; // Return token even if save fails
      }

      const userRef = doc(db, 'users', targetDocId);
      
      // Combine all data in one operation for better reliability
      const tokenData = {
        fcmToken: fcmToken,
        pushTokenType: 'fcm',
        pushTokenUpdatedAt: new Date().toISOString(),
        uid: user.uid,
        parentId: canonicalParentId || user.parentId || null,
        studentId: studentId || user.studentId || null,
        role: user.role || null,
      };
      
      console.log('✅ Saving FCM token to Firestore:', {
        documentId: targetDocId,
        tokenLength: fcmToken?.length || 0,
        tokenPreview: fcmToken ? fcmToken.substring(0, 20) + '...' : 'null',
        dataFields: Object.keys(tokenData)
      });
      
      // Use merge: true to update existing document or create if doesn't exist
      await setDoc(userRef, tokenData, { merge: true });
      console.log('✅ FCM token and user data saved to Firestore (merge: true)');

      console.log('✅ FCM token saved to Firestore successfully:', {
        savedUnder: targetDocId,
        uid: user.uid,
        role: user.role,
        tokenType: 'FCM',
        tokenLength: fcmToken?.length || 0,
        timestamp: new Date().toISOString()
      });

      // Also update FCM token in all active parent_student_links for this user
      try {
        await updateUserFcmTokenInLinks(user, fcmToken);
      } catch (linkError) {
        console.warn('⚠️ Failed to update FCM token in links (non-blocking):', linkError?.message);
      }
    } catch (error) {
      console.error('❌ Failed to save push token to Firestore:', error);
      console.error('   Error details:', {
        message: error?.message,
        code: error?.code,
        name: error?.name,
        stack: error?.stack?.substring(0, 300)
      });
      
      // Check if it's a permission error
      if (error?.code === 'permission-denied') {
        console.error('🚨 PERMISSION DENIED: Check Firestore security rules!');
        console.error('   The user document must allow writes for authenticated users');
      }
      
      // Don't throw - return token even if save failed
      // The token is still valid, just not saved to Firestore
    }

    // Create Android notification channel
    if (Platform.OS === 'android') {
      try {
        await Notifications.setNotificationChannelAsync('default', {
          name: 'Default Notifications',
          description: 'Default notification channel for app alerts',
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#FF231F7C',
          sound: 'default',
          enableVibrate: true,
          showBadge: true,
        });
        console.log('✅ Android notification channel "default" created');
      } catch (channelError) {
        console.log('ℹ️ Could not create notification channel:', channelError?.message);
      }
    }

    return fcmToken;
  } catch (error) {
    console.log('ℹ️ Error generating push token:', error?.message || error);
    return null;
  }
};

