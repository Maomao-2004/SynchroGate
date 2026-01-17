import React, { useState, useEffect, useContext, useCallback, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Image,
  ScrollView,
  TouchableOpacity,
  Modal,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { useRoute, useNavigation, useFocusEffect } from '@react-navigation/native';
import { doc, getDoc, query, collection, where, getDocs, onSnapshot, deleteDoc, updateDoc, setDoc, arrayUnion } from 'firebase/firestore';
import { db } from '../../utils/firebaseConfig';
import { withNetworkErrorHandling, getNetworkErrorMessage } from '../../utils/networkErrorHandler';
import { AuthContext } from '../../contexts/AuthContext';
import { NetworkContext } from '../../contexts/NetworkContext';
import { deleteConversationOnUnlink, deleteAllStudentToStudentConversations } from '../../utils/conversationUtils';

const ParentProfile = () => {
  const route = useRoute();
  const navigation = useNavigation();
  const { user } = useContext(AuthContext);
  const networkContext = useContext(NetworkContext);
  const isConnected = networkContext?.isConnected ?? true;
  const parent = route?.params?.parent || {};

  const defaultProfile = require("../../assets/icons/unknown avatar icon.jpg");

  const [profilePic, setProfilePic] = useState(defaultProfile);
  const [isLinked, setIsLinked] = useState(false);
  const [linkedStudents, setLinkedStudents] = useState([]);
  const [currentParent, setCurrentParent] = useState(parent);
  const [unlinkConfirmVisible, setUnlinkConfirmVisible] = useState(false);
  const [unlinking, setUnlinking] = useState(false);
  const [feedbackVisible, setFeedbackVisible] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState('');
  const [feedbackSuccess, setFeedbackSuccess] = useState(true);
  const [feedbackTitle, setFeedbackTitle] = useState('');
  const [networkErrorVisible, setNetworkErrorVisible] = useState(false);
  const [networkErrorTitle, setNetworkErrorTitle] = useState('');
  const [networkErrorMessage, setNetworkErrorMessage] = useState('');
  const [networkErrorColor, setNetworkErrorColor] = useState('#DC2626');
  const fetchedParentIdRef = useRef(null);

  // Hide tab bar when focused - absolutely ensure it's hidden
  // Try multiple approaches to ensure tab bar is hidden
  useFocusEffect(
    useCallback(() => {
      const hideTabBar = () => {
        // Approach 1: Direct parent (like Profile.js does)
        const parent = navigation.getParent?.();
        if (parent) {
          parent.setOptions({ tabBarStyle: { display: 'none' } });
        }
        
        // Approach 2: Try going up two levels (HomeStack -> TabNavigator)
        const homeStack = navigation.getParent?.();
        const tabNavigator = homeStack?.getParent?.();
        if (tabNavigator) {
          tabNavigator.setOptions({ tabBarStyle: { display: 'none' } });
        }
      };
      
      // Hide immediately
      hideTabBar();
      
      // Also hide after a tiny delay to catch any timing issues
      const timeoutId = setTimeout(hideTabBar, 0);
      
      return () => {
        clearTimeout(timeoutId);
      };
    }, [navigation])
  );
  
  // Also hide tab bar immediately on mount to prevent any flash
  useEffect(() => {
    const hideTabBar = () => {
      const parent = navigation.getParent?.();
      if (parent) {
        parent.setOptions({ tabBarStyle: { display: 'none' } });
      }
      const homeStack = navigation.getParent?.();
      const tabNavigator = homeStack?.getParent?.();
      if (tabNavigator) {
        tabNavigator.setOptions({ tabBarStyle: { display: 'none' } });
      }
    };
    
    hideTabBar();
    // Also try after render
    const timeoutId = setTimeout(hideTabBar, 0);
    return () => clearTimeout(timeoutId);
  }, [navigation]);

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

  // Initialize currentParent from route params immediately
  useEffect(() => {
    // Set initial state from route params immediately to show basic info
    if (parent) {
      const newId = parent.id || parent.uid;
      const newUid = parent.uid || parent.id;
      const newParentId = parent.parentId || parent.studentId;
      const parentKey = newId || newUid || newParentId;
      
      // Reset fetch ref if parent changed
      if (fetchedParentIdRef.current !== parentKey) {
        fetchedParentIdRef.current = null;
      }
      
      setCurrentParent(prev => {
        // Only update if route params changed to avoid unnecessary re-renders
        if (prev?.id === newId && prev?.uid === newUid && prev?.parentId === newParentId) {
          return prev; // No change needed
        }
        return {
          ...parent,
          id: newId,
          uid: newUid,
          parentId: newParentId,
        };
      });
    }
  }, [parent?.id, parent?.uid, parent?.parentId, parent?.studentId]);

  // Fetch full parent data from Firestore
  useEffect(() => {
    const fetchParentData = async () => {
      if (!parent?.id && !parent?.uid && !parent?.parentId && !parent?.studentId) return;
      
      const parentKey = parent?.id || parent?.uid || parent?.parentId || parent?.studentId;
      // Skip fetch if we already fetched for this parent
      if (fetchedParentIdRef.current === parentKey) {
        return;
      }
      
      fetchedParentIdRef.current = parentKey;
      
      try {
        let parentData = null;
        let parentDocId = null;
        
        // Strategy 1: Try fetching by document ID (parent.id, parent.uid, parent.parentId, or parent.studentId)
        const candidateIds = [
          parent?.id,
          parent?.uid,
          parent?.parentId,
          parent?.studentId
        ].filter(Boolean);
        
        for (const candidateId of candidateIds) {
          try {
            const parentDocRef = doc(db, 'users', candidateId);
            const parentSnap = await getDoc(parentDocRef);
            if (parentSnap.exists()) {
              const data = parentSnap.data();
              // Verify it's actually a parent
              if (data.role === 'parent') {
                parentData = data;
                parentDocId = parentSnap.id;
                break;
              }
            }
          } catch {}
        }
        
        // Strategy 2: If not found by document ID, try querying by UID field
        if (!parentData && (parent?.uid || parent?.id)) {
          try {
            const uidToQuery = parent.uid || parent.id;
            const q = query(
              collection(db, 'users'),
              where('uid', '==', uidToQuery),
              where('role', '==', 'parent')
            );
            const qSnap = await getDocs(q);
            if (!qSnap.empty) {
              parentData = qSnap.docs[0].data();
              parentDocId = qSnap.docs[0].id;
            }
          } catch {}
        }
        
        // Strategy 3: Try querying by parentId field (canonical ID)
        if (!parentData && (parent?.parentId || parent?.studentId)) {
          try {
            const parentIdToQuery = parent.parentId || parent.studentId;
            const q = query(
              collection(db, 'users'),
              where('parentId', '==', parentIdToQuery),
              where('role', '==', 'parent')
            );
            const qSnap = await getDocs(q);
            if (!qSnap.empty) {
              parentData = qSnap.docs[0].data();
              parentDocId = qSnap.docs[0].id;
            }
          } catch {}
        }
        
        // Merge fetched data with route params data, preserving linkId and all route params
        if (parentData && parentDocId) {
          setCurrentParent({
            ...parent, // Preserve all route params first
            ...parentData, // Override with fetched data
            id: parentDocId,
            uid: parentData.uid || parent?.uid || parent?.id,
            parentId: parentData.parentId || parent?.parentId || parent?.studentId,
            linkId: parent?.linkId, // Preserve linkId from route params
          });
        } else {
          // If no data found, keep what we have from route params
          setCurrentParent(prev => ({
            ...prev,
            ...parent,
            id: parent?.id || parent?.uid,
            uid: parent?.uid || parent?.id,
            parentId: parent?.parentId || parent?.studentId,
          }));
        }
      } catch (error) {
        console.log('Error fetching parent data:', error);
        // Only show network error modal for actual network errors
        if (error?.code?.includes('unavailable') || error?.code?.includes('network') || error?.message?.toLowerCase().includes('network')) {
          const errorInfo = getNetworkErrorMessage({ type: 'unstable_connection', message: error.message });
          setNetworkErrorTitle(errorInfo.title);
          setNetworkErrorMessage(errorInfo.message);
          setNetworkErrorColor(errorInfo.color);
          setNetworkErrorVisible(true);
          setTimeout(() => setNetworkErrorVisible(false), 5000);
        }
        // Keep existing state on error
      }
    };
    
    fetchParentData();
  }, [parent?.id, parent?.uid, parent?.parentId, parent?.studentId]);

  // ✅ Load saved images
  useEffect(() => {
    const loadImages = async () => {
      try {
        const keyBase = currentParent?.parentId ? String(currentParent.parentId) : String(currentParent?.id || currentParent?.uid || '');
        if (!keyBase) return;
        
        const savedProfile = await AsyncStorage.getItem(`profilePic_${keyBase}`);

        if (savedProfile) setProfilePic({ uri: savedProfile });
      } catch (error) {
        console.log("Error loading images:", error);
      }
    };
    loadImages();
  }, [currentParent?.parentId, currentParent?.id, currentParent?.uid]);

  // ✅ Check linked students status
  useEffect(() => {
    const checkLinkedStatus = async () => {
      try {
        const parentUid = currentParent?.uid || currentParent?.id;
        const parentCanonicalId = currentParent?.parentId || currentParent?.studentId;
        
        if (!parentUid && !parentCanonicalId) {
          setIsLinked(false);
          setLinkedStudents([]);
          return;
        }
        
        // Query by both UID and canonical ID to find all links
        const queries = [];
        if (parentUid) {
          queries.push(query(
            collection(db, 'parent_student_links'),
            where('parentId', '==', parentUid),
            where('status', '==', 'active')
          ));
        }
        if (parentCanonicalId && parentCanonicalId.includes('-')) {
          queries.push(query(
            collection(db, 'parent_student_links'),
            where('parentIdNumber', '==', parentCanonicalId),
            where('status', '==', 'active')
          ));
        }
        
        if (queries.length === 0) {
          setIsLinked(false);
          setLinkedStudents([]);
          return;
        }
        
        const snapshots = await Promise.all(queries.map(q => getDocs(q)));
        const allDocs = [];
        const seenLinkIds = new Set();
        
        snapshots.forEach(snap => {
          snap.docs.forEach(doc => {
            // Avoid duplicates by linkId
            if (!seenLinkIds.has(doc.id)) {
              seenLinkIds.add(doc.id);
              allDocs.push(doc);
            }
          });
        });
        
        if (allDocs.length > 0) {
          setIsLinked(true);
          const students = allDocs.map(doc => {
            const data = doc.data();
            return {
              id: doc.id,
              studentName: data.studentName || '',
              studentId: data.studentId || data.studentIdNumber || '',
              relationship: data.relationship || '',
            };
          });
          students.sort((a, b) => String(a.studentName || '').toLowerCase().localeCompare(String(b.studentName || '').toLowerCase()));
          setLinkedStudents(students);
        } else {
          setIsLinked(false);
          setLinkedStudents([]);
        }
      } catch (error) {
        console.error("Error checking linked status:", error);
        // Only show network error modal for actual network errors
        if (error?.code?.includes('unavailable') || error?.code?.includes('network') || error?.message?.toLowerCase().includes('network')) {
          const errorInfo = getNetworkErrorMessage({ type: 'unstable_connection', message: error.message });
          setNetworkErrorTitle(errorInfo.title);
          setNetworkErrorMessage(errorInfo.message);
          setNetworkErrorColor(errorInfo.color);
          setNetworkErrorVisible(true);
          setTimeout(() => setNetworkErrorVisible(false), 5000);
        }
        setIsLinked(false);
        setLinkedStudents([]);
      }
    };
    checkLinkedStatus();
  }, [currentParent?.parentId, currentParent?.id, currentParent?.uid]);

  const fullName = `${currentParent?.lastName || ""}, ${currentParent?.firstName || ""} ${currentParent?.middleName || ""}`.trim();

  // Unlink parent
  const handleUnlinkConfirm = async () => {
    if (!currentParent?.linkId) {
      setFeedbackSuccess(false);
      setFeedbackTitle('Error');
      setFeedbackMessage('Invalid parent data. Please try again.');
      setFeedbackVisible(true);
      setTimeout(() => setFeedbackVisible(false), 3000);
      return;
    }
    
    // Check if offline before attempting unlink
    if (!isConnected) {
      setUnlinkConfirmVisible(false);
      setFeedbackSuccess(false);
      setFeedbackTitle('No Internet Connection');
      setFeedbackMessage('Unable to unlink parent. Please check your internet connection and try again.');
      setFeedbackVisible(true);
      setTimeout(() => setFeedbackVisible(false), 3000);
      return;
    }
    
    try {
      setUnlinking(true);
      await deleteDoc(doc(db, 'parent_student_links', currentParent.linkId));

      // Delete the conversation between parent and student
      // Collect all possible ID formats to ensure we find the conversation
      const canonicalStudentId = await getCanonicalStudentDocId();
      const studentIds = [
        canonicalStudentId,
        user?.studentId,
        user?.studentIdNumber,
        user?.uid
      ].filter(Boolean);
      const parentIds = [
        currentParent.id,
        currentParent.uid,
        currentParent.parentId,
        currentParent.parentIdNumber
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
        const parentUid = String(currentParent.id || currentParent.uid || '').trim();
        const parentCanonicalId = String(currentParent.studentId || currentParent.parentId || '').trim();
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
        const parentName = `${currentParent.firstName || 'Parent'} ${currentParent.lastName || ''}`.trim();
        
        // Get current student's canonical ID
        const studentCanonicalId = await getCanonicalStudentDocId();
        
        // Notification for the student (current user) - student initiated the unlink, so no push notification needed
        if (studentCanonicalId) {
          const studentNotif = {
            id: `unlink_${currentParent.linkId}_${Date.now()}`,
            type: 'link_unlinked_self',
            title: 'Parent Unlinked',
            message: `You unlinked ${parentName || 'the parent'}.`,
            createdAt: nowIso,
            status: 'read', // Mark as read since student initiated the action
            parentId: currentParent.id || currentParent.uid,
            parentName: parentName || 'Parent',
            studentId: studentCanonicalId,
            studentName: `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'Student',
            relationship: currentParent.relationship || '',
            linkId: currentParent.linkId,
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
        
        // Notification for the parent
        const parentUid = String(currentParent.id || currentParent.uid || '').trim();
        const parentCanonicalId = String(currentParent.studentId || currentParent.parentId || '').trim();
        const parentDocId = parentCanonicalId && parentCanonicalId.includes('-') ? parentCanonicalId : parentUid;
        
        if (parentDocId) {
          const studentName = `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'the student';
          const parentNotif = {
            id: `${currentParent.linkId}_unlinked_self_${Date.now()}`,
            type: 'link_unlinked_self',
            title: 'Unlinked Student',
            message: `${studentName} unlinked from you.`,
            createdAt: nowIso,
            status: 'unread',
            parentId: parentDocId,
            studentId: studentCanonicalId,
            studentName: studentName,
            linkId: currentParent.linkId
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
      
      // Close confirmation modal first
      setUnlinkConfirmVisible(false);
      
      // Show feedback modal
      setFeedbackSuccess(true);
      setFeedbackTitle('Success');
      setFeedbackMessage(`${currentParent.firstName} has been unlinked successfully`);
      setFeedbackVisible(true);
      setTimeout(() => {
        setFeedbackVisible(false);
        // Navigate back to LinkParent screen
        try {
          const parentNav = navigation.getParent?.();
          if (parentNav) {
            parentNav.navigate('Home', { screen: 'LinkParent' });
          } else {
            navigation.navigate('LinkParent');
          }
        } catch {}
      }, 3000);
    } catch (error) {
      console.error('Error unlinking parent:', error);
      // Only show network error modal for actual network errors
      if (error?.code?.includes('unavailable') || error?.code?.includes('network') || error?.message?.toLowerCase().includes('network')) {
        const errorInfo = getNetworkErrorMessage({ type: 'unstable_connection', message: error.message });
        setNetworkErrorTitle(errorInfo.title);
        setNetworkErrorMessage(errorInfo.message);
        setNetworkErrorColor(errorInfo.color);
        setNetworkErrorVisible(true);
        setTimeout(() => setNetworkErrorVisible(false), 5000);
      } else {
        // Close confirmation modal first
        setUnlinkConfirmVisible(false);
        
        // Show feedback modal
        setFeedbackSuccess(false);
        setFeedbackTitle('Error');
        setFeedbackMessage(error.message || 'Failed to unlink parent.');
        setFeedbackVisible(true);
        setTimeout(() => setFeedbackVisible(false), 3000);
      }
    } finally {
      setUnlinking(false);
    }
  };

  // Real-time listener for parent data updates
  useEffect(() => {
    if (!currentParent?.id && !currentParent?.uid && !currentParent?.parentId) return;

    // Try multiple IDs to find the document
    const candidateIds = [
      currentParent?.id,
      currentParent?.uid,
      currentParent?.parentId,
      currentParent?.studentId
    ].filter(Boolean);
    
    if (candidateIds.length === 0) return;

    let unsubscribe = null;
    
    // Try each candidate ID until we find a valid document
    const tryListen = async () => {
      for (const candidateId of candidateIds) {
        try {
          const parentDocRef = doc(db, 'users', candidateId);
          unsubscribe = onSnapshot(parentDocRef, (snapshot) => {
            if (snapshot.exists()) {
              const data = snapshot.data();
              // Only update if it's actually a parent
              if (data.role === 'parent') {
                const updatedData = { 
                  ...currentParent, // Preserve existing state
                  ...data, // Update with fresh data
                  id: snapshot.id,
                  uid: data.uid || currentParent?.uid || currentParent?.id,
                  parentId: data.parentId || currentParent?.parentId || currentParent?.studentId,
                  linkId: currentParent?.linkId || parent?.linkId, // Preserve linkId
                };
                setCurrentParent(updatedData);
              }
            }
          }, (error) => {
            console.log('Error listening to parent updates:', error);
            // Only show network error modal for actual network errors
            if (error?.code?.includes('unavailable') || error?.code?.includes('network') || error?.message?.toLowerCase().includes('network')) {
              const errorInfo = getNetworkErrorMessage({ type: 'unstable_connection', message: error.message });
              setNetworkErrorTitle(errorInfo.title);
              setNetworkErrorMessage(errorInfo.message);
              setNetworkErrorColor(errorInfo.color);
              setNetworkErrorVisible(true);
              setTimeout(() => setNetworkErrorVisible(false), 5000);
            }
          });
          break; // Successfully set up listener
        } catch (err) {
          // Try next candidate ID
          continue;
        }
      }
    };
    
    tryListen();

    return () => {
      if (unsubscribe) {
        try { unsubscribe(); } catch {}
      }
    };
  }, [currentParent?.id, currentParent?.uid, currentParent?.parentId, currentParent?.linkId]);

  return (
    <View style={{ flex: 1 }}>
      <ScrollView 
        style={styles.container} 
        contentContainerStyle={{ paddingBottom: 100 }}
      >
        {/* Profile Picture and Name Section */}
        <View style={styles.profileContainer}>
          <View style={styles.profileSection}>
            <View style={styles.profilePicContainer}>
              <Image source={profilePic} style={styles.profilePic} />
            </View>
            <View style={styles.nameSection}>
              <Text style={styles.fullName}>{fullName || "Parent"}</Text>
              <View style={styles.chipsRow}>
                <View style={[styles.chip, isLinked ? styles.chipLinked : styles.chipUnlinked]}>
                  <Ionicons name={isLinked ? "link" : "unlink"} size={12} color={isLinked ? "#16A34A" : "#DC2626"} />
                  <Text style={[styles.chipText, isLinked ? styles.chipTextLinked : styles.chipTextUnlinked]}>
                    {isLinked ? "LINKED" : "UNLINKED"}
                  </Text>
                </View>
                {!!currentParent?.parentId && (
                  <View style={[styles.chip, { backgroundColor: "#DBEAFE" }]}>
                    <Ionicons name="id-card-outline" size={12} color="#2563eb" />
                    <Text style={[styles.chipText, { color: "#2563eb", fontSize: 11 }]}>ID: {currentParent.parentId}</Text>
                  </View>
                )}
              </View>
            </View>
          </View>
        </View>

        {/* Separator */}
        <View style={[styles.separatorContainer, styles.separatorContainerFirst]}>
          <View style={styles.separator} />
        </View>

        {/* Info Section */}
        <View style={styles.infoSection}>
          <View style={styles.infoRow}>
            <Text style={styles.label}>Parent ID</Text>
            <Text style={styles.value}>{currentParent?.parentId || "—"}</Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.label}>Email</Text>
            <Text style={styles.value}>{currentParent?.email || "—"}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.label}>Contact</Text>
            <Text style={styles.value}>{currentParent?.contactNumber || currentParent?.contact || "—"}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.label}>Gender</Text>
            <Text style={styles.value}>{currentParent?.gender || "—"}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.label}>Age</Text>
            <Text style={styles.value}>{currentParent?.age || "—"}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.label}>Birthday</Text>
            <Text style={styles.value}>
              {(() => { 
                if (!currentParent?.birthday) return '—'; 
                try { 
                  const d = new Date(currentParent.birthday); 
                  if (isNaN(d.getTime())) return String(currentParent.birthday); 
                  return d.toLocaleDateString(); 
                } catch { 
                  return String(currentParent.birthday); 
                } 
              })()}
            </Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.label}>Address</Text>
            <Text style={styles.value} numberOfLines={3}>
              {currentParent?.address || "—"}
            </Text>
          </View>

          {/* Linked Students Section */}
          <View style={[styles.infoRow, styles.infoRowLast]}>
            <Text style={styles.label}>Linked Students</Text>
            {linkedStudents.length > 0 ? (
              <View style={styles.linkedStudentsContainer}>
                {linkedStudents.map((student, index) => (
                  <View key={student.id || index} style={styles.linkedStudentItem}>
                    <Ionicons name="person-outline" size={14} color="#004f89" />
                    <Text style={styles.linkedStudentText}>{student.studentName || 'Unknown Student'}</Text>
                    {student.relationship && (
                      <Text style={styles.relationshipText}>({student.relationship})</Text>
                    )}
                  </View>
                ))}
              </View>
            ) : (
              <Text style={styles.value}>N/A</Text>
            )}
          </View>
        </View>
      </ScrollView>

      {/* Unlink Confirmation Modal */}
      <Modal transparent animationType="fade" visible={unlinkConfirmVisible} onRequestClose={() => !unlinking && setUnlinkConfirmVisible(false)}>
        <View style={styles.modalOverlayCenter}>
          <View style={styles.fbModalCard}>
            <View style={styles.fbModalContent}>
              <Text style={styles.fbModalTitle}>Unlink parent?</Text>
              <Text style={styles.fbModalMessage}>
                Are you sure you want to unlink {currentParent?.firstName} {currentParent?.lastName}? This action cannot be undone.
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

      {/* Feedback Modal */}
      <Modal transparent animationType="fade" visible={feedbackVisible} onRequestClose={() => setFeedbackVisible(false)}>
        <View style={styles.modalOverlayCenter}>
          <View style={styles.fbModalCard}>
            <View style={styles.fbModalContent}>
              <Text style={[styles.fbModalTitle, { color: feedbackSuccess ? '#16A34A' : '#DC2626' }]}>
                {feedbackTitle || (feedbackSuccess ? 'Success' : 'Error')}
              </Text>
              {feedbackMessage ? <Text style={styles.fbModalMessage}>{feedbackMessage}</Text> : null}
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

      {/* Bottom Action Button - Unlink */}
      <TouchableOpacity
        style={styles.unlinkButtonContainer}
        activeOpacity={0.85}
        onPress={() => setUnlinkConfirmVisible(true)}
        disabled={unlinking}
      >
        <View style={[styles.unlinkButton, unlinking && styles.unlinkButtonDisabled]}>
          <Ionicons name="unlink" size={16} color="#991B1B" style={{ marginRight: 8 }} />
          <Text style={styles.unlinkButtonText}>Unlink</Text>
        </View>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F9FAFB" },
  profileContainer: {
    backgroundColor: "#fff",
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 0,
  },
  profileSection: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  profilePicContainer: {
    width: 70,
    height: 70,
    borderRadius: 35,
    borderWidth: 2.5,
    borderColor: "#004f89",
    overflow: "hidden",
    backgroundColor: "#fff",
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
    marginRight: 10,
  },
  profilePic: { width: "100%", height: "100%", borderRadius: 32.5 },
  nameSection: {
    flex: 1,
    justifyContent: 'center',
    paddingTop: 2,
  },
  fullName: { fontSize: 18, fontWeight: "800", color: "#111827", marginBottom: 4 },
  chipsRow: { flexDirection: "row", gap: 6, flexWrap: "wrap", marginTop: 2 },
  chip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderWidth: 0,
  },
  chipText: { color: "#111827", fontWeight: "700", fontSize: 11 },
  chipLinked: {
    backgroundColor: "#DCFCE7",
    borderWidth: 1,
    borderColor: "#86EFAC",
  },
  chipUnlinked: {
    backgroundColor: "#FEE2E2",
    borderWidth: 1,
    borderColor: "#FCA5A5",
  },
  chipTextLinked: { color: "#16A34A", fontWeight: "700", fontSize: 11 },
  chipTextUnlinked: { color: "#DC2626", fontWeight: "700", fontSize: 11 },
  separatorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 0,
    backgroundColor: "#fff",
    marginTop: 0,
  },
  separatorContainerFirst: {
    marginTop: 0,
  },
  separator: {
    flex: 1,
    height: 0,
    backgroundColor: "transparent",
  },
  infoSection: {
    backgroundColor: "#fff",
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingVertical: 0,
  },
  infoRow: {
    flexDirection: "column",
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0, 79, 137, 0.15)",
  },
  infoRowLast: {
    borderBottomWidth: 0,
  },
  label: { 
    fontWeight: "700", 
    color: "#374151", 
    fontSize: 12,
    marginBottom: 3,
    letterSpacing: 0.2,
  },
  value: { 
    color: "#6B7280", 
    fontWeight: "500", 
    fontSize: 13,
    lineHeight: 18,
  },
  linkedStudentsContainer: {
    marginTop: 4,
    gap: 6,
  },
  linkedStudentItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
  },
  linkedStudentText: {
    color: "#6B7280",
    fontWeight: "500",
    fontSize: 13,
  },
  relationshipText: {
    color: "#9CA3AF",
    fontSize: 11,
    fontStyle: 'italic',
  },
  // Modal styles
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
  unlinkButtonContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingBottom: 10,
    backgroundColor: '#F9FAFB',
  },
  unlinkButton: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
    borderRadius: 8,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#991B1B',
  },
  unlinkButtonDisabled: {
    opacity: 0.6,
  },
  unlinkButtonText: {
    color: '#991B1B',
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
  },
});

export default ParentProfile;

