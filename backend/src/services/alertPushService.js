// alertPushService.js - Backend service to automatically send push notifications when alerts change
// ULTRA-STRICT VERSION - Only send to the exact logged-in user who owns the alert document
// CRITICAL: All alerts must have matching recipient ID before processing
const { firestore, admin } = require('../config/firebase');
const pushService = require('./pushService');
const { getLinkFcmTokens, verifyUserIdentity } = require('../utils/linkFcmTokenHelper');

let alertListeners = {
  student: null,
  parent: null,
  admin: null,
  studentCollection: null,
  parentCollection: null,
  conversations: null,
};

// Track which alerts we've already notified about (prevent duplicates)
const notifiedAlerts = new Map(); // Key: `${alertId}_${userId}`, Value: timestamp

/**
 * CRITICAL: Verify user is logged in and active
 * Returns true only if user has ALL required fields and logged in within 24 HOURS
 * This prevents sending notifications to users who logged out or are inactive
 */
const isUserLoggedIn = (userData) => {
  if (!userData) {
    console.log('⏭️ isUserLoggedIn: userData is null/undefined');
    return false;
  }
  
  // Must have role, uid, and fcmToken
  if (!userData.role || !userData.uid || !userData.fcmToken) {
    console.log('⏭️ isUserLoggedIn: missing required fields', {
      hasRole: !!userData.role,
      hasUid: !!userData.uid,
      hasFcmToken: !!userData.fcmToken
    });
    return false;
  }
  
// Must have login timestamp (STRICT: do NOT fall back to pushTokenUpdatedAt)
const lastLoginAt = userData.lastLoginAt;
if (!lastLoginAt) {
  console.log('⏭️ isUserLoggedIn: no lastLoginAt timestamp (treating as logged out)');
  return false;
}
  
  // Parse timestamp
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
    console.log('⏭️ isUserLoggedIn: error parsing lastLoginAt', e.message);
    return false;
  }
  
  if (!loginTimestampMs || isNaN(loginTimestampMs)) {
    console.log('⏭️ isUserLoggedIn: invalid timestamp');
    return false;
  }
  
  // CRITICAL: Must be logged in within 12 HOURS (not 30 days)
  // This ensures we only send to actively logged-in users
  // Users who haven't logged in within 12 hours are considered inactive/logged out
  const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;
  const timeSinceLogin = Date.now() - loginTimestampMs;
  
  if (timeSinceLogin > TWELVE_HOURS_MS) {
    const hoursSinceLogin = Math.floor(timeSinceLogin / (60 * 60 * 1000));
    console.log(`⏭️ isUserLoggedIn: REJECTED - user logged in ${hoursSinceLogin} hours ago (more than 12 hours - INACTIVE/LOGGED OUT)`);
    return false;
  }
  
  const hoursSinceLogin = Math.floor(timeSinceLogin / (60 * 60 * 1000));
  const minutesSinceLogin = Math.floor((timeSinceLogin % (60 * 60 * 1000)) / (60 * 1000));
  console.log(`✅ isUserLoggedIn: APPROVED - user is actively logged in (logged in ${hoursSinceLogin}h ${minutesSinceLogin}m ago)`);
  return true;
};

/**
 * Send push notification for an alert - ULTRA-STRICT VALIDATION
 * ONLY sends to the user whose document ID matches the alert document ID AND is logged in
 */
const sendPushForAlert = async (alert, role, userId) => {
  try {
    // Skip if already read
    if (alert.status === 'read') {
      return;
    }

    const alertId = alert.id || alert.alertId;
    if (!alertId) {
      console.log(`⏭️ [${role}] SKIP - alert has no ID`);
      return;
    }

    const deduplicationKey = `${alertId}_${userId}`;
    const now = Date.now();
    
    // Prevent duplicate notifications (5 minute cooldown)
    const lastNotified = notifiedAlerts.get(deduplicationKey) || 0;
    if (now - lastNotified < 5 * 60 * 1000) {
      console.log(`⏭️ [${role}] SKIP - already notified ${userId} for alert ${alertId} recently`);
      return;
    }

    console.log(`🔍 [${role}] Checking push for userId: ${userId}, alertId: ${alertId}`);

    // CRITICAL STEP 1: Get user document by EXACT document ID
    const userDoc = await firestore.collection('users').doc(userId).get();
    
    if (!userDoc.exists) {
      console.log(`⏭️ [${role}] SKIP - user document ${userId} does not exist`);
      return;
    }
    
    const userData = userDoc.data();
    
    // CRITICAL STEP 2: Verify user is logged in FIRST (before any other checks)
    if (!isUserLoggedIn(userData)) {
      console.log(`⏭️ [${role}] SKIP - user ${userId} is NOT LOGGED IN or INACTIVE`);
      return;
    }
    
    // CRITICAL STEP 3: Verify role matches
    if (String(userData.role).toLowerCase() !== role.toLowerCase()) {
      console.log(`⏭️ [${role}] SKIP - user ${userId} role (${userData.role}) doesn't match alert role (${role})`);
      return;
    }
    
    // CRITICAL STEP 4: Verify document ID matches user's ID field
    if (role === 'student') {
      const userStudentId = userData.studentId;
      if (!userStudentId) {
        console.log(`⏭️ [${role}] SKIP - user ${userId} has no studentId field`);
        return;
      }
      const normalizedUserStudentId = String(userStudentId).replace(/-/g, '').trim().toLowerCase();
      const normalizedUserId = String(userId).replace(/-/g, '').trim().toLowerCase();
      if (normalizedUserStudentId !== normalizedUserId) {
        console.log(`⏭️ [${role}] SKIP - document ID (${userId}) doesn't match user's studentId (${userStudentId})`);
        return;
      }
    } else if (role === 'parent') {
      const userParentId = userData.parentId || userData.parentIdNumber;
      if (!userParentId) {
        console.log(`⏭️ [${role}] SKIP - user ${userId} has no parentId field`);
        return;
      }
      const normalizedUserParentId = String(userParentId).replace(/-/g, '').trim().toLowerCase();
      const normalizedUserId = String(userId).replace(/-/g, '').trim().toLowerCase();
      if (normalizedUserParentId !== normalizedUserId) {
        console.log(`⏭️ [${role}] SKIP - document ID (${userId}) doesn't match user's parentId (${userParentId})`);
        return;
      }
    } else if (role === 'admin') {
      if (userId !== 'Admin' && userId !== userData.uid) {
        console.log(`⏭️ [${role}] SKIP - admin userId (${userId}) doesn't match uid (${userData.uid})`);
        return;
      }
      
      // CRITICAL: Verify alert is actually an admin alert
      const alertType = alert.type || alert.alertType || '';
      const hasParentId = !!(alert.parentId || alert.parent_id);
      const hasStudentId = !!(alert.studentId || alert.student_id);
      
      // SPECIAL CASE: qr_request alerts can have studentId (they're FROM students TO admins)
      const isQrRequest = alertType.toLowerCase() === 'qr_request';
      
      // For non-qr_request alerts, reject if they have parentId or studentId
      if (!isQrRequest && (hasParentId || hasStudentId)) {
        console.log(`⏭️ [${role}] SKIP - admin alert has parentId (${hasParentId}) or studentId (${hasStudentId}) - this is a parent/student alert`);
        return;
      }
      
      const parentStudentAlertTypes = [
        'schedule_permission_request', 'schedule_permission_response',
        'attendance_scan', 'link_request', 'link_response',
        'schedule_added', 'schedule_updated', 'schedule_deleted', 'schedule_current'
      ];
      const isParentStudentType = parentStudentAlertTypes.some(t => alertType.toLowerCase().includes(t.toLowerCase()));
      
      // Allow qr_request even if it's in the list (it's an exception)
      if (isParentStudentType && !isQrRequest) {
        console.log(`⏭️ [${role}] SKIP - alert type "${alertType}" is a parent/student alert type, not an admin alert`);
        return;
      }
      
      if (isQrRequest) {
        console.log(`✅ [${role}] QR request alert verified - will send to admin users`);
      }
    }
    
    // CRITICAL STEP 5: Verify alert belongs to this user
    if (role === 'student') {
      const alertStudentId = alert.studentId || alert.student_id;
      if (alertStudentId) {
        const normalizedAlertStudentId = String(alertStudentId).replace(/-/g, '').trim().toLowerCase();
        const normalizedUserId = String(userId).replace(/-/g, '').trim().toLowerCase();
        if (normalizedAlertStudentId !== normalizedUserId) {
          console.log(`⏭️ [${role}] SKIP - alert studentId (${alertStudentId}) doesn't match userId (${userId})`);
          return;
        }
      }
    } else if (role === 'parent') {
      const alertParentId = alert.parentId || alert.parent_id;
      if (alertParentId) {
        const normalizedAlertParentId = String(alertParentId).replace(/-/g, '').trim().toLowerCase();
        const normalizedUserId = String(userId).replace(/-/g, '').trim().toLowerCase();
        if (normalizedAlertParentId !== normalizedUserId) {
          console.log(`⏭️ [${role}] SKIP - alert parentId (${alertParentId}) doesn't match userId (${userId})`);
          return;
        }
      }
      
      // CRITICAL: For parent alerts, MUST verify active link to student
      const alertStudentId = alert.studentId || alert.student_id;
      if (!alertStudentId) {
        console.log(`⏭️ [${role}] SKIP - parent alert has no studentId (cannot verify link)`);
        return;
      }
      
      // Try to find active link
      let linkFound = false;
      let linkDocument = null;
      const parentIdNumber = userData?.parentId || userData?.parentIdNumber || userId;
      
      // Query by parent UID and studentId
      try {
        const linkQuery1 = await firestore.collection('parent_student_links')
          .where('parentId', '==', userData.uid)
          .where('studentId', '==', String(alertStudentId))
          .where('status', '==', 'active')
          .limit(1)
          .get();
        
        if (!linkQuery1.empty) {
          linkFound = true;
          linkDocument = linkQuery1.docs[0];
        }
      } catch (e) {
        // Continue to next query
      }
      
      // Query by canonical IDs if needed
      if (!linkFound && parentIdNumber && parentIdNumber !== userData.uid) {
        try {
          const linkQuery2 = await firestore.collection('parent_student_links')
            .where('parentIdNumber', '==', String(parentIdNumber))
            .where('studentIdNumber', '==', String(alertStudentId))
            .where('status', '==', 'active')
            .limit(1)
            .get();
          
          if (!linkQuery2.empty) {
            linkFound = true;
            linkDocument = linkQuery2.docs[0];
          }
        } catch (e) {
          // Continue
        }
      }
      
      if (!linkFound) {
        console.log(`⏭️ [${role}] SKIP - parent ${userId} is NOT actively linked to student ${alertStudentId}`);
        return;
      }
      
      // For attendance_scan alerts, use FCM token from link if available
      if (linkDocument && (alert.type === 'attendance_scan' || alert.alertType === 'attendance_scan')) {
        const linkData = linkDocument.data();
        const linkParentFcmToken = linkData?.parentFcmToken || null;
        
        if (linkParentFcmToken && userData.fcmToken) {
          const title = alert.title || 'New Alert';
          const body = alert.message || alert.body || 'You have a new alert';
          
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
              userUid: userData.uid,
              userEmail: userData.email,
              userFirstName: userData.firstName,
              userLastName: userData.lastName,
              ...alert
            }
          );
          
          notifiedAlerts.set(deduplicationKey, Date.now());
          console.log(`✅✅✅ PUSH SENT to ${role} ${userId} (${userData.uid}) using link token - ${title}`);
          return;
        }
      }
    }
    
    // ALL VALIDATIONS PASSED - Send notification
    const title = alert.title || 'New Alert';
    const body = alert.message || alert.body || 'You have a new alert';
    
    if (!userData.fcmToken) {
      console.log(`⏭️ [${role}] SKIP - user ${userId} has no FCM token`);
      return;
    }
    
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
        userUid: userData.uid,
        userEmail: userData.email,
        userFirstName: userData.firstName,
        userLastName: userData.lastName,
        ...alert
      }
    );
    
    notifiedAlerts.set(deduplicationKey, Date.now());
    console.log(`✅✅✅ PUSH SENT to ${role} ${userId} (${userData.uid}) - ${title}`);
    
  } catch (error) {
    console.error(`❌ Push failed for ${role} ${userId}:`, error.message);
  }
};

/**
 * Initialize listener for student alerts
 */
const initializeStudentAlertsListener = () => {
  if (alertListeners.studentCollection) {
    alertListeners.studentCollection();
  }
  
  let previousStudentAlerts = new Map();
  let isInitialSnapshot = true;
  const listenerStartTime = Date.now();
  
  const studentAlertsCollection = firestore.collection('student_alerts');
  
  alertListeners.studentCollection = studentAlertsCollection.onSnapshot(async (snapshot) => {
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
    
    for (const change of snapshot.docChanges()) {
      if (change.type === 'added' || change.type === 'modified') {
        const studentId = change.doc.id;
        console.log(`📋 [LISTENER] Processing ${change.type} for student document: ${studentId}`);
        
        const items = Array.isArray(change.doc.data()?.items) ? change.doc.data().items : [];
        const previousAlertIds = previousStudentAlerts.get(studentId) || new Set();
        
        // Find new unread alerts
        const newAlerts = items.filter(item => {
          const alertId = item.id || item.alertId;
          if (item.status !== 'unread' || !alertId || previousAlertIds.has(alertId)) {
            return false;
          }
          
          // Extract timestamp
          let alertTime = null;
          try {
            if (item.createdAt) {
              if (typeof item.createdAt === 'string') {
                alertTime = new Date(item.createdAt).getTime();
              } else if (item.createdAt.toMillis) {
                alertTime = item.createdAt.toMillis();
              } else if (item.createdAt.seconds) {
                alertTime = item.createdAt.seconds * 1000;
              }
            }
            
            if (!alertTime && typeof alertId === 'string' && alertId.includes('_')) {
              const parts = alertId.split('_');
              for (const part of parts) {
                const num = parseInt(part, 10);
                if (!isNaN(num) && num > 1000000000000) {
                  alertTime = num;
                  break;
                }
              }
            }
          } catch (e) {
            // Ignore
          }
          
          if (alertTime && alertTime > listenerStartTime) {
            return true;
          }
          return false;
        });
        
        const allCurrentAlertIds = new Set(items.map(item => item.id || item.alertId).filter(Boolean));
        previousStudentAlerts.set(studentId, allCurrentAlertIds);
        
        // CRITICAL: Process each alert with strict validation
        for (const alert of newAlerts) {
          // CRITICAL: Verify alert's studentId matches document ID
          // Document ID is student ID number (e.g., "2022-00789")
          // Alert's studentId might be either student ID number OR Firebase UID
          const alertStudentId = alert.studentId || alert.student_id;
          
          // CRITICAL: Verify student document exists first
          const studentDocCheck = await firestore.collection('users').doc(studentId).get();
          if (!studentDocCheck.exists) {
            console.log(`⏭️ [LISTENER] SKIP - student document ${studentId} does not exist`);
            continue;
          }
          
          const studentDataCheck = studentDocCheck.data();
          
          // Now verify alert's studentId matches
          if (alertStudentId) {
            const normalizedAlertStudentId = String(alertStudentId).replace(/-/g, '').trim().toLowerCase();
            const normalizedStudentId = String(studentId).replace(/-/g, '').trim().toLowerCase();
            
            // Check if alert's studentId matches document ID (student ID number)
            const matchesDocumentId = normalizedAlertStudentId === normalizedStudentId;
            
            // Check if alert's studentId matches the user's UID (Firebase document ID)
            const studentUid = String(studentDataCheck.uid || '').replace(/-/g, '').trim().toLowerCase();
            const matchesUid = normalizedAlertStudentId === studentUid;
            
            // Check if alert's studentId matches the user's studentId field
            const userStudentId = String(studentDataCheck.studentId || '').replace(/-/g, '').trim().toLowerCase();
            const matchesUserStudentId = normalizedAlertStudentId === userStudentId;
            
            if (!matchesDocumentId && !matchesUid && !matchesUserStudentId) {
              console.log(`⏭️ [LISTENER] SKIP - alert studentId (${alertStudentId}) doesn't match document ID (${studentId}), UID (${studentDataCheck.uid}), or user's studentId (${studentDataCheck.studentId})`);
              continue;
            }
          } else {
            // If alert has no studentId, set it to the document ID
            alert.studentId = studentId;
          }
          
          // Role must be student
          if (String(studentDataCheck.role).toLowerCase() !== 'student') {
            console.log(`⏭️ [LISTENER] SKIP - user ${studentId} role (${studentDataCheck.role}) is not student`);
            continue;
          }
          
          console.log(`✅ [LISTENER] Student ${studentId} VERIFIED - finding linked parents`);
          
          // Find all active parent-student links for this student
          const linkedParents = [];
          
          // Query 1: By studentId (UID)
          try {
            const linksQuery1 = await firestore.collection('parent_student_links')
              .where('studentId', '==', String(studentId))
              .where('status', '==', 'active')
              .get();
            
            linksQuery1.docs.forEach(doc => {
              const linkData = doc.data();
              // parentIdNumber is canonical ID (e.g., "9759-68433"), parentId is UID
              const parentId = linkData.parentIdNumber || linkData.parentId;
              const parentUid = linkData.parentId;
              if (parentId) {
                linkedParents.push({
                  parentId: parentId,
                  parentUid: parentUid,
                  linkDoc: doc,
                  linkData: linkData
                });
              }
            });
          } catch (e) {
            console.error(`❌ Error querying parent_student_links by studentId:`, e.message);
          }
          
          // Query 2: By studentIdNumber (canonical ID)
          try {
            const studentIdNumber = studentDataCheck.studentId || studentId;
            const linksQuery2 = await firestore.collection('parent_student_links')
              .where('studentIdNumber', '==', String(studentIdNumber))
              .where('status', '==', 'active')
              .get();
            
            linksQuery2.docs.forEach(doc => {
              const linkData = doc.data();
              // parentIdNumber is canonical ID (e.g., "9759-68433"), parentId is UID
              const parentId = linkData.parentIdNumber || linkData.parentId;
              const parentUid = linkData.parentId;
              if (parentId) {
                // Avoid duplicates
                const exists = linkedParents.some(p => 
                  (p.parentId === parentId) || (p.parentUid === parentUid)
                );
                if (!exists) {
                  linkedParents.push({
                    parentId: parentId,
                    parentUid: parentUid,
                    linkDoc: doc,
                    linkData: linkData
                  });
                }
              }
            });
          } catch (e) {
            console.error(`❌ Error querying parent_student_links by studentIdNumber:`, e.message);
          }
          
          // CRITICAL: First, send push notification to the STUDENT themselves
          // This should happen regardless of whether there are linked parents
          // Check if student is logged in and has FCM token
          if (isUserLoggedIn(studentDataCheck)) {
            const studentFcmToken = studentDataCheck.fcmToken;
            if (studentFcmToken) {
              try {
                const alertId = alert.id || alert.alertId || `${studentId}_${Date.now()}`;
                const deduplicationKey = `${alertId}_${studentId}`;
                
                // Check if we've already notified about this alert
                if (!notifiedAlerts.has(deduplicationKey)) {
                  const title = alert.title || 'New Alert';
                  const body = alert.message || alert.body || 'You have a new alert';
                  
                  await pushService.sendPush(
                    studentFcmToken,
                    title,
                    body,
                    {
                      type: 'alert',
                      alertId: alertId,
                      alertType: alert.type || alert.alertType || 'student_alert',
                      studentId: studentId,
                      status: alert.status || 'unread',
                      userUid: studentDataCheck.uid,
                      userEmail: studentDataCheck.email,
                      userFirstName: studentDataCheck.firstName,
                      userLastName: studentDataCheck.lastName,
                      ...alert
                    }
                  );
                  
                  notifiedAlerts.set(deduplicationKey, Date.now());
                  console.log(`✅✅✅ PUSH SENT to STUDENT ${studentId} (${studentDataCheck.uid}) - ${title}`);
                } else {
                  console.log(`⏭️ [LISTENER] SKIP - already notified student ${studentId} about alert ${alertId}`);
                }
              } catch (pushError) {
                console.error(`❌ Push failed for student ${studentId}:`, pushError.message);
              }
            } else {
              console.log(`⏭️ [LISTENER] SKIP - student ${studentId} has no FCM token`);
            }
          } else {
            console.log(`⏭️ [LISTENER] SKIP - student ${studentId} is NOT LOGGED IN or INACTIVE`);
          }
          
          // CRITICAL: Skip parent notifications for schedule_permission_response alerts
          // These are responses FROM parents TO students, so parents don't need to be notified
          const alertType = alert.type || alert.alertType || '';
          if (alertType.toLowerCase() === 'schedule_permission_response') {
            console.log(`⏭️ [LISTENER] SKIP - schedule_permission_response alert (parent-to-student response) - not sending to parents`);
            continue;
          }
          
          // Now send push notifications to linked parents (if any)
          if (linkedParents.length === 0) {
            console.log(`⏭️ [LISTENER] No active parent links found for student ${studentId} - skipping parent notifications`);
            continue;
          }
          
          console.log(`📋 [LISTENER] Found ${linkedParents.length} linked parent(s) for student ${studentId}`);
          
          // Send push notification to each linked parent
          for (const parentLink of linkedParents) {
            const parentId = parentLink.parentId;
            const parentUid = parentLink.parentUid;
            
            // Try to get parent document by parentId (canonical ID)
            let parentDoc = await firestore.collection('users').doc(parentId).get();
            
            // If not found and we have parentUid, try by UID
            if (!parentDoc.exists && parentUid) {
              const parentQuery = await firestore.collection('users')
                .where('uid', '==', parentUid)
                .limit(1)
                .get();
              if (!parentQuery.empty) {
                parentDoc = parentQuery.docs[0];
              }
            }
            
            if (!parentDoc.exists) {
              console.log(`⏭️ [LISTENER] SKIP - parent document ${parentId} does not exist`);
              continue;
            }
            
            const parentData = parentDoc.data();
            
            // CRITICAL: Check login status FIRST
            if (!isUserLoggedIn(parentData)) {
              console.log(`⏭️ [LISTENER] SKIP - parent ${parentId} is NOT LOGGED IN or INACTIVE`);
              continue;
            }
            
            // Role must be parent
            if (String(parentData.role).toLowerCase() !== 'parent') {
              console.log(`⏭️ [LISTENER] SKIP - user ${parentId} role (${parentData.role}) is not parent`);
              continue;
            }
            
            console.log(`✅ [LISTENER] Parent ${parentId} VERIFIED - sending push notification`);
            
            // Use FCM token from link if available, otherwise use parent's FCM token
            const fcmTokenToUse = parentLink.linkData?.parentFcmToken || parentData.fcmToken;
            
            if (!fcmTokenToUse) {
              console.log(`⏭️ [LISTENER] SKIP - parent ${parentId} has no FCM token`);
              continue;
            }
            
            // Send push notification directly to parent
            try {
              const alertId = alert.id || alert.alertId || `${studentId}_${Date.now()}`;
              const deduplicationKey = `${alertId}_${parentId}`;
              
              // Check if we've already notified about this alert
              if (notifiedAlerts.has(deduplicationKey)) {
                console.log(`⏭️ [LISTENER] SKIP - already notified parent ${parentId} about alert ${alertId}`);
                continue;
              }
              
              const title = alert.title || 'New Student Alert';
              const body = alert.message || alert.body || 'Your student has a new alert';
              
              await pushService.sendPush(
                fcmTokenToUse,
                title,
                body,
                {
                  type: 'alert',
                  alertId: alertId,
                  alertType: alert.type || alert.alertType || 'student_alert',
                  studentId: studentId,
                  parentId: parentId,
                  status: alert.status || 'unread',
                  userUid: parentData.uid,
                  userEmail: parentData.email,
                  userFirstName: parentData.firstName,
                  userLastName: parentData.lastName,
                  ...alert
                }
              );
              
              notifiedAlerts.set(deduplicationKey, Date.now());
              console.log(`✅✅✅ PUSH SENT to parent ${parentId} (${parentData.uid}) - ${title}`);
            } catch (pushError) {
              console.error(`❌ Push failed for parent ${parentId}:`, pushError.message);
            }
          }
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
  
  let previousParentAlerts = new Map();
  let isInitialParentSnapshot = true;
  const listenerStartTime = Date.now();
  
  const parentAlertsCollection = firestore.collection('parent_alerts');
  
  alertListeners.parentCollection = parentAlertsCollection.onSnapshot(async (snapshot) => {
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
    
    for (const change of snapshot.docChanges()) {
      if (change.type === 'added' || change.type === 'modified') {
        const parentId = change.doc.id;
        console.log(`📋 [LISTENER] Processing ${change.type} for parent document: ${parentId}`);
        
        const items = Array.isArray(change.doc.data()?.items) ? change.doc.data().items : [];
        const previousAlertIds = previousParentAlerts.get(parentId) || new Set();
        
        // Find new unread alerts
        const newAlerts = items.filter(item => {
          const alertId = item.id || item.alertId;
          if (item.status !== 'unread' || !alertId || previousAlertIds.has(alertId)) {
            return false;
          }
          
          // Extract timestamp
          let alertTime = null;
          try {
            if (item.createdAt) {
              if (typeof item.createdAt === 'string') {
                alertTime = new Date(item.createdAt).getTime();
              } else if (item.createdAt.toMillis) {
                alertTime = item.createdAt.toMillis();
              } else if (item.createdAt.seconds) {
                alertTime = item.createdAt.seconds * 1000;
              }
            }
            
            if (!alertTime && typeof alertId === 'string' && alertId.includes('_')) {
              const parts = alertId.split('_');
              for (const part of parts) {
                const num = parseInt(part, 10);
                if (!isNaN(num) && num > 1000000000000) {
                  alertTime = num;
                  break;
                }
              }
            }
          } catch (e) {
            // Ignore
          }
          
          if (alertTime && alertTime > listenerStartTime) {
            return true;
          }
          return false;
        });
        
        const allCurrentAlertIds = new Set(items.map(item => item.id || item.alertId).filter(Boolean));
        previousParentAlerts.set(parentId, allCurrentAlertIds);
        
        // CRITICAL: Process each alert with strict validation
        for (const alert of newAlerts) {
          // CRITICAL: Verify alert's parentId matches document ID FIRST
          const alertParentId = alert.parentId || alert.parent_id;
          if (alertParentId) {
            const normalizedAlertParentId = String(alertParentId).replace(/-/g, '').trim().toLowerCase();
            const normalizedParentId = String(parentId).replace(/-/g, '').trim().toLowerCase();
            if (normalizedAlertParentId !== normalizedParentId) {
              console.log(`⏭️ [LISTENER] SKIP - alert parentId (${alertParentId}) doesn't match document ID (${parentId})`);
              continue;
            }
          } else {
            alert.parentId = parentId;
          }
          
          // CRITICAL: Verify user exists and is logged in BEFORE calling sendPushForAlert
          const userDocCheck = await firestore.collection('users').doc(parentId).get();
          if (!userDocCheck.exists) {
            console.log(`⏭️ [LISTENER] SKIP - user document ${parentId} does not exist`);
            continue;
          }
          
          const userDataCheck = userDocCheck.data();
          
          // CRITICAL: Check login status FIRST
          if (!isUserLoggedIn(userDataCheck)) {
            console.log(`⏭️ [LISTENER] SKIP - user ${parentId} is NOT LOGGED IN or INACTIVE`);
            continue;
          }
          
          // Role must match
          if (String(userDataCheck.role).toLowerCase() !== 'parent') {
            console.log(`⏭️ [LISTENER] SKIP - user ${parentId} role (${userDataCheck.role}) is not parent`);
            continue;
          }
          
          console.log(`✅ [LISTENER] User ${parentId} VERIFIED - proceeding to sendPushForAlert`);
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
    
    // Find new unread alerts - CRITICAL: Filter out parent/student alerts BUT allow qr_request
    const newAlerts = items.filter(item => {
      const alertId = item.id || item.alertId;
      if (item.status !== 'unread' || !alertId || previousAdminAlertIds.has(alertId)) {
        return false;
      }
      
      // CRITICAL: Verify this is actually an admin alert
      const alertType = item.type || item.alertType || '';
      const hasParentId = !!(item.parentId || item.parent_id);
      const hasStudentId = !!(item.studentId || item.student_id);
      
      // SPECIAL CASE: qr_request alerts can have studentId (they're FROM students TO admins)
      // This is the only exception - qr_request is an admin alert even if it has studentId
      const isQrRequest = alertType.toLowerCase() === 'qr_request';
      
      // For non-qr_request alerts, reject if they have parentId or studentId
      if (!isQrRequest && (hasParentId || hasStudentId)) {
        console.log(`⏭️ [ADMIN LISTENER] SKIP - alert ${alertId} has parentId (${hasParentId}) or studentId (${hasStudentId})`);
        return false;
      }
      
      const parentStudentAlertTypes = [
        'schedule_permission_request', 'schedule_permission_response',
        'attendance_scan', 'link_request', 'link_response',
        'schedule_added', 'schedule_updated', 'schedule_deleted', 'schedule_current'
      ];
      const isParentStudentType = parentStudentAlertTypes.some(t => alertType.toLowerCase().includes(t.toLowerCase()));
      
      // Allow qr_request even if it's in the list (it's an exception)
      if (isParentStudentType && !isQrRequest) {
        console.log(`⏭️ [ADMIN LISTENER] SKIP - alert ${alertId} type "${alertType}" is a parent/student alert type`);
        return false;
      }
      
      currentAlertIds.add(alertId);
      return true;
    });
    
    previousAdminAlertIds = currentAlertIds;
    
    if (newAlerts.length > 0) {
      // CRITICAL: Only use the single canonical Admin document as the push target.
      // We IGNORE any other 'admin' user documents (by uid) to prevent duplicate or wrong targets.
      const adminUsers = [];
      const adminDocRef = firestore.collection('users').doc('Admin');
      const adminDoc = await adminDocRef.get();

      if (adminDoc.exists) {
        const adminData = adminDoc.data() || {};
        const adminRole = String(adminData.role || '').toLowerCase();

        if (adminRole === 'admin' && isUserLoggedIn(adminData)) {
          adminUsers.push({
            userId: 'Admin',
            email: adminData.email || '',
            role: adminData.role || 'admin',
            fcmToken: adminData.fcmToken || null,
            firstName: adminData.fname || adminData.firstName || '',
            lastName: adminData.lname || adminData.lastName || '',
            uid: adminData.uid || 'Admin',
          });

          console.log('✅ [ADMIN LISTENER] Using canonical Admin document for push notifications:', {
            userId: 'Admin',
            email: adminData.email || 'no email',
            hasFcmToken: !!adminData.fcmToken,
            hasLastLoginAt: !!adminData.lastLoginAt,
          });
        } else {
          console.log('⏭️ [ADMIN LISTENER] Admin document exists but is NOT considered logged in:', {
            role: adminData.role,
            hasFcmToken: !!adminData.fcmToken,
            hasLastLoginAt: !!adminData.lastLoginAt,
          });
        }
      } else {
        console.log('⏭️ [ADMIN LISTENER] Admin document (users/Admin) does NOT exist');
      }
      
      if (adminUsers.length === 0) {
        console.log(`⏭️ [ADMIN LISTENER] No logged-in Admin document found - skipping ${newAlerts.length} alert(s)`);
        return;
      }
      
      console.log(`📨 [ADMIN LISTENER] Sending ${newAlerts.length} alert(s) to ${adminUsers.length} logged-in canonical Admin user(s)`);
      
      // Send to each admin individually
      for (const alert of newAlerts) {
        const alertType = alert.type || alert.alertType || '';
        const isQrRequest = alertType.toLowerCase() === 'qr_request';
        
        // For qr_request, allow studentId (it's FROM student TO admin)
        // For other alerts, verify they don't have parentId/studentId
        if (!isQrRequest) {
          const hasParentId = !!(alert.parentId || alert.parent_id);
          const hasStudentId = !!(alert.studentId || alert.student_id);
          
          if (hasParentId || hasStudentId) {
            console.log(`⏭️ [ADMIN LISTENER] CRITICAL: Skipping alert ${alert.id || alert.alertId} - has parentId/studentId (not qr_request)`);
            continue;
          }
          
          const parentStudentAlertTypes = [
            'schedule_permission_request', 'schedule_permission_response',
            'attendance_scan', 'link_request', 'link_response',
            'schedule_added', 'schedule_updated', 'schedule_deleted', 'schedule_current'
          ];
          const isParentStudentType = parentStudentAlertTypes.some(t => alertType.toLowerCase().includes(t.toLowerCase()));
          
          if (isParentStudentType) {
            console.log(`⏭️ [ADMIN LISTENER] CRITICAL: Skipping alert ${alert.id || alert.alertId} - type "${alertType}" is parent/student type`);
            continue;
          }
        }
        
        // Send to each logged-in admin user
        for (const adminUser of adminUsers) {
          console.log(`📤 [ADMIN LISTENER] Sending ${alertType} alert to admin ${adminUser.userId} (${adminUser.email})`);
          await sendPushForAlert(alert, 'admin', adminUser.userId);
        }
      }
    }
  }, (error) => {
    console.error('Admin alerts listener error:', error);
  });
  
  console.log('✅ Admin alerts listener initialized');
};

/**
 * Initialize listener for conversation messages
 * Sends push notifications to recipients when new messages are sent
 */
const initializeConversationMessagesListener = () => {
  if (alertListeners.conversations) {
    alertListeners.conversations();
  }
  
  let previousMessageIds = new Map(); // Key: conversationId, Value: Set of message IDs
  let isInitialSnapshot = true;
  const listenerStartTime = Date.now();
  
  const conversationsCollection = firestore.collection('conversations');
  
  // Helper function to set up listener for a conversation's messages
  const setupConversationListener = (conversationId) => {
    if (previousMessageIds.has(conversationId)) {
      return; // Already listening to this conversation
    }
    
    previousMessageIds.set(conversationId, new Set());
    
    // Listen to messages subcollection
    const messagesRef = firestore.collection('conversations').doc(conversationId).collection('messages');
          
    messagesRef.onSnapshot(async (messagesSnapshot) => {
            // Find new messages
            const newMessages = [];
            const currentMessageIds = previousMessageIds.get(conversationId) || new Set();
            
            messagesSnapshot.docChanges().forEach(change => {
              if (change.type === 'added') {
                const messageId = change.doc.id;
                if (!currentMessageIds.has(messageId)) {
                  const messageData = change.doc.data();
                  
                  // Extract timestamp
                  let messageTime = null;
                  try {
                    if (messageData.createdAt) {
                      if (typeof messageData.createdAt === 'string') {
                        messageTime = new Date(messageData.createdAt).getTime();
                      } else if (messageData.createdAt.toMillis) {
                        messageTime = messageData.createdAt.toMillis();
                      } else if (messageData.createdAt.seconds) {
                        messageTime = messageData.createdAt.seconds * 1000;
                      }
                    }
                  } catch (e) {
                    // Ignore
                  }
                  
                  // Only process messages created after listener started
                  if (messageTime && messageTime > listenerStartTime) {
                    newMessages.push({
                      id: messageId,
                      ...messageData,
                      conversationId
                    });
                    currentMessageIds.add(messageId);
                  }
                }
              }
            });
            
            previousMessageIds.set(conversationId, currentMessageIds);
            
            // Process each new message
            for (const message of newMessages) {
              const senderId = message.senderId;
              if (!senderId) continue;
              
              // Determine recipient based on conversation data
              let recipientId = null;
              let recipientRole = null;
              let senderName = null;
              
              // Get conversation data to determine recipient
              try {
                const convDoc = await firestore.collection('conversations').doc(conversationId).get();
                if (!convDoc.exists) continue;
                
                const convData = convDoc.data();
                
                // Determine if this is a student-to-parent or student-to-student conversation
                if (convData.parentId && convData.studentId) {
                  // Student-to-parent conversation
                  if (senderId === convData.studentId || String(senderId) === String(convData.studentIdNumber)) {
                    // Student is sender, parent is recipient
                    recipientId = convData.parentIdNumber || convData.parentId;
                    recipientRole = 'parent';
                    
                    // Get sender (student) name
                    try {
                      const senderDoc = await firestore.collection('users').doc(String(convData.studentIdNumber || convData.studentId)).get();
                      if (senderDoc.exists) {
                        const senderData = senderDoc.data();
                        senderName = `${senderData.firstName || ''} ${senderData.lastName || ''}`.trim() || 'Student';
                      }
                    } catch (e) {
                      senderName = 'Student';
                    }
                  } else {
                    // Parent is sender, student is recipient
                    recipientId = convData.studentIdNumber || convData.studentId;
                    recipientRole = 'student';
                    
                    // Get sender (parent) name
                    try {
                      const senderDoc = await firestore.collection('users').doc(String(convData.parentIdNumber || convData.parentId)).get();
                      if (senderDoc.exists) {
                        const senderData = senderDoc.data();
                        senderName = `${senderData.firstName || ''} ${senderData.lastName || ''}`.trim() || 'Parent';
                      }
                    } catch (e) {
                      senderName = 'Parent';
                    }
                  }
                } else if (convData.studentId1 && convData.studentId2) {
                  // Student-to-student conversation
                  const isStudent1Sender = String(senderId) === String(convData.studentId1) || String(senderId) === String(convData.studentIdNumber1);
                  
                  if (isStudent1Sender) {
                    recipientId = convData.studentIdNumber2 || convData.studentId2;
                    recipientRole = 'student';
                  } else {
                    recipientId = convData.studentIdNumber1 || convData.studentId1;
                    recipientRole = 'student';
                  }
                  
                  // Get sender name
                  try {
                    const senderDoc = await firestore.collection('users').doc(String(isStudent1Sender ? (convData.studentIdNumber1 || convData.studentId1) : (convData.studentIdNumber2 || convData.studentId2))).get();
                    if (senderDoc.exists) {
                      const senderData = senderDoc.data();
                      senderName = `${senderData.firstName || ''} ${senderData.lastName || ''}`.trim() || 'Student';
                    }
                  } catch (e) {
                    senderName = 'Student';
                  }
                }
                
                if (!recipientId || !recipientRole) {
                  console.log(`⏭️ [MESSAGE LISTENER] SKIP - could not determine recipient for conversation ${conversationId}`);
                  continue;
                }
                
                // Get recipient user document
                const recipientDoc = await firestore.collection('users').doc(String(recipientId)).get();
                if (!recipientDoc.exists) {
                  console.log(`⏭️ [MESSAGE LISTENER] SKIP - recipient document ${recipientId} does not exist`);
                  continue;
                }
                
                const recipientData = recipientDoc.data();
                
                // Verify recipient is logged in
                if (!isUserLoggedIn(recipientData)) {
                  console.log(`⏭️ [MESSAGE LISTENER] SKIP - recipient ${recipientId} is NOT LOGGED IN or INACTIVE`);
                  continue;
                }
                
                // Verify role matches
                if (String(recipientData.role).toLowerCase() !== recipientRole.toLowerCase()) {
                  console.log(`⏭️ [MESSAGE LISTENER] SKIP - recipient ${recipientId} role (${recipientData.role}) doesn't match expected role (${recipientRole})`);
                  continue;
                }
                
                if (!recipientData.fcmToken) {
                  console.log(`⏭️ [MESSAGE LISTENER] SKIP - recipient ${recipientId} has no FCM token`);
                  continue;
                }
                
                // Send push notification to recipient
                const deduplicationKey = `message_${message.id}_${recipientId}`;
                if (notifiedAlerts.has(deduplicationKey)) {
                  console.log(`⏭️ [MESSAGE LISTENER] SKIP - already notified recipient ${recipientId} about message ${message.id}`);
                  continue;
                }
                
                const title = `New message from ${senderName || 'Someone'}`;
                const body = String(message.text || '').substring(0, 100); // Limit body length
                
                await pushService.sendPush(
                  recipientData.fcmToken,
                  title,
                  body,
                  {
                    type: 'message',
                    conversationId: conversationId,
                    messageId: message.id,
                    senderId: senderId,
                    recipientId: recipientId,
                    recipientRole: recipientRole,
                    text: String(message.text || ''),
                    userUid: recipientData.uid,
                    userEmail: recipientData.email,
                  }
                );
                
                notifiedAlerts.set(deduplicationKey, Date.now());
                console.log(`✅✅✅ MESSAGE PUSH SENT to ${recipientRole} ${recipientId} (${recipientData.uid}) - ${title}`);
              } catch (error) {
                console.error(`❌ Error processing message notification for conversation ${conversationId}:`, error.message);
              }
            }
          }, (error) => {
            console.error(`❌ Error in messages listener for conversation ${conversationId}:`, error);
          });
  };
  
  alertListeners.conversations = conversationsCollection.onSnapshot(async (snapshot) => {
    if (isInitialSnapshot) {
      // Initialize with existing conversations and set up listeners for each
      snapshot.docs.forEach(convDoc => {
        const conversationId = convDoc.id;
        setupConversationListener(conversationId);
      });
      isInitialSnapshot = false;
      console.log(`✅ Conversation messages listener initialized at ${new Date(listenerStartTime).toISOString()}`);
      return;
    }
    
    // For each conversation that changed, set up listener if not already listening
    for (const change of snapshot.docChanges()) {
      if (change.type === 'added' || change.type === 'modified') {
        const conversationId = change.doc.id;
        setupConversationListener(conversationId);
      }
    }
  }, (error) => {
    console.error('Conversation messages listener error:', error);
  });
  
  console.log('✅ Conversation messages listener initialized');
};

/**
 * Initialize all alert listeners
 */
const initializeAllAlertListeners = async () => {
  try {
    initializeAdminAlertsListener();
    initializeStudentAlertsListener();
    initializeParentAlertsListener();
    initializeConversationMessagesListener();
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
}, 10 * 60 * 1000);

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
  if (alertListeners.conversations) {
    alertListeners.conversations();
    alertListeners.conversations = null;
  }
  notifiedAlerts.clear();
};

module.exports = {
  initializeAllAlertListeners,
  cleanupAlertListeners,
  sendPushForAlert
};
