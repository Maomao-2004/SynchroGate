import React, { useState, useEffect, useContext, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Modal, TextInput, Alert, Keyboard, Dimensions, Image
} from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { useNavigation, useIsFocused } from '@react-navigation/native';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { collection, query, where, getDocs, doc, getDoc, setDoc, updateDoc, deleteField, arrayUnion } from 'firebase/firestore';
import { db } from '../../utils/firebaseConfig';
import { withNetworkErrorHandling, getNetworkErrorMessage } from '../../utils/networkErrorHandler';
import { AuthContext } from '../../contexts/AuthContext';
import { NetworkContext } from '../../contexts/NetworkContext';
import { isFirestoreConnectionError } from '../../utils/firestoreErrorHandler';
import AsyncStorage from '@react-native-async-storage/async-storage';

const DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
const DARK_GREEN = '#064E3B';
const UNIVERSAL_HEADER_COLOR = '#004F89';
const DARK_RED = '#8B0000';

const GraphSchedule = ({ studentId: propStudentId }) => {
  const navigation = useNavigation();
  const isFocused = useIsFocused();
  const { user, logout } = useContext(AuthContext);
  const networkContext = useContext(NetworkContext);
  const isConnected = networkContext?.isConnected ?? true;
  const studentId = propStudentId || (user?.role === 'student' ? user.studentId : null);

  const [schedule, setSchedule] = useState([]);
  const [scheduleDocData, setScheduleDocData] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [selectedSubject, setSelectedSubject] = useState('');
  const [entryDataList, setEntryDataList] = useState([{
    startTime: '', startAMPM: 'AM', endTime: '', endAMPM: 'AM', days: [], subject:''
  }]);
  const [saving, setSaving] = useState(false);
  const [menuVisible, setMenuVisible] = useState(false);
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [selectedForDeletion, setSelectedForDeletion] = useState([]);
  const [deleting, setDeleting] = useState(false);
  const [deletingConfirm, setDeletingConfirm] = useState(false);
    const [subjectSelectionVisible, setSubjectSelectionVisible] = useState(false);
  const [screenData, setScreenData] = useState(Dimensions.get('window'));
  const [currentTime, setCurrentTime] = useState(new Date());
  const [logoutVisible, setLogoutVisible] = useState(false);
  const [validationErrorVisible, setValidationErrorVisible] = useState(false);
  const [validationErrorTitle, setValidationErrorTitle] = useState('Invalid Schedule');
  const [validationErrorMessage, setValidationErrorMessage] = useState('');
  // Feedback modal (auto-dismiss)
  const [feedbackVisible, setFeedbackVisible] = useState(false);
  const [feedbackTitle, setFeedbackTitle] = useState('');
  const [feedbackMessage, setFeedbackMessage] = useState('');
  const [feedbackIcon, setFeedbackIcon] = useState('checkmark-circle-outline');
  const [feedbackBg, setFeedbackBg] = useState('#EFF6FF');
  const [feedbackIconColor, setFeedbackIconColor] = useState('#2563EB');
  const [feedbackTextColor, setFeedbackTextColor] = useState('#2563EB');
  const [networkErrorVisible, setNetworkErrorVisible] = useState(false);
  const [networkErrorTitle, setNetworkErrorTitle] = useState('');
  const [networkErrorMessage, setNetworkErrorMessage] = useState('');
  const [networkErrorColor, setNetworkErrorColor] = useState('#DC2626');
  const notifyingRef = useRef(false);
  const [updateConfirmVisible, setUpdateConfirmVisible] = useState(false);
  const [saveConfirmVisible, setSaveConfirmVisible] = useState(false);
  const [savingConfirm, setSavingConfirm] = useState(false);
  const [updatingConfirm, setUpdatingConfirm] = useState(false);
  const [deleteConfirmVisible, setDeleteConfirmVisible] = useState(false);
  const [originalEntryList, setOriginalEntryList] = useState([]);
  const [hasEditChanges, setHasEditChanges] = useState(false);
  const [loading, setLoading] = useState(false);
  const [initialLoaded, setInitialLoaded] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const subjectInputRef = useRef(null);
  // Error feedback modal state
  const [errorModalVisible, setErrorModalVisible] = useState(false);
  const [errorModalMessage, setErrorModalMessage] = useState('');
  const [permissionRequestVisible, setPermissionRequestVisible] = useState(false);
  const [sendingPermissionRequest, setSendingPermissionRequest] = useState(false);
  const [hasActivePermission, setHasActivePermission] = useState(false);
  const [isLinkedToParent, setIsLinkedToParent] = useState(false);
  const [permissionExpiry, setPermissionExpiry] = useState(null);
  const permissionExpiryNotifiedRef = useRef(false);

  const showFeedback = ({
    title = 'Success',
    message = '',
    icon = 'checkmark-circle-outline',
    bg = '#EFF6FF',
    color = '#2563EB',
    durationMs = 3000,
  }) => {
    // Close any open confirmation modals immediately
    setSaveConfirmVisible(false);
    setUpdateConfirmVisible(false);
    
    // Determine text color based on title
    let textColor = '#2563EB'; // Default blue
    if (title.includes('Added') || title.includes('added')) {
      textColor = '#10B981'; // Green for added
    } else if (title.includes('Updated') || title.includes('updated')) {
      textColor = '#2563EB'; // Blue for updated
    } else if (title.includes('Deleted') || title.includes('deleted')) {
      textColor = '#DC2626'; // Red for deleted
    } else if (title.includes('Error') || title.includes('error') || title.includes('Not Found')) {
      textColor = '#DC2626'; // Red for errors
    }
    
    setFeedbackTitle(title);
    setFeedbackMessage(message);
    setFeedbackIcon(icon);
    setFeedbackBg(bg);
    setFeedbackIconColor(color);
    setFeedbackTextColor(textColor);
    setFeedbackVisible(true);
    setTimeout(() => setFeedbackVisible(false), durationMs);
  };

  const showValidationError = (title, message) => {
    setUpdateConfirmVisible(false);
    setSaveConfirmVisible(false);
    setDeleteConfirmVisible(false);
    setValidationErrorTitle(title || 'Invalid Schedule');
    setValidationErrorMessage(message || '');
    setValidationErrorVisible(true);
  };

  const showErrorModal = (message) => {
    setErrorModalMessage(message);
    setErrorModalVisible(true);
    setTimeout(() => setErrorModalVisible(false), 3000);
  };

  useEffect(() => {
    const onChange = (result) => {
      setScreenData(result.window);
    };
    const subscription = Dimensions.addEventListener('change', onChange);
    return () => subscription?.remove();
  }, []);

  // Modern modal logout
  const handleLogout = () => {
    setLogoutVisible(true);
  };

  const confirmLogout = async () => {
    setLogoutVisible(false);
    let success = false;
    try {
      await logout();
    } catch (e) {
      console.log('Logout error:', e);
    }
  };

  const cancelLogout = () => {
    setLogoutVisible(false);
  };

  // Auto-close validation error modal after 1.5 seconds
  useEffect(() => {
    if (validationErrorVisible) {
      const timer = setTimeout(() => {
        setValidationErrorVisible(false);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [validationErrorVisible]);

  // Update current time every minute
  useEffect(() => {
    const updateTime = () => {
      setCurrentTime(new Date());
    };
    
    // Update immediately
    updateTime();
    
    // Set up interval to update every minute
    const interval = setInterval(updateTime, 60000);
    
    return () => clearInterval(interval);
  }, []);

  const fetchSchedule = async () => {
    if (!studentId) { setSchedule([]); setScheduleDocData(null); return; }
    try {
      const ref = doc(db, 'schedules', studentId.toString());
      const snap = await getDoc(ref);
      let subjectsMap = {};
      let studentName = '';
      if (snap.exists()) {
        const data = snap.data();
        subjectsMap = data?.subjects || {};
        studentName = data?.studentName || '';
      }
      setScheduleDocData({ id: ref.id, studentId, studentName, subjects: subjectsMap });
      const flattened = [];
      Object.keys(subjectsMap).forEach(subj => {
        const arr = Array.isArray(subjectsMap[subj]) ? subjectsMap[subj] : [];
        arr.forEach(e => flattened.push({ subject: subj, day: e.day, time: e.time }));
      });
      setSchedule(flattened);
    } catch (err) {
      console.error('Error fetching schedule:', err);
      // Only show network error modal for actual network errors
      if (err?.code?.includes('unavailable') || err?.code?.includes('network') || err?.message?.toLowerCase().includes('network')) {
        const errorInfo = getNetworkErrorMessage({ type: 'unstable_connection', message: err.message });
        setNetworkErrorTitle(errorInfo.title);
        setNetworkErrorMessage(errorInfo.message);
        setNetworkErrorColor(errorInfo.color);
        setNetworkErrorVisible(true);
        setTimeout(() => setNetworkErrorVisible(false), 5000);
      } else {
        Alert.alert('Error fetching schedule', err.message);
      }
    }
  };
  const resolveStudentMeta = async (uid, fallbackName, localGender) => {
    try {
      if (!uid) return { firstName: (fallbackName || '').split(' ')[0] || 'Student', displayName: fallbackName || 'Student', pronoun: 'their' };
      const uSnap = await getDoc(doc(db, 'users', uid));
      let firstName = (fallbackName || '').split(' ')[0] || 'Student';
      let displayName = fallbackName || 'Student';
      let gender = (localGender || '').toString().toLowerCase();
      if (uSnap.exists()) {
        const u = uSnap.data() || {};
        firstName = (u.firstName || firstName || 'Student');
        displayName = `${u.firstName || ''} ${u.lastName || ''}`.trim() || displayName;
        if (!gender) gender = (u.gender || u.sex || '').toString().toLowerCase();
      }
      const pronoun = gender === 'male' || gender === 'm' ? 'his' : (gender === 'female' || gender === 'f' ? 'her' : 'their');
      return { firstName, displayName, pronoun };
    } catch {
      const firstName = (fallbackName || '').split(' ')[0] || 'Student';
      return { firstName, displayName: fallbackName || 'Student', pronoun: 'their' };
    }
  };

  // Resolve canonical parent doc id (e.g., 0000-00000) from a parent UID or id
  const resolveCanonicalParentDocId = async (parentUidOrId) => {
    try {
      const raw = String(parentUidOrId || '').trim();
      if (!raw) return raw;
      if (raw.includes('-')) return raw;
      // try direct users/{id}
      try {
        const directSnap = await getDoc(doc(db, 'users', raw));
        if (directSnap.exists()) {
          const d = directSnap.data() || {};
          const candidates = [d.parentId, d.parentID, d.parent_id, d.ParentId, d.ParentID].map(v => (v == null ? null : String(v).trim()));
          const found = candidates.find(v => v && v.includes('-'));
          if (found) return found;
        }
      } catch {}
      // query by uid (no role filter to be robust)
      try {
        const qSnap = await getDocs(query(collection(db, 'users'), where('uid', '==', raw)));
        if (!qSnap.empty) {
          const data = qSnap.docs[0].data() || {};
          const candidates = [data.parentId, data.parentID, data.parent_id, data.ParentId, data.ParentID].map(v => (v == null ? null : String(v).trim()));
          const found = candidates.find(v => v && v.includes('-'));
          if (found) return found;
        }
      } catch {}
      return raw;
    } catch { return String(parentUidOrId || '').trim(); }
  };

  // Migrate legacy /parent_alerts/{uid} -> /parent_alerts/{parentID}
  const migrateParentAlertsIfNeeded = async (parentUidOrId) => {
    try {
      const uid = String(parentUidOrId || '').trim();
      const canonical = await resolveCanonicalParentDocId(parentUidOrId);
      if (!uid || !canonical || uid === canonical || !canonical.includes('-')) return;
      const oldRef = doc(db, 'parent_alerts', uid);
      const oldSnap = await getDoc(oldRef);
      if (!oldSnap.exists()) return;
      const oldItems = Array.isArray(oldSnap.data()?.items) ? oldSnap.data().items : [];
      if (oldItems.length === 0) return;
      const newRef = doc(db, 'parent_alerts', canonical);
      const newSnap = await getDoc(newRef);
      const base = newSnap.exists() ? (Array.isArray(newSnap.data()?.items) ? newSnap.data().items : []) : [];
      const merged = [...base, ...oldItems.map(it => ({ ...it, parentId: canonical }))];
      await setDoc(newRef, { items: merged }, { merge: true });
      await setDoc(oldRef, { items: [] }, { merge: true });
    } catch {}
  };


  useEffect(() => { fetchSchedule(); }, [studentId]);

  // Check if student is linked to any parent
  useEffect(() => {
    const checkLinkedParents = async () => {
      if (!user?.uid && !user?.studentId) {
        setIsLinkedToParent(false);
        return;
      }
      try {
        const queries = [];
        if (user?.uid) {
          queries.push(query(collection(db, 'parent_student_links'), where('studentId', '==', user.uid), where('status', '==', 'active')));
        }
        if (user?.studentId) {
          queries.push(query(collection(db, 'parent_student_links'), where('studentIdNumber', '==', user.studentId), where('status', '==', 'active')));
        }
        if (queries.length === 0) {
          setIsLinkedToParent(false);
          return;
        }
        const results = await Promise.all(queries.map(q => getDocs(q)));
        const hasLinks = results.some(snap => !snap.empty);
        setIsLinkedToParent(hasLinks);
      } catch (error) {
        console.error('Error checking linked parents:', error);
        // Only show network error modal for actual network errors
        if (error?.code?.includes('unavailable') || error?.code?.includes('network') || error?.message?.toLowerCase().includes('network')) {
          const errorInfo = getNetworkErrorMessage({ type: 'unstable_connection', message: error.message });
          setNetworkErrorTitle(errorInfo.title);
          setNetworkErrorMessage(errorInfo.message);
          setNetworkErrorColor(errorInfo.color);
          setNetworkErrorVisible(true);
          setTimeout(() => setNetworkErrorVisible(false), 5000);
        }
        setIsLinkedToParent(false);
      }
    };
    checkLinkedParents();
  }, [user?.uid, user?.studentId]);

  // Check active permission status and send expiry notification
  useEffect(() => {
    const checkPermission = async () => {
      if (!user?.studentId || !isLinkedToParent) {
        setHasActivePermission(!isLinkedToParent); // If not linked, allow modifications
        setPermissionExpiry(null);
        return;
      }
      try {
        const permRef = doc(db, 'student_schedule_permissions', user.studentId);
        const permSnap = await getDoc(permRef);
        if (permSnap.exists()) {
          const data = permSnap.data();
          const expiryTime = data?.expiresAt ? new Date(data.expiresAt) : null;
          const now = new Date();
          
          if (expiryTime && expiryTime > now) {
            setHasActivePermission(true);
            setPermissionExpiry(expiryTime);
            permissionExpiryNotifiedRef.current = false; // Reset when permission is active
          } else {
            // Permission expired
            setHasActivePermission(false);
            setPermissionExpiry(null);
            
            // Send expiry notification if permission expired and not yet notified
            if (expiryTime && expiryTime <= now && !permissionExpiryNotifiedRef.current && !data?.expiryNotified) {
              try {
                const expiryNotification = {
                  id: `sched_perm_expired_${user.studentId}_${Date.now()}`,
                  type: 'schedule_permission_response',
                  title: 'Schedule Permission Expired',
                  message: 'Your 24-hour schedule modification permission has expired. Please request permission again to modify your schedule.',
                  status: 'unread',
                  response: 'expired',
                  studentId: user.studentId,
                  studentName: `${user?.firstName || ''} ${user?.lastName || ''}`.trim() || 'Student',
                  createdAt: now.toISOString()
                };

                const studentAlertsRef = doc(db, 'student_alerts', user.studentId);
                const studentSnap = await getDoc(studentAlertsRef);
                const existing = studentSnap.exists() ? (Array.isArray(studentSnap.data()?.items) ? studentSnap.data().items : []) : [];
                const isDuplicate = existing.some(it => String(it?.id) === String(expiryNotification.id));
                if (!isDuplicate) {
                  const updated = [...existing, expiryNotification];
                  await setDoc(studentAlertsRef, { items: updated }, { merge: true });
                  
                  // Mark as notified
                  await setDoc(permRef, { expiryNotified: true }, { merge: true });
                  permissionExpiryNotifiedRef.current = true;
                  console.log('📅 Schedule permission expiry notification sent');
                }
              } catch (error) {
                console.error('Error sending expiry notification:', error);
              }
            }
          }
        } else {
          setHasActivePermission(false);
          setPermissionExpiry(null);
        }
      } catch (error) {
        console.error('Error checking permission:', error);
        // Only show network error modal for actual network errors
        if (error?.code?.includes('unavailable') || error?.code?.includes('network') || error?.message?.toLowerCase().includes('network')) {
          const errorInfo = getNetworkErrorMessage({ type: 'unstable_connection', message: error.message });
          setNetworkErrorTitle(errorInfo.title);
          setNetworkErrorMessage(errorInfo.message);
          setNetworkErrorColor(errorInfo.color);
          setNetworkErrorVisible(true);
          setTimeout(() => setNetworkErrorVisible(false), 5000);
        }
        setHasActivePermission(false);
        setPermissionExpiry(null);
      }
    };
    checkPermission();
    // Check every minute for expiry
    const interval = setInterval(checkPermission, 60000);
    return () => clearInterval(interval);
  }, [user?.studentId, isLinkedToParent]);

  // Refresh schedule when navigating back to this screen (parity with Alerts.js)
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      setLoading(true);
      setInitialLoaded(false);
      fetchSchedule().finally(() => {
        setInitialLoaded(true);
      });
      // Also refresh permission status when screen is focused
      if (user?.studentId && isLinkedToParent) {
        const checkPermission = async () => {
          try {
            const permRef = doc(db, 'student_schedule_permissions', user.studentId);
            const permSnap = await getDoc(permRef);
            if (permSnap.exists()) {
              const data = permSnap.data();
              const expiryTime = data?.expiresAt ? new Date(data.expiresAt) : null;
              const now = new Date();
              if (expiryTime && expiryTime > now) {
                setHasActivePermission(true);
                setPermissionExpiry(expiryTime);
                permissionExpiryNotifiedRef.current = false;
              } else {
                setHasActivePermission(false);
                setPermissionExpiry(null);
              }
            } else {
              setHasActivePermission(false);
              setPermissionExpiry(null);
            }
          } catch (error) {
            console.error('Error checking permission:', error);
          }
        };
        checkPermission();
      }
    });
    return unsubscribe;
  }, [navigation, studentId, user?.studentId, isLinkedToParent]);



  // End loading when initial data fetched
  useEffect(() => {
    if (loading && initialLoaded) {
      const t = setTimeout(() => setLoading(false), 200);
      return () => clearTimeout(t);
    }
  }, [loading, initialLoaded]);

  const toggleDay = (index, day) => {
    setEntryDataList(prev => {
      const newList = [...prev];
      const days = newList[index].days;
      
      if (days.includes(day)) {
        // Remove day from current time slot
        newList[index].days = days.filter(d => d !== day);
      } else {
        // Check if day is already selected in another time slot
        const isDayUsedElsewhere = newList.some((entry, i) => i !== index && entry.days.includes(day));
        
        if (isDayUsedElsewhere) {
          // Remove day from other time slots first
          newList.forEach((entry, i) => {
            if (i !== index) {
              entry.days = entry.days.filter(d => d !== day);
            }
          });
        }
        
        // Add day to current time slot
        newList[index].days = [...days, day];
      }
      
      return newList;
    });
  };

  const selectAMPM = (index, isStart, value) => {
    setEntryDataList(prev => {
      const newList = [...prev];
      if (isStart) newList[index].startAMPM = value;
      else newList[index].endAMPM = value;
      return newList;
    });
  };

  const handleTimeChange = (index, isStart, text) => {
    let cleaned = text.replace(/[^\d:]/g, '');
    let [hh, mm] = cleaned.split(':');
    if (hh) { hh = hh.slice(0,2); if (Number(hh) > 12) hh = '12'; } else hh = '';
    if (mm) { mm = mm.slice(0,2); if (Number(mm) > 59) mm = '59'; }
    let formatted = hh;
    if (hh.length === 2 || text.includes(':')) formatted += ':';
    if (mm !== undefined) formatted += mm;
    setEntryDataList(prev => {
      const newList = [...prev];
      if (isStart) newList[index].startTime = formatted;
      else newList[index].endTime = formatted;
      return newList;
    });
  };

  // Auto-format time to HH:MM
  const formatTime = (time) => {
    if (!time) return '';
    let [h, m] = time.split(':');
    h = h.padStart(2,'0');
    m = (m || '0').padStart(2,'0');
    return `${h}:${m}`;
  };

  const isValidTime = time => {
    if (!time.includes(':')) return false;
    const [h, m] = time.split(':').map(Number);
    return h >= 1 && h <= 12 && m >= 0 && m <= 59;
  };

  const timeToNumber = (time, ampm) => {
    let [h, m] = time.split(':').map(Number);
    if (ampm === 'PM' && h !== 12) h += 12;
    if (ampm === 'AM' && h === 12) h = 0;
    return h * 60 + m;
  };

  // Function to check if current time is within a schedule entry
  const isCurrentlyActive = (timeString, day) => {
    const now = currentTime;
    const currentDay = DAYS[now.getDay() === 0 ? 6 : now.getDay() - 1]; // Convert Sunday=0 to our format
    
    if (currentDay !== day) return false;
    
    // Parse the time string (format: "HH:MM AM - HH:MM PM")
    const [startPart, endPart] = timeString.split(' - ');
    const [startTime, startAMPM] = startPart.split(' ');
    const [endTime, endAMPM] = endPart.split(' ');
    
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const startMinutes = timeToNumber(startTime, startAMPM);
    const endMinutes = timeToNumber(endTime, endAMPM);
    
    // Handle cases where end time might be next day (rare but possible)
    if (endMinutes < startMinutes) {
      // Schedule crosses midnight
      return currentMinutes >= startMinutes || currentMinutes <= endMinutes;
    } else {
      // Normal schedule within same day
      return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
    }
  };

  // Trigger current class check after schedule update
  // Notify parents of schedule changes
  const notifyParentsOfScheduleChange = async (type, studentId, subject, entries, studentName) => {
    try {
      if (!studentId) return;

      // Get linked parents for this student
      // CRITICAL: Query by both studentId (UID) and studentIdNumber (canonical) to find all links
      const linksQuery1 = query(collection(db, 'parent_student_links'), where('studentId', '==', String(studentId)), where('status', '==', 'active'));
      const linksQuery2 = query(collection(db, 'parent_student_links'), where('studentIdNumber', '==', String(studentId)), where('status', '==', 'active'));
      
      const [linksSnapshot1, linksSnapshot2] = await Promise.all([
        getDocs(linksQuery1),
        getDocs(linksQuery2)
      ]);
      
      // Merge results and deduplicate
      const allLinks = new Map();
      [...linksSnapshot1.docs, ...linksSnapshot2.docs].forEach(doc => {
        const data = doc.data();
        const linkId = doc.id;
        const parentUid = String(data?.parentId || '').trim();
        const parentIdNumber = String(data?.parentIdNumber || '').trim();
        
        // Use canonical parentIdNumber if available, otherwise parentId
        const key = parentIdNumber && parentIdNumber.includes('-') ? parentIdNumber : parentUid;
        if (key && !allLinks.has(key)) {
          allLinks.set(key, { parentUid, parentIdNumber, linkId, data });
        }
      });
      
      if (allLinks.size === 0) {
        console.log('⏭️ No active parent-student links found for student:', studentId);
        return;
      }

      // Get canonical parent IDs (must include '-')
      const parentIds = Array.from(allLinks.keys()).filter(pid => String(pid).includes('-'));

      if (parentIds.length === 0) return;

      const nowIso = new Date().toISOString();
      const title = type === 'schedule_added' ? 'Schedule Added' : 
                   type === 'schedule_updated' ? 'Schedule Updated' : 
                   type === 'schedule_deleted' ? 'Schedule Deleted' : 'Schedule Update';
      
      const message = (() => {
        if (!subject) return title;
        const firstName = (studentName || '').split(' ')[0] || 'Student';
        if (type === 'schedule_added') return `${firstName} added ${subject} to the schedule.`;
        if (type === 'schedule_updated') return `${firstName} updated ${subject} in the schedule.`;
        if (type === 'schedule_deleted') return `${firstName} deleted ${subject} from the schedule.`;
        return title;
      })();

      const uniqueSuffix = `${Date.now()}_${Math.floor(Math.random()*1000000)}`;

      for (const pid of parentIds) {
        // Safety: never write to parent_alerts with a non-canonical id (e.g., a UID like the student's UID)
        let targetPid = pid;
        if (!String(targetPid).includes('-')) {
          try {
            // Try resolve canonical parent id from users/{pid} doc
            const maybeParentDoc = await getDoc(doc(db, 'users', String(pid)));
            const maybeParentData = maybeParentDoc.exists() ? (maybeParentDoc.data() || {}) : {};
            const cand = String(maybeParentData.parentId || maybeParentData.parentIdCanonical || '').trim();
            if (cand && cand.includes('-')) targetPid = cand;
          } catch {}
        }
        if (!String(targetPid).includes('-')) {
          console.log('⚠️ Skipping write to parent_alerts due to non-canonical parent id:', pid);
          continue;
        }
        
        // CRITICAL: Only create alert if parent is logged in and is the intended recipient
        // Verify parent user exists and is logged in BEFORE creating alert
        let parentUserDoc = null;
        try {
          const parentDocRef = doc(db, 'users', String(targetPid));
          const parentDocSnap = await getDoc(parentDocRef);
          if (parentDocSnap.exists()) parentUserDoc = parentDocSnap;
        } catch {}
        
        // Fallback: query by parentId field
        if (!parentUserDoc) {
          try {
            const q = query(collection(db, 'users'), where('parentId', '==', targetPid));
            const qsnap = await getDocs(q);
            if (!qsnap.empty) parentUserDoc = qsnap.docs[0];
          } catch {}
        }
        
        // CRITICAL: Skip if parent user doesn't exist or is not logged in
        if (!parentUserDoc || !parentUserDoc.exists()) {
          console.log(`⏭️ Skipping alert creation - parent user document ${targetPid} does not exist`);
          continue;
        }
        
        const parentUserData = parentUserDoc.data();
        // Must have: role, uid, fcmToken, and login timestamp
        if (!parentUserData?.role || 
            !parentUserData?.uid || 
            !parentUserData?.fcmToken || 
            (!parentUserData?.lastLoginAt && !parentUserData?.pushTokenUpdatedAt)) {
          console.log(`⏭️ Skipping alert creation - parent ${targetPid} is not logged in (missing: role=${!!parentUserData?.role}, uid=${!!parentUserData?.uid}, fcmToken=${!!parentUserData?.fcmToken}, lastLoginAt=${!!(parentUserData?.lastLoginAt || parentUserData?.pushTokenUpdatedAt)})`);
          continue;
        }
        
        // Verify role is parent
        if (String(parentUserData.role).toLowerCase() !== 'parent') {
          console.log(`⏭️ Skipping alert creation - user ${targetPid} role (${parentUserData.role}) is not parent`);
          continue;
        }
        
        // Verify parentId matches document ID
        const userParentId = parentUserData.parentId || parentUserData.parentIdNumber;
        if (userParentId) {
          const normalizedUserParentId = String(userParentId).replace(/-/g, '').trim().toLowerCase();
          const normalizedTargetPid = String(targetPid).replace(/-/g, '').trim().toLowerCase();
          if (normalizedUserParentId !== normalizedTargetPid) {
            console.log(`⏭️ Skipping alert creation - user ${targetPid} parentId (${userParentId}) doesn't match document ID`);
            continue;
          }
        }
        
        console.log(`✅ Creating alert for logged-in parent ${targetPid} (${parentUserData.uid})`);
        
        // CRITICAL: Verify this parent is actually linked to this student
        const linkInfo = allLinks.get(targetPid);
        if (!linkInfo) {
          console.log(`⏭️ Skipping alert - parent ${targetPid} is not in active links for student ${studentId}`);
          continue;
        }
        
        // Double-check the link is for this specific student
        const linkStudentId = String(linkInfo.data?.studentId || '').trim();
        const linkStudentIdNumber = String(linkInfo.data?.studentIdNumber || '').trim();
        const normalizedLinkStudentId = linkStudentIdNumber || linkStudentId;
        const normalizedCurrentStudentId = String(studentId).trim();
        
        if (normalizedLinkStudentId !== normalizedCurrentStudentId && 
            linkStudentId !== normalizedCurrentStudentId && 
            linkStudentIdNumber !== normalizedCurrentStudentId) {
          console.log(`⏭️ Skipping alert - link studentId (${normalizedLinkStudentId}) doesn't match current studentId (${normalizedCurrentStudentId})`);
          continue;
        }
        
        console.log(`✅ Verified link: parent ${targetPid} is linked to student ${studentId}`);
        
        const notifItem = {
          id: `sched_${studentId}_${type}_${uniqueSuffix}_${targetPid}`, // Include parentId in ID to make it unique per parent
          type,
          title,
          message,
          createdAt: nowIso,
          status: 'unread',
          parentId: targetPid, // Use targetPid (canonical) - MUST match document ID
          studentId: String(studentId),
          studentName: studentName || 'Student',
          subject: subject || null,
          entries: Array.isArray(entries) ? entries : undefined,
        };

        const parentDocRef = doc(db, 'parent_alerts', String(targetPid));
        const parentSnap = await getDoc(parentDocRef);
        const existing = parentSnap.exists && Array.isArray(parentSnap.data()?.items) ? parentSnap.data().items : [];
        
        // Only filter out exact duplicates (same ID) to allow multiple schedule updates for the same subject
        const isExactDuplicate = it => String(it?.id || '') === String(notifItem.id);
        const next = existing.filter(it => !isExactDuplicate(it));
        next.push(notifItem);
        await setDoc(parentDocRef, { items: next }, { merge: true });

        // Send push notification to parent
        try {
          // Get parent's push token from users collection
          // Prefer canonical parent doc id first (users/{canonicalParentId})
          let parentUserDoc = null;
          try {
            const parentDocRef = doc(db, 'users', targetPid);
            const parentDocSnap = await getDoc(parentDocRef);
            if (parentDocSnap.exists()) parentUserDoc = parentDocSnap;
          } catch {}
          // Fallback: query by parentId field
          if (!parentUserDoc) {
            try {
              const q = query(collection(db, 'users'), where('parentId', '==', targetPid));
              const qsnap = await getDocs(q);
              if (!qsnap.empty) parentUserDoc = qsnap.docs[0];
            } catch {}
          }
          
          if (parentUserDoc) {
            const parentUserData = parentUserDoc.data();
            const pushToken = parentUserData?.fcmToken;
            
            console.log(`🔍 Debug - Parent ${pid} data:`, {
              hasFCMToken: !!pushToken,
              tokenLength: pushToken ? pushToken.length : 0,
              userData: { uid: parentUserData?.uid, parentId: parentUserData?.parentId }
            });
            
            if (pushToken) {
              // Push notifications disabled per request; skipping send
            } else {
              console.log(`⚠️ No push token found for parent ${pid}`);
            }
          } else {
            console.log(`⚠️ No parent user found for parentId ${pid}`);
          }
        } catch (pushError) {
          console.error('❌ Failed to send push notification:', pushError);
        }
      }
    } catch (e) {
      console.error('notifyParentsOfScheduleChange error:', e);
    }
  };

  const triggerCurrentClassCheck = async () => {
    try {
      if (!user?.uid) return;
      
      // Import the isNowWithin function logic
      const isNowWithin = (timeRange) => {
        try {
          const raw = String(timeRange || '').trim();
          if (!raw) return false;
          const normalize = (s) => s.replace(/\s+/g, '').toUpperCase();
          const parts = raw.split('-').map(p => p.trim());
          if (parts.length !== 2) return false;
          const parsePart = (p) => {
            const n = normalize(p);
            let m = n.match(/^(\d{1,2}):(\d{2})(AM|PM)$/);
            if (m) return { h: parseInt(m[1],10), min: parseInt(m[2],10), ap: m[3] };
            m = n.match(/^(\d{1,2}):(\d{2})$/);
            if (m) return { h: parseInt(m[1],10), min: parseInt(m[2],10), ap: null };
            m = n.match(/^(\d{1,2})(\d{2})(AM|PM)$/);
            if (m) return { h: parseInt(m[1],10), min: parseInt(m[2],10), ap: m[3] };
            return null;
          };
          const start = parsePart(parts[0]);
          const end = parsePart(parts[1]);
          if (!start || !end) return false;
          const toMinutes = ({ h, min, ap }) => {
            let hh = h;
            if (ap) {
              if (ap === 'PM' && hh !== 12) hh += 12;
              if (ap === 'AM' && hh === 12) hh = 0;
            }
            return hh * 60 + (min || 0);
          };
          const now = new Date();
          const nowMin = now.getHours() * 60 + now.getMinutes();
          const s = toMinutes(start);
          const e = toMinutes(end);
          const grace = 1;
          if (e < s) { return nowMin >= (s - grace) || nowMin <= (e + grace); }
          return nowMin >= (s - grace) && nowMin <= (e + grace);
        } catch { return false; }
      };

      const DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
      const now = new Date();
      const currentDay = DAYS[now.getDay() === 0 ? 6 : now.getDay() - 1];
      
      // Get current schedule
      const sRef = doc(db, 'schedules', String(user.uid));
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
              activeList.push({ subject: subj, time: t, currentKey: `${currentDay}_${subj}_${t}_${todayKey}` });
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
            activeList.push({ subject: subj, time: t, currentKey: `${currentDay}_${subj}_${t}_${todayKey}` });
          }
        }
      }

      if (activeList.length === 0) return;

      // Notify linked parents about current classes
      const linkedParentsRef = doc(db, 'linked_parents', user.studentId);
      const lpSnap = await getDoc(linkedParentsRef);
      if (!lpSnap.exists()) return;
      
      const parents = Array.isArray(lpSnap.data()?.items) ? lpSnap.data().items : [];
      // Resolve to canonical parent IDs and only keep formatted IDs (with hyphen) to avoid creating UID-based docs
      const rawParentIds = Array.from(new Set(parents.map(p => p.parentId || p.id).filter(Boolean)));
      const resolvedCanonIds = [];
      for (const rid of rawParentIds) {
        const canon = await resolveCanonicalParentDocId(rid);
        if (canon && canon.includes('-')) resolvedCanonIds.push(canon);
      }
      const parentIds = Array.from(new Set(resolvedCanonIds));
      
      for (const pid of parentIds) {
        if (!pid || !pid.includes('-')) continue; // safety
        const parentAlertsRef = doc(db, 'parent_alerts', pid);
        const pSnap = await getDoc(parentAlertsRef);
        if (!pSnap.exists()) continue; // do not create new docs here
        const pItems = Array.isArray(pSnap.data()?.items) ? pSnap.data().items : [];
        
        const currentKeys = new Set(activeList.map(a => a.currentKey));
        let pNext = pItems.filter(it => !(it?.type === 'schedule_current' && it?.studentId === user.uid && (!currentKeys.has(String(it.currentKey)) || !isNowWithin(it.time))));
        
        // DISABLED: Duplicate schedule_current creation - handled by AuthContext
        // for (const a of activeList) {
        //   const alreadyParent = pNext.some(it => it?.type === 'schedule_current' && it?.currentKey === a.currentKey && it?.studentId === user.uid);
        //   if (!alreadyParent) {
        //     const studentFirst = (user?.firstName || 'Student').trim();
        //     pNext = [...pNext, {
        //       id: `sched_current_${user.uid}_${Date.now()}_${Math.floor(Math.random()*100000)}`,
        //       type: 'schedule_current',
        //       title: 'Class Happening Now',
        //       message: `${studentFirst}'s ${a.subject} is now (${a.time}).`,
        //       createdAt: new Date().toISOString(),
        //       status: 'unread',
        //       parentId: pid,
        //       studentId: user.uid,
        //       studentName: `${user?.firstName || ''} ${user?.lastName || ''}`.trim() || 'Student',
        //       subject: a.subject,
        //       time: a.time,
        //       currentKey: a.currentKey,
        //     }];
        //   }
        // }
        
        if (JSON.stringify(pNext) !== JSON.stringify(pItems)) {
          await setDoc(parentAlertsRef, { items: pNext }, { merge: true });
        }
      }
    } catch (e) {
      console.log('Trigger current class check failed:', e?.message || e);
    }
  };

  const saveEntry = async (fromConfirmation = false) => {
    let success = false;
    if (!studentId) {
      Alert.alert('Error', 'Student ID is missing.');
      return false;
    }
    if (saving) return false;

    // Check permission if linked to parent
    if (isLinkedToParent && !hasActivePermission) {
      setMenuVisible(false);
      setPermissionRequestVisible(true);
      return false;
    }

    if (!selectedSubject && entryDataList.length===1 && !entryDataList[0].startTime) {
      Alert.alert('Error','Enter subject and at least one time slot');
      return false;
    }

    // Validate that start and end times are not the same
    for (let e of entryDataList) {
      if (!e.startTime || !e.endTime || e.days.length===0) {
        Alert.alert('Error','Each time slot must have start/end time and selected days');
        return false;
      }
      if (!isValidTime(e.startTime) || !isValidTime(e.endTime)) {
        Alert.alert('Invalid Time','Enter a valid HH:MM time (1-12 hours, 0-59 minutes)');
        return false;
      }
      
      // Check if start and end times are the same
      if (e.startTime === e.endTime && e.startAMPM === e.endAMPM) {
        showValidationError('Invalid Schedule', 'Start time and end time cannot be the same. Please set different times.');
        return false;
      }
      
      // Check if end time is before start time (same AM/PM)
      if (e.startAMPM === e.endAMPM) {
        const startHour = parseInt(e.startTime.split(':')[0]);
        const endHour = parseInt(e.endTime.split(':')[0]);
        let adjustedStartHour = startHour === 12 ? 0 : startHour;
        let adjustedEndHour = endHour === 12 ? 0 : endHour;
        
        if (adjustedStartHour > adjustedEndHour) {
          showValidationError('Invalid Schedule', 'End time cannot be before start time. Please set a valid time range.');
          return false;
        }
      }
      
      // Check if start time is PM and end time is AM (invalid)
      if (e.startAMPM === 'PM' && e.endAMPM === 'AM') {
        showValidationError('Invalid Schedule', 'End time cannot be before start time. Please set a valid time range.');
        return false;
      }
    }

    // Enforce subject required and max length (20) before saving
    const subjectForSave = (selectedSubject || entryDataList[0].subject || '').trim().slice(0, 20);
    if (!subjectForSave) {
      Alert.alert('Error', 'Subject name is required.');
      return false;
    }

    // Format times immediately for use in the save operation
    const formattedEntryDataList = entryDataList.map(e => ({
      ...e,
      startTime: formatTime(e.startTime),
      endTime: formatTime(e.endTime)
    }));

    try {
      const ref = doc(db, 'schedules', studentId.toString());
      const studentName = `${user?.firstName || ''} ${user?.lastName || ''}`.trim();
      const subjectsMap = { ...(scheduleDocData?.subjects || {}) };

      // Determine target subject key
      const targetSubject = subjectForSave;
      
      // If editing and subject name changed, we need to handle the rename
      const originalSubject = selectedSubject;
      const isSubjectRenamed = editMode && originalSubject && originalSubject !== targetSubject;

      // Prepare new entries from form using formatted data
      const newEntries = [];
      for (let e of formattedEntryDataList) {
        const formattedTime = `${e.startTime} ${e.startAMPM} - ${e.endTime} ${e.endAMPM}`;
        for (let day of e.days) {
          newEntries.push({ day, time: formattedTime });
        }
      }

      let scheduleEntriesToNotify = [];
      if (editMode) {
        console.log('Edit mode - selectedSubject:', selectedSubject, 'targetSubject:', targetSubject);
        console.log('formattedEntryDataList:', formattedEntryDataList);
        
        // Handle subject renaming if the name changed
        if (isSubjectRenamed) {
          console.log('Subject renamed from', originalSubject, 'to', targetSubject);
          delete subjectsMap[originalSubject];
        } else if (selectedSubject) {
          console.log('Deleting original subject:', selectedSubject);
          delete subjectsMap[selectedSubject];
        }
        
        if (targetSubject) {
          // Convert the formattedEntryDataList format to the storage format
          const dayToTime = {};
          formattedEntryDataList.forEach(entry => {
            const formattedTime = `${entry.startTime} ${entry.startAMPM} - ${entry.endTime} ${entry.endAMPM}`;
            entry.days.forEach(day => {
              dayToTime[day] = formattedTime;
            });
          });
          const merged = Object.keys(dayToTime).map(day => ({ day, time: dayToTime[day] }));
          console.log('Merged entries for', targetSubject, ':', merged);
          subjectsMap[targetSubject] = merged;
          scheduleEntriesToNotify = merged;
        }
      } else {
        // Add or merge entries for a subject, ensuring only one time slot per day
        const existing = Array.isArray(subjectsMap[targetSubject]) ? subjectsMap[targetSubject] : [];
        
        // Create a map to track the latest time for each day
        const dayToTime = {};
        
        // First, add existing entries to the map
        existing.forEach(entry => {
          dayToTime[entry.day] = entry.time;
        });
        
        // Then, add new entries, overwriting any existing day with the new time
        newEntries.forEach(entry => {
          dayToTime[entry.day] = entry.time;
        });
        
        // Convert back to array format
        const merged = Object.keys(dayToTime).map(day => ({ day, time: dayToTime[day] }));
        subjectsMap[targetSubject] = merged;
        scheduleEntriesToNotify = merged;
      }

      // Global conflict detection across all subjects: prevent overlapping time ranges on the same day
      try {
        const toRange = (timeStr) => {
          try {
            const parts = String(timeStr || '').split(' - ');
            if (parts.length !== 2) return null;
            const [sTime, sAmpm] = parts[0].trim().split(' ');
            const [eTime, eAmpm] = parts[1].trim().split(' ');
            const s = timeToNumber(String(sTime || ''), String(sAmpm || 'AM'));
            const e = timeToNumber(String(eTime || ''), String(eAmpm || 'PM'));
            return { start: s, end: e };
          } catch { return null; }
        };

        // Gather all ranges by day across all subjects
        const dayToRanges = {};
        Object.keys(subjectsMap).forEach(sub => {
          const entries = Array.isArray(subjectsMap[sub]) ? subjectsMap[sub] : [];
          entries.forEach(en => {
            const r = toRange(en?.time);
            if (!r) return;
            const key = String(en?.day || '');
            if (!dayToRanges[key]) dayToRanges[key] = [];
            dayToRanges[key].push({ ...r, subject: sub, raw: en?.time });
          });
        });

        // Check for overlaps within each day across different subjects
        const hasOverlap = Object.keys(dayToRanges).some(day => {
          const list = dayToRanges[day].sort((a,b) => a.start - b.start);
          for (let i = 0; i < list.length; i++) {
            for (let j = i + 1; j < list.length; j++) {
              const a = list[i];
              const b = list[j];
              if (a.subject === b.subject) continue; // within a subject we already restrict per-day
              // overlap if starts before other's end and ends after other's start
              if (a.start < b.end && a.end > b.start) {
                return true;
              }
            }
          }
          return false;
        });

        if (hasOverlap) {
          showValidationError('Schedule Conflict', 'This change creates overlapping schedules on the same day across subjects. Adjust times to avoid conflicts.');
          return false; // block save
        }
      } catch {}

      // Conflict detection: restrict if resulting schedule would create multiple "Happening Now" entries
      try {
        const now = new Date();
        const DAYS_LOCAL = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
        const currentDay = DAYS_LOCAL[now.getDay() === 0 ? 6 : now.getDay() - 1];
        let activeCount = 0;
        Object.keys(subjectsMap).forEach(sub => {
          const entries = Array.isArray(subjectsMap[sub]) ? subjectsMap[sub] : [];
          entries.forEach(e => {
            if (e?.day === currentDay && isCurrentlyActive(String(e?.time || ''), currentDay)) {
              activeCount += 1;
            }
          });
        });
        if (activeCount > 1) {
          showValidationError('Schedule Conflict', 'This change would create multiple ongoing schedules right now. Adjust times to avoid conflicts.');
          return false; // block save
        }
      } catch {}

      // Check internet connection before proceeding
      if (!isConnected) {
        showErrorModal('No internet connection. Please check your network and try again.');
        return false;
      }

      setSaving(true);
      
      // Create a timeout promise that rejects after 10 seconds
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Operation timed out. Please check your internet connection and try again.')), 10000);
      });
      
      // Create the actual operation promise
      const operationPromise = (async () => {
        console.log('Final subjectsMap before saving:', subjectsMap);
        await setDoc(ref, { studentId, studentName, subjects: subjectsMap, updatedAt: new Date().toISOString() }, { merge: true });
      })();
      
      // Race between operation and timeout
      try {
        await Promise.race([operationPromise, timeoutPromise]);
      } catch (timeoutError) {
        setSaving(false);
        if (timeoutError.message?.includes('timed out')) {
          showErrorModal('Operation timed out. Please check your internet connection and try again.');
        } else {
          throw timeoutError; // Re-throw if it's not a timeout error
        }
        return false;
      }

      // Send push notifications to linked parents
      try {
        await notifyParentsOfScheduleChange(editMode ? 'schedule_updated' : 'schedule_added', studentId, selectedSubject, entryDataList, user?.firstName || 'Student');
      } catch (error) {
        console.error('Failed to send push notifications:', error);
      }

      if (!fromConfirmation) {
        setModalVisible(false);
        resetEntryData();
      }
      await fetchSchedule();
      showFeedback({
        title: editMode ? 'Schedule Updated' : 'Schedule Added',
        message: editMode ? 'Your changes have been saved.' : 'Your schedule has been saved.',
        icon: editMode ? 'create-outline' : 'add-circle-outline',
        bg: '#EFF6FF',
        color: '#2563EB'
      });
      success = true;

      // Notify linked parents about the new/updated schedule in parent_alerts
      try {
        console.log('🔔 Starting parent notification process...');
        console.log('🔔 Notification ref current state:', notifyingRef.current);
        if (notifyingRef.current) { 
          console.log('🔔 Notification already in progress, skipping...');
          return; 
        }
        notifyingRef.current = true;
        const studentUid = user?.uid;
        console.log('🔔 Student UID:', studentUid);
        console.log('🔔 Schedule entries:', scheduleEntriesToNotify);
        console.log('🔔 Target subject:', targetSubject);
        console.log('🔔 Edit mode:', editMode);
        if (studentUid && Array.isArray(scheduleEntriesToNotify) && targetSubject) {
          // Query parent_student_links for active relationships
          const linksQuery = query(
            collection(db, 'parent_student_links'),
            where('studentId', '==', studentUid),
            where('status', '==', 'active')
          );
          const linksSnapshot = await getDocs(linksQuery);
          console.log('🔔 Found active parent-student links:', linksSnapshot.size);
          console.log('🔔 Links query docs:', linksSnapshot.docs.map(d => ({ id: d.id, data: d.data() })));
          
          if (!linksSnapshot.empty) {
            // Collect parent IDs from the links and resolve to canonical IDs
            const rawParentIds = Array.from(new Set(
              linksSnapshot.docs
                .map(doc => doc.data()?.parentId)
                .filter(Boolean)
                .map(String)
            ));
            console.log('🔔 Raw parent IDs from links:', rawParentIds);
            
            // Resolve each parent UID to canonical parent ID
            const parentIds = [];
            for (const rawParentId of rawParentIds) {
              try {
                const canonicalParentId = await resolveCanonicalParentDocId(rawParentId);
                if (canonicalParentId && canonicalParentId.includes('-')) {
                  parentIds.push(canonicalParentId);
                  console.log('🔔 Resolved parent ID:', rawParentId, '->', canonicalParentId);
                } else {
                  console.log('🔔 Could not resolve canonical parent ID for:', rawParentId);
                }
              } catch (error) {
                console.log('🔔 Error resolving parent ID:', rawParentId, error);
              }
            }
            console.log('🔔 Parent IDs to notify:', parentIds);
            console.log('🔔 Parent IDs details:', parentIds.map(pid => ({ id: pid, hasDash: pid.includes('-'), length: pid.length })));
            const studentDisplay = studentName || 'Student';
            const meta = await resolveStudentMeta(studentUid, studentDisplay, user?.gender);
            console.log('🔔 Student meta:', meta);
            for (const pid of parentIds) {
              console.log('🔔 Processing parent ID:', pid, 'Type:', typeof pid, 'Has dash:', pid.includes('-'));
              const uniqueSuffix = `${Date.now()}_${Math.floor(Math.random()*1000000)}`;
              const notifType = editMode ? 'schedule_updated' : 'schedule_added';
              const notifTitle = editMode ? 'Schedule Updated' : 'Schedule Added';
              const notifMessage = editMode
                ? `${meta.firstName} updated ${targetSubject} in ${meta.pronoun} schedule.`
                : `${meta.firstName} added ${targetSubject} to ${meta.pronoun} schedule.`;
              const notifItem = {
                id: `sched_${studentUid}_${notifType}_${uniqueSuffix}`,
                type: notifType,
                title: notifTitle,
                message: notifMessage,
                createdAt: new Date().toISOString(),
                status: 'unread',
                parentId: pid,
                studentId: studentUid,
                studentName: meta.displayName,
                subject: targetSubject,
                entries: scheduleEntriesToNotify, // [{day, time}]
              };
              console.log('🔔 Creating notification for parent:', pid, 'Item:', notifItem);
              if (!pid || !pid.includes('-')) continue; // safety
              const parentDocRef = doc(db, 'parent_alerts', pid);
              const parentSnap = await getDoc(parentDocRef);
              if (parentSnap.exists()) {
                console.log('🔔 Parent alerts doc exists for:', pid);
                const existing = Array.isArray(parentSnap.data()?.items) ? parentSnap.data().items : [];
                console.log('🔔 Existing items count:', existing.length);
                // Only filter out exact duplicates (same ID) to allow multiple schedule updates for the same subject
                const isExactDuplicate = (it) => String(it?.id || '') === String(notifItem.id);
                const next = existing.filter(it => !isExactDuplicate(it));
                next.push(notifItem);
                await setDoc(parentDocRef, { items: next }, { merge: true });
                console.log('🔔 Wrote de-duplicated', notifType, 'for parent:', pid);
              } else {
                console.log('🔔 Parent alerts doc missing for:', pid, 'creating new one');
                // If doc missing, create it with the first notification item
                await setDoc(parentDocRef, { items: [notifItem] }, { merge: true });
                console.log('🔔 Created parent_alerts doc and wrote', notifType, 'for parent:', pid);
              }
            }
          } else {
            console.log('🔔 No active parent-student links found for student:', studentUid);
          }
        } else {
          console.log('🔔 Missing required data for notification:', { studentUid, scheduleEntriesToNotify, targetSubject });
        }
      } catch (e) {
        // best-effort, avoid blocking UX
        console.log('🔔 Schedule notify parents failed:', e?.message || e);
        console.log('🔔 Error stack:', e?.stack);
      } finally { 
        notifyingRef.current = false; 
        console.log('🔔 Notification process completed');
      }
      
      // Trigger current class detection after schedule update
      try {
        await triggerCurrentClassCheck();
      } catch (e) {
        console.log('Current class check failed:', e?.message || e);
      }
    } catch(err) {
      setSaving(false);
      // Check if it's a network/connection error or timeout
      if (!isConnected || isFirestoreConnectionError(err) || err.message?.includes('timed out')) {
        showErrorModal('No internet connection or connection timeout. Please check your network and try again.');
      } else {
        Alert.alert('Error', err.message);
      }
      return false;
    } finally {
      setSaving(false);
    }
    return success;
  };

  const deleteSelectedSubject = async () => {
    if (!studentId || !selectedSubject) return;
    
    // Check permission if linked to parent
    if (isLinkedToParent && !hasActivePermission) {
      setDeleteModalVisible(false);
      setPermissionRequestVisible(true);
      return;
    }
    
    // Check internet connection before proceeding
    if (!isConnected) {
      showErrorModal('No internet connection. Please check your network and try again.');
      return;
    }
    
    setDeleting(true);
    try {
      const ref = doc(db, 'schedules', studentId.toString());
      
      // Create a timeout promise that rejects after 10 seconds
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Operation timed out. Please check your internet connection and try again.')), 10000);
      });
      
      // Create the actual operation promise
      const operationPromise = (async () => {
        const snap = await getDoc(ref);
        const existing = snap.exists() ? (snap.data()?.subjects || {}) : {};
        if (!(selectedSubject in existing)) {
          throw new Error('Subject no longer exists.');
        }
        // Capture entries before deletion for notification context
        const deletedEntries = Array.isArray(existing[selectedSubject]) ? existing[selectedSubject] : [];
        // Use updateDoc with field delete to remove nested subject key
        await updateDoc(ref, { [`subjects.${selectedSubject}`]: deleteField(), updatedAt: new Date().toISOString() });
        return deletedEntries;
      })();
      
      // Race between operation and timeout
      let deletedEntries;
      try {
        deletedEntries = await Promise.race([operationPromise, timeoutPromise]);
      } catch (timeoutError) {
        setDeleting(false);
        if (timeoutError.message?.includes('timed out')) {
          showErrorModal('Operation timed out. Please check your internet connection and try again.');
        } else if (timeoutError.message?.includes('Subject no longer exists')) {
          showFeedback({ title: 'Not Found', message: 'Subject no longer exists.', icon: 'alert-circle-outline', bg: '#FEF3C7', color: '#F59E0B' });
        } else {
          throw timeoutError; // Re-throw if it's not a timeout or expected error
        }
        return;
      }
      
      setModalVisible(false);
      resetEntryData();
      await fetchSchedule();
      showFeedback({
        title: 'Schedule Deleted',
        message: 'The schedule was removed successfully.',
        icon: 'trash-outline',
        bg: '#FEE2E2',
        color: '#b91c1c'
      });

      // Notify linked parents about the deleted schedule
      try {
        console.log('🗑️ Starting delete notification process...');
        if (notifyingRef.current) { 
          console.log('🗑️ Delete notification already in progress, skipping...');
          return; 
        }
        notifyingRef.current = true;
        const studentUid = user?.uid;
        console.log('🗑️ Delete notification - Student UID:', studentUid, 'Selected subject:', selectedSubject);
        const studentDisplay = `${user?.firstName || ''} ${user?.lastName || ''}`.trim() || 'Student';
        const meta = await resolveStudentMeta(studentUid, studentDisplay, user?.gender);
        console.log('Delete notification - Student meta:', meta);
        if (studentUid) {
          // Query parent_student_links for active relationships
          const linksQuery = query(
            collection(db, 'parent_student_links'),
            where('studentId', '==', studentUid),
            where('status', '==', 'active')
          );
          const linksSnapshot = await getDocs(linksQuery);
          console.log('Delete notification - Found active parent-student links:', linksSnapshot.size);
          
          if (!linksSnapshot.empty) {
            // Collect parent IDs from the links and resolve to canonical IDs
            const rawParentIds = Array.from(new Set(
              linksSnapshot.docs
                .map(doc => doc.data()?.parentId)
                .filter(Boolean)
                .map(String)
            ));
            console.log('🗑️ Raw parent IDs from links:', rawParentIds);
            
            // Resolve each parent UID to canonical parent ID
            const parentIds = [];
            for (const rawParentId of rawParentIds) {
              try {
                const canonicalParentId = await resolveCanonicalParentDocId(rawParentId);
                if (canonicalParentId && canonicalParentId.includes('-')) {
                  parentIds.push(canonicalParentId);
                  console.log('🗑️ Resolved parent ID:', rawParentId, '->', canonicalParentId);
                } else {
                  console.log('🗑️ Could not resolve canonical parent ID for:', rawParentId);
                }
              } catch (error) {
                console.log('🗑️ Error resolving parent ID:', rawParentId, error);
              }
            }
            console.log('🗑️ Delete notification - Parent IDs to notify:', parentIds);
            for (const pid of parentIds) {
              if (!pid || !pid.includes('-')) continue; // safety
              const uniqueSuffix = `${Date.now()}_${Math.floor(Math.random()*1000000)}`;
              const notifItem = {
                id: `sched_${studentUid}_schedule_deleted_${uniqueSuffix}`,
                type: 'schedule_deleted',
                title: 'Schedule Deleted',
                message: `${meta.firstName} deleted ${selectedSubject} from ${meta.pronoun} schedule.`,
                createdAt: new Date().toISOString(),
                status: 'unread',
                parentId: pid,
                studentId: studentUid,
                studentName: meta.displayName,
                subject: selectedSubject,
                entries: deletedEntries,
              };
              console.log('Delete notification - Creating for parent:', pid, 'Item:', notifItem);
              const parentDocRef = doc(db, 'parent_alerts', pid);
              const parentSnap = await getDoc(parentDocRef);
              if (parentSnap.exists()) {
                const existing = Array.isArray(parentSnap.data()?.items) ? parentSnap.data().items : [];
                const isSameLogical = (it) => it?.type === 'schedule_deleted' && String(it?.studentId) === String(studentUid) && String(it?.subject) === String(selectedSubject);
                const next = existing.filter(it => !isSameLogical(it));
                next.push(notifItem);
                await setDoc(parentDocRef, { items: next }, { merge: true });
                console.log('Delete notification - Wrote de-duplicated schedule_deleted for:', pid);
              } else {
                // Create if missing so deletion notices are not lost
                await setDoc(parentDocRef, { items: [notifItem] }, { merge: true });
                console.log('Delete notification - Created parent_alerts doc and wrote schedule_deleted for:', pid);
              }

              // Send push notification to parent
              try {
                // Get parent's push token from users collection
                // First try to find by parentId field
                let parentUserQuery = query(collection(db, 'users'), where('parentId', '==', pid));
                let parentUserSnap = await getDocs(parentUserQuery);
                
                // If not found, try to find by document ID (since parentId might be the doc ID)
                if (parentUserSnap.empty) {
                  try {
                    const parentDocRef = doc(db, 'users', pid);
                    const parentDocSnap = await getDoc(parentDocRef);
                    if (parentDocSnap.exists()) {
                      parentUserSnap = { docs: [parentDocSnap], empty: false };
                    }
                  } catch (docError) {
                    console.log('Error fetching parent doc by ID:', docError);
                  }
                }
                
                if (!parentUserSnap.empty) {
                  const parentUserData = parentUserSnap.docs[0].data();
                  const pushToken = parentUserData?.fcmToken;
                  
                  console.log(`🔍 Debug - Delete notification for parent ${pid}:`, {
                    hasFCMToken: !!pushToken,
                    tokenLength: pushToken ? pushToken.length : 0,
                    userData: { uid: parentUserData?.uid, parentId: parentUserData?.parentId }
                  });
                  
            if (pushToken) {
              // Push notifications disabled per request; skipping send
            } else {
                    console.log(`⚠️ No push token found for parent ${pid}`);
                  }
                } else {
                  console.log(`⚠️ No parent user found for parentId ${pid}`);
                }
              } catch (pushError) {
                console.error('❌ Failed to send push notification:', pushError);
              }
            }
          } else {
            console.log('Delete notification - No active parent-student links found for student:', studentUid);
          }
        } else {
          console.log('Delete notification - No student UID available');
        }
      } catch (e) { 
        console.log('Schedule delete notify parents failed:', e?.message || e); 
      } finally { 
        notifyingRef.current = false; 
        console.log('Delete notification process completed');
      }
    } catch(err) {
      setDeleting(false);
      setDeletingConfirm(false);
      // Check if it's a network/connection error or timeout
      if (!isConnected || isFirestoreConnectionError(err) || err.message?.includes('timed out')) {
        showErrorModal('No internet connection or connection timeout. Please check your network and try again.');
      } else {
        Alert.alert('Error', err.message);
      }
      return false;
    } finally { 
      setDeleting(false); 
      setDeletingConfirm(false); 
    }
    return true;
  };

  // removed conflict proceed (restriction enforced)

  const resetEntryData = () => {
    setEntryDataList([{ startTime:'', startAMPM:'AM', endTime:'', endAMPM:'AM', days:[], subject:'' }]);
    setSelectedSubject('');
    setEditMode(false);
  };

  const getEntries = (day, subject) => {
    const entries = schedule.filter(s => s.day === day && s.subject === subject);
    return entries.sort((a,b) =>
      timeToNumber(a.time.split(' - ')[0].split(' ')[0], a.time.split(' - ')[0].split(' ')[1]) -
      timeToNumber(b.time.split(' - ')[0].split(' ')[0], b.time.split(' - ')[0].split(' ')[1])
    );
  };

  const subjects = [...new Set(schedule.map(s => s.subject))];
  const normalizeSubject = (s) => (s || '').toString().trim().toLowerCase();
  const currentSubjectInput = (entryDataList?.[0]?.subject || '').toString();
  const isDuplicateSubject = !editMode && currentSubjectInput.trim().length > 0 && subjects.map(normalizeSubject).includes(normalizeSubject(currentSubjectInput));
  const isSubjectEmpty = !editMode && currentSubjectInput.trim().length === 0;
  // Check if entries have valid values (days, start time, end time)
  // ALL entries must be valid - if ANY entry is incomplete, disable save
  const hasInvalidEntries = !entryDataList || entryDataList.length === 0 || entryDataList.some(entry => {
    if (!entry || typeof entry !== 'object') return true; // Invalid entry object
    const hasDays = Array.isArray(entry.days) && entry.days.length > 0;
    const hasStartTime = String(entry.startTime || '').trim().length > 0;
    const hasEndTime = String(entry.endTime || '').trim().length > 0;
    // Entry is invalid if it's missing any required field
    return !(hasDays && hasStartTime && hasEndTime);
  });
  const disableSave = saving || isSubjectEmpty || isDuplicateSubject || hasInvalidEntries;
  const areEntryListsEqual = (a, b) => {
    try {
      if (!Array.isArray(a) || !Array.isArray(b)) return false;
      const sanitize = (list) => (Array.isArray(list) ? list : []).filter(e => {
        const hasDays = Array.isArray(e.days) && e.days.length > 0;
        const hasTimes = String(e.startTime || '').length > 0 && String(e.endTime || '').length > 0;
        return hasDays && hasTimes;
      });
      const aSan = sanitize(a);
      const bSan = sanitize(b);
      const norm = (list) => list.map(e => ({
        startTime: String(e.startTime || ''),
        startAMPM: String(e.startAMPM || ''),
        endTime: String(e.endTime || ''),
        endAMPM: String(e.endAMPM || ''),
        days: Array.isArray(e.days) ? [...e.days].sort() : []
      })).sort((x, y) => (x.startTime + x.startAMPM + x.endTime + x.endAMPM + x.days.join(','))
        .localeCompare(y.startTime + y.startAMPM + y.endTime + y.endAMPM + y.days.join(',')));
      const na = norm(aSan);
      const nb = norm(bSan);
      if (na.length !== nb.length) return false;
      return JSON.stringify(na) === JSON.stringify(nb);
    } catch { return false; }
  };
  const hasChanges = editMode ? !areEntryListsEqual(entryDataList, originalEntryList) : true;
  useEffect(() => {
    if (editMode && selectedSubject) {
      setHasEditChanges(hasChanges);
    } else {
      setHasEditChanges(false);
    }
  }, [editMode, selectedSubject, entryDataList, originalEntryList]);
  // Check if entries have valid values (days, start time, end time) for edit mode
  // ALL entries must be valid - if ANY entry is incomplete, disable update
  const hasInvalidEntriesEdit = editMode && (!entryDataList || entryDataList.length === 0 || entryDataList.some(entry => {
    if (!entry || typeof entry !== 'object') return true; // Invalid entry object
    const hasDays = Array.isArray(entry.days) && entry.days.length > 0;
    const hasStartTime = String(entry.startTime || '').trim().length > 0;
    const hasEndTime = String(entry.endTime || '').trim().length > 0;
    // Entry is invalid if it's missing any required field
    return !(hasDays && hasStartTime && hasEndTime);
  }));
  const disableUpdate = saving || !selectedSubject || !hasEditChanges || hasInvalidEntriesEdit;

  const toggleSelectForDeletion = (subject) => {
    setSelectedForDeletion(prev => prev.includes(subject)
      ? prev.filter(s => s !== subject)
      : [...prev, subject]);
  };

  const confirmDeleteSubjects = async (subjectsToDelete = selectedForDeletion) => {
    if (!studentId || !subjectsToDelete.length) return false;
    
    // Check permission if linked to parent
    if (isLinkedToParent && !hasActivePermission) {
      setDeleteModalVisible(false);
      setPermissionRequestVisible(true);
      return false;
    }
    
    // Check internet connection before proceeding
    if (!isConnected) {
      showErrorModal('No internet connection. Please check your network and try again.');
      return false;
    }
    
    setDeleting(true);
    try {
      const ref = doc(db, 'schedules', studentId.toString());
      
      // Create a timeout promise that rejects after 10 seconds
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Operation timed out. Please check your internet connection and try again.')), 10000);
      });
      
      // Create the actual operation promise
      const operationPromise = (async () => {
        const snap = await getDoc(ref);
        const existing = snap.exists() ? (snap.data()?.subjects || {}) : {};
        // Use updateDoc with field deletes for each selected subject key
        const updatePayload = { updatedAt: new Date().toISOString() };
        subjectsToDelete.forEach(s => { updatePayload[`subjects.${s}`] = deleteField(); });
        await updateDoc(ref, updatePayload);
        return existing;
      })();
      
      // Race between operation and timeout
      let existingData;
      try {
        existingData = await Promise.race([operationPromise, timeoutPromise]);
      } catch (timeoutError) {
        setDeleting(false);
        if (timeoutError.message?.includes('timed out')) {
          showErrorModal('Operation timed out. Please check your internet connection and try again.');
        } else {
          throw timeoutError; // Re-throw if it's not a timeout error
        }
        return false;
      }
      
      // Refresh the schedule data
      await fetchSchedule();
      
      // Show success message
      showFeedback({
        title: 'Schedules Deleted',
        message: 'Selected schedules were removed.',
        icon: 'trash-outline',
        bg: '#FEE2E2',
        color: '#b91c1c'
      });

      // Notify linked parents for each deleted subject
      try {
        console.log('Starting bulk delete notification process...');
        if (notifyingRef.current) { 
          console.log('Bulk delete notification already in progress, skipping...');
          return; 
        }
        notifyingRef.current = true;
        const studentUid = user?.uid;
        console.log('Bulk delete notification - Student UID:', studentUid, 'Selected subjects:', subjectsToDelete);
        const studentDisplay = `${user?.firstName || ''} ${user?.lastName || ''}`.trim() || 'Student';
        const meta = await resolveStudentMeta(studentUid, studentDisplay, user?.gender);
        console.log('Bulk delete notification - Student meta:', meta);
        if (studentUid) {
          // Query parent_student_links for active relationships
          const linksQuery = query(
            collection(db, 'parent_student_links'),
            where('studentId', '==', studentUid),
            where('status', '==', 'active')
          );
          const linksSnapshot = await getDocs(linksQuery);
          console.log('Bulk delete notification - Found active parent-student links:', linksSnapshot.size);
          
          if (!linksSnapshot.empty) {
            // Collect parent IDs from the links and resolve to canonical IDs
            const rawParentIds = Array.from(new Set(
              linksSnapshot.docs
                .map(doc => doc.data()?.parentId)
                .filter(Boolean)
                .map(String)
            ));
            console.log('🗑️ Bulk delete - Raw parent IDs from links:', rawParentIds);
            
            // Resolve each parent UID to canonical parent ID
            const parentIds = [];
            for (const rawParentId of rawParentIds) {
              try {
                const canonicalParentId = await resolveCanonicalParentDocId(rawParentId);
                if (canonicalParentId && canonicalParentId.includes('-')) {
                  parentIds.push(canonicalParentId);
                  console.log('🗑️ Bulk delete - Resolved parent ID:', rawParentId, '->', canonicalParentId);
                } else {
                  console.log('🗑️ Bulk delete - Could not resolve canonical parent ID for:', rawParentId);
                }
              } catch (error) {
                console.log('🗑️ Bulk delete - Error resolving parent ID:', rawParentId, error);
              }
            }
            console.log('🗑️ Bulk delete notification - Parent IDs to notify:', parentIds);
            for (const subjectName of subjectsToDelete) {
              const deletedEntries = Array.isArray(existingData[subjectName]) ? existingData[subjectName] : [];
              console.log('Bulk delete notification - Processing subject:', subjectName, 'Entries:', deletedEntries);
              for (const pid of parentIds) {
                if (!pid || !pid.includes('-')) continue; // safety
                const uniqueSuffix = `${Date.now()}_${Math.floor(Math.random()*1000000)}`;
                const notifItem = {
                  id: `sched_${studentUid}_schedule_deleted_${uniqueSuffix}`,
                  type: 'schedule_deleted',
                  title: 'Schedule Deleted',
                  message: `${meta.firstName} deleted ${subjectName} from ${meta.pronoun} schedule.`,
                  createdAt: new Date().toISOString(),
                  status: 'unread',
                  parentId: pid,
                  studentId: studentUid,
                  studentName: meta.displayName,
                  subject: subjectName,
                  entries: deletedEntries,
                };
                console.log('Bulk delete notification - Creating for parent:', pid, 'Subject:', subjectName, 'Item:', notifItem);
                const parentDocRef = doc(db, 'parent_alerts', pid);
                const parentSnap = await getDoc(parentDocRef);
                if (parentSnap.exists()) {
                  const existing = Array.isArray(parentSnap.data()?.items) ? parentSnap.data().items : [];
                  const isSameLogical = (it) => it?.type === 'schedule_deleted' && String(it?.studentId) === String(studentUid) && String(it?.subject) === String(subjectName);
                  const next = existing.filter(it => !isSameLogical(it));
                  next.push(notifItem);
                  await setDoc(parentDocRef, { items: next }, { merge: true });
                  console.log('Bulk delete notification - Wrote de-duplicated schedule_deleted for:', pid);
                } else {
                  // Avoid creating new parent alerts doc here
                  console.log('Bulk delete notification - Parent alerts doc missing for:', pid, 'Skipping creation.');
                }
              }
            }
          } else {
            console.log('Bulk delete notification - No active parent-student links found for student:', studentUid);
          }
        } else {
          console.log('Bulk delete notification - No student UID available');
        }
      } catch (e) { 
        console.log('Bulk schedule delete notify parents failed:', e?.message || e); 
      } finally { 
        notifyingRef.current = false; 
        console.log('Bulk delete notification process completed');
      }
      return true;
    } catch(err) {
      setDeleting(false);
      // Check if it's a network/connection error or timeout
      if (!isConnected || isFirestoreConnectionError(err) || err.message?.includes('timed out')) {
        showErrorModal('No internet connection or connection timeout. Please check your network and try again.');
      } else {
        Alert.alert('Error', err.message);
      }
      return false;
    } finally {
      setDeleting(false);
    }
  };

  // Calculate responsive dimensions
  const { width: screenWidth, height: screenHeight } = screenData;
  const isSmallScreen = screenWidth < 400;
  const isLandscape = screenWidth > screenHeight;
  
  // Wider cells so time ranges like "HH:MM AM - HH:MM PM" fit without wrapping
  const cellWidth = isSmallScreen ? 120 : 140;
  const cellHeight = isSmallScreen ? 80 : 100;
  const tableHeight = Math.min(screenHeight * 0.6, 500); // Max 60% of screen height or 500

  const dynamicStyles = {
    cell: {
      width: isSmallScreen ? 75 : 85,
      height: isSmallScreen ? 60 : 70,
      borderWidth: 1.5,
      borderColor: '#E5E7EB',
      justifyContent: 'center',
      alignItems: 'center'
    },
    headerText: {
      fontWeight: '700',
      color: '#ffffff',
      fontSize: isSmallScreen ? 8 : 9,
      textAlign: 'center'
    },
    subjectText: {
      fontWeight: '600',
      color: '#111827',
      fontSize: isSmallScreen ? 8 : 9,
      textAlign: 'center',
      paddingHorizontal: 2,
      flexShrink: 1
    },
    entryText: {
      color: '#fff',
      fontWeight: '600',
      textAlign: 'center',
      fontSize: isSmallScreen ? 7 : 8,
      paddingHorizontal: 2,
      maxWidth: '100%',
      flexWrap: 'wrap'
    },
    modalContainer: {
      backgroundColor: '#fff',
      borderTopLeftRadius: 16,
      borderTopRightRadius: 16,
      padding: 20,
      maxHeight: screenHeight * 0.9,
      minHeight: screenHeight * 0.4
    },
    dayButton: {
      paddingVertical: isSmallScreen ? 3 : 4,
      paddingHorizontal: isSmallScreen ? 6 : 8,
      borderRadius: 999,
      marginRight: isSmallScreen ? 1 : 2,
      minWidth: undefined
    }
  };



  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good Morning';
    if (hour < 18) return 'Good Afternoon';
    return 'Good Evening';
  };


  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: '#FFFFFF' }} />
    );
  }

  return (
    <>
    <View style={styles.wrapper}>
      <ScrollView contentContainerStyle={styles.container}>
        {subjects.length > 0 && (
          <>
            {/* Legend in its own container */}
            <View style={styles.legendContainer}>
              <View style={styles.legendRow}>
                <View style={[styles.legendChip, { backgroundColor: UNIVERSAL_HEADER_COLOR }]} />
                <Text style={styles.legendText}>Scheduled</Text>
                <View style={[styles.legendChip, { backgroundColor: '#DC2626' }]} />
                <Text style={styles.legendText}>Happening Now</Text>
              </View>
            </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={true} persistentScrollbar={true} style={styles.tableScrollContainer}>
            <View style={styles.tableContainer}>
              <View style={styles.row}>
                <View style={[dynamicStyles.cell, styles.headerCell, { width: isSmallScreen ? 90 : 100 }]}>
                  <Text style={dynamicStyles.headerText}>Subject</Text>
                </View>
                {DAYS.map(d => (
                  <View key={d} style={[dynamicStyles.cell, styles.headerCell]}><Text style={dynamicStyles.headerText}>{d.slice(0,3)}</Text></View>
                ))}
              </View>
              <View>
                {subjects.map((subject, rowIndex) => (
                  <View key={subject || `row-${rowIndex}`} style={styles.row}>
                    <View style={[dynamicStyles.cell, styles.subjectCell, { width: isSmallScreen ? 90 : 100 }]}>
                      <Text style={dynamicStyles.subjectText} numberOfLines={2}>{subject || '-'}</Text>
                    </View>
                    {DAYS.map(day => {
                      const entry = schedule.find(s => s.day === day && s.subject === subject);
                      if (!entry) {
                        return (
                          <View key={day} style={[dynamicStyles.cell, { backgroundColor: '#fff', paddingHorizontal: 4, justifyContent: 'center', alignItems: 'center', paddingVertical: 4 }]}>
                            <Text style={[dynamicStyles.entryText, { color: '#9CA3AF' }]}>-</Text>
                          </View>
                        );
                      }
                      const active = isCurrentlyActive(entry.time, day);
                      return (
                        <View key={day} style={[dynamicStyles.cell, { backgroundColor: '#fff', paddingHorizontal: 4, justifyContent: 'center', alignItems: 'center', paddingVertical: 4 }]}>
                          <View style={[styles.entryPill, { backgroundColor: active ? '#DC2626' : UNIVERSAL_HEADER_COLOR, marginVertical: 2 }]}>
                            <Text style={dynamicStyles.entryText}>{entry.time}</Text>
                          </View>
                        </View>
                      );
                    })}
                  </View>
                ))}
              </View>
            </View>
          </ScrollView>
          </>
        )}

      {/* Empty state */}
      {subjects.length === 0 && (
        <View style={styles.centerContainer}>
          <View style={styles.emptyCard}>
            <View style={styles.emptyIconWrap}>
              <View style={{ position: 'relative', width: 28, height: 28, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="calendar-outline" size={28} color="#2563EB" />
                <View style={{ position: 'absolute', width: 32, height: 2, backgroundColor: '#2563EB', transform: [{ rotate: '45deg' }] }} />
              </View>
            </View>
            <Text style={styles.emptyTitle}>Schedules Unavailable</Text>
            <Text style={styles.emptySubtext}>
              You need to create your class schedule to view your weekly timetable. Add your subjects and class times to start tracking your schedule.
            </Text>
          </View>
        </View>
      )}

      {/* Add/Edit Modal */}
      <Modal visible={modalVisible} transparent animationType="fade" onRequestClose={()=>setModalVisible(false)}>
        <View style={styles.modernModalOverlay}>
          <View style={[styles.modernModalCard, { 
            maxHeight: screenHeight * 0.85, 
            minHeight: entryDataList.length === 1 ? screenHeight * 0.45 : screenHeight * 0.5, 
            height: entryDataList.length === 1 ? screenHeight * 0.55 : screenHeight * 0.7 
          }]}>
            <View style={styles.modernModalHeader}>
              <View style={[styles.modernHeaderGradient, { backgroundColor: editMode ? UNIVERSAL_HEADER_COLOR : DARK_GREEN }]}>
                <View style={styles.modernHeaderContent}>
                  <View style={styles.modernAvatar}>
                    <View style={styles.avatarOctagonMedium} />
                    <Ionicons 
                      name={editMode ? "create-outline" : "add-circle-outline"} 
                      size={24} 
                      color="#FFFFFF" 
                    />
                  </View>
                  <View style={styles.modernHeaderInfo}>
                    <Text style={styles.modernName}>
                      {editMode ? 'Edit Schedule' : 'Add Schedule'}
                    </Text>
                    <Text style={styles.modernId}>
                      {editMode ? 'Select a subject to edit' : 'Create a new schedule entry'}
                    </Text>
                  </View>
                </View>
                <TouchableOpacity 
                  onPress={() => { 
                    if (!saving) {
                      resetEntryData(); 
                      setModalVisible(false); 
                    }
                  }} 
                  style={styles.modernCloseBtn}
                  disabled={saving}
                >
                  <Ionicons name="close" size={20} color="#FFFFFF" />
                </TouchableOpacity>
              </View>
            </View>
            
            <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }}>
              <View style={styles.modernInfoGrid}>
                {/* Picker for subject in edit mode */}
                {editMode && (
                  <View>
                    <TouchableOpacity 
                      style={[styles.pickerWrapper, selectedSubject ? styles.pickerWrapperActive : null]}
                      onPress={() => setSubjectSelectionVisible(true)}
                    >
                      <Text style={[
                        styles.modernPickerText, 
                        selectedSubject ? styles.selectedSubjectDisplay : styles.placeholderText
                      ]}>
                        {selectedSubject || "Choose a subject..."}
                      </Text>
                      <Ionicons name="chevron-down" size={20} color="#6B7280" style={{marginRight: 8}} />
                    </TouchableOpacity>
                    <View style={{marginBottom: 4}} />
                  </View>
                )}

              {!editMode && (
                <TouchableOpacity 
                  style={[
                    styles.pickerWrapper, 
                    entryDataList[0].subject ? styles.pickerWrapperActive : null
                  ]}
                  activeOpacity={1}
                  onPress={() => subjectInputRef.current?.focus()}
                >
                  <TextInput
                    ref={subjectInputRef}
                    style={[
                      styles.modernPickerText,
                      entryDataList[0].subject ? styles.selectedSubjectDisplay : styles.placeholderText
                    ]}
                    placeholder="Add a subject..."
                    placeholderTextColor="#9CA3AF"
                    maxLength={20}
                    value={entryDataList[0].subject || ''}
                    onChangeText={text => setEntryDataList(prev => {
                      const newList = [...prev];
                      let processed = (text || '').slice(0, 20);
                      if (processed.length > 0) {
                        processed = processed.charAt(0).toUpperCase() + processed.slice(1);
                      }
                      newList[0].subject = processed;
                      return newList;
                    })}
                  />
                </TouchableOpacity>
              )}

              {!editMode && !saving && isDuplicateSubject && (
                <Text style={{ color: '#DC2626', marginTop: -6, marginBottom: 10, fontWeight: '600' }}>
                  Subject name already exists. Please choose a different name.
                </Text>
              )}

              <View style={{marginBottom: 8}}>
                {entryDataList.map((entry,index) => (
                  <View key={index} style={styles.entryContainer}>
                    <View style={{position: 'relative', paddingTop: 8}}>
                      {/* Remove button for newly added entries (not the first one) */}
                      {index > 0 && (
                        <TouchableOpacity 
                          style={styles.removeEntryButton}
                          onPress={() => {
                            setEntryDataList(prev => prev.filter((_, i) => i !== index));
                          }}
                        >
                          <Ionicons name="close-circle" size={20} color="#EF4444" />
                        </TouchableOpacity>
                      )}
                      <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        style={{ marginTop: 2, marginBottom: 0 }}
                        contentContainerStyle={{ flexDirection:'row', alignItems:'center', justifyContent: 'center', paddingLeft: 8, paddingRight: 48 }}
                      >
                        {DAYS.map(day => {
                          const isSelectedInCurrent = entry.days.includes(day);
                          const isSelectedElsewhere = entryDataList.some((otherEntry, i) => i !== index && otherEntry.days.includes(day));
                          const selectedDayStyle = editMode ? styles.daySelected : styles.daySelectedAdd;

                          let buttonStyle = [dynamicStyles.dayButton, { marginRight: 2 }];
                          let textStyle = {fontSize: isSmallScreen ? 9 : 10, textAlign: 'center'};

                          if (isSelectedInCurrent) {
                            buttonStyle = [dynamicStyles.dayButton, selectedDayStyle, { marginRight: 2 }];
                            textStyle = {...textStyle, color: '#fff'};
                          } else if (isSelectedElsewhere) {
                            buttonStyle = [dynamicStyles.dayButton, styles.dayConflict, { marginRight: 2 }];
                            textStyle = {...textStyle, color: '#DC2626'};
                          } else {
                            buttonStyle = [dynamicStyles.dayButton, styles.dayUnselected, { marginRight: 2 }];
                            textStyle = {...textStyle, color: '#111827'};
                          }

                          return (
                            <TouchableOpacity
                              key={day}
                              style={buttonStyle}
                              onPress={() => toggleDay(index, day)}
                            >
                              <Text style={textStyle}>
                                {day.slice(0,3)}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </ScrollView>
                    </View>

                        <View style={{flexDirection: 'row', justifyContent:'space-between', alignItems: 'flex-start', width: '100%'}}>
                      {['Start','End'].map((label,i) => (
                        <View style={{width: '48%', alignItems: 'flex-start'}} key={label}>
                          <Text style={{fontSize: isSmallScreen ? 12 : 14, textAlign: 'left', marginBottom: 2}}>{label} Time</Text>
                          <View style={styles.combinedTimeContainer}>
                            <TextInput
                              style={[
                                styles.combinedTimeInput, 
                                {fontSize: isSmallScreen ? 12 : 14}
                              ]}
                              keyboardType="numeric"
                              placeholder="HH:MM"
                              placeholderTextColor="#9CA3AF"
                              maxLength={5}
                              value={i===0 ? entry.startTime : entry.endTime}
                              onChangeText={text => handleTimeChange(index, i===0, text)}
                              onBlur={() => {
                                setEntryDataList(prev => {
                                  const newList = [...prev];
                                  if (i===0) newList[index].startTime = formatTime(newList[index].startTime);
                                  else newList[index].endTime = formatTime(newList[index].endTime);
                                  return newList;
                                });
                              }}
                            />
                          </View>
                          <View style={styles.ampmContainer}>
                            {['AM','PM'].map(period => {
                              const isSelected = (i===0 ? entry.startAMPM : entry.endAMPM) === period;
                              const ampmSelectedStyle = editMode ? styles.ampmSelected : styles.ampmSelectedAdd;
                              return (
                                <TouchableOpacity
                                  key={period}
                                  style={[styles.ampmButton, isSelected ? ampmSelectedStyle : null]}
                                  onPress={() => selectAMPM(index, i===0, period)}
                                >
                                  <Text style={{color: isSelected ? '#fff':'#000', fontSize: 10}}>{period}</Text>
                                </TouchableOpacity>
                              );
                            })}
                          </View>
                        </View>
                      ))}
                    </View>
                  </View>
                ))}
              </View>

              {/* Add time slot button - show in add mode or edit mode when subject is selected */}
              {(!editMode || (editMode && selectedSubject)) && (
                <TouchableOpacity
                  style={[
                    styles.addIconButtonCustom,
                    editMode ? styles.addIconButtonEdit : styles.addIconButtonAdd
                  ]}
                  onPress={() => setEntryDataList(prev => [...prev, {startTime:'',startAMPM:'AM',endTime:'',endAMPM:'AM',days:[], subject: selectedSubject || '' }])}
                >
                   <Ionicons name="add" size={20} color={editMode ? UNIVERSAL_HEADER_COLOR : DARK_GREEN}/>
                </TouchableOpacity>
              )}
              </View>
            </ScrollView>

            {/* Fixed bottom buttons */}
            <View style={styles.modernActions}>
              <TouchableOpacity 
                style={styles.modernCloseButton}
                onPress={()=>{ 
                  if (!saving) {
                    resetEntryData(); 
                    setModalVisible(false); 
                  }
                }}
                disabled={saving}
              >
                <Text style={styles.modernCloseButtonText}>Close</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={[
                  editMode ? styles.modernUpdateButton : styles.modernSaveButton,
                  (editMode ? disableUpdate : disableSave) && styles.modernActionButtonDisabled
                ]}
                onPress={() => { 
                  if (editMode) { 
                    if (!disableUpdate) setUpdateConfirmVisible(true); 
                  } else { 
                    if (!disableSave) setSaveConfirmVisible(true); 
                  } 
                }}
                disabled={editMode ? disableUpdate : disableSave}
              >
                <Text style={[
                  editMode ? styles.modernUpdateButtonText : styles.modernSaveButtonText,
                  (editMode ? disableUpdate : disableSave) && styles.modernDisabledButtonText
                ]}>
                  {editMode ? 'Update' : 'Save'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      
      {/* Action Feedback Modal */}
      <Modal transparent animationType="fade" visible={feedbackVisible} onRequestClose={() => setFeedbackVisible(false)}>
        <View style={styles.modalOverlayCenter}>
          <View style={styles.fbModalCard}>
            <View style={styles.fbModalContent}>
              <Text style={[styles.fbModalTitle, { color: feedbackTextColor }]}>{feedbackTitle}</Text>
              {feedbackMessage ? <Text style={styles.fbModalMessage}>{feedbackMessage}</Text> : null}
            </View>
          </View>
        </View>
      </Modal>

      {/* Update confirmation modal */}
      <Modal transparent animationType="fade" visible={updateConfirmVisible} onRequestClose={() => !updatingConfirm && setUpdateConfirmVisible(false)}>
        <View style={styles.modalOverlayCenter}>
          <View style={styles.fbModalCard}>
            <View style={styles.fbModalContent}>
              <Text style={styles.fbModalTitle}>Update schedule?</Text>
              <Text style={styles.fbModalMessage}>Are you sure you want to update this schedule?</Text>
            </View>
            <View style={styles.fbModalButtonContainer}>
              <TouchableOpacity 
                style={[styles.fbModalCancelButton, updatingConfirm && styles.fbModalButtonDisabled]} 
                onPress={() => !updatingConfirm && setUpdateConfirmVisible(false)}
                disabled={updatingConfirm}
              >
                <Text style={styles.fbModalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[
                  styles.fbModalConfirmButton, 
                  { backgroundColor: UNIVERSAL_HEADER_COLOR },
                  updatingConfirm && styles.fbModalButtonDisabled
                ]} 
                onPress={async () => { 
                  if (updatingConfirm) return;
                  setUpdatingConfirm(true);
                  setUpdateConfirmVisible(false);
                  try {
                    const success = await saveEntry(true);
                    if (success) {
                      setModalVisible(false);
                      resetEntryData();
                    }
                  } finally {
                    setUpdatingConfirm(false);
                  }
                }}
                disabled={updatingConfirm}
              >
                <Text style={styles.fbModalConfirmText}>{updatingConfirm ? 'Confirming...' : 'Confirm'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Save confirmation modal */}
      <Modal transparent animationType="fade" visible={saveConfirmVisible} onRequestClose={() => !savingConfirm && setSaveConfirmVisible(false)}>
        <View style={styles.modalOverlayCenter}>
          <View style={styles.fbModalCard}>
            <View style={styles.fbModalContent}>
              <Text style={styles.fbModalTitle}>Save new schedule?</Text>
              <Text style={styles.fbModalMessage}>Are you sure you want to save this schedule?</Text>
            </View>
            <View style={styles.fbModalButtonContainer}>
              <TouchableOpacity 
                style={[styles.fbModalCancelButton, savingConfirm && styles.fbModalButtonDisabled]} 
                onPress={() => !savingConfirm && setSaveConfirmVisible(false)}
                disabled={savingConfirm}
              >
                <Text style={styles.fbModalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[
                  styles.fbModalConfirmButton, 
                  { backgroundColor: DARK_GREEN },
                  savingConfirm && styles.fbModalButtonDisabled
                ]} 
                onPress={async () => { 
                  if (savingConfirm) return;
                  setSavingConfirm(true);
                  setSaveConfirmVisible(false);
                  try {
                    const success = await saveEntry(true);
                    if (success) {
                      setModalVisible(false);
                      resetEntryData();
                    }
                  } finally {
                    setSavingConfirm(false);
                  }
                }}
                disabled={savingConfirm}
              >
                <Text style={styles.fbModalConfirmText}>{savingConfirm ? 'Confirming...' : 'Confirm'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Conflict warning removed - restriction enforced via validation modal */}

      {/* Triple-dot menu modal as bottom sheet */}
      <Modal visible={menuVisible} transparent animationType="slide">
        <TouchableOpacity style={styles.menuOverlayBottom} onPress={()=>setMenuVisible(false)}>
          <View style={[styles.menuSheet, { maxHeight: 360, minHeight: 220 }]}>
            <View style={styles.sheetHandle} />
            {isLinkedToParent && !hasActivePermission && (
              <TouchableOpacity style={styles.menuItem} onPress={() => { setMenuVisible(false); setPermissionRequestVisible(true); }}>
                <Ionicons name="lock-closed-outline" size={26} color="#F59E0B"/>
                <Text style={styles.menuText}>Request Permission</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity 
              style={styles.menuItem} 
              onPress={() => { 
                if (isLinkedToParent && !hasActivePermission) {
                  setMenuVisible(false);
                  setPermissionRequestVisible(true);
                } else {
                  setEditMode(false); 
                  setModalVisible(true); 
                  setMenuVisible(false);
                }
              }}
            >
              <Ionicons name="add-circle-outline" size={26} color="#10B981"/>
              <Text style={styles.menuText}>Add Schedule</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.menuItem} 
              onPress={() => { 
                if (isLinkedToParent && !hasActivePermission) {
                  setMenuVisible(false);
                  setPermissionRequestVisible(true);
                } else {
                  setEditMode(true); 
                  setModalVisible(true); 
                  setMenuVisible(false);
                }
              }}
            >
              <Ionicons name="create-outline" size={26} color="#2563eb"/>
              <Text style={styles.menuText}>Edit Schedule</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.menuItem} 
              onPress={() => { 
                if (isLinkedToParent && !hasActivePermission) {
                  setMenuVisible(false);
                  setPermissionRequestVisible(true);
                } else {
                  setDeleteModalVisible(true); 
                  setMenuVisible(false);
                }
              }}
            >
              <Ionicons name="trash-outline" size={26} color="#DC2626"/>
              <Text style={[styles.menuText, {color:'#DC2626'}]}>Delete Schedule</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Multi-select Delete Modal */}
      <Modal visible={deleteModalVisible} transparent animationType="fade">
        <View style={styles.modernModalOverlay}>
          <View style={[styles.modernModalCard, { maxHeight: screenHeight * 0.7, minHeight: screenHeight * 0.4 }]}>
            <View style={styles.modernModalHeader}>
              <View style={[styles.modernHeaderGradient, { backgroundColor: DARK_RED }]}>
                <View style={styles.modernHeaderContent}>
                  <View style={styles.modernAvatar}>
                    <View style={styles.avatarOctagonMedium} />
                    <Ionicons name="trash-outline" size={24} color="#FFFFFF" />
                  </View>
                  <View style={styles.modernHeaderInfo}>
                    <Text style={styles.modernName}>Delete Schedule</Text>
                    <Text style={styles.modernId}>Select schedules to remove</Text>
                  </View>
                </View>
                <TouchableOpacity 
                  onPress={() => {
                    setDeleteModalVisible(false); 
                    setSelectedForDeletion([]);
                  }} 
                  style={styles.modernCloseBtn}
                >
                  <Ionicons name="close" size={20} color="#FFFFFF" />
                </TouchableOpacity>
              </View>
            </View>
            
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.deleteModalContent}>
              <View style={styles.modernInfoGrid}>
                {subjects.length === 0 ? (
                  <View style={styles.deleteEmptyState}>
                    <Ionicons name="information-circle-outline" size={32} color="#F87171" />
                    <Text style={styles.deleteEmptyTitle}>No schedules found yet.</Text>
                    <Text style={styles.deleteEmptySubtitle}>Add a schedule before trying to delete.</Text>
                  </View>
                ) : (
                  subjects.map(s => {
                    const isSelected = selectedForDeletion.includes(s);
                    return (
                      <TouchableOpacity
                        key={s}
                        style={[
                          styles.deleteItem, 
                          isSelected ? styles.deleteItemSelected : styles.deleteItemUnselected
                        ]}
                        onPress={() => toggleSelectForDeletion(s)}
                      >
                        <View style={styles.deleteItemContent}>
                          <Text style={[
                            styles.deleteItemText, 
                            isSelected ? styles.deleteItemTextSelected : styles.deleteItemTextUnselected
                          ]}>
                            {s}
                          </Text>
                          <View style={styles.deleteItemCheck}>
                            {isSelected ? (
                              <Ionicons name="checkmark-circle" size={20} color="#DC2626" />
                            ) : null}
                          </View>
                        </View>
                      </TouchableOpacity>
                    );
                  })
                )}
              </View>
            </ScrollView>
            
            <View style={styles.modernActions}>
              <TouchableOpacity 
                style={styles.modernCloseButton} 
                onPress={()=>{setDeleteModalVisible(false); setSelectedForDeletion([]);}}
              >
                <Text style={styles.modernCloseButtonText}>Cancel</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={[
                  styles.modernDeleteButton, 
                  (!selectedForDeletion.length || deleting || subjects.length === 0) && styles.modernActionButtonDisabled
                ]}
                onPress={() => { 
                  if (selectedForDeletion.length) {
                    setDeletingConfirm(false);
                    setDeleteConfirmVisible(true); 
                  }
                }}
                disabled={!selectedForDeletion.length || deleting || subjects.length === 0}
              >
                <Text style={[
                  styles.modernDeleteButtonText,
                  (!selectedForDeletion.length || deleting || subjects.length === 0) && styles.modernDisabledButtonText
                ]}>
                  Delete
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Delete confirmation modal */}
      <Modal transparent animationType="fade" visible={deleteConfirmVisible} onRequestClose={() => setDeleteConfirmVisible(false)}>
        <View style={styles.modalOverlayCenter}>
          <View style={styles.fbModalCard}>
            <View style={styles.fbModalContent}>
              <Text style={styles.fbModalTitle}>Delete schedules?</Text>
              <Text style={styles.fbModalMessage}>Are you sure you want to delete the selected schedules? This cannot be undone.</Text>
            </View>
            <View style={styles.fbModalButtonContainer}>
              <TouchableOpacity 
                style={[styles.fbModalCancelButton, deletingConfirm && styles.fbModalButtonDisabled]} 
                onPress={() => setDeleteConfirmVisible(false)}
                disabled={deletingConfirm}
              >
                <Text style={styles.fbModalCancelText}>Close</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[
                  styles.fbModalConfirmButton, 
                  { backgroundColor: DARK_RED },
                  deletingConfirm && styles.fbModalButtonDisabled
                ]} 
                onPress={async () => { 
                  if (deletingConfirm || !selectedForDeletion.length) return;
                  const targets = [...selectedForDeletion];
                  setDeletingConfirm(true); 
                  setDeleteConfirmVisible(false);
                  try {
                    const success = await confirmDeleteSubjects(targets);
                    if (success) {
                      setDeleteModalVisible(false);
                      setSelectedForDeletion([]);
                    }
                  } finally {
                    setDeletingConfirm(false);
                  }
                }}
                disabled={deletingConfirm}
              >
                <Text style={styles.fbModalConfirmText}>Confirm</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Validation Error Modal */}
      <Modal visible={validationErrorVisible} transparent animationType="fade">
        <View style={styles.modalOverlayCenter}>
          <View style={styles.fbModalCard}>
            <View style={styles.fbModalContent}>
              <Text style={[styles.fbModalTitle, { color: '#F59E0B' }]}>{validationErrorTitle}</Text>
              <Text style={styles.fbModalMessage}>{validationErrorMessage}</Text>
            </View>
          </View>
        </View>
      </Modal>

      {/* Error Feedback Modal */}
      <Modal transparent animationType="fade" visible={errorModalVisible} onRequestClose={() => setErrorModalVisible(false)}>
        <View style={styles.modalOverlayCenter}>
          <View style={styles.fbModalCard}>
            <View style={styles.fbModalContent}>
              <Text style={[styles.fbModalTitle, { color: '#DC2626' }]}>Error</Text>
              <Text style={styles.fbModalMessage}>{errorModalMessage}</Text>
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
      </ScrollView>

      {/* Fixed triple-dot menu button */}
      <TouchableOpacity style={styles.menuFab} onPress={() => setMenuVisible(true)}>
        <MaterialIcons name="more-vert" size={28} color="#fff"/>
      </TouchableOpacity>
    </View>
    {/* Logout Modal */}
      <Modal
        transparent
        animationType="fade"
        visible={logoutVisible}
        onRequestClose={() => setLogoutVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={[styles.modalIconWrap, { backgroundColor: '#FEE2E2' }]}>
              <Ionicons name="log-out-outline" size={28} color="#b91c1c" />
            </View>
            <Text style={styles.modalTitle}>Logout</Text>
            <Text style={styles.modalText}>Are you sure you want to logout?</Text>
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalButton} onPress={() => setLogoutVisible(false)}>
                <Text style={styles.modalButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalButton, styles.modalButtonDanger]} onPress={async () => { setLogoutVisible(false); try { await logout(); } catch {} }}>
                <Text style={[styles.modalButtonText, styles.modalButtonDangerText]}>Logout</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Permission Request Modal */}
      <Modal transparent animationType="fade" visible={permissionRequestVisible} onRequestClose={() => !sendingPermissionRequest && setPermissionRequestVisible(false)}>
        <View style={styles.modalOverlayCenter}>
          <View style={styles.fbModalCard}>
            <View style={styles.fbModalContent}>
              <Text style={styles.fbModalTitle}>Request Schedule Permission</Text>
              <Text style={styles.fbModalMessage}>
                You need permission from your linked parent to modify your schedule. A request will be sent to your parent for approval.
              </Text>
            </View>
            <View style={styles.fbModalButtonContainer}>
              <TouchableOpacity 
                style={[styles.fbModalCancelButton, sendingPermissionRequest && styles.fbModalButtonDisabled]} 
                onPress={() => !sendingPermissionRequest && setPermissionRequestVisible(false)}
                disabled={sendingPermissionRequest}
              >
                <Text style={styles.fbModalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[
                  styles.fbModalConfirmButton, 
                  { backgroundColor: '#F59E0B' },
                  sendingPermissionRequest && styles.fbModalButtonDisabled
                ]} 
                onPress={async () => {
                  if (sendingPermissionRequest || !user?.studentId) return;
                  setSendingPermissionRequest(true);
                  try {
                    // Get linked parents
                    const queries = [];
                    if (user?.uid) {
                      queries.push(query(collection(db, 'parent_student_links'), where('studentId', '==', user.uid), where('status', '==', 'active')));
                    }
                    if (user?.studentId) {
                      queries.push(query(collection(db, 'parent_student_links'), where('studentIdNumber', '==', user.studentId), where('status', '==', 'active')));
                    }
                    const results = await Promise.all(queries.map(q => getDocs(q)));
                    const allLinks = [];
                    results.forEach(snap => {
                      snap.docs.forEach(doc => {
                        const data = doc.data();
                        allLinks.push({
                          parentId: data.parentId,
                          parentName: data.parentName || 'Parent',
                          linkId: doc.id
                        });
                      });
                    });
                    
                    if (allLinks.length === 0) {
                      showErrorModal('No linked parents found. Please link parents first.');
                      setPermissionRequestVisible(false);
                      return;
                    }

                    // Send notification to each linked parent
                    const studentName = `${user?.firstName || ''} ${user?.lastName || ''}`.trim() || 'Student';
                    const uniqueSuffix = `${Date.now()}_${Math.floor(Math.random()*1000000)}`;
                    
                    for (const link of allLinks) {
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

                      const parentDocId = await resolveParentDocId(link.parentId);
                      const notifItem = {
                        id: `sched_perm_${user.studentId}_${uniqueSuffix}`,
                        type: 'schedule_permission_request',
                        title: 'Schedule Permission Request',
                        message: `${studentName} is requesting permission to modify their schedule.`,
                        createdAt: new Date().toISOString(),
                        status: 'unread',
                        parentId: parentDocId,
                        studentId: user.studentId,
                        studentName: studentName,
                        requestId: `sched_perm_${user.studentId}_${uniqueSuffix}`,
                      };

                      const parentAlertsRef = doc(db, 'parent_alerts', parentDocId);
                      const parentSnap = await getDoc(parentAlertsRef);
                      const existing = parentSnap.exists() ? (Array.isArray(parentSnap.data()?.items) ? parentSnap.data().items : []) : [];
                      const isDuplicate = existing.some(it => String(it?.id) === String(notifItem.id));
                      if (!isDuplicate) {
                        const updated = [...existing, notifItem];
                        await setDoc(parentAlertsRef, { items: updated }, { merge: true });
                      }
                    }

                    setPermissionRequestVisible(false);
                    showFeedback({
                      title: 'Request Sent',
                      message: 'Your permission request has been sent to your linked parent(s).',
                      icon: 'checkmark-circle-outline',
                      bg: '#EFF6FF',
                      color: '#2563EB'
                    });
                  } catch (error) {
                    console.error('Error sending permission request:', error);
                    showErrorModal('Failed to send permission request. Please try again.');
                  } finally {
                    setSendingPermissionRequest(false);
                  }
                }}
                disabled={sendingPermissionRequest}
              >
                <Text style={styles.fbModalConfirmText}>{sendingPermissionRequest ? 'Sending...' : 'Send Request'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Subject Selection Modal */}
      <Modal visible={subjectSelectionVisible} transparent animationType="fade" onRequestClose={() => setSubjectSelectionVisible(false)}>
        <View style={styles.modernModalOverlay}>
          <View style={[styles.modernModalCard, { maxHeight: screenHeight * 0.8, minHeight: screenHeight * 0.45 }]}>
            <View style={styles.modernModalHeader}>
              <View style={[styles.modernHeaderGradient, { backgroundColor: UNIVERSAL_HEADER_COLOR }]}>
                <View style={styles.modernHeaderContent}>
                  <View style={styles.modernAvatar}>
                    <View style={styles.avatarOctagonMedium} />
                    <Ionicons 
                      name="list-outline" 
                      size={24} 
                      color="#FFFFFF" 
                    />
                  </View>
                  <View style={styles.modernHeaderInfo}>
                    <Text style={styles.modernName}>Choose Subject</Text>
                    <Text style={styles.modernId}>Tap a subject to edit its schedule</Text>
                  </View>
                </View>
                <TouchableOpacity 
                  onPress={() => setSubjectSelectionVisible(false)} 
                  style={styles.modernCloseBtn}
                >
                  <Ionicons name="close" size={20} color="#FFFFFF" />
                </TouchableOpacity>
              </View>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.subjectSelectionContent}>
              <View style={styles.modernInfoGrid}>
                {subjects.length === 0 ? (
                  <View style={styles.subjectSelectionEmptyState}>
                    <Ionicons name="information-circle-outline" size={32} color="#94A3B8" />
                    <Text style={styles.subjectSelectionEmptyText}>No subjects found yet.</Text>
                  </View>
                ) : (
                  <ScrollView style={{ maxHeight: screenHeight * 0.45 }} showsVerticalScrollIndicator={false}>
                    {subjects.map(subject => (
                      <TouchableOpacity
                        key={subject}
                        style={[
                          styles.subjectSelectionItem,
                          selectedSubject === subject && styles.subjectSelectionItemActive
                        ]}
                        onPress={() => {
                          setSelectedSubject(subject);
                          const subjectEntries = schedule.filter(s => s.subject === subject);
                          if (subjectEntries.length) {
                            const timeToDays = {};
                            subjectEntries.forEach(e => {
                              const timeKey = e.time;
                              if (!timeToDays[timeKey]) timeToDays[timeKey] = new Set();
                              timeToDays[timeKey].add(e.day);
                            });
                            const combined = Object.keys(timeToDays).map(timeKey => {
                              const [start, end] = timeKey.split(' - ');
                              const startParts = start.trim().split(' ');
                              const endParts = end.trim().split(' ');
                              
                              const startTime = startParts[0];
                              const startAMPM = startParts[1] || 'AM';
                              const endTime = endParts[0];
                              const endAMPM = endParts[1] || 'PM';
                              
                              const daysArray = Array.from(timeToDays[timeKey]);
                              const orderedDays = DAYS.filter(d => daysArray.includes(d));
                              
                              return {
                                startTime,
                                startAMPM,
                                endTime,
                                endAMPM,
                                days: orderedDays,
                                subject: subject
                              };
                            });
                            setEntryDataList(combined);
                            setOriginalEntryList(JSON.parse(JSON.stringify(combined)));
                          } else {
                            resetEntryData();
                          }
                          setSubjectSelectionVisible(false);
                        }}
                      >
                        <View style={styles.subjectSelectionItemContent}>
                          <Text style={[
                            styles.subjectSelectionText,
                            selectedSubject === subject && styles.subjectSelectionTextActive
                          ]}>
                            {subject}
                          </Text>
                        {selectedSubject === subject && (
                          <Ionicons name="checkmark-circle" size={20} color="#2563EB" />
                        )}
                        </View>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                )}
              </View>
            </ScrollView>

            <View style={styles.modernActions}>
              <TouchableOpacity 
                style={styles.modernCloseButton} 
                onPress={() => setSubjectSelectionVisible(false)}
              >
                <Text style={styles.modernCloseButtonText}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>


    </>
  );
};

const styles = StyleSheet.create({
  wrapper: { flex: 1, backgroundColor: '#F9FAFB' },
  container: { padding: 16, paddingBottom: 120, paddingTop: 50, flexGrow: 1 },
  scheduleContainer: {
    backgroundColor: '#fff',
    borderRadius: 8,
    paddingTop: 8,
    paddingBottom: 8,
    paddingLeft: 10,
    paddingRight: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginTop: 12,
    marginBottom: 12,
  },
  legendContainer: {
    backgroundColor: '#fff',
    borderRadius: 8,
    paddingTop: 8,
    paddingBottom: 8,
    paddingLeft: 10,
    paddingRight: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginTop: 12,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 8,
    elevation: 4,
  },
  separator: {
    height: 1,
    backgroundColor: '#E5E7EB',
    marginTop: 8,
    marginBottom: 12,
    marginHorizontal: 0,
  },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  sectionTitle: { fontSize: 25, fontWeight: '600', color: '#111827', marginRight: 8, marginBottom: 5, textAlign: 'center' },
  legendRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, marginTop: 4, marginBottom: 4 },
  legendChip: { width: 10, height: 10, borderRadius: 5, marginRight: 6 },
  legendText: { marginRight: 14, color: '#374151', fontSize: 12, paddingTop: 2 },
  tableScrollContainer: { marginTop: 12, marginBottom: 12 },
  tableContainer: { borderWidth: 0, borderColor: 'transparent', borderRadius: 0, overflow: 'visible', backgroundColor: '#fff' },
  row: { flexDirection: 'row' },
  headerCell: { backgroundColor: '#000000' },
  subjectCell: { backgroundColor: '#ffffff' },
  subjectPill: { backgroundColor: '#000000', paddingVertical: 3, paddingHorizontal: 5, borderRadius: 5, maxWidth: '95%' },
  entryPill: { paddingVertical: 2, paddingHorizontal: 4, borderRadius: 4, marginVertical: 2, maxWidth: '100%', minWidth: '90%' },
  entryPillText: { color: '#fff', fontWeight: '600', fontSize: 10, textAlign: 'center' },
  menuFab: { position: 'absolute', bottom: 20, right: 20, width: 60, height: 60, borderRadius: 15, backgroundColor: '#004f89', justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.2, shadowOffset: { width: 0, height: 4 }, shadowRadius: 5, elevation: 8 },
  modalContainer: { backgroundColor: '#fff', borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 20 },
  modalHeader: { fontSize: 20, fontWeight: '700', marginBottom: 16 },
  input: { borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 8, padding: 10, marginBottom: 2, fontSize: 14, color: '#111827' },
  pickerContainer: { marginBottom: 8 },
  pickerHeader: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'center',
    marginBottom: 6,
    paddingHorizontal: 4
  },
  pickerLabel: { fontSize: 18, fontWeight: '700', color: '#111827', marginLeft: 8 },
  pickerWrapper: { 
    borderWidth: 2, 
    borderColor: '#E5E7EB', 
    borderRadius: 8, 
    backgroundColor: '#F9FAFB',
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  pickerWrapperActive: {
    borderColor: '#2563eb',
    backgroundColor: '#EFF6FF'
  },
  selectedSubjectInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    borderRadius: 8,
    padding: 12,
    marginTop: 12
  },
  selectedSubjectText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#166534',
    marginLeft: 8
  },
  combinedTimeContainer: { flexDirection:'row', alignItems:'center', marginBottom:2, width: '100%' },
  combinedTimeInput: { borderWidth:1, borderColor:'#D1D5DB', borderRadius:6, padding:6, width: '100%', textAlign:'center', color: '#111827' },
  ampmContainer: { flexDirection:'row', justifyContent:'space-between', alignItems: 'center', width: '100%', marginTop: 4 },
  ampmButton: { flex: 1, padding:6, borderRadius:5, marginHorizontal:2, backgroundColor:'#E5E7EB', alignItems: 'center', justifyContent: 'center'},
  ampmSelected: { backgroundColor: UNIVERSAL_HEADER_COLOR },
  ampmSelectedAdd: { backgroundColor: DARK_GREEN },
  daySelected: { backgroundColor: UNIVERSAL_HEADER_COLOR },
  daySelectedAdd: { backgroundColor: DARK_GREEN },
  dayUnselected: { backgroundColor: '#E5E7EB' },
  dayConflict: { backgroundColor: '#FEE2E2', borderWidth: 1, borderColor: '#DC2626' },
  saveButton: { backgroundColor: '#2563eb', padding: 14, borderRadius: 8, marginBottom: 12, alignItems: 'center', flexDirection:'row', justifyContent:'center', flex: 1, marginLeft: 8, borderWidth: 1, borderColor: '#2563eb', minHeight: 48 },
  saveText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  saveTextDisabled: { color: '#2563eb', fontWeight: '600', fontSize: 16 },
  cancelButton: { padding: 14, borderRadius: 8, borderWidth: 1, borderColor: '#D1D5DB', alignItems: 'center', flexDirection:'row', justifyContent:'center', marginBottom: 12, flex: 1, marginRight: 8, minHeight: 48 },
  cancelText: { color: '#111827', fontWeight: '600', fontSize: 16 },
  deleteButtonCustom: { backgroundColor:'#8B0000', padding:14, borderRadius:8, alignItems:'center', marginBottom:12, flex: 1, marginLeft: 8 },
  menuItem: { flexDirection:'row', alignItems:'center', paddingVertical:16, paddingHorizontal:14, borderBottomWidth:0.5, borderBottomColor:'#E5E7EB' },
  menuText: { fontSize:18, fontWeight:'700', marginLeft:14, color:'#111827' },
  addIconButtonCustom: { alignSelf:'center', marginVertical:12, borderWidth:1, borderRadius:8, padding:8, backgroundColor:'transparent' },
  addIconButtonAdd: { borderColor: DARK_GREEN },
  addIconButtonEdit: { borderColor: UNIVERSAL_HEADER_COLOR },
  emptyCard: { backgroundColor: '#fff', borderRadius: 8, padding: 16, alignItems: 'center', borderWidth: 1, borderColor: '#E5E7EB', shadowColor: '#0F172A', shadowOpacity: 0.08, shadowOffset: { width: 0, height: 6 }, shadowRadius: 12, elevation: 4, width: '100%' },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: '#111827', marginTop: 0, marginBottom: 4 },
  emptySubtitle: { fontSize: 13, color: '#6B7280' },
  emptyIconWrap: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  emptySubtext: {
    fontSize: 12,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 16,
    marginBottom: 12,
  },
  centerContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  // Modal (reuse from dashboard)
  modalCard: { width: '85%', maxWidth: 400, backgroundColor: '#fff', borderRadius: 8, padding: 20, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 4 },
  modalCardLarge: { width: '100%', maxWidth: 420, backgroundColor: '#fff', borderRadius: 8, padding: 24, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 20, shadowOffset: { width: 0, height: 10 }, elevation: 8 },
  entryContainer: { marginBottom: 8, borderBottomWidth: 1, borderBottomColor: '#E5E7EB', paddingBottom: 8 },
  modalButtonContainer: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: '#E5E7EB' },
  deleteModalDescription: { fontSize: 14, color: '#6B7280', textAlign: 'center', marginBottom: 16, lineHeight: 20 },
  deleteItem: { marginBottom: 8, borderRadius: 8, borderWidth: 1 },
  deleteItemSelected: { backgroundColor: '#FEF2F2', borderColor: '#FECACA' },
  deleteItemUnselected: { backgroundColor: '#F9FAFB', borderColor: '#E5E7EB' },
  deleteItemContent: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 16, paddingHorizontal: 16 },
  deleteItemText: { fontSize: 16, fontWeight: '500' },
  deleteItemTextSelected: { color: '#DC2626' },
  deleteItemTextUnselected: { color: '#111827' },
  deleteItemCheck: {
    width: 24,
    alignItems: 'flex-end',
  },
  deleteModalContent: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  deleteEmptyState: {
    paddingVertical: 48,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: '#FECACA',
    backgroundColor: '#FEF2F2',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  deleteEmptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#991B1B',
  },
  deleteEmptySubtitle: {
    fontSize: 14,
    color: '#B91C1C',
    textAlign: 'center',
  },
  modalIconWrap: { width: 52, height: 52, borderRadius: 26, backgroundColor: '#FEE2E2', alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  modalTitle: { fontSize: 20, fontWeight: '700', color: '#111827' },
  modalText: { fontSize: 14, color: '#374151', marginTop: 6 },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 18 },
  modalButton: { paddingVertical: 10, paddingHorizontal: 14, borderRadius: 8, backgroundColor: '#F3F4F6', marginLeft: 10 },
  modalButtonText: { color: '#111827', fontWeight: '600' },
  modalButtonDanger: { backgroundColor: '#FEE2E2' },
  modalButtonDangerText: { color: '#b91c1c' },
  disabledButton: { opacity: 0.5 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 12, color: '#6B7280', fontSize: 16 },
  // Subject selection modal styles
  modalOverlayCenter: { 
    flex: 1, 
    backgroundColor: 'rgba(0,0,0,0.5)', 
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20
  },
  // Bottom sheet overlay fills screen; content sticks to bottom
  menuOverlayBottom: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'flex-end',
    alignItems: 'stretch'
  },
  // Bottom sheet: full width, rounded top corners, safe padding to edges
  menuSheet: {
    width: '100%',
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 24,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowOffset: { width: 0, height: -6 },
    shadowRadius: 12,
    elevation: 8
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 46,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#E5E7EB',
    marginTop: 8,
    marginBottom: 12
  },
  subjectSelectionModal: { 
    width: '100%', 
    maxWidth: 450, 
    backgroundColor: '#fff', 
    borderRadius: 8, 
    padding: 24,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowOffset: { width: 0, height: 10 },
    shadowRadius: 20,
    elevation: 8
  },
  modernPickerText: {
    fontSize: 16,
    color: '#111827',
    paddingVertical: 12,
    paddingHorizontal: 20
  },
  selectedSubjectDisplay: {
    fontWeight: '600',
    color: '#111827'
  },
  placeholderText: {
    color: '#9CA3AF'
  },
  subjectSelectionItem: {
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    backgroundColor: '#F9FAFB',
    marginBottom: 8,
  },
  subjectSelectionItemActive: {
    borderColor: '#BFDBFE',
    backgroundColor: '#EFF6FF'
  },
  subjectSelectionItemContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  subjectSelectionText: {
    fontSize: 16,
    color: '#111827',
    fontWeight: '600'
  },
  subjectSelectionTextActive: {
    color: '#1D4ED8'
  },
  subjectSelectionEmptyState: {
    paddingVertical: 48,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    flexGrow: 1
  },
  subjectSelectionContent: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  subjectSelectionEmptyText: {
    marginTop: 8,
    fontSize: 14,
    color: '#475569',
    fontWeight: '600'
  },
  removeEntryButton: {
    position: 'absolute',
    top: -6,
    right: 8,
    zIndex: 10,
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 2,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 3
  },
  addScheduleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB'
  },
  addScheduleHeaderText: {
    fontSize: 20,
    fontWeight: '600',
    color: '#111827',
    marginLeft: 8
  },
  headerDivider: {
    height: 1,
    backgroundColor: '#E5E7EB',
    marginVertical: 12,
    marginHorizontal: 10
  },


  validationErrorModal: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 24,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowOffset: { width: 0, height: 10 },
    shadowRadius: 20,
    elevation: 8,
    alignItems: 'center'
  },
  validationErrorIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#FEF2F2',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16
  },
  validationErrorTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 12,
    textAlign: 'center'
  },
  validationErrorMessage: {
    fontSize: 16,
    color: '#374151',
    textAlign: 'center',
    lineHeight: 22
  },
  // Facebook-style modal styles
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
  fbModalButton: {
    backgroundColor: '#1877F2',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fbModalButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
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
  fbModalDeleteButton: {
    backgroundColor: '#E4E6EB',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fbModalDeleteText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#DC2626',
  },
  fbModalButtonDisabled: {
    opacity: 0.5,
  },
  // Modal styles
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
  // Modern modal styles (matching LinkParent.js)
  modernModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  modernModalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    width: '100%',
    maxWidth: 420,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowOffset: { width: 0, height: 12 },
    shadowRadius: 32,
    elevation: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.8)',
  },
  modernModalHeader: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
  },
  modernHeaderGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 24,
    paddingTop: 20,
    paddingBottom: 20,
    backgroundColor: UNIVERSAL_HEADER_COLOR,
    position: 'relative',
  },
  modernHeaderContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  modernAvatar: {
    width: 56,
    height: 56,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
    borderWidth: 3,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 8,
  },
  avatarOctagonMedium: { 
    position: 'absolute', 
    width: 44, 
    height: 44, 
    backgroundColor: 'rgba(255,255,255,0.18)', 
    borderWidth: 2, 
    borderColor: 'rgba(255,255,255,0.35)', 
    borderRadius: 10 
  },
  modernHeaderInfo: {
    flex: 1,
  },
  modernName: {
    fontSize: 20,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: 4,
    textShadowColor: 'rgba(0, 0, 0, 0.1)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  modernId: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.8)',
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  modernCloseBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  modernInfoGrid: {
    padding: 16,
    paddingTop: 16,
    backgroundColor: '#FAFBFC',
  },
  modernActions: {
    flexDirection: 'row',
    padding: 16,
    paddingTop: 8,
    backgroundColor: '#FFFFFF',
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    gap: 8,
  },
  modernCloseButton: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    minHeight: 48,
    minWidth: 0,
  },
  modernCloseButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#475569',
    letterSpacing: 0.3,
  },
  modernSaveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: DARK_GREEN,
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderRadius: 8,
    gap: 8,
    flex: 1,
    minHeight: 48,
    minWidth: 0,
    borderWidth: 1.5,
    borderColor: DARK_GREEN,
  },
  modernSaveButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
  modernUpdateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: UNIVERSAL_HEADER_COLOR,
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderRadius: 8,
    gap: 8,
    flex: 1,
    minHeight: 48,
    minWidth: 0,
    borderWidth: 1.5,
    borderColor: UNIVERSAL_HEADER_COLOR,
  },
  modernUpdateButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
  modernDeleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: DARK_RED,
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderRadius: 8,
    gap: 8,
    flex: 1,
    minHeight: 48,
    minWidth: 0,
    borderWidth: 1.5,
    borderColor: DARK_RED,
  },
  modernDeleteButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
  modernDisabledButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F1F5F9',
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    gap: 8,
    flex: 1,
    minHeight: 48,
  },
  modernActionButtonDisabled: {
    backgroundColor: '#F1F5F9',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
  },
  modernDisabledButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#94A3B8',
    letterSpacing: 0.3,
  },
});

export default GraphSchedule;