import React, { useState, useContext, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ScrollView,
  Image,
  Animated,
  Dimensions,
  Modal,
} from 'react-native';
import { useNavigation, useIsFocused } from '@react-navigation/native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { AuthContext } from '../../contexts/AuthContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
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
import { NetworkContext } from '../../contexts/NetworkContext';
import { cacheAlerts, getCachedAlerts } from '../../offline/storage';
// Removed: sendAlertPushNotification import - backend handles all push notifications automatically
import { updateLinkFcmTokens, getLinkFcmTokens } from '../../utils/linkFcmTokenManager';
import { generateAndSavePushToken } from '../../utils/pushTokenGenerator';
import OfflineBanner from '../../components/OfflineBanner';
import NetInfo from '@react-native-community/netinfo';
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
  // Sidebar and logout moved to unified header
  const [profilePic, setProfilePic] = useState(null);
  const [deleteConfirmVisible, setDeleteConfirmVisible] = useState(false);
  const [feedbackVisible, setFeedbackVisible] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState('');
  const [feedbackSuccess, setFeedbackSuccess] = useState(true);
  const [actionLoading, setActionLoading] = useState({ id: null, action: null });
  const [markingAsRead, setMarkingAsRead] = useState(false);
  const [scheduleModalVisible, setScheduleModalVisible] = useState(false);
  const [scheduleDetail, setScheduleDetail] = useState(null);
  const [showOfflineBanner, setShowOfflineBanner] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);
  const [errorModalVisible, setErrorModalVisible] = useState(false);
  const [errorModalMessage, setErrorModalMessage] = useState('');
  
  
  // Local sidebar animation removed (handled by unified header)

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
    'schedule_permission_request': { label: 'Schedule Permission Request', icon: 'lock-open-outline', color: '#F59E0B' },
    'schedule_permission_response': { label: 'Schedule Permission Response', icon: 'checkmark-done', color: '#2563EB' },
  };

  // Get parent document ID - must match the logic used in Student Alerts
  const getParentDocId = async () => {
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

  // Load alerts for parent
  const loadAlerts = async () => {
    if (!user?.uid) {
      console.warn('No user UID available for loading alerts');
      return;
    }
    
    // Get parent document ID first (needed for cache key)
    const parentDocId = await getParentDocId();
    
    // Try to load from cache first (works offline)
    try {
      const cachedData = await getCachedAlerts(parentDocId);
      if (cachedData) {
        setAlerts(cachedData);
        // If offline, use cached data and return early
        if (!isConnected) {
          console.log('📴 Offline mode - using cached alerts');
          setLoading(false);
          return;
        }
      }
    } catch (error) {
      console.log('Error loading cached alerts:', error);
    }
    
    try {
      setLoading(true);
      
      // Clean up invalid schedule notifications first
      await cleanupScheduleNotifications();
      
      const allAlerts = [];
      
      // Only fetch from Firestore if online
      if (!isConnected) {
        setLoading(false);
        return;
      }
      
      // Get parent alerts using parent document ID
      console.log('🔍 PARENT ALERTS: Loading alerts for parent ID:', parentDocId);
      const parentAlertsRef = doc(db, 'parent_alerts', parentDocId);
      console.log('🔍 PARENT ALERTS: Document path:', parentAlertsRef.path);
      const parentDoc = await getDoc(parentAlertsRef);
    
      if (parentDoc.exists()) {
        const data = parentDoc.data();
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
            requestId: item.requestId, // For schedule permission requests
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
      
      // Cache the data for offline access
      try {
        await cacheAlerts(parentDocId, allAlerts);
      } catch (cacheError) {
        console.log('Error caching alerts:', cacheError);
      }
    } catch (error) {
      console.error('Error loading alerts:', error);
      // Don't show network error modal during navigation/offline mode
      // Keep using cached data if available
    } finally {
      setLoading(false);
    }
  };

  // Real-time listener for parent_alerts (only when online)
  useEffect(() => {
    if (!user?.uid) {
      console.warn('No user UID available for real-time listener');
      return;
    }
    
    // Only set up listener if online
    if (!isConnected) {
      return;
    }
    
    let unsub;
    
    (async () => {
      try {
        const parentDocId = await getParentDocId();
        const ref = doc(db, 'parent_alerts', parentDocId);
        unsub = onSnapshot(ref, async (snap) => {
          try {
            // Clean up invalid schedule notifications first
            await cleanupScheduleNotifications();
            
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
                requestId: item.requestId, // For schedule permission requests
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
            
            console.log('🔍 PARENT ALERTS: Real-time listener updating alerts:', mapped.map(a => ({ id: a.alertId, status: a.status, type: a.alertType })));
            setAlerts(mapped);
            setLoading(false);
            
            // Cache the updated alerts for offline access
            try {
              await cacheAlerts(parentDocId, mapped);
            } catch (cacheError) {
              console.log('Error caching alerts in real-time listener:', cacheError);
            }
          } catch (error) {
            console.error('Error in real-time listener:', error);
            setLoading(false);
          }
        });
      } catch (error) {
        console.error('Error setting up parent alerts listener:', error);
        setLoading(false);
      }
    })();
    
    return () => { try { unsub && unsub(); } catch {} };
  }, [user?.uid, isConnected]);

  // Load alerts on mount and focus
  useEffect(() => {
    if (user?.uid) {
      loadAlerts();
    }
  }, [user?.uid, isConnected]);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      if (user?.uid) {
        loadAlerts();
      }
    });
    return unsubscribe;
  }, [navigation, user?.uid, isConnected]);

  // Periodic cleanup of schedule notifications every 5 minutes
  useEffect(() => {
    if (!user?.uid) return;
    
    const cleanupInterval = setInterval(() => {
      cleanupScheduleNotifications();
    }, 5 * 60 * 1000); // 5 minutes
    
    return () => clearInterval(cleanupInterval);
  }, [user?.uid]);

  // Network monitoring
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => {
      const connected = state.isConnected && state.isInternetReachable;
      setIsOnline(connected);
      setShowOfflineBanner(!connected);
    });

    // Check initial network state
    NetInfo.fetch().then(state => {
      const connected = state.isConnected && state.isInternetReachable;
      setIsOnline(connected);
      setShowOfflineBanner(!connected);
    });

    return () => unsubscribe();
  }, []);

  // Persist filter per parent account
  useEffect(() => {
    const loadSavedFilter = async () => {
      try {
        if (!user?.uid) return;
        const saved = await AsyncStorage.getItem(`parent_alerts_filter_${user.uid}`);
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
      if (user?.uid) await AsyncStorage.setItem(`parent_alerts_filter_${user.uid}`, next);
    } catch {}
  };

  const showErrorModal = (message) => {
    setErrorModalMessage(message);
    setErrorModalVisible(true);
    setTimeout(() => setErrorModalVisible(false), 3000);
  };

  const markAllAsRead = async () => {
    // Check internet connection before proceeding
    if (!isConnected) {
      showErrorModal('No internet connection. Please check your network and try again.');
      return;
    }
    try {
      const parentDocId = await getParentDocId();
      setMarkingAsRead(true);
      const parentAlertsRef = doc(db, 'parent_alerts', parentDocId);
      const snap = await getDoc(parentAlertsRef);
      if (snap.exists()) {
        const data = snap.data();
        const items = Array.isArray(data.items) ? data.items : [];
        const nowIso = new Date().toISOString();
        const updated = items.map(it => (
          it?.type === 'link_request' ? it : { ...it, status: 'read', readAt: nowIso }
        ));
        await setDoc(parentAlertsRef, { items: updated }, { merge: true });
      }
    } catch (error) {
    } finally {
      setMarkingAsRead(false);
    }
  };

  // Helper function to check if a schedule_current notification is still valid
  const isScheduleCurrentValid = async (notification) => {
    try {
      // Check both type and alertType (items in Firestore have 'type', enriched alerts have 'alertType')
      const notifType = notification?.type || notification?.alertType;
      if (notifType !== 'schedule_current') {
        return false;
      }
      
      const notificationTime = String(notification?.time || '').trim();
      if (!notificationTime) {
        // No time field - can be deleted
        return false;
      }
      
      const now = new Date();
      
      // Check if the time range is currently active
      const isNowWithin = (timeRange) => {
        try {
          const raw = String(timeRange || '').trim();
          if (!raw) return false;
          const dashNormalized = raw.replace(/[–—−]/g, '-');
          const parts = dashNormalized.split('-').map(s => s.trim());
          if (parts.length !== 2) return false;
          const [start, end] = parts;
          const parseTime = (t) => {
            const [h, m] = t.split(':').map(Number);
            return new Date(now.getFullYear(), now.getMonth(), now.getDate(), h || 0, m || 0);
          };
          const startTime = parseTime(start);
          const endTime = parseTime(end);
          // 5 minute grace around start/end
          const graceMs = 5 * 60 * 1000;
          return now >= new Date(startTime.getTime() - graceMs) && now <= new Date(endTime.getTime() + graceMs);
        } catch { return false; }
      };
      
      // If the time is currently active, protect the notification
      if (isNowWithin(notificationTime)) {
        console.log('🔒 DELETE PROTECTION: Class time is currently active - protecting notification:', {
          id: notification?.id,
          time: notificationTime
        });
        return true; // Still valid - cannot be deleted
      }
      
      // Time has ended - check if schedule still exists
      const studentId = String(notification?.studentId || '');
      if (!studentId) {
        // No student ID - can be deleted
        return false;
      }
      
      // Check if schedule document exists
      const sRef = doc(db, 'schedules', studentId);
      const sSnap = await getDoc(sRef);
      
      if (!sSnap.exists()) {
        // Schedule doesn't exist, notification is invalid (can be deleted)
        console.log('🔒 DELETE PROTECTION: Schedule does not exist - allowing deletion:', studentId);
        return false;
      }
      
      // Schedule exists but time has ended - can be deleted
      console.log('🔒 DELETE PROTECTION: Class time has ended - allowing deletion:', {
        id: notification?.id,
        time: notificationTime
      });
      return false;
    } catch (error) {
      console.warn('Error checking if schedule_current is valid:', error);
      // On error, keep the notification (safer approach - don't delete if unsure)
      return true;
    }
  };

  const deleteAllNotifications = async () => {
    // Check internet connection before proceeding
    if (!isConnected) {
      showErrorModal('No internet connection. Please check your network and try again.');
      return;
    }
    
    try {
      const parentDocId = await getParentDocId();
      setIsDeleting(true);
      const parentAlertsRef = doc(db, 'parent_alerts', parentDocId);
      const snap = await getDoc(parentAlertsRef);
      if (snap.exists()) {
        const data = snap.data();
        const items = Array.isArray(data.items) ? data.items : [];
        
        // Process items asynchronously to check schedule_current validity
        const keep = [];
        for (const it of items) {
          // Check both type and alertType (items in Firestore have 'type', enriched alerts have 'alertType')
          const itemType = it.type || it.alertType;
          
          // Keep link_request notifications (student link requests) that haven't been responded to
          if (itemType === 'link_request') {
            keep.push(it);
            continue;
          }
          
          // Keep schedule_permission_request notifications that haven't been responded to
          if (itemType === 'schedule_permission_request') {
            keep.push(it);
            continue;
          }
          
          // Check if schedule_current notification is still valid
          if (itemType === 'schedule_current') {
            console.log('🔒 DELETE: Checking schedule_current notification:', {
              id: it.id,
              studentId: it.studentId,
              subject: it.subject,
              time: it.time,
              alertType: it.alertType
            });
            const isValid = await isScheduleCurrentValid(it);
            console.log('🔒 DELETE: Validation result for', it.id, ':', isValid);
            if (isValid) {
              // Still valid - keep it (cannot be deleted)
              console.log('🔒 DELETE: PROTECTING - Keeping valid schedule_current notification:', it.id);
              keep.push(it);
            } else {
              console.log('🔒 DELETE: ALLOWING DELETION - Invalid schedule_current notification:', it.id);
            }
            // If not valid (schedule doesn't exist or time ended), don't keep it (allow deletion)
            continue;
          }
          
          // All other notifications can be deleted
        }
        
        await setDoc(parentAlertsRef, { items: keep }, { merge: true });
      }
      setDeleteConfirmVisible(false);
      setFeedbackSuccess(true);
      setFeedbackMessage('Notifications deleted successfully');
      setFeedbackVisible(true);
      await loadAlerts();
      setTimeout(()=> setFeedbackVisible(false), 2000);
    } catch (e) {
      setDeleteConfirmVisible(false);
      setFeedbackSuccess(false);
      setFeedbackMessage('Failed to delete notifications');
      setFeedbackVisible(true);
      setTimeout(()=> setFeedbackVisible(false), 2000);
    } finally {
      setIsDeleting(false);
    }
  };

  const acceptRequest = async (alert) => {
    if (!alert?.linkId || !user?.uid) return;
    
    // Check internet connection before proceeding
    if (!isConnected) {
      showErrorModal('No internet connection. Please check your network and try again.');
      return;
    }
    
    try {
      setActionLoading({ id: alert.alertId, action: 'accept' });
      console.log('✅ PARENT ACCEPT: Starting accept process for alert:', {
        alertId: alert.alertId,
        linkId: alert.linkId,
        studentId: alert.studentId,
        studentName: alert.studentName
      });
      
      // Step 1: Update the parent_student_links document status to active
      await updateDoc(doc(db, 'parent_student_links', alert.linkId), {
        status: 'active',
        linkedAt: new Date().toISOString(),
        // Ensure the link uses the canonical parent ID
        parentId: String(user?.parentId || user?.uid || ''),
        parentIdNumber: String(user?.parentId || user?.uid || ''),
      });

      // Helper function to resolve student document ID (used for both FCM tokens and notifications)
      const resolveStudentDocId = async (studentUidOrId) => {
        try {
          const raw = String(studentUidOrId || '').trim();
          // First try: if it already includes '-', it's canonical
          if (raw && raw.includes('-')) {
            return raw;
          }
          
          // Second try: get from parent_student_links document (most reliable - check studentIdNumber field first)
          if (alert.linkId) {
            try {
              const linkSnap = await getDoc(doc(db, 'parent_student_links', String(alert.linkId || '')));
              if (linkSnap.exists()) {
                const l = linkSnap.data() || {};
                // Prefer studentIdNumber (canonical) over studentId (might be UID)
                const cand = String(l.studentIdNumber || l.studentNumber || '').trim();
                if (cand && cand.includes('-')) {
                  return cand;
                }
                // Also check if studentId in link is canonical
                const linkStudentId = String(l.studentId || '').trim();
                if (linkStudentId && linkStudentId.includes('-')) {
                  return linkStudentId;
                }
              }
            } catch {}
          }
          
          // Third try: query users collection by UID to get canonical studentId
          try {
            const qSnap = await getDocs(query(collection(db, 'users'), where('uid', '==', raw), where('role', '==', 'student')));
            if (!qSnap.empty) {
              const data = qSnap.docs[0].data() || {};
              const cand = String(data.studentId || data.studentID || data.studentIdNumber || data.studentNumber || data.lrn || '').trim();
              if (cand && cand.includes('-')) {
                return cand;
              }
            }
          } catch {}
          
          // Fallback: if no canonical ID found, use the raw value (might be UID or studentId)
          return raw;
        } catch (e) {
          return String(studentUidOrId || '').trim();
        }
      };

      // Step 1.5: Get and store FCM tokens for both parent and student in the link
      try {
        // Get parent's FCM token from users collection
        const parentDocId = await getParentDocId();
        const parentUserRef = doc(db, 'users', parentDocId);
        const parentUserSnap = await getDoc(parentUserRef);
        const parentFcmToken = parentUserSnap.exists() ? (parentUserSnap.data()?.fcmToken || null) : null;

        // If parent doesn't have FCM token, try to generate one
        let finalParentFcmToken = parentFcmToken;
        if (!finalParentFcmToken && user) {
          try {
            finalParentFcmToken = await generateAndSavePushToken(user);
          } catch (e) {
            console.warn('Could not generate parent FCM token:', e);
          }
        }

        // Get student's FCM token from users collection
        let studentFcmToken = null;
        if (alert.studentId) {
          const studentDocId = await resolveStudentDocId(alert.studentId);
          const studentUserRef = doc(db, 'users', studentDocId);
          const studentUserSnap = await getDoc(studentUserRef);
          if (studentUserSnap.exists()) {
            const studentUserData = studentUserSnap.data();
            studentFcmToken = studentUserData?.fcmToken || null;

            // If student doesn't have FCM token, we can't generate it here (they need to log in)
            // But we'll store null and update it when they next log in
          }
        }

        // Store FCM tokens in the link document
        await updateLinkFcmTokens(alert.linkId, finalParentFcmToken, studentFcmToken);
        console.log('✅ Stored FCM tokens in parent_student_links:', {
          linkId: alert.linkId,
          hasParentToken: !!finalParentFcmToken,
          hasStudentToken: !!studentFcmToken
        });
      } catch (fcmError) {
        console.warn('⚠️ Failed to store FCM tokens in link (non-blocking):', fcmError);
        // Continue with link acceptance even if FCM token storage fails
      }

      // Step 2: Create accepted notification for student
      const acceptedNotification = {
        id: `${alert.linkId}_accepted_${Date.now()}`,
        type: 'link_response',
        title: 'Link Request Accepted',
        message: `${user?.firstName || 'Parent'} ${user?.lastName || ''} accepted your link request.`,
        status: 'unread',
        response: 'accepted',
        linkId: alert.linkId,
        parentId: user.parentId || user.uid,
        studentId: alert.studentId,
        studentName: alert.studentName,
        createdAt: new Date().toISOString()
      };

      console.log('✅ PARENT ACCEPT: Creating accepted notification for student:', acceptedNotification);

      // Add to student alerts - resolveStudentDocId was already defined above in Step 1.5
      if (alert.studentId) {
        const studentDocId = await resolveStudentDocId(alert.studentId);
        console.log('✅ PARENT ACCEPT: Resolved student document ID:', studentDocId, 'from alert.studentId:', alert.studentId);
        
        const studentAlertsRef = doc(db, 'student_alerts', studentDocId);
        const studentSnap = await getDoc(studentAlertsRef);
        const existing = studentSnap.exists() ? (Array.isArray(studentSnap.data()?.items) ? studentSnap.data().items : []) : [];
        // Check for duplicates by ID
        const isDuplicate = existing.some(it => String(it?.id) === String(acceptedNotification.id));
        if (!isDuplicate) {
          const updated = [...existing, acceptedNotification];
          await setDoc(studentAlertsRef, { items: updated }, { merge: true });
          console.log('✅ PARENT ACCEPT: Successfully wrote link_response to student_alerts:', studentDocId);
        } else {
          console.log('✅ PARENT ACCEPT: Duplicate notification, skipping:', acceptedNotification.id);
        }
      }

      // Step 3: Update parent alerts to show accepted response
      const parentDocId = await getParentDocId();
      const parentAlertsRef = doc(db, 'parent_alerts', parentDocId);
      const parentDocSnap = await getDoc(parentAlertsRef);
      const existing = parentDocSnap.exists() ? (Array.isArray(parentDocSnap.data()?.items) ? parentDocSnap.data().items : []) : [];
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
      await setDoc(parentAlertsRef, { items: updated }, { merge: true });

      // Step 4: Update local state
      setAlerts(prev => prev.map(a => (
        a.alertType === 'link_request' && a.linkId === alert.linkId
          ? { ...a, alertType: 'link_response_self', title: 'Link Request Accepted', message: 'You accepted the link request.', status: 'read', response: 'accepted' }
          : a
      )));

      console.log('✅ PARENT ACCEPT: Accept process completed successfully');

      // Trigger immediate current class check for the newly linked student
      try {
        await triggerCurrentClassCheckForStudent(alert.studentId);
      } catch (triggerError) {
        console.warn('Failed to trigger current class check after linking:', triggerError);
      }

    } catch (e) {
      console.error('✅ PARENT ACCEPT: Error accepting request:', e);
      Alert.alert('Error', 'Failed to accept request');
    } finally {
      setActionLoading({ id: null, action: null });
    }
  };

  const declineRequest = async (alert) => {
    if (!alert?.linkId || !user?.uid) return;
    
    // Check internet connection before proceeding
    if (!isConnected) {
      showErrorModal('No internet connection. Please check your network and try again.');
      return;
    }
    
    try {
      setActionLoading({ id: alert.alertId, action: 'decline' });
      console.log('🔴 PARENT DECLINE: Starting decline process for alert:', {
        alertId: alert.alertId,
        linkId: alert.linkId,
        studentId: alert.studentId,
        studentName: alert.studentName
      });

      // Step 1: Create declined notification for student
      const declinedNotification = {
        id: `${alert.linkId}_declined_${Date.now()}`,
        type: 'link_response',
        title: 'Link Request Declined',
        message: `${user?.firstName || 'Parent'} ${user?.lastName || ''} declined your link request.`,
        status: 'unread',
        response: 'declined',
        linkId: alert.linkId,
        parentId: user.parentId || user.uid,
        studentId: alert.studentId,
        studentName: alert.studentName,
        createdAt: new Date().toISOString()
      };

      console.log('🔴 PARENT DECLINE: Creating declined notification:', declinedNotification);

      // Add to student alerts - must resolve correct student document ID (canonical studentId, not UID)
      if (alert.studentId) {
        const studentDocId = await resolveStudentDocId(alert.studentId);
        console.log('🔴 PARENT DECLINE: Resolved student document ID:', studentDocId, 'from alert.studentId:', alert.studentId);
        
        const studentAlertsRef = doc(db, 'student_alerts', studentDocId);
        const studentSnap = await getDoc(studentAlertsRef);
        const existing = studentSnap.exists() ? (Array.isArray(studentSnap.data()?.items) ? studentSnap.data().items : []) : [];
        // Check for duplicates by ID
        const isDuplicate = existing.some(it => String(it?.id) === String(declinedNotification.id));
        if (!isDuplicate) {
          const updated = [...existing, declinedNotification];
          await setDoc(studentAlertsRef, { items: updated }, { merge: true });
          console.log('🔴 PARENT DECLINE: Successfully wrote link_response to student_alerts:', studentDocId);
          // Send push notification via backend API (works even when app is closed)
          // Removed: sendAlertPushNotification - backend handles all push notifications automatically
          Promise.resolve().catch(err => 
            console.warn('Push notification failed (non-blocking):', err)
          );
        } else {
          console.log('🔴 PARENT DECLINE: Duplicate notification, skipping:', declinedNotification.id);
        }
      }

      // Step 2: Update the parent_student_links document status to declined
      try {
        const linkDocRef = doc(db, 'parent_student_links', alert.linkId);
        await updateDoc(linkDocRef, {
          status: 'declined',
          declinedAt: new Date().toISOString(),
          declinedBy: 'parent'
        });
        console.log('🔴 PARENT DECLINE: Successfully updated link status to declined');
      } catch (updateError) {
        console.log('🔴 PARENT DECLINE: Failed to update link status, deleting document:', updateError);
        // If update fails, delete the document
        await deleteDoc(doc(db, 'parent_student_links', alert.linkId));
        console.log('🔴 PARENT DECLINE: Deleted link document as fallback');
      }

      // Step 3: Update parent alerts to show declined response
      const parentDocId = await getParentDocId();
      const parentAlertsRef = doc(db, 'parent_alerts', parentDocId);
      const parentDocSnap = await getDoc(parentAlertsRef);
      if (parentDocSnap.exists()) {
        const existing = Array.isArray(parentDocSnap.data()?.items) ? parentDocSnap.data().items : [];
        const updated = existing.map(it => (
          it?.type === 'link_request' && it?.linkId === alert.linkId
            ? { ...it, type: 'link_response_self', title: 'Link Request Declined', message: 'You declined the link request.', status: 'read', response: 'declined' }
            : it
        ));
        await setDoc(parentAlertsRef, { items: updated }, { merge: true });
      }

      // Step 4: Update local state
      setAlerts(prev => prev.map(a => (
        a.alertType === 'link_request' && a.linkId === alert.linkId
          ? { ...a, alertType: 'link_response_self', title: 'Link Request Declined', message: 'You declined the link request.', status: 'read', response: 'declined' }
          : a
      )));

      console.log('🔴 PARENT DECLINE: Decline process completed successfully');

    } catch (err) {
      console.error('🔴 PARENT DECLINE: Error declining request:', err);
      Alert.alert('Error', 'Failed to decline request');
    } finally {
      setActionLoading({ id: null, action: null });
    }
  };

  const acceptSchedulePermission = async (alert) => {
    if (!alert?.requestId || !alert?.studentId) return;
    
    // Check internet connection before proceeding
    if (!isConnected) {
      showErrorModal('No internet connection. Please check your network and try again.');
      return;
    }
    
    try {
      setActionLoading({ id: alert.alertId, action: 'accept' });
      console.log('✅ PARENT SCHEDULE PERMISSION ACCEPT: Starting accept process for alert:', {
        alertId: alert.alertId,
        requestId: alert.requestId,
        studentId: alert.studentId,
        studentName: alert.studentName
      });

      // Grant 24 hours permission
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24 hours from now

      // Store permission in student_schedule_permissions collection
      const permRef = doc(db, 'student_schedule_permissions', alert.studentId);
      await setDoc(permRef, {
        studentId: alert.studentId,
        grantedAt: now.toISOString(),
        expiresAt: expiresAt.toISOString(),
        grantedBy: user?.parentId || user?.uid,
        parentName: `${user?.firstName || ''} ${user?.lastName || ''}`.trim() || 'Parent',
      }, { merge: true });

      // Create accepted notification for student
      const acceptedNotification = {
        id: `sched_perm_resp_${alert.studentId}_${Date.now()}`,
        type: 'schedule_permission_response',
        title: 'Schedule Permission Granted',
        message: `${user?.firstName || 'Parent'} ${user?.lastName || ''} granted you permission to modify your schedule for 24 hours.`,
        status: 'unread',
        response: 'accepted',
        requestId: alert.requestId,
        studentId: alert.studentId,
        studentName: alert.studentName,
        expiresAt: expiresAt.toISOString(),
        createdAt: now.toISOString()
      };

      // Add to student alerts
      const studentAlertsRef = doc(db, 'student_alerts', alert.studentId);
      const studentSnap = await getDoc(studentAlertsRef);
      const existing = studentSnap.exists() ? (Array.isArray(studentSnap.data()?.items) ? studentSnap.data().items : []) : [];
      const isDuplicate = existing.some(it => String(it?.id) === String(acceptedNotification.id));
      if (!isDuplicate) {
        const updated = [...existing, acceptedNotification];
        await setDoc(studentAlertsRef, { items: updated }, { merge: true });
        console.log('✅ PARENT SCHEDULE PERMISSION ACCEPT: Successfully wrote response to student_alerts');
        // Send push notification via backend API (works even when app is closed)
        // Removed: sendAlertPushNotification - backend handles all push notifications automatically
        Promise.resolve().catch(err => 
          console.warn('Push notification failed (non-blocking):', err)
        );
      }

      // Update parent alerts to show accepted response
      const parentDocId = await getParentDocId();
      const parentAlertsRef = doc(db, 'parent_alerts', parentDocId);
      const parentDocSnap = await getDoc(parentAlertsRef);
      if (parentDocSnap.exists()) {
        const existing = Array.isArray(parentDocSnap.data()?.items) ? parentDocSnap.data().items : [];
        const updated = existing.map(it => {
          if (it?.type === 'schedule_permission_request' && it?.requestId === alert.requestId) {
            return {
              ...it,
              type: 'schedule_permission_response_self',
              title: 'Schedule Permission Granted',
              message: `You granted ${alert.studentName} permission to modify their schedule.`,
              status: 'read',
              response: 'accepted'
            };
          }
          return it;
        });
        await setDoc(parentAlertsRef, { items: updated }, { merge: true });
      }

      // Remove pending requests with same requestId from all other linked parents
      try {
        // Get all parent_student_links for this student
        const linkQueries = [];
        if (alert.studentId) {
          // Try to find student UID from studentId
          const studentIdQueries = [
            query(collection(db, 'parent_student_links'), where('studentIdNumber', '==', alert.studentId), where('status', '==', 'active')),
          ];
          // Also query by studentId as UID if it looks like a UID
          if (alert.studentId && !alert.studentId.includes('-')) {
            studentIdQueries.push(
              query(collection(db, 'parent_student_links'), where('studentId', '==', alert.studentId), where('status', '==', 'active'))
            );
          }
          const linkResults = await Promise.all(studentIdQueries.map(q => getDocs(q)));
          const allLinks = [];
          linkResults.forEach(snap => {
            snap.docs.forEach(doc => {
              const data = doc.data();
              allLinks.push({
                parentId: data.parentId,
                linkId: doc.id
              });
            });
          });

          // For each linked parent (excluding the current parent), remove pending requests with same requestId
          const resolveParentDocId = async (parentUid) => {
            try {
              const raw = String(parentUid || '').trim();
              if (raw && raw.includes('-')) return raw;
              try {
                const qSnap = await getDocs(query(collection(db, 'users'), where('uid', '==', raw), where('role', '==', 'parent')));
                if (!qSnap.empty) {
                  const data = qSnap.docs[0].data() || {};
                  const cand = String(data.parentId || data.parentIdCanonical || '').trim();
                  if (cand && cand.includes('-')) return cand;
                }
              } catch {}
              return raw;
            } catch {
              return String(parentUid || '').trim();
            }
          };

          const currentParentDocId = await getParentDocId();
          for (const link of allLinks) {
            const otherParentDocId = await resolveParentDocId(link.parentId);
            // Skip current parent - we already updated their alerts above
            if (otherParentDocId === currentParentDocId) continue;
            
            const otherParentAlertsRef = doc(db, 'parent_alerts', otherParentDocId);
            const otherParentSnap = await getDoc(otherParentAlertsRef);
            if (otherParentSnap.exists()) {
              const existing = Array.isArray(otherParentSnap.data()?.items) ? otherParentSnap.data().items : [];
              // Remove any pending schedule_permission_request with the same requestId
              const updated = existing.filter(it => 
                !(it?.type === 'schedule_permission_request' && 
                  it?.requestId === alert.requestId &&
                  it?.status === 'unread')
              );
              if (updated.length !== existing.length) {
                await setDoc(otherParentAlertsRef, { items: updated }, { merge: true });
                console.log(`✅ Removed pending request from parent ${otherParentDocId} (requestId: ${alert.requestId})`);
              }
            }
          }
        }
      } catch (error) {
        console.warn('Error removing pending requests from other parents (non-critical):', error);
      }

      // Update local state
      setAlerts(prev => prev.map(a => (
        a.alertType === 'schedule_permission_request' && a.requestId === alert.requestId
          ? { ...a, alertType: 'schedule_permission_response_self', title: 'Schedule Permission Granted', message: `You granted ${alert.studentName} permission to modify their schedule.`, status: 'read', response: 'accepted' }
          : a
      )));

      console.log('✅ PARENT SCHEDULE PERMISSION ACCEPT: Accept process completed successfully');
    } catch (e) {
      console.error('✅ PARENT SCHEDULE PERMISSION ACCEPT: Error accepting request:', e);
      Alert.alert('Error', 'Failed to accept permission request');
    } finally {
      setActionLoading({ id: null, action: null });
    }
  };

  const declineSchedulePermission = async (alert) => {
    if (!alert?.requestId || !alert?.studentId) return;
    
    // Check internet connection before proceeding
    if (!isConnected) {
      showErrorModal('No internet connection. Please check your network and try again.');
      return;
    }
    
    try {
      setActionLoading({ id: alert.alertId, action: 'decline' });
      console.log('🔴 PARENT SCHEDULE PERMISSION DECLINE: Starting decline process for alert:', {
        alertId: alert.alertId,
        requestId: alert.requestId,
        studentId: alert.studentId,
        studentName: alert.studentName
      });

      // Create declined notification for student
      const declinedNotification = {
        id: `sched_perm_resp_${alert.studentId}_${Date.now()}`,
        type: 'schedule_permission_response',
        title: 'Schedule Permission Denied',
        message: `Your request to modify your schedule has been denied.`,
        status: 'unread',
        response: 'declined',
        requestId: alert.requestId,
        studentId: alert.studentId,
        studentName: alert.studentName,
        createdAt: new Date().toISOString()
      };

      // Add to student alerts
      const studentAlertsRef = doc(db, 'student_alerts', alert.studentId);
      const studentSnap = await getDoc(studentAlertsRef);
      const existing = studentSnap.exists() ? (Array.isArray(studentSnap.data()?.items) ? studentSnap.data().items : []) : [];
      const isDuplicate = existing.some(it => String(it?.id) === String(declinedNotification.id));
      if (!isDuplicate) {
        const updated = [...existing, declinedNotification];
        await setDoc(studentAlertsRef, { items: updated }, { merge: true });
        console.log('🔴 PARENT SCHEDULE PERMISSION DECLINE: Successfully wrote response to student_alerts');
        // Send push notification via backend API (works even when app is closed)
        // Removed: sendAlertPushNotification - backend handles all push notifications automatically
        Promise.resolve().catch(err => 
          console.warn('Push notification failed (non-blocking):', err)
        );
      }

      // Update parent alerts to show declined response
      const parentDocId = await getParentDocId();
      const parentAlertsRef = doc(db, 'parent_alerts', parentDocId);
      const parentDocSnap = await getDoc(parentAlertsRef);
      if (parentDocSnap.exists()) {
        const existing = Array.isArray(parentDocSnap.data()?.items) ? parentDocSnap.data().items : [];
        const updated = existing.map(it => {
          if (it?.type === 'schedule_permission_request' && it?.requestId === alert.requestId) {
            return {
              ...it,
              type: 'schedule_permission_response_self',
              title: 'Schedule Permission Denied',
              message: `You denied ${alert.studentName}'s request to modify their schedule.`,
              status: 'read',
              response: 'declined'
            };
          }
          return it;
        });
        await setDoc(parentAlertsRef, { items: updated }, { merge: true });
      }

      // Remove pending requests with same requestId from all other linked parents
      try {
        // Get all parent_student_links for this student
        const linkQueries = [];
        if (alert.studentId) {
          // Try to find student UID from studentId
          const studentIdQueries = [
            query(collection(db, 'parent_student_links'), where('studentIdNumber', '==', alert.studentId), where('status', '==', 'active')),
          ];
          // Also query by studentId as UID if it looks like a UID
          if (alert.studentId && !alert.studentId.includes('-')) {
            studentIdQueries.push(
              query(collection(db, 'parent_student_links'), where('studentId', '==', alert.studentId), where('status', '==', 'active'))
            );
          }
          const linkResults = await Promise.all(studentIdQueries.map(q => getDocs(q)));
          const allLinks = [];
          linkResults.forEach(snap => {
            snap.docs.forEach(doc => {
              const data = doc.data();
              allLinks.push({
                parentId: data.parentId,
                linkId: doc.id
              });
            });
          });

          // For each linked parent (excluding the current parent), remove pending requests with same requestId
          const resolveParentDocId = async (parentUid) => {
            try {
              const raw = String(parentUid || '').trim();
              if (raw && raw.includes('-')) return raw;
              try {
                const qSnap = await getDocs(query(collection(db, 'users'), where('uid', '==', raw), where('role', '==', 'parent')));
                if (!qSnap.empty) {
                  const data = qSnap.docs[0].data() || {};
                  const cand = String(data.parentId || data.parentIdCanonical || '').trim();
                  if (cand && cand.includes('-')) return cand;
                }
              } catch {}
              return raw;
            } catch {
              return String(parentUid || '').trim();
            }
          };

          const currentParentDocId = await getParentDocId();
          for (const link of allLinks) {
            const otherParentDocId = await resolveParentDocId(link.parentId);
            // Skip current parent - we already updated their alerts above
            if (otherParentDocId === currentParentDocId) continue;
            
            const otherParentAlertsRef = doc(db, 'parent_alerts', otherParentDocId);
            const otherParentSnap = await getDoc(otherParentAlertsRef);
            if (otherParentSnap.exists()) {
              const existing = Array.isArray(otherParentSnap.data()?.items) ? otherParentSnap.data().items : [];
              // Remove any pending schedule_permission_request with the same requestId
              const updated = existing.filter(it => 
                !(it?.type === 'schedule_permission_request' && 
                  it?.requestId === alert.requestId &&
                  it?.status === 'unread')
              );
              if (updated.length !== existing.length) {
                await setDoc(otherParentAlertsRef, { items: updated }, { merge: true });
                console.log(`✅ Removed pending request from parent ${otherParentDocId} (requestId: ${alert.requestId})`);
              }
            }
          }
        }
      } catch (error) {
        console.warn('Error removing pending requests from other parents (non-critical):', error);
      }

      // Update local state
      setAlerts(prev => prev.map(a => (
        a.alertType === 'schedule_permission_request' && a.requestId === alert.requestId
          ? { ...a, alertType: 'schedule_permission_response_self', title: 'Schedule Permission Denied', message: `You denied ${alert.studentName}'s request to modify their schedule.`, status: 'read', response: 'declined' }
          : a
      )));

      console.log('🔴 PARENT SCHEDULE PERMISSION DECLINE: Decline process completed successfully');
    } catch (err) {
      console.error('🔴 PARENT SCHEDULE PERMISSION DECLINE: Error declining request:', err);
      Alert.alert('Error', 'Failed to decline permission request');
    } finally {
      setActionLoading({ id: null, action: null });
    }
  };

  // Load profile picture
  useEffect(() => {
    const loadProfilePic = async () => {
      try {
        if (!user?.uid) { setProfilePic(null); return; }
        const savedProfile = await AsyncStorage.getItem(`parentProfilePic_${user.uid}`);
        setProfilePic(savedProfile ? { uri: savedProfile } : null);
      } catch (e) {
        setProfilePic(null);
      }
    };
    if (isFocused) loadProfilePic();
  }, [isFocused, user?.uid]);

  // Sidebar toggle
  // Header-side menu and logout now handled by unified header

  const isExpanded = (id) => expandedIds.includes(id);
  const toggleExpand = (id) => {
    setExpandedIds((prev) => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));
  };

  // Resolve linked students (supports UID and canonical parentId)
  const getLinkedStudentIds = async () => {
    try {
      if (!user?.uid) return [];
      const results = new Set();
      const uid = String(user.uid);
      const canonical = String(user?.parentId || '').trim();

      // Query links by uid
      const qByUid = query(
        collection(db, 'parent_student_links'),
        where('parentId', '==', uid),
        where('status', '==', 'active')
      );
      const snapUid = await getDocs(qByUid);
      snapUid.docs.forEach(d => { const sid = d.data()?.studentId; if (sid) results.add(String(sid)); });

      // Query links by canonical id if available
      if (canonical && canonical.includes('-')) {
        const qByCanonical = query(
          collection(db, 'parent_student_links'),
          where('parentId', '==', canonical),
          where('status', '==', 'active')
        );
        const snapCanonical = await getDocs(qByCanonical);
        snapCanonical.docs.forEach(d => { const sid = d.data()?.studentId; if (sid) results.add(String(sid)); });

        // Also check parentIdNumber if used by legacy data
        const qByNumber = query(
          collection(db, 'parent_student_links'),
          where('parentIdNumber', '==', canonical),
          where('status', '==', 'active')
        );
        const snapNumber = await getDocs(qByNumber);
        snapNumber.docs.forEach(d => { const sid = d.data()?.studentId; if (sid) results.add(String(sid)); });
      }

      return Array.from(results);
    } catch {
      return [];
    }
  };

  // Clean up schedule_current notifications when parent has no schedule
  const cleanupScheduleNotifications = async () => {
    try {
      if (!user?.uid) return;
      
      const parentDocId = await getParentDocId();
      const parentAlertsRef = doc(db, 'parent_alerts', parentDocId);
      const parentSnap = await getDoc(parentAlertsRef);
      
      if (!parentSnap.exists()) return;
      
      const existing = Array.isArray(parentSnap.data()?.items) ? parentSnap.data().items : [];
      const scheduleCurrentAlerts = existing.filter(it => it?.type === 'schedule_current');
      
      if (scheduleCurrentAlerts.length === 0) return;
      
      // Get all linked students (supports UID and canonical)
      const linkedStudentIds = await getLinkedStudentIds();
      
      if (linkedStudentIds.length === 0) {
        // No linked students, remove all schedule_current notifications
        const updated = existing.filter(it => it?.type !== 'schedule_current');
        await setDoc(parentAlertsRef, { items: updated }, { merge: true });
        console.log('🧹 CLEANUP: Removed all schedule_current notifications - no linked students');
        return;
      }
      
      // Check each schedule_current notification
      const now = new Date();
      const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
      const currentDay = DAYS[now.getDay() === 0 ? 6 : now.getDay() - 1];
      
      const isNowWithin = (timeRange) => {
        try {
          const raw = String(timeRange || '').trim();
          if (!raw) return false;
          const dashNormalized = raw.replace(/[–—−]/g, '-');
          const parts = dashNormalized.split('-').map(s => s.trim());
          if (parts.length !== 2) return false;
          const [start, end] = parts;
          const parseTime = (t) => {
            const [h, m] = t.split(':').map(Number);
            return new Date(now.getFullYear(), now.getMonth(), now.getDate(), h || 0, m || 0);
          };
          const startTime = parseTime(start);
          const endTime = parseTime(end);
          return now >= startTime && now <= endTime;
        } catch { return false; }
      };
      
      let hasChanges = false;
      const updated = [];
      
      // Process each item synchronously for non-schedule_current, async for schedule_current
      for (const it of existing) {
        if (it?.type !== 'schedule_current') {
          updated.push(it);
          continue;
        }
        
        const studentId = String(it?.studentId);
        
        // Check if student is still linked
        if (!linkedStudentIds.includes(studentId)) {
          console.log('🧹 CLEANUP: Removing schedule_current for unlinked student:', studentId);
          hasChanges = true;
          continue; // Skip this notification
        }
        
        // Check if student has a schedule (async check)
        try {
          const sRef = doc(db, 'schedules', studentId);
          const sSnap = await getDoc(sRef);
          
          if (!sSnap.exists()) {
            console.log('🧹 CLEANUP: Removing schedule_current - no schedule exists for student:', studentId);
            hasChanges = true;
            continue; // Skip this notification
          }
          
          const subjectsAny = sSnap.data()?.subjects;
          let hasValidSchedule = false;
          
          const createdMs = new Date(it?.createdAt || 0).getTime();
          const recentGraceMs = 10 * 60 * 1000;
          const isRecent = Number.isFinite(createdMs) && (Date.now() - createdMs) < recentGraceMs;

          if (subjectsAny && !Array.isArray(subjectsAny) && typeof subjectsAny === 'object') {
            Object.keys(subjectsAny).forEach(subj => {
              const entries = Array.isArray(subjectsAny[subj]) ? subjectsAny[subj] : [];
              for (const e of entries) {
                const t = e?.time || e?.Time; 
                const d = e?.day || e?.Day || e?.dayOfWeek;
                if (d === currentDay && isNowWithin(t)) {
                  hasValidSchedule = true;
                }
              }
            });
          } else if (Array.isArray(subjectsAny)) {
            for (const e of subjectsAny) {
              const t = e?.time || e?.Time; 
              const d = e?.day || e?.Day || e?.dayOfWeek; 
              if (d === currentDay && isNowWithin(t)) {
                hasValidSchedule = true;
              }
            }
          }
          
          // Keep if valid window OR very recent to avoid flicker
          if (hasValidSchedule || isRecent) {
            updated.push(it);
          } else {
            console.log('🧹 CLEANUP: Removing schedule_current - no active class for student:', studentId);
            hasChanges = true;
            continue;
          }
        } catch (error) {
          console.warn('Error checking schedule for cleanup:', error);
          // Keep notification if there's an error (safer approach)
          updated.push(it);
        }
      }
      
      if (hasChanges) {
        await setDoc(parentAlertsRef, { items: updated }, { merge: true });
        console.log('🧹 CLEANUP: Cleaned up invalid schedule_current notifications');
      }
    } catch (error) {
      console.error('Error cleaning up schedule notifications:', error);
    }
  };

  // Trigger current class check for a specific student
  const triggerCurrentClassCheckForStudent = async (studentId) => {
    try {
      if (!studentId || !user?.uid) return;
      
      const now = new Date();
      const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
      const currentDay = DAYS[now.getDay() === 0 ? 6 : now.getDay() - 1];
      
      const isNowWithin = (timeRange) => {
        try {
          const raw = String(timeRange || '').trim();
          if (!raw) return false;
          const parts = raw.split('-').map(s => s.trim());
          if (parts.length !== 2) return false;
          const [start, end] = parts;
          const parseTime = (t) => {
            const [h, m] = t.split(':').map(Number);
            return new Date(now.getFullYear(), now.getMonth(), now.getDate(), h || 0, m || 0);
          };
          const startTime = parseTime(start);
          const endTime = parseTime(end);
          return now >= startTime && now <= endTime;
        } catch { return false; }
      };

      // Get student's schedule
      const sRef = doc(db, 'schedules', String(studentId));
      const sSnap = await getDoc(sRef);
      if (!sSnap.exists()) return;
      
      const subjectsAny = sSnap.data()?.subjects;
      const activeList = [];
      
      if (subjectsAny && !Array.isArray(subjectsAny) && typeof subjectsAny === 'object') {
        Object.keys(subjectsAny).forEach(subj => {
          const entries = Array.isArray(subjectsAny[subj]) ? subjectsAny[subj] : [];
          for (const e of entries) {
            const t = e?.time || e?.Time; 
            const d = e?.day || e?.Day || e?.dayOfWeek;
            if (d === currentDay && isNowWithin(t)) {
              const todayKey = `${now.getFullYear()}-${now.getMonth()+1}-${now.getDate()}`;
              activeList.push({ 
                subject: subj, 
                time: t, 
                currentKey: `${currentDay}_${subj}_${t}_${todayKey}`,
                studentName: 'Student' // Will be resolved from link data
              });
            }
          }
        });
      } else if (Array.isArray(subjectsAny)) {
        for (const e of subjectsAny) {
          const t = e?.time || e?.Time; 
          const d = e?.day || e?.Day || e?.dayOfWeek; 
          const subj = e?.subject || e?.Subject;
          if (d === currentDay && isNowWithin(t)) {
            const todayKey = `${now.getFullYear()}-${now.getMonth()+1}-${now.getDate()}`;
            activeList.push({ 
              subject: subj, 
              time: t, 
              currentKey: `${currentDay}_${subj}_${t}_${todayKey}`,
              studentName: 'Student' // Will be resolved from link data
            });
          }
        }
      }

      if (activeList.length === 0) return;

      // Get student name from link data
      // Resolve studentName using any matching link (UID or canonical)
      let studentName = 'Student';
      const uidQ = query(
        collection(db, 'parent_student_links'),
        where('parentId', '==', user.uid),
        where('studentId', '==', studentId),
        where('status', '==', 'active')
      );
      const uidSnap = await getDocs(uidQ);
      if (!uidSnap.empty) {
        studentName = uidSnap.docs[0].data()?.studentName || 'Student';
      } else {
        const canonical = String(user?.parentId || '').trim();
        if (canonical) {
          const canQ = query(
            collection(db, 'parent_student_links'),
            where('parentId', '==', canonical),
            where('studentId', '==', studentId),
            where('status', '==', 'active')
          );
          const canSnap = await getDocs(canQ);
          if (!canSnap.empty) {
            studentName = canSnap.docs[0].data()?.studentName || 'Student';
          } else {
            const numQ = query(
              collection(db, 'parent_student_links'),
              where('parentIdNumber', '==', canonical),
              where('studentId', '==', studentId),
              where('status', '==', 'active')
            );
            const numSnap = await getDocs(numQ);
            if (!numSnap.empty) studentName = numSnap.docs[0].data()?.studentName || 'Student';
          }
        }
      }

      // Fallback: If studentName is still 'Student', try fetching from users collection
      if (studentName === 'Student' || !studentName || studentName.trim() === '') {
        try {
          const userRef = doc(db, 'users', String(studentId));
          const userSnap = await getDoc(userRef);
          if (userSnap.exists()) {
            const userData = userSnap.data();
            const firstName = userData.firstName || '';
            const lastName = userData.lastName || '';
            const fullName = `${firstName} ${lastName}`.trim();
            if (fullName) {
              studentName = fullName;
            } else {
              // Try other name fields as fallback
              const altName = userData.fullName || userData.displayName || userData.studentName || userData.name;
              if (altName && String(altName).trim()) {
                studentName = String(altName).trim();
              }
            }
          }
        } catch (error) {
          console.warn('Error fetching student name from users collection:', error);
        }
      }

      // Update activeList with student name
      activeList.forEach(item => item.studentName = studentName);

      // Get parent document ID
      const parentDocId = await getParentDocId();
      const parentAlertsRef = doc(db, 'parent_alerts', parentDocId);
      const parentSnap = await getDoc(parentAlertsRef);
      const existing = parentSnap.exists() ? (Array.isArray(parentSnap.data()?.items) ? parentSnap.data().items : []) : [];
      
      // Filter out old schedule_current notifications for this student
      const currentKeys = new Set(activeList.map(a => a.currentKey));
      let nextItems = existing.filter((it) => {
        if (!(it?.type === 'schedule_current' && String(it?.studentId) === String(studentId))) return true;
        const timeNow = isNowWithin(it.time);
        const keyMismatch = currentKeys.size > 0 && !currentKeys.has(String(it.currentKey));
        return timeNow || !keyMismatch;
      });

      // Add new schedule_current notifications
      for (const a of activeList) {
        const exists = nextItems.some(it => it?.type === 'schedule_current' && String(it?.studentId) === String(studentId) && it?.currentKey === a.currentKey);
        if (!exists) {
          nextItems.push({
            id: `sched_current_${studentId}_${a.currentKey}`,
            type: 'schedule_current',
            title: 'Class Happening Now',
            message: `${a.studentName}'s ${a.subject} is happening now (${a.time}).`,
            createdAt: new Date().toISOString(),
            status: 'unread',
            parentId: parentDocId,
            studentId: String(studentId),
            studentName: a.studentName,
            subject: a.subject,
            time: a.time,
            currentKey: a.currentKey,
          });
        }
      }

      // Update parent alerts if there are changes
      if (JSON.stringify(nextItems) !== JSON.stringify(existing)) {
        await setDoc(parentAlertsRef, { items: nextItems }, { merge: true });
        console.log('✅ Triggered current class check for student:', studentId, 'Active classes:', activeList.length);
      }
    } catch (error) {
      console.error('Error triggering current class check for student:', error);
    }
  };

  return (<>
    <View style={styles.wrapper}>
      {/* In-screen header and sidebar removed; handled by unified header */}

      {/* Content: scrollable container */}
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
              })
              // De-duplicate schedule_current by (studentId,currentKey)
              .reduce((acc, a) => {
                if (a.alertType !== 'schedule_current') { acc.push(a); return acc; }
                const key = `${String(a.studentId)}|${String(a.currentKey || '')}`;
                const idx = acc.findIndex(x => x.alertType === 'schedule_current' && `${String(x.studentId)}|${String(x.currentKey || '')}` === key);
                if (idx === -1) acc.push(a); else {
                  const tA = new Date(a.createdAt || 0).getTime();
                  const tB = new Date(acc[idx].createdAt || 0).getTime();
                  if (tA > tB) acc[idx] = a;
                }
                return acc;
              }, [])
              .map((alert, index) => {
                // Determine icon + color per alert (mirror student alerts structure)
                let typeColor = alertTypes[alert.alertType]?.color || '#6B7280';
                let iconBg = '#EEF2F7';
                let iconFg = typeColor;
                let useMci = false;
                let iconName = alertTypes[alert.alertType]?.icon || 'information-circle';

                // Link response icons: modern blue check if accepted, red X if declined (mirror student alerts)
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
                } else if (alert.alertType === 'schedule_permission_request') {
                  iconName = 'lock-open-outline';
                  typeColor = '#F59E0B';
                } else if (alert.alertType === 'schedule_permission_response' || alert.alertType === 'schedule_permission_response_self') {
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

                // Link request pending
                if (alert.alertType === 'link_request') {
                  useMci = true;
                  iconName = 'link-variant';
                  typeColor = '#10B981';
                }

                // Unlink notifications (mirror student alerts)
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
                const isPendingSchedulePermission = alert.alertType === 'schedule_permission_request' && alert.status !== 'read';
                
                // Debug log for schedule permission requests
                if (alert.alertType === 'schedule_permission_request') {
                  console.log('🔍 Schedule permission request detected:', {
                    alertId: alert.alertId,
                    alertType: alert.alertType,
                    status: alert.status,
                    isPending: isPendingSchedulePermission,
                    requestId: alert.requestId,
                    studentId: alert.studentId
                  });
                }
                
                // Generate unique key: include index to prevent duplicate keys
                const uniqueKey = [alert.alertId || 'noid', alert.createdAt || 't', alert.alertType || 'type', index].join('_');
                
                return (
                  <View key={uniqueKey} style={[styles.itemRow, (isPendingLink || isPendingSchedulePermission) && styles.itemRowWithButtons]}>
                    {(isPendingLink || isPendingSchedulePermission) ? (
                      <View style={{ flex: 1 }}>
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
                      </View>
                    ) : (
                      <TouchableOpacity 
                        activeOpacity={0.8} 
                        onPress={async () => {
                        console.log('🔍 PARENT ALERTS: Tapping notification:', {
                          alertId: alert.alertId,
                          alertType: alert.alertType,
                          status: alert.status
                        });
                        
                        // Mark notification as read for all types except link_request and schedule_permission_request (which should only be marked read when accept/decline is pressed)
                        if (alert.alertType !== 'link_request' && alert.alertType !== 'schedule_permission_request') {
                          try {
                            const parentDocId = await getParentDocId();
                            const parentAlertsRef = doc(db, 'parent_alerts', parentDocId);
                            const snap = await getDoc(parentAlertsRef);
                            if (snap.exists()) {
                              const items = Array.isArray(snap.data()?.items) ? snap.data().items : [];
                              console.log('🔍 PARENT ALERTS: Current items in Firestore:', items.map(it => ({ id: it.id, status: it.status })));
                              const updated = items.map(it => it.id === alert.alertId ? { ...it, status: 'read', readAt: new Date().toISOString() } : it);
                              console.log('🔍 PARENT ALERTS: Updated items:', updated.map(it => ({ id: it.id, status: it.status })));
                              await setDoc(parentAlertsRef, { items: updated }, { merge: true });
                              console.log('🔍 PARENT ALERTS: Successfully updated Firestore');
                            }
                            setAlerts(prev => prev.map(a => a.alertId === alert.alertId ? { ...a, status: 'read' } : a));
                            console.log('🔍 PARENT ALERTS: Successfully updated local state');
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
                            const parentNav = navigation.getParent?.();
                            if (parentNav) {
                              parentNav.navigate('ScheduleTab');
                            } else {
                              navigation.navigate('ScheduleTab');
                            }
                          } catch (navError) {
                            console.warn('Navigation error for schedule:', navError);
                          }
                        } else if (isLinkNav) {
                          // Navigate to appropriate screen for link responses
                          try {
                            const parentNav = navigation.getParent?.();
                            if (parentNav) {
                              parentNav.navigate('Home', { screen: 'ParentDashboard' });
                            } else {
                              navigation.navigate('ParentDashboard');
                            }
                          } catch (navError) {
                            console.warn('Navigation error for link response:', navError);
                          }
                        } else if (isAnnouncement) {
                          // Navigate to Events screen for announcements
                          try {
                            const parentNav = navigation.getParent?.();
                            if (parentNav) {
                              parentNav.navigate('EventsTab');
                            } else {
                              navigation.navigate('EventsTab');
                            }
                          } catch (navError) {
                            console.warn('Navigation error for announcement:', navError);
                          }
                        }
                      }}
                      style={{ flex: 1 }}
                    >
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
                    </TouchableOpacity>
                    )}
                    {isPendingLink ? (
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
                    ) : isPendingSchedulePermission ? (
                      <View style={styles.decisionRowRight} pointerEvents="box-none">
                        <TouchableOpacity
                          onPress={() => {
                            console.log('🔘 Accept button pressed for schedule permission:', alert.alertId, 'Alert:', alert);
                            if (actionLoading.id === alert.alertId) {
                              console.log('🔘 Button already processing, ignoring');
                              return;
                            }
                            console.log('🔘 Calling acceptSchedulePermission');
                            setActionLoading({ id: alert.alertId, action: 'accept' });
                            acceptSchedulePermission(alert).catch(err => {
                              console.error('🔘 Error in acceptSchedulePermission:', err);
                              setActionLoading({ id: null, action: null });
                            }).finally(() => {
                              console.log('🔘 acceptSchedulePermission completed');
                              setActionLoading({ id: null, action: null });
                            });
                          }}
                          disabled={actionLoading.id === alert.alertId}
                          style={[styles.decisionButton, styles.acceptButton, actionLoading.id === alert.alertId && styles.disabledButton]}
                          activeOpacity={0.7}
                          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        >
                          <Text style={styles.decisionButtonText}>{actionLoading.id === alert.alertId && actionLoading.action === 'accept' ? 'Accepting...' : 'Accept'}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => {
                            console.log('🔘 Decline button pressed for schedule permission:', alert.alertId, 'Alert:', alert);
                            if (actionLoading.id === alert.alertId) {
                              console.log('🔘 Button already processing, ignoring');
                              return;
                            }
                            console.log('🔘 Calling declineSchedulePermission');
                            setActionLoading({ id: alert.alertId, action: 'decline' });
                            declineSchedulePermission(alert).catch(err => {
                              console.error('🔘 Error in declineSchedulePermission:', err);
                              setActionLoading({ id: null, action: null });
                            }).finally(() => {
                              console.log('🔘 declineSchedulePermission completed');
                              setActionLoading({ id: null, action: null });
                            });
                          }}
                          disabled={actionLoading.id === alert.alertId}
                          style={[styles.decisionButton, styles.declineButtonWhite, actionLoading.id === alert.alertId && styles.disabledButton]}
                          activeOpacity={0.7}
                          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        >
                          <Text style={styles.decisionButtonTextWhite}>{actionLoading.id === alert.alertId && actionLoading.action === 'decline' ? 'Declining...' : 'Decline'}</Text>
                        </TouchableOpacity>
                      </View>
                    ) : null}
                  </View>
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

    <Modal transparent animationType="fade" visible={deleteConfirmVisible} onRequestClose={()=>!isDeleting && setDeleteConfirmVisible(false)}>
      <View style={styles.modalOverlayCenter}>
        <View style={styles.fbModalCard}>
          <View style={styles.fbModalContent}>
            <Text style={styles.fbModalTitle}>Delete notifications?</Text>
            <Text style={styles.fbModalMessage}>Delete all notifications except pending link requests, schedule permission requests, and active "Class Happening Now" notifications? This cannot be undone.</Text>
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
    <Modal transparent animationType="fade" visible={feedbackVisible} onRequestClose={()=>setFeedbackVisible(false)}>
      <View style={styles.modalOverlayCenter}>
        <View style={styles.fbModalCard}>
          <View style={styles.fbModalContent}>
            <Text style={[styles.fbModalTitle, { color: feedbackSuccess ? '#10B981' : '#DC2626' }]}>
              {feedbackSuccess ? 'Success' : 'Error'}
            </Text>
            <Text style={styles.fbModalMessage}>{feedbackMessage}</Text>
          </View>
        </View>
      </View>
    </Modal>

    {/* Error Feedback Modal */}
    <Modal transparent animationType="fade" visible={errorModalVisible} onRequestClose={() => setErrorModalVisible(false)}>
      <View style={styles.modalOverlayCenter}>
        <View style={styles.fbModalCard}>
          <View style={styles.fbModalContent}>
            <Text style={[styles.fbModalTitle, { color: '#8B0000' }]}>No internet Connection</Text>
            <Text style={styles.fbModalMessage}>{errorModalMessage}</Text>
          </View>
        </View>
      </View>
    </Modal>

    <OfflineBanner visible={showOfflineBanner} />
  </>);
};

const styles = StyleSheet.create({
  wrapper: { flex: 1, backgroundColor: '#F9FAFB' },
  contentContainer: { padding: 16, paddingBottom: 120, paddingTop: 50, flexGrow: 1 },
  headerRow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 20,
    paddingTop: 50,
    zIndex: 5,
    backgroundColor: '#004f89',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 5,
    borderBottomEndRadius: 15,
    borderBottomStartRadius: 15,
  },
  profileContainer: { flexDirection: 'row', alignItems: 'center' },
  avatar: { width: 50, height: 50, borderRadius: 30, marginRight: 8 },
  greeting: { fontSize: 20, fontWeight: '600', color: '#FFFFFF' },
  iconButton: { marginRight: 12 },
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
  decisionRowRight: { flexDirection: 'row', marginTop: 6, width: '100%', paddingHorizontal: 0, position: 'absolute', left: 0, right: 0, bottom: 8, zIndex: 10 },
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
  separator: { height: 1, backgroundColor: '#E5E7EB', marginVertical: 6 },
  titleWithBadge: { flexDirection: 'row', alignItems: 'center' },
  badge: { backgroundColor: '#2563EB', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, marginLeft: 8, marginTop: 15 },
  badgeText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  pageHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  actionPill: { backgroundColor: '#F3F4F6', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: '#E5E7EB' },
  actionButtonsContainer: { flexDirection: 'row', alignItems: 'center', marginLeft: 'auto' },
  centerContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
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
  emptyCard: { backgroundColor: '#fff', borderRadius: 8, padding: 16, alignItems: 'center', borderWidth: 1, borderColor: '#E5E7EB', shadowColor: '#0F172A', shadowOpacity: 0.08, shadowOffset: { width: 0, height: 6 }, shadowRadius: 12, elevation: 4, width: '100%' },
  emptyIconWrap: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: '#111827', marginTop: 0, marginBottom: 4 },
  emptySubtext: { fontSize: 12, color: '#6B7280', textAlign: 'center', lineHeight: 16, marginBottom: 12 },
  // Sidebar/shared
  sidebar: { position: 'absolute', top: 0, bottom: 0, width: width * 0.6, backgroundColor: '#fff', padding: 20, shadowColor: '#000', shadowOpacity: 0.1, shadowOffset: { width: -5, height: 0 }, shadowRadius: 10, zIndex: 10, borderTopLeftRadius: 15 },
  sidebarTitle: { fontSize: 25, fontWeight: 'bold', marginTop: 30, marginBottom: 20 },
  sidebarItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  sidebarText: { fontSize: 16, marginLeft: 12 },
  activeSidebarItem: { backgroundColor: '#EFF6FF', borderRadius: 8, marginVertical: 2 },
  activeSidebarText: { color: '#2563EB', fontWeight: '600' },
  logoutItem: { marginTop: 20 },
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(17,24,39,0.25)', zIndex: 9 },
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
  // Facebook-style modal styles to match Student alerts
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
});

/* END stray duplicated block */

export default Alerts;