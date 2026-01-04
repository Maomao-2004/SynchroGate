// alertPushService.js - Backend service to automatically send push notifications when alerts change
// SIMPLIFIED VERSION - Only send to logged-in users with proper role and links
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
 * Send push notification for an alert - SIMPLIFIED
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

    // STEP 1: Validate alert target matches userId
    // CRITICAL: userId can be either UID or canonical ID (with dashes)
    // alert.studentId/parentId can also be either format
    // We need to check both formats to ensure we're sending to the right user
    
    if (role === 'student') {
      const alertStudentId = alert.studentId || alert.student_id;
      if (!alertStudentId) {
        console.log(`⏭️ Skipping push - alert ${alertId} has no studentId`);
        return; // No studentId in alert
      }
      // Normalize both IDs (remove dashes) for comparison
      const normalizedAlertStudentId = String(alertStudentId).replace(/-/g, '').trim();
      const normalizedUserId = String(userId).replace(/-/g, '').trim();
      // Also check exact match (in case one has dashes and other doesn't)
      if (normalizedAlertStudentId !== normalizedUserId && alertStudentId !== userId) {
        console.log(`⏭️ Skipping push - alert ${alertId} studentId (${alertStudentId}) doesn't match userId (${userId})`);
        return; // Wrong student - IDs don't match
      }
    } else if (role === 'parent') {
      const alertParentId = alert.parentId || alert.parent_id;
      if (!alertParentId) {
        console.log(`⏭️ Skipping push - alert ${alertId} has no parentId`);
        return; // No parentId in alert
      }
      // Normalize both IDs (remove dashes) for comparison
      const normalizedAlertParentId = String(alertParentId).replace(/-/g, '').trim();
      const normalizedUserId = String(userId).replace(/-/g, '').trim();
      // Also check exact match (in case one has dashes and other doesn't)
      if (normalizedAlertParentId !== normalizedUserId && alertParentId !== userId) {
        console.log(`⏭️ Skipping push - alert ${alertId} parentId (${alertParentId}) doesn't match userId (${userId})`);
        return; // Wrong parent - IDs don't match
      }
    }
    
    // STEP 2: Get user document
    let userDoc = await firestore.collection('users').doc(userId).get();
    
    // Try alternative IDs for admin/developer
    if (!userDoc.exists && (role === 'admin' || role === 'developer')) {
      const altId = role === 'admin' ? 'Admin' : 'Developer';
      userDoc = await firestore.collection('users').doc(altId).get();
    }
    
    // Try querying by UID if still not found (userId might be canonical ID)
    if (!userDoc.exists) {
      const querySnapshot = await firestore.collection('users')
        .where('uid', '==', userId)
        .limit(1)
        .get();
      if (!querySnapshot.empty) {
        userDoc = querySnapshot.docs[0];
      }
    }
    
    // For students/parents, also try querying by studentId/parentId if userId is canonical
    if (!userDoc.exists && (role === 'student' || role === 'parent')) {
      const fieldName = role === 'student' ? 'studentId' : 'parentId';
      const querySnapshot = await firestore.collection('users')
        .where(fieldName, '==', userId)
        .limit(1)
        .get();
      if (!querySnapshot.empty) {
        userDoc = querySnapshot.docs[0];
      }
    }

    if (!userDoc.exists) {
      return; // User not found
    }
    
    const userData = userDoc.data();
    
    // STEP 3: CRITICAL - User must be logged in
    // Must have: role, UID, FCM token, and login timestamp (proves they logged in)
    if (!userData?.role || !userData?.uid || !userData?.fcmToken) {
      console.log(`⏭️ Skipping push - user ${userId} not logged in (missing role/uid/token)`);
      return; // Not logged in - missing required fields
    }
    
    // Must have login timestamp (proves user has logged in at least once)
    const lastLoginAt = userData?.lastLoginAt || userData?.pushTokenUpdatedAt;
    if (!lastLoginAt) {
      console.log(`⏭️ Skipping push - user ${userId} never logged in (no timestamp)`);
      return; // Never logged in - no timestamp means they never logged in
    }
    
    // Role must match the alert's target role
    if (String(userData.role).toLowerCase() !== role) {
      console.log(`⏭️ Skipping push - user ${userId} role (${userData.role}) doesn't match alert role (${role})`);
      return; // Role mismatch - wrong user type
    }
    
    // CRITICAL: Verify document ID (userId) matches user's actual ID
    // For students: userId must match userData.studentId
    // For parents: userId must match userData.parentId (canonical)
    if (role === 'student') {
      const userStudentId = userData.studentId;
      if (userStudentId) {
        const normalizedUserStudentId = String(userStudentId).replace(/-/g, '').trim();
        const normalizedUserId = String(userId).replace(/-/g, '').trim();
        if (normalizedUserStudentId !== normalizedUserId && userStudentId !== userId) {
          console.log(`⏭️ Skipping push - document ID (${userId}) doesn't match user's studentId (${userStudentId})`);
          return; // Document ID doesn't match user's studentId
        }
      }
    } else if (role === 'parent') {
      const userParentId = userData.parentId || userData.parentIdNumber;
      if (userParentId) {
        const normalizedUserParentId = String(userParentId).replace(/-/g, '').trim();
        const normalizedUserId = String(userId).replace(/-/g, '').trim();
        if (normalizedUserParentId !== normalizedUserId && userParentId !== userId) {
          console.log(`⏭️ Skipping push - document ID (${userId}) doesn't match user's parentId (${userParentId})`);
          return; // Document ID doesn't match user's parentId
        }
      }
    }
    
    // STEP 4: For parent alerts, verify link to student
    if (role === 'parent') {
      const alertStudentId = alert.studentId || alert.student_id;
      if (alertStudentId) {
        // Check parent_student_links
        const linkQuery = await firestore.collection('parent_student_links')
          .where('parentId', '==', userData.uid)
          .where('studentId', '==', alertStudentId)
          .where('status', '==', 'active')
          .limit(1)
          .get();
        
        if (linkQuery.empty) {
          // Try with parentIdNumber
          const parentIdNumber = userData?.parentId || userData?.parentIdNumber || userId;
          if (parentIdNumber !== userData.uid) {
            const linkQuery2 = await firestore.collection('parent_student_links')
              .where('parentIdNumber', '==', parentIdNumber)
              .where('studentId', '==', alertStudentId)
              .where('status', '==', 'active')
              .limit(1)
              .get();
            
            if (linkQuery2.empty) {
              return; // Not linked
            }
          } else {
            return; // Not linked
          }
        }
      } else {
        return; // No studentId in alert
      }
    }
    
    // STEP 5: Build notification
    const title = alert.title || 'New Alert';
    const body = alert.message || alert.body || 'You have a new alert';
    
    // STEP 6: Send notification
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
    console.log(`✅ Push sent: ${role} ${userId} - ${title}`);
    
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
    
    // Process changes
    snapshot.docChanges().forEach(async (change) => {
      if (change.type === 'added' || change.type === 'modified') {
        const studentId = change.doc.id;
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
        
        // Send notifications for new alerts
        for (const alert of newAlerts) {
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
    
    // Process changes
    snapshot.docChanges().forEach(async (change) => {
      if (change.type === 'added' || change.type === 'modified') {
        const parentId = change.doc.id; // Document ID is the parentId (canonical)
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
        
        // CRITICAL: Only send to the specific parent whose document this is
        // The document ID (parentId) must match a logged-in user's parentId
        for (const alert of newAlerts) {
          // Ensure alert has parentId that matches document ID
          if (!alert.parentId) {
            alert.parentId = parentId; // Set it if missing
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
          adminUserIds.push(doc.id === 'Admin' ? 'Admin' : (userData.uid || doc.id));
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
