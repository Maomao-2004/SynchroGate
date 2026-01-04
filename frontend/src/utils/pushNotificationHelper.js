// pushNotificationHelper.js - Helper to send push notifications via backend API
import { BASE_URL } from './apiConfig';

/**
 * Send push notification for an alert via backend API
 * This works even when the app is closed because it uses Expo Push API
 * @param {Object} alert - Alert object
 * @param {string} userId - User ID (studentId, parentId, or 'Admin')
 * @param {string} role - User role ('student', 'parent', or 'admin')
 * @returns {Promise<void>}
 */
export const sendAlertPushNotification = async (alert, userId, role) => {
  // DISABLED: Backend alertPushService.js now handles ALL push notifications automatically
  // Frontend should NOT call this API - it causes duplicates and can send to wrong users
  // The backend listener detects Firestore changes and sends notifications to the correct logged-in users
  console.log('ℹ️ Frontend push notification call disabled - backend handles all notifications automatically');
  return;
  
  // OLD CODE BELOW - DISABLED
  try {
    // Only send for unread alerts
    if (alert.status === 'read') {
      console.log('⏭️ Skipping push notification - alert is already read');
      return;
    }

    // Construct URL - BASE_URL already includes /api, so just add the path
    const url = `${BASE_URL}/notifications/alert-push`;
    const payload = {
      alert: {
        id: alert.id || alert.alertId,
        type: alert.type || alert.alertType,
        title: alert.title,
        message: alert.message,
        status: alert.status,
        studentId: alert.studentId,
        parentId: alert.parentId,
        studentName: alert.studentName,
        parentName: alert.parentName,
        currentKey: alert.currentKey,
        subject: alert.subject,
        time: alert.time,
        linkId: alert.linkId,
        requestId: alert.requestId,
        response: alert.response,
      },
      userId: userId,
      role: role,
    };

    // Call backend API to send push notification
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const responseData = await response.json().catch(() => ({}));

    if (!response.ok) {
      console.error('❌ Failed to send push notification:', {
        status: response.status,
        statusText: response.statusText,
        error: responseData.error || responseData.message,
        details: responseData.details
      });
    } else {
      console.log(`✅ Push notification sent successfully to ${role} ${userId}`, {
        messageId: responseData.messageId
      });
    }
  } catch (error) {
    // Log error but don't block alert creation if push fails
    console.error('❌ Error sending push notification (non-blocking):', {
      message: error.message,
      stack: error.stack,
      userId,
      role,
      alertId: alert.id || alert.alertId
    });
  }
};





