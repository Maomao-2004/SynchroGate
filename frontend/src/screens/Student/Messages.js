import React, { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, FlatList, Modal, Dimensions, Pressable } from 'react-native';
import { useNavigation, useIsFocused } from '@react-navigation/native';
import { AuthContext } from '../../contexts/AuthContext';
import { Ionicons } from '@expo/vector-icons';
import {
  collection,
  query,
  where,
  onSnapshot,
  orderBy,
  addDoc,
  doc,
  setDoc,
  serverTimestamp,
  getDocs,
  limit,
} from 'firebase/firestore';
import { db } from '../../utils/firebaseConfig';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';

const { width } = Dimensions.get('window');

function Messages() {
  const navigation = useNavigation();
  const { user, logout } = useContext(AuthContext);
  const isFocused = useIsFocused();
  const [loadingLinks, setLoadingLinks] = useState(true);
  const [linkedParents, setLinkedParents] = useState([]);
  const [linkedStudents, setLinkedStudents] = useState([]);
  const [lastMessages, setLastMessages] = useState({});
  const [manuallyRead, setManuallyRead] = useState({});
  const [readReceipts, setReadReceipts] = useState({});
  const [selectedParent, setSelectedParent] = useState(null);
  const [messages, setMessages] = useState([]);
  const [sending, setSending] = useState(false);
  const [input, setInput] = useState('');
  const messagesRef = useRef(null);
  const convUnsubsRef = useRef({});
  const readUnsubsRef = useRef({});
  const readReceiptsRef = useRef({});
  const lastMessagesRef = useRef({});
  const manuallyReadRef = useRef({});
  const [manualReadLoaded, setManualReadLoaded] = useState(false);
  const notifiedMsgIdsRef = useRef(new Set());
  const studentConvUnsubsRef = useRef({});
  const studentReadUnsubsRef = useRef({});

  const storageKey = useMemo(() => (user?.uid ? `studentManualRead_${user.uid}` : null), [user?.uid]);

  useEffect(() => { readReceiptsRef.current = readReceipts; }, [readReceipts]);
  useEffect(() => { lastMessagesRef.current = lastMessages; }, [lastMessages]);
  useEffect(() => { manuallyReadRef.current = manuallyRead; }, [manuallyRead]);

  // Load persisted manual-read state
  useEffect(() => {
    let isActive = true;
    const loadManual = async () => {
      if (!storageKey) { setManualReadLoaded(true); return; }
      try {
        const raw = await AsyncStorage.getItem(storageKey);
        if (!isActive) return;
        if (raw) {
          try {
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed === 'object') {
              setManuallyRead(parsed);
            }
          } catch {}
        }
      } finally {
        if (isActive) setManualReadLoaded(true);
      }
    };
    loadManual();
    return () => { isActive = false; };
  }, [storageKey]);

  const [logoutVisible, setLogoutVisible] = useState(false);

  const handleLogout = () => {
    setLogoutVisible(true);
  };

  const confirmLogout = async () => {
    setLogoutVisible(false);
    try {
      await logout();
    } catch {}
  };

  const cancelLogout = () => {
    setLogoutVisible(false);
  };

  // Load linked parents for this student (query both studentId and studentIdNumber)
  useEffect(() => {
    if (!user?.uid) { setLinkedParents([]); setLoadingLinks(false); return; }
    
    // Get student identifiers (both UID and student ID number)
    const getStudentIdentifiers = () => {
      const identifiers = [];
      const uid = String(user?.uid || '').trim();
      const studentNumber = String(user?.studentId || user?.studentID || '').trim();
      if (uid) identifiers.push({ field: 'studentId', value: uid });
      if (studentNumber) identifiers.push({ field: 'studentIdNumber', value: studentNumber });
      return identifiers;
    };
    
    const identifiers = getStudentIdentifiers();
    if (identifiers.length === 0) {
      setLinkedParents([]);
      setLoadingLinks(false);
      return;
    }
    
    setLoadingLinks(true);
    
    // Create queries for each identifier
    const queries = identifiers.map(({ field, value }) =>
      query(
        collection(db, 'parent_student_links'),
        where(field, '==', value),
        where('status', '==', 'active')
      )
    );
    
    // Store results from each listener
    const resultsMap = new Map();
    const initializedSet = new Set();
    
    // Helper to combine all results and update state
    const updateCombinedResults = async () => {
      const allParents = new Map();
      resultsMap.forEach((queryResults) => {
        queryResults.forEach((parent, linkId) => {
          if (!allParents.has(linkId)) {
            allParents.set(linkId, parent);
          }
        });
      });
      
      const parentsArray = Array.from(allParents.values());
      setLinkedParents(parentsArray);
      
      // Find other students linked to the same parents
      const currentStudentId = user?.studentId || user?.uid;
      const currentStudentUid = user?.uid;
      const studentsMap = new Map();
      
      // For each parent, find all students linked to that parent
      for (const p of parentsArray) {
        const parentKey = p.parentIdNumber || p.parentId;
        if (!parentKey) continue;
        
        try {
          // Query for all students linked to this parent
          const parentQueries = [
            query(collection(db, 'parent_student_links'), where('parentId', '==', p.parentId), where('status', '==', 'active')),
          ];
          if (p.parentIdNumber) {
            parentQueries.push(
              query(collection(db, 'parent_student_links'), where('parentIdNumber', '==', p.parentIdNumber), where('status', '==', 'active'))
            );
          }
          
          const allSnaps = await Promise.all(parentQueries.map(q => getDocs(q)));
          for (const snap of allSnaps) {
            for (const linkDoc of snap.docs) {
              const linkData = linkDoc.data();
              const studentId = linkData.studentId;
              const studentIdNumber = linkData.studentIdNumber;
              const studentName = linkData.studentName || '';
              
              // Skip current student
              if ((studentId && (studentId === currentStudentUid || studentId === currentStudentId)) ||
                  (studentIdNumber && studentIdNumber === currentStudentId)) {
                continue;
              }
              
              // Use a unique key for the student (prefer studentIdNumber, fallback to studentId)
              const studentKey = studentIdNumber || studentId;
              if (!studentKey || studentsMap.has(studentKey)) continue;
              
              // Try to get full student info from users collection
              let fullName = studentName;
              let studentUid = studentId;
              
              try {
                const usersRef = collection(db, 'users');
                let userSnap = null;
                if (studentId && !String(studentId).includes('-')) {
                  const q = query(usersRef, where('uid', '==', studentId));
                  userSnap = await getDocs(q);
                }
                if ((!userSnap || userSnap.empty) && studentIdNumber) {
                  const q = query(usersRef, where('studentId', '==', studentIdNumber));
                  userSnap = await getDocs(q);
                }
                if (userSnap && !userSnap.empty) {
                  const userData = userSnap.docs[0].data();
                  fullName = `${userData.firstName || ''} ${userData.lastName || ''}`.trim() || studentName;
                  studentUid = userData.uid || studentId;
                }
              } catch {}
              
              studentsMap.set(studentKey, {
                studentId: studentUid,
                studentIdNumber: studentIdNumber || null,
                studentName: fullName || 'Student',
                linkId: `student-${studentKey}`, // Unique identifier for this student entry
              });
            }
          }
        } catch (error) {
          console.log('Error loading linked students for parent:', error);
        }
      }
      
      const studentsArray = Array.from(studentsMap.values());
      setLinkedStudents(studentsArray);
      
      // Reset last messages and listeners when parents change
      try { Object.values(convUnsubsRef.current || {}).forEach((fn) => { try { fn(); } catch {} }); } catch {}
      try { Object.values(readUnsubsRef.current || {}).forEach((fn) => { try { fn(); } catch {} }); } catch {}
      try { Object.values(studentConvUnsubsRef.current || {}).forEach((fn) => { try { fn(); } catch {} }); } catch {}
      try { Object.values(studentReadUnsubsRef.current || {}).forEach((fn) => { try { fn(); } catch {} }); } catch {}
      convUnsubsRef.current = {};
      readUnsubsRef.current = {};
      studentConvUnsubsRef.current = {};
      studentReadUnsubsRef.current = {};
      setLastMessages({});
      setReadReceipts({});
      
      // Attach last-message listeners per parent
      for (const p of parentsArray) {
        const studentKey = user?.studentId || user?.uid;
        const parentKey = p.parentIdNumber || p.parentId;
        if (!studentKey || !parentKey) continue;
        const convId = `${studentKey}-${parentKey}`;
        try {
          const msgsRef = query(
            collection(db, 'conversations', convId, 'messages'),
            orderBy('createdAt', 'desc'),
            limit(1)
          );
          const off = onSnapshot(msgsRef, async (mSnap) => {
            const lastDoc = mSnap.docs[0]?.data();
            const last = lastDoc?.text || '';
            const senderId = lastDoc?.senderId || null;
            const createdAt = lastDoc?.createdAt || null;
            const createdAtMs = createdAt?.toMillis ? createdAt.toMillis() : null;
            setLastMessages((prev) => ({ ...prev, [p.linkId]: { text: last, senderId, createdAtMs } }));
            // Do not auto-clear manual read; once read manually, stay read
            try {
              const msgId = mSnap.docs[0]?.id;
              if (msgId && senderId && senderId !== user?.uid) {
                const key = `${convId}:${msgId}`;
                if (!notifiedMsgIdsRef.current.has(key)) {
                  await Notifications.scheduleNotificationAsync({
                    content: {
                      title: `New message from ${p.parentName || 'Parent'}`,
                      body: last || 'Open to view',
                      sound: 'default',
                      data: { convId, linkId: p.linkId },
                    },
                    trigger: null,
                  });
                  notifiedMsgIdsRef.current.add(key);
                }
              }
            } catch {}
          });
          convUnsubsRef.current[p.linkId] = off;
        } catch {}
        // listen for read receipt for current user on this conversation
        try {
          const rrRef = doc(db, 'conversations', convId, 'reads', user?.uid);
          const offRead = onSnapshot(rrRef, (snap) => {
            const data = snap.exists() ? snap.data() : {};
            const lastReadAt = data?.lastReadAt || null;
            const lastReadAtMs = lastReadAt?.toMillis ? lastReadAt.toMillis() : null;
            setReadReceipts((prev) => ({ ...prev, [p.linkId]: { lastReadAtMs } }));
            // Do not auto-clear manual read
          });
          readUnsubsRef.current[p.linkId] = offRead;
        } catch {}
      }
      
      // Attach last-message listeners per student
      for (const s of studentsArray) {
        const currentKey = user?.studentId || user?.uid;
        const otherKey = s.studentIdNumber || s.studentId;
        if (!currentKey || !otherKey) continue;
        
        // Create consistent conversation ID (alphabetically sorted to ensure same ID regardless of who initiates)
        const keys = [currentKey, otherKey].sort();
        const convId = `${keys[0]}-${keys[1]}`;
        
        try {
          const msgsRef = query(
            collection(db, 'conversations', convId, 'messages'),
            orderBy('createdAt', 'desc'),
            limit(1)
          );
          const off = onSnapshot(msgsRef, async (mSnap) => {
            const lastDoc = mSnap.docs[0]?.data();
            const last = lastDoc?.text || '';
            const senderId = lastDoc?.senderId || null;
            const createdAt = lastDoc?.createdAt || null;
            const createdAtMs = createdAt?.toMillis ? createdAt.toMillis() : null;
            setLastMessages((prev) => ({ ...prev, [s.linkId]: { text: last, senderId, createdAtMs } }));
            try {
              const msgId = mSnap.docs[0]?.id;
              if (msgId && senderId && senderId !== user?.uid) {
                const key = `${convId}:${msgId}`;
                if (!notifiedMsgIdsRef.current.has(key)) {
                  await Notifications.scheduleNotificationAsync({
                    content: {
                      title: `New message from ${s.studentName || 'Student'}`,
                      body: last || 'Open to view',
                      sound: 'default',
                      data: { convId, linkId: s.linkId },
                    },
                    trigger: null,
                  });
                  notifiedMsgIdsRef.current.add(key);
                }
              }
            } catch {}
          });
          studentConvUnsubsRef.current[s.linkId] = off;
        } catch {}
        // listen for read receipt for current user on this conversation
        try {
          const rrRef = doc(db, 'conversations', convId, 'reads', user?.uid);
          const offRead = onSnapshot(rrRef, (snap) => {
            const data = snap.exists() ? snap.data() : {};
            const lastReadAt = data?.lastReadAt || null;
            const lastReadAtMs = lastReadAt?.toMillis ? lastReadAt.toMillis() : null;
            setReadReceipts((prev) => ({ ...prev, [s.linkId]: { lastReadAtMs } }));
          });
          studentReadUnsubsRef.current[s.linkId] = offRead;
        } catch {}
      }
      
      if (!selectedParent && parentsArray.length > 0) setSelectedParent(parentsArray[0]);
      
      // Set loading to false after all queries have initialized
      if (initializedSet.size >= queries.length) {
        setLoadingLinks(false);
      }
    };
    
    // Set up real-time listeners for each query
    const unsubs = queries.map((qRef, index) => {
      return onSnapshot(qRef, async (snap) => {
        try {
          // Store results for this query
          const queryResults = new Map();
          for (const d of snap.docs) {
            const x = d.data();
            const linkId = d.id;
            queryResults.set(linkId, {
              linkId: d.id,
              parentId: x.parentId,
              parentIdNumber: x.parentIdNumber || null,
              parentName: x.parentName || 'Parent',
              relationship: x.relationship || '',
            });
          }
          
          resultsMap.set(index, queryResults);
          initializedSet.add(index);
          
          // Combine all results and update state
          await updateCombinedResults();
        } catch (error) {
          console.log('Error processing linked parents:', error);
          setLoadingLinks(false);
        }
      }, (error) => {
        console.log('Error loading linked parents:', error);
        setLoadingLinks(false);
      });
    });
    
    return () => {
      unsubs.forEach((unsub) => {
        try { unsub(); } catch {}
      });
      try { Object.values(convUnsubsRef.current || {}).forEach((fn) => { try { fn(); } catch {} }); } catch {}
      try { Object.values(readUnsubsRef.current || {}).forEach((fn) => { try { fn(); } catch {} }); } catch {}
      try { Object.values(studentConvUnsubsRef.current || {}).forEach((fn) => { try { fn(); } catch {} }); } catch {}
      try { Object.values(studentReadUnsubsRef.current || {}).forEach((fn) => { try { fn(); } catch {} }); } catch {}
      convUnsubsRef.current = {};
      readUnsubsRef.current = {};
      studentConvUnsubsRef.current = {};
      studentReadUnsubsRef.current = {};
    };
  }, [user?.uid, user?.studentId]);

  const conversationId = useMemo(() => {
    if (!user?.uid || !selectedParent?.parentId) return null;
    const studentKey = user?.studentId || user.uid;
    const parentKey = selectedParent?.parentIdNumber || selectedParent?.parentId;
    return `${studentKey}-${parentKey}`;
  }, [user?.uid, user?.studentId, selectedParent?.parentId, selectedParent?.parentIdNumber]);

  // Subscribe to messages for the selected conversation
  useEffect(() => {
    if (!conversationId) { setMessages([]); return; }
    const msgsRef = query(
      collection(db, 'conversations', conversationId, 'messages'),
      orderBy('createdAt', 'desc'),
      limit(50)
    );
    const unsub = onSnapshot(msgsRef, (snap) => {
      const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setMessages(items);
    });
    return () => { try { unsub(); } catch {} };
  }, [conversationId]);

  const ensureConversation = async () => {
    if (!conversationId) return;
    const convRef = doc(db, 'conversations', conversationId);
    await setDoc(convRef, {
      id: conversationId,
      parentId: selectedParent.parentId,
      studentId: user.uid,
      members: [selectedParent.parentId, user.uid],
      updatedAt: serverTimestamp(),
    }, { merge: true });
  };

  const sendMessage = async () => {
    const text = String(input || '').trim();
    if (!text || !conversationId || !user?.uid) return;
    try {
      setSending(true);
      await ensureConversation();
      const msgsCol = collection(db, 'conversations', conversationId, 'messages');
      await addDoc(msgsCol, {
        senderId: user.uid,
        text,
        createdAt: serverTimestamp(),
      });
      setInput('');
    } finally {
      setSending(false);
    }
  };

  const renderMessage = ({ item }) => {
    const mine = item.senderId === user?.uid;
    return (
      <View style={[styles.msgBubble, mine ? styles.msgMine : styles.msgTheirs]}>
        <Text style={[styles.msgText, mine ? styles.msgTextMine : styles.msgTextTheirs]}>{item.text}</Text>
      </View>
    );
  };

  return (
    <View style={styles.wrapper}>

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


      {/* Content */}
      <View style={styles.contentContainer}>
        {loadingLinks ? (
          <View style={{ flex: 1, backgroundColor: '#FFFFFF' }} />
        ) : linkedParents.length === 0 ? (
          <View style={styles.centerContainer}>
            <View style={styles.emptyCard}>
              <View style={styles.emptyIconWrap}>
                <View style={{ position: 'relative', width: 28, height: 28, alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="chatbubble-outline" size={28} color="#2563EB" />
                  <View style={{ position: 'absolute', width: 32, height: 2, backgroundColor: '#2563EB', transform: [{ rotate: '45deg' }] }} />
                </View>
              </View>
              <Text style={styles.emptyTitle}>No Messages Yet</Text>
              <Text style={styles.emptySubtext}>
                You haven't linked any parents to your account yet. Link with your parents to start messaging and stay connected.
              </Text>
            </View>
          </View>
        ) : (
          <>
          {(linkedParents.length > 0 || linkedStudents.length > 0) && (
            <View style={[styles.section, styles.sectionTightBelow]}>
              <View style={styles.blockCard}>
                <View style={styles.infoRow}>
                  <View style={styles.infoIconWrap}>
                    <Ionicons name="chatbubble-ellipses-outline" size={20} color="#2563EB" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.infoTitle}>Linked Parents & Students Messaging</Text>
                    <Text style={styles.infoSub}>Conversations are available for your linked parents and other students linked to the same parents. Tap a contact below to open your chat.</Text>
                  </View>
                </View>
              </View>
            </View>
          )}
          <View style={styles.listWrap}>
          <FlatList
            data={[...(linkedParents || []), ...(linkedStudents || [])]}
            keyExtractor={(it) => it.linkId || it.id}
            ListHeaderComponent={() => <View style={{ height: 1, backgroundColor: '#D1D5DB' }} />}
            contentContainerStyle={{ flexGrow: 1 }}
            renderItem={({ item }) => {
              const isStudent = item.studentId || item.studentIdNumber;
              const displayName = isStudent ? (item.studentName || 'Student') : (item.parentName || 'Parent');
              const lm = lastMessages[item.linkId];
              const rr = readReceipts[item.linkId];
              const lastReadAtMs = rr?.lastReadAtMs;
              const isRead = manuallyRead[item.linkId] || (lm?.senderId && lm.senderId === user?.uid);
              
              return (
                <Pressable
                  style={({ pressed }) => [
                    styles.threadRow,
                    pressed ? styles.threadRowPressed : null,
                    isRead ? styles.threadRowRead : null,
                  ]}
                  onPress={async () => {
                    // Navigate immediately; perform read-receipt write without awaiting to avoid UI delay
                    try {
                      if (isStudent) {
                        // Student-to-student conversation
                        const currentKey = user?.studentId || user?.uid;
                        const otherKey = item.studentIdNumber || item.studentId;
                        if (currentKey && otherKey) {
                          const keys = [currentKey, otherKey].sort();
                          const convId = `${keys[0]}-${keys[1]}`;
                          const rrRef = doc(db, 'conversations', convId, 'reads', user?.uid);
                          setDoc(rrRef, { lastReadAt: serverTimestamp() }, { merge: true }).catch(() => {});
                        }
                      } else {
                        // Student-to-parent conversation
                        const studentKey = user?.studentId || user?.uid;
                        const parentKey = item.parentIdNumber || item.parentId;
                        if (studentKey && parentKey) {
                          const convId = `${studentKey}-${parentKey}`;
                          const rrRef = doc(db, 'conversations', convId, 'reads', user?.uid);
                          setDoc(rrRef, { lastReadAt: serverTimestamp() }, { merge: true }).catch(() => {});
                        }
                      }
                    } catch {}
                    setManuallyRead((prev) => {
                      const next = { ...prev, [item.linkId]: true };
                      // persist
                      try { if (storageKey) AsyncStorage.setItem(storageKey, JSON.stringify(next)); } catch {}
                      return next;
                    });
                    
                    if (isStudent) {
                      navigation.navigate('StudentConversation', { 
                        studentId: item.studentId, 
                        studentIdNumber: item.studentIdNumber, 
                        studentName: item.studentName 
                      });
                    } else {
                      navigation.navigate('StudentConversation', { 
                        parentId: item.parentId, 
                        parentIdNumber: item.parentIdNumber, 
                        parentName: item.parentName 
                      });
                    }
                  }}
                >
                  <View style={styles.avatar}><Text style={styles.avatarText}>{displayName.charAt(0).toUpperCase()}</Text></View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.threadName}>{displayName}</Text>
                    <Text
                      style={isRead ? styles.threadSubRead : styles.threadSubLast}
                      numberOfLines={1}
                    >
                      {(() => {
                        const txt = lm?.text || 'No messages yet';
                        const mine = lm?.senderId && lm.senderId === user?.uid;
                        return `${mine ? 'You: ' : ''}${txt}`;
                      })()}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color="#9CA3AF" />
                </Pressable>
              );
            }}
            // per-row borders show a separator even for single item
          />
          </View>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { flex: 1, backgroundColor: '#F9FAFB' },
  listWrap: { flex: 1, paddingVertical: 10, paddingHorizontal: 0, paddingTop: 0, paddingBottom: 90 },
  centerRow: { flexDirection: 'row', alignItems: 'center' },
  loadingText: { marginLeft: 8, color: '#6B7280' },
  threadRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: '#D1D5DB' },
  threadRowRead: { backgroundColor: '#F3F4F6', borderRadius: 10, paddingHorizontal: 8 },
  threadRowPressed: { backgroundColor: '#F3F4F6', borderRadius: 10, paddingHorizontal: 8 },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center', marginRight: 12, borderWidth: 1, borderColor: '#DBEAFE' },
  avatarText: { color: '#2563EB', fontWeight: '800' },
  threadName: { fontSize: 16, fontWeight: '700', color: '#111827' },
  threadSub: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  threadSubLast: { fontSize: 12, color: '#2563EB', marginTop: 2, fontWeight: '700' },
  threadSubRead: { fontSize: 12, color: '#6B7280', marginTop: 2, fontWeight: '400' },
  separator: { height: 2, backgroundColor: '#D1D5DB' },
  centerFill: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { color: '#6B7280' },
  // Modal styles
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  modalCard: { backgroundColor: '#fff', borderRadius: 16, padding: 24, width: '80%', alignItems: 'center' },
  modalIconWrap: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  modalTitle: { fontSize: 20, fontWeight: '700', color: '#111827', marginBottom: 8 },
  modalText: { fontSize: 16, color: '#6B7280', textAlign: 'center', marginBottom: 24 },
  modalActions: { flexDirection: 'row', gap: 12 },
  modalButton: { flex: 1, paddingVertical: 12, paddingHorizontal: 16, borderRadius: 8, alignItems: 'center' },
  modalButtonText: { fontSize: 16, fontWeight: '600', color: '#6B7280' },
  modalButtonDanger: { backgroundColor: '#FEE2E2' },
  modalButtonDangerText: { color: '#b91c1c' },
  contentContainer: { padding: 16, paddingBottom: 120, paddingTop: 50, flexGrow: 1 },
  centerContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 16 },
  loadingText: { marginTop: 12, color: '#6B7280', fontSize: 16 },
  emptyCard: { backgroundColor: '#fff', borderRadius: 12, padding: 16, alignItems: 'center', borderWidth: 1, borderColor: '#E5E7EB', shadowColor: '#0F172A', shadowOpacity: 0.08, shadowOffset: { width: 0, height: 6 }, shadowRadius: 12, elevation: 4, width: '100%' },
  emptyIconWrap: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: '#111827', marginTop: 0, marginBottom: 4 },
  emptySubtext: { fontSize: 12, color: '#6B7280', textAlign: 'center', lineHeight: 16, marginBottom: 12 },
  // Section/card styles to match Dashboard Quick Overview positioning
  section: { marginBottom: 8, marginTop: 12 },
  sectionTightBelow: { marginBottom: 6 },
  blockCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 12,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    marginTop: 0,
  },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  sectionTitle: { fontSize: 30, fontWeight: '700', color: '#111827', marginRight: 8, marginBottom: 5, marginTop: 10 },
  infoRow: { flexDirection: 'row', alignItems: 'center' },
  infoIconWrap: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#F0F9FF', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  infoTitle: { fontSize: 14, fontWeight: '700', color: '#111827', marginBottom: 4 },
  infoSub: { fontSize: 13, color: '#6B7280' },
});

export default Messages;

