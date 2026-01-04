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
      return;
    }

    // Call backend API to send push notification
    const response = await fetch(`${BASE_URL}/notifications/alert-push`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
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
      }),
    });

    if (!response.ok) {
      console.warn('Failed to send push notification:', response.statusText);
    } else {
      console.log(`✅ Push notification sent to ${role} ${userId}`);
    }
  } catch (error) {
    // Silently fail - don't block alert creation if push fails
    console.warn('Error sending push notification (non-blocking):', error.message);
  }
};





