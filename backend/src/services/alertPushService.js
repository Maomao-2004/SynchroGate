// alertPushService.js - Backend service to automatically send push notifications when alerts change
// This works even when the app is closed because the backend is always running
const { firestore, admin } = require('../config/firebase');
const pushService = require('./pushService');

let alertListeners = {
  student: null,
  parent: null,
  admin: null,
};

// Track which alerts we've already notified about (with time-based deduplication)
const notifiedAlerts = new Map(); // alertId -> timestamp

/**
 * Get parent document ID from user data
 */
const getParentDocId = async (parentId) => {
  try {
    // Try to get the user document
    const userDoc = await firestore.collection('users').doc(parentId).get();
    if (userDoc.exists) {
      const data = userDoc.data();
      const parentIdCanonical = data?.parentId || data?.parentIdNumber || parentId;
      if (String(parentIdCanonical).includes('-')) {
        return String(parentIdCanonical);
      }
    }
    
    // Try parent_student_links
    const linksQuery = await firestore.collection('parent_student_links')
      .where('parentId', '==', parentId)
      .where('status', '==', 'active')
      .limit(1)
      .get();
    
    if (!linksQuery.empty) {
      const linkData = linksQuery.docs[0].data();
      const canonicalId = linkData.parentIdNumber || linkData.parentNumber || linkData.parentId;
      if (String(canonicalId).includes('-')) {
        return String(canonicalId);
      }
    }
    
    return String(parentId);
  } catch (error) {
    console.error('Error getting parent doc ID:', error);
    return String(parentId);
  }
};

/**
 * Send push notification for an alert
 */
const sendPushForAlert = async (alert, role, userId) => {
  try {
    // Time-based deduplication - only send if we haven't notified in the last 5 minutes
    const now = Date.now();
    const FIVE_MINUTES = 5 * 60 * 1000;
    const alertId = alert.id || alert.alertId;
    
    if (alertId) {
      const lastNotified = notifiedAlerts.get(alertId) || 0;
      const timeSinceLastNotification = now - lastNotified;
      
      if (timeSinceLastNotification <= FIVE_MINUTES) {
        // Skip - we notified about this alert recently
        return;
      }
    }
    
    // Get user's FCM token
    let userDoc = null;
    try {
      userDoc = await firestore.collection('users').doc(userId).get();
      
      // If not found and role is admin/developer, try alternative document IDs
      if (!userDoc.exists && (role === 'admin' || role === 'developer')) {
        const alternativeIds = role === 'admin' ? ['Admin', 'admin'] : ['Developer', 'developer'];
        for (const altId of alternativeIds) {
          const altDoc = await firestore.collection('users').doc(altId).get();
          if (altDoc.exists) {
            userDoc = altDoc;
            break;
          }
        }
      }
      
      // If still not found, try querying by UID
      if (!userDoc.exists) {
        const querySnapshot = await firestore.collection('users')
          .where('uid', '==', userId)
          .limit(1)
          .get();
        
        if (!querySnapshot.empty) {
          userDoc = querySnapshot.docs[0];
        }
      }
    } catch (err) {
      console.error('Error fetching user document:', err);
      return;
    }

    if (!userDoc || !userDoc.exists) {
      return; // User not found
    }
    
    const userData = userDoc.data();
    const fcmToken = userData?.fcmToken;

    if (!fcmToken) {
      return; // No FCM token
    }

    // Build notification title and body
    const alertType = alert.type || alert.alertType;
    let title = alert.title || 'New Alert';
    let body = alert.message || alert.body || 'You have a new alert';
    
    // Role-specific formatting
    const parentName = alert.parentName ? String(alert.parentName).trim().split(' ')[0] : 'Parent';
    const studentName = alert.studentName ? String(alert.studentName).trim().split(' ')[0] : 'Student';
    
    if (role === 'student') {
      if (alertType === 'schedule_current') {
        title = 'Class Happening Now';
        body = alert.message || `Your ${alert.subject || 'class'} is happening now (${alert.time || ''}).`;
      } else if (alertType === 'link_request') {
        title = 'Parent Link Request';
        body = alert.message || `${parentName} wants to link to your account.`;
      } else if (alertType === 'attendance_scan') {
        title = 'Attendance Recorded';
        body = alert.message || 'Your attendance has been recorded.';
      }
    } else if (role === 'parent') {
      if (alertType === 'link_request') {
        title = 'Student Link Request';
        body = alert.message || `${studentName} wants to link to your account.`;
      } else if (alertType === 'attendance_scan') {
        title = 'Attendance Update';
        body = alert.message || `${studentName}'s attendance has been recorded.`;
      } else if (alertType === 'schedule_current') {
        title = 'Class Happening Now';
        body = alert.message || `${studentName}'s ${alert.subject || 'class'} is happening now (${alert.time || ''}).`;
      }
    } else if (role === 'admin') {
      if (alertType === 'qr_request') {
        title = 'QR Code Generation Request';
        body = alert.message || `${studentName || 'A student'} is requesting QR code generation.`;
      }
    }
    
    // Send push notification
    try {
      await pushService.sendPush(
        fcmToken,
        title,
        body,
        {
          type: 'alert',
          alertId: alert.id || alert.alertId,
          alertType: alertType,
          studentId: alert.studentId || '',
          parentId: alert.parentId || '',
          status: alert.status || 'unread',
          ...alert
        }
      );
      
      // Mark as notified
      if (alertId) {
        notifiedAlerts.set(alertId, now);
      }
      
      console.log(`✅ Auto-sent push notification for ${role} alert: ${alertId}`);
    } catch (pushError) {
      console.error('❌ Failed to auto-send push notification:', pushError);
      
      // If token is invalid, remove it
      if (pushError.code === 'messaging/registration-token-not-registered' || 
          pushError.code === 'messaging/invalid-registration-token') {
        await firestore.collection('users').doc(userDoc.id).update({
          fcmToken: admin.firestore.FieldValue.delete(),
        });
      }
    }
  } catch (error) {
    console.error('Error in sendPushForAlert:', error);
  }
};

/**
 * Initialize listener for student alerts
 */
const initializeStudentAlertsListener = (studentId) => {
  if (!studentId) return;
  
  // Unsubscribe from previous listener if exists
  if (alertListeners.student) {
    alertListeners.student();
    alertListeners.student = null;
  }
  
  const studentAlertsRef = firestore.collection('student_alerts').doc(studentId);
  
  const unsubscribe = studentAlertsRef.onSnapshot(async (snap) => {
    try {
      if (!snap.exists) return;
      
      const data = snap.data() || {};
      const items = Array.isArray(data.items) ? data.items : [];
      
      // Find new unread alerts
      const unreadAlerts = items.filter(item => item.status === 'unread');
      
      for (const alert of unreadAlerts) {
        await sendPushForAlert(alert, 'student', studentId);
      }
    } catch (error) {
      console.error('Error in student alerts listener:', error);
    }
  }, (error) => {
    console.error('Student alerts listener error:', error);
  });
  
  alertListeners.student = unsubscribe;
  console.log(`✅ Initialized student alerts listener for: ${studentId}`);
};

/**
 * Initialize listener for parent alerts
 */
const initializeParentAlertsListener = async (parentId) => {
  if (!parentId) return;
  
  // Unsubscribe from previous listener if exists
  if (alertListeners.parent) {
    alertListeners.parent();
    alertListeners.parent = null;
  }
  
  const parentDocId = await getParentDocId(parentId);
  const parentAlertsRef = firestore.collection('parent_alerts').doc(parentDocId);
  
  const unsubscribe = parentAlertsRef.onSnapshot(async (snap) => {
    try {
      if (!snap.exists) return;
      
      const data = snap.data() || {};
      const items = Array.isArray(data.items) ? data.items : [];
      
      // Find new unread alerts
      const unreadAlerts = items.filter(item => item.status === 'unread');
      
      for (const alert of unreadAlerts) {
        await sendPushForAlert(alert, 'parent', parentDocId);
      }
    } catch (error) {
      console.error('Error in parent alerts listener:', error);
    }
  }, (error) => {
    console.error('Parent alerts listener error:', error);
  });
  
  alertListeners.parent = unsubscribe;
  console.log(`✅ Initialized parent alerts listener for: ${parentDocId}`);
};

/**
 * Initialize listener for admin alerts
 */
const initializeAdminAlertsListener = () => {
  // Unsubscribe from previous listener if exists
  if (alertListeners.admin) {
    alertListeners.admin();
    alertListeners.admin = null;
  }
  
  const adminAlertsRef = firestore.collection('admin_alerts').doc('inbox');
  
  const unsubscribe = adminAlertsRef.onSnapshot(async (snap) => {
    try {
      if (!snap.exists) return;
      
      const data = snap.data() || {};
      const items = Array.isArray(data.items) ? data.items : [];
      
      // Find new unread alerts
      const unreadAlerts = items.filter(item => item.status === 'unread');
      
      for (const alert of unreadAlerts) {
        await sendPushForAlert(alert, 'admin', 'Admin');
      }
    } catch (error) {
      console.error('Error in admin alerts listener:', error);
    }
  }, (error) => {
    console.error('Admin alerts listener error:', error);
  });
  
  alertListeners.admin = unsubscribe;
  console.log('✅ Initialized admin alerts listener');
};

/**
 * Initialize all alert listeners
 * This should be called when the server starts
 */
const initializeAllAlertListeners = async () => {
  try {
    // Initialize admin alerts listener (always active)
    initializeAdminAlertsListener();
    
    // For student and parent alerts, we need to listen to all documents
    // We'll use collection group queries or listen to all documents
    
    // Listen to all student_alerts documents
    const studentAlertsCollection = firestore.collection('student_alerts');
    studentAlertsCollection.onSnapshot(async (snapshot) => {
      snapshot.docChanges().forEach(async (change) => {
        if (change.type === 'modified' || change.type === 'added') {
          const studentId = change.doc.id;
          const data = change.doc.data() || {};
          const items = Array.isArray(data.items) ? data.items : [];
          
          const unreadAlerts = items.filter(item => item.status === 'unread');
          for (const alert of unreadAlerts) {
            await sendPushForAlert(alert, 'student', studentId);
          }
        }
      });
    }, (error) => {
      console.error('Student alerts collection listener error:', error);
    });
    
    // Listen to all parent_alerts documents
    const parentAlertsCollection = firestore.collection('parent_alerts');
    parentAlertsCollection.onSnapshot(async (snapshot) => {
      snapshot.docChanges().forEach(async (change) => {
        if (change.type === 'modified' || change.type === 'added') {
          const parentDocId = change.doc.id;
          const data = change.doc.data() || {};
          const items = Array.isArray(data.items) ? data.items : [];
          
          const unreadAlerts = items.filter(item => item.status === 'unread');
          for (const alert of unreadAlerts) {
            await sendPushForAlert(alert, 'parent', parentDocId);
          }
        }
      });
    }, (error) => {
      console.error('Parent alerts collection listener error:', error);
    });
    
    console.log('✅ All alert listeners initialized');
  } catch (error) {
    console.error('Error initializing alert listeners:', error);
  }
};

/**
 * Clean up old notification timestamps (prevent memory leak)
 */
setInterval(() => {
  const now = Date.now();
  const ONE_HOUR = 60 * 60 * 1000;
  
  for (const [alertId, timestamp] of notifiedAlerts.entries()) {
    if (now - timestamp > ONE_HOUR) {
      notifiedAlerts.delete(alertId);
    }
  }
}, 10 * 60 * 1000); // Run every 10 minutes

/**
 * Cleanup all listeners
 */
const cleanupAlertListeners = () => {
  if (alertListeners.student) {
    alertListeners.student();
    alertListeners.student = null;
  }
  if (alertListeners.parent) {
    alertListeners.parent();
    alertListeners.parent = null;
  }
  if (alertListeners.admin) {
    alertListeners.admin();
    alertListeners.admin = null;
  }
  notifiedAlerts.clear();
};

module.exports = {
  initializeAllAlertListeners,
  initializeStudentAlertsListener,
  initializeParentAlertsListener,
  initializeAdminAlertsListener,
  cleanupAlertListeners,
};

