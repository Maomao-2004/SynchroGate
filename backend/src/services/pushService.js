// pushService.js - Send push notifications using Firebase Cloud Messaging (FCM)
const { admin } = require('../config/firebase');

/**
 * Send push notification using FCM
 * @param {string} fcmToken - FCM token from the device
 * @param {string} title - Notification title
 * @param {string} body - Notification body
 * @param {object} data - Additional data payload
 * @returns {Promise<object>} FCM response
 */
const sendPushNotification = async (fcmToken, title, body, data = {}) => {
  try {
    // Validate FCM token
    if (!fcmToken || typeof fcmToken !== 'string' || fcmToken.trim().length === 0) {
      throw new Error('Invalid FCM token provided');
    }
    
    // CRITICAL: Additional validation - ensure token looks valid
    // FCM tokens are typically 152-163 characters long
    if (fcmToken.length < 100 || fcmToken.length > 200) {
      throw new Error('FCM token length is invalid');
    }

    // Build FCM message
    // CRITICAL: When app is closed, FCM automatically displays notifications
    // if both 'notification' and 'data' fields are present
    const message = {
      token: fcmToken,
      // Notification payload - automatically displayed by FCM when app is closed
      notification: {
        title: title || 'Notification',
        body: body || '',
        // Add image if available in data
        imageUrl: data.imageUrl || undefined,
      },
      // Data payload - available to app when notification is tapped
      data: {
        ...data,
        // Convert all data values to strings (FCM requirement)
        ...Object.keys(data).reduce((acc, key) => {
          acc[key] = String(data[key]);
          return acc;
        }, {}),
        // Ensure title and body are in data for app to use when opened
        title: String(title || 'Notification'),
        body: String(body || ''),
      },
      android: {
        // CRITICAL: 'high' priority ensures notification is delivered even when app is closed
        priority: 'high',
        notification: {
          channelId: 'default', // Must match the channel created in the app
          sound: 'default',
          priority: 'high', // High priority for heads-up notification
          defaultSound: true,
          defaultVibrateTimings: true,
          visibility: 'public', // Show notification even when device is locked
          notificationCount: 1, // Badge count
          // Don't set clickAction - let FCM handle it automatically
          // Ensure notification shows even when screen is off
          lightSettings: {
            color: '#0000FF', // Blue color in hex format (#RRGGBB)
            lightOnDurationMillis: 1000, // 1 second in milliseconds
            lightOffDurationMillis: 1000, // 1 second in milliseconds
          },
        },
        // Critical: These settings ensure notifications work when app is closed
        ttl: 86400000, // 24 hours - how long notification is valid
        // Use unique collapse key per alert to prevent collapsing different alerts
        collapseKey: data.alertId || `alert_${Date.now()}`,
        // Direct boot mode - deliver notification even after reboot
        directBootOk: true,
      },
      apns: {
        payload: {
          aps: {
            sound: 'default',
            badge: 1,
            // Ensure notification is delivered even when app is closed
            contentAvailable: true,
          },
        },
      },
      // Web push configuration (if needed)
      webpush: {
        notification: {
          title: title || 'Notification',
          body: body || '',
          icon: '/icon.png',
        },
      },
    };

    // Send via Firebase Admin SDK
    const response = await admin.messaging().send(message);
    
    console.log('✅ FCM push notification sent successfully:', response);
    return {
      success: true,
      messageId: response,
      token: fcmToken,
    };
  } catch (err) {
    console.error('❌ FCM push notification failed:', err);
    
    // Re-throw the error so the controller can handle it properly
    // This allows the controller to update the database and provide better error messages
    throw err;
  }
};

/**
 * Send push notification to multiple tokens
 * @param {string[]} fcmTokens - Array of FCM tokens
 * @param {string} title - Notification title
 * @param {string} body - Notification body
 * @param {object} data - Additional data payload
 * @returns {Promise<object>} Batch response
 */
const sendPushNotificationToMultiple = async (fcmTokens, title, body, data = {}) => {
  try {
    if (!Array.isArray(fcmTokens) || fcmTokens.length === 0) {
      throw new Error('Invalid FCM tokens array');
    }

    // Build multicast message
    const message = {
      notification: {
        title: title || 'Notification',
        body: body || '',
      },
      data: {
        ...Object.keys(data).reduce((acc, key) => {
          acc[key] = String(data[key]);
          return acc;
        }, {}),
      },
      android: {
        priority: 'high',
        notification: {
          channelId: 'default',
          sound: 'default',
          priority: 'high',
        },
      },
      apns: {
        payload: {
          aps: {
            sound: 'default',
            badge: 1,
          },
        },
      },
      tokens: fcmTokens,
    };

    // Send via Firebase Admin SDK (multicast)
    const response = await admin.messaging().sendEachForMulticast(message);
    
    console.log(`✅ FCM multicast sent: ${response.successCount} successful, ${response.failureCount} failed`);
    
    return {
      success: true,
      successCount: response.successCount,
      failureCount: response.failureCount,
      responses: response.responses,
    };
  } catch (err) {
    console.error('❌ FCM multicast failed:', err);
    throw new Error(`Failed to send multicast push notification: ${err.message}`);
  }
};

// Alias for backward compatibility
const sendPush = sendPushNotification;

module.exports = { 
  sendPushNotification, 
  sendPush,
  sendPushNotificationToMultiple 
};
