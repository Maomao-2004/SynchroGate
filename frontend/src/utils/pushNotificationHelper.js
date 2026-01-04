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
  try {
    // Only send for unread alerts
    if (alert.status === 'read') {
      console.log('⏭️ Skipping push notification - alert is already read');
      return;
    }

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

    console.log('📤 Sending push notification request:', {
      url,
      userId,
      role,
      alertId: alert.id || alert.alertId,
      alertType: alert.type || alert.alertType,
      alertTitle: alert.title
    });
    console.log('📤 Full payload:', JSON.stringify(payload, null, 2));

    // Call backend API to send push notification
    console.log('📤 Making fetch request to:', url);
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    console.log('📤 Fetch response status:', response.status, response.statusText);

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





