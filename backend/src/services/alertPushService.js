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
    // Use a composite key: alertId + userId to prevent sending same alert to same user multiple times
    const now = Date.now();
    const FIVE_MINUTES = 5 * 60 * 1000;
    const alertId = alert.id || alert.alertId;
    const deduplicationKey = alertId ? `${alertId}_${userId}` : null;
    
    if (deduplicationKey) {
      const lastNotified = notifiedAlerts.get(deduplicationKey) || 0;
      const timeSinceLastNotification = now - lastNotified;
      
      if (timeSinceLastNotification <= FIVE_MINUTES) {
        // Skip - we notified this user about this alert recently
        return;
      }
    }
    
    // CRITICAL: Validate that this alert is actually intended for this user
    // Check alert's target fields to ensure we're sending to the right person
    // This is STRICT validation - alert MUST match the user
    if (role === 'student') {
      // For student alerts, verify the alert's studentId matches the userId
      const alertStudentId = alert.studentId || alert.student_id;
      // STRICT: If alert has a studentId, it MUST match userId
      if (alertStudentId) {
        if (alertStudentId !== userId) {
          console.log(`⏭️ Skipping push notification - alert studentId (${alertStudentId}) doesn't match userId (${userId})`);
          return;
        }
      } else {
        // Alert has no studentId - this is suspicious, skip it
        console.log(`⏭️ Skipping push notification - student alert has no studentId field`);
        return;
      }
    } else if (role === 'parent') {
      // For parent alerts, verify the alert's parentId matches the userId
      const alertParentId = alert.parentId || alert.parent_id;
      // STRICT: If alert has a parentId, it MUST match userId
      if (alertParentId) {
        // Normalize parent IDs (both might have or not have dashes)
        const normalizedAlertParentId = String(alertParentId).trim();
        const normalizedUserId = String(userId).trim();
        
        // Check exact match or if both contain dashes, compare the parts
        if (normalizedAlertParentId !== normalizedUserId) {
          // Try matching without dashes or with dashes
          const alertIdNoDash = normalizedAlertParentId.replace(/-/g, '');
          const userIdNoDash = normalizedUserId.replace(/-/g, '');
          if (alertIdNoDash !== userIdNoDash) {
            console.log(`⏭️ Skipping push notification - alert parentId (${alertParentId}) doesn't match userId (${userId})`);
            return;
          }
        }
      } else {
        // Alert has no parentId - this is suspicious, skip it
        console.log(`⏭️ Skipping push notification - parent alert has no parentId field`);
        return;
      }
    }
    // For admin alerts, we allow sending to all admins (already filtered by login status)
    
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
    
    // CRITICAL: Only send to users who are actually logged in with a role
    // Check 1: User must have a role (not on role selection screen)
    const userRole = userData?.role;
    if (!userRole || typeof userRole !== 'string' || userRole.trim().length === 0) {
      console.log(`⏭️ Skipping push notification - user ${userId} has no role (not logged in)`);
      return; // User hasn't selected a role yet
    }
    
    // Check 2: User must have a UID (actually authenticated)
    const userUid = userData?.uid;
    if (!userUid || typeof userUid !== 'string' || userUid.trim().length === 0) {
      console.log(`⏭️ Skipping push notification - user ${userId} has no UID (not authenticated)`);
      return; // User not authenticated
    }
    
    // Check 3: Role must match the expected role for this alert
    const roleLower = String(userRole).toLowerCase();
    if (role !== roleLower) {
      console.log(`⏭️ Skipping push notification - user ${userId} role (${roleLower}) doesn't match alert role (${role})`);
      return; // Role mismatch
    }
    
    // Check 4: Verify role and UID in userData match what we expect (double-check)
    // This ensures the token wasn't saved before role selection
    if (userData.role !== userRole || userData.uid !== userUid) {
      console.log(`⏭️ Skipping push notification - user ${userId} role/UID mismatch in document`);
      return; // Data inconsistency - skip
    }
    
    // Check 5: FCM token was updated recently (within last 30 minutes - very strict)
    // This indicates the user is currently logged in and active
    const pushTokenUpdatedAt = userData?.pushTokenUpdatedAt;
    if (!pushTokenUpdatedAt) {
      // No timestamp - definitely not logged in
      console.log(`⏭️ Skipping push notification - user ${userId} has no pushTokenUpdatedAt timestamp (not logged in)`);
      return;
    }
    
    // Handle different timestamp formats
    let tokenUpdateTime;
    try {
      if (pushTokenUpdatedAt.toMillis) {
        // Firestore Timestamp
        tokenUpdateTime = pushTokenUpdatedAt.toMillis();
      } else if (pushTokenUpdatedAt.seconds) {
        // Firestore Timestamp (seconds)
        tokenUpdateTime = pushTokenUpdatedAt.seconds * 1000;
      } else if (typeof pushTokenUpdatedAt === 'string') {
        // ISO string
        const parsedDate = new Date(pushTokenUpdatedAt);
        if (isNaN(parsedDate.getTime())) {
          throw new Error('Invalid date string');
        }
        tokenUpdateTime = parsedDate.getTime();
      } else if (typeof pushTokenUpdatedAt === 'number') {
        // Unix timestamp (milliseconds)
        tokenUpdateTime = pushTokenUpdatedAt;
      } else {
        throw new Error('Unknown timestamp format');
      }
    } catch (err) {
      console.log(`⏭️ Skipping push notification - user ${userId} has invalid pushTokenUpdatedAt format: ${err.message}`);
      return;
    }
    
    // Check if timestamp is valid
    if (isNaN(tokenUpdateTime) || tokenUpdateTime <= 0 || tokenUpdateTime > now + 60000) {
      // Timestamp is invalid, negative, or in the future (more than 1 minute)
      console.log(`⏭️ Skipping push notification - user ${userId} has invalid pushTokenUpdatedAt value: ${tokenUpdateTime}`);
      return;
    }
    
    const timeSinceTokenUpdate = now - tokenUpdateTime;
    const THIRTY_MINUTES = 30 * 60 * 1000; // Very strict: only 30 minutes
    
    // If token is older than 30 minutes, user is likely not logged in
    if (timeSinceTokenUpdate > THIRTY_MINUTES) {
      console.log(`⏭️ Skipping push notification - user ${userId} token is too old (${Math.round(timeSinceTokenUpdate / (60 * 1000))} minutes old, max 30 minutes)`);
      return; // User hasn't logged in recently, skip notification
    }
    
    // Additional check: Verify token was saved AFTER role was set
    // If role exists but token timestamp is older than role creation, skip
    const userCreatedAt = userData?.createdAt || userData?.updatedAt;
    if (userCreatedAt) {
      let createdAtTime;
      try {
        if (userCreatedAt.toMillis) {
          createdAtTime = userCreatedAt.toMillis();
        } else if (userCreatedAt.seconds) {
          createdAtTime = userCreatedAt.seconds * 1000;
        } else if (typeof userCreatedAt === 'string') {
          createdAtTime = new Date(userCreatedAt).getTime();
        } else if (typeof userCreatedAt === 'number') {
          createdAtTime = userCreatedAt;
        }
        
        if (createdAtTime && !isNaN(createdAtTime) && tokenUpdateTime < createdAtTime) {
          // Token was saved before user was created - this shouldn't happen, skip
          console.log(`⏭️ Skipping push notification - user ${userId} token timestamp is before user creation`);
          return;
        }
      } catch (err) {
        // Ignore errors in createdAt parsing
      }
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
      
      // Mark as notified (using composite key: alertId + userId)
      if (deduplicationKey) {
        notifiedAlerts.set(deduplicationKey, now);
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
  let previousAdminAlertIds = new Set(); // Track previous alert IDs
  
  const unsubscribe = adminAlertsRef.onSnapshot(async (snap) => {
    try {
      if (!snap.exists) return;
      
      const data = snap.data() || {};
      const items = Array.isArray(data.items) ? data.items : [];
      
      const currentAlertIds = new Set();
      
      // Find NEW unread alerts (not in previous state)
      const unreadAlerts = items.filter(item => {
        const alertId = item.id || item.alertId;
        if (item.status === 'unread' && alertId) {
          currentAlertIds.add(alertId);
          // Only send if this is a NEW alert (not in previous state)
          return !previousAdminAlertIds.has(alertId);
        }
        return false;
      });
      
      // Update previous state
      previousAdminAlertIds = currentAlertIds;
      
      // Send push notifications only for NEW alerts
      // For admin alerts, send to ALL logged-in admin users only
      if (unreadAlerts.length > 0) {
        // Get all admin users
        const adminUsersSnapshot = await firestore.collection('users')
          .where('role', '==', 'admin')
          .get();
        
        const adminUserIds = [];
        const now = Date.now();
        const ONE_HOUR = 60 * 60 * 1000; // Very strict: only 1 hour
        
        adminUsersSnapshot.forEach(doc => {
          const userData = doc.data();
          
          // Check 1: Must have FCM token
          if (!userData?.fcmToken) {
            return; // Skip admins without token
          }
          
          // Check 2: Must have a role (actually logged in)
          const userRole = userData?.role;
          if (!userRole || typeof userRole !== 'string' || userRole.toLowerCase() !== 'admin') {
            return; // Skip if no role or not admin
          }
          
          // Check 3: Must have UID (authenticated)
          const userUid = userData?.uid;
          if (!userUid || typeof userUid !== 'string' || userUid.trim().length === 0) {
            return; // Skip if not authenticated
          }
          
          // Check 4: FCM token was updated recently
          const pushTokenUpdatedAt = userData?.pushTokenUpdatedAt;
          if (!pushTokenUpdatedAt) {
            return; // Skip admins without timestamp
          }
          
          // Handle different timestamp formats
          let tokenUpdateTime;
          if (pushTokenUpdatedAt.toMillis) {
            tokenUpdateTime = pushTokenUpdatedAt.toMillis();
          } else if (pushTokenUpdatedAt.seconds) {
            tokenUpdateTime = pushTokenUpdatedAt.seconds * 1000;
          } else if (typeof pushTokenUpdatedAt === 'string') {
            tokenUpdateTime = new Date(pushTokenUpdatedAt).getTime();
          } else if (typeof pushTokenUpdatedAt === 'number') {
            tokenUpdateTime = pushTokenUpdatedAt;
          } else {
            return; // Invalid format
          }
          
          if (isNaN(tokenUpdateTime) || tokenUpdateTime <= 0) {
            return; // Invalid timestamp
          }
          
          const timeSinceTokenUpdate = now - tokenUpdateTime;
          const THIRTY_MINUTES = 30 * 60 * 1000; // Very strict: only 30 minutes
          
          // Only include if token was updated within last 30 minutes (user is currently logged in)
          if (timeSinceTokenUpdate <= THIRTY_MINUTES) {
            const userId = doc.id === 'Admin' ? 'Admin' : (userData?.uid || doc.id);
            adminUserIds.push(userId);
          }
        });
        
        // If no logged-in admin users found, try the 'Admin' document (but still check if logged in)
        if (adminUserIds.length === 0) {
          const adminDoc = await firestore.collection('users').doc('Admin').get();
          if (adminDoc.exists) {
            const adminData = adminDoc.data();
            
            // Check 1: Must have FCM token
            if (!adminData?.fcmToken) {
              // Skip
            } else {
              // Check 2: Must have a role
              const userRole = adminData?.role;
              if (!userRole || typeof userRole !== 'string' || userRole.toLowerCase() !== 'admin') {
                // Skip
              } else {
                // Check 3: Must have UID
                const userUid = adminData?.uid;
                if (!userUid || typeof userUid !== 'string' || userUid.trim().length === 0) {
                  // Skip
                } else {
                  // Check 4: FCM token was updated recently
                  const pushTokenUpdatedAt = adminData?.pushTokenUpdatedAt;
                  if (pushTokenUpdatedAt) {
                    // Handle different timestamp formats
                    let tokenUpdateTime;
                    if (pushTokenUpdatedAt.toMillis) {
                      tokenUpdateTime = pushTokenUpdatedAt.toMillis();
                    } else if (pushTokenUpdatedAt.seconds) {
                      tokenUpdateTime = pushTokenUpdatedAt.seconds * 1000;
                    } else if (typeof pushTokenUpdatedAt === 'string') {
                      tokenUpdateTime = new Date(pushTokenUpdatedAt).getTime();
                    } else if (typeof pushTokenUpdatedAt === 'number') {
                      tokenUpdateTime = pushTokenUpdatedAt;
                    }
                    
                    if (tokenUpdateTime && !isNaN(tokenUpdateTime) && tokenUpdateTime > 0) {
                      const timeSinceTokenUpdate = now - tokenUpdateTime;
                      const THIRTY_MINUTES = 30 * 60 * 1000; // Very strict: only 30 minutes
                      if (timeSinceTokenUpdate <= THIRTY_MINUTES) {
                        adminUserIds.push('Admin');
                      }
                    }
                  }
                }
              }
            }
          }
        }
        
        // Send notification to each logged-in admin user for each new alert
        for (const alert of unreadAlerts) {
          for (const adminUserId of adminUserIds) {
            await sendPushForAlert(alert, 'admin', adminUserId);
          }
        }
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
    // Track previous state to only send notifications for NEW alerts
    const studentAlertsCollection = firestore.collection('student_alerts');
    let previousStudentAlerts = new Map(); // studentId -> Set of alert IDs
    
    studentAlertsCollection.onSnapshot(async (snapshot) => {
      const changes = snapshot.docChanges();
      for (const change of changes) {
        if (change.type === 'modified' || change.type === 'added') {
          const studentId = change.doc.id;
          const data = change.doc.data() || {};
          const items = Array.isArray(data.items) ? data.items : [];
          
          // Get previous alert IDs for this student
          const previousAlertIds = previousStudentAlerts.get(studentId) || new Set();
          const currentAlertIds = new Set();
          
          // Find NEW unread alerts (not in previous state)
          const unreadAlerts = items.filter(item => {
            const alertId = item.id || item.alertId;
            if (item.status === 'unread' && alertId) {
              currentAlertIds.add(alertId);
              // Only send if this is a NEW alert (not in previous state)
              return !previousAlertIds.has(alertId);
            }
            return false;
          });
          
          // Update previous state
          previousStudentAlerts.set(studentId, currentAlertIds);
          
          // Send push notifications only for NEW alerts to THIS specific student
          for (const alert of unreadAlerts) {
            await sendPushForAlert(alert, 'student', studentId);
          }
        }
      }
    }, (error) => {
      console.error('Student alerts collection listener error:', error);
    });
    
    // Listen to all parent_alerts documents
    // Track previous state to only send notifications for NEW alerts
    const parentAlertsCollection = firestore.collection('parent_alerts');
    let previousParentAlerts = new Map(); // parentDocId -> Set of alert IDs
    
    parentAlertsCollection.onSnapshot(async (snapshot) => {
      const changes = snapshot.docChanges();
      for (const change of changes) {
        if (change.type === 'modified' || change.type === 'added') {
          const parentDocId = change.doc.id;
          const data = change.doc.data() || {};
          const items = Array.isArray(data.items) ? data.items : [];
          
          // Get previous alert IDs for this parent
          const previousAlertIds = previousParentAlerts.get(parentDocId) || new Set();
          const currentAlertIds = new Set();
          
          // Find NEW unread alerts (not in previous state)
          const unreadAlerts = items.filter(item => {
            const alertId = item.id || item.alertId;
            if (item.status === 'unread' && alertId) {
              currentAlertIds.add(alertId);
              // Only send if this is a NEW alert (not in previous state)
              return !previousAlertIds.has(alertId);
            }
            return false;
          });
          
          // Update previous state
          previousParentAlerts.set(parentDocId, currentAlertIds);
          
          // Send push notifications only for NEW alerts to THIS specific parent
          for (const alert of unreadAlerts) {
            await sendPushForAlert(alert, 'parent', parentDocId);
          }
        }
      }
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

