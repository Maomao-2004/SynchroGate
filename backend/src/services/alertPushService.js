// alertPushService.js - Backend service to automatically send push notifications when alerts change
// STRICT VERSION - Only send to the exact logged-in user who owns the alert document
const { firestore, admin } = require('../config/firebase');
const pushService = require('./pushService');

let alertListeners = {
  student: null,
  parent: null,
  admin: null,
  studentCollection: null,
  parentCollection: null,
};

// Track which alerts we've already notified about (prevent duplicates)
const notifiedAlerts = new Map(); // Key: `${alertId}_${userId}`, Value: timestamp

/**
 * Send push notification for an alert - STRICT VALIDATION
 * ONLY sends to the user whose document ID matches the alert document ID AND is logged in
 */
const sendPushForAlert = async (alert, role, userId) => {
  try {
    // Skip if already read
    if (alert.status === 'read') {
      return;
    }

    const alertId = alert.id || alert.alertId;
    const deduplicationKey = `${alertId}_${userId}`;
    const now = Date.now();
    
    // Prevent duplicate notifications (5 minute cooldown)
    const lastNotified = notifiedAlerts.get(deduplicationKey) || 0;
    if (now - lastNotified < 5 * 60 * 1000) {
      return; // Already notified recently
    }

    // CRITICAL STEP 1: Get user document by EXACT document ID
    // userId = document ID in users collection = studentId or parentId
    // This MUST match exactly - no fallback queries
    const userDoc = await firestore.collection('users').doc(userId).get();
    
    if (!userDoc.exists) {
      console.log(`⏭️ Skipping push - user document ${userId} does not exist`);
      return; // User doesn't exist - can't send notification
    }
    
    const userData = userDoc.data();
    
    // CRITICAL STEP 2: Verify document ID matches user's ID field
    // For students: document ID must match userData.studentId EXACTLY
    // For parents: document ID must match userData.parentId EXACTLY
    if (role === 'student') {
      const userStudentId = userData.studentId;
      if (!userStudentId) {
        console.log(`⏭️ Skipping push - user ${userId} has no studentId field`);
        return;
      }
      // Normalize both for comparison
      const normalizedUserStudentId = String(userStudentId).replace(/-/g, '').trim().toLowerCase();
      const normalizedUserId = String(userId).replace(/-/g, '').trim().toLowerCase();
      if (normalizedUserStudentId !== normalizedUserId) {
        console.log(`⏭️ Skipping push - document ID (${userId}) doesn't match user's studentId (${userStudentId})`);
        return; // Wrong user - document ID doesn't match
      }
    } else if (role === 'parent') {
      const userParentId = userData.parentId || userData.parentIdNumber;
      if (!userParentId) {
        console.log(`⏭️ Skipping push - user ${userId} has no parentId field`);
        return;
      }
      // Normalize both for comparison
      const normalizedUserParentId = String(userParentId).replace(/-/g, '').trim().toLowerCase();
      const normalizedUserId = String(userId).replace(/-/g, '').trim().toLowerCase();
      if (normalizedUserParentId !== normalizedUserId) {
        console.log(`⏭️ Skipping push - document ID (${userId}) doesn't match user's parentId (${userParentId})`);
        return; // Wrong user - document ID doesn't match
      }
    } else if (role === 'admin') {
      // For admin, allow 'Admin' document or document ID = uid
      if (userId !== 'Admin' && userId !== userData.uid) {
        console.log(`⏭️ Skipping push - admin userId (${userId}) doesn't match uid (${userData.uid})`);
        return;
      }
    }
    
    // CRITICAL STEP 3: User MUST be logged in
    // Must have: role, UID, FCM token, and login timestamp
    if (!userData?.role) {
      console.log(`⏭️ Skipping push - user ${userId} has no role (not logged in)`);
      return;
    }
    
    if (!userData?.uid) {
      console.log(`⏭️ Skipping push - user ${userId} has no uid (not authenticated)`);
      return;
    }
    
    if (!userData?.fcmToken) {
      console.log(`⏭️ Skipping push - user ${userId} has no fcmToken (not registered for notifications)`);
      return;
    }
    
    // Must have login timestamp
    const lastLoginAt = userData?.lastLoginAt || userData?.pushTokenUpdatedAt;
    if (!lastLoginAt) {
      console.log(`⏭️ Skipping push - user ${userId} never logged in (no timestamp)`);
      return;
    }
    
    // Role must match
    if (String(userData.role).toLowerCase() !== role) {
      console.log(`⏭️ Skipping push - user ${userId} role (${userData.role}) doesn't match alert role (${role})`);
      return;
    }
    
    // CRITICAL STEP 4: Verify alert belongs to this user
    if (role === 'student') {
      const alertStudentId = alert.studentId || alert.student_id;
      if (alertStudentId) {
        const normalizedAlertStudentId = String(alertStudentId).replace(/-/g, '').trim().toLowerCase();
        const normalizedUserId = String(userId).replace(/-/g, '').trim().toLowerCase();
        if (normalizedAlertStudentId !== normalizedUserId) {
          console.log(`⏭️ Skipping push - alert studentId (${alertStudentId}) doesn't match userId (${userId})`);
          return; // Alert doesn't belong to this user
        }
      }
    } else if (role === 'parent') {
      const alertParentId = alert.parentId || alert.parent_id;
      if (alertParentId) {
        const normalizedAlertParentId = String(alertParentId).replace(/-/g, '').trim().toLowerCase();
        const normalizedUserId = String(userId).replace(/-/g, '').trim().toLowerCase();
        if (normalizedAlertParentId !== normalizedUserId) {
          console.log(`⏭️ Skipping push - alert parentId (${alertParentId}) doesn't match userId (${userId})`);
          return; // Alert doesn't belong to this user
        }
      }
      
      // For parent alerts, also verify link to student
      const alertStudentId = alert.studentId || alert.student_id;
      if (alertStudentId) {
        const linkQuery = await firestore.collection('parent_student_links')
          .where('parentId', '==', userData.uid)
          .where('studentId', '==', alertStudentId)
          .where('status', '==', 'active')
          .limit(1)
          .get();
        
        if (linkQuery.empty) {
          const parentIdNumber = userData?.parentId || userData?.parentIdNumber || userId;
          if (parentIdNumber !== userData.uid) {
            const linkQuery2 = await firestore.collection('parent_student_links')
              .where('parentIdNumber', '==', parentIdNumber)
              .where('studentId', '==', alertStudentId)
              .where('status', '==', 'active')
              .limit(1)
              .get();
            
            if (linkQuery2.empty) {
              console.log(`⏭️ Skipping push - parent ${userId} not linked to student ${alertStudentId}`);
              return; // Not linked
            }
          } else {
            console.log(`⏭️ Skipping push - parent ${userId} not linked to student ${alertStudentId}`);
            return; // Not linked
          }
        }
      }
    }
    
    // ALL VALIDATIONS PASSED - Send notification
    const title = alert.title || 'New Alert';
    const body = alert.message || alert.body || 'You have a new alert';
    
    await pushService.sendPush(
      userData.fcmToken,
      title,
      body,
      {
        type: 'alert',
        alertId: alertId,
        alertType: alert.type || alert.alertType,
        studentId: alert.studentId || '',
        parentId: alert.parentId || '',
        status: alert.status || 'unread',
        ...alert
      }
    );
    
    // Mark as notified
    notifiedAlerts.set(deduplicationKey, now);
    console.log(`✅ Push sent to ${role} ${userId} - ${title}`);
    
  } catch (error) {
    console.error(`❌ Push failed for ${role} ${userId}:`, error.message);
    // Don't throw - just log and continue
  }
};

/**
 * Initialize listener for student alerts
 */
const initializeStudentAlertsListener = () => {
  if (alertListeners.studentCollection) {
    alertListeners.studentCollection();
  }
  
  let previousStudentAlerts = new Map(); // studentId -> Set of alert IDs
  let isInitialSnapshot = true;
  
  const studentAlertsCollection = firestore.collection('student_alerts');
  
  alertListeners.studentCollection = studentAlertsCollection.onSnapshot(async (snapshot) => {
    // Ignore initial snapshot
    if (isInitialSnapshot) {
      snapshot.docs.forEach(doc => {
        const studentId = doc.id;
        const items = Array.isArray(doc.data()?.items) ? doc.data().items : [];
        const alertIds = new Set(items.map(item => item.id || item.alertId).filter(Boolean));
        previousStudentAlerts.set(studentId, alertIds);
      });
      isInitialSnapshot = false;
      return;
    }
    
    // Process changes - ONLY send to the document owner
    snapshot.docChanges().forEach(async (change) => {
      if (change.type === 'added' || change.type === 'modified') {
        const studentId = change.doc.id; // Document ID = studentId
        const items = Array.isArray(change.doc.data()?.items) ? change.doc.data().items : [];
        const previousAlertIds = previousStudentAlerts.get(studentId) || new Set();
        const currentAlertIds = new Set();
        
        // Find new unread alerts
        const newAlerts = items.filter(item => {
          const alertId = item.id || item.alertId;
          if (item.status === 'unread' && alertId && !previousAlertIds.has(alertId)) {
            currentAlertIds.add(alertId);
            return true;
          }
          return false;
        });
        
        previousStudentAlerts.set(studentId, currentAlertIds);
        
        // CRITICAL: Only send to this specific student (document ID)
        // Ensure alert has studentId matching document ID
        for (const alert of newAlerts) {
          if (!alert.studentId) {
            alert.studentId = studentId; // Set it to match document ID
          }
          await sendPushForAlert(alert, 'student', studentId);
        }
      }
    });
  }, (error) => {
    console.error('Student alerts listener error:', error);
  });
  
  console.log('✅ Student alerts listener initialized');
};

/**
 * Initialize listener for parent alerts
 */
const initializeParentAlertsListener = () => {
  if (alertListeners.parentCollection) {
    alertListeners.parentCollection();
  }
  
  let previousParentAlerts = new Map(); // parentId -> Set of alert IDs
  let isInitialParentSnapshot = true;
  
  const parentAlertsCollection = firestore.collection('parent_alerts');
  
  alertListeners.parentCollection = parentAlertsCollection.onSnapshot(async (snapshot) => {
    // Ignore initial snapshot
    if (isInitialParentSnapshot) {
      snapshot.docs.forEach(doc => {
        const parentId = doc.id;
        const items = Array.isArray(doc.data()?.items) ? doc.data().items : [];
        const alertIds = new Set(items.map(item => item.id || item.alertId).filter(Boolean));
        previousParentAlerts.set(parentId, alertIds);
      });
      isInitialParentSnapshot = false;
      return;
    }
    
    // Process changes - ONLY send to the document owner
    snapshot.docChanges().forEach(async (change) => {
      if (change.type === 'added' || change.type === 'modified') {
        const parentId = change.doc.id; // Document ID = parentId
        const items = Array.isArray(change.doc.data()?.items) ? change.doc.data().items : [];
        const previousAlertIds = previousParentAlerts.get(parentId) || new Set();
        const currentAlertIds = new Set();
        
        // Find new unread alerts
        const newAlerts = items.filter(item => {
          const alertId = item.id || item.alertId;
          if (item.status === 'unread' && alertId && !previousAlertIds.has(alertId)) {
            currentAlertIds.add(alertId);
            return true;
          }
          return false;
        });
        
        previousParentAlerts.set(parentId, currentAlertIds);
        
        // CRITICAL: Only send to this specific parent (document ID)
        // Ensure alert has parentId matching document ID
        for (const alert of newAlerts) {
          if (!alert.parentId) {
            alert.parentId = parentId; // Set it to match document ID
          }
          await sendPushForAlert(alert, 'parent', parentId);
        }
      }
    });
  }, (error) => {
    console.error('Parent alerts listener error:', error);
  });
  
  console.log('✅ Parent alerts listener initialized');
};

/**
 * Initialize listener for admin alerts
 */
const initializeAdminAlertsListener = () => {
  if (alertListeners.admin) {
    alertListeners.admin();
  }
  
  let previousAdminAlertIds = new Set();
  let isInitialAdminSnapshot = true;
  
  const adminAlertsRef = firestore.collection('admin_alerts').doc('inbox');
  
  alertListeners.admin = adminAlertsRef.onSnapshot(async (snap) => {
    if (!snap.exists) return;
    
    // Ignore initial snapshot
    if (isInitialAdminSnapshot) {
      const items = Array.isArray(snap.data()?.items) ? snap.data().items : [];
      items.forEach(item => {
        const alertId = item.id || item.alertId;
        if (alertId) previousAdminAlertIds.add(alertId);
      });
      isInitialAdminSnapshot = false;
      return;
    }
    
    const items = Array.isArray(snap.data()?.items) ? snap.data().items : [];
    const currentAlertIds = new Set();
    
    // Find new unread alerts
    const newAlerts = items.filter(item => {
      const alertId = item.id || item.alertId;
      if (item.status === 'unread' && alertId && !previousAdminAlertIds.has(alertId)) {
        currentAlertIds.add(alertId);
        return true;
      }
      return false;
    });
    
    previousAdminAlertIds = currentAlertIds;
    
    // Get all logged-in admin users
    if (newAlerts.length > 0) {
      const adminUsersSnapshot = await firestore.collection('users')
        .where('role', '==', 'admin')
        .get();
      
      const adminUserIds = [];
      
      adminUsersSnapshot.forEach(doc => {
        const userData = doc.data();
        // Must be logged in: has role, UID, FCM token, and login timestamp
        if (userData?.role === 'admin' && 
            userData?.uid && 
            userData?.fcmToken &&
            (userData?.lastLoginAt || userData?.pushTokenUpdatedAt)) {
          // Use document ID if it's 'Admin', otherwise use uid
          const adminUserId = doc.id === 'Admin' ? 'Admin' : (userData.uid || doc.id);
          adminUserIds.push(adminUserId);
        }
      });
      
      // Also check 'Admin' document
      const adminDoc = await firestore.collection('users').doc('Admin').get();
      if (adminDoc.exists) {
        const adminData = adminDoc.data();
        if (adminData?.role === 'admin' && 
            adminData?.uid && 
            adminData?.fcmToken &&
            (adminData?.lastLoginAt || adminData?.pushTokenUpdatedAt)) {
          if (!adminUserIds.includes('Admin')) {
            adminUserIds.push('Admin');
          }
        }
      }
      
      // Send to all logged-in admins
      for (const alert of newAlerts) {
        for (const adminUserId of adminUserIds) {
          await sendPushForAlert(alert, 'admin', adminUserId);
        }
      }
    }
  }, (error) => {
    console.error('Admin alerts listener error:', error);
  });
  
  console.log('✅ Admin alerts listener initialized');
};

/**
 * Initialize all alert listeners
 */
const initializeAllAlertListeners = async () => {
  try {
    initializeAdminAlertsListener();
    initializeStudentAlertsListener();
    initializeParentAlertsListener();
    console.log('✅ All alert listeners initialized');
  } catch (error) {
    console.error('Error initializing alert listeners:', error);
  }
};

/**
 * Clean up old notification timestamps
 */
setInterval(() => {
  const now = Date.now();
  const ONE_HOUR = 60 * 60 * 1000;
  for (const [key, timestamp] of notifiedAlerts.entries()) {
    if (now - timestamp > ONE_HOUR) {
      notifiedAlerts.delete(key);
    }
  }
}, 10 * 60 * 1000); // Every 10 minutes

/**
 * Cleanup all listeners
 */
const cleanupAlertListeners = () => {
  if (alertListeners.studentCollection) {
    alertListeners.studentCollection();
    alertListeners.studentCollection = null;
  }
  if (alertListeners.parentCollection) {
    alertListeners.parentCollection();
    alertListeners.parentCollection = null;
  }
  if (alertListeners.admin) {
    alertListeners.admin();
    alertListeners.admin = null;
  }
  notifiedAlerts.clear();
};

module.exports = {
  initializeAllAlertListeners,
  cleanupAlertListeners,
  sendPushForAlert
};
