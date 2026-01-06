import React, { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, FlatList, ActivityIndicator, Modal, Pressable } from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { AuthContext } from '../../contexts/AuthContext';
import { Ionicons } from '@expo/vector-icons';
import { collection, query, orderBy, onSnapshot, addDoc, doc, setDoc, serverTimestamp, limit, getDocs, deleteDoc, getDoc } from 'firebase/firestore';
import { db } from '../../utils/firebaseConfig';
import { withNetworkErrorHandling, getNetworkErrorMessage } from '../../utils/networkErrorHandler';

export default function Conversation() {
  const route = useRoute();
  const navigation = useNavigation();
  const { user } = useContext(AuthContext);
  const { parentId, parentIdNumber, parentName, studentId, studentIdNumber, studentName } = route.params || {};

  const [messages, setMessages] = useState([]);
  const [sending, setSending] = useState(false);
  const [input, setInput] = useState('');
  const messagesRef = useRef(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [feedbackVisible, setFeedbackVisible] = useState(false);
  const [feedbackText, setFeedbackText] = useState('');
  const [feedbackSuccess, setFeedbackSuccess] = useState(false);
  const [networkErrorVisible, setNetworkErrorVisible] = useState(false);
  const [networkErrorTitle, setNetworkErrorTitle] = useState('');
  const [networkErrorMessage, setNetworkErrorMessage] = useState('');
  const [networkErrorColor, setNetworkErrorColor] = useState('#DC2626');
  const [linkedOnText, setLinkedOnText] = useState('');
  const [selectedMessageId, setSelectedMessageId] = useState(null);
  const [pendingMessage, setPendingMessage] = useState(null);

  const isStudentConversation = !!(studentId || studentIdNumber);
  const displayName = isStudentConversation ? (studentName || 'Student') : (parentName || 'Parent');

  const conversationId = useMemo(() => {
    const currentKey = user?.studentId || user?.uid;
    if (!currentKey) return null;
    
    if (isStudentConversation) {
      // Student-to-student conversation: use sorted keys for consistency
      const otherKey = studentIdNumber || studentId;
      if (!otherKey) return null;
      const keys = [currentKey, otherKey].sort();
      return `${keys[0]}-${keys[1]}`;
    } else {
      // Student-to-parent conversation
      const pid = parentIdNumber || parentId;
      if (!pid) return null;
      return `${currentKey}-${pid}`;
    }
  }, [user?.uid, user?.studentId, parentId, parentIdNumber, studentId, studentIdNumber, isStudentConversation]);

  useEffect(() => {
    if (!conversationId) { setMessages([]); return; }
    const msgsRef = query(collection(db, 'conversations', conversationId, 'messages'), orderBy('createdAt', 'desc'), limit(50));
    const unsub = onSnapshot(
      msgsRef, 
      async (snap) => {
        const items = snap.docs.map(d => ({ id: d.id, ...d.data(), _ref: d.ref }));
        setMessages(items);
        // Delivery/Seen acknowledgements: mark other user's messages as delivered/seen
        const updates = [];
        for (const m of items) {
          if (!m?.senderId || !user?.uid) continue;
          if (m.senderId === user.uid) continue;
          const status = m.status || 'sent';
          if (status !== 'seen') {
            updates.push(setDoc(m._ref, { status: 'seen', seenAt: serverTimestamp(), deliveredAt: m.deliveredAt || serverTimestamp() }, { merge: true }));
          }
        }
        if (updates.length) {
          try { await Promise.all(updates); } catch {}
        }
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

  useEffect(() => {
    const loadLinkedDate = async () => {
      if (!conversationId) { setLinkedOnText(''); return; }
      try {
        const convRef = doc(db, 'conversations', conversationId);
        const convSnap = await getDoc(convRef);
        const data = convSnap.exists() ? convSnap.data() : null;
        const ts = data?.linkedAt || data?.updatedAt || null;
        if (ts && typeof ts.toDate === 'function') {
          const d = ts.toDate();
          const txt = d.toLocaleDateString();
          setLinkedOnText(txt);
        } else {
          setLinkedOnText('');
        }
      } catch (e) {
        console.error('Error loading linked date:', e);
        // Only show network error modal for actual network errors
        if (e?.code?.includes('unavailable') || e?.code?.includes('network') || e?.message?.toLowerCase().includes('network')) {
          const errorInfo = getNetworkErrorMessage({ type: 'unstable_connection', message: e.message });
          setNetworkErrorTitle(errorInfo.title);
          setNetworkErrorMessage(errorInfo.message);
          setNetworkErrorColor(errorInfo.color);
          setNetworkErrorVisible(true);
          setTimeout(() => setNetworkErrorVisible(false), 5000);
        }
        setLinkedOnText('');
      }
    };
    loadLinkedDate();
  }, [conversationId]);

  useEffect(() => {
    if (feedbackVisible) {
      const t = setTimeout(() => setFeedbackVisible(false), 1500);
      return () => clearTimeout(t);
    }
  }, [feedbackVisible]);

  const ensureConversation = async () => {
    if (!conversationId) return;
    try {
      const convRef = doc(db, 'conversations', conversationId);
      
      if (isStudentConversation) {
        // Student-to-student conversation
        const otherStudentId = studentId;
        const otherStudentIdNumber = studentIdNumber;
        await setDoc(
          convRef,
          {
            id: conversationId,
            studentId1: user.uid,
            studentIdNumber1: user?.studentId || null,
            studentId2: otherStudentId,
            studentIdNumber2: otherStudentIdNumber || null,
            members: [user.uid, otherStudentId].filter(Boolean),
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
      } else {
        // Student-to-parent conversation
        await setDoc(
          convRef,
          {
            id: conversationId,
            parentId: parentId,
            parentIdNumber: parentIdNumber || null,
            studentId: user.uid,
            studentIdNumber: user?.studentId || null,
            members: [parentId, user.uid].filter(Boolean),
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
      }
    } catch (e) {
      console.error('Error ensuring conversation:', e);
      // Only show network error modal for actual network errors
      if (e?.code?.includes('unavailable') || e?.code?.includes('network') || e?.message?.toLowerCase().includes('network')) {
        const errorInfo = getNetworkErrorMessage({ type: 'unstable_connection', message: e.message });
        setNetworkErrorTitle(errorInfo.title);
        setNetworkErrorMessage(errorInfo.message);
        setNetworkErrorColor(errorInfo.color);
        setNetworkErrorVisible(true);
        setTimeout(() => setNetworkErrorVisible(false), 5000);
      }
    }
  };

  // Removed: sendChatAlertToCounterpart function - messages should not be saved as notifications in alerts collection
  // Messages are handled separately in the conversations collection and should not appear in alerts

  const sendMessage = async () => {
    const text = String(input || '').trim();
    if (!text || !conversationId || !user?.uid) return;
    try {
      setSending(true);
      // optimistic local pending message
      const tempId = `local-${Date.now()}`;
      const tempMsg = { id: tempId, senderId: user.uid, text, createdAt: new Date(), status: 'sending', _local: true };
      setPendingMessage(tempMsg);
      await ensureConversation();
      const msgsCol = collection(db, 'conversations', conversationId, 'messages');
      await addDoc(msgsCol, { senderId: user.uid, text, createdAt: serverTimestamp(), status: 'sent' });
      setInput('');
      // Removed: sendChatAlertToCounterpart call - messages should not be saved as notifications
      // clear pending on success after a short delay (snapshot will render real one)
      setTimeout(() => setPendingMessage(null), 500);
    } catch (e) {
      console.error('Error sending message:', e);
      // Only show network error modal for actual network errors
      if (e?.code?.includes('unavailable') || e?.code?.includes('network') || e?.message?.toLowerCase().includes('network')) {
        const errorInfo = getNetworkErrorMessage({ type: 'unstable_connection', message: e.message });
        setNetworkErrorTitle(errorInfo.title);
        setNetworkErrorMessage(errorInfo.message);
        setNetworkErrorColor(errorInfo.color);
        setNetworkErrorVisible(true);
        setTimeout(() => setNetworkErrorVisible(false), 5000);
      } else {
        // mark pending as error
        setPendingMessage((pm) => pm ? { ...pm, status: 'error' } : pm);
      }
    } finally { setSending(false); }
  };

  const getMessageDate = (m) => {
    const ts = m?.createdAt;
    if (!ts) return null;
    if (typeof ts.toDate === 'function') return ts.toDate();
    if (typeof ts === 'number') return new Date(ts);
    return null;
  };

  const formatTimeLabel = (d) => {
    if (!d) return '';
    const now = new Date();
    const isSameDay = d.toDateString() === now.toDateString();
    if (isSameDay) {
      return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    }
    return d.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  };

  const TEN_MIN_MS = 10 * 60 * 1000;

  const latestOwnMessageId = useMemo(() => {
    const first = messages.find(m => m.senderId === user?.uid);
    return first ? first.id : null;
  }, [messages, user?.uid]);

  const renderMessage = ({ item, index }) => {
    const mine = item.senderId === user?.uid;
    const currentDate = getMessageDate(item);
    const prev = messages[index + 1]; // messages are in desc order
    const prevDate = prev ? getMessageDate(prev) : null;
    const now = new Date();
    const gapFromPrev = currentDate && prevDate ? (currentDate - prevDate) : null;
    const gapFromNow = currentDate ? (now - currentDate) : null;
    const showSeparator = (gapFromPrev !== null && gapFromPrev > TEN_MIN_MS) || (index === 0 && gapFromNow !== null && gapFromNow > TEN_MIN_MS);
    return (
      <View>
        {showSeparator && (
          <View style={styles.timeSeparatorWrap}>
            <Text style={styles.timeSeparatorText}>{formatTimeLabel(currentDate)}</Text>
          </View>
        )}
        <TouchableOpacity activeOpacity={0.8} onPress={() => setSelectedMessageId((id) => id === item.id ? null : item.id)}>
          <View style={[styles.msgBubble, mine ? styles.msgMine : styles.msgTheirs]}>
          <Text style={[styles.msgText, mine ? styles.msgTextMine : styles.msgTextTheirs]}>{item.text}</Text>
          </View>
        </TouchableOpacity>
        {selectedMessageId === item.id && (
          <View style={[styles.metaRow, mine ? styles.metaRowMine : styles.metaRowTheirs]}>
            <Text style={[styles.metaText]}>
              {mine && item.id === latestOwnMessageId ? (item.status === 'error' ? 'Error' : (item.status === 'seen' ? 'Seen' : (item.status === 'delivered' ? 'Delivered' : (item.status === 'sending' ? 'Sending' : 'Sent')))) : ''}
              {mine && item.id === latestOwnMessageId ? ' • ' : ''}
              {formatTimeLabel(currentDate)}
            </Text>
          </View>
        )}
      </View>
    );
  };

  const toggleMenu = () => setMenuOpen((v) => !v);

  const onRequestDelete = () => {
    if (!conversationId || messages.length === 0) {
      setMenuOpen(false);
      setFeedbackText('No conversation to delete.');
      setFeedbackSuccess(false);
      setFeedbackVisible(true);
      return;
    }
    setMenuOpen(false);
    setConfirmVisible(true);
  };

  const performDelete = async () => {
    if (!conversationId) return;
    try {
      setDeleting(true);
      // Delete all messages under the conversation
      const msgsCol = collection(db, 'conversations', conversationId, 'messages');
      const snap = await getDocs(msgsCol);
      const deletions = snap.docs.map((d) => deleteDoc(d.ref));
      await Promise.all(deletions);
      // Delete the conversation doc itself
      await deleteDoc(doc(db, 'conversations', conversationId));
      setFeedbackText('Conversation deleted successfully.');
      setFeedbackSuccess(true);
    } catch (e) {
      console.error('Error deleting conversation:', e);
      // Only show network error modal for actual network errors
      if (e?.code?.includes('unavailable') || e?.code?.includes('network') || e?.message?.toLowerCase().includes('network')) {
        const errorInfo = getNetworkErrorMessage({ type: 'unstable_connection', message: e.message });
        setNetworkErrorTitle(errorInfo.title);
        setNetworkErrorMessage(errorInfo.message);
        setNetworkErrorColor(errorInfo.color);
        setNetworkErrorVisible(true);
        setTimeout(() => setNetworkErrorVisible(false), 5000);
      } else {
        setFeedbackText('Failed to delete conversation. Please try again.');
        setFeedbackSuccess(false);
      }
    } finally {
      // Close confirm modal immediately after showing feedback
      setConfirmVisible(false);
      setFeedbackVisible(true);
      setDeleting(false);
      setMenuOpen(false);
      // Reset local state; snapshot will also update
      setMessages([]);
    }
  };

  return (
    <View style={styles.wrapper}>
      {menuOpen && (
        <>
          <Pressable style={styles.menuBackdrop} onPress={() => setMenuOpen(false)} />
          <View style={styles.sideMenu}>
            <TouchableOpacity style={styles.menuItem} onPress={onRequestDelete}>
              <Ionicons name="trash" size={18} color="#991B1B" style={{ marginRight: 8 }} />
              <Text style={styles.menuItemText}>Delete Conversation</Text>
            </TouchableOpacity>
          </View>
        </>
      )}
      {messages.length === 0 ? (
        <View style={styles.emptyContainer}>
          <View style={styles.emptyAvatar}>
            <Text style={styles.emptyInitial}>{String(displayName.trim()).split(' ')[0]?.[0]?.toUpperCase() || '?'}</Text>
          </View>
          <View style={{ marginTop: 10 }}>
            <Text style={styles.emptyName}>{String(displayName.trim())}</Text>
            <Text style={styles.emptyTip}>Say hello and start the conversation.</Text>
          </View>
        </View>
      ) : (
        <FlatList
          ref={messagesRef}
          data={pendingMessage ? [pendingMessage, ...messages] : messages}
          inverted
          keyExtractor={(it) => it.id}
          contentContainerStyle={{ padding: 12, paddingBottom: 12 }}
          ListFooterComponent={<View style={{ height: 120 }} />}
          keyboardShouldPersistTaps="handled"
          renderItem={renderMessage}
        />
      )}
      <View style={styles.inputRow}>
        <TextInput 
          style={styles.input} 
          value={input} 
          onChangeText={setInput} 
          placeholder="Type a message" 
          placeholderTextColor="#9CA3AF" 
          multiline 
          color="#111827"
        />
        <TouchableOpacity style={[styles.sendBtn, (!input.trim() || sending) && styles.sendBtnDisabled]} onPress={sendMessage} disabled={!input.trim() || sending}>
          {sending ? <ActivityIndicator color="#fff" /> : <Ionicons name="send" size={18} color="#fff" />}
        </TouchableOpacity>
      </View>

      <Modal transparent visible={confirmVisible} animationType="fade" onRequestClose={() => !deleting && setConfirmVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalIconWrap}>
              <Ionicons name="trash-outline" size={28} color="#b91c1c" />
            </View>
            <Text style={styles.modalTitle}>Delete Conversation</Text>
            <Text style={styles.modalText}>This will permanently delete all messages in this conversation.</Text>
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalButton, deleting && styles.disabledButton]}
                onPress={() => !deleting && setConfirmVisible(false)}
                disabled={deleting}
              >
                <Text style={[styles.modalButtonText, deleting && styles.disabledText]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonDanger, deleting && styles.disabledButton]}
                onPress={performDelete}
                disabled={deleting}
              >
                <Text style={[styles.modalButtonText, styles.modalButtonDangerText, deleting && styles.disabledText]}>
                  {deleting ? 'Deleting...' : 'Delete'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal transparent visible={feedbackVisible} animationType="fade" onRequestClose={() => setFeedbackVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={[styles.modalIconWrap, { backgroundColor: feedbackSuccess ? '#DCFCE7' : '#FEE2E2' }]}>
              <Ionicons name={feedbackSuccess ? 'checkmark-circle-outline' : 'alert-circle-outline'} size={28} color={feedbackSuccess ? '#16A34A' : '#b91c1c'} />
            </View>
            <Text style={styles.modalTitle}>{feedbackSuccess ? 'Success' : 'Error'}</Text>
            <Text style={styles.modalText}>{feedbackText}</Text>
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
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { flex: 1, backgroundColor: '#F9FAFB' },
  menuBackdrop: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, zIndex: 20 },
  sideMenu: { position: 'absolute', top: 100, right: 12, width: 220, backgroundColor: '#FFFFFF', borderRadius: 8, paddingVertical: 8, shadowColor: '#000', shadowOpacity: 0.12, shadowOffset: { width: 0, height: 4 }, shadowRadius: 10, elevation: 8, zIndex: 21 },
  menuItem: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 12 },
  menuItemText: { color: '#111827', fontSize: 14 },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', padding: 10, backgroundColor: '#FFFFFF', borderTopWidth: 1, borderTopColor: '#E5E7EB' },
  input: { flex: 1, minHeight: 40, maxHeight: 120, borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: '#F9FAFB', color: '#111827' },
  sendBtn: { marginLeft: 8, backgroundColor: '#2563EB', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 8 },
  sendBtnDisabled: { opacity: 0.6 },
  msgBubble: { maxWidth: '78%', marginVertical: 4, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
  msgMine: { backgroundColor: '#2563EB', alignSelf: 'flex-end', borderBottomRightRadius: 4 },
  msgTheirs: { backgroundColor: '#E5E7EB', alignSelf: 'flex-start', borderBottomLeftRadius: 4 },
  msgText: { fontSize: 14 },
  msgTextMine: { color: '#fff' },
  msgTextTheirs: { color: '#111827' },
  timeSeparatorWrap: { alignSelf: 'center', backgroundColor: '#E5E7EB', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, marginVertical: 8 },
  timeSeparatorText: { fontSize: 12, color: '#374151' },
  emptyContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 100 },
  emptyAvatar: { width: 90, height: 90, borderRadius: 45, backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#DBEAFE' },
  emptyInitial: { fontSize: 34, fontWeight: '700', color: '#2563EB' },
  emptyLabel: { color: '#6B7280', fontWeight: '600' },
  emptyLine: { fontSize: 14, color: '#111827', textAlign: 'center', marginTop: 2 },
  emptyName: { fontSize: 18, fontWeight: '700', color: '#111827', textAlign: 'center' },
  emptyTip: { fontSize: 13, color: '#6B7280', marginTop: 6, textAlign: 'center' },
  // Modal (same UI as Parent conversation)
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  modalCard: { backgroundColor: '#fff', borderRadius: 8, padding: 24, width: '85%', maxWidth: 400, alignItems: 'center' },
  modalIconWrap: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  modalTitle: { fontSize: 20, fontWeight: '700', color: '#111827' },
  modalText: { fontSize: 16, color: '#6B7280', textAlign: 'center', marginBottom: 24 },
  modalActions: { flexDirection: 'row', gap: 12 },
  modalButton: { flex: 1, paddingVertical: 12, paddingHorizontal: 16, borderRadius: 8, alignItems: 'center' },
  modalButtonText: { fontSize: 16, fontWeight: '600', color: '#6B7280' },
  modalButtonDanger: { backgroundColor: '#FEE2E2' },
  modalButtonDangerText: { color: '#b91c1c', fontWeight: '700' },
  disabledButton: { opacity: 0.6 },
  disabledText: { opacity: 0.6 },
  toastCard: { width: '70%', backgroundColor: '#FFFFFF', borderRadius: 8, padding: 16, alignItems: 'center' },
  metaRow: { marginTop: 4, marginBottom: 2, paddingHorizontal: 8 },
  metaRowMine: { alignSelf: 'flex-end' },
  metaRowTheirs: { alignSelf: 'flex-start' },
  metaText: { fontSize: 11, color: '#6B7280' },
  // Network Error Modal styles (matching Parent Alerts.js)
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
