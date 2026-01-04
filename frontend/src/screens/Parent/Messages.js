import React, { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, FlatList, Image, Modal, Animated, Dimensions, Pressable } from 'react-native';
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
  limit,
} from 'firebase/firestore';
import { db } from '../../utils/firebaseConfig';
import { getNetworkErrorMessage } from '../../utils/networkErrorHandler';
import AsyncStorage from '@react-native-async-storage/async-storage';

const { width } = Dimensions.get('window');

function Messages() {
  const navigation = useNavigation();
  const { user, logout } = useContext(AuthContext);
  const isFocused = useIsFocused();
  const [loadingLinks, setLoadingLinks] = useState(true);
  const [linkedStudents, setLinkedStudents] = useState([]);
  const [lastMessages, setLastMessages] = useState({});
  const [manuallyRead, setManuallyRead] = useState({});
  const [readReceipts, setReadReceipts] = useState({});
  const [selectedStudent, setSelectedStudent] = useState(null);
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
  const [networkErrorVisible, setNetworkErrorVisible] = useState(false);
  const [networkErrorTitle, setNetworkErrorTitle] = useState('');
  const [networkErrorMessage, setNetworkErrorMessage] = useState('');
  const [networkErrorColor, setNetworkErrorColor] = useState('#DC2626');
  // Local notification dedupe removed; notifications now handled globally

  const storageKey = useMemo(() => (user?.uid ? `parentManualRead_${user.uid}` : null), [user?.uid]);

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

  // sidebar removed
  const [profilePic, setProfilePic] = useState(null);
  const [logoutVisible, setLogoutVisible] = useState(false);

  useEffect(() => {
    const loadProfilePic = async () => {
      try {
        const saved = await AsyncStorage.getItem(`parentProfilePic_${user?.parentId}`);
        setProfilePic(saved ? { uri: saved } : null);
      } catch {
        setProfilePic(null);
      }
    };
    if (isFocused) loadProfilePic();
  }, [isFocused, user?.parentId]);

  // sidebar removed

  const handleLogout = () => { setLogoutVisible(true); };

  const confirmLogout = async () => {
    setLogoutVisible(false);
    try {
      await logout();
    } catch {}
  };

  const cancelLogout = () => {
    setLogoutVisible(false);
  };

  // Load linked students for this parent
  useEffect(() => {
    if (!user?.uid) { setLinkedStudents([]); setLoadingLinks(false); return; }
    const canonicalId = String(user?.parentId || '').trim();
    const qUid = query(
      collection(db, 'parent_student_links'),
      where('parentId', '==', user.uid),
      where('status', '==', 'active'),
    );
    const mergeStudents = (docs) => {
      // Build next list of students
      const nextMap = new Map();
      docs.forEach(d => {
        const x = d.data() || {};
        const key = String(x.studentId || x.studentIdNumber || '').trim();
        if (!key) return;
        nextMap.set(key, {
          linkId: d.id,
          studentId: x.studentId,
          studentIdNumber: x.studentIdNumber || null,
          studentName: x.studentName || 'Student',
          relationship: x.relationship || '',
        });
      });
      const nextStudents = Array.from(nextMap.values());
      setLinkedStudents(nextStudents);

      // Reset listeners for deduped set
      try { Object.values(convUnsubsRef.current || {}).forEach((fn) => { try { fn(); } catch {} }); } catch {}
      try { Object.values(readUnsubsRef.current || {}).forEach((fn) => { try { fn(); } catch {} }); } catch {}
      convUnsubsRef.current = {};
      readUnsubsRef.current = {};
      setLastMessages({});
      setReadReceipts({});

      // Attach last-message and read-receipt listeners per student
      for (const s of nextStudents) {
        const studentKey = s.studentIdNumber || s.studentId;
        const parentKey = user?.parentId || user?.uid;
        if (!studentKey || !parentKey) continue;
        const convId = `${studentKey}-${parentKey}`;

        try {
          const msgsRef = query(
            collection(db, 'conversations', convId, 'messages'),
            orderBy('createdAt', 'desc'),
            limit(1)
          );
          const off = onSnapshot(
            msgsRef, 
            async (mSnap) => {
              const lastSnapshot = mSnap.docs[0];
              const lastDoc = lastSnapshot?.data();
              const last = lastDoc?.text || '';
              const senderId = lastDoc?.senderId || null;
              const createdAt = lastDoc?.createdAt || null;
              const createdAtMs = createdAt?.toMillis ? createdAt.toMillis() : null;
              setLastMessages((prev) => ({ ...prev, [s.linkId]: { text: last, senderId, createdAtMs } }));

              // If a newer incoming message arrives, clear manual-read so the thread shows as unread
              try {
                if (createdAtMs && senderId && senderId !== user?.uid) {
                  const lastReadAtMs = readReceiptsRef.current?.[s.linkId]?.lastReadAtMs || 0;
                  const wasManuallyRead = !!manuallyReadRef.current?.[s.linkId];
                  if (createdAtMs > lastReadAtMs && wasManuallyRead) {
                    setManuallyRead((prev) => {
                      if (!prev[s.linkId]) return prev;
                      const next = { ...prev };
                      delete next[s.linkId];
                      try { if (storageKey) AsyncStorage.setItem(storageKey, JSON.stringify(next)); } catch {}
                      return next;
                    });
                  }
                }
              } catch {}

              // Notification sending is handled globally
            },
            (error) => {
              const errorInfo = getNetworkErrorMessage(error);
              if (error?.code?.includes('unavailable') || error?.code?.includes('deadline-exceeded') || error?.message?.toLowerCase().includes('network') || error?.message?.toLowerCase().includes('connection')) {
                setNetworkErrorTitle(errorInfo.title);
                setNetworkErrorMessage(errorInfo.message);
                setNetworkErrorColor(errorInfo.color);
                setNetworkErrorVisible(true);
                setTimeout(() => setNetworkErrorVisible(false), 5000);
              }
            }
          );
          convUnsubsRef.current[s.linkId] = off;
        } catch {}

        try {
          const rrRef = doc(db, 'conversations', convId, 'reads', user?.uid);
          const offRead = onSnapshot(
            rrRef, 
            (snap) => {
              const data = snap.exists() ? snap.data() : {};
              const lastReadAt = data?.lastReadAt || null;
              const lastReadAtMs = lastReadAt?.toMillis ? lastReadAt.toMillis() : null;
              setReadReceipts((prev) => ({ ...prev, [s.linkId]: { lastReadAtMs } }));
            },
            (error) => {
              const errorInfo = getNetworkErrorMessage(error);
              if (error?.code?.includes('unavailable') || error?.code?.includes('deadline-exceeded') || error?.message?.toLowerCase().includes('network') || error?.message?.toLowerCase().includes('connection')) {
                setNetworkErrorTitle(errorInfo.title);
                setNetworkErrorMessage(errorInfo.message);
                setNetworkErrorColor(errorInfo.color);
                setNetworkErrorVisible(true);
                setTimeout(() => setNetworkErrorVisible(false), 5000);
              }
            }
          );
          readUnsubsRef.current[s.linkId] = offRead;
        } catch {}
      }
    };
    const unsubUid = onSnapshot(
      qUid, 
      (snap) => { try { mergeStudents(snap.docs); setLoadingLinks(false); } catch { setLoadingLinks(false); } },
      (error) => {
        const errorInfo = getNetworkErrorMessage(error);
        if (error?.code?.includes('unavailable') || error?.code?.includes('deadline-exceeded') || error?.message?.toLowerCase().includes('network') || error?.message?.toLowerCase().includes('connection')) {
          setNetworkErrorTitle(errorInfo.title);
          setNetworkErrorMessage(errorInfo.message);
          setNetworkErrorColor(errorInfo.color);
          setNetworkErrorVisible(true);
          setTimeout(() => setNetworkErrorVisible(false), 5000);
        }
        setLoadingLinks(false);
      }
    );
    let unsubCanonical = null;
    if (canonicalId && canonicalId.includes('-')) {
      const qCanon = query(
        collection(db, 'parent_student_links'),
        where('parentIdNumber', '==', canonicalId),
        where('status', '==', 'active'),
      );
      unsubCanonical = onSnapshot(
        qCanon, 
        (snap) => { try { mergeStudents(snap.docs); } catch {} },
        (error) => {
          const errorInfo = getNetworkErrorMessage(error);
          if (error?.code?.includes('unavailable') || error?.code?.includes('deadline-exceeded') || error?.message?.toLowerCase().includes('network') || error?.message?.toLowerCase().includes('connection')) {
            setNetworkErrorTitle(errorInfo.title);
            setNetworkErrorMessage(errorInfo.message);
            setNetworkErrorColor(errorInfo.color);
            setNetworkErrorVisible(true);
            setTimeout(() => setNetworkErrorVisible(false), 5000);
          }
        }
      );
    }
    return () => { try { unsubUid && unsubUid(); } catch {} try { unsubCanonical && unsubCanonical(); } catch {} };
  }, [user?.uid, user?.parentId]);

  const conversationId = useMemo(() => {
    if (!user?.uid || !selectedStudent?.studentId) return null;
    const studentKey = selectedStudent?.studentIdNumber || selectedStudent?.studentId;
    const parentKey = user?.parentId || user?.uid;
    return `${studentKey}-${parentKey}`;
  }, [user?.uid, user?.parentId, selectedStudent?.studentId, selectedStudent?.studentIdNumber]);

  // Subscribe to messages for the selected conversation
  useEffect(() => {
    if (!conversationId) { setMessages([]); return; }
    const msgsRef = query(
      collection(db, 'conversations', conversationId, 'messages'),
      orderBy('createdAt', 'desc'),
      limit(50)
    );
    const unsub = onSnapshot(
      msgsRef, 
      (snap) => {
        const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        setMessages(items);
      },
      (error) => {
        const errorInfo = getNetworkErrorMessage(error);
        if (error?.code?.includes('unavailable') || error?.code?.includes('deadline-exceeded') || error?.message?.toLowerCase().includes('network') || error?.message?.toLowerCase().includes('connection')) {
          setNetworkErrorTitle(errorInfo.title);
          setNetworkErrorMessage(errorInfo.message);
          setNetworkErrorColor(errorInfo.color);
          setNetworkErrorVisible(true);
          setTimeout(() => setNetworkErrorVisible(false), 5000);
        }
      }
    );
    return () => { try { unsub(); } catch {} };
  }, [conversationId]);

  const ensureConversation = async () => {
    if (!conversationId) return;
    try {
      const convRef = doc(db, 'conversations', conversationId);
      await setDoc(convRef, {
        id: conversationId,
        parentId: user.uid,
        studentId: selectedStudent.studentId,
        members: [user.uid, selectedStudent.studentId],
        updatedAt: serverTimestamp(),
      }, { merge: true });
    } catch (error) {
      console.error('Error ensuring conversation:', error);
      // Only show network error modal for actual network errors
      if (error?.code?.includes('unavailable') || error?.code?.includes('network') || error?.message?.toLowerCase().includes('network')) {
        const errorInfo = getNetworkErrorMessage({ type: 'unstable_connection', message: error.message });
        setNetworkErrorTitle(errorInfo.title);
        setNetworkErrorMessage(errorInfo.message);
        setNetworkErrorColor(errorInfo.color);
        setNetworkErrorVisible(true);
        setTimeout(() => setNetworkErrorVisible(false), 5000);
      }
      throw error;
    }
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
    } catch (error) {
      console.error('Error sending message:', error);
      // Only show network error modal for actual network errors
      if (error?.code?.includes('unavailable') || error?.code?.includes('network') || error?.message?.toLowerCase().includes('network')) {
        const errorInfo = getNetworkErrorMessage({ type: 'unstable_connection', message: error.message });
        setNetworkErrorTitle(errorInfo.title);
        setNetworkErrorMessage(errorInfo.message);
        setNetworkErrorColor(errorInfo.color);
        setNetworkErrorVisible(true);
        setTimeout(() => setNetworkErrorVisible(false), 5000);
      }
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
      {/* In-screen header and sidebar removed; unified header used */}

      {/* Content */}
      <View style={styles.contentContainer}>
        {loadingLinks ? (
          <View style={{ flex: 1, backgroundColor: '#FFFFFF' }} />
        ) : linkedStudents.length === 0 ? (
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
                You haven't linked any students to your account yet. Link your children to start messaging with them and stay connected.
              </Text>
            </View>
          </View>
        ) : (
          <>
          {linkedStudents.length > 0 && (
            <View style={[styles.section, styles.sectionTightBelow]}>
              <View style={styles.blockCard}>
                <View style={styles.infoRow}>
                  <View style={styles.infoIconWrap}>
                    <Ionicons name="chatbubble-ellipses-outline" size={20} color="#2563EB" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.infoTitle}>Linked Students Messaging</Text>
                    <Text style={styles.infoSub}>Conversations are available for your linked students. Tap a student below to open your chat.</Text>
                  </View>
                </View>
              </View>
            </View>
          )}
          <View style={styles.listWrap}>
          <FlatList
            data={(linkedStudents || []).slice(0, 4)}
            keyExtractor={(it) => it.linkId}
            ListHeaderComponent={() => <View style={{ height: 1, backgroundColor: '#D1D5DB' }} />}
            contentContainerStyle={{ flexGrow: 1, paddingBottom: 16 }}
            showsVerticalScrollIndicator={true}
            renderItem={({ item }) => (
              <Pressable
                style={({ pressed }) => [
                  styles.threadRow,
                  pressed ? styles.threadRowPressed : null,
                  (() => {
                    const lm = lastMessages[item.linkId];
                    const rr = readReceipts[item.linkId];
                    const lastReadAtMs = rr?.lastReadAtMs;
                    const isRead = manuallyRead[item.linkId] || (lm?.senderId && lm.senderId === user?.uid);
                    return isRead ? styles.threadRowRead : null;
                  })(),
                ]}
                onPress={async () => {
                  // Navigate immediately; perform read-receipt write without awaiting to avoid UI delay
                  try {
                    const studentKey = item.studentIdNumber || item.studentId;
                    const parentKey = user?.parentId || user?.uid;
                    const convId = `${studentKey}-${parentKey}`;
                    const rrRef = doc(db, 'conversations', convId, 'reads', user?.uid);
                    setDoc(rrRef, { lastReadAt: serverTimestamp() }, { merge: true }).catch(() => {});
                  } catch {}
                  setManuallyRead((prev) => {
                    const next = { ...prev, [item.linkId]: true };
                    // persist
                    try { if (storageKey) AsyncStorage.setItem(storageKey, JSON.stringify(next)); } catch {}
                    return next;
                  });
                  navigation.navigate('ParentConversation', { studentId: item.studentId, studentIdNumber: item.studentIdNumber, studentName: item.studentName });
                }}
              >
                <View style={styles.avatar}><Text style={styles.avatarText}>{(item.studentName || 'S').charAt(0)}</Text></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.threadName}>{item.studentName || 'Student'}</Text>
                  <Text
                    style={(() => {
                      const lm = lastMessages[item.linkId];
                      const rr = readReceipts[item.linkId];
                      const lastReadAtMs = rr?.lastReadAtMs;
                      const isRead = manuallyRead[item.linkId] || (lm?.senderId && lm.senderId === user?.uid);
                      return isRead ? styles.threadSubRead : styles.threadSubLast;
                    })()}
                    numberOfLines={1}
                  >
                    {(() => {
                      const lm = lastMessages[item.linkId];
                      const txt = lm?.text || 'No messages yet';
                      const mine = lm?.senderId && lm.senderId === user?.uid;
                      return `${mine ? 'You: ' : ''}${txt}`;
                    })()}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#9CA3AF" />
              </Pressable>
            )}
            // per-row borders show a separator even for single item
          />
          </View>
          </>
        )}
      </View>

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
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { flex: 1, backgroundColor: '#F9FAFB' },
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
  profileAvatar: { width: 50, height: 50, borderRadius: 30, marginRight: 8 },
  greeting: { fontSize: 20, fontWeight: '600', color: '#FFFFFF' },
  iconButton: { marginRight: 12 },
  listWrap: { flex: 1, paddingVertical: 10, paddingHorizontal: 0, paddingTop: 0, paddingBottom: 0 },
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
  sidebar: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: width * 0.6,
    backgroundColor: '#fff',
    padding: 20,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowOffset: { width: -5, height: 0 },
    shadowRadius: 10,
    zIndex: 10,
    borderTopStartRadius: 15,
  },
  sidebarTitle: { fontSize: 25, fontWeight: 'bold', marginTop: 30, marginBottom: 20 },
  sidebarItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  sidebarText: { fontSize: 16, marginLeft: 12, color: '#111827' },
  activeSidebarItem: {
    backgroundColor: '#EFF6FF',
    borderRadius: 8,
    marginVertical: 2,
  },
  activeSidebarText: { color: '#2563EB', fontWeight: '600' },
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(17,24,39,0.25)', zIndex: 9 },
  logoutItem: { marginTop: 20 },
  // Modal styles
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  modalCard: { backgroundColor: '#fff', borderRadius: 16, padding: 24, width: '85%', maxWidth: 400, alignItems: 'center' },
  modalIconWrap: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  modalTitle: { fontSize: 20, fontWeight: '700', color: '#111827', marginBottom: 8 },
  modalText: { fontSize: 16, color: '#6B7280', textAlign: 'center', marginBottom: 24 },
  modalActions: { flexDirection: 'row', gap: 12 },
  modalButton: { flex: 1, paddingVertical: 12, paddingHorizontal: 16, borderRadius: 8, alignItems: 'center' },
  modalButtonText: { fontSize: 16, fontWeight: '600', color: '#6B7280' },
  modalButtonDanger: { backgroundColor: '#FEE2E2' },
  modalButtonDangerText: { color: '#b91c1c' },
  contentContainer: { padding: 16, paddingBottom: 80, paddingTop: 50, flexGrow: 1 },
  centerContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  loadingContainer: { alignItems: 'center', justifyContent: 'center', paddingVertical: 40 },
  loadingText: { marginTop: 12, color: '#6B7280', fontSize: 16 },
  emptyCard: { backgroundColor: '#fff', borderRadius: 12, padding: 16, alignItems: 'center', borderWidth: 1, borderColor: '#E5E7EB', shadowColor: '#0F172A', shadowOpacity: 0.08, shadowOffset: { width: 0, height: 6 }, shadowRadius: 12, elevation: 4, width: '100%' },
  emptyIconWrap: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: '#111827', marginTop: 0, marginBottom: 4 },
  emptySubtext: { fontSize: 12, color: '#6B7280', textAlign: 'center', lineHeight: 16, marginBottom: 12 },
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

export default Messages;
