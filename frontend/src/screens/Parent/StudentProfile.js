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
import { AuthContext } from '../../contexts/AuthContext';
import { NetworkContext } from '../../contexts/NetworkContext';
import OfflineBanner from '../../components/OfflineBanner';
import NetInfo from '@react-native-community/netinfo';
import { deleteConversationOnUnlink, deleteAllStudentToStudentConversations } from '../../utils/conversationUtils';
import { PARENT_TAB_BAR_STYLE } from '../../navigation/tabStyles';

const StudentProfile = () => {
  const route = useRoute();
  const navigation = useNavigation();
  const { user } = useContext(AuthContext);
  const student = route?.params?.student || {};

  const defaultProfile = require("../../assets/icons/unknown avatar icon.jpg");

  const [profilePic, setProfilePic] = useState(defaultProfile);
  const [hasQR, setHasQR] = useState(false);
  const [currentStudent, setCurrentStudent] = useState(student);
  const [linkedParents, setLinkedParents] = useState([]);
  const [unlinkConfirmVisible, setUnlinkConfirmVisible] = useState(false);
  const [unlinking, setUnlinking] = useState(false);
  const [feedbackVisible, setFeedbackVisible] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState('');
  const [feedbackSuccess, setFeedbackSuccess] = useState(true);
  const [feedbackTitle, setFeedbackTitle] = useState('');
  const [showOfflineBanner, setShowOfflineBanner] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [errorModalVisible, setErrorModalVisible] = useState(false);
  const [errorModalMessage, setErrorModalMessage] = useState('');
  const fetchedStudentIdRef = useRef(null);

  // Hide parent tab while focused and restore on blur
  useFocusEffect(
    useCallback(() => {
      const hideTabBar = () => {
        // Try direct parent first (Tab navigator)
        const parent = navigation.getParent?.();
        if (parent) {
          parent.setOptions({ tabBarStyle: { display: 'none' } });
        }
        
        // Also try going up navigation hierarchy to ensure we catch it
        const homeStack = navigation.getParent?.();
        const tabNavigator = homeStack?.getParent?.();
        if (tabNavigator) {
          tabNavigator.setOptions({ tabBarStyle: { display: 'none' } });
        }
      };
      
      // Hide immediately
      hideTabBar();
      
      // Also hide after render to catch any timing issues
      const timeoutId = setTimeout(hideTabBar, 10);
      
      return () => {
        clearTimeout(timeoutId);
        try {
          const p = navigation.getParent?.();
          if (p) p.setOptions({ tabBarStyle: PARENT_TAB_BAR_STYLE });
          const hs = navigation.getParent?.();
          const tn = hs?.getParent?.();
          if (tn) tn.setOptions({ tabBarStyle: PARENT_TAB_BAR_STYLE });
        } catch {}
      };
    }, [navigation])
  );
  
  // Also hide tab bar on mount as backup
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
    const timeoutId = setTimeout(hideTabBar, 50);
    return () => clearTimeout(timeoutId);
  }, [navigation]);

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

  // Resolve canonical parent doc id for parent_alerts (prefer formatted parentId)
  const getCanonicalParentDocId = async () => {
    try {
      let docId = String(user?.parentId || '').trim();
      if (!docId || !docId.includes('-')) {
        try {
          const qSnap = await getDocs(query(collection(db, 'users'), where('uid', '==', user?.uid), where('role', '==', 'parent')));
          if (!qSnap.empty) {
            const data = qSnap.docs[0].data() || {};
            if (data.parentId) docId = String(data.parentId).trim();
          }
        } catch {}
      }
      if (!docId) docId = String(user?.uid || '').trim();
      return docId;
    } catch { return String(user?.uid || '').trim(); }
  };

  // Initialize currentStudent from route params immediately
  useEffect(() => {
    // Set initial state from route params immediately to show basic info
    if (student) {
      const newId = student.id || student.uid;
      const newUid = student.uid || student.id;
      const studentKey = newId || newUid || student.studentId;
      
      // Reset fetch ref if student changed
      if (fetchedStudentIdRef.current !== studentKey) {
        fetchedStudentIdRef.current = null;
      }
      
      setCurrentStudent(prev => {
        // Only update if route params changed to avoid unnecessary re-renders
        if (prev?.id === newId && prev?.uid === newUid && prev?.studentId === student.studentId) {
          return prev; // No change needed
        }
        return {
          ...student,
          id: newId,
          uid: newUid,
        };
      });
    }
  }, [student?.id, student?.uid, student?.studentId]);

  // Fetch full student data from Firestore
  useEffect(() => {
    const fetchStudentData = async () => {
      if (!student?.id && !student?.uid && !student?.studentId) return;
      
      const studentKey = student?.id || student?.uid || student?.studentId;
      // Skip fetch if we already fetched for this student
      if (fetchedStudentIdRef.current === studentKey) {
        return;
      }
      
      fetchedStudentIdRef.current = studentKey;
      
      try {
        let studentData = null;
        let studentDocId = null;
        
        // Strategy 1: Try fetching by document ID (student.id or student.uid)
        const candidateIds = [
          student?.id,
          student?.uid,
          student?.studentId
        ].filter(Boolean);
        
        for (const candidateId of candidateIds) {
          try {
            const studentDocRef = doc(db, 'users', candidateId);
            const studentSnap = await getDoc(studentDocRef);
            if (studentSnap.exists()) {
              const data = studentSnap.data();
              // Verify it's actually a student
              if (data.role === 'student') {
                studentData = data;
                studentDocId = studentSnap.id;
                break;
              }
            }
          } catch {}
        }
        
        // Strategy 2: If not found by document ID, try querying by UID field
        if (!studentData && (student?.uid || student?.id)) {
          try {
            const uidToQuery = student.uid || student.id;
            const q = query(
              collection(db, 'users'),
              where('uid', '==', uidToQuery),
              where('role', '==', 'student')
            );
            const qSnap = await getDocs(q);
            if (!qSnap.empty) {
              studentData = qSnap.docs[0].data();
              studentDocId = qSnap.docs[0].id;
            }
          } catch {}
        }
        
        // Strategy 3: Try querying by studentId field (canonical ID like "2022-00689")
        if (!studentData && student?.studentId) {
          try {
            const q = query(
              collection(db, 'users'),
              where('studentId', '==', student.studentId),
              where('role', '==', 'student')
            );
            const qSnap = await getDocs(q);
            if (!qSnap.empty) {
              studentData = qSnap.docs[0].data();
              studentDocId = qSnap.docs[0].id;
            }
          } catch {}
        }
        
        // Merge fetched data with route params data, preserving linkId and all route params
        if (studentData && studentDocId) {
          setCurrentStudent({
            ...student, // Preserve all route params first
            ...studentData, // Override with fetched data
            id: studentDocId,
            uid: studentData.uid || student?.uid || student?.id,
            studentId: studentData.studentId || student?.studentId,
            linkId: student?.linkId, // Preserve linkId from route params
          });
        } else {
          // If no data found, keep what we have from route params
          setCurrentStudent(prev => ({
            ...prev,
            ...student,
            id: student?.id || student?.uid,
            uid: student?.uid || student?.id,
          }));
        }
      } catch (error) {
        console.error('Error fetching student data:', error);
        // Keep existing state on error
      }
    };
    
    fetchStudentData();
  }, [student?.id, student?.uid, student?.studentId]);

  // ✅ Load saved images
  useEffect(() => {
    const loadImages = async () => {
      try {
        const keyBase = currentStudent?.studentId ? String(currentStudent.studentId) : String(currentStudent?.id || currentStudent?.uid || '');
        if (!keyBase) return;
        
        const savedProfile = await AsyncStorage.getItem(`profilePic_${keyBase}`);

        if (savedProfile) setProfilePic({ uri: savedProfile });
      } catch (error) {
        console.log("Error loading images:", error);
      }
    };
    loadImages();
  }, [currentStudent?.studentId, currentStudent?.id, currentStudent?.uid]);

  // ✅ Check QR code status
  useEffect(() => {
    const checkQRStatus = async () => {
      try {
        const studentId = currentStudent?.studentId || currentStudent?.id;
        if (!studentId) {
          setHasQR(false);
          return;
        }
        
        const qrDocRef = doc(db, 'student_QRcodes', String(studentId));
        const qrDoc = await getDoc(qrDocRef);
        
        if (!qrDoc.exists()) {
          const qrQuery = query(collection(db, 'student_QRcodes'), where('studentId', '==', studentId));
          const qrSnapshot = await getDocs(qrQuery);
          setHasQR(!qrSnapshot.empty);
        } else {
          setHasQR(true);
        }
      } catch (error) {
        console.error("Error checking QR status:", error);
        setHasQR(false);
      }
    };
    checkQRStatus();
  }, [currentStudent?.studentId, currentStudent?.id]);

  // ✅ Check linked parents status
  useEffect(() => {
    const checkLinkedParents = async () => {
      try {
        const studentUid = currentStudent?.id || currentStudent?.uid;
        const studentIdNumber = currentStudent?.studentId;
        
        if (!studentUid && !studentIdNumber) {
          setLinkedParents([]);
          return;
        }
        
        // Query both studentId (UID) and studentIdNumber (canonical ID)
        const queries = [];
        if (studentUid) {
          queries.push(query(
            collection(db, 'parent_student_links'), 
            where('studentId', '==', studentUid), 
            where('status', '==', 'active')
          ));
        }
        if (studentIdNumber) {
          queries.push(query(
            collection(db, 'parent_student_links'), 
            where('studentIdNumber', '==', studentIdNumber), 
            where('status', '==', 'active')
          ));
        }
        
        if (queries.length === 0) {
          setLinkedParents([]);
          return;
        }
        
        // Execute all queries and combine results
        const allResults = [];
        for (const q of queries) {
          const linksSnap = await getDocs(q);
          linksSnap.docs.forEach(doc => {
            const data = doc.data();
            allResults.push({
              id: doc.id,
              parentName: data.parentName || '',
              parentId: data.parentId || '',
              relationship: data.relationship || '',
            });
          });
        }
        
        // Remove duplicates and sort
        const uniqueParents = Array.from(
          new Map(allResults.map(p => [p.parentId || p.id, p])).values()
        );
        uniqueParents.sort((a, b) => String(a.parentName || '').toLowerCase().localeCompare(String(b.parentName || '').toLowerCase()));
        setLinkedParents(uniqueParents);
      } catch (error) {
        console.error('Error checking linked parents:', error);
        console.log("Error checking linked parents:", error);
        setLinkedParents([]);
      }
    };
    checkLinkedParents();
  }, [currentStudent?.studentId, currentStudent?.id, currentStudent?.uid]);

  const formatYearLabel = (val) => {
    const str = String(val ?? '').trim();
    const num = parseInt(str, 10);
    if (num === 1) return '1st Year';
    if (num === 2) return '2nd Year';
    if (num === 3) return '3rd Year';
    if (num === 4) return '4th Year';
    return str || '';
  };

  const fullName = `${currentStudent?.firstName || ""} ${currentStudent?.middleName || ""} ${currentStudent?.lastName || ""}`.trim();

  // Unlink student
  const showErrorModal = (message) => {
    setErrorModalMessage(message);
    setErrorModalVisible(true);
    setTimeout(() => setErrorModalVisible(false), 3000);
  };

  const handleUnlinkConfirm = async () => {
    if (!currentStudent?.linkId) {
      showErrorModal('No internet connection. Please check your network and try again.');
      return;
    }
    
    // Check internet connection before proceeding
    if (!isConnected) {
      showErrorModal('No internet connection. Please check your network and try again.');
      return;
    }
    
    try {
      setUnlinking(true);
      await deleteDoc(doc(db, 'parent_student_links', currentStudent.linkId));

      // Delete the conversation between parent and student
      // Collect all possible ID formats to ensure we find the conversation
      const studentIds = [
        currentStudent.studentId,
        currentStudent.studentIdNumber,
        currentStudent.id,
        currentStudent.uid
      ].filter(Boolean);
      const parentIds = [
        user?.parentId,
        user?.parentIdNumber,
        user?.uid
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
        const parentDocIdCanonical = await getCanonicalParentDocId();
        const parentDocIdUid = String(user?.uid || '').trim();
        const candidateDocIds = Array.from(new Set([parentDocIdCanonical, parentDocIdUid].filter(Boolean)));
        for (const pid of candidateDocIds) {
          try {
            const parentAlertsRef = doc(db, 'parent_alerts', pid);
            const pSnap = await getDoc(parentAlertsRef);
            if (!pSnap.exists()) continue;
            const pItems = Array.isArray(pSnap.data()?.items) ? pSnap.data().items : [];
            const filtered = pItems.filter(it => !(it?.type === 'schedule_current' && String(it?.studentId || '') === String(currentStudent.id || '')));
            if (filtered.length !== pItems.length) {
              await setDoc(parentAlertsRef, { items: filtered }, { merge: true });
            }
          } catch {}
        }
      } catch (_) {}
      
      // Notify both parties about the unlink
      try {
        const nowIso = new Date().toISOString();
        const studentName = `${currentStudent.firstName || 'Student'} ${currentStudent.lastName || ''}`.trim();
        
        // Always try to get the school ID, either from currentStudent or from user document
        let schoolId = currentStudent.studentId;
        
        if (!schoolId) {
          try {
            const usersRef = collection(db, 'users');
            const q = query(usersRef, where('uid', '==', currentStudent.id), where('role', '==', 'student'));
            const snap = await getDocs(q);
            if (!snap.empty) {
              const userData = snap.docs[0].data();
              const rawId = userData.studentId || userData.studentID || userData.student_id || userData.studentNumber || userData.lrn || '';
              schoolId = String(rawId || '').trim();
            }
          } catch (error) {
            console.log('Error querying users by uid:', error);
          }
        }
        
        if (schoolId) {
          const studentNotif = {
            id: `unlink_${currentStudent.linkId}_${Date.now()}`,
            type: 'link_unlinked',
            title: 'Parent Unlinked',
            message: `${(`${user.firstName || 'Parent'} ${user.lastName || ''}`).trim()} unlinked from you.`,
            createdAt: nowIso,
            status: 'unread',
            parentId: user.uid,
            parentName: `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'Parent',
            studentId: schoolId,
            studentName: `${currentStudent.firstName || 'Student'} ${currentStudent.lastName || ''}`.trim() || 'Student',
            studentClass: currentStudent.studentClass || '',
            relationship: currentStudent.relationship || '',
            linkId: currentStudent.linkId
          };
          
          try {
            const docRef = doc(db, 'student_alerts', schoolId);
            await updateDoc(docRef, { items: arrayUnion(studentNotif) });
          } catch (updateErr) {
            try {
              const snap = await getDoc(doc(db, 'student_alerts', schoolId));
              const baseItems = snap.exists() ? (Array.isArray(snap.data()?.items) ? snap.data().items : []) : [];
              await setDoc(doc(db, 'student_alerts', schoolId), { items: [...baseItems, studentNotif] }, { merge: true });
            } catch (setDocErr) {
              console.log('Failed to send student unlink notification:', setDocErr);
            }
          }
        }
        
        // Notification for the parent (self notification) - parent initiated the unlink, so no push notification needed
        const parentNotif = {
          id: `${currentStudent.linkId}_unlinked_self_${Date.now()}`,
          type: 'link_unlinked_self',
          title: 'Unlinked Student',
          message: `You unlinked ${studentName || 'the student'}.`,
          createdAt: nowIso,
          status: 'read', // Mark as read since parent initiated the action
          parentId: String(user?.parentId || user?.uid || ''),
          studentId: schoolId,
          linkId: currentStudent.linkId,
          skipPushNotification: true // Flag to prevent push notification (backend can check this)
        };
        
        try {
          const parentDocId = await getCanonicalParentDocId();
          await updateDoc(doc(db, 'parent_alerts', parentDocId), { items: arrayUnion({ ...parentNotif, parentId: parentDocId }) });
        } catch (_) {
          const parentDocId = await getCanonicalParentDocId();
          await setDoc(doc(db, 'parent_alerts', parentDocId), { items: [{ ...parentNotif, parentId: parentDocId }] }, { merge: true });
        }
      } catch (notifyErr) {
        console.log('Unlink notification failed:', notifyErr);
      }
      
        // Close confirmation modal first
        setUnlinkConfirmVisible(false);
        
        // Show feedback modal
        setFeedbackSuccess(true);
        setFeedbackTitle('Success');
        setFeedbackMessage(`${currentStudent.firstName} has been unlinked successfully`);
        setFeedbackVisible(true);
        setTimeout(() => {
          setFeedbackVisible(false);
          // Navigate back to LinkedStudents screen
          try {
            const parentNav = navigation.getParent?.();
            if (parentNav) {
              parentNav.navigate('Home', { screen: 'LinkedStudents' });
            } else {
              navigation.navigate('LinkedStudents');
            }
          } catch {}
        }, 3000);
    } catch (error) {
      console.error('Error unlinking student:', error);
      // Close confirmation modal first
      setUnlinkConfirmVisible(false);
      
      // Show "No internet Connection" modal for all errors during database operations
      showErrorModal('No internet connection. Please check your network and try again.');
    } finally {
      setUnlinking(false);
    }
  };

  // Real-time listener for student data updates
  useEffect(() => {
    if (!currentStudent?.id && !currentStudent?.uid && !currentStudent?.studentId) return;

    // Try multiple IDs to find the document
    const candidateIds = [
      currentStudent?.id,
      currentStudent?.uid,
      currentStudent?.studentId
    ].filter(Boolean);
    
    if (candidateIds.length === 0) return;

    let unsubscribe = null;
    
    // Try each candidate ID until we find a valid document
    const tryListen = async () => {
      for (const candidateId of candidateIds) {
        try {
          const studentDocRef = doc(db, 'users', candidateId);
          unsubscribe = onSnapshot(studentDocRef, (snapshot) => {
            if (snapshot.exists()) {
              const data = snapshot.data();
              // Verify it's actually a student
              if (data.role === 'student') {
                const updatedData = { 
                  ...currentStudent, // Preserve existing state
                  ...data, // Update with fresh data
                  id: snapshot.id,
                  uid: data.uid || currentStudent?.uid || currentStudent?.id,
                  studentId: data.studentId || currentStudent?.studentId,
                  linkId: currentStudent?.linkId || student?.linkId, // Preserve linkId
                };
                setCurrentStudent(updatedData);
              }
            }
          }, (error) => {
            console.log('Error listening to student updates:', error);
            // Only show network error modal for actual network errors
            if (error?.code?.includes('unavailable') || error?.code?.includes('network') || error?.message?.toLowerCase().includes('network')) {
              showErrorModal('No internet connection. Please check your network and try again.');
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
  }, [currentStudent?.id, currentStudent?.uid, currentStudent?.studentId, currentStudent?.linkId]);

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
              <Text style={styles.fullName}>{fullName || "Student"}</Text>
              <View style={styles.chipsRow}>
                <View style={[styles.chip, hasQR ? styles.chipWithQR : styles.chipNoQR]}>
                  <Ionicons name={hasQR ? "checkmark-circle" : "close-circle"} size={12} color={hasQR ? "#16A34A" : "#DC2626"} />
                  <Text style={[styles.chipText, hasQR ? styles.chipTextWithQR : styles.chipTextNoQR]}>
                    {hasQR ? "WITH QR" : "NO QR"}
                  </Text>
                </View>
                {!!currentStudent?.studentId && (
                  <View style={[styles.chip, { backgroundColor: "#DBEAFE" }]}>
                    <Ionicons name="id-card-outline" size={12} color="#2563eb" />
                    <Text style={[styles.chipText, { color: "#2563eb", fontSize: 11 }]}>ID: {currentStudent.studentId}</Text>
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
            <Text style={styles.label}>Student ID</Text>
            <Text style={styles.value}>{currentStudent?.studentId || "—"}</Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.label}>Course</Text>
            <Text style={styles.value}>{currentStudent?.course || "—"}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.label}>Section</Text>
            <Text style={styles.value}>{currentStudent?.section || "—"}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.label}>Year Level</Text>
            <Text style={styles.value}>{formatYearLabel(currentStudent?.yearLevel) || "—"}</Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.label}>Email</Text>
            <Text style={styles.value}>{currentStudent?.email || "—"}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.label}>Contact</Text>
            <Text style={styles.value}>{currentStudent?.contactNumber || "—"}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.label}>Gender</Text>
            <Text style={styles.value}>{currentStudent?.gender || "—"}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.label}>Age</Text>
            <Text style={styles.value}>{currentStudent?.age || "—"}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.label}>Birthday</Text>
            <Text style={styles.value}>
              {(() => { 
                if (!currentStudent?.birthday) return '—'; 
                try { 
                  const d = new Date(currentStudent.birthday); 
                  if (isNaN(d.getTime())) return String(currentStudent.birthday); 
                  return d.toLocaleDateString(); 
                } catch { 
                  return String(currentStudent.birthday); 
                } 
              })()}
            </Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.label}>Address</Text>
            <Text style={styles.value} numberOfLines={3}>
              {currentStudent?.address || "—"}
            </Text>
          </View>

          {/* Linked Parent Section */}
          <View style={[styles.infoRow, styles.infoRowLast]}>
            <Text style={styles.label}>Linked Parent</Text>
            {linkedParents.length > 0 ? (
              <View style={styles.linkedStudentsContainer}>
                {linkedParents.map((parent, index) => (
                  <View key={parent.id || index} style={styles.linkedStudentItem}>
                    <Ionicons name="person-outline" size={14} color="#004f89" />
                    <Text style={styles.linkedStudentText}>{parent.parentName || 'Unknown Parent'}</Text>
                    {parent.relationship && (
                      <Text style={styles.relationshipText}>({parent.relationship})</Text>
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
              <Text style={styles.fbModalTitle}>Unlink student?</Text>
              <Text style={styles.fbModalMessage}>
                Are you sure you want to unlink {currentStudent?.firstName} {currentStudent?.lastName}? This action cannot be undone.
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
  chipWithQR: {
    backgroundColor: "#DCFCE7",
    borderWidth: 1,
    borderColor: "#86EFAC",
  },
  chipNoQR: {
    backgroundColor: "#FEE2E2",
    borderWidth: 1,
    borderColor: "#FCA5A5",
  },
  chipTextWithQR: { color: "#16A34A", fontWeight: "700", fontSize: 11 },
  chipTextNoQR: { color: "#DC2626", fontWeight: "700", fontSize: 11 },
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
  // Network Error Modal styles
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
    marginBottom: 8,
  },
  fbModalMessage: {
    fontSize: 15,
    color: '#65676B',
    textAlign: 'left',
    lineHeight: 20,
  },
});

export default StudentProfile;
