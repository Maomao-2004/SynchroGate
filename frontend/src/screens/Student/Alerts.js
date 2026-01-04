import React, { useState, useContext, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ScrollView,
  Image,
  Dimensions,
  Modal,
} from 'react-native';
import { useNavigation, useIsFocused } from '@react-navigation/native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { AuthContext } from '../../contexts/AuthContext';
import { NetworkContext } from '../../contexts/NetworkContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { isFirestoreConnectionError } from '../../utils/firestoreErrorHandler';
import { 
  collection, 
  query, 
  where, 
  getDocs, 
  updateDoc,
  doc,
  getDoc,
  setDoc,
  arrayUnion,
  deleteDoc,
  orderBy,
  limit
} from 'firebase/firestore';
import { onSnapshot } from 'firebase/firestore';
import { db } from '../../utils/firebaseConfig';
import { withNetworkErrorHandling, getNetworkErrorMessage } from '../../utils/networkErrorHandler';
import { sendAlertPushNotification } from '../../utils/pushNotificationHelper';
const AboutLogo = require('../../assets/logo.png');

const { width, height } = Dimensions.get('window');
const DARK_RED = '#8B0000';

const Alerts = () => {
  const navigation = useNavigation();
  const isFocused = useIsFocused();
  const { user, logout } = useContext(AuthContext);
  const networkContext = useContext(NetworkContext);
  const isConnected = networkContext?.isConnected ?? true;
  
  const [alerts, setAlerts] = useState([]);
  const [filter, setFilter] = useState('all'); // all | unread | read
  const [loading, setLoading] = useState(true);
  const [processingAlert, setProcessingAlert] = useState(null);
  const [expandedIds, setExpandedIds] = useState([]);
  const [logoutVisible, setLogoutVisible] = useState(false);
  const [deleteConfirmVisible, setDeleteConfirmVisible] = useState(false);
  const [feedbackVisible, setFeedbackVisible] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState('');
  const [feedbackSuccess, setFeedbackSuccess] = useState(true);
  const [networkErrorVisible, setNetworkErrorVisible] = useState(false);
  const [networkErrorTitle, setNetworkErrorTitle] = useState('');
  const [networkErrorMessage, setNetworkErrorMessage] = useState('');
  const [networkErrorColor, setNetworkErrorColor] = useState('#DC2626');
  const [actionLoading, setActionLoading] = useState({ id: null, action: null });
  const [markingAsRead, setMarkingAsRead] = useState(false);
  const [scheduleModalVisible, setScheduleModalVisible] = useState(false);
  const [scheduleDetail, setScheduleDetail] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  

  const alertTypes = {
    'attendance': { label: 'Attendance Alert', icon: 'time-outline', color: '#DC2626' },
    'academic': { label: 'Academic Update', icon: 'school-outline', color: '#2563EB' },
    'behavior': { label: 'Behavior Notice', icon: 'warning-outline', color: '#F59E0B' },
    'general': { label: 'General Notice', icon: 'information-circle-outline', color: '#10B981' },
    'emergency': { label: 'Emergency Alert', icon: 'alert-circle-outline', color: '#DC2626' },
    'announcement': { label: 'Announcement', icon: 'megaphone-outline', color: '#3B82F6' },
    'link_unlinked_self': { label: 'Student Unlinked', icon: 'link-off', color: '#DC2626' },
    'link_response': { label: 'Link Response', icon: 'checkmark-done', color: '#2563EB' },
    'link_response_self': { label: 'Link Response', icon: 'checkmark-done', color: '#2563EB' },
    'attendance_scan': { label: 'Attendance Scan', icon: 'scan-outline', color: '#10B981' },
    'qr_generated': { label: 'QR Generated', icon: 'qr-code-outline', color: '#10B981' },
    'qr_changed': { label: 'QR Changed', icon: 'refresh-outline', color: '#3B82F6' },
    'schedule_permission_response': { label: 'Schedule Permission Response', icon: 'lock-open-outline', color: '#F59E0B' },
  };

  // Load alerts for student
  const loadAlerts = async () => {
    if (!user?.uid) {
      console.warn('No user UID available for loading alerts');
      return;
    }
    
    if (!user?.studentId) {
      console.warn('No student ID available for loading alerts, user object:', user);
      return;
    }
    
    try {
      setLoading(true);
      const allAlerts = [];
      
      // Get student alerts using user.studentId as document ID
      console.log('🔍 STUDENT ALERTS: Loading alerts for student ID:', user.studentId);
      const studentAlertsRef = doc(db, 'student_alerts', user.studentId);
      console.log('🔍 STUDENT ALERTS: Document path:', studentAlertsRef.path);
      const studentDoc = await getDoc(studentAlertsRef);
    
      if (studentDoc.exists()) {
        const data = studentDoc.data();
        const items = Array.isArray(data.items) ? data.items : [];

        const enriched = await Promise.all(items.map(async (item) => {
          let createdAtIso = item.createdAt || null;
          
          // Handle attendance_scan notifications with proper timestamp
          if (item.type === 'attendance_scan') {
            if (item.studentId && item.scanId) {
              try {
                const scanRef = doc(db, 'student_attendances', item.studentId, 'scans', item.scanId);
                const scanSnap = await getDoc(scanRef);
                if (scanSnap.exists()) {
                  const scanData = scanSnap.data();
                  const t = scanData?.timeOfScanned;
                  if (t && typeof t.toDate === 'function') {
                    createdAtIso = t.toDate().toISOString();
                  }
                }
              } catch (error) {
                console.warn('Error fetching scan timestamp for attendance_scan notification:', error);
              }
            }

            if (!createdAtIso && typeof item.createdAt === 'string' && !isNaN(parseInt(item.createdAt))) {
              const ts = parseInt(item.createdAt);
              createdAtIso = new Date(ts).toISOString();
            }
          }

          if (!createdAtIso) {
            createdAtIso = item.id ? `stable_${item.id}` : new Date().toISOString();
          }

          return {
            alertId: item.id,
            studentId: item.studentId,
            studentName: item.studentName || 'Student',
            studentClass: item.studentClass || '',
            alertType: item.type,
            title: item.title,
            message: item.message,
            createdAt: createdAtIso,
            priority: item.priority || 'normal',
            status: item.status || 'unread',
            linkId: item.linkId,
            relationship: item.relationship,
            parentId: item.parentId,
            parentName: item.parentName,
            entry: item.entry,
            scanId: item.scanId,
            scanLocation: item.scanLocation,
            response: item.response,
          };
        }));

        allAlerts.push(...enriched);
      }
      
      // Sort with priority: link_request first, then schedule_current, then by latest
      const priorityOf = (type) => {
        if (type === 'link_request') return 2;
        if (type === 'schedule_current') return 1;
        return 0;
      };
      
      allAlerts.sort((a, b) => {
        const wa = priorityOf(a.alertType);
        const wb = priorityOf(b.alertType);
        if (wa !== wb) return wb - wa;
        
        const getTime = (createdAt) => {
          try {
            if (!createdAt) return 0;
            if (typeof createdAt === 'string' && createdAt.startsWith('stable_')) return 0;
            if (typeof createdAt === 'string' && createdAt.startsWith('fallback_')) return 0;
            const date = new Date(createdAt);
            return isNaN(date.getTime()) ? 0 : date.getTime();
          } catch {
            return 0;
          }
        };
        return getTime(b.createdAt) - getTime(a.createdAt);
      });
      
      setAlerts(allAlerts);
    } catch (error) {
      console.error('Error loading alerts:', error);
      // Only show network error modal for actual network errors
      if (error?.code?.includes('unavailable') || error?.code?.includes('network') || error?.message?.toLowerCase().includes('network')) {
        const errorInfo = getNetworkErrorMessage({ type: 'unstable_connection', message: error.message });
        setNetworkErrorTitle(errorInfo.title);
        setNetworkErrorMessage(errorInfo.message);
        setNetworkErrorColor(errorInfo.color);
        setNetworkErrorVisible(true);
        setTimeout(() => setNetworkErrorVisible(false), 5000);
      } else {
        Alert.alert('Error', 'Failed to load alerts');
      }
    } finally {
      setLoading(false);
    }
  };

  // Real-time listener for student_alerts
  useEffect(() => {
    if (!user?.uid) {
      console.warn('No user UID available for real-time listener');
      return;
    }
    
    if (!user?.studentId) {
      console.warn('No student ID available for real-time listener, user object:', user);
      return;
    }
    let unsub;
    
    (async () => {
      // Use user.studentId as the document ID for student_alerts collection
      const ref = doc(db, 'student_alerts', user.studentId);
      unsub = onSnapshot(ref, async (snap) => {
        try {
          const data = snap.exists() ? (snap.data() || {}) : {};
          const items = Array.isArray(data.items) ? data.items : [];
          
          const mapped = await Promise.all(items.map(async item => {
            let createdAtIso = item.createdAt;
            
            if (item.type === 'attendance_scan') {
              if (item.studentId && item.scanId) {
                try {
                  const scanRef = doc(db, 'student_attendances', item.studentId, 'scans', item.scanId);
                  const scanSnap = await getDoc(scanRef);
                  if (scanSnap.exists()) {
                    const scanData = scanSnap.data();
                    const t = scanData?.timeOfScanned;
                    if (t && typeof t.toDate === 'function') {
                      createdAtIso = t.toDate().toISOString();
                    }
                  }
                } catch (error) {
                  console.warn('Error fetching scan timestamp for attendance_scan notification in real-time listener:', error);
                }
              }

              if (!createdAtIso && typeof item.createdAt === 'string' && !isNaN(parseInt(item.createdAt))) {
                const ts = parseInt(item.createdAt);
                createdAtIso = new Date(ts).toISOString();
              }
            }

            if (!createdAtIso) {
              createdAtIso = item.id ? `stable_${item.id}` : new Date().toISOString();
            }

            return {
              alertId: item.id,
              studentId: item.studentId,
              studentName: item.studentName || 'Student',
              studentClass: item.studentClass || '',
              alertType: item.type,
              title: item.title,
              message: item.message,
              createdAt: createdAtIso,
              priority: item.priority || 'normal',
              status: item.status || 'unread',
              linkId: item.linkId,
              relationship: item.relationship,
              parentId: item.parentId,
              parentName: item.parentName,
              entry: item.entry,
              scanId: item.scanId,
              scanLocation: item.scanLocation,
              response: item.response,
            };
          }));
          
          // Sort alerts with priority: link_request first, then schedule_current, then by latest
          const priorityOf = (type) => {
            if (type === 'link_request') return 2;
            if (type === 'schedule_current') return 1;
            return 0;
          };
          
          mapped.sort((a, b) => {
            const wa = priorityOf(a.alertType);
            const wb = priorityOf(b.alertType);
            if (wa !== wb) return wb - wa;
            
            const getTime = (createdAt) => {
              try {
                if (!createdAt) return 0;
                if (typeof createdAt === 'string' && createdAt.startsWith('stable_')) return 0;
                if (typeof createdAt === 'string' && createdAt.startsWith('fallback_')) return 0;
                const date = new Date(createdAt);
                return isNaN(date.getTime()) ? 0 : date.getTime();
              } catch {
                return 0;
              }
            };
            return getTime(b.createdAt) - getTime(a.createdAt);
          });
          
          // Note: Push notifications are handled by the accept/decline functions
          // The real-time listener only updates the UI state

          console.log('🔍 STUDENT ALERTS: Real-time listener updating alerts:', mapped.map(a => ({ id: a.alertId, status: a.status, type: a.alertType })));
          setAlerts(mapped);
          setLoading(false);
        } catch (error) {
          console.error('Error in real-time listener:', error);
          setLoading(false);
        }
      });
    })();
    
    return () => { try { unsub && unsub(); } catch {} };
  }, [user?.studentId]);

  // Load alerts on mount and focus
  useEffect(() => {
    if (user?.uid && user?.studentId) {
      loadAlerts();
    }
  }, [user?.uid, user?.studentId]);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      if (user?.uid && user?.studentId) {
        loadAlerts();
      }
    });
    return unsubscribe;
  }, [navigation, user?.uid, user?.studentId]);

  // Persist filter per student account
  useEffect(() => {
    const loadSavedFilter = async () => {
      try {
        if (!user?.uid) return;
        const saved = await AsyncStorage.getItem(`student_alerts_filter_${user.uid}`);
        if (saved && (saved === 'all' || saved === 'unread' || saved === 'read')) {
          setFilter(saved);
        }
      } catch {}
    };
    if (isFocused) loadSavedFilter();
  }, [isFocused, user?.uid]);

  const changeFilter = async (next) => {
    setFilter(next);
    try {
      if (user?.uid) await AsyncStorage.setItem(`student_alerts_filter_${user.uid}`, next);
    } catch {}
  };

  const markAllAsRead = async () => {
    try {
      if (!user?.studentId) return;
      setMarkingAsRead(true);
      const studentAlertsRef = doc(db, 'student_alerts', user.studentId);
      const snap = await getDoc(studentAlertsRef);
      if (snap.exists()) {
        const data = snap.data();
        const items = Array.isArray(data.items) ? data.items : [];
        const nowIso = new Date().toISOString();
        const updated = items.map(it => (
          it?.type === 'link_request' ? it : { ...it, status: 'read', readAt: nowIso }
        ));
        await setDoc(studentAlertsRef, { items: updated }, { merge: true });
      }
    } catch (error) {
      console.error('Error marking alerts as read:', error);
      // Only show network error modal for actual network errors
      if (error?.code?.includes('unavailable') || error?.code?.includes('network') || error?.message?.toLowerCase().includes('network')) {
        const errorInfo = getNetworkErrorMessage({ type: 'unstable_connection', message: error.message });
        setNetworkErrorTitle(errorInfo.title);
        setNetworkErrorMessage(errorInfo.message);
        setNetworkErrorColor(errorInfo.color);
        setNetworkErrorVisible(true);
        setTimeout(() => setNetworkErrorVisible(false), 5000);
      }
      setFeedbackMessage('Failed to mark notifications as read.');
      setFeedbackSuccess(false);
      setFeedbackVisible(true);
      setTimeout(() => setFeedbackVisible(false), 3000);
    } finally {
      setMarkingAsRead(false);
    }
  };

  const deleteAllNotifications = async () => {
    try {
      if (!user?.studentId) return;
      
      setIsDeleting(true);
      
      const studentAlertsRef = doc(db, 'student_alerts', user.studentId);
      const snap = await getDoc(studentAlertsRef);
      if (snap.exists()) {
        const data = snap.data();
        const items = Array.isArray(data.items) ? data.items : [];
        const keep = items.filter(it => {
          // Keep link_request notifications (parent link requests) that haven't been responded to
          if (it.type === 'link_request') return true;
          
          // Keep schedule_current notifications (class happening now) that are still active
          if (it.type === 'schedule_current') {
            // Check if the class time has ended
            try {
              if (it.endTime) {
                const endTime = new Date(it.endTime);
                const now = new Date();
                return now < endTime; // Keep if class hasn't ended yet
              }
              // If no endTime, keep the notification (safer approach)
              return true;
            } catch (error) {
              // If there's an error parsing the time, keep the notification
              return true;
            }
          }
          
          return false;
        });
        await setDoc(studentAlertsRef, { items: keep }, { merge: true });
      }
      
      setDeleteConfirmVisible(false);
      setFeedbackSuccess(true);
      setFeedbackMessage('Notifications deleted successfully.');
      setFeedbackVisible(true);
      await loadAlerts();
      setTimeout(()=> setFeedbackVisible(false), 3000);
    } catch (e) {
      console.error('Error deleting notifications:', e);
      // Only show network error modal for actual network errors
      if (e?.code?.includes('unavailable') || e?.code?.includes('network') || e?.message?.toLowerCase().includes('network')) {
        const errorInfo = getNetworkErrorMessage({ type: 'unstable_connection', message: e.message });
        setNetworkErrorTitle(errorInfo.title);
        setNetworkErrorMessage(errorInfo.message);
        setNetworkErrorColor(errorInfo.color);
        setNetworkErrorVisible(true);
        setTimeout(() => setNetworkErrorVisible(false), 5000);
      } else {
        setDeleteConfirmVisible(false);
        setFeedbackSuccess(false);
        setFeedbackMessage('Failed to delete notifications.');
        setFeedbackVisible(true);
        setTimeout(()=> setFeedbackVisible(false), 3000);
      }
    } finally {
      setIsDeleting(false);
    }
  };

  const acceptRequest = async (alert) => {
    if (!alert?.linkId || !user?.uid) return;
    try {
      setActionLoading({ id: alert.alertId, action: 'accept' });
      console.log('✅ STUDENT ACCEPT: Starting accept process for alert:', {
        alertId: alert.alertId,
        linkId: alert.linkId,
        parentId: alert.parentId,
        parentName: alert.parentName
      });
      
      // Step 1: Update the parent_student_links document status to active
      // Also normalize student identifiers so student-side queries (by studentId) resolve this link
      await updateDoc(doc(db, 'parent_student_links', alert.linkId), {
      status: 'active',
      linkedAt: new Date().toISOString(),
      // Ensure the link uses the canonical student ID (school ID) instead of Firebase UID
      studentId: String(user?.studentId || ''),
      studentIdNumber: String(user?.studentId || ''),
    });

    // Step 2: Create accepted notification for parent
    const acceptedNotification = {
      id: `${alert.linkId}_accepted_${Date.now()}`,
      type: 'link_response',
      title: 'Link Request Accepted',
      message: `${user?.firstName || 'Student'} ${user?.lastName || ''} accepted your link request.`,
      status: 'unread',
      response: 'accepted',
      linkId: alert.linkId,
      parentId: alert.parentId,
      studentId: user.studentId,
      studentName: `${user?.firstName || 'Student'} ${user?.lastName || ''}`,
      createdAt: new Date().toISOString()
    };

    console.log('✅ STUDENT ACCEPT: Creating accepted notification for parent:', acceptedNotification);

    // Add to parent alerts (write to canonical parent doc id - use same logic as Parent Alerts getParentDocId)
    if (alert.parentId) {
      const resolveParentDocId = async (parentUid, linkId) => {
        try {
          // First try: if parentUid already includes '-', it's canonical
          const raw = String(parentUid || '').trim();
          if (raw && raw.includes('-')) {
            return raw;
          }
          
          // Second try: query users collection by UID to get canonical parentId
          try {
            const qSnap = await getDocs(query(collection(db, 'users'), where('uid', '==', raw), where('role', '==', 'parent')));
            if (!qSnap.empty) {
              const data = qSnap.docs[0].data() || {};
              const cand = String(data.parentId || data.parentIdCanonical || '').trim();
              if (cand && cand.includes('-')) {
                return cand;
              }
            }
          } catch {}
          
          // Third try: get from parent_student_links document
          if (linkId) {
            try {
              const linkSnap = await getDoc(doc(db, 'parent_student_links', String(linkId || '')));
              if (linkSnap.exists()) {
                const l = linkSnap.data() || {};
                const cand = String(l.parentIdNumber || l.parentNumber || l.parentId || '').trim();
                if (cand && cand.includes('-')) {
                  return cand;
                }
              }
            } catch {}
          }
          
          // Fallback to UID
          return raw;
        } catch (e) {
          return String(parentUid || '').trim();
        }
      };

      const parentDocId = await resolveParentDocId(alert.parentId, alert.linkId);
      console.log('✅ STUDENT ACCEPT: Resolved parent document ID:', parentDocId, 'from parentUid:', alert.parentId);
      
      try {
        const parentAlertsRef = doc(db, 'parent_alerts', parentDocId);
        const parentSnap = await getDoc(parentAlertsRef);
        const existing = parentSnap.exists() ? (Array.isArray(parentSnap.data()?.items) ? parentSnap.data().items : []) : [];
        // Check for duplicates by ID
        const isDuplicate = existing.some(it => String(it?.id) === String(acceptedNotification.id));
        if (!isDuplicate) {
          const updated = [...existing, { ...acceptedNotification, parentId: parentDocId }];
          await setDoc(parentAlertsRef, { items: updated }, { merge: true });
          console.log('✅ STUDENT ACCEPT: Successfully wrote link_response to parent_alerts:', parentDocId);
          // Send push notification via backend API (works even when app is closed)
          sendAlertPushNotification({ ...acceptedNotification, parentId: parentDocId }, parentDocId, 'parent').catch(err => 
            console.warn('Push notification failed (non-blocking):', err)
          );
        } else {
          console.log('✅ STUDENT ACCEPT: Duplicate notification, skipping:', acceptedNotification.id);
        }
      } catch (e) {
        console.error('❌ STUDENT ACCEPT: Failed to write accepted notification to parent_alerts doc', parentDocId, e);
      }
    }

    // Step 3: Update student alerts to show accepted response
    const studentAlertsRef = doc(db, 'student_alerts', user.studentId);
    const studentDocSnap = await getDoc(studentAlertsRef);
    const existing = studentDocSnap.exists() ? (Array.isArray(studentDocSnap.data()?.items) ? studentDocSnap.data().items : []) : [];
    const updated = existing.map(it => {
      if (it?.type === 'link_request' && it?.linkId === alert.linkId) {
        return {
          ...it,
          type: 'link_response_self',
          title: 'Link Request Accepted',
          message: 'You accepted the link request.',
          status: 'read',
          response: 'accepted'
        };
      }
      return it;
    });
    await setDoc(studentAlertsRef, { items: updated }, { merge: true });

    // Step 4: Update local state
    setAlerts(prev => prev.map(a => (
      a.alertType === 'link_request' && a.linkId === alert.linkId
        ? { ...a, alertType: 'link_response_self', title: 'Link Request Accepted', message: 'You accepted the link request.', status: 'read', response: 'accepted' }
        : a
    )));

    console.log('✅ STUDENT ACCEPT: Accept process completed successfully');
    } catch (e) {
      console.error('Error accepting request:', e);
      // Only show network error modal for actual network errors
      if (e?.code?.includes('unavailable') || e?.code?.includes('network') || e?.message?.toLowerCase().includes('network')) {
        const errorInfo = getNetworkErrorMessage({ type: 'unstable_connection', message: e.message });
        setNetworkErrorTitle(errorInfo.title);
        setNetworkErrorMessage(errorInfo.message);
        setNetworkErrorColor(errorInfo.color);
        setNetworkErrorVisible(true);
        setTimeout(() => setNetworkErrorVisible(false), 5000);
      } else {
        Alert.alert('Error', 'Failed to accept request');
      }
    } finally {
      setActionLoading({ id: null, action: null });
    }
  };

  const declineRequest = async (alert) => {
    if (!alert?.linkId || !user?.uid) return;
    try {
      setActionLoading({ id: alert.alertId, action: 'decline' });
      console.log('🔴 STUDENT DECLINE: Starting decline process for alert:', {
        alertId: alert.alertId,
        linkId: alert.linkId,
        parentId: alert.parentId,
        parentName: alert.parentName
      });

      // Step 1: Create declined notification for parent
      const declinedNotification = {
        id: `${alert.linkId}_declined_${Date.now()}`,
        type: 'link_response',
        title: 'Link Request Declined',
        message: `${user?.firstName || 'Student'} ${user?.lastName || ''} declined your link request.`,
        status: 'unread',
        response: 'declined',
        linkId: alert.linkId,
        parentId: alert.parentId,
        studentId: user.studentId,
        studentName: `${user?.firstName || 'Student'} ${user?.lastName || ''}`,
        createdAt: new Date().toISOString()
      };

      console.log('🔴 STUDENT DECLINE: Creating declined notification:', declinedNotification);

      // Add to parent alerts (write to canonical parent doc id - use same logic as Parent Alerts getParentDocId)
      if (alert.parentId) {
        const resolveParentDocId = async (parentUid, linkId) => {
          try {
            // First try: if parentUid already includes '-', it's canonical
            const raw = String(parentUid || '').trim();
            if (raw && raw.includes('-')) {
              return raw;
            }
            
            // Second try: query users collection by UID to get canonical parentId
            try {
              const qSnap = await getDocs(query(collection(db, 'users'), where('uid', '==', raw), where('role', '==', 'parent')));
              if (!qSnap.empty) {
                const data = qSnap.docs[0].data() || {};
                const cand = String(data.parentId || data.parentIdCanonical || '').trim();
                if (cand && cand.includes('-')) {
                  return cand;
                }
              }
            } catch {}
            
            // Third try: get from parent_student_links document
            if (linkId) {
              try {
                const linkSnap = await getDoc(doc(db, 'parent_student_links', String(linkId || '')));
                if (linkSnap.exists()) {
                  const l = linkSnap.data() || {};
                  const cand = String(l.parentIdNumber || l.parentNumber || l.parentId || '').trim();
                  if (cand && cand.includes('-')) {
                    return cand;
                  }
                }
              } catch {}
            }
            
            // Fallback to UID
            return raw;
          } catch (e) {
            return String(parentUid || '').trim();
          }
        };

        const parentDocId = await resolveParentDocId(alert.parentId, alert.linkId);
        console.log('🔴 STUDENT DECLINE: Resolved parent document ID:', parentDocId, 'from parentUid:', alert.parentId);
        
        try {
          const parentAlertsRef = doc(db, 'parent_alerts', parentDocId);
          const parentSnap = await getDoc(parentAlertsRef);
          const existing = parentSnap.exists() ? (Array.isArray(parentSnap.data()?.items) ? parentSnap.data().items : []) : [];
          // Check for duplicates by ID
          const isDuplicate = existing.some(it => String(it?.id) === String(declinedNotification.id));
          if (!isDuplicate) {
            const updated = [...existing, { ...declinedNotification, parentId: parentDocId }];
            await setDoc(parentAlertsRef, { items: updated }, { merge: true });
            console.log('🔴 STUDENT DECLINE: Successfully wrote link_response to parent_alerts:', parentDocId);
            // Send push notification via backend API (works even when app is closed)
            sendAlertPushNotification({ ...declinedNotification, parentId: parentDocId }, parentDocId, 'parent').catch(err => 
              console.warn('Push notification failed (non-blocking):', err)
            );
          } else {
            console.log('🔴 STUDENT DECLINE: Duplicate notification, skipping:', declinedNotification.id);
          }
        } catch (e) {
          console.error('❌ STUDENT DECLINE: Failed to write declined notification to parent_alerts doc', parentDocId, e);
        }
      }

      // Step 2: Update the parent_student_links document status to declined
      try {
        const linkDocRef = doc(db, 'parent_student_links', alert.linkId);
        await updateDoc(linkDocRef, {
          status: 'declined',
          declinedAt: new Date().toISOString(),
          declinedBy: 'student'
        });
        console.log('🔴 STUDENT DECLINE: Successfully updated link status to declined');
      } catch (updateError) {
        console.log('🔴 STUDENT DECLINE: Failed to update link status, deleting document:', updateError);
        // If update fails, delete the document
        await deleteDoc(doc(db, 'parent_student_links', alert.linkId));
        console.log('🔴 STUDENT DECLINE: Deleted link document as fallback');
      }

      // Step 3: Update student alerts to show declined response
      const studentAlertsRef = doc(db, 'student_alerts', user.studentId);
      const studentDocSnap = await getDoc(studentAlertsRef);
      if (studentDocSnap.exists()) {
        const existing = Array.isArray(studentDocSnap.data()?.items) ? studentDocSnap.data().items : [];
        const updated = existing.map(it => (
          it?.type === 'link_request' && it?.linkId === alert.linkId
            ? { ...it, type: 'link_response_self', title: 'Link Request Declined', message: 'You declined the link request.', status: 'read', response: 'declined' }
            : it
        ));
        await setDoc(studentAlertsRef, { items: updated }, { merge: true });
      }

      // Step 4: Update local state
      setAlerts(prev => prev.map(a => (
        a.alertType === 'link_request' && a.linkId === alert.linkId
          ? { ...a, alertType: 'link_response_self', title: 'Link Request Declined', message: 'You declined the link request.', status: 'read', response: 'declined' }
          : a
      )));

      console.log('🔴 STUDENT DECLINE: Decline process completed successfully');
    } catch (err) {
      console.error('Error declining request:', err);
      // Only show network error modal for actual network errors
      if (err?.code?.includes('unavailable') || err?.code?.includes('network') || err?.message?.toLowerCase().includes('network')) {
        const errorInfo = getNetworkErrorMessage({ type: 'unstable_connection', message: err.message });
        setNetworkErrorTitle(errorInfo.title);
        setNetworkErrorMessage(errorInfo.message);
        setNetworkErrorColor(errorInfo.color);
        setNetworkErrorVisible(true);
        setTimeout(() => setNetworkErrorVisible(false), 5000);
      } else {
        Alert.alert('Error', 'Failed to decline request');
      }
    } finally {
      setActionLoading({ id: null, action: null });
    }
  };

  const handleLogout = () => { setLogoutVisible(true); };
  const confirmLogout = async () => {
    setLogoutVisible(false);
    try {
      await logout();
    } catch (e) {
      console.log('Logout error:', e);
    }
  };
  const cancelLogout = () => setLogoutVisible(false);

  const isExpanded = (id) => expandedIds.includes(id);
  const toggleExpand = (id) => {
    setExpandedIds((prev) => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));
  };

  return (<>
    <View style={styles.wrapper}>
      {/* Content */}
      <ScrollView 
        style={{ flex: 1 }}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        {loading ? (
          <View style={{ flex: 1, backgroundColor: '#FFFFFF' }} />
        ) : alerts.length > 0 ? (
          <>
              <View style={styles.filterContainer}>
                <View style={styles.filterRow}>
                  <View style={styles.filterChipsContainer}>
                    <TouchableOpacity onPress={() => changeFilter('all')} style={[styles.filterChip, filter === 'all' && styles.filterChipActive]}>
                      <Text style={[styles.filterChipText, filter === 'all' && styles.filterChipTextActive]}>All</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => changeFilter('unread')} style={[styles.filterChip, filter === 'unread' && styles.filterChipActive]}>
                      <Text style={[styles.filterChipText, filter === 'unread' && styles.filterChipTextActive]}>Unread</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => changeFilter('read')} style={[styles.filterChip, filter === 'read' && styles.filterChipActive]}>
                      <Text style={[styles.filterChipText, filter === 'read' && styles.filterChipTextActive]}>Read</Text>
                    </TouchableOpacity>
                  </View>
                  <View style={styles.actionButtonsContainer}>
                    <TouchableOpacity 
                      onPress={markAllAsRead} 
                      disabled={markingAsRead}
                      style={[styles.actionPill, { marginRight: 8, opacity: markingAsRead ? 0.6 : 1, backgroundColor: '#F3F4F6' }]}
                    >
                      <Ionicons name="mail-outline" size={18} color="#004f89" />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => setDeleteConfirmVisible(true)} style={[styles.actionPill, { marginRight: 0 }]}>
                      <Ionicons name="trash-outline" size={18} color="#004f89" />
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
              <View style={styles.separator} />
              <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
              {alerts.filter(alert => {
                if (filter === 'all') return true;
                if (filter === 'unread') return alert.status === 'unread';
                if (filter === 'read') return alert.status === 'read';
                return true;
              }).map((alert) => {
                // Determine icon + color per alert (mirror parent alerts structure)
                let typeColor = alertTypes[alert.alertType]?.color || '#6B7280';
                let iconBg = '#EEF2F7';
                let iconFg = typeColor;
                let useMci = false;
                let iconName = alertTypes[alert.alertType]?.icon || 'information-circle';

                // Link response icons: modern blue check if accepted, red X if declined (mirror parent alerts)
                if (alert.alertType === 'link_response' || alert.alertType === 'link_response_self') {
                  const accepted = (alert.response === 'accepted')
                    || /accepted/i.test(String(alert.title || ''))
                    || /accepted/i.test(String(alert.message || ''))
                    || /accepted/i.test(String(alert.alertId || ''));
                  const declined = (alert.response === 'declined')
                    || /declined|rejected/i.test(String(alert.title || ''))
                    || /declined|rejected/i.test(String(alert.message || ''))
                    || /declined|rejected/i.test(String(alert.alertId || ''));
                  if (accepted) { iconName = 'checkmark-done'; typeColor = '#2563EB'; }
                  else if (declined) { iconName = 'close-outline'; typeColor = '#DC2626'; }
                  else { iconName = 'checkmark-done'; typeColor = '#2563EB'; }
                }

                // Schedule notifications
                if (alert.alertType === 'schedule_added') {
                  useMci = true;
                  iconName = 'plus-circle';
                  typeColor = '#10B981';
                } else if (alert.alertType === 'schedule_updated') {
                  useMci = true;
                  iconName = 'pencil-circle';
                  typeColor = '#2563EB';
                } else if (alert.alertType === 'schedule_deleted') {
                  useMci = true;
                  iconName = 'trash-can';
                  typeColor = '#DC2626';
                } else if (alert.alertType === 'schedule_current') {
                  useMci = true;
                  iconName = 'alert-circle';
                  typeColor = '#F59E0B';
                }

                // Link request pending
                if (alert.alertType === 'link_request') {
                  useMci = true;
                  iconName = 'link-variant';
                  typeColor = '#10B981';
                }

                // Unlink notifications (mirror parent alerts)
                if (alert.alertType === 'link_unlinked' || alert.alertType === 'link_unlinked_self') {
                  useMci = true;
                  iconName = 'link-off';
                  typeColor = '#DC2626';
                }

                // Attendance scan notifications
                if (alert.alertType === 'attendance_scan') {
                  useMci = true;
                  const isEntryOut = alert.entry?.direction === 'out' || 
                                   alert.entry?.type === 'exit' || 
                                   /exit|out|left|departure/i.test(alert.message || '') ||
                                   /exit|out|left|departure/i.test(alert.title || '');
                  
                  if (isEntryOut) {
                    iconName = 'arrow-right-bold-circle-outline';
                    typeColor = '#DC2626';
                  } else {
                    iconName = 'arrow-left-bold-circle-outline';
                    typeColor = '#10B981';
                  }
                }

                // QR code notifications (mirror admin activity logs)
                if (alert.alertType === 'qr_generated') {
                  iconName = 'qr-code-outline';
                  typeColor = '#10B981';
                } else if (alert.alertType === 'qr_changed') {
                  iconName = 'refresh-outline';
                  typeColor = '#3B82F6';
                }

                // Schedule permission response notifications
                if (alert.alertType === 'schedule_permission_response') {
                  const accepted = (alert.response === 'accepted')
                    || /accepted|granted/i.test(String(alert.title || ''))
                    || /accepted|granted/i.test(String(alert.message || ''));
                  if (accepted) {
                    iconName = 'checkmark-done';
                    typeColor = '#2563EB';
                  } else {
                    iconName = 'close-outline';
                    typeColor = '#DC2626';
                  }
                }

                // Announcement notifications - color based on category
                if (alert.alertType === 'announcement') {
                  iconName = 'megaphone-outline';
                  // Set color based on category
                  const category = alert.category || 'general';
                  if (category === 'emergency') {
                    typeColor = '#DC2626'; // Red
                  } else if (category === 'academic') {
                    typeColor = '#2563EB'; // Blue
                  } else if (category === 'sports') {
                    typeColor = '#10B981'; // Green
                  } else if (category === 'events') {
                    typeColor = '#F59E0B'; // Orange
                  } else {
                    typeColor = '#3B82F6'; // Light Blue (general)
                  }
                }

                // Light backgrounds per color
                if (typeColor === '#2563EB') iconBg = '#EFF6FF';
                else if (typeColor === '#3B82F6') iconBg = '#EFF6FF';
                else if (typeColor === '#DC2626') iconBg = '#FEE2E2';
                else if (typeColor === '#10B981') iconBg = '#ECFDF5';
                else if (typeColor === '#F59E0B') iconBg = '#FEF3C7';
                else iconBg = '#EEF2F7';
                iconFg = typeColor;
                
                const isRead = alert.status === 'read';
                const createdLabel = (() => {
                  try {
                    if (!alert.createdAt) return 'Unknown';
                    if (typeof alert.createdAt === 'string' && alert.createdAt.startsWith('stable_')) return 'Recent';
                    const date = new Date(alert.createdAt);
                    return isNaN(date.getTime()) ? 'Unknown' : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
                  } catch {
                    return 'Unknown';
                  }
                })();
                const isSched = alert.alertType === 'schedule_added' || alert.alertType === 'schedule_updated' || alert.alertType === 'schedule_deleted' || alert.alertType === 'schedule_current';
                const isLinkNav = alert.alertType === 'link_response' || alert.alertType === 'link_unlinked';
                const isAnnouncement = alert.alertType === 'announcement';
                
                const isPendingLink = alert.alertType === 'link_request' && alert.status !== 'read';
                
                return (
                  <TouchableOpacity key={[alert.alertId || 'noid', alert.createdAt || 't', alert.alertType || 'type'].join('_')} activeOpacity={0.8} onPress={isPendingLink ? undefined : async () => {
                    console.log('🔍 STUDENT ALERTS: Tapping notification:', {
                      alertId: alert.alertId,
                      alertType: alert.alertType,
                      status: alert.status
                    });
                    
                    // Mark notification as read for all types except link_request (which should only be marked read when accept/decline is pressed)
                    if (alert.alertType !== 'link_request') {
                      try {
                        const studentAlertsRef = doc(db, 'student_alerts', user.studentId);
                        const snap = await getDoc(studentAlertsRef);
                        if (snap.exists()) {
                          const items = Array.isArray(snap.data()?.items) ? snap.data().items : [];
                          console.log('🔍 STUDENT ALERTS: Current items in Firestore:', items.map(it => ({ id: it.id, status: it.status })));
                          const updated = items.map(it => it.id === alert.alertId ? { ...it, status: 'read', readAt: new Date().toISOString() } : it);
                          console.log('🔍 STUDENT ALERTS: Updated items:', updated.map(it => ({ id: it.id, status: it.status })));
                          await setDoc(studentAlertsRef, { items: updated }, { merge: true });
                          console.log('🔍 STUDENT ALERTS: Successfully updated Firestore');
                        }
                        setAlerts(prev => prev.map(a => a.alertId === alert.alertId ? { ...a, status: 'read' } : a));
                        console.log('🔍 STUDENT ALERTS: Successfully updated local state');
                      } catch (firestoreError) {
                        console.warn('Error marking notification as read:', firestoreError);
                      }
                    }
                    
                    // For attendance_scan notifications, return early
                    if (alert.alertType === 'attendance_scan') {
                      return;
                    }
                    
                    if (isSched) {
                      try {
                        const studentNav = navigation.getParent?.();
                        if (studentNav) {
                          studentNav.navigate('ScheduleTab');
                        } else {
                          navigation.navigate('ScheduleTab');
                        }
                      } catch (navError) {
                        console.warn('Navigation error for schedule:', navError);
                      }
                    } else if (isLinkNav) {
                      // Navigate to appropriate screen for link responses
                      try {
                        const studentNav = navigation.getParent?.();
                        if (studentNav) {
                          studentNav.navigate('Home', { screen: 'StudentDashboard' });
                        } else {
                          navigation.navigate('StudentDashboard');
                        }
                      } catch (navError) {
                        console.warn('Navigation error for link response:', navError);
                      }
                    } else if (isAnnouncement) {
                      // Navigate to Events screen for announcements
                      try {
                        const studentNav = navigation.getParent?.();
                        if (studentNav) {
                          studentNav.navigate('EventsTab');
                        } else {
                          navigation.navigate('EventsTab');
                        }
                      } catch (navError) {
                        console.warn('Navigation error for announcement:', navError);
                      }
                    }
                  }} style={[styles.itemRow, alert.alertType === 'link_request' && alert.status !== 'read' && styles.itemRowWithButtons]}>
                    <View style={styles.itemRowTop}>
                      <View style={[styles.itemAvatar, { backgroundColor: iconBg, borderColor: typeColor }]}>
                        {useMci ? (
                          <MaterialCommunityIcons name={iconName} size={14} color={iconFg} />
                        ) : (
                          <Ionicons name={iconName} size={14} color={iconFg} />
                        )}
                      </View>
                      <View style={styles.itemBody}>
                        <Text style={[styles.itemTitle, alert.status !== 'read' && styles.itemTitleUnread]} numberOfLines={1}>{alert.title}</Text>
                        <Text style={[styles.itemMeta, alert.status !== 'read' && styles.itemMetaUnread]} numberOfLines={2}>{alert.message}</Text>
                      </View>
                      <Text style={[styles.itemTime, alert.status !== 'read' && { color: '#2563EB' }]}>{createdLabel}</Text>
                    </View>
                    {alert.alertType === 'link_request' && alert.status !== 'read' ? (
                      <View style={styles.decisionRowRight}>
                        <TouchableOpacity
                          onPress={() => { setActionLoading({ id: alert.alertId, action: 'accept' }); acceptRequest(alert).finally(() => setActionLoading({ id: null, action: null })); }}
                          disabled={actionLoading.id === alert.alertId}
                          style={[styles.decisionButton, styles.acceptButton, actionLoading.id === alert.alertId && styles.disabledButton]}
                        >
                          <Text style={styles.decisionButtonText}>{actionLoading.id === alert.alertId && actionLoading.action === 'accept' ? 'Accepting...' : 'Accept'}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => { setActionLoading({ id: alert.alertId, action: 'decline' }); declineRequest(alert).finally(() => setActionLoading({ id: null, action: null })); }}
                          disabled={actionLoading.id === alert.alertId}
                          style={[styles.decisionButton, styles.declineButtonWhite, actionLoading.id === alert.alertId && styles.disabledButton]}
                        >
                          <Text style={styles.decisionButtonTextWhite}>{actionLoading.id === alert.alertId && actionLoading.action === 'decline' ? 'Declining...' : 'Decline'}</Text>
                        </TouchableOpacity>
                      </View>
                    ) : null}
                  </TouchableOpacity>
                );
              })}
              </ScrollView>
          </>
        ) : (
          <View style={styles.centerContainer}>
            <View style={styles.emptyCard}>
              <View style={styles.emptyIconWrap}>
                <Ionicons name="notifications-off-outline" size={28} color="#2563EB" />
              </View>
              <Text style={styles.emptyTitle}>No Alerts</Text>
              <Text style={styles.emptySubtext}>
                You don't have any notifications yet. Alerts will appear here when you receive messages, attendance updates, or other important notifications.
              </Text>
            </View>
          </View>
        )}
      </ScrollView>
    </View>

      {/* Logout Modal */}
      <Modal
        transparent
        animationType="fade"
        visible={logoutVisible}
        onRequestClose={cancelLogout}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={[styles.modalIconWrap, { backgroundColor: '#FEE2E2' }]}>
              <Ionicons name="log-out-outline" size={28} color="#b91c1c" />
            </View>
            <Text style={styles.modalTitle}>Logout</Text>
            <Text style={styles.modalText}>Are you sure you want to logout?</Text>
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalButton} onPress={cancelLogout}>
                <Text style={styles.modalButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalButton, styles.modalButtonDanger]} onPress={confirmLogout}>
                <Text style={[styles.modalButtonText, styles.modalButtonDangerText]}>Logout</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

    {/* Delete Confirm Modal */}
    <Modal transparent animationType="fade" visible={deleteConfirmVisible} onRequestClose={() => setDeleteConfirmVisible(false)}>
      <View style={styles.modalOverlayCenter}>
        <View style={styles.fbModalCard}>
          <View style={styles.fbModalContent}>
            <Text style={styles.fbModalTitle}>Delete notifications?</Text>
            <Text style={styles.fbModalMessage}>Delete all notifications except pending link requests? This cannot be undone.</Text>
          </View>
          <View style={styles.fbModalButtonContainer}>
            <TouchableOpacity 
              style={[styles.fbModalCancelButton, isDeleting && styles.fbModalButtonDisabled]} 
              onPress={() => setDeleteConfirmVisible(false)}
              disabled={isDeleting}
            >
              <Text style={styles.fbModalCancelText}>Close</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[
                styles.fbModalConfirmButton, 
                { backgroundColor: DARK_RED },
                isDeleting && styles.fbModalButtonDisabled
              ]} 
              onPress={deleteAllNotifications}
              disabled={isDeleting}
            >
              <Text style={styles.fbModalConfirmText}>
                {isDeleting ? 'Deleting...' : 'Confirm'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>

    {/* Feedback Modal */}
    <Modal transparent animationType="fade" visible={feedbackVisible} onRequestClose={() => setFeedbackVisible(false)}>
      <View style={styles.modalOverlayCenter}>
        <View style={styles.fbModalCard}>
          <View style={styles.fbModalContent}>
            <Text style={[styles.fbModalTitle, { color: feedbackSuccess ? '#10B981' : '#DC2626' }]}>{feedbackSuccess ? 'Success' : 'Error'}</Text>
            <Text style={styles.fbModalMessage}>{feedbackMessage}</Text>
          </View>
        </View>
      </View>
    </Modal>

    {/* Network Error Modal */}
    <Modal transparent animationType="fade" visible={networkErrorVisible} onRequestClose={() => setNetworkErrorVisible(false)}>
      <View style={styles.modalOverlayCenter}>
        <View style={styles.fbModalCard}>
          <View style={styles.fbModalContent}>
            <Text style={[styles.fbModalTitle, { color: networkErrorColor }]}>{networkErrorTitle}</Text>
            {networkErrorMessage ? <Text style={styles.fbModalMessage}>{networkErrorMessage}</Text> : null}
          </View>
        </View>
      </View>
    </Modal>
  </>);
};

const styles = StyleSheet.create({
  wrapper: { flex: 1, backgroundColor: '#F9FAFB' },
  contentContainer: { padding: 16, paddingBottom: 120, paddingTop: 50, flexGrow: 1 },
  section: { marginBottom: 24 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  sectionTitle: { fontSize: 30, fontWeight: '900', color: '#0078cf', marginRight: 8, marginBottom: 5, marginTop: 10, paddingTop: 10, paddingLeft: 10 },
  badge: { backgroundColor: '#EF4444', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2, minWidth: 20, alignItems: 'center' },
  badgeText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  filterContainer: {
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 12,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 2,
    marginTop: 8,
  },
  filterRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 0, marginTop: 0, paddingHorizontal: 0 },
  filterChipsContainer: { flexDirection: 'row', gap: 8 },
  actionButtonsContainer: { flexDirection: 'row', alignItems: 'center' },
  filterChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: '#F3F4F6', borderWidth: 1, borderColor: '#E5E7EB' },
  filterChipActive: { backgroundColor: '#004f89', borderColor: '#004f89' },
  filterChipText: { color: '#111827', fontWeight: '600', fontSize: 12 },
  filterChipTextActive: { color: '#fff' },
  sectionSubtitle: { fontSize: 14, color: '#6B7280', marginBottom: 16, lineHeight: 20 },
  loadingContainer: { alignItems: 'center', justifyContent: 'center', paddingVertical: 40 },
  loadingText: { marginTop: 12, color: '#6B7280', fontSize: 16 },
  alertCard: { backgroundColor: '#EFF6FF', borderRadius: 8, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: '#DBEAFE', shadowColor: '#000', shadowOpacity: 0.03, shadowOffset: { width: 0, height: 1 }, shadowRadius: 2, elevation: 1 },
  alertHeader: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12 },
  alertTypeIcon: { width: 40, height: 40, borderRadius: 8, marginRight: 12, alignItems: 'center', justifyContent: 'center' },
  alertInfo: { flex: 1 },
  alertTitle: { fontSize: 16, fontWeight: '600', color: '#111827', marginBottom: 2 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  studentName: { fontSize: 14, fontWeight: '500', color: '#374151' },
  studentClass: { fontSize: 12, color: '#6B7280' },
  dot: { width: 4, height: 4, borderRadius: 2, backgroundColor: '#9CA3AF' },
  priorityBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, borderWidth: 1, borderColor: '#E5E7EB' },
  priorityBadgeText: { fontSize: 10, fontWeight: '600' },
  decisionButton: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, flex: 1, alignItems: 'center', justifyContent: 'center' },
  decisionButtonText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  acceptButton: { backgroundColor: '#004f89' },
  declineButton: { backgroundColor: '#DC2626' },
  declineButtonWhite: { backgroundColor: 'transparent', borderWidth: 1, borderColor: '#DC2626', marginLeft: 4 },
  decisionButtonTextWhite: { color: '#DC2626', fontWeight: '700', fontSize: 12 },
  decisionSpinner: { position: 'absolute' },
  hiddenText: { opacity: 0 },
  decisionRowRight: { flexDirection: 'row', marginTop: 6, width: '100%', paddingHorizontal: 0, position: 'absolute', left: 0, right: 0, bottom: 8 },
  alertDetails: { marginBottom: 8, paddingHorizontal: 4 },
  alertMessage: { fontSize: 15, color: '#374151', lineHeight: 22 },
  alertDate: { fontSize: 12, color: '#6B7280' },
  metaChips: { alignItems: 'flex-end' },
  timeChip: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#EFF6FF', borderColor: '#DBEAFE', borderWidth: 1, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, marginBottom: 6 },
  timeChipText: { color: '#2563EB', fontSize: 10, marginLeft: 4, fontWeight: '600' },
  readChip: { marginTop: 6, backgroundColor: '#E5E7EB', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  readChipText: { color: '#374151', fontSize: 10, fontWeight: '700' },
  expandButton: { alignSelf: 'flex-start', marginTop: 8, paddingVertical: 4, paddingHorizontal: 8, borderRadius: 6 },
  expandButtonText: { color: '#2563EB', fontWeight: '600' },
  actionButtons: { display: 'none' },
  disabledButton: { opacity: 0.6 },
  emptyCard: { backgroundColor: '#fff', borderRadius: 8, padding: 16, alignItems: 'center', borderWidth: 1, borderColor: '#E5E7EB', shadowColor: '#0F172A', shadowOpacity: 0.08, shadowOffset: { width: 0, height: 6 }, shadowRadius: 12, elevation: 4, width: '100%' },
  emptyIconWrap: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: '#111827', marginTop: 0, marginBottom: 4 },
  emptySubtext: {
    fontSize: 12,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 16,
    marginBottom: 12,
  },
  emptyActions: { flexDirection: 'row', gap: 12, marginTop: 16 },
  primaryButton: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#2563EB', paddingHorizontal: 12, paddingVertical: 10, borderRadius: 8 },
  primaryButtonText: { color: '#fff', fontWeight: '700' },
  secondaryButton: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#EFF6FF', borderWidth: 1, borderColor: '#DBEAFE', paddingHorizontal: 12, paddingVertical: 10, borderRadius: 8 },
  secondaryButtonText: { color: '#2563EB', fontWeight: '700' },
  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  modalCard: { backgroundColor: '#fff', borderRadius: 8, padding: 24, width: '85%', maxWidth: 400, alignItems: 'center' },
  modalIconWrap: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  modalTitle: { fontSize: 20, fontWeight: '700', color: '#111827', marginBottom: 8 },
  modalText: { fontSize: 16, color: '#6B7280', textAlign: 'center', marginBottom: 24 },
  modalActions: { flexDirection: 'row', gap: 12 },
  modalButton: { flex: 1, paddingVertical: 12, paddingHorizontal: 16, borderRadius: 8, alignItems: 'center' },
  modalButtonText: { fontSize: 16, fontWeight: '600', color: '#6B7280' },
  modalButtonDanger: { backgroundColor: '#FEE2E2' },
  modalButtonDangerText: { color: '#b91c1c' },
  disabledButton: { opacity: 0.6 },
  disabledText: { opacity: 0.6 },
  // Facebook-style modal styles
  modalOverlayCenter: { 
    flex: 1, 
    backgroundColor: 'rgba(0,0,0,0.5)', 
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20
  },
  fbModalCard: {
    width: '85%',
    maxWidth: 400,
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 20,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 8,
    elevation: 5,
    minHeight: 120,
    justifyContent: 'space-between',
  },
  fbModalContent: {
    flex: 1,
  },
  fbModalTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#050505',
    marginBottom: 12,
    textAlign: 'left',
  },
  fbModalMessage: {
    fontSize: 15,
    color: '#65676B',
    textAlign: 'left',
    lineHeight: 20,
  },
  fbModalButtonContainer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 20,
    gap: 8,
  },
  fbModalCancelButton: {
    backgroundColor: '#E4E6EB',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fbModalCancelText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#050505',
  },
  fbModalConfirmButton: {
    backgroundColor: '#1877F2',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fbModalConfirmText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  fbModalButtonDisabled: {
    opacity: 0.5,
  },
  centerContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  emptyStateContainer: { 
    marginTop: 8,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  itemRow: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  itemRowTop: { flexDirection: 'row', alignItems: 'flex-start', width: '100%' },
  itemRowWithButtons: { flexDirection: 'column', paddingBottom: 50 },
  itemAvatar: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center', marginRight: 8, borderWidth: 1 },
  itemBody: { flex: 1 },
  itemTitle: { fontSize: 13, fontWeight: '700', color: '#111827' },
  itemMeta: { fontSize: 11, color: '#6B7280', marginTop: 1 },
  itemTitleUnread: { color: '#2563EB' },
  itemMetaUnread: { color: '#2563EB' },
  itemTime: { fontSize: 10, color: '#6B7280', marginLeft: 6, alignSelf: 'flex-start' },
  separator: { height: 1, backgroundColor: '#E5E7EB', marginVertical: 6 },
  titleWithBadge: { flexDirection: 'row', alignItems: 'center' },
  badge: { backgroundColor: '#2563EB', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, marginLeft: 8, marginTop: 15 },
  badgeText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  pageHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  actionPill: { backgroundColor: '#F3F4F6', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: '#E5E7EB' },
  actionButtonsContainer: { flexDirection: 'row', alignItems: 'center', marginLeft: 'auto' },
  alertDetails: { marginBottom: 8, paddingHorizontal: 4 },
  alertMessage: { fontSize: 15, color: '#374151', lineHeight: 22 },
  alertDate: { fontSize: 12, color: '#6B7280' },
  metaChips: { alignItems: 'flex-end' },
  timeChip: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#EFF6FF', borderColor: '#DBEAFE', borderWidth: 1, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, marginBottom: 6 },
  timeChipText: { color: '#2563EB', fontSize: 10, marginLeft: 4, fontWeight: '600' },
  readChip: { marginTop: 6, backgroundColor: '#E5E7EB', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  readChipText: { color: '#374151', fontSize: 10, fontWeight: '700' },
  expandButton: { alignSelf: 'flex-start', marginTop: 8, paddingVertical: 4, paddingHorizontal: 8, borderRadius: 6 },
  expandButtonText: { color: '#2563EB', fontWeight: '600' },
  actionButtons: { display: 'none' },
  emptyActions: { flexDirection: 'row', gap: 12, marginTop: 16 },
  primaryButton: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#2563EB', paddingHorizontal: 12, paddingVertical: 10, borderRadius: 8 },
  primaryButtonText: { color: '#fff', fontWeight: '700' },
  secondaryButton: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#EFF6FF', borderWidth: 1, borderColor: '#DBEAFE', paddingHorizontal: 12, paddingVertical: 10, borderRadius: 8 },
  secondaryButtonText: { color: '#2563EB', fontWeight: '700' },
});

export default Alerts;
