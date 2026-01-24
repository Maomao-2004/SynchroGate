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
import AsyncStorage from '@react-native-async-storage/async-storage';
import { NetworkContext } from '../../contexts/NetworkContext';
import { cacheMessages, getCachedMessages, cacheLinkedStudents, getCachedLinkedStudents } from '../../offline/storage';
import OfflineBanner from '../../components/OfflineBanner';
import NetInfo from '@react-native-community/netinfo';
import { wp, hp, RFValue, isSmallDevice, isTablet } from '../../utils/responsive';

const { width } = Dimensions.get('window');

function Messages() {
  const navigation = useNavigation();
  const { user, logout } = useContext(AuthContext);
  const networkContext = useContext(NetworkContext);
  const isConnected = networkContext?.isConnected ?? true;
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
  const [showOfflineBanner, setShowOfflineBanner] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [errorModalVisible, setErrorModalVisible] = useState(false);
  const [errorModalMessage, setErrorModalMessage] = useState('');
  // Network error modals removed - following same pattern as Student Messages.js
  // Local notification dedupe removed; notifications now handled globally

  const storageKey = useMemo(() => (user?.uid ? `parentManualRead_${user.uid}` : null), [user?.uid]);

  useEffect(() => { readReceiptsRef.current = readReceipts; }, [readReceipts]);
  useEffect(() => { lastMessagesRef.current = lastMessages; }, [lastMessages]);
  useEffect(() => { manuallyReadRef.current = manuallyRead; }, [manuallyRead]);

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

    // Try to load cached data first (works offline) - following same pattern as Student Messages.js
    const loadCachedData = async () => {
      try {
        // Load cached lastMessages
        const cachedMessages = await getCachedMessages(user.uid);
        if (cachedMessages && typeof cachedMessages === 'object') {
          setLastMessages(cachedMessages);
          console.log('✅ Last messages loaded from cache');
        }
      } catch (error) {
        console.log('Error loading cached last messages:', error);
      }

      // If offline, load cached linked students and return early (skip Firestore listeners)
      if (!isConnected) {
        try {
          const cachedLinkedStudents = await getCachedLinkedStudents(user.uid);
          if (cachedLinkedStudents && Array.isArray(cachedLinkedStudents)) {
            setLinkedStudents(cachedLinkedStudents);
            setLoadingLinks(false);
            console.log('✅ Linked students loaded from cache (offline mode)');
            return true; // Indicate cached data was loaded
          }
        } catch (error) {
          console.log('Error loading cached linked students:', error);
        }
        // If no cached linked students but offline, still show empty list
        setLoadingLinks(false);
        return true;
      }
      return false; // Indicate we need to fetch from Firestore
    };

    // Load cached data first, then conditionally set up listeners
    (async () => {
      const cachedLoaded = await loadCachedData();
      // If cached data was loaded and we're offline, show cached data but don't set up Firestore listeners
      if (cachedLoaded && !isConnected) {
        // Ensure we have cached lastMessages loaded for display
        try {
          const cachedLastMessages = await getCachedMessages(user.uid);
          if (cachedLastMessages && typeof cachedLastMessages === 'object') {
            // Ensure timestamp values are properly formatted
            const processedLastMessages = {};
            Object.keys(cachedLastMessages).forEach(linkId => {
              const msg = cachedLastMessages[linkId];
              if (msg && typeof msg === 'object') {
                processedLastMessages[linkId] = {
                  ...msg,
                  createdAtMs: typeof msg.createdAtMs === 'number' ? msg.createdAtMs : 
                               (msg.createdAt?.toMillis ? msg.createdAt.toMillis() : 
                                (typeof msg.createdAt === 'number' ? msg.createdAt : null)),
                };
              }
            });
            setLastMessages(processedLastMessages);
            console.log('✅ Last messages loaded from cache for offline viewing');
          }
        } catch (error) {
          console.log('Error loading cached last messages:', error);
        }
        return;
      }

      // Only set up Firestore listeners if online
      if (!isConnected) {
        // Try one more time to load cached lastMessages
        try {
          const cachedLastMessages = await getCachedMessages(user.uid);
          if (cachedLastMessages && typeof cachedLastMessages === 'object') {
            // Ensure timestamp values are properly formatted
            const processedLastMessages = {};
            Object.keys(cachedLastMessages).forEach(linkId => {
              const msg = cachedLastMessages[linkId];
              if (msg && typeof msg === 'object') {
                processedLastMessages[linkId] = {
                  ...msg,
                  createdAtMs: typeof msg.createdAtMs === 'number' ? msg.createdAtMs : 
                               (msg.createdAt?.toMillis ? msg.createdAt.toMillis() : 
                                (typeof msg.createdAt === 'number' ? msg.createdAt : null)),
                };
              }
            });
            setLastMessages(processedLastMessages);
            console.log('✅ Last messages loaded from cache for offline viewing');
          }
        } catch (error) {
          console.log('Error loading cached last messages:', error);
        }
        return;
      }

      const canonicalId = String(user?.parentId || '').trim();
      const qUid = query(
        collection(db, 'parent_student_links'),
        where('parentId', '==', user.uid),
        where('status', '==', 'active'),
      );
      const mergeStudents = async (docs) => {
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

      // Cache linked students for offline access
      try {
        cacheLinkedStudents(user.uid, nextStudents);
      } catch (error) {
        console.log('Error caching linked students:', error);
      }

      // Reset listeners for deduped set
      try { Object.values(convUnsubsRef.current || {}).forEach((fn) => { try { fn(); } catch {} }); } catch {}
      try { Object.values(readUnsubsRef.current || {}).forEach((fn) => { try { fn(); } catch {} }); } catch {}
      convUnsubsRef.current = {};
      readUnsubsRef.current = {};
      // Don't reset lastMessages and readReceipts - preserve them for offline mode

      // Try to load cached lastMessages (works offline)
      // This ensures cached messages are available even when offline
      try {
        const cachedData = await getCachedMessages(user.uid);
        if (cachedData && typeof cachedData === 'object') {
          // Ensure timestamp values are properly formatted
          const processedLastMessages = {};
          Object.keys(cachedData).forEach(linkId => {
            const msg = cachedData[linkId];
            if (msg && typeof msg === 'object') {
              processedLastMessages[linkId] = {
                ...msg,
                // Ensure createdAtMs is a number
                createdAtMs: typeof msg.createdAtMs === 'number' ? msg.createdAtMs : 
                             (msg.createdAt?.toMillis ? msg.createdAt.toMillis() : 
                              (typeof msg.createdAt === 'number' ? msg.createdAt : null)),
              };
            }
          });
          setLastMessages(processedLastMessages);
          console.log('✅ Last messages loaded from cache in mergeStudents');
          // If offline, use cached data and return early (don't set up listeners)
          if (!isConnected) {
            console.log('📴 Offline mode - using cached last messages');
            return;
          }
        }
      } catch (error) {
        console.log('Error loading cached last messages in mergeStudents:', error);
      }

      // Attach last-message and read-receipt listeners per student (only if online)
      if (!isConnected) return;
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
              setLastMessages((prev) => {
                const updated = { ...prev, [s.linkId]: { text: last, senderId, createdAtMs } };
                // Cache the updated lastMessages
                try {
                  cacheMessages(user.uid, updated);
                } catch {}
                return updated;
              });

              // If a newer incoming message arrives, clear manual-read so the thread shows as unread
              try {
                if (createdAtMs && senderId && senderId !== user?.uid) {
                  const lastReadAtMs = readReceiptsRef.current?.[s.linkId]?.lastReadAtMs || 0;
                  const wasManuallyRead = !!manuallyReadRef.current?.[s.linkId];
                  const prevLastMsg = lastMessagesRef.current?.[s.linkId];
                  const prevLastMsgTime = prevLastMsg?.createdAtMs || 0;
                  // Clear manual read if: message is from someone else AND (newer than last read OR newer than previous last message)
                  if (createdAtMs > lastReadAtMs || (createdAtMs > prevLastMsgTime && wasManuallyRead)) {
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
            }
          );
          readUnsubsRef.current[s.linkId] = offRead;
        } catch {}
      }
    };

      setLoadingLinks(true);
      const unsubUid = onSnapshot(
        qUid, 
        (snap) => { try { mergeStudents(snap.docs); setLoadingLinks(false); } catch { setLoadingLinks(false); } }
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
          (snap) => { try { mergeStudents(snap.docs); } catch {} }
        );
      }
      return () => {
        try { unsubUid && unsubUid(); } catch {}
        try { unsubCanonical && unsubCanonical(); } catch {}
        try { Object.values(convUnsubsRef.current || {}).forEach((fn) => { try { fn(); } catch {} }); } catch {}
        try { Object.values(readUnsubsRef.current || {}).forEach((fn) => { try { fn(); } catch {} }); } catch {}
        convUnsubsRef.current = {};
        readUnsubsRef.current = {};
      };
    })(); // End async IIFE
  }, [user?.uid, user?.parentId, isConnected]);

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
    // Only set up listener if online
    if (!isConnected) {
      setMessages([]);
      return;
    }
    const unsub = onSnapshot(
      msgsRef, 
      (snap) => {
        const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        setMessages(items);
      }
    );
    return () => { try { unsub(); } catch {} };
  }, [conversationId, isConnected]);

  const showErrorModal = (message) => {
    setErrorModalMessage(message);
    setErrorModalVisible(true);
    setTimeout(() => setErrorModalVisible(false), 3000);
  };

  const ensureConversation = async () => {
    if (!conversationId) return;
    
    // Check internet connection before proceeding
    if (!isConnected) {
      showErrorModal('No internet connection. Please check your network and try again.');
      throw new Error('No internet connection');
    }
    
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
      throw error;
    }
  };

  const sendMessage = async () => {
    const text = String(input || '').trim();
    if (!text || !conversationId || !user?.uid) return;
    
    // Check internet connection before proceeding
    if (!isConnected) {
      showErrorModal('No internet connection. Please check your network and try again.');
      return;
    }
    
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
                You haven't linked any students to your account yet. Once you link your children to your account, you'll be able to send, receive messages and stay updated on important information.
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
                    const lastReadAtMs = rr?.lastReadAtMs || 0;
                    const lastMsgTime = lm?.createdAtMs || 0;
                    // Thread is read if: manually marked as read AND (no new messages OR last message is from user)
                    const isRead = manuallyRead[item.linkId] && (lastMsgTime <= lastReadAtMs || lm?.senderId === user?.uid) || (lm?.senderId && lm.senderId === user?.uid);
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
                      const lastReadAtMs = rr?.lastReadAtMs || 0;
                      const lastMsgTime = lm?.createdAtMs || 0;
                      // Thread is read if: manually marked as read AND (no new messages OR last message is from user)
                      const isRead = manuallyRead[item.linkId] && (lastMsgTime <= lastReadAtMs || lm?.senderId === user?.uid) || (lm?.senderId && lm.senderId === user?.uid);
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
  threadRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: hp(1.5), paddingHorizontal: wp(3), borderBottomWidth: 1, borderBottomColor: '#D1D5DB' },
  threadRowRead: { backgroundColor: '#F3F4F6', borderRadius: wp(2.5), paddingHorizontal: wp(2) },
  threadRowPressed: { backgroundColor: '#F3F4F6', borderRadius: wp(2.5), paddingHorizontal: wp(2) },
  avatar: { width: wp(11), height: wp(11), borderRadius: wp(5.5), backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center', marginRight: wp(3), borderWidth: 1, borderColor: '#DBEAFE' },
  avatarText: { color: '#2563EB', fontWeight: '800', fontSize: RFValue(isSmallDevice() ? 14 : 16) },
  threadName: { fontSize: RFValue(16), fontWeight: '700', color: '#111827' },
  threadSub: { fontSize: RFValue(12), color: '#6B7280', marginTop: hp(0.25) },
  threadSubLast: { fontSize: RFValue(12), color: '#2563EB', marginTop: hp(0.25), fontWeight: '700' },
  threadSubRead: { fontSize: RFValue(12), color: '#6B7280', marginTop: hp(0.25), fontWeight: '400' },
  separator: { height: 2, backgroundColor: '#D1D5DB' },
  centerFill: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { color: '#6B7280' },
  // Section/card styles to match Dashboard Quick Overview positioning
  section: { marginBottom: 8, marginTop: 12 },
  sectionTightBelow: { marginBottom: 6 },
  blockCard: {
    backgroundColor: '#fff',
    borderRadius: wp(3),
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: wp(3),
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: hp(0.25) },
    shadowRadius: wp(1),
    marginTop: 0,
  },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: hp(2) },
  sectionTitle: { fontSize: RFValue(isSmallDevice() ? 24 : 30), fontWeight: '700', color: '#111827', marginRight: wp(2), marginBottom: hp(0.6), marginTop: hp(1.2) },
  infoRow: { flexDirection: 'row', alignItems: 'center' },
  infoIconWrap: { width: wp(10), height: wp(10), borderRadius: wp(5), backgroundColor: '#F0F9FF', alignItems: 'center', justifyContent: 'center', marginRight: wp(3) },
  infoTitle: { fontSize: RFValue(14), fontWeight: '700', color: '#111827', marginBottom: hp(0.5) },
  infoSub: { fontSize: RFValue(13), color: '#6B7280' },
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
  contentContainer: { padding: 16, paddingBottom: 120, paddingTop: 50, flexGrow: 1 },
  centerContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  loadingContainer: { alignItems: 'center', justifyContent: 'center', paddingVertical: hp(5) },
  loadingText: { marginTop: hp(1.5), color: '#6B7280', fontSize: RFValue(16) },
  emptyCard: { backgroundColor: '#fff', borderRadius: 8, padding: 16, alignItems: 'center', borderWidth: 1, borderColor: '#E5E7EB', shadowColor: '#0F172A', shadowOpacity: 0.08, shadowOffset: { width: 0, height: 6 }, shadowRadius: 12, elevation: 4, width: '100%' },
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
    width: isSmallDevice() ? '90%' : '85%',
    maxWidth: isTablet() ? wp(60) : 400,
    backgroundColor: '#FFFFFF',
    borderRadius: wp(2),
    padding: wp(5),
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowOffset: { width: 0, height: hp(0.25) },
    shadowRadius: wp(2),
    elevation: 5,
    minHeight: hp(15),
    justifyContent: 'space-between',
  },
  fbModalContent: {
    flex: 1,
  },
  fbModalTitle: {
    fontSize: RFValue(20),
    fontWeight: '600',
    color: '#050505',
    marginBottom: hp(1),
  },
  fbModalMessage: {
    fontSize: RFValue(15),
    color: '#65676B',
    textAlign: 'left',
    lineHeight: RFValue(20),
  },
});

export default Messages;