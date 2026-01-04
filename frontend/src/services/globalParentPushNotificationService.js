// globalParentPushNotificationService.js - Global push notification listener for parent alerts
import { doc, getDoc, onSnapshot, collection, query, where, getDocs, updateDoc, setDoc, arrayUnion, orderBy, limit } from 'firebase/firestore';
import * as Notifications from 'expo-notifications';
import { db } from '../utils/firebaseConfig';

let globalListenerActive = false;
let currentUser = null;
let unsubscribeFunctions = [];
let notifiedIds = new Set(); // Track which notifications have already been sent
let notifiedMsgIds = new Set(); // Track which conversation message IDs have been notified

// Get parent document ID - simplified approach
const getParentDocId = async (user) => {
  try {
    // Try user.parentId first
    if (user?.parentId && user.parentId.includes('-')) {
      return user.parentId;
    }
    
    // Try to get from parent_student_links
    const linksQ = query(collection(db, 'parent_student_links'), where('parentId', '==', user.uid), where('status', '==', 'active'));
    const linksSnap = await getDocs(linksQ);
    if (!linksSnap.empty) {
      const linkData = linksSnap.docs[0].data();
      // Look for canonical parent ID
      const canonicalId = linkData.parentIdCanonical || linkData.parentIdNumber || linkData.parentNumber;
      if (canonicalId && canonicalId.includes('-')) {
        return canonicalId;
      }
    }
    
    // Fallback to UID
    return user.uid;
  } catch (e) {
    return user.uid;
  }
};

// Initialize global push notification listener for parents
export const initializeGlobalParentPushNotifications = (user) => {
  if (!user?.uid || user?.role !== 'parent') return;
  
  currentUser = user;
  
  if (globalListenerActive) {
    console.log('Global parent push notifications already active');
    return;
  }
  
  globalListenerActive = true;
  console.log('🔔 Initializing global parent push notifications for user:', user.uid);
  
  // Set up real-time listener for parent alerts
  const setupParentAlertsListener = async () => {
    try {
      const docId = await getParentDocId(user);
      const parentAlertsRef = doc(db, 'parent_alerts', docId);
      
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
              await sendPushNotificationForParentAlert(alert);
              notifiedIds.add(alert.id); // Mark as notified
            }
          }
          
        } catch (error) {
          console.error('Error in global parent push notification listener:', error);
        }
      });
      
      unsubscribeFunctions.push(unsubscribe);
      console.log('🔔 Global parent push notifications listener set up');
      
    } catch (error) {
      console.error('Error setting up parent alerts listener:', error);
    }
  };
  
  const setupConversationMessageListeners = async () => {
    try {
      // Listen to active links for this parent by uid and canonical number
      const linksByUid = query(
        collection(db, 'parent_student_links'),
        where('parentId', '==', user.uid),
        where('status', '==', 'active')
      );
      const hasCanonical = String(user?.parentId || '').includes('-');
      const linksByCanonical = hasCanonical ? query(
        collection(db, 'parent_student_links'),
        where('parentIdNumber', '==', String(user?.parentId || '')),
        where('status', '==', 'active')
      ) : null;

      const attachForLinks = (snap) => {
        try {
          const docs = snap.docs || [];
          const seenConvIds = new Set();
          docs.forEach((d) => {
            const x = d.data() || {};
            const studentKey = x.studentIdNumber || x.studentId;
            const parentKey = user?.parentId || user?.uid;
            if (!studentKey || !parentKey) return;
            const convId = `${studentKey}-${parentKey}`;
            if (seenConvIds.has(convId)) return;
            seenConvIds.add(convId);

            const msgsRef = query(
              collection(db, 'conversations', convId, 'messages'),
              orderBy('createdAt', 'desc'),
              limit(1)
            );
            const off = onSnapshot(msgsRef, async (mSnap) => {
              try {
                const last = mSnap.docs[0];
                if (!last) return;
                const data = last.data() || {};
                const msgId = last.id;
                const senderId = data.senderId;
                const text = data.text || '';
                if (!msgId || !senderId) return;
                if (String(senderId) === String(user?.uid)) return; // Don't notify for own messages
                const key = `${convId}:${msgId}`;
                if (notifiedMsgIds.has(key)) return;

                await Notifications.scheduleNotificationAsync({
                  content: {
                    title: 'New message',
                    body: text || 'Open to view',
                    sound: 'default',
                    data: { convId },
                  },
                  trigger: null,
                });
                notifiedMsgIds.add(key);
              } catch {}
            });
            unsubscribeFunctions.push(off);
          });
        } catch {}
      };

      const u1 = onSnapshot(linksByUid, attachForLinks);
      unsubscribeFunctions.push(u1);
      if (linksByCanonical) {
        try {
          const u2 = onSnapshot(linksByCanonical, attachForLinks);
          unsubscribeFunctions.push(u2);
        } catch {}
      }
    } catch (error) {
      console.error('Error setting up conversation listeners:', error);
    }
  };

  setupParentAlertsListener();
  setupConversationMessageListeners();
};

// Send push notification for a specific parent alert
const sendPushNotificationForParentAlert = async (alert) => {
  try {
    const t = alert.type || alert.alertType;
    let title = alert.title || 'New Alert';
    let body = alert.message || 'You have a new alert.';
    
    // Extract student name for personalization
    const studentName = alert.studentName ? 
      String(alert.studentName).trim().split(' ')[0] || 'Student' : 
      'Student';
    
    if (t === 'schedule_current') { 
      title = 'Class Happening Now'; 
      body = alert.message || `${studentName}'s ${alert.subject || 'class'} is happening now (${alert.time || ''}).`; 
    }
    else if (t === 'schedule_added') {
      title = 'Schedule Added';
      body = alert.message || `${studentName}'s ${alert.subject || 'class'} on ${alert.day || 'day'} added (${alert.time || ''}).`;
    }
    else if (t === 'schedule_updated') {
      title = 'Schedule Updated';
      const prev = alert.previousTime || '';
      body = alert.message || `${studentName}'s ${alert.subject || 'class'} on ${alert.day || 'day'} updated (${prev ? prev + ' → ' : ''}${alert.time || ''}).`;
    }
    else if (t === 'schedule_deleted') {
      title = 'Schedule Deleted';
      const prev = alert.previousTime || '';
      body = alert.message || `${studentName}'s ${alert.subject || 'class'} on ${alert.day || 'day'} removed${prev ? ` (was ${prev})` : ''}.`;
    }
    else if (t === 'link_request') { 
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
    else if (t === 'schedule_added') { 
      title = 'Schedule Added'; 
      body = alert.message || 'A class was added to your child\'s schedule.'; 
    }
    else if (t === 'schedule_updated') { 
      title = 'Schedule Updated'; 
      body = alert.message || 'A class in your child\'s schedule was updated.'; 
    }
    else if (t === 'schedule_deleted') { 
      title = 'Schedule Deleted'; 
      body = alert.message || 'A class was removed from your child\'s schedule.'; 
    }
    else if (t === 'attendance_scan') {
      title = 'Attendance Scan';
      const direction = alert.entry?.direction === 'out' ? 'out' : 'in';
      body = alert.message || `${studentName} scanned ${direction}.`;
    }
    
    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        data: { type: t, id: alert.id, currentKey: alert.currentKey },
      },
      trigger: null,
    });
    
    console.log('🔔 Global parent push notification sent:', title);
  } catch (error) {
    console.error('Error sending global parent push notification:', error);
  }
};

// Clean up global listeners
export const cleanupGlobalParentPushNotifications = () => {
  console.log('🔔 Cleaning up global parent push notifications');
  
  // Clear all unsubscribe functions
  unsubscribeFunctions.forEach(unsub => {
    try {
      unsub();
    } catch (error) {
      console.error('Error unsubscribing from parent alerts listener:', error);
    }
  });
  unsubscribeFunctions = [];
  
  // Reset state
  globalListenerActive = false;
  currentUser = null;
  notifiedIds.clear();
  notifiedMsgIds.clear();
  
  console.log('🔔 Global parent push notifications cleaned up');
};
