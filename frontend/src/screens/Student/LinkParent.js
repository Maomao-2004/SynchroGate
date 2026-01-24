import React, { useState, useContext, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Alert,
  ScrollView,
  Image,
  Modal,
  Animated,
  Dimensions,
  FlatList,
} from 'react-native';
import { useNavigation, useIsFocused, useRoute, useFocusEffect } from '@react-navigation/native';
import { STUDENT_TAB_BAR_STYLE } from '../../navigation/tabStyles';
import { Ionicons } from '@expo/vector-icons';
import { AuthContext } from '../../contexts/AuthContext';
import { 
  collection, 
  query, 
  where, 
  getDocs, 
  doc, 
  getDoc,
  deleteDoc,
  updateDoc,
  setDoc,
  arrayUnion,
  onSnapshot 
} from 'firebase/firestore';
import { db } from '../../utils/firebaseConfig';
import { deleteConversationOnUnlink, deleteAllStudentToStudentConversations } from '../../utils/conversationUtils';
import AsyncStorage from '@react-native-async-storage/async-storage';
import avatarEventEmitter from '../../utils/avatarEventEmitter';
import { cacheLinkedParents, getCachedLinkedParents } from '../../offline/storage';
import { NetworkContext } from '../../contexts/NetworkContext';
import OfflineBanner from '../../components/OfflineBanner';
import NetInfo from '@react-native-community/netinfo';
// Removed: sendAlertPushNotification import - backend handles all push notifications automatically

const { width, height } = Dimensions.get('window');
const LIST_MAX_HEIGHT = Math.max(120, height - 310);
const isPortrait = height >= width;
// Grid sizing to achieve 2x2 without scrolling
const GRID_CONTENT_TOP = 130; // paddingTop used in content
// Reserve a robust bottom buffer to clear the nav tab and safe area consistently
const NAV_TAB_BUFFER = 0; // no tab bar on this screen
const SAFE_BOTTOM_BUFFER = 8; // extra cushion for safe-area (smaller gap)
const GRID_ROW_GAP = 12; // slightly increased vertical gap between rows
const GRID_HEIGHT = Math.max(220, height - GRID_CONTENT_TOP - NAV_TAB_BUFFER - SAFE_BOTTOM_BUFFER);
const CARD_HEIGHT = 260; // taller cards to accommodate view details button

function LinkStudents() {
  const navigation = useNavigation();
  useFocusEffect(
    React.useCallback(() => {
      const parent = navigation.getParent?.();
      if (parent) parent.setOptions({ tabBarStyle: { display: 'none' } });
      return () => {
        // Don't restore tab bar here - let the navigator handle it based on the current route
        // This prevents the tab bar from showing when navigating to ParentProfile
      };
    }, [navigation])
  );
  const route = useRoute();
  const isFocused = useIsFocused();
  const { user, logout } = useContext(AuthContext);
  const networkContext = useContext(NetworkContext);
  const isConnected = networkContext?.isConnected ?? true;
  
  const [logoutVisible, setLogoutVisible] = useState(false);
  const [profilePic, setProfilePic] = useState(null);
  const [linkedStudents, setLinkedStudents] = useState([]);
  const [loadingLinked, setLoadingLinked] = useState(false);
  const [requestedStudents, setRequestedStudents] = useState([]);
  const [isLoadingStudents, setIsLoadingStudents] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [linkLoading, setLinkLoading] = useState(false);
  const [feedbackVisible, setFeedbackVisible] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState('');
  const [feedbackSuccess, setFeedbackSuccess] = useState(true);
  const [feedbackTitle, setFeedbackTitle] = useState('');
  const [showOfflineBanner, setShowOfflineBanner] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [unlinkConfirmVisible, setUnlinkConfirmVisible] = useState(false);
  const [unlinkStudentData, setUnlinkStudentData] = useState(null);
  const [unlinking, setUnlinking] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [searchParentName, setSearchParentName] = useState('');
  const [allParents, setAllParents] = useState([]);
  const [studentInfoVisible, setStudentInfoVisible] = useState(false);
  const [studentInfoData, setStudentInfoData] = useState(null);
  const [studentInfoLoading, setStudentInfoLoading] = useState(false);
  const [linkStudentConfirmVisible, setLinkStudentConfirmVisible] = useState(false);
  const [selectedStudentForLink, setSelectedStudentForLink] = useState(null);
  const [linkingStudent, setLinkingStudent] = useState(false);
  const [pendingReqMap, setPendingReqMap] = useState({});
  const [selfPendingMap, setSelfPendingMap] = useState({});
  const [cancelRequestConfirmVisible, setCancelRequestConfirmVisible] = useState(false);
  const [cancelRequestTarget, setCancelRequestTarget] = useState(null);
  const [cancelingRequest, setCancelingRequest] = useState(false);
  const [headerSearchShowing, setHeaderSearchShowing] = useState(false);
  const [refreshCounter, setRefreshCounter] = useState(0);
  
  // Force re-render when link-related state changes
  const triggerRefresh = useCallback(() => {
    setRefreshCounter(prev => prev + 1);
  }, []);

  // Resolve canonical student doc id for student_alerts (prefer formatted studentId)
  const getCanonicalStudentDocId = async () => {
    try {
      let docId = String(user?.studentId || user?.studentID || user?.studentIdNumber || user?.studentNumber || user?.lrn || '').trim();
      if (!docId || !docId.includes('-')) {
        try {
          const qSnap = await getDocs(query(collection(db, 'users'), where('uid', '==', user?.uid), where('role', '==', 'student')));
          if (!qSnap.empty) {
            const data = qSnap.docs[0].data() || {};
            if (data.studentId || data.studentID || data.studentIdNumber || data.studentNumber || data.lrn) {
              docId = String(data.studentId || data.studentID || data.studentIdNumber || data.studentNumber || data.lrn || '').trim();
            }
          }
        } catch {}
      }
      if (!docId) docId = String(user?.uid || '').trim();
      return docId;
    } catch { return String(user?.uid || '').trim(); }
  };

  // Sidebar animation
  const sidebarAnimRight = useState(new Animated.Value(-width * 0.6))[0];

  // Load profile picture (student) - using same key as Profile.js
  const loadProfilePic = useCallback(async () => {
    try {
      if (!user?.uid) { setProfilePic(null); return; }
      const studentId = await getCanonicalStudentDocId();
      // Use the same key as Profile.js: profilePic_${studentId}
      const primaryKey = `profilePic_${studentId}`;
      const legacyKey = `studentProfilePic_${studentId}`;
      let savedProfile = await AsyncStorage.getItem(primaryKey);
      if (!savedProfile) savedProfile = await AsyncStorage.getItem(legacyKey);
      setProfilePic(savedProfile ? { uri: savedProfile } : null);
    } catch (err) {
      setProfilePic(null);
    }
  }, [user?.uid]);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', loadProfilePic);
    loadProfilePic(); // Load on mount
    return unsubscribe;
  }, [navigation, loadProfilePic]);

  // Listen for avatar changes from Profile screen
  useEffect(() => {
    const handleAvatarChange = async (data) => {
      if (!user?.uid) return;
      const studentId = await getCanonicalStudentDocId();
      if (studentId && data.studentId && String(data.studentId) === String(studentId)) {
        loadProfilePic();
      }
    };

    avatarEventEmitter.on('avatarChanged', handleAvatarChange);
    return () => {
      avatarEventEmitter.off('avatarChanged', handleAvatarChange);
    };
  }, [user?.uid, loadProfilePic]);

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

  // sidebar removed

  const handleLogout = () => { setLogoutVisible(true); };
  const confirmLogout = async () => {
    setLogoutVisible(false);
    try { await logout?.(); } catch {}
  };

  // Load linked parents and pending requests
  const loadLinkedStudents = async () => {
    if (!user?.uid) { setLoadingLinked(false); setLinkedStudents([]); setRequestedStudents([]); return; }
    if (isLoadingStudents) return;
    
    // Try to load from cache first (works offline)
    try {
      const cachedData = await getCachedLinkedParents(user.uid);
      if (cachedData) {
        setLinkedStudents(cachedData.linkedStudents || []);
        setRequestedStudents(cachedData.requestedStudents || []);
        // If offline, use cached data and return early
        if (!isConnected) {
          console.log('📴 Offline mode - using cached linked parents');
          setLoadingLinked(false);
          setIsLoadingStudents(false);
          return;
        }
      }
    } catch (error) {
      console.log('Error loading cached linked parents:', error);
    }
    
    const timeoutId = setTimeout(() => { setLoadingLinked(false); setLinkedStudents([]); setRequestedStudents([]); setIsLoadingStudents(false); }, 10000);
    try {
      setIsLoadingStudents(true);
      setLoadingLinked(true);
      setLoadError(null);
      
      // Only fetch from Firestore if online
      if (!isConnected) {
        setLoadingLinked(false);
        setIsLoadingStudents(false);
        clearTimeout(timeoutId);
        return;
      }
      
      const canonicalId = await getCanonicalStudentDocId();
      // Query for active links where current user is the student
      const q1 = query(collection(db, 'parent_student_links'), where('studentId', '==', user.uid), where('status', '==', 'active'));
      const q2 = canonicalId && canonicalId.includes('-')
        ? query(collection(db, 'parent_student_links'), where('studentIdNumber', '==', canonicalId), where('status', '==', 'active'))
        : null;
      const [snap1, snap2] = await Promise.all([getDocs(q1), q2 ? getDocs(q2) : Promise.resolve({ docs: [] })]);
      const mergedDocs = [...snap1.docs, ...snap2.docs];
      const seen = new Set();
      const parents = [];
      for (const linkDoc of mergedDocs) {
        try {
          const linkData = linkDoc.data();
          const pid = String(linkData.parentId || '').trim();
          if (!pid || seen.has(pid)) continue;
          seen.add(pid);
          // Fetch parent details from users collection
          const parentDoc = await getDoc(doc(db, 'users', pid));
          if (parentDoc.exists()) {
            const parentData = parentDoc.data();
            // Include all parent data fields for complete information
            const parentNameParts = linkData.parentName ? linkData.parentName.split(' ').filter(Boolean) : [];
            parents.push({ 
              ...parentData, // Include all parent fields (email, contactNumber, gender, birthday, address, etc.)
              linkId: linkDoc.id, 
              id: parentDoc.id, // Use document ID
              uid: parentData.uid || pid,
              firstName: parentNameParts[0] || parentData.firstName || '', 
              lastName: parentNameParts.slice(1).join(' ') || parentData.lastName || '', 
              parentId: parentData.parentId || linkData.parentIdNumber || pid,
              studentId: linkData.parentIdNumber || parentData.parentId || pid, 
              relationship: linkData.relationship, 
              linkedAt: linkData.linkedAt || new Date().toISOString() 
            });
          } else {
            // Fallback to link data if parent doc doesn't exist
            const parentNameParts = (linkData.parentName || '').split(' ').filter(Boolean);
            parents.push({ 
              linkId: linkDoc.id, 
              id: pid, 
              uid: pid,
              firstName: parentNameParts[0] || '', 
              lastName: parentNameParts.slice(1).join(' ') || '', 
              studentId: linkData.parentIdNumber || pid, 
              relationship: linkData.relationship, 
              linkedAt: linkData.linkedAt || new Date().toISOString() 
            });
          }
        } catch {}
        }
        // Pending requests where current user is the student
        const requestsQuery = query(collection(db, 'parent_student_links'), where('studentId', '==', user.uid), where('status', '==', 'pending'));
        const requestsSnapshot = await getDocs(requestsQuery);
        const requests = [];
        for (const linkDoc of requestsSnapshot.docs) {
        try {
          const linkData = linkDoc.data();
          const pDoc = await getDoc(doc(db, 'users', linkData.parentId));
          if (pDoc.exists()) {
            const p = pDoc.data();
            requests.push({ linkId: linkDoc.id, id: p.uid, firstName: p.firstName, lastName: p.lastName, studentId: linkData.parentIdNumber || linkData.parentId, relationship: linkData.relationship, requestedAt: linkData.requestedAt || new Date().toISOString() });
          } else {
            const parentNameParts = (linkData.parentName || '').split(' ').filter(Boolean);
            requests.push({ linkId: linkDoc.id, id: linkData.parentId, firstName: parentNameParts[0] || 'Parent', lastName: parentNameParts.slice(1).join(' ') || '', studentId: linkData.parentIdNumber || linkData.parentId, relationship: linkData.relationship, requestedAt: linkData.requestedAt || new Date().toISOString() });
          }
        } catch {}
        }
        setLinkedStudents(parents);
        setRequestedStudents(requests);
        
        // Cache the data for offline access
        try {
          await cacheLinkedParents(user.uid, {
            linkedStudents: parents,
            requestedStudents: requests,
          });
        } catch (cacheError) {
          console.log('Error caching linked parents:', cacheError);
        }
    } catch (error) {
      console.error('Error loading linked students:', error);
      // Don't show network error modal during navigation/offline mode
      setLoadError(error.message || 'Failed to load linked parents');
      // Keep using cached data if available
    } finally {
      clearTimeout(timeoutId);
      setLoadingLinked(false);
      setIsLoadingStudents(false);
    }
  };

  // Real-time listener for active linked parents (uid and canonical)
  useEffect(() => {
    if (!user?.uid) return;
    let unsub1 = null, unsub2 = null;
    const seenToParent = async (docs) => {
      const seen = new Set();
      const out = [];
      for (const d of docs) {
        const l = d.data() || {};
        const pid = String(l.parentId || '').trim();
        if (!pid || seen.has(pid)) continue;
        seen.add(pid);
        try {
          // Fetch parent details from users collection
          const parentDoc = await getDoc(doc(db, 'users', pid));
          if (parentDoc.exists()) {
            const parentData = parentDoc.data();
            // Include all parent data fields for complete information
            const parentNameParts = l.parentName ? l.parentName.split(' ').filter(Boolean) : [];
            out.push({ 
              ...parentData, // Include all parent fields (email, contactNumber, gender, birthday, address, etc.)
              linkId: d.id, 
              id: parentDoc.id, // Use document ID
              uid: parentData.uid || pid,
              firstName: parentNameParts[0] || parentData.firstName || '', 
              lastName: parentNameParts.slice(1).join(' ') || parentData.lastName || '', 
              parentId: parentData.parentId || l.parentIdNumber || pid,
              studentId: l.parentIdNumber || parentData.parentId || pid, 
              relationship: l.relationship, 
              linkedAt: l.linkedAt || new Date().toISOString() 
            });
          } else {
            // Fallback to link data
            const parentNameParts = (l.parentName || '').split(' ').filter(Boolean);
            out.push({ 
              linkId: d.id, 
              id: pid, 
              uid: pid,
              firstName: parentNameParts[0] || '', 
              lastName: parentNameParts.slice(1).join(' ') || '', 
              parentId: l.parentIdNumber || pid,
              studentId: l.parentIdNumber || pid, 
              relationship: l.relationship, 
              linkedAt: l.linkedAt || new Date().toISOString() 
            });
          }
        } catch {
          // Fallback to link data on error
          const parentNameParts = (l.parentName || '').split(' ').filter(Boolean);
          out.push({ 
            linkId: d.id, 
            id: pid, 
            uid: pid,
            firstName: parentNameParts[0] || '', 
            lastName: parentNameParts.slice(1).join(' ') || '', 
            parentId: l.parentIdNumber || pid,
            studentId: l.parentIdNumber || pid, 
            relationship: l.relationship, 
            linkedAt: l.linkedAt || new Date().toISOString() 
          });
        }
      }
      return out;
    };
    const attach = async () => {
      try {
        const canonicalId = await getCanonicalStudentDocId();
        // Query for active links where current user is the student
        const q1 = query(collection(db, 'parent_student_links'), where('studentId', '==', user.uid), where('status', '==', 'active'));
        unsub1 = onSnapshot(q1, async (snap) => {
          const items1 = await seenToParent(snap.docs);
          setLinkedStudents(prev => {
            // merge with canonical stream in the other listener via union of ids
            const prevList = prev || [];
            const map = new Map(prevList.map(p => [p.id, p]));
            items1.forEach(p => map.set(p.id, p));
            const newList = Array.from(map.values());
            
            // State update will trigger re-render automatically, no need for manual refresh
            return newList;
          });
        });
        if (canonicalId && canonicalId.includes('-')) {
          const q2 = query(collection(db, 'parent_student_links'), where('studentIdNumber', '==', canonicalId), where('status', '==', 'active'));
          unsub2 = onSnapshot(q2, async (snap) => {
            const items2 = await seenToParent(snap.docs);
            setLinkedStudents(prev => {
              const prevList = prev || [];
              const map = new Map(prevList.map(p => [p.id, p]));
              items2.forEach(p => map.set(p.id, p));
              const newList = Array.from(map.values());
              
              // State update will trigger re-render automatically, no need for manual refresh
              return newList;
            });
          });
        }
      } catch {}
    };
    attach();
    return () => { try { unsub1 && unsub1(); } catch {} try { unsub2 && unsub2(); } catch {} };
  }, [user?.uid]);

  // Removed useEffect hooks that triggered refresh on state changes
  // State updates will trigger re-renders automatically, no need for manual refresh triggers

  const refreshScreen = () => { if (user?.uid) { loadLinkedStudents(); setIsSearching(false); setSearchParentName(''); } };
  const resetToNormalState = () => {
    setIsSearching(false);
    setSearchParentName('');
    const params = { searchActive: false, searchQuery: '' };
    try {
      // Set params on current route first
      navigation.setParams?.(params);
      const parentNav = navigation.getParent?.();
      if (parentNav) {
        parentNav.setParams?.(params);
      }
      
      // Navigate to ensure params propagate
      if (parentNav) {
        parentNav.navigate('Home', { screen: 'LinkParent', params });
      } else {
        navigation.navigate('LinkParent', params);
      }
    } catch {}
    loadLinkedStudents();
    
    // Navigate back to dashboard after reset
    try {
      const parentNav = navigation.getParent?.();
      if (parentNav) {
        parentNav.navigate('Home', { screen: 'StudentDashboard' });
      } else {
        navigation.navigate('StudentDashboard');
      }
    } catch {}
  };
  
  // Diagnostic function removed - no test notifications or test data
  useEffect(() => { if (user?.uid) refreshScreen(); else { setLoadingLinked(false); setLinkedStudents([]); setRequestedStudents([]); } }, [user?.uid]);
  useEffect(() => { const unsub = navigation.addListener('focus', () => { if (user?.uid) refreshScreen(); }); return unsub; }, [navigation, user?.uid]);
  useEffect(() => { if (isFocused && user?.uid) refreshScreen(); }, [isFocused, user?.uid]);
  // Reset search when navigating away
  useEffect(() => {
    const unsub = navigation.addListener('blur', () => {
      setIsSearching(false);
      setSearchParentName('');
    });
    return unsub;
  }, [navigation]);

  // Search driven by header params (searchActive, searchQuery)
  useEffect(() => {
    const active = route?.params?.searchActive === true;
    const q = route?.params?.searchQuery || '';
    setIsSearching(active);
    setSearchParentName(String(q));
  }, [route?.params?.searchActive, route?.params?.searchQuery]);

  // Search dataset (student searching parents) - with real-time updates
  useEffect(() => {
    if (isSearching && allParents.length === 0) {
      (async () => {
        try {
          const qSnap = await getDocs(query(collection(db, 'users'), where('role', '==', 'parent')));
          const parents = qSnap.docs.map(d => ({ id: d.id, uid: d.data().uid, ...d.data() }));
          setAllParents(parents);
        } catch { setAllParents([]); }
      })();
    }
  }, [isSearching]);


  // Comprehensive real-time listener for ALL parent_student_links involving this student
  // This ensures all link statuses update in real-time across the entire screen
  useEffect(() => {
    if (!user?.uid) return;
    let unsub1 = null, unsub2 = null;
    
    const attach = async () => {
      try {
        const canonicalId = await getCanonicalStudentDocId();
        const studentUid = String(user?.uid || '').trim();
        
        // Listener 1: Pending requests by studentId (UID)
        const qPending1 = query(
      collection(db, 'parent_student_links'),
          where('studentId', '==', studentUid),
      where('status', '==', 'pending')
    );
        unsub1 = onSnapshot(qPending1, (snap) => {
      try {
        const pendingByParent = {};
        const outgoingByParent = {};
        const outgoingList = [];

        snap.docs.forEach((d) => {
          const data = d.data() || {};
          const parentUid = String(data.parentId || '').trim();
          const parentCanonical = String(data.parentIdNumber || '').trim();
          const initiatedBy = String(data.initiatedBy || '').trim();
          const isStudentSender =
            initiatedBy === 'student' ||
                (!initiatedBy && String(data.studentId || '').trim() === studentUid);

          [parentUid, parentCanonical].filter(Boolean).forEach((key) => {
            pendingByParent[key] = true;
          });

          if (isStudentSender) {
            [parentUid, parentCanonical].filter(Boolean).forEach((key) => {
              outgoingByParent[key] = { linkId: d.id, parentUid, parentCanonical };
            });

            const parentName = String(data.parentName || '').trim();
            const [firstName = 'Parent', ...rest] = parentName.split(' ').filter(Boolean);

            outgoingList.push({
              id: parentUid || parentCanonical || d.id,
              linkId: d.id,
              firstName,
              lastName: rest.join(' '),
              studentId: parentCanonical || parentUid,
              requestedAt: data.requestedAt || new Date().toISOString(),
            });
          }
        });

            setPendingReqMap(prev => {
              const updated = { ...prev, ...pendingByParent };
              // Remove entries for parents that are no longer pending
              Object.keys(prev || {}).forEach(key => {
                if (!pendingByParent[key]) {
                  delete updated[key];
                }
              });
              return updated;
            });
            setSelfPendingMap(prev => {
              const updated = { ...prev, ...outgoingByParent };
              // Remove entries for parents that are no longer pending
              Object.keys(prev || {}).forEach(key => {
                if (!outgoingByParent[key]) {
                  delete updated[key];
                }
              });
              return updated;
            });
            setRequestedStudents(outgoingList);
            // State update will trigger re-render automatically
      } catch {}
    });
        
        // Listener 2: Pending requests by studentIdNumber (canonical)
        if (canonicalId && canonicalId.includes('-')) {
          const qPending2 = query(
            collection(db, 'parent_student_links'),
            where('studentIdNumber', '==', canonicalId),
            where('status', '==', 'pending')
          );
          unsub2 = onSnapshot(qPending2, (snap) => {
            try {
              const pendingByParent = {};
              const outgoingByParent = {};
              const outgoingList = [];

              snap.docs.forEach((d) => {
                const data = d.data() || {};
                const parentUid = String(data.parentId || '').trim();
                const parentCanonical = String(data.parentIdNumber || '').trim();
                const initiatedBy = String(data.initiatedBy || '').trim();
                const isStudentSender =
                  initiatedBy === 'student' ||
                  (!initiatedBy && String(data.studentIdNumber || '').trim() === canonicalId);

                [parentUid, parentCanonical].filter(Boolean).forEach((key) => {
                  pendingByParent[key] = true;
                });

                if (isStudentSender) {
                  [parentUid, parentCanonical].filter(Boolean).forEach((key) => {
                    outgoingByParent[key] = { linkId: d.id, parentUid, parentCanonical };
                  });

                  const parentName = String(data.parentName || '').trim();
                  const [firstName = 'Parent', ...rest] = parentName.split(' ').filter(Boolean);

                  outgoingList.push({
                    id: parentUid || parentCanonical || d.id,
                    linkId: d.id,
                    firstName,
                    lastName: rest.join(' '),
                    studentId: parentCanonical || parentUid,
                    requestedAt: data.requestedAt || new Date().toISOString(),
                  });
                }
              });

              setPendingReqMap(prev => {
                const updated = { ...prev, ...pendingByParent };
                Object.keys(prev || {}).forEach(key => {
                  if (!pendingByParent[key]) {
                    delete updated[key];
                  }
                });
                return updated;
              });
              setSelfPendingMap(prev => {
                const updated = { ...prev, ...outgoingByParent };
                Object.keys(prev || {}).forEach(key => {
                  if (!outgoingByParent[key]) {
                    delete updated[key];
                  }
                });
                return updated;
              });
              setRequestedStudents(prev => {
                const existingIds = new Set(prev.map(p => p.id));
                const newItems = outgoingList.filter(p => !existingIds.has(p.id));
                return [...prev, ...newItems];
              });
              // State update will trigger re-render automatically
            } catch {}
          });
        }
        
      } catch {}
    };
    
    attach();
    return () => {
      try { unsub1 && unsub1(); } catch {}
      try { unsub2 && unsub2(); } catch {}
    };
  }, [user?.uid]);

  const handleParentNameInput = (text) => setSearchParentName(text);
  const exitSearchMode = () => { setIsSearching(false); setSearchParentName(''); };
  const searchParentsByName = () => {
    const q = String(searchParentName || '').trim().toLowerCase();
    if (!q) return [];
    return allParents.filter(p => {
      const first = String(p.firstName || '').toLowerCase();
      const last = String(p.lastName || '').toLowerCase();
      const full = `${first} ${last}`.trim();
      return first.includes(q) || last.includes(q) || full.includes(q);
    });
  };

  // Open parent info modal, fetching by uid or by canonical parentId when necessary
  const openStudentInfo = (parent) => { 
    // Show modal immediately with available data for instant UI response
    setStudentInfoData(parent); 
    setStudentInfoVisible(true); 
    setStudentInfoLoading(true);
    
    // Fetch full data asynchronously without blocking UI
    // Use setTimeout to defer heavy operations and allow UI to render first
    setTimeout(async () => {
      try {
        const parentUid = String(parent?.uid || parent?.id || '').trim();
        const parentCanonicalId = String(parent?.studentId || parent?.parentId || '').trim();
        
        // Run all queries in parallel for better performance
        const queries = [];
        
        // Query 1: Try by UID
        if (parentUid && !parentUid.includes('-')) {
          queries.push(
            getDocs(query(collection(db, 'users'), where('uid', '==', parentUid), where('role', '==', 'parent')))
          );
        }
        
        // Query 2: Try by document ID (parentId)
        if (parentCanonicalId) {
          queries.push(
            getDoc(doc(db, 'users', parentCanonicalId)).catch(() => null)
          );
        }
        
        // Query 3: Try by parentId field
        if (parentCanonicalId) {
          queries.push(
            getDocs(query(collection(db, 'users'), where('parentId', '==', parentCanonicalId), where('role', '==', 'parent')))
          );
        }
        
        // Execute all queries in parallel
        const results = await Promise.all(queries);
        
        // Find the first successful result
        let snap = null;
        for (const result of results) {
          if (!result) continue;
          if (result.exists && result.exists()) {
            // It's a DocumentSnapshot
            snap = { docs: [result], empty: false };
            break;
          } else if (result.docs && result.docs.length > 0) {
            // It's a QuerySnapshot
            snap = result;
            break;
          }
        }
        
        if (snap && !snap.empty) {
          const data = snap.docs[0].data();
          setStudentInfoData({
            ...parent,
            uid: data.uid || parent.uid || parent.id,
            firstName: data.firstName || parent.firstName || '',
            lastName: data.lastName || parent.lastName || '',
            studentId: data.parentId || parentCanonicalId || parent.studentId || parent.id,
            email: data.email || '',
            contactNumber: data.contactNumber || '',
            gender: data.gender || '',
            birthday: data.birthday || '',
            address: data.address || '',
            parentId: data.parentId || parentCanonicalId
          });
        }
      } catch (error) {
        console.log('Error fetching parent data:', error);
      } finally {
        setStudentInfoLoading(false);
      }
    }, 0);
  };


  // Check if there is an existing pending link request (parent -> student)
  const ensurePendingRequest = async (studentUid) => {
    try {
      if (!studentUid || !user?.uid) return;
      if (pendingReqMap[studentUid] !== undefined && selfPendingMap[studentUid] !== undefined) return;
      const qRef = query(
        collection(db, 'parent_student_links'),
        where('parentId', '==', studentUid),
        where('studentId', '==', user.uid),
        where('status', '==', 'pending')
      );
      const snap = await getDocs(qRef);
      const hasRequest = !snap.empty;
      const docData = hasRequest ? (snap.docs[0].data() || {}) : {};
      const parentCanonical = String(docData.parentIdNumber || '').trim();
      const initiatedBy = String(docData.initiatedBy || '').trim();
      const isStudentSender =
        initiatedBy === 'student' ||
        (!initiatedBy && String(docData.studentId || '').trim() === String(user?.uid || '').trim());
      const linkId = hasRequest ? snap.docs[0].id : null;

      setPendingReqMap((prev) => {
        const updated = { ...prev };
        updated[studentUid] = hasRequest;
        if (parentCanonical) updated[parentCanonical] = hasRequest;
        return updated;
      });

      if (hasRequest && isStudentSender) {
        setSelfPendingMap((prev) => {
          const updated = { ...prev };
          [studentUid, parentCanonical].filter(Boolean).forEach((key) => {
            updated[key] = { linkId, parentUid: studentUid, parentCanonical };
          });
          return updated;
        });

        setRequestedStudents((prev) => {
          if (prev.find((p) => p.id === studentUid || p.studentId === parentCanonical)) return prev;
          const parentName = String(docData.parentName || '').trim();
          const [firstName = 'Parent', ...rest] = parentName.split(' ').filter(Boolean);
          return [
            ...prev,
            {
              id: studentUid,
              linkId,
              firstName,
              lastName: rest.join(' '),
              studentId: parentCanonical || studentUid,
              requestedAt: docData.requestedAt || new Date().toISOString(),
            },
          ];
        });
      }
    } catch {}
  };

  // Cancel pending link request (student -> parent)
  const cancelLinkRequest = async (parentData) => {
    if (!parentData || !user?.uid) return;
    try {
      const studentUid = String(user?.uid || '').trim();
      const studentCanonicalId = String(
        user?.studentId ||
        user?.studentID ||
        user?.studentNumber ||
        user?.lrn ||
        ''
      ).trim();
      const parentUid = String(parentData?.uid || parentData?.id || '').trim();
      const parentCanonicalId = String(
        parentData?.parentId ||
        parentData?.parentID ||
        parentData?.parentNumber ||
        ''
      ).trim();
      if (!studentUid || !parentUid) return;

      const deterministicId = parentCanonicalId && studentCanonicalId
        ? `${parentCanonicalId}-${studentCanonicalId}`
        : null;
      const pendingKeys = [parentUid, parentCanonicalId].filter(Boolean);

      const qRef = query(
        collection(db, 'parent_student_links'),
        where('studentId', '==', studentUid),
        where('parentId', '==', parentUid),
        where('status', '==', 'pending')
      );
      const snap = await getDocs(qRef);
      let targets = snap.docs;

      if ((!targets || targets.length === 0) && deterministicId) {
        try {
          const deterministicRef = doc(db, 'parent_student_links', deterministicId);
          const deterministicSnap = await getDoc(deterministicRef);
          if (deterministicSnap.exists()) {
            targets = [{ ref: deterministicRef }];
          }
        } catch {
          targets = [];
        }
      }

      if (!targets || targets.length === 0) return;

      await Promise.all(targets.map((entry) => deleteDoc(entry.ref)));

      // Remove the corresponding alert from the parent's alerts doc, if present
      if (parentCanonicalId && deterministicId) {
        try {
          const alertsRef = doc(db, 'parent_alerts', parentCanonicalId);
          const alertsSnap = await getDoc(alertsRef);
          if (alertsSnap.exists()) {
            const items = Array.isArray(alertsSnap.data()?.items) ? alertsSnap.data().items : [];
            const filtered = items.filter((item) => !(item?.type === 'link_request' && item?.linkId === deterministicId));
            if (filtered.length !== items.length) {
              await setDoc(alertsRef, { items: filtered }, { merge: true });
            }
          }
        } catch {}
      }

      setPendingReqMap((prev) => {
        const updated = { ...prev };
        pendingKeys.forEach((key) => { if (key) delete updated[key]; });
        return updated;
      });
      setSelfPendingMap((prev) => {
        const updated = { ...prev };
        pendingKeys.forEach((key) => { if (key) delete updated[key]; });
        return updated;
      });
      setRequestedStudents((prev) => prev.filter((req) => !pendingKeys.includes(req.id) && !pendingKeys.includes(req.studentId)));

      setFeedbackSuccess(true);
      setFeedbackTitle('Success');
      setFeedbackMessage('Link request cancelled successfully');
      setFeedbackVisible(true);
      setTimeout(() => {
        setFeedbackVisible(false);
        resetToNormalState();
      }, 3000);
    } catch (error) {
      setFeedbackSuccess(false);
      setFeedbackTitle('Error');
      setFeedbackMessage(error.message || 'Failed to cancel request.');
      setFeedbackVisible(true);
      setTimeout(() => {
        setFeedbackVisible(false);
        resetToNormalState();
      }, 3000);
      throw error;
    }
  };

  const confirmCancelLinkRequest = async () => {
    if (!cancelRequestTarget) return;
    try {
      setCancelingRequest(true);
      await cancelLinkRequest(cancelRequestTarget);
      // Close confirmation modal after processing, feedback will show
      setCancelRequestConfirmVisible(false);
      setCancelRequestTarget(null);
      setStudentInfoVisible(false);
    } catch {
      // feedback already handled in cancelLinkRequest
      setCancelRequestConfirmVisible(false);
      setCancelRequestTarget(null);
      setStudentInfoVisible(false);
    } finally {
      setCancelingRequest(false);
    }
  };

  // Send link request (parent -> student)
  const sendLinkRequest = async (studentData) => {
    try {
      if (!studentData || !user?.uid) { Alert.alert('Error', 'Missing required information.'); return; }
      const studentUid = String(user?.uid || '').trim();
      const studentCanonicalId = String(
        user?.studentId ||
        user?.studentID ||
        user?.studentIdNumber ||
        user?.studentNumber ||
        user?.lrn ||
        studentUid
      ).trim();
      const parentUid = String(studentData?.uid || studentData?.id || '').trim();
      const parentCanonicalId = String(
        studentData?.parentId ||
        studentData?.parentID ||
        studentData?.parentIdNumber ||
        studentData?.parentNumber ||
        parentUid
      ).trim();

      if (!studentUid || !parentUid) {
        Alert.alert('Error', 'Missing required information.');
        return;
      }
      
      // Parent link limit check removed - students can now link freely to any parent
      
      // Check internet connection before proceeding
      if (!isConnected) {
        setFeedbackSuccess(false);
        setFeedbackTitle('No Internet Connection');
        setFeedbackMessage('Unable to link parent. Please check your internet connection and try again.');
        setFeedbackVisible(true);
        setTimeout(() => {
          setFeedbackVisible(false);
          resetToNormalState();
        }, 3000);
        return;
      }
      
      setLinkingStudent(true);
      // Prevent duplicate pending
      const dupQueryRef = query(
        collection(db, 'parent_student_links'),
        where('studentId', '==', studentUid),
        where('parentId', '==', parentUid),
        where('status', '==', 'pending')
      );
      const dupSnap = await getDocs(dupQueryRef);
      if (!dupSnap.empty) { 
      // Optimistic local update so UI reflects immediately
      setPendingReqMap(prev => {
        const updated = { ...prev };
        [parentUid, parentCanonicalId].filter(Boolean).forEach((key) => { updated[key] = true; });
        return updated;
      });
      setSelfPendingMap(prev => {
        const updated = { ...prev };
        [parentUid, parentCanonicalId].filter(Boolean).forEach((key) => { updated[key] = { linkId: dupSnap.docs[0].id, parentUid, parentCanonical: parentCanonicalId }; });
        return updated;
      });
      setRequestedStudents(prev => (
        prev.find(p => p.id === parentUid || p.studentId === parentCanonicalId)
          ? prev
          : [
              ...prev,
              {
                id: parentUid,
                linkId: dupSnap.docs[0].id,
                firstName: studentData.firstName,
                lastName: studentData.lastName,
                studentId: parentCanonicalId || parentUid,
                requestedAt: new Date().toISOString(),
              },
            ]
      ));
      setFeedbackSuccess(false);
      setFeedbackTitle('Info');
      setFeedbackMessage('Request already sent. Please wait for a response.');
      setFeedbackVisible(true);
      setTimeout(() => {
        setFeedbackVisible(false);
        resetToNormalState();
      }, 3000);
      return; 
      }
      const linkData = {
        parentId: parentUid,
        studentId: studentUid,
        parentIdNumber: parentCanonicalId,
        studentIdNumber: studentCanonicalId,
        parentName: `${studentData.firstName || ''} ${studentData.lastName || ''}`.trim() || studentData.email,
        studentName: `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email,
        requestedAt: new Date().toISOString(),
        status: 'pending',
        initiatedBy: 'student',
      };
      const deterministicId = parentCanonicalId && studentCanonicalId
        ? `${parentCanonicalId}-${studentCanonicalId}`
        : `${parentUid}-${studentUid}`;
      await setDoc(doc(db, 'parent_student_links', deterministicId), linkData);
      // Notify parent using canonical parentId only
      if (parentCanonicalId) {
        const newAlert = {
          id: `${deterministicId}_request_${Date.now()}`,
          type: 'link_request',
          title: 'Student Link Request',
          message: `${linkData.studentName} requests to link.`,
          createdAt: new Date().toISOString(),
          status: 'unread',
          parentId: linkData.parentId,
          studentId: linkData.studentId,
          linkId: deterministicId,
          studentName: linkData.studentName,
        };
        try {
          await updateDoc(doc(db, 'parent_alerts', parentCanonicalId), {
          items: arrayUnion(newAlert),
        });
        // Send push notification via backend API (works even when app is closed)
        // Removed: sendAlertPushNotification - backend handles all push notifications automatically
        Promise.resolve().catch(err => 
          console.warn('Push notification failed (non-blocking):', err)
        );
      } catch (_) {
        await setDoc(
          doc(db, 'parent_alerts', parentCanonicalId),
          {
            items: [
              {
                id: `${deterministicId}_request_${Date.now()}`,
                type: 'link_request',
                title: 'Student Link Request',
                message: `${linkData.studentName} requests to link.`,
                createdAt: new Date().toISOString(),
                status: 'unread',
                parentId: linkData.parentId,
                studentId: linkData.studentId,
                linkId: deterministicId,
              },
            ],
          },
          { merge: true }
        );
      }
      }
      // Optimistic local update so UI reflects immediately
      setPendingReqMap(prev => {
        const updated = { ...prev };
        [parentUid, parentCanonicalId].filter(Boolean).forEach((key) => { updated[key] = true; });
        return updated;
      });
      setSelfPendingMap(prev => {
        const updated = { ...prev };
        [parentUid, parentCanonicalId].filter(Boolean).forEach((key) => { updated[key] = { linkId: deterministicId, parentUid, parentCanonical: parentCanonicalId }; });
        return updated;
      });
      setRequestedStudents(prev => (
        prev.find(p => p.id === parentUid || p.studentId === parentCanonicalId)
          ? prev
          : [
              ...prev,
              {
                id: parentUid,
                linkId: deterministicId,
                firstName: studentData.firstName,
                lastName: studentData.lastName,
                studentId: parentCanonicalId || parentUid,
                requestedAt: linkData.requestedAt,
              },
            ]
      ));
      // Close confirm modal immediately, then show feedback
      setLinkStudentConfirmVisible(false);
      setFeedbackSuccess(true);
      setFeedbackTitle('Success');
      setFeedbackMessage('Request sent successfully');
      setFeedbackVisible(true);
      setTimeout(() => {
        setFeedbackVisible(false);
        setStudentInfoVisible(false);
        resetToNormalState();
        // Navigate back to dashboard
        try {
          const parent = navigation.getParent?.();
          if (parent) parent.navigate('Home', { screen: 'StudentDashboard' });
          else navigation.navigate('StudentDashboard');
        } catch {}
      }, 3000);
    } catch (error) {
      console.error('Error sending link request:', error);
      setLinkStudentConfirmVisible(false);
      setFeedbackSuccess(false);
      setFeedbackTitle('Error');
      setFeedbackMessage(error.message || 'Failed to send request.');
      setFeedbackVisible(true);
      setTimeout(() => {
        setFeedbackVisible(false);
        resetToNormalState();
      }, 3000);
    } finally { setLinkingStudent(false); }
  };

  // Unlink student
  const unlinkStudent = (student) => {
    if (!student || !student.linkId) {
      setFeedbackSuccess(false);
      setFeedbackTitle('Error');
      setFeedbackMessage('Invalid student data. Please try again.');
      setFeedbackVisible(true);
      setTimeout(() => {
        setFeedbackVisible(false);
        resetToNormalState();
      }, 3000);
      return;
    }
    setUnlinkStudentData(student);
    // Close student info modal immediately when confirmation modal opens
    setStudentInfoVisible(false);
    setUnlinkConfirmVisible(true);
  };

  const handleUnlinkConfirm = async () => {
    if (!unlinkStudentData) return;
    try {
      setUnlinking(true);
      await deleteDoc(doc(db, 'parent_student_links', unlinkStudentData.linkId));

      // Delete the conversation between parent and student
      // unlinkStudentData contains parent data, user is the student
      // Collect all possible ID formats to ensure we find the conversation
      const canonicalStudentId = await getCanonicalStudentDocId();
      const studentIds = [
        canonicalStudentId,
        user?.studentId,
        user?.studentIdNumber,
        user?.uid
      ].filter(Boolean);
      const parentIds = [
        unlinkStudentData.id,
        unlinkStudentData.uid,
        unlinkStudentData.parentId,
        unlinkStudentData.parentIdNumber
      ].filter(Boolean);
      if (studentIds.length > 0 && parentIds.length > 0) {
        await deleteConversationOnUnlink(studentIds, parentIds);
      }

      // Delete all student-to-student conversations for this student
      // Students can only message each other if they share a linked parent
      if (studentIds.length > 0) {
        await deleteAllStudentToStudentConversations(studentIds);
      }

      // Cleanup: remove any ongoing "Class Happening Now" alerts for this student from the parent's alerts doc
      try {
        // Get parent's canonical ID from unlinkStudentData
        const parentUid = String(unlinkStudentData.id || unlinkStudentData.uid || '').trim();
        const parentCanonicalId = String(unlinkStudentData.studentId || unlinkStudentData.parentId || '').trim();
        const candidateDocIds = Array.from(new Set([parentCanonicalId, parentUid].filter(Boolean)));
        for (const pid of candidateDocIds) {
          try {
            const parentAlertsRef = doc(db, 'parent_alerts', pid);
            const pSnap = await getDoc(parentAlertsRef);
            if (!pSnap.exists()) continue;
            const pItems = Array.isArray(pSnap.data()?.items) ? pSnap.data().items : [];
            const studentCanonicalId = await getCanonicalStudentDocId();
            const filtered = pItems.filter(it => !(it?.type === 'schedule_current' && String(it?.studentId || '') === String(studentCanonicalId || '')));
            if (filtered.length !== pItems.length) {
              await setDoc(parentAlertsRef, { items: filtered }, { merge: true });
            }
          } catch {}
        }
      } catch (_) {}
      
      // Notify both parties about the unlink
      try {
        const nowIso = new Date().toISOString();
        const parentName = `${unlinkStudentData.firstName || 'Parent'} ${unlinkStudentData.lastName || ''}`.trim();
        
        // Get current student's canonical ID
        const studentCanonicalId = await getCanonicalStudentDocId();
        
        // Notification for the student (current user) - student initiated the unlink, so no push notification needed
        if (studentCanonicalId) {
          const studentNotif = {
            id: `unlink_${unlinkStudentData.linkId}_${Date.now()}`,
            type: 'link_unlinked_self',
            title: 'Parent Unlinked',
            message: `You unlinked ${parentName || 'the parent'}.`,
            createdAt: nowIso,
            status: 'read', // Mark as read since student initiated the action
            parentId: unlinkStudentData.id || unlinkStudentData.uid,
            parentName: parentName || 'Parent',
            studentId: studentCanonicalId,
            studentName: `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'Student',
            relationship: unlinkStudentData.relationship || '',
            linkId: unlinkStudentData.linkId,
            skipPushNotification: true // Flag to prevent push notification (backend can check this)
          };
          
          try {
            const docRef = doc(db, 'student_alerts', studentCanonicalId);
            await updateDoc(docRef, { items: arrayUnion(studentNotif) });
          } catch (updateErr) {
            try {
              const snap = await getDoc(doc(db, 'student_alerts', studentCanonicalId));
              const baseItems = snap.exists() ? (Array.isArray(snap.data()?.items) ? snap.data().items : []) : [];
              await setDoc(doc(db, 'student_alerts', studentCanonicalId), { items: [...baseItems, studentNotif] }, { merge: true });
            } catch (setDocErr) {
              console.log('Failed to send student unlink notification:', setDocErr);
            }
          }
        }
        
        // Notification for the parent - student initiated the unlink, parent should be notified
        const parentUid = String(unlinkStudentData.id || unlinkStudentData.uid || '').trim();
        const parentCanonicalId = String(unlinkStudentData.studentId || unlinkStudentData.parentId || '').trim();
        const parentDocId = parentCanonicalId && parentCanonicalId.includes('-') ? parentCanonicalId : parentUid;
        
        if (parentDocId) {
          const studentName = `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'the student';
          const parentNotif = {
            id: `${unlinkStudentData.linkId}_unlinked_${Date.now()}`,
            type: 'link_unlinked',
            title: 'Student Unlinked',
            message: `${studentName} unlinked from you.`,
            createdAt: nowIso,
            status: 'unread',
            parentId: parentDocId,
            studentId: studentCanonicalId,
            studentName: studentName,
            linkId: unlinkStudentData.linkId
          };
          
          try {
            await updateDoc(doc(db, 'parent_alerts', parentDocId), { items: arrayUnion(parentNotif) });
          } catch (_) {
            try {
              await setDoc(doc(db, 'parent_alerts', parentDocId), { items: [parentNotif] }, { merge: true });
            } catch (setDocErr) {
              console.log('Failed to send parent unlink notification:', setDocErr);
            }
          }
        }
      } catch (notifyErr) {
        console.log('Unlink notification failed:', notifyErr);
      }
      
      // Close confirm and any info modal immediately upon success
      setUnlinkConfirmVisible(false);
      setStudentInfoVisible(false);
      setUnlinkStudentData(null);
      loadLinkedStudents();
      setFeedbackSuccess(true);
      setFeedbackTitle('Success');
      setFeedbackMessage(`${unlinkStudentData.firstName} has been unlinked successfully`);
      setFeedbackVisible(true);
      setTimeout(() => {
        setFeedbackVisible(false);
        resetToNormalState();
      }, 3000);
    } catch (error) {
      console.error('Error unlinking parent:', error);
      setFeedbackSuccess(false);
      setFeedbackTitle('Error');
      setFeedbackMessage(error.message || 'Failed to unlink student.');
      // Close confirm and any info modal immediately upon failure as well
      setUnlinkConfirmVisible(false);
      setStudentInfoVisible(false);
      loadLinkedStudents();
      setFeedbackVisible(true);
      setTimeout(() => {
        setFeedbackVisible(false);
        resetToNormalState();
      }, 3000);
    } finally {
      setUnlinking(false);
    }
  };


  return (
    <>
      <View style={styles.wrapper}>
        {/* Sidebar removed */}

        {/* Sidebar removed; unified header handles it */}


        {/* In-screen header removed; unified header used */}

        {/* Content */}
        {isSearching ? (
          <View 
            style={{ flex: 1 }}
          >
              {(() => {
                const results = searchParentsByName();
                if (!searchParentName.trim()) {
                  return (
                    <View style={{ flex: 1, padding: 16, paddingTop: 50, paddingBottom: 120 }}>
                    <View style={styles.centerContainer}>
                      {allParents.length === 0 ? (
                          <View style={{ backgroundColor: '#FFFFFF', width: '100%', height: 200 }} />
                      ) : (
                        <View style={styles.emptyCard}>
                          <View style={styles.emptyIconWrap}><Ionicons name="search" size={24} color="#2563EB" /></View>
                          <Text style={styles.emptyTitle}>Start typing a name</Text>
                          <Text style={styles.emptySubtext}>Use the search field in the header to find a parent by name.</Text>
                        </View>
                      )}
                      </View>
                    </View>
                  );
                }
                if (allParents.length === 0) {
                  return (
                    <View style={{ flex: 1, backgroundColor: '#FFFFFF' }} />
                  );
                }
                if (results.length === 0) {
                  return (
                    <View style={styles.centerContainer}>
                      <View style={styles.emptyCard}>
                        <View style={styles.emptyIconWrap}><Ionicons name="search" size={24} color="#2563EB" /></View>
                        <Text style={styles.emptyTitle}>No results</Text>
                        <Text style={styles.emptySubtext}>Try a different name or check the spelling.</Text>
                      </View>
                    </View>
                  );
                }

                return (
                  <View style={{ flex: 1, width: '100%' }}>
                    <View style={styles.searchSeparator} />
                    <FlatList
                      style={{ flex: 1 }}
                      data={results}
                      keyExtractor={(item) => item.uid || item.id}
                      extraData={refreshCounter}
                      removeClippedSubviews={true}
                      maxToRenderPerBatch={10}
                      updateCellsBatchingPeriod={50}
                      initialNumToRender={10}
                      windowSize={10}
                      renderItem={({ item: parent }) => {
                      const isLinked = linkedStudents.find(p => {
                        const sid = String(p.id || '').trim();
                        const sidNum = String(p.studentId || '').trim();
                        const puid = String(parent.uid || '').trim();
                        const pParentId = String(parent.parentId || parent.studentId || '').trim();
                        return (sid && (sid === puid || sid === pParentId)) || (sidNum && (sidNum === puid || sidNum === pParentId));
                      });
                      const isRequestedLocal = requestedStudents.find(p => p.id === parent.uid);
                      // Check pending request status - use existing map, don't trigger async calls during render
                      const isRequested = !!isRequestedLocal || !!pendingReqMap[parent.uid];
                      // Lazy-check if a pending request exists (defer to avoid blocking render)
                      if (!isLinked && pendingReqMap[parent.uid] === undefined && !isRequestedLocal) {
                        // Defer the check to avoid blocking UI
                        setTimeout(() => {
                          ensurePendingRequest(parent.uid).catch(() => {});
                        }, 100);
                      }
                      let badgeView = null;
                      if (isLinked) {
                        badgeView = (
                          <View style={styles.badgeLinkedBlue}><Text style={styles.badgeLinkedBlueText}>Linked</Text></View>
                        );
                      } else if (isRequested) {
                        badgeView = (
                          <View style={styles.requestedBadge}><Text style={styles.requestedBadgeText}>Sent</Text></View>
                        );
                      } else {
                        badgeView = (
                          <View style={styles.badgeLinkGreen}><Text style={styles.badgeLinkGreenText}>Link</Text></View>
                        );
                      }
                        return (
                          <View style={styles.studentRow}>
                            <View style={styles.studentAvatar}>
                              <Text style={styles.studentInitials}>{(parent.firstName?.[0] || 'P').toUpperCase()}</Text>
                            </View>
                            <TouchableOpacity 
                              style={{ flex: 1 }} 
                              activeOpacity={0.7} 
                              onPress={() => {
                                if (isLinked) {
                                  // Hide tab bar immediately before navigation to prevent any flash
                                  // Need to access Tab navigator (two levels up)
                                  const homeStack = navigation.getParent?.();
                                  const tabNavigator = homeStack?.getParent?.();
                                  
                                  if (tabNavigator) {
                                    tabNavigator.setOptions({ tabBarStyle: { display: 'none' } });
                                  } else if (homeStack) {
                                    homeStack.setOptions({ tabBarStyle: { display: 'none' } });
                                  }
                                  
                                  // Navigate to ParentProfile for linked parents
                                  // Pass complete parent object with all fields, ensuring linkId is included
                                  const parentData = {
                                    ...parent, // Include all fields from search result
                                    id: parent.id || parent.uid || parent.parentId,
                                    uid: parent.uid || parent.id,
                                    parentId: parent.parentId || parent.studentId,
                                    linkId: isLinked?.linkId || isLinked?.id || parent.linkId
                                  };
                                  
                                  if (homeStack) {
                                    homeStack.navigate('Home', { 
                                      screen: 'ParentProfile', 
                                      params: { parent: parentData }
                                    });
                                  } else {
                                    navigation.navigate('ParentProfile', { parent: parentData });
                                  }
                                } else {
                                  // Open modal for non-linked parents
                                  openStudentInfo(parent);
                                }
                              }}
                            >
                              <Text style={styles.studentName}>{(() => {
                                const first = String(parent.firstName || '').trim();
                                const last = String(parent.lastName || '').trim();
                                const mid = String(parent.middleName || parent.middle || parent.middleInitial || '').trim();
                                const mi = mid ? ` ${mid.charAt(0).toUpperCase()}.` : '';
                                return `${last}${last && (first || mi) ? ', ' : ''}${first}${mi}`.trim() || (parent.parentId || parent.studentId || '');
                              })()}</Text>
                              {parent.parentId || parent.studentId ? <Text style={styles.studentMeta}>ID: {parent.parentId || parent.studentId}</Text> : null}
                            </TouchableOpacity>
                            <View style={styles.studentActions}>{badgeView}</View>
                          </View>
                        );
                      }}
                      contentContainerStyle={[styles.listContainer, { padding: 16, paddingBottom: 120, paddingTop: 0 }]}
                      showsVerticalScrollIndicator={true}
                    />
                    {/* Removed nav tab separator as there is no tab bar here */}
                  </View>
                );
              })()}
          </View>
        ) : (
          <View style={{ flex: 1 }}>
            {loadingLinked ? (
              <View style={{ flex: 1, backgroundColor: '#FFFFFF' }} />
            ) : loadError ? (
              <View style={[styles.centerContainer, { paddingHorizontal: 16, paddingTop: 0, paddingBottom: 120 }]}>
                <View style={styles.errorContainer}>
                  <Ionicons name="alert-circle-outline" size={48} color="#DC2626" />
                  <Text style={styles.errorTitle}>Failed to load students</Text>
                  <Text style={styles.errorSubtitle}>{loadError}</Text>
                  <TouchableOpacity style={styles.retryButton} onPress={loadLinkedStudents}>
                    <Text style={styles.retryButtonText}>Retry</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : linkedStudents.length > 0 ? (
              <FlatList
                style={{ flex: 1 }}
                data={linkedStudents}
                keyExtractor={(item) => item.id}
                numColumns={1}
                contentContainerStyle={{ padding: 16, paddingTop: 0, paddingBottom: 120 }}
                columnWrapperStyle={null}
                showsVerticalScrollIndicator={true}
                ListHeaderComponent={(
                  <View style={styles.infoCardContainer}>
                    <View style={styles.infoCard}>
                      <View style={styles.infoRow}>
                        <View style={styles.infoIconWrap}>
                          <Ionicons name="people-outline" size={20} color="#2563EB" />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.infoTitle}>Linked Parents</Text>
                          <Text style={styles.infoSub}>Parents linked to your account.</Text>
                        </View>
                      </View>
                    </View>
                  </View>
                )}
                renderItem={({ item }) => (
                  <View style={[styles.modernStudentCard, styles.blockCard, styles.gridItem, styles.fixedCard]}>
                    <View style={styles.cardHeader}>
                      <View style={styles.modernAvatar}>
                        <View style={styles.avatarOctagonMedium} />
                        <Text style={[styles.modernAvatarText, styles.avatarInitialOnBlue]}>{item.firstName?.charAt(0) || 'S'}</Text>
                      </View>
                      <View style={styles.cardHeaderInfo}>
                        <Text style={styles.modernStudentName} numberOfLines={1} ellipsizeMode="tail">{item.firstName} {item.lastName || ''}</Text>
                      </View>
                    </View>
                    <View style={styles.cardContent}>
                      <View style={styles.fullScreenInfoSection}>
                        <View style={styles.fullScreenInfoItem}>
                          <View style={styles.iconWrapper}>
                            <Ionicons name="card" size={22} color="#004f89" />
                          </View>
                          <Text style={styles.fullScreenInfoLabel}>Parent ID</Text>
                          <Text style={styles.fullScreenInfoValue}>
                            {item.studentId || 'N/A'}
                          </Text>
                        </View>
                        <View style={styles.verticalSeparator} />
                        <View style={styles.fullScreenInfoItem}>
                          <View style={styles.iconWrapper}>
                            <Ionicons name="calendar" size={22} color="#004f89" />
                          </View>
                          <Text style={styles.fullScreenInfoLabel}>Linked Date</Text>
                          <Text style={styles.fullScreenInfoValue}>
                            {item.linkedAt ? new Date(item.linkedAt).toLocaleDateString() : 'Recently'}
                          </Text>
                        </View>
                      </View>
                      <TouchableOpacity 
                        style={styles.viewDetailsButton}
                        onPress={() => {
                          // Pass complete parent object with all fields
                          const parentData = {
                            ...item, // Include all fields from linked parent
                            id: item.id || item.uid || item.parentId,
                            uid: item.uid || item.id,
                            parentId: item.parentId || item.studentId,
                            linkId: item.linkId
                          };
                          
                          const parentNav = navigation.getParent?.();
                          if (parentNav) {
                            parentNav.navigate('Home', { 
                              screen: 'ParentProfile', 
                              params: { parent: parentData }
                            });
                          } else {
                            navigation.navigate('ParentProfile', { parent: parentData });
                          }
                        }}
                      >
                        <Text style={styles.viewDetailsLabel}>View Details</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
              />
            ) : (
              <ScrollView 
                style={{ flex: 1 }}
                contentContainerStyle={{ padding: 16, paddingTop: 50, paddingBottom: 120, flexGrow: 1 }}
                showsVerticalScrollIndicator={false}
              >
                <View style={styles.centerContainer}>
                  <View style={styles.emptyCard}>
                    <View style={styles.emptyIconWrap}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
                        <Ionicons name="person-outline" size={24} color="#2563EB" />
                        <Ionicons name="add-circle" size={16} color="#2563EB" style={{ marginLeft: -8, marginTop: -8 }} />
                      </View>
                    </View>
                    <Text style={styles.emptyTitle}>Link Parents</Text>
                    <Text style={styles.emptySubtext}>You haven't linked any parents yet. Search for parents by name to establish a connection.</Text>
                    <TouchableOpacity style={styles.primaryButton} onPress={() => {
                      const parentNav = navigation.getParent?.();
                      if (parentNav) {
                        parentNav.navigate('Home', { screen: 'LinkParent', params: { searchActive: true, searchQuery: '' } });
                      } else {
                        navigation.navigate('LinkParent', { searchActive: true, searchQuery: '' });
                      }
                    }}>
                      <Ionicons name="link" size={16} color="#fff" />
                      <Text style={styles.primaryButtonText}>Link Parents</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </ScrollView>
            )}
          </View>
        )}

        {/* Link Parents Confirmation Modal (schedule-style) */}
        <Modal
          transparent
          animationType="fade"
          visible={linkStudentConfirmVisible}
          onRequestClose={() => !linkingStudent && setLinkStudentConfirmVisible(false)}
        >
          <View style={styles.modalOverlayCenter}>
            <View style={styles.fbModalCard}>
              <View style={styles.fbModalContent}>
                <Text style={styles.fbModalTitle}>Send link request?</Text>
                <Text style={styles.fbModalMessage}>
                  Send link request to {selectedStudentForLink?.firstName} {selectedStudentForLink?.lastName}? They will receive a notification and can approve or decline.
                </Text>
              </View>
              <View style={styles.fbModalButtonContainer}>
                <TouchableOpacity
                  style={[styles.fbModalCancelButton, linkingStudent && styles.fbModalButtonDisabled]}
                  onPress={() => !linkingStudent && setLinkStudentConfirmVisible(false)}
                  disabled={linkingStudent}
                >
                  <Text style={styles.fbModalCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.fbModalConfirmButton,
                    { backgroundColor: '#004f89' },
                    linkingStudent && styles.fbModalButtonDisabled,
                  ]}
                  onPress={async () => {
                    if (!linkingStudent) {
                      await sendLinkRequest(selectedStudentForLink);
                    }
                  }}
                  disabled={linkingStudent}
                >
                  <Text style={styles.fbModalConfirmText}>
                    {linkingStudent ? 'Sending...' : 'Confirm'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* Logout Confirmation Modal (schedule-style) */}
        <Modal
          transparent
          animationType="fade"
          visible={logoutVisible}
          onRequestClose={() => setLogoutVisible(false)}
        >
          <View style={styles.modalOverlayCenter}>
            <View style={styles.fbModalCard}>
              <View style={styles.fbModalContent}>
                <Text style={styles.fbModalTitle}>Logout?</Text>
                <Text style={styles.fbModalMessage}>Are you sure you want to logout?</Text>
              </View>
              <View style={styles.fbModalButtonContainer}>
                <TouchableOpacity
                  style={styles.fbModalCancelButton}
                  onPress={() => setLogoutVisible(false)}
                >
                  <Text style={styles.fbModalCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.fbModalConfirmButton,
                    { backgroundColor: '#DC2626' },
                  ]}
                  onPress={async () => {
                    setLogoutVisible(false);
                    try { await logout?.(); } catch {}
                  }}
                >
                  <Text style={styles.fbModalConfirmText}>Logout</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* Unlink Confirmation Modal (schedule-style) */}
        <Modal
          transparent
          animationType="fade"
          visible={unlinkConfirmVisible}
          onRequestClose={() => !unlinking && setUnlinkConfirmVisible(false)}
        >
          <View style={styles.modalOverlayCenter}>
            <View style={styles.fbModalCard}>
              <View style={styles.fbModalContent}>
                <Text style={styles.fbModalTitle}>Unlink student?</Text>
                <Text style={styles.fbModalMessage}>
                  Are you sure you want to unlink {unlinkStudentData?.firstName} {unlinkStudentData?.lastName}? This action cannot be undone.
                </Text>
              </View>
              <View style={styles.fbModalButtonContainer}>
                <TouchableOpacity
                  style={[styles.fbModalCancelButton, unlinking && styles.fbModalButtonDisabled]}
                  onPress={() => !unlinking && setUnlinkConfirmVisible(false)}
                  disabled={unlinking}
                >
                  <Text style={styles.fbModalCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.fbModalConfirmButton,
                    { backgroundColor: '#8B0000' },
                    unlinking && styles.fbModalButtonDisabled,
                  ]}
                  onPress={handleUnlinkConfirm}
                  disabled={unlinking}
                >
                  <Text style={styles.fbModalConfirmText}>
                    {unlinking ? 'Unlinking...' : 'Confirm'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* Action Feedback Modal (schedule-style) */}
        <Modal
          transparent
          animationType="fade"
          visible={feedbackVisible}
          onRequestClose={() => setFeedbackVisible(false)}
        >
          <View style={styles.modalOverlayCenter}>
            <View style={styles.fbModalCard}>
              <View style={styles.fbModalContent}>
                <Text
                  style={[
                    styles.fbModalTitle,
                    { color: feedbackSuccess ? '#16A34A' : '#DC2626' },
                  ]}
                >
                  {feedbackTitle || (feedbackSuccess ? 'Success' : 'Error')}
                </Text>
                {feedbackMessage ? (
                  <Text style={styles.fbModalMessage}>{feedbackMessage}</Text>
                ) : null}
              </View>
            </View>
          </View>
        </Modal>

        {/* Student Info Modal - Ultra Modern Design */}
        <Modal transparent animationType="fade" visible={studentInfoVisible} onRequestClose={() => { setStudentInfoVisible(false); setStudentInfoData(null); }}>
          <View style={styles.modernModalOverlay}>
            <View style={styles.modernModalCard}>
              <View style={styles.modernModalHeader}>
                <View style={styles.modernHeaderGradient}>
                  <View style={styles.modernHeaderContent}>
                    <View style={styles.modernAvatar}>
                      <View style={styles.avatarOctagonMedium} />
                      <Text style={[styles.modernAvatarText, styles.avatarInitialOnBlue]}>
                        {(studentInfoData?.firstName?.[0] || 'S').toUpperCase()}
                      </Text>
                    </View>
                    <View style={styles.modernHeaderInfo}>
                      <Text style={styles.modernName}>
                        {studentInfoData?.firstName} {studentInfoData?.lastName}
                      </Text>
                      <Text style={styles.modernId}>Parent ID: {studentInfoData?.studentId || studentInfoData?.parentId || 'N/A'}</Text>
                    </View>
                  </View>
                  <TouchableOpacity onPress={() => { setStudentInfoVisible(false); setStudentInfoData(null); }} style={styles.modernCloseBtn}>
                    <Ionicons name="close" size={20} color="#FFFFFF" />
                  </TouchableOpacity>
                </View>
              </View>
              
              {(() => {
                const isLinkedFull = linkedStudents.find(s => {
                  const sid = String(s.id || '').trim();
                  const sidNum = String(s.studentId || '').trim();
                  const puid = String(studentInfoData?.uid || '').trim();
                  const pStuId = String(studentInfoData?.studentId || '').trim();
                  return (sid && (sid === puid || sid === pStuId)) || (sidNum && (sidNum === puid || sidNum === pStuId));
                });
                const isRequested = requestedStudents.find(s => s.id === studentInfoData?.uid) || pendingReqMap[studentInfoData?.uid];

                // If not linked, always hide details. Show the info-unavailable card unconditionally when not linked.
                if (!isLinkedFull) {
                  return (
                    <View style={styles.modernMessageCard}>
                      <View style={styles.modernMessageIcon}>
                        <Ionicons name="information-circle" size={24} color="#3B82F6" />
                      </View>
                      <Text style={styles.modernMessageTitle}>Information Unavailable</Text>
                      <Text style={styles.modernMessageText}>
                        Link with this parent first to access their detailed information and contact details.
                      </Text>
                    </View>
                  );
                }

                // Show normal info grid only if parent is linked to this student
                return (
                  <View style={styles.modernInfoGrid}>
                    {studentInfoLoading ? (
                      <View style={[styles.modernLoadingContainer, { backgroundColor: '#FFFFFF' }]} />
                    ) : (
                      <>
                        <View style={styles.modernInfoItem}>
                          <Ionicons name="mail" size={16} color="#6B7280" />
                          <Text style={styles.modernInfoLabel}>Email</Text>
                          <Text style={styles.modernInfoValue}>{studentInfoData?.email || '—'}</Text>
                        </View>
                    
                    <View style={styles.modernInfoItem}>
                      <Ionicons name="call" size={16} color="#6B7280" />
                      <Text style={styles.modernInfoLabel}>Contact</Text>
                      <Text style={styles.modernInfoValue}>{studentInfoData?.contactNumber || '—'}</Text>
                    </View>
                    
                    <View style={styles.modernInfoItem}>
                      <Ionicons name="person" size={16} color="#6B7280" />
                      <Text style={styles.modernInfoLabel}>Gender</Text>
                      <Text style={styles.modernInfoValue}>{studentInfoData?.gender || '—'}</Text>
                    </View>
                    
                    <View style={styles.modernInfoItem}>
                      <Ionicons name="calendar" size={16} color="#6B7280" />
                      <Text style={styles.modernInfoLabel}>Age</Text>
                      <Text style={styles.modernInfoValue}>
                        {(() => { 
                          if (!studentInfoData?.birthday) return '—'; 
                          try { 
                            const birthDate = new Date(studentInfoData.birthday); 
                            if (isNaN(birthDate.getTime())) return '—'; 
                            const today = new Date();
                            let age = today.getFullYear() - birthDate.getFullYear();
                            const monthDiff = today.getMonth() - birthDate.getMonth();
                            if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
                              age--;
                            }
                            return `${age} years old`;
                          } catch { 
                            return '—'; 
                          } 
                        })()}
                      </Text>
                    </View>
                    
                        <View style={styles.modernInfoItem}>
                          <Ionicons name="location" size={16} color="#6B7280" />
                          <Text style={styles.modernInfoLabel}>Address</Text>
                          <Text style={styles.modernInfoValue}>{studentInfoData?.address || '—'}</Text>
                        </View>
                      </>
                    )}
                  </View>
                );
              })()}
              
              <View style={styles.modernActions}>
                {(() => {
                  const matchKeys = [
                    String(studentInfoData?.uid || '').trim(),
                    String(studentInfoData?.id || '').trim(),
                    String(studentInfoData?.studentId || '').trim(),
                  ].filter(Boolean);
                  const isLinkedFull = linkedStudents.find((s) => {
                    const sid = String(s.id || '').trim();
                    const sidNum = String(s.studentId || '').trim();
                    return matchKeys.some((key) => key && (key === sid || key === sidNum));
                  });
                  const hasPending = matchKeys.some((key) => key && pendingReqMap?.[key]);
                  const hasOwnPending = matchKeys.some((key) => key && selfPendingMap?.[key]);
                  const isRequested = hasPending;

                  if (isLinkedFull) {
                    return (
                      <>
                        <TouchableOpacity style={styles.modernCloseButton} onPress={() => { setStudentInfoVisible(false); setStudentInfoData(null); }}>
                          <Text style={styles.modernCloseButtonText}>Close</Text>
                        </TouchableOpacity>
                        <TouchableOpacity 
                          style={styles.modernUnlinkButton} 
                          onPress={() => {
                            unlinkStudent({
                              id: studentInfoData.uid,
                              firstName: studentInfoData.firstName,
                              lastName: studentInfoData.lastName,
                              linkId: isLinkedFull.linkId
                            });
                          }}
                          disabled={linkLoading}
                        >
                          <Ionicons name="unlink" size={14} color="#FFFFFF" />
                          <Text style={styles.modernUnlinkButtonText}>Unlink</Text>
                        </TouchableOpacity>
                      </>
                    );
                  } else if (!isRequested) {
                    return (
                      <>
                        <TouchableOpacity style={styles.modernCloseButton} onPress={() => { setStudentInfoVisible(false); setStudentInfoData(null); }}>
                          <Text style={styles.modernCloseButtonText}>Close</Text>
                        </TouchableOpacity>
                        <TouchableOpacity 
                          style={styles.modernLinkButton} 
                          onPress={() => {
                            setStudentInfoVisible(false);
                            setSelectedStudentForLink(studentInfoData);
                            setLinkStudentConfirmVisible(true);
                          }}
                          disabled={linkLoading}
                        >
                          <Ionicons name="link" size={14} color="#FFFFFF" />
                          <Text style={styles.modernLinkButtonText}>Link</Text>
                        </TouchableOpacity>
                      </>
                    );
                  } else if (hasOwnPending) {
                    // Student is the sender of a pending request -> show active Cancel button
                    return (
                      <>
                        <TouchableOpacity
                          style={styles.modernCloseButton}
                          onPress={() => {
                            setStudentInfoVisible(false);
                            setStudentInfoData(null);
                          }}
                        >
                          <Text style={styles.modernCloseButtonText}>Close</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.modernLinkButton, { backgroundColor: '#F59E0B' }]}
                          onPress={() => {
                            setStudentInfoVisible(false);
                            setCancelRequestTarget(studentInfoData);
                            setCancelRequestConfirmVisible(true);
                          }}
                          disabled={cancelingRequest}
                        >
                          <Ionicons name="close-circle" size={14} color="#FFFFFF" />
                          <Text style={styles.modernLinkButtonText}>Cancel Request</Text>
                        </TouchableOpacity>
                      </>
                    );
                  } else {
                    // Pending exists but not initiated by this student
                    return (
                      <>
                        <TouchableOpacity style={styles.modernCloseButton} onPress={() => { setStudentInfoVisible(false); setStudentInfoData(null); }}>
                          <Text style={styles.modernCloseButtonText}>Close</Text>
                        </TouchableOpacity>
                        <View style={styles.modernDisabledButton}>
                          <Ionicons name="time" size={14} color="#94A3B8" />
                          <Text style={styles.modernDisabledButtonText}>Request Sent</Text>
                        </View>
                      </>
                    );
                  }
                })()}
              </View>
            </View>
          </View>
        </Modal>

        {/* Cancel Request Confirmation Modal (schedule-style) - Rendered after info modal to appear on top */}
        <Modal
          transparent
          animationType="fade"
          visible={cancelRequestConfirmVisible}
          onRequestClose={() => !cancelingRequest && setCancelRequestConfirmVisible(false)}
        >
          <View style={styles.modalOverlayCenter}>
            <View style={styles.fbModalCard}>
              <View style={styles.fbModalContent}>
                <Text style={styles.fbModalTitle}>Cancel link request?</Text>
                <Text style={styles.fbModalMessage}>
                  Cancel pending request to {cancelRequestTarget?.firstName} {cancelRequestTarget?.lastName}? They will no longer see your request.
                </Text>
              </View>
              <View style={styles.fbModalButtonContainer}>
                <TouchableOpacity
                  style={[styles.fbModalCancelButton, cancelingRequest && styles.fbModalButtonDisabled]}
                  onPress={() => !cancelingRequest && setCancelRequestConfirmVisible(false)}
                  disabled={cancelingRequest}
                >
                  <Text style={styles.fbModalCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.fbModalConfirmButton,
                    { backgroundColor: '#F59E0B' },
                    cancelingRequest && styles.fbModalButtonDisabled,
                  ]}
                  onPress={confirmCancelLinkRequest}
                  disabled={cancelingRequest}
                >
                  <Text style={styles.fbModalConfirmText}>
                    {cancelingRequest ? 'Cancelling...' : 'Confirm'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

      </View>
      
      <OfflineBanner visible={showOfflineBanner} />
    </>
  );
}

const styles = StyleSheet.create({
  wrapper: { flex: 1, backgroundColor: '#F9FAFB' },
  gridContainer: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  gridRow: { justifyContent: 'space-between' },
  gridItem: { marginBottom: 10 },
  gridCard: { width: (width - 16 * 2 - 12) / 2 },
  blockCard: { width: width - 16 * 2 },
  fixedCard: { height: CARD_HEIGHT },
  loadingContainer: { alignItems: 'center', justifyContent: 'center', paddingVertical: 40 },
  loadingText: { marginTop: 12, color: '#6B7280', fontSize: 16 },
  // sidebar removed
  headerRow: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 20, paddingTop: 50, zIndex: 5, backgroundColor: '#004f89', shadowColor: '#000', shadowOpacity: 0.05, shadowOffset: { width: 0, height: 2 }, shadowRadius: 5, borderBottomEndRadius: 15, borderBottomStartRadius: 15, minHeight: 120 },
  headerSearchWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, marginRight: 10, height: 50 },
  headerSearchInput: { flex: 1, color: '#FFFFFF', fontSize: 16 },
  profileContainer: { flexDirection: 'row', alignItems: 'center', height: 50 },
  backAvatarButton: { width: 50, height: 50, borderRadius: 30, marginRight: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.15)' },
  avatar: { width: 50, height: 50, borderRadius: 30, marginRight: 8 },
  greeting: { fontSize: 20, fontWeight: '600', color: '#FFFFFF' },
  iconButton: { marginRight: 12 },
  content: { paddingHorizontal: 16, paddingBottom: 24, flexGrow: 1 },
  section: { backgroundColor: '#fff', borderRadius: 8, padding: 20, marginTop: 12, marginBottom: 100, shadowColor: '#000', shadowOpacity: 0.08, shadowOffset: { width: 0, height: 4 }, shadowRadius: 8, elevation: 4 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, marginTop: 4 },
  sectionTitle: { fontSize: 20, fontWeight: '700', color: '#111827', marginRight: 8, marginBottom: 5 },
  testButton: { backgroundColor: '#10B981', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  testButtonText: { color: 'white', fontSize: 12, fontWeight: '600' },
  modernStudentCard: { backgroundColor: '#fff', borderRadius: 8, marginBottom: 12, shadowColor: '#000', shadowOpacity: 0.08, shadowOffset: { width: 0, height: 4 }, shadowRadius: 12, elevation: 6, borderWidth: 2, borderColor: '#CBD5E1', overflow: 'hidden' },
  cardHeader: { flexDirection: 'row', alignItems: 'center', padding: 14, paddingBottom: 10, backgroundColor: '#004f89', borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  modernAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#EFF6FF', justifyContent: 'center', alignItems: 'center', marginRight: 12, borderWidth: 2, borderColor: '#DBEAFE' },
  modernAvatarText: { fontSize: 16, fontWeight: '800', color: '#2563EB' },
  avatarOctagonMedium: { position: 'absolute', width: 36, height: 36, backgroundColor: 'rgba(255,255,255,0.18)', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.35)', borderRadius: 8 },
  avatarInitialOnBlue: { color: '#FFFFFF' },
  cardHeaderInfo: { flex: 1 },
  modernStudentName: { fontSize: 16, fontWeight: '700', color: '#FFFFFF', marginBottom: 4 },
  statusBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#DCFCE7', paddingHorizontal: 6, paddingVertical: 3, borderRadius: 8, alignSelf: 'flex-start' },
  statusDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#16A34A', marginRight: 6 },
  statusText: { fontSize: 12, fontWeight: '600', color: '#16A34A' },
  modernActionButton: { padding: 6, borderRadius: 8, backgroundColor: '#F8FAFC' },
  headerActionButton: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#EFF6FF', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: '#DBEAFE' },
  headerActionText: { fontSize: 14, fontWeight: '600', color: '#2563EB', marginRight: 4 },
  viewDetailsButton: {
    width: '100%',
    backgroundColor: '#fff',
    borderRadius: 8,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 16,
  },
  viewDetailsLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#004f89',
    textAlign: 'center',
  },
  cardContent: { padding: 14, paddingTop: 10 },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  infoItem: { flex: 1, alignItems: 'center', paddingHorizontal: 8 },
  infoLabel: { fontSize: 12, fontWeight: '600', color: '#6B7280', marginTop: 4, marginBottom: 2 },
  infoValue: { fontSize: 14, fontWeight: '700', color: '#111827', textAlign: 'center' },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 10, borderTopWidth: 1, borderTopColor: '#F1F5F9' },
  linkedDate: { flexDirection: 'row', alignItems: 'center' },
  linkedDateText: { fontSize: 12, color: '#9CA3AF', marginLeft: 4 },
  viewButton: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#EFF6FF', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: '#DBEAFE' },
  viewButtonText: { fontSize: 14, fontWeight: '600', color: '#2563EB', marginRight: 4 },
  // Search functionality styles (parity with LinkParent.js)
  searchSectionHeader: { marginBottom: 8 },
  listTitle: { fontSize: 18, fontWeight: '700', color: '#111827' },
  separator: { height: 1, backgroundColor: '#E5E7EB', marginVertical: 4 },
  // Thin separator shown above search results list
  searchSeparator: { height: 1, backgroundColor: '#E5E7EB', marginTop: 8, marginBottom: 6, width: '100%' },
  // Thin separator shown just above the nav tab to visually cap the list
  navTabTopSeparator: { height: 1, backgroundColor: '#E5E7EB', marginTop: 8, width: '100%' },
  searchResultContainer: { 
    marginTop: 20, 
    backgroundColor: '#F9FAFB', 
    borderRadius: 8, 
    padding: 15, 
    shadowColor: '#000', 
    shadowOpacity: 0.05, 
    shadowOffset: { width: 0, height: 2 }, 
    shadowRadius: 4, 
    elevation: 2 
  },
  noResultCard: { 
    alignItems: 'center', 
    paddingVertical: 24, 
    paddingHorizontal: 16,
    width: '100%'
  },
  noResultTitle: { 
    fontSize: 18, 
    fontWeight: '700', 
    color: '#111827', 
    marginTop: 12, 
    marginBottom: 8 
  },
  noResultText: { 
    fontSize: 14, 
    color: '#6B7280', 
    textAlign: 'center', 
    lineHeight: 20, 
    marginBottom: 8 
  },
  centerRow: { 
    alignItems: 'center', 
    justifyContent: 'center', 
    paddingVertical: 16 
  },
  listContainer: { gap: 6, width: '100%' },
  // Scrollable area for search results bounded between header and nav tab
  searchScrollArea: { maxHeight: Math.max(200, height - GRID_CONTENT_TOP - NAV_TAB_BUFFER - 20), width: '100%' },
  studentRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  studentAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  studentInitials: { fontSize: 14, fontWeight: '700', color: '#2563EB' },
  studentName: { fontSize: 14, fontWeight: '700', color: '#111827' },
  studentMeta: { color: '#6B7280', fontSize: 11 },
  studentActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  linkedBadge: { backgroundColor: '#DCFCE7', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, borderWidth: 1, borderColor: '#BBF7D0' },
  linkedBadgeText: { color: '#16A34A', fontSize: 10, fontWeight: '600' },
  requestedBadge: { backgroundColor: '#FEF3C7', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, borderWidth: 1, borderColor: '#FDE68A' },
  requestedBadgeText: { color: '#D97706', fontSize: 10, fontWeight: '600' },
  badgeLinkedBlue: { backgroundColor: '#EFF6FF', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, borderWidth: 1, borderColor: '#DBEAFE' },
  badgeLinkedBlueText: { color: '#2563EB', fontSize: 10, fontWeight: '600' },
  badgeLinkGreen: { backgroundColor: '#ECFDF5', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, borderWidth: 1, borderColor: '#A7F3D0' },
  badgeLinkGreenText: { color: '#10B981', fontSize: 10, fontWeight: '600' },
  linkPill: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#EFF6FF', paddingVertical: 6, paddingHorizontal: 10, borderRadius: 999, borderWidth: 1, borderColor: '#DBEAFE' },
  linkPillText: { color: '#2563EB', fontWeight: '700', fontSize: 12 },
  // Schedule-style feedback / confirmation modals
  modalOverlayCenter: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fbModalCard: {
    width: '85%',
    maxWidth: 400,
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 20,
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
  searchContainer: { flex: 1, justifyContent: 'flex-start', alignItems: 'stretch' },
  searchStateContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', minHeight: Math.max(400, height - 300), paddingVertical: 40 },
  emptyCard: { backgroundColor: '#fff', borderRadius: 8, padding: 16, alignItems: 'center', borderWidth: 1, borderColor: '#E5E7EB', shadowColor: '#0F172A', shadowOpacity: 0.08, shadowOffset: { width: 0, height: 6 }, shadowRadius: 12, elevation: 4, width: '100%' },
  emptyIconWrap: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: '#111827', marginBottom: 4 },
  emptySubtext: { fontSize: 12, color: '#6B7280', textAlign: 'center', lineHeight: 16, marginBottom: 12 },
  primaryButton: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#004f89', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
  primaryButtonText: { color: '#fff', fontWeight: '600', fontSize: 12 },
  // Info Card Message Styles (mirrors LinkParent.js)
  infoCardContainer: {
    marginBottom: 8,
    marginTop: 12,
  },
  infoCard: {
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 12,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    marginTop: 0,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  infoIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: '#F0F9FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  infoTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 4,
  },
  infoSub: {
    fontSize: 13,
    color: '#6B7280',
  },
  // Modern Modal Styles (mirrored from LinkParent.js)
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
    borderColor: '#E5E7EB',
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
    paddingBottom: 20,
    backgroundColor: '#004f89',
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
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 4,
  },
  modernAvatarText: {
    fontSize: 20,
    fontWeight: '900',
    color: '#FFFFFF',
    textShadowColor: 'rgba(0, 0, 0, 0.1)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
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
    paddingTop: 30,
    backgroundColor: '#FAFBFC',
  },
  modernInfoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 20,
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 8,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  modernInfoLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1F2937',
    marginLeft: 12,
    marginRight: 16,
    minWidth: 70,
    letterSpacing: 0.3,
  },
  modernInfoValue: {
    fontSize: 15,
    color: '#4B5563',
    flex: 1,
    textAlign: 'right',
    fontWeight: '500',
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
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 2,
  },
  modernCloseButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#475569',
    letterSpacing: 0.3,
  },
  modernLinkButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#004f89',
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderRadius: 8,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 2,
    gap: 8,
  },
  modernLinkButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
  modernUnlinkButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EF4444',
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderRadius: 8,
    shadowColor: '#EF4444',
    shadowOpacity: 0.3,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 8,
    elevation: 4,
    gap: 8,
  },
  modernUnlinkButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
  modernDisabledButton: {
    flex: 1,
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
  },
  modernDisabledButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#94A3B8',
    letterSpacing: 0.3,
  },
  modernLoadingContainer: {
    padding: 48,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FAFBFC',
  },
  modernLoadingText: {
    marginTop: 12,
    color: '#6B7280',
    fontSize: 16,
    fontWeight: '500',
  },
  
  // Info Section Styles (adapted from LinkParent.js for smaller cards)
  fullScreenInfoSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 0,
  },
  fullScreenInfoItem: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 4,
    paddingVertical: 8,
  },
  iconWrapper: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: 'rgba(0,79,137,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  fullScreenInfoLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: '#6B7280',
    marginTop: 2,
    marginBottom: 1,
    textAlign: 'center',
  },
  fullScreenInfoValue: {
    fontSize: 12,
    fontWeight: '700',
    color: '#111827',
    textAlign: 'center',
  },
  verticalSeparator: {
    width: 1,
    backgroundColor: '#E5E7EB',
    marginVertical: 2,
  },
  
  // Message Card Styles (mirrored from LinkParent.js)
  modernMessageCard: {
    padding: 24,
    paddingTop: 30,
    backgroundColor: '#FAFBFC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modernMessageIcon: {
    width: 48,
    height: 48,
    borderRadius: 8,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  modernMessageTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 8,
    textAlign: 'center',
  },
  modernMessageText: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: 16,
  },
});

export default LinkStudents;
