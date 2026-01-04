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
    if (!fcmToken || typeof fcmToken !== 'string') {
      throw new Error('Invalid FCM token provided');
    }

    // Build FCM message
    const message = {
      token: fcmToken,
      notification: {
        title: title || 'Notification',
        body: body || '',
      },
      data: {
        ...data,
        // Convert all data values to strings (FCM requirement)
        ...Object.keys(data).reduce((acc, key) => {
          acc[key] = String(data[key]);
          return acc;
        }, {}),
      },
      android: {
        priority: 'high',
        notification: {
          channelId: 'default', // Must match the channel created in the app
          sound: 'default',
          priority: 'high',
          defaultSound: true,
          defaultVibrateTimings: true,
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
    
    // Handle specific FCM errors
    if (err.code === 'messaging/invalid-registration-token' || 
        err.code === 'messaging/registration-token-not-registered') {
      console.error('Invalid or unregistered FCM token:', fcmToken);
      return {
        success: false,
        error: 'Invalid or unregistered token',
        code: err.code,
      };
    }
    
    throw new Error(`Failed to send push notification: ${err.message}`);
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
