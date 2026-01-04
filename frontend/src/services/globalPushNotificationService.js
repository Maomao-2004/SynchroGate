// globalPushNotificationService.js - Global push notification listener for all user roles
import { doc, getDoc, onSnapshot, collection, query, where, getDocs, updateDoc, setDoc, arrayUnion } from 'firebase/firestore';
import { db } from '../utils/firebaseConfig';
import { sendAlertPushNotification } from '../utils/pushNotificationHelper';

let globalListenerActive = false;
let currentUser = null;
let unsubscribeFunctions = [];
let notifiedIds = new Set(); // Track which notifications have already been sent

// Get parent document ID - matches logic from Parent Alerts
const getParentDocId = async (user) => {
  try {
    // First try: if user.parentId already includes '-', it's canonical
    const raw = String(user?.parentId || '').trim();
    if (raw && raw.includes('-')) {
      return raw;
    }
    
    // Second try: query users collection by UID to get canonical parentId
    try {
      const qSnap = await getDocs(query(collection(db, 'users'), where('uid', '==', String(user?.uid || '')), where('role', '==', 'parent')));
      if (!qSnap.empty) {
        const data = qSnap.docs[0].data() || {};
        const cand = String(data.parentId || data.parentIdCanonical || '').trim();
        if (cand && cand.includes('-')) {
          return cand;
        }
      }
    } catch {}
    
    // Third try: get from parent_student_links (query by UID)
    try {
      const linksQ = query(collection(db, 'parent_student_links'), where('parentId', '==', user.uid), where('status', '==', 'active'));
      const linksSnap = await getDocs(linksQ);
      if (!linksSnap.empty) {
        const linkData = linksSnap.docs[0].data();
        const canonicalId = String(linkData.parentIdNumber || linkData.parentNumber || linkData.parentId || '').trim();
        if (canonicalId && canonicalId.includes('-')) {
          return canonicalId;
        }
      }
    } catch {}
    
    // Fallback to UID
    return String(user?.uid || '').trim();
  } catch (e) {
    return String(user?.uid || '').trim();
  }
};

// Initialize global push notification listener for all roles
export const initializeGlobalPushNotifications = async (user) => {
  if (!user?.uid) return;
  
  currentUser = user;
  
  if (globalListenerActive) {
    console.log('Global push notifications already active');
    return;
  }
  
  globalListenerActive = true;
  const role = String(user?.role || '').toLowerCase();
  console.log('🔔 Initializing global push notifications for user:', user.uid, 'role:', role);
  
  try {
    if (role === 'student' && user?.studentId) {
      // Set up real-time listener for student alerts
      const studentAlertsRef = doc(db, 'student_alerts', user.studentId);
      
      const unsubscribe = onSnapshot(studentAlertsRef, async (snap) => {
        try {
          if (!snap.exists()) return;
          
          const data = snap.data() || {};
          const items = Array.isArray(data.items) ? data.items : [];
          
          // Filter for unread alerts only and check if we've already notified
          const unreadAlerts = items.filter(item => item.status === 'unread');
          
          // Send push notifications for new unread alerts only
          for (const alert of unreadAlerts) {
            if (!notifiedIds.has(alert.id)) {
              await sendPushNotificationForAlert(alert, 'student');
              notifiedIds.add(alert.id); // Mark as notified
            }
          }
          
        } catch (error) {
          console.error('Error in student push notification listener:', error);
        }
      });
      
      unsubscribeFunctions.push(unsubscribe);
      
    } else if (role === 'parent') {
      // Set up real-time listener for parent alerts
      const parentDocId = await getParentDocId(user);
      const parentAlertsRef = doc(db, 'parent_alerts', parentDocId);
      
      const unsubscribe = onSnapshot(parentAlertsRef, async (snap) => {
        try {
          if (!snap.exists()) return;
          
          const data = snap.data() || {};
          const items = Array.isArray(data.items) ? data.items : [];
          
          // Filter for unread alerts only and check if we've already notified
          const unreadAlerts = items.filter(item => item.status === 'unread');
          
          // Send push notifications for new unread alerts only
          for (const alert of unreadAlerts) {
            if (!notifiedIds.has(alert.id)) {
              await sendPushNotificationForAlert(alert, 'parent');
              notifiedIds.add(alert.id); // Mark as notified
            }
          }
          
        } catch (error) {
          console.error('Error in parent push notification listener:', error);
        }
      });
      
      unsubscribeFunctions.push(unsubscribe);
      
    } else if (role === 'admin') {
      // Set up real-time listener for admin alerts
      const adminAlertsRef = doc(db, 'admin_alerts', 'inbox');
      
      const unsubscribe = onSnapshot(adminAlertsRef, async (snap) => {
        try {
          if (!snap.exists()) return;
          
          const data = snap.data() || {};
          const items = Array.isArray(data.items) ? data.items : [];
          
          // Filter for unread alerts only and check if we've already notified
          const unreadAlerts = items.filter(item => item.status === 'unread');
          
          // Send push notifications for new unread alerts only
          for (const alert of unreadAlerts) {
            if (!notifiedIds.has(alert.id)) {
              await sendPushNotificationForAlert(alert, 'admin');
              notifiedIds.add(alert.id); // Mark as notified
            }
          }
          
        } catch (error) {
          console.error('Error in admin push notification listener:', error);
        }
      });
      
      unsubscribeFunctions.push(unsubscribe);
    }
    
    console.log('🔔 Global push notifications initialized for role:', role);
  } catch (error) {
    console.error('Error initializing global push notifications:', error);
    globalListenerActive = false;
  }
};

// Send push notification for a specific alert
const sendPushNotificationForAlert = async (alert, role) => {
  try {
    const t = alert.type || alert.alertType;
    let title = alert.title || 'New Alert';
    let body = alert.message || 'You have a new alert.';
    
    // Extract names for personalization
    const parentName = alert.parentName ? 
      String(alert.parentName).trim().split(' ')[0] || 'Parent' : 
      'Parent';
    const studentName = alert.studentName ? 
      String(alert.studentName).trim().split(' ')[0] || 'Student' : 
      'Student';
    
    // Role-specific notification formatting
    if (role === 'student') {
      if (t === 'schedule_current') { 
        title = 'Class Happening Now'; 
        body = alert.message || `Your ${alert.subject || 'class'} is happening now (${alert.time || ''}).`; 
      }
      else if (t === 'link_request') { 
        title = 'Parent Link Request'; 
        body = alert.message || `${parentName} wants to link to your account.`; 
      }
      else if (t === 'link_response' || t === 'link_response_self') { 
        title = 'Link Request Update'; 
        body = alert.message || `Link request with ${parentName} was updated.`; 
      }
      else if (t === 'link_unlinked' || t === 'link_unlinked_self') { 
        title = 'Unlinked Parent'; 
        body = alert.message || `Link with ${parentName} was removed.`; 
      }
      else if (t === 'schedule_added') { 
        title = 'Schedule Added'; 
        body = alert.message || 'A class was added to your schedule.'; 
      }
      else if (t === 'schedule_updated') { 
        title = 'Schedule Updated'; 
        body = alert.message || 'A class in your schedule was updated.'; 
      }
      else if (t === 'schedule_deleted') { 
        title = 'Schedule Deleted'; 
        body = alert.message || 'A class was removed from your schedule.'; 
      }
      else if (t === 'attendance_scan') {
        title = 'Attendance Recorded';
        body = alert.message || 'Your attendance has been recorded.';
      }
      else if (t === 'qr_generated') {
        title = 'QR Code Generated';
        body = alert.message || 'Your QR code has been generated.';
      }
      else if (t === 'qr_changed') {
        title = 'QR Code Changed';
        body = alert.message || 'Your QR code has been updated.';
      }
      else if (t === 'schedule_permission_response') {
        title = 'Schedule Permission Response';
        body = alert.message || 'Your schedule permission request has been responded to.';
      }
    } else if (role === 'parent') {
      if (t === 'link_request') {
        title = 'Student Link Request';
        body = alert.message || `${studentName} wants to link to your account.`;
      }
      else if (t === 'link_response' || t === 'link_response_self') {
        title = 'Link Request Update';
        body = alert.message || `Link request with ${studentName} was updated.`;
      }
      else if (t === 'link_unlinked' || t === 'link_unlinked_self') {
        title = 'Unlinked Student';
        body = alert.message || `Link with ${studentName} was removed.`;
      }
      else if (t === 'attendance_scan') {
        title = 'Attendance Update';
        body = alert.message || `${studentName}'s attendance has been recorded.`;
      }
      else if (t === 'schedule_current') {
        title = 'Class Happening Now';
        body = alert.message || `${studentName}'s ${alert.subject || 'class'} is happening now (${alert.time || ''}).`;
      }
      else if (t === 'schedule_permission_request') {
        title = 'Schedule Permission Request';
        body = alert.message || `${studentName} is requesting permission to modify their schedule.`;
      }
      else if (t === 'schedule_permission_response' || t === 'schedule_permission_response_self') {
        title = 'Schedule Permission Response';
        body = alert.message || `Schedule permission request for ${studentName} has been updated.`;
      }
    } else if (role === 'admin') {
      if (t === 'qr_request') {
        title = 'QR Code Generation Request';
        body = alert.message || `${studentName || 'A student'} is requesting QR code generation.`;
      }
      else {
        title = alert.title || 'Admin Alert';
        body = alert.message || 'You have a new admin alert.';
      }
    }
    
    // Send push notification via backend API
    // Determine the correct userId based on role
    let targetUserId;
    if (role === 'admin') {
      targetUserId = 'Admin'; // Admin users are stored under "Admin" document
    } else if (role === 'developer') {
      targetUserId = 'Developer'; // Developer users are stored under "Developer" document
    } else if (role === 'parent') {
      // Try to get canonical parentId from currentUser or alert
      if (currentUser) {
        const parentDocId = await getParentDocId(currentUser);
        targetUserId = parentDocId;
      } else {
        const parentId = alert.parentId;
        targetUserId = (parentId && String(parentId).includes('-')) ? String(parentId) : parentId || 'unknown';
      }
    } else if (role === 'student') {
      targetUserId = alert.studentId || currentUser?.studentId || 'unknown';
    } else {
      targetUserId = 'unknown';
    }
    
    console.log('🔔 Alert detected, sending push notification via backend:', {
      title,
      role,
      targetUserId,
      alertId: alert.id
    });
    
    // Call the backend API to send push notification
    try {
      await sendAlertPushNotification(alert, targetUserId, role);
      console.log('✅ Push notification sent successfully for alert:', alert.id);
    } catch (error) {
      console.error('❌ Failed to send push notification for alert:', alert.id, error);
      // Don't throw - this is non-blocking
    }
  } catch (error) {
    console.error('Error sending global push notification:', error);
  }
};

// Clean up global listeners
export const cleanupGlobalPushNotifications = () => {
  console.log('🔔 Cleaning up global push notifications');
  unsubscribeFunctions.forEach(unsubscribe => {
    try {
      unsubscribe();
    } catch (error) {
      console.error('Error unsubscribing from global listener:', error);
    }
  });
  unsubscribeFunctions = [];
  globalListenerActive = false;
  currentUser = null;
  notifiedIds.clear(); // Clear notified IDs when cleaning up
};

// Check if global listener is active
export const isGlobalListenerActive = () => globalListenerActive;