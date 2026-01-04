import { useCallback } from 'react';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { db } from '../utils/firebaseConfig';

// Get expo-constants projectId - handle web and native differently
// Web bundler can't resolve expo-constants, so we skip it entirely for web
const FALLBACK_PROJECT_ID = 'bea5ab65-b959-4c48-888a-189391e94232';

// Function to get projectId - works for both web and native
const getProjectId = () => {
  // For web, always use fallback (expo-constants not needed)
  if (Platform.OS === 'web') {
    return FALLBACK_PROJECT_ID;
  }
  
  // For native, try to get from expo-constants
  try {
    const Constants = require('expo-constants');
    return (Constants?.expoConfig?.extra?.eas?.projectId) 
      || (Constants?.easConfig?.projectId)
      || (Constants?.eas?.projectId)
      || FALLBACK_PROJECT_ID;
  } catch (e) {
    // expo-constants not available - use fallback
    return FALLBACK_PROJECT_ID;
  }
};
// Import Firebase initialization - ensures DEFAULT app exists
import { initializeFirebaseNative } from '../utils/firebaseNativeInit';

// CRITICAL: Ensure DEFAULT app is initialized before using messaging
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
      console.log('✅ FCM messaging module loaded in usePushNotifications');
    }
  } catch (e) {
    console.log('ℹ️ @react-native-firebase/messaging not available (requires custom dev build)');
  }
}

// Configure notification behavior for background/foreground/quit states
// This handler is called when a notification is received
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true, // Enable badge for unread notifications
  }),
});

export default function usePushNotifications() {
  const registerForPushNotificationsAsync = useCallback(async (user) => {
    let token;

    if (Device.isDevice) {
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;

      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      if (finalStatus !== 'granted') {
        alert('Failed to get push token for push notifications!');
        return null;
      }

      // Get FCM token for direct FCM notifications (works when app is closed)
      // SAFE: Multiple checks to prevent crashes
      let fcmToken = null;
      try {
        if (Platform.OS !== 'web' && messaging && typeof messaging === 'function') {
          try {
            // CRITICAL: Ensure DEFAULT app exists before getting messaging instance
            const app = initializeFirebaseNative();
            if (!app) {
              throw new Error('Firebase DEFAULT app not initialized. REBUILD REQUIRED: google-services.json not processed.');
            }
            
            // SAFE: Get messaging instance
            const messagingInstance = messaging();
            if (!messagingInstance) {
              throw new Error('Messaging instance is null');
            }
            
            // SAFE: Check if requestPermission exists
            if (typeof messagingInstance.requestPermission !== 'function') {
              throw new Error('requestPermission not available');
            }
            
            // Request permission for FCM
            const authStatus = await messagingInstance.requestPermission();
            const enabled =
              authStatus === messagingInstance.AuthorizationStatus?.AUTHORIZED ||
              authStatus === messagingInstance.AuthorizationStatus?.PROVISIONAL ||
              authStatus === 1; // AUTHORIZED = 1
            
            if (enabled) {
              // SAFE: Check if getToken exists
              if (typeof messagingInstance.getToken !== 'function') {
                throw new Error('getToken not available');
              }
              
              fcmToken = await messagingInstance.getToken();
              console.log('✅ FCM token obtained:', fcmToken ? fcmToken.substring(0, 20) + '...' : 'null');
            } else {
              console.log('ℹ️ FCM permission not granted');
              return null; // No token if permission denied
            }
          } catch (instanceError) {
            // FCM not available - this is expected if app wasn't built with FCM
            console.log('ℹ️ FCM not available in this build:', instanceError?.message || 'Unknown error');
            console.log('   This is normal if you are using Expo Go or an old build');
            console.log('   To enable FCM: Build a new custom dev build with @react-native-firebase/messaging');
            return null; // No FCM token available
          }
        } else {
          console.log('ℹ️ FCM messaging not available - requires custom dev build');
          console.log('   Current build does not include @react-native-firebase/messaging');
          console.log('   Push notifications will not work until you build with FCM support');
          return null; // No FCM token available
        }
      } catch (fcmError) {
        // FCM not available - this is expected if app wasn't built with FCM
        console.log('ℹ️ FCM not available in this build:', fcmError?.message || 'Unknown error');
        console.log('   This is normal if you are using Expo Go or an old build');
        console.log('   To enable FCM: Build a new custom dev build with @react-native-firebase/messaging');
        return null; // No FCM token available
      }
      
      // Use FCM token only (no Expo fallback)
      token = fcmToken;
      
      if (!token) {
        console.log('ℹ️ No FCM token available - push notifications will not work');
        console.log('   This is expected if app was not built with FCM support');
        console.log('   App will continue to work normally, but notifications are disabled');
        return null;
      }
      
      // Log token status for debugging
      console.log('🔔 Push token status:', {
        hasFCM: !!fcmToken,
        usingToken: 'FCM',
        tokenLength: token ? token.length : 0
      });

      // CRITICAL: Only save token if user is fully logged in with a role
      // Don't save token if user is on role selection screen
      if (token && user?.uid && user?.role) {
        const roleLower = String(user.role).toLowerCase();
        
        // Validate role is one of the allowed roles
        if (!['student', 'parent', 'admin', 'developer'].includes(roleLower)) {
          console.log('⏭️ Not saving FCM token - invalid role:', roleLower);
          return token; // Return token but don't save it
        }
        
        try {
          // Determine canonical document id for saving push token
          const isParent = roleLower === 'parent';
          const isStudent = roleLower === 'student';
          const isDeveloper = roleLower === 'developer';
          const isAdmin = roleLower === 'admin';
          const canonicalParentId = (user?.parentId && String(user.parentId).includes('-')) ? String(user.parentId) : null;
          const studentId = user?.studentId && String(user.studentId).trim().length > 0 ? String(user.studentId).trim() : null;
          // Parents: save under parentId; Students: save under studentId; Developer: save under "Developer"; Admin: save under "Admin"; Fallback: uid
          const targetDocId = isParent && canonicalParentId
            ? canonicalParentId
            : (isStudent && studentId) ? studentId 
            : isDeveloper ? "Developer"
            : isAdmin ? "Admin"
            : user.uid;

          const userRef = doc(db, 'users', targetDocId);
          
          // Save FCM token only (no Expo fallback)
          // IMPORTANT: Save role and UID together with token to ensure user is logged in
          const tokenData = {
            fcmToken: fcmToken,
            pushTokenType: 'fcm',
            pushTokenUpdatedAt: new Date().toISOString(),
            // CRITICAL: Always save role and UID with token to verify user is logged in
            role: user.role,
            uid: user.uid,
            parentId: canonicalParentId || user.parentId || null,
            studentId: studentId || user.studentId || null,
          };
          
          console.log('✅ Saving FCM token to Firestore for logged-in user:', {
            role: user.role,
            uid: user.uid,
            targetDocId: targetDocId
          });
          
          await setDoc(userRef, tokenData, { merge: true });

          console.log('✅ FCM token saved to Firestore:', {
            savedUnder: targetDocId,
            uid: user.uid,
            role: user.role,
            parentId: user.parentId,
            studentId: user.studentId,
            tokenType: 'FCM',
            hasFCMToken: !!fcmToken
          });
        } catch (error) {
          console.error('❌ Failed to save push token:', error);
        }
      } else {
        console.log('⚠️ Cannot save push token - missing token or user:', {
          hasToken: !!token,
          hasUser: !!user,
          hasUid: !!user?.uid
        });
      }
    } else {
      alert('Push notifications require a physical device');
    }

    if (Platform.OS === 'android') {
      // CRITICAL: Create notification channel for Android
      // This channel must match the channelId used in backend FCM messages
      // MUST be created before app closes for notifications to work when app is closed
      try {
        await Notifications.setNotificationChannelAsync('default', {
          name: 'Default Notifications',
          description: 'Default notification channel for app alerts',
          importance: Notifications.AndroidImportance.MAX, // Highest priority - shows even when app is closed
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#FF231F7C',
          sound: 'default',
          enableVibrate: true,
          showBadge: true,
          // Critical settings for background notifications
          lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC, // Show on lock screen
        });
        console.log('✅ Android notification channel "default" created with MAX importance');
        console.log('   - Notifications will show when app is CLOSED');
        console.log('   - Notifications will show on LOCK SCREEN');
        console.log('   - Notifications have HIGHEST priority');
      } catch (channelError) {
        console.error('❌ Failed to create notification channel:', channelError);
        // Don't fail completely - try to continue
      }
    }

    return token;
  }, []);

  return { registerForPushNotificationsAsync };
}
