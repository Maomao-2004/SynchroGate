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
    console.log(`🔍 [${role}] Checking push for userId: ${userId}, alertId: ${alertId}`);
    const userDoc = await firestore.collection('users').doc(userId).get();
    
    if (!userDoc.exists) {
      console.log(`⏭️ [${role}] SKIP - user document ${userId} does not exist`);
      return; // User doesn't exist - can't send notification
    }
    
    console.log(`✅ [${role}] User document ${userId} exists`);
    
    const userData = userDoc.data();
    
    // CRITICAL STEP 2: Verify document ID matches user's ID field
    // For students: document ID must match userData.studentId EXACTLY
    // For parents: document ID must match userData.parentId EXACTLY
    if (role === 'student') {
      const userStudentId = userData.studentId;
      if (!userStudentId) {
        console.log(`⏭️ [${role}] SKIP - user ${userId} has no studentId field`);
        return;
      }
      // Normalize both for comparison
      const normalizedUserStudentId = String(userStudentId).replace(/-/g, '').trim().toLowerCase();
      const normalizedUserId = String(userId).replace(/-/g, '').trim().toLowerCase();
      if (normalizedUserStudentId !== normalizedUserId) {
        console.log(`⏭️ [${role}] SKIP - document ID (${userId}) doesn't match user's studentId (${userStudentId})`);
        return; // Wrong user - document ID doesn't match
      }
      console.log(`✅ [${role}] Document ID matches user's studentId: ${userId}`);
    } else if (role === 'parent') {
      const userParentId = userData.parentId || userData.parentIdNumber;
      if (!userParentId) {
        console.log(`⏭️ [${role}] SKIP - user ${userId} has no parentId field`);
        return;
      }
      // Normalize both for comparison
      const normalizedUserParentId = String(userParentId).replace(/-/g, '').trim().toLowerCase();
      const normalizedUserId = String(userId).replace(/-/g, '').trim().toLowerCase();
      if (normalizedUserParentId !== normalizedUserId) {
        console.log(`⏭️ [${role}] SKIP - document ID (${userId}) doesn't match user's parentId (${userParentId})`);
        return; // Wrong user - document ID doesn't match
      }
      console.log(`✅ [${role}] Document ID matches user's parentId: ${userId}`);
    } else if (role === 'admin') {
      // For admin, allow 'Admin' document or document ID = uid
      if (userId !== 'Admin' && userId !== userData.uid) {
        console.log(`⏭️ [${role}] SKIP - admin userId (${userId}) doesn't match uid (${userData.uid})`);
        return;
      }
      console.log(`✅ [${role}] Admin user validated: ${userId}`);
    }
    
    // CRITICAL STEP 3: User MUST be logged in
    // Must have: role, UID, FCM token, and login timestamp
    if (!userData?.role) {
      console.log(`⏭️ [${role}] SKIP - user ${userId} has no role (not logged in)`);
      return;
    }
    
    if (!userData?.uid) {
      console.log(`⏭️ [${role}] SKIP - user ${userId} has no uid (not authenticated)`);
      return;
    }
    
    if (!userData?.fcmToken) {
      console.log(`⏭️ [${role}] SKIP - user ${userId} has no fcmToken (not registered for notifications)`);
      return;
    }
    
    // Must have login timestamp
    const lastLoginAt = userData?.lastLoginAt || userData?.pushTokenUpdatedAt;
    if (!lastLoginAt) {
      console.log(`⏭️ [${role}] SKIP - user ${userId} never logged in (no timestamp)`);
      return;
    }
    
    // CRITICAL: Check if login timestamp is recent (within last 30 days)
    // This ensures we only send to users who are actively using the app
    let loginTimestampMs = null;
    try {
      if (typeof lastLoginAt === 'string') {
        loginTimestampMs = new Date(lastLoginAt).getTime();
      } else if (lastLoginAt.toMillis) {
        loginTimestampMs = lastLoginAt.toMillis();
      } else if (lastLoginAt.seconds) {
        loginTimestampMs = lastLoginAt.seconds * 1000;
      } else if (typeof lastLoginAt === 'number') {
        loginTimestampMs = lastLoginAt > 1000000000000 ? lastLoginAt : lastLoginAt * 1000;
      }
    } catch (e) {
      console.log(`⚠️ [${role}] Error parsing login timestamp for user ${userId}`);
    }
    
    if (!loginTimestampMs || isNaN(loginTimestampMs)) {
      console.log(`⏭️ [${role}] SKIP - user ${userId} has invalid login timestamp`);
      return;
    }
    
    const currentTime = Date.now();
    const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000; // 30 days in milliseconds
    const timeSinceLogin = currentTime - loginTimestampMs;
    
    if (timeSinceLogin > THIRTY_DAYS_MS) {
      console.log(`⏭️ [${role}] SKIP - user ${userId} last logged in ${Math.floor(timeSinceLogin / (24 * 60 * 60 * 1000))} days ago (more than 30 days)`);
      return;
    }
    
    // Role must match
    if (String(userData.role).toLowerCase() !== role) {
      console.log(`⏭️ [${role}] SKIP - user ${userId} role (${userData.role}) doesn't match alert role (${role})`);
      return;
    }
    
    console.log(`✅ [${role}] User ${userId} (${userData.uid}) is logged in with role ${userData.role} (last login: ${Math.floor(timeSinceLogin / (60 * 60 * 1000))} hours ago)`);
    
    // CRITICAL STEP 4: Verify alert belongs to this user
    if (role === 'student') {
      const alertStudentId = alert.studentId || alert.student_id;
      if (alertStudentId) {
        const normalizedAlertStudentId = String(alertStudentId).replace(/-/g, '').trim().toLowerCase();
        const normalizedUserId = String(userId).replace(/-/g, '').trim().toLowerCase();
        if (normalizedAlertStudentId !== normalizedUserId) {
          console.log(`⏭️ [${role}] SKIP - alert studentId (${alertStudentId}) doesn't match userId (${userId})`);
          return; // Alert doesn't belong to this user
        }
        console.log(`✅ [${role}] Alert studentId matches userId: ${alertStudentId} === ${userId}`);
      } else {
        console.log(`⚠️ [${role}] Alert has no studentId, assuming it belongs to document owner ${userId}`);
      }
    } else if (role === 'parent') {
      const alertParentId = alert.parentId || alert.parent_id;
      if (alertParentId) {
        const normalizedAlertParentId = String(alertParentId).replace(/-/g, '').trim().toLowerCase();
        const normalizedUserId = String(userId).replace(/-/g, '').trim().toLowerCase();
        if (normalizedAlertParentId !== normalizedUserId) {
          console.log(`⏭️ [${role}] SKIP - alert parentId (${alertParentId}) doesn't match userId (${userId})`);
          return; // Alert doesn't belong to this user
        }
        console.log(`✅ [${role}] Alert parentId matches userId: ${alertParentId} === ${userId}`);
      } else {
        console.log(`⚠️ [${role}] Alert has no parentId, assuming it belongs to document owner ${userId}`);
      }
      
      // CRITICAL: For parent alerts, MUST verify active link to student
      // This ensures alerts are only sent to parents who are actually linked to the student
      const alertStudentId = alert.studentId || alert.student_id;
      if (!alertStudentId) {
        console.log(`⏭️ [${role}] SKIP - parent alert has no studentId (cannot verify link)`);
        return; // No studentId in alert - cannot verify link
      }
      
      // Try multiple queries to find the link (handle both UID and canonical ID formats)
      let linkFound = false;
      let linkDocument = null; // Store the link document to get FCM tokens
      const parentIdNumber = userData?.parentId || userData?.parentIdNumber || userId;
      
      // Query 1: By parent UID and studentId (UID)
      try {
        const linkQuery1 = await firestore.collection('parent_student_links')
          .where('parentId', '==', userData.uid)
          .where('studentId', '==', String(alertStudentId))
          .where('status', '==', 'active')
          .limit(1)
          .get();
        
        if (!linkQuery1.empty) {
          linkFound = true;
          linkDocument = linkQuery1.docs[0]; // Store link document
          console.log(`✅ [${role}] Link found: parent ${userId} (${userData.uid}) linked to student ${alertStudentId} via parentId+studentId`);
        }
      } catch (e) {
        console.log(`⚠️ [${role}] Error querying link by parentId+studentId:`, e.message);
      }
      
      // Query 2: By parentIdNumber (canonical) and studentId
      if (!linkFound && parentIdNumber && parentIdNumber !== userData.uid) {
        try {
          const linkQuery2 = await firestore.collection('parent_student_links')
            .where('parentIdNumber', '==', String(parentIdNumber))
            .where('studentId', '==', String(alertStudentId))
            .where('status', '==', 'active')
            .limit(1)
            .get();
          
          if (!linkQuery2.empty) {
            linkFound = true;
            linkDocument = linkQuery2.docs[0]; // Store link document
            console.log(`✅ [${role}] Link found: parent ${userId} (${parentIdNumber}) linked to student ${alertStudentId} via parentIdNumber+studentId`);
          }
        } catch (e) {
          console.log(`⚠️ [${role}] Error querying link by parentIdNumber+studentId:`, e.message);
        }
      }
      
      // Query 3: By parentIdNumber and studentIdNumber (canonical IDs)
      if (!linkFound && parentIdNumber && parentIdNumber !== userData.uid) {
        try {
          const linkQuery3 = await firestore.collection('parent_student_links')
            .where('parentIdNumber', '==', String(parentIdNumber))
            .where('studentIdNumber', '==', String(alertStudentId))
            .where('status', '==', 'active')
            .limit(1)
            .get();
          
          if (!linkQuery3.empty) {
            linkFound = true;
            linkDocument = linkQuery3.docs[0]; // Store link document
            console.log(`✅ [${role}] Link found: parent ${userId} (${parentIdNumber}) linked to student ${alertStudentId} via canonical IDs`);
          }
        } catch (e) {
          console.log(`⚠️ [${role}] Error querying link by canonical IDs:`, e.message);
        }
      }
      
      // Query 4: By parent UID and studentIdNumber
      if (!linkFound) {
        try {
          const linkQuery4 = await firestore.collection('parent_student_links')
            .where('parentId', '==', userData.uid)
            .where('studentIdNumber', '==', String(alertStudentId))
            .where('status', '==', 'active')
            .limit(1)
            .get();
          
          if (!linkQuery4.empty) {
            linkFound = true;
            linkDocument = linkQuery4.docs[0]; // Store link document
            console.log(`✅ [${role}] Link found: parent ${userId} (${userData.uid}) linked to student ${alertStudentId} via parentId+studentIdNumber`);
          }
        } catch (e) {
          console.log(`⚠️ [${role}] Error querying link by parentId+studentIdNumber:`, e.message);
        }
      }
      
      if (!linkFound) {
        console.log(`⏭️ [${role}] SKIP - parent ${userId} (${userData.uid}) is NOT actively linked to student ${alertStudentId}`);
        return; // Not linked - do not send notification
      }
      
      console.log(`✅ [${role}] VERIFIED: Parent ${userId} (${userData.uid}) is actively linked to student ${alertStudentId}`);
      
      // For attendance_scan alerts, use FCM token from parent_student_links if available
      // BUT STILL VERIFY USER IS LOGGED IN - we already checked above, so this is safe
      if (linkDocument && (alert.type === 'attendance_scan' || alert.alertType === 'attendance_scan')) {
        const linkData = linkDocument.data();
        const linkParentFcmToken = linkData?.parentFcmToken || null;
        
        // CRITICAL: Only use link token if user is still logged in (we already verified this above)
        // Double-check that userData still shows they're logged in
        if (linkParentFcmToken && userData?.fcmToken && userData?.lastLoginAt) {
          // Use FCM token from parent_student_links for attendance scans
          const title = alert.title || 'New Alert';
          const body = alert.message || alert.body || 'You have a new alert';
          
          console.log(`✅ ALL VALIDATIONS PASSED - Sending push to ${role} ${userId} using FCM token from parent_student_links`);
          console.log(`   User: ${userData.uid}, Role: ${userData.role}, Using link token: ${!!linkParentFcmToken}`);
          console.log(`   User is verified logged in: role=${!!userData.role}, uid=${!!userData.uid}, fcmToken=${!!userData.fcmToken}, lastLoginAt=${!!userData.lastLoginAt}`);
          
          await pushService.sendPush(
            linkParentFcmToken,
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
          notifiedAlerts.set(deduplicationKey, Date.now());
          console.log(`✅✅✅ PUSH SENT to ${role} ${userId} (${userData.uid}) using link token - ${title}`);
          return; // Exit early - notification sent using link token
        } else {
          if (!linkParentFcmToken) {
            console.log(`⚠️ [${role}] No FCM token in parent_student_links, falling back to users collection token`);
          } else {
            console.log(`⚠️ [${role}] User not verified logged in (missing: role=${!!userData?.role}, uid=${!!userData?.uid}, fcmToken=${!!userData?.fcmToken}, lastLoginAt=${!!userData?.lastLoginAt}), falling back to users collection token`);
          }
          // Fall through to use userData.fcmToken (which will be validated below)
        }
      }
    }
    
    // ALL VALIDATIONS PASSED - Send notification using FCM token from users collection
    // This is for non-attendance_scan alerts OR if link token is not available
    const title = alert.title || 'New Alert';
    const body = alert.message || alert.body || 'You have a new alert';
    
    // CRITICAL: For specific user notifications (not attendance scans), verify user identity
    // Get complete user info to ensure we're sending to the right person
    const userInfo = {
      uid: userData.uid,
      firstName: userData.firstName || '',
      lastName: userData.lastName || '',
      email: userData.email || '',
      parentId: userData.parentId || userData.parentIdNumber || null,
      studentId: userData.studentId || userData.studentIdNumber || null,
      fcmToken: userData.fcmToken
    };
    
    console.log(`✅ ALL VALIDATIONS PASSED - Sending push to ${role} ${userId}`);
    console.log(`   User Info: uid=${userInfo.uid}, firstName=${userInfo.firstName}, lastName=${userInfo.lastName}, email=${userInfo.email}`);
    console.log(`   HasToken: ${!!userInfo.fcmToken}`);
    
    // Verify alert belongs to this specific user before sending
    if (role === 'student') {
      // For students, verify studentId matches
      const alertStudentId = alert.studentId || alert.student_id;
      if (alertStudentId && userInfo.studentId) {
        const normalizedAlert = String(alertStudentId).replace(/-/g, '').trim().toLowerCase();
        const normalizedUser = String(userInfo.studentId).replace(/-/g, '').trim().toLowerCase();
        if (normalizedAlert !== normalizedUser) {
          console.log(`⏭️ [${role}] SKIP - alert studentId (${alertStudentId}) doesn't match user studentId (${userInfo.studentId})`);
          return; // Alert doesn't belong to this user
        }
      }
    } else if (role === 'parent') {
      // For parents, verify parentId matches (already verified link above, but double-check)
      const alertParentId = alert.parentId || alert.parent_id;
      if (alertParentId && userInfo.parentId) {
        const normalizedAlert = String(alertParentId).replace(/-/g, '').trim().toLowerCase();
        const normalizedUser = String(userInfo.parentId).replace(/-/g, '').trim().toLowerCase();
        if (normalizedAlert !== normalizedUser && alertParentId !== userInfo.uid) {
          console.log(`⏭️ [${role}] SKIP - alert parentId (${alertParentId}) doesn't match user parentId (${userInfo.parentId})`);
          return; // Alert doesn't belong to this user
        }
      }
    }
    
    if (!userInfo.fcmToken) {
      console.log(`⏭️ [${role}] SKIP - user ${userId} has no FCM token`);
      return;
    }
    
    await pushService.sendPush(
      userInfo.fcmToken,
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
    console.log(`✅✅✅ PUSH SENT to ${role} ${userId} (${userData.uid}) - ${title}`);
    
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
  const listenerStartTime = Date.now(); // Track when listener started
  
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
      console.log(`✅ Student alerts listener initialized at ${new Date(listenerStartTime).toISOString()}`);
      return;
    }
    
    // Process changes - ONLY send to the document owner
    // CRITICAL: Process each change sequentially to avoid race conditions
    for (const change of snapshot.docChanges()) {
      if (change.type === 'added' || change.type === 'modified') {
        const studentId = change.doc.id; // Document ID = studentId
        console.log(`📋 [LISTENER] Processing ${change.type} for student document: ${studentId}`);
        const items = Array.isArray(change.doc.data()?.items) ? change.doc.data().items : [];
        const previousAlertIds = previousStudentAlerts.get(studentId) || new Set();
        const currentAlertIds = new Set();
        
        // Find new unread alerts that:
        // 1. Are not in previous set (actually new)
        // 2. Were created AFTER listener started (not old alerts)
        const newAlerts = items.filter(item => {
          const alertId = item.id || item.alertId;
          if (item.status !== 'unread' || !alertId || previousAlertIds.has(alertId)) {
            return false; // Skip if read, no ID, or already seen
          }
          
          // CRITICAL: Check if alert was created AFTER listener started
          let alertTime = null;
          try {
            // Try to extract timestamp from alert ID
            if (typeof alertId === 'string' && alertId.includes('_')) {
              const parts = alertId.split('_');
              for (const part of parts) {
                const num = parseInt(part, 10);
                if (!isNaN(num) && num > 1000000000000) {
                  alertTime = num;
                  break;
                }
              }
            }
            
            // If no timestamp in ID, try createdAt
            if (!alertTime && item.createdAt) {
              if (typeof item.createdAt === 'string') {
                alertTime = new Date(item.createdAt).getTime();
              } else if (item.createdAt.toMillis) {
                alertTime = item.createdAt.toMillis();
              } else if (item.createdAt.seconds) {
                alertTime = item.createdAt.seconds * 1000;
              }
            }
          } catch (e) {
            // Ignore parsing errors
          }
          
          // Only send if alert was created AFTER listener started
          if (alertTime && alertTime > listenerStartTime) {
            currentAlertIds.add(alertId);
            return true;
          } else if (!alertTime) {
            console.log(`⏭️ Skipping alert ${alertId} - cannot determine creation time`);
            return false;
          } else {
            console.log(`⏭️ Skipping alert ${alertId} - created before listener started`);
            return false;
          }
        });
        
        // Update previous set with ALL current alert IDs
        const allCurrentAlertIds = new Set(items.map(item => item.id || item.alertId).filter(Boolean));
        previousStudentAlerts.set(studentId, allCurrentAlertIds);
        
        // CRITICAL: Only send to this specific student (document ID)
        // Verify alert belongs to this student AND user is logged in before sending
        for (const alert of newAlerts) {
          // CRITICAL: Verify alert's studentId matches document ID
          const alertStudentId = alert.studentId || alert.student_id;
          if (alertStudentId) {
            const normalizedAlertStudentId = String(alertStudentId).replace(/-/g, '').trim().toLowerCase();
            const normalizedStudentId = String(studentId).replace(/-/g, '').trim().toLowerCase();
            if (normalizedAlertStudentId !== normalizedStudentId) {
              console.log(`⏭️ [LISTENER] Skipping alert ${alert.id || alert.alertId} - studentId (${alertStudentId}) doesn't match document ID (${studentId})`);
              continue; // Alert doesn't belong to this student
            }
          } else {
            // If no studentId, set it to match document ID
            alert.studentId = studentId;
          }
          
          // DOUBLE CHECK: Verify user exists and is logged in BEFORE calling sendPushForAlert
          const userDocCheck = await firestore.collection('users').doc(studentId).get();
          if (!userDocCheck.exists) {
            console.log(`⏭️ [LISTENER] Skipping alert ${alert.id || alert.alertId} - user document ${studentId} does not exist`);
            continue;
          }
          
          const userDataCheck = userDocCheck.data();
          
          // Check all required fields
          if (!userDataCheck?.role || !userDataCheck?.uid || !userDataCheck?.fcmToken) {
            console.log(`⏭️ [LISTENER] Skipping alert ${alert.id || alert.alertId} - user ${studentId} is missing required fields (role=${!!userDataCheck?.role}, uid=${!!userDataCheck?.uid}, fcmToken=${!!userDataCheck?.fcmToken})`);
            continue;
          }
          
          // Check login timestamp exists
          const lastLoginAtCheck = userDataCheck?.lastLoginAt || userDataCheck?.pushTokenUpdatedAt;
          if (!lastLoginAtCheck) {
            console.log(`⏭️ [LISTENER] Skipping alert ${alert.id || alert.alertId} - user ${studentId} never logged in (no timestamp)`);
            continue;
          }
          
          // Check login timestamp is recent (within 30 days)
          let loginTimestampMsCheck = null;
          try {
            if (typeof lastLoginAtCheck === 'string') {
              loginTimestampMsCheck = new Date(lastLoginAtCheck).getTime();
            } else if (lastLoginAtCheck.toMillis) {
              loginTimestampMsCheck = lastLoginAtCheck.toMillis();
            } else if (lastLoginAtCheck.seconds) {
              loginTimestampMsCheck = lastLoginAtCheck.seconds * 1000;
            } else if (typeof lastLoginAtCheck === 'number') {
              loginTimestampMsCheck = lastLoginAtCheck > 1000000000000 ? lastLoginAtCheck : lastLoginAtCheck * 1000;
            }
          } catch (e) {
            console.log(`⚠️ [LISTENER] Error parsing login timestamp for user ${studentId}`);
          }
          
          if (!loginTimestampMsCheck || isNaN(loginTimestampMsCheck)) {
            console.log(`⏭️ [LISTENER] Skipping alert ${alert.id || alert.alertId} - user ${studentId} has invalid login timestamp`);
            continue;
          }
          
          const nowCheck = Date.now();
          const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
          const timeSinceLoginCheck = nowCheck - loginTimestampMsCheck;
          
          if (timeSinceLoginCheck > THIRTY_DAYS_MS) {
            console.log(`⏭️ [LISTENER] Skipping alert ${alert.id || alert.alertId} - user ${studentId} last logged in ${Math.floor(timeSinceLoginCheck / (24 * 60 * 60 * 1000))} days ago (more than 30 days)`);
            continue;
          }
          
          if (String(userDataCheck.role).toLowerCase() !== 'student') {
            console.log(`⏭️ [LISTENER] Skipping alert ${alert.id || alert.alertId} - user ${studentId} role (${userDataCheck.role}) is not student`);
            continue;
          }
          
          console.log(`📨 [LISTENER] Processing NEW alert for student ${studentId} (${userDataCheck.uid}): ${alert.id || alert.alertId}`);
          await sendPushForAlert(alert, 'student', studentId);
        }
      }
    }
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
  const listenerStartTime = Date.now(); // Track when listener started
  
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
      console.log(`✅ Parent alerts listener initialized at ${new Date(listenerStartTime).toISOString()}`);
      return;
    }
    
    // Process changes - ONLY send to the document owner
    // CRITICAL: Process each change sequentially to avoid race conditions
    for (const change of snapshot.docChanges()) {
      if (change.type === 'added' || change.type === 'modified') {
        const parentId = change.doc.id; // Document ID = parentId
        console.log(`📋 [LISTENER] Processing ${change.type} for parent document: ${parentId}`);
        const items = Array.isArray(change.doc.data()?.items) ? change.doc.data().items : [];
        const previousAlertIds = previousParentAlerts.get(parentId) || new Set();
        const currentAlertIds = new Set();
        
        // Find new unread alerts that:
        // 1. Are not in previous set (actually new)
        // 2. Were created AFTER listener started (not old alerts)
        const newAlerts = items.filter(item => {
          const alertId = item.id || item.alertId;
          if (item.status !== 'unread' || !alertId || previousAlertIds.has(alertId)) {
            return false; // Skip if read, no ID, or already seen
          }
          
          // CRITICAL: Check if alert was created AFTER listener started
          // Extract timestamp from alert ID or use createdAt
          let alertTime = null;
          try {
            // Try createdAt FIRST (most reliable)
            if (item.createdAt) {
              if (typeof item.createdAt === 'string') {
                alertTime = new Date(item.createdAt).getTime();
              } else if (item.createdAt.toMillis) {
                alertTime = item.createdAt.toMillis();
              } else if (item.createdAt.seconds) {
                alertTime = item.createdAt.seconds * 1000;
              }
            }
            
            // If no createdAt, try to extract timestamp from alert ID (format: prefix_timestamp_random or sched_studentId_type_timestamp_random)
            if (!alertTime && typeof alertId === 'string' && alertId.includes('_')) {
              const parts = alertId.split('_');
              // Look for numeric timestamp in the ID (must be > 1000000000000 for milliseconds)
              for (const part of parts) {
                const num = parseInt(part, 10);
                if (!isNaN(num) && num > 1000000000000) { // Valid timestamp (milliseconds)
                  alertTime = num;
                  break;
                }
              }
            }
          } catch (e) {
            console.log(`⚠️ [LISTENER] Error parsing alert time for ${alertId}:`, e.message);
          }
          
          // Only send if alert was created AFTER listener started
          if (alertTime && alertTime > listenerStartTime) {
            currentAlertIds.add(alertId);
            return true; // This is a new alert created after listener started
          } else if (!alertTime) {
            // If we can't determine time, be conservative and skip
            console.log(`⏭️ Skipping alert ${alertId} - cannot determine creation time`);
            return false;
          } else {
            // Alert is old (created before listener started)
            console.log(`⏭️ Skipping alert ${alertId} - created before listener started (${new Date(alertTime).toISOString()} < ${new Date(listenerStartTime).toISOString()})`);
            return false;
          }
        });
        
        // Update previous set with ALL current alert IDs (not just new ones)
        const allCurrentAlertIds = new Set(items.map(item => item.id || item.alertId).filter(Boolean));
        previousParentAlerts.set(parentId, allCurrentAlertIds);
        
        // CRITICAL: Only send to this specific parent (document ID)
        // Verify alert belongs to this parent AND user is logged in before sending
        for (const alert of newAlerts) {
          // CRITICAL: Verify alert's parentId matches document ID
          const alertParentId = alert.parentId || alert.parent_id;
          if (alertParentId) {
            const normalizedAlertParentId = String(alertParentId).replace(/-/g, '').trim().toLowerCase();
            const normalizedParentId = String(parentId).replace(/-/g, '').trim().toLowerCase();
            if (normalizedAlertParentId !== normalizedParentId) {
              console.log(`⏭️ [LISTENER] Skipping alert ${alert.id || alert.alertId} - parentId (${alertParentId}) doesn't match document ID (${parentId})`);
              continue; // Alert doesn't belong to this parent
            }
          } else {
            // If no parentId, set it to match document ID
            alert.parentId = parentId;
          }
          
          // DOUBLE CHECK: Verify user exists and is logged in BEFORE calling sendPushForAlert
          const userDocCheck = await firestore.collection('users').doc(parentId).get();
          if (!userDocCheck.exists) {
            console.log(`⏭️ [LISTENER] Skipping alert ${alert.id || alert.alertId} - user document ${parentId} does not exist`);
            continue;
          }
          
          const userDataCheck = userDocCheck.data();
          
          // Check all required fields
          if (!userDataCheck?.role || !userDataCheck?.uid || !userDataCheck?.fcmToken) {
            console.log(`⏭️ [LISTENER] Skipping alert ${alert.id || alert.alertId} - user ${parentId} is missing required fields (role=${!!userDataCheck?.role}, uid=${!!userDataCheck?.uid}, fcmToken=${!!userDataCheck?.fcmToken})`);
            continue;
          }
          
          // Check login timestamp exists
          const lastLoginAtCheck = userDataCheck?.lastLoginAt || userDataCheck?.pushTokenUpdatedAt;
          if (!lastLoginAtCheck) {
            console.log(`⏭️ [LISTENER] Skipping alert ${alert.id || alert.alertId} - user ${parentId} never logged in (no timestamp)`);
            continue;
          }
          
          // Check login timestamp is recent (within 30 days)
          let loginTimestampMsCheck = null;
          try {
            if (typeof lastLoginAtCheck === 'string') {
              loginTimestampMsCheck = new Date(lastLoginAtCheck).getTime();
            } else if (lastLoginAtCheck.toMillis) {
              loginTimestampMsCheck = lastLoginAtCheck.toMillis();
            } else if (lastLoginAtCheck.seconds) {
              loginTimestampMsCheck = lastLoginAtCheck.seconds * 1000;
            } else if (typeof lastLoginAtCheck === 'number') {
              loginTimestampMsCheck = lastLoginAtCheck > 1000000000000 ? lastLoginAtCheck : lastLoginAtCheck * 1000;
            }
          } catch (e) {
            console.log(`⚠️ [LISTENER] Error parsing login timestamp for user ${parentId}`);
          }
          
          if (!loginTimestampMsCheck || isNaN(loginTimestampMsCheck)) {
            console.log(`⏭️ [LISTENER] Skipping alert ${alert.id || alert.alertId} - user ${parentId} has invalid login timestamp`);
            continue;
          }
          
          const nowCheck = Date.now();
          const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
          const timeSinceLoginCheck = nowCheck - loginTimestampMsCheck;
          
          if (timeSinceLoginCheck > THIRTY_DAYS_MS) {
            console.log(`⏭️ [LISTENER] Skipping alert ${alert.id || alert.alertId} - user ${parentId} last logged in ${Math.floor(timeSinceLoginCheck / (24 * 60 * 60 * 1000))} days ago (more than 30 days)`);
            continue;
          }
          
          if (String(userDataCheck.role).toLowerCase() !== 'parent') {
            console.log(`⏭️ [LISTENER] Skipping alert ${alert.id || alert.alertId} - user ${parentId} role (${userDataCheck.role}) is not parent`);
            continue;
          }
          
          console.log(`📨 [LISTENER] Processing NEW alert for parent ${parentId} (${userDataCheck.uid}): ${alert.id || alert.alertId}`);
          await sendPushForAlert(alert, 'parent', parentId);
        }
      }
    }
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
