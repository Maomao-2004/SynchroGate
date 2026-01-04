const { firestore } = require("../config/firebase");
const smsService = require("../services/smsService");
const pushService = require("../services/pushService");

const sendSMSNotification = async (req, res, next) => {
  const { phones, message } = req.body; // support array of phone numbers or single string
  try {
    // Normalize phones to array
    const recipients = Array.isArray(phones) ? phones : [phones];

    // Send SMS to all recipients
    await Promise.all(recipients.map(phone => smsService.sendSMS(phone, message)));

    // Log notifications in Firebase
    const notificationsRef = firestore.collection('notifications');
    const batch = firestore.batch();
    
    recipients.forEach(phone => {
      const notificationRef = notificationsRef.doc();
      batch.set(notificationRef, {
        type: "SMS",
        recipient: phone,
        message,
        status: "sent",
        sentAt: new Date(),
        createdAt: new Date()
      });
    });
    
    await batch.commit();

    res.status(200).json({ message: "SMS sent successfully." });
  } catch (error) {
    next(error);
  }
};

const sendPushNotification = async (req, res, next) => {
  const { tokens, fcmToken, title, body, data } = req.body; 
  // Support both 'tokens' (array) and 'fcmToken' (single token) for backward compatibility
  // Also support 'data' parameter for additional notification data
  try {
    // Normalize tokens to array - support both 'tokens' and 'fcmToken' parameters
    let recipients = [];
    if (tokens) {
      recipients = Array.isArray(tokens) ? tokens : [tokens];
    } else if (fcmToken) {
      recipients = [fcmToken];
    } else {
      return res.status(400).json({ error: "Either 'tokens' or 'fcmToken' is required" });
    }

    // Filter out invalid tokens
    const validTokens = recipients.filter(token => token && typeof token === 'string' && token.length > 0);
    
    if (validTokens.length === 0) {
      return res.status(400).json({ error: "No valid FCM tokens provided" });
    }

    // Use multicast for multiple tokens, single send for one token
    let results;
    if (validTokens.length === 1) {
      const result = await pushService.sendPush(validTokens[0], title, body, data || {});
      results = [result];
    } else {
      const multicastResult = await pushService.sendPushNotificationToMultiple(validTokens, title, body, data || {});
      results = multicastResult.responses || [];
    }

    // Log notifications in Firebase
    const notificationsRef = firestore.collection('notifications');
    const batch = firestore.batch();
    
    validTokens.forEach((token, index) => {
      const notificationRef = notificationsRef.doc();
      const result = results[index] || {};
      const success = result.success !== false;
      
      batch.set(notificationRef, {
        type: "PUSH",
        recipient: token.substring(0, 20) + '...', // Store partial token for privacy
        message: body,
        title,
        status: success ? "sent" : "failed",
        error: result.error || null,
        sentAt: new Date(),
        createdAt: new Date()
      });
    });
    
    await batch.commit();

    const successCount = results.filter(r => r.success !== false).length;
    const failureCount = results.length - successCount;

    res.status(200).json({ 
      message: "Push notification processed.",
      successCount,
      failureCount,
      total: validTokens.length
    });
  } catch (error) {
    console.error('Error in sendPushNotification:', error);
    next(error);
  }
};

// Add placeholder methods for other routes if needed
const getNotificationHistory = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const notificationsRef = firestore.collection('notifications');
    const snapshot = await notificationsRef
      .where('userId', '==', userId)
      .orderBy('sentAt', 'desc')
      .get();
    
    const notifications = [];
    snapshot.forEach(doc => {
      notifications.push({ id: doc.id, ...doc.data() });
    });
    
    res.json(notifications);
  } catch (error) {
    next(error);
  }
};

const getParentNotifications = async (req, res, next) => {
  try {
    const userId = req.user.uid; // Assuming user ID from auth middleware
    const notificationsRef = firestore.collection('notifications');
    const snapshot = await notificationsRef
      .where('userId', '==', userId)
      .orderBy('sentAt', 'desc')
      .limit(50)
      .get();
    
    const notifications = [];
    snapshot.forEach(doc => {
      notifications.push({ id: doc.id, ...doc.data() });
    });
    
    res.json(notifications);
  } catch (error) {
    next(error);
  }
};

const logNotificationEvent = async (req, res, next) => {
  try {
    const { type, recipient, message, title } = req.body;
    const notificationsRef = firestore.collection('notifications');
    await notificationsRef.add({
      type,
      recipient,
      message,
      title,
      status: 'logged',
      createdAt: new Date(),
      sentAt: new Date()
    });
    
    res.status(201).json({ message: "Notification event logged successfully." });
  } catch (error) {
    next(error);
  }
};

/**
 * Send push notification for an alert
 * Looks up user's FCM token from Firestore and sends notification
 */
const sendAlertPushNotification = async (req, res, next) => {
  try {
    console.log('📨 Received alert push notification request');
    const { alert, userId, role } = req.body;
    
    console.log('📨 Request data:', {
      hasAlert: !!alert,
      userId: userId,
      role: role,
      alertId: alert?.id || alert?.alertId,
      alertType: alert?.type || alert?.alertType
    });
    
    if (!alert || !userId) {
      console.error('❌ Missing required fields:', { hasAlert: !!alert, hasUserId: !!userId });
      return res.status(400).json({ error: "Alert and userId are required" });
    }

    // Get user's FCM token from Firestore
    // For admin/developer users, the document ID might be "Admin" or "Developer" instead of UID
    console.log(`🔍 Looking up FCM token for user: ${userId}, role: ${role}`);
    let userDoc = null;
    let userData = null;
    
    try {
      // Try the provided userId first
      userDoc = await firestore.collection('users').doc(userId).get();
      console.log(`📄 User document exists (by userId): ${userDoc.exists}`);
      
      // If not found and role is admin/developer, try alternative document IDs
      if (!userDoc.exists && (role === 'admin' || role === 'developer')) {
        const alternativeIds = role === 'admin' ? ['Admin', 'admin'] : ['Developer', 'developer'];
        for (const altId of alternativeIds) {
          const altDoc = await firestore.collection('users').doc(altId).get();
          if (altDoc.exists) {
            console.log(`📄 Found user document with alternative ID: ${altId}`);
            userDoc = altDoc;
            break;
          }
        }
      }
      
      // If still not found, try querying by UID
      if (!userDoc.exists) {
        console.log(`📄 Trying to find user by UID: ${userId}`);
        const querySnapshot = await firestore.collection('users')
          .where('uid', '==', userId)
          .limit(1)
          .get();
        
        if (!querySnapshot.empty) {
          userDoc = querySnapshot.docs[0];
          console.log(`📄 Found user document by UID query: ${userDoc.id}`);
        }
      }
    } catch (err) {
      console.error('❌ Error fetching user document:', err);
      return res.status(500).json({ error: "Failed to fetch user document", details: err.message });
    }

    if (!userDoc || !userDoc.exists) {
      console.log(`⚠️ User document not found for userId: ${userId}, role: ${role}`);
      console.log(`   Tried: direct lookup, alternative IDs (${role}), and UID query`);
      return res.status(404).json({ 
        error: "User not found",
        message: `Could not find user document for ${userId}. Please ensure the user has logged in and has an FCM token.`
      });
    }
    
    // Get data from document (handle both DocumentSnapshot and QueryDocumentSnapshot)
    userData = userDoc.data ? userDoc.data() : (userDoc.exists ? userDoc.data() : null);

    // CRITICAL: Validate user is actually logged in before sending notification
    // Check 1: User must have a role (not on role selection screen)
    const userRole = userData?.role;
    if (!userRole || typeof userRole !== 'string' || userRole.trim().length === 0) {
      console.log(`⏭️ Rejecting push notification - user ${userId} has no role (not logged in)`);
      return res.status(403).json({ 
        error: "User not logged in",
        message: "User has not selected a role yet. Please log in first."
      });
    }
    
    // Check 2: User must have a UID (actually authenticated)
    const userUid = userData?.uid;
    if (!userUid || typeof userUid !== 'string' || userUid.trim().length === 0) {
      console.log(`⏭️ Rejecting push notification - user ${userId} has no UID (not authenticated)`);
      return res.status(403).json({ 
        error: "User not authenticated",
        message: "User is not authenticated. Please log in first."
      });
    }
    
    // Check 3: Role must match the expected role for this alert
    const roleLower = String(userRole).toLowerCase();
    if (role && role.toLowerCase() !== roleLower) {
      console.log(`⏭️ Rejecting push notification - user ${userId} role (${roleLower}) doesn't match alert role (${role})`);
      return res.status(403).json({ 
        error: "Role mismatch",
        message: "User role does not match alert target role."
      });
    }
    
    // Check 4: User MUST have logged in (lastLoginAt or pushTokenUpdatedAt required)
    // This ensures user is actually logged in, not just has a token
    const lastLoginAt = userData?.lastLoginAt || userData?.pushTokenUpdatedAt;
    if (!lastLoginAt) {
      console.log(`⏭️ Rejecting push notification - user ${userId} has no login timestamp (not logged in)`);
      return res.status(403).json({ 
        error: "User not logged in",
        message: "User has not logged in. Please log in first."
      });
    }
    
    // Parse lastLoginAt timestamp for real-time filtering
    const now = Date.now();
    let lastLoginTime = null;
    try {
      if (lastLoginAt.toMillis) {
        lastLoginTime = lastLoginAt.toMillis();
      } else if (lastLoginAt.seconds) {
        lastLoginTime = lastLoginAt.seconds * 1000;
      } else if (typeof lastLoginAt === 'string') {
        const parsedDate = new Date(lastLoginAt);
        if (!isNaN(parsedDate.getTime())) {
          lastLoginTime = parsedDate.getTime();
        }
      } else if (typeof lastLoginAt === 'number') {
        lastLoginTime = lastLoginAt;
      }
    } catch (err) {
      console.log(`⏭️ Rejecting push notification - user ${userId} has invalid login timestamp format`);
      return res.status(403).json({ 
        error: "Invalid login timestamp",
        message: "User login timestamp is invalid. Please log in again."
      });
    }
    
    if (!lastLoginTime || isNaN(lastLoginTime) || lastLoginTime <= 0) {
      console.log(`⏭️ Rejecting push notification - user ${userId} has invalid login timestamp value`);
      return res.status(403).json({ 
        error: "Invalid login timestamp",
        message: "User login timestamp is invalid. Please log in again."
      });
    }
    
    // CRITICAL: Only send alerts created AFTER user logged in (real-time only)
    // This prevents sending old unread alerts when user logs in
    const alertCreatedAt = alert.createdAt || alert.timestamp || alert.id;
    if (alertCreatedAt) {
      let alertTime;
      try {
        // Try to extract timestamp from alert ID (format: timestamp_random)
        if (typeof alertCreatedAt === 'string' && alertCreatedAt.includes('_')) {
          const timestampPart = alertCreatedAt.split('_')[0];
          alertTime = parseInt(timestampPart, 10);
          if (isNaN(alertTime)) {
            alertTime = new Date(alertCreatedAt).getTime();
          }
        } else if (typeof alertCreatedAt === 'string') {
          alertTime = new Date(alertCreatedAt).getTime();
        } else if (typeof alertCreatedAt === 'number') {
          alertTime = alertCreatedAt;
        }
        
        // If we have both alert time and login time, only send if alert was created AFTER login
        if (alertTime && !isNaN(alertTime) && lastLoginTime && alertTime < lastLoginTime) {
          console.log(`⏭️ Rejecting push notification - alert ${alert.id || alert.alertId} was created before user ${userId} logged in (old alert)`);
          return res.status(403).json({ 
            error: "Old alert",
            message: "This alert was created before you logged in. Only new alerts are sent."
          });
        }
      } catch (err) {
        // If we can't parse alert time, be conservative and skip
        console.log(`⏭️ Rejecting push notification - cannot parse alert creation time for ${alert.id || alert.alertId}`);
        return res.status(403).json({ 
          error: "Invalid alert timestamp",
          message: "Cannot determine when this alert was created."
        });
      }
    }

    // userData is already set above
    const fcmToken = userData?.fcmToken;

    console.log(`🔑 FCM token status:`, {
      hasToken: !!fcmToken,
      tokenLength: fcmToken ? fcmToken.length : 0,
      tokenPreview: fcmToken ? fcmToken.substring(0, 20) + '...' : 'none',
      userRole: userRole,
      userUid: userUid,
      tokenAgeMinutes: Math.round(timeSinceTokenUpdate / (60 * 1000))
    });

    if (!fcmToken) {
      console.log(`⚠️ No FCM token found for user: ${userId}`);
      return res.status(404).json({ 
        error: "FCM token not found for user",
        message: "User has not registered for push notifications. Please rebuild the app and log in again."
      });
    }

    // Build notification title and body from alert
    const title = alert.title || 'New Alert';
    const body = alert.message || alert.body || 'You have a new alert';
    
    // Send push notification
    let result;
    try {
      result = await pushService.sendPush(
        fcmToken,
        title,
        body,
        {
          type: 'alert',
          alertId: alert.id || alert.alertId,
          alertType: alert.type || alert.alertType,
          studentId: alert.studentId || '',
          parentId: alert.parentId || '',
          status: alert.status || 'unread',
          ...alert // Include all alert data
        }
      );
    } catch (pushError) {
      // Handle FCM errors gracefully
      console.error('❌ FCM push notification failed:', pushError);
      
      // If token is invalid/unregistered, mark it in the database
      if (pushError.code === 'messaging/registration-token-not-registered' || 
          pushError.code === 'messaging/invalid-registration-token') {
        // Remove invalid token from user document
        try {
          await firestore.collection('users').doc(userId).update({
            fcmToken: null,
            pushTokenType: null,
            pushTokenUpdatedAt: null,
            fcmTokenError: 'Token invalid - user needs to re-register',
            fcmTokenErrorAt: new Date()
          });
        } catch (updateError) {
          console.error('Failed to update user document:', updateError);
        }
      }
      
      // Log notification failure
      const notificationsRef = firestore.collection('notifications');
      await notificationsRef.add({
        type: "PUSH_ALERT",
        recipient: userId,
        role: role,
        alertId: alert.id || alert.alertId,
        message: body,
        title,
        status: "failed",
        error: pushError.message,
        errorCode: pushError.code,
        sentAt: new Date(),
        createdAt: new Date()
      });

      return res.status(500).json({ 
        error: "Failed to send push notification",
        details: pushError.message,
        code: pushError.code,
        message: pushError.code === 'messaging/registration-token-not-registered' 
          ? "FCM token is invalid. User needs to rebuild app and log in again to get a new token."
          : "Push notification failed. Please check the token and try again."
      });
    }

    // Log successful notification
    const notificationsRef = firestore.collection('notifications');
    await notificationsRef.add({
      type: "PUSH_ALERT",
      recipient: userId,
      role: role,
      alertId: alert.id || alert.alertId,
      message: body,
      title,
      status: result.success !== false ? "sent" : "failed",
      sentAt: new Date(),
      createdAt: new Date()
    });

    if (result.success !== false) {
      res.status(200).json({ 
        message: "Alert push notification sent successfully.",
        messageId: result.messageId
      });
    } else {
      res.status(500).json({ 
        error: "Failed to send push notification",
        details: result.error
      });
    }
  } catch (error) {
    console.error('Error in sendAlertPushNotification:', error);
    next(error);
  }
};

module.exports = {
  sendSMSNotification,
  sendPushNotification,
  getNotificationHistory,
  getParentNotifications,
  logNotificationEvent,
  sendAlertPushNotification
};
