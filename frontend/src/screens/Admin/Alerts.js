import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Animated, Dimensions, Modal, Image } from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { AuthContext } from '../../contexts/AuthContext';
import sidebarEventEmitter from '../../utils/sidebarEventEmitter';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { doc, getDoc, setDoc, updateDoc, onSnapshot } from 'firebase/firestore';
import { db } from '../../utils/firebaseConfig';
import { withNetworkErrorHandling, getNetworkErrorMessage } from '../../utils/networkErrorHandler';
import * as Notifications from 'expo-notifications';
const AboutLogo = require('../../assets/logo.png');

const { width } = Dimensions.get('window');

export default function AdminAlerts() {
  const navigation = useNavigation();
  const { logout } = React.useContext(AuthContext);
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [deleteConfirmVisible, setDeleteConfirmVisible] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [feedbackVisible, setFeedbackVisible] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState('');
  const [feedbackSuccess, setFeedbackSuccess] = useState(true);
  const [logoutVisible, setLogoutVisible] = useState(false);
  const [markingAsRead, setMarkingAsRead] = useState(false);
  const [networkErrorVisible, setNetworkErrorVisible] = useState(false);
  const [networkErrorTitle, setNetworkErrorTitle] = useState('');
  const [networkErrorMessage, setNetworkErrorMessage] = useState('');
  const [networkErrorColor, setNetworkErrorColor] = useState('#DC2626');
  const sidebarAnimRight = useState(new Animated.Value(-width * 0.6))[0];

  // Determine active sidebar item based on current route
  const getActiveSidebarItem = (routeName) => {
    const state = navigation.getState();
    const currentRoute = state.routes[state.index]?.name;
    const currentScreen = state.routes[state.index]?.state?.routes?.[state.routes[state.index]?.state?.index]?.name;
    
    // Check both tab route and screen route
    if (currentRoute === routeName || currentScreen === routeName) {
      return true;
    }
    
    // Special cases for nested navigation
    if (routeName === 'Home' && (currentScreen === 'AdminDashboard' || currentRoute === 'Home')) {
      return true;
    }
    
    return false;
  };

  const toggleSidebar = (open) => {
    Animated.timing(sidebarAnimRight, { toValue: open ? 0 : -width * 0.6, duration: 300, useNativeDriver: false }).start();
    setSidebarOpen(open);
  };

  const loadAlerts = async () => {
    try {
      setLoading(true);
      const ref = doc(db, 'admin_alerts', 'inbox');
      const snap = await getDoc(ref);
      const items = snap.exists() ? (Array.isArray(snap.data()?.items) ? snap.data().items : []) : [];
      setAlerts(items.map(it => ({
        id: it.id,
        type: it.type || 'general',
        title: it.title || 'Alert',
        message: it.message || '',
        createdAt: it.createdAt || new Date().toISOString(),
        status: it.status || 'unread',
        studentId: it.studentId,
        studentName: it.studentName,
        yearLevel: it.yearLevel,
      })).sort((a,b)=> new Date(b.createdAt) - new Date(a.createdAt)));
    } catch (e) {
      console.error('Error loading alerts:', e);
      // Only show network error modal for actual network errors
      if (e?.code?.includes('unavailable') || e?.code?.includes('network') || e?.message?.toLowerCase().includes('network')) {
        const errorInfo = getNetworkErrorMessage({ type: 'unstable_connection', message: e.message });
        setNetworkErrorTitle(errorInfo.title);
        setNetworkErrorMessage(errorInfo.message);
        setNetworkErrorColor(errorInfo.color);
        setNetworkErrorVisible(true);
        setTimeout(() => setNetworkErrorVisible(false), 5000);
      }
    } finally { setLoading(false); }
  };

  useEffect(() => { loadAlerts(); }, []);
  // Safety: ensure loading doesn't hang
  useEffect(() => {
    const timer = setTimeout(() => setLoading(false), 4000);
    return () => clearTimeout(timer);
  }, []);

  // Refresh data when screen comes into focus
  useFocusEffect(
    React.useCallback(() => {
      loadAlerts();
    }, [])
  );
  useEffect(() => {
    const ref = doc(db, 'admin_alerts', 'inbox');
    const unsub = onSnapshot(ref, async (snap) => {
      const items = snap.exists() ? (Array.isArray(snap.data()?.items) ? snap.data().items : []) : [];
      const mapped = items.map(it => ({ id: it.id, type: it.type || 'general', title: it.title || 'Alert', message: it.message || '', createdAt: it.createdAt || new Date().toISOString(), status: it.status || 'unread', studentId: it.studentId, studentName: it.studentName, yearLevel: it.yearLevel })).sort((a,b)=> new Date(b.createdAt) - new Date(a.createdAt));
      setAlerts(mapped);
      setLoading(false);
    }, (error) => {
      console.error('Error in admin alerts snapshot:', error);
      const errorInfo = getNetworkErrorMessage(error);
      if (error?.code?.includes('unavailable') || error?.code?.includes('deadline-exceeded') || error?.message?.toLowerCase().includes('network') || error?.message?.toLowerCase().includes('connection')) {
        setNetworkErrorTitle(errorInfo.title);
        setNetworkErrorMessage(errorInfo.message);
        setNetworkErrorColor(errorInfo.color);
        setNetworkErrorVisible(true);
        setTimeout(() => setNetworkErrorVisible(false), 5000);
      }
      setLoading(false);
    });
    return () => { try { unsub(); } catch {} };
  }, []);

  const onTapAlert = async (alert) => {
    try {
      // Mark read in admin_alerts
      const ref = doc(db, 'admin_alerts', 'inbox');
      const snap = await getDoc(ref);
      if (snap.exists()) {
        const items = Array.isArray(snap.data()?.items) ? snap.data().items : [];
        const updated = items.map(it => it.id === alert.id ? { ...it, status: 'read', readAt: new Date().toISOString() } : it);
        await setDoc(ref, { items: updated }, { merge: true });
      }
    } catch (e) {
      console.error('Error marking alert as read:', e);
      const errorInfo = getNetworkErrorMessage(e);
      if (e.type === 'no_internet' || e.type === 'timeout' || e.type === 'unstable_connection') {
        setNetworkErrorTitle(errorInfo.title);
        setNetworkErrorMessage(errorInfo.message);
        setNetworkErrorColor(errorInfo.color);
        setNetworkErrorVisible(true);
        setTimeout(() => setNetworkErrorVisible(false), 5000);
      }
    }
  };

  const markAllAsRead = async () => {
    try {
      setMarkingAsRead(true);
      const ref = doc(db, 'admin_alerts', 'inbox');
      const snap = await getDoc(ref);
      if (snap.exists()) {
        const items = Array.isArray(snap.data()?.items) ? snap.data().items : [];
        const updated = items.map(it => ({ ...it, status: 'read', readAt: new Date().toISOString() }));
        await setDoc(ref, { items: updated }, { merge: true });
      }
    } catch (error) {
      console.error('Error marking all as read:', error);
      // Only show network error modal for actual network errors
      if (error?.code?.includes('unavailable') || error?.code?.includes('network') || error?.message?.toLowerCase().includes('network')) {
        const errorInfo = getNetworkErrorMessage({ type: 'unstable_connection', message: error.message });
        setNetworkErrorTitle(errorInfo.title);
        setNetworkErrorMessage(errorInfo.message);
        setNetworkErrorColor(errorInfo.color);
        setNetworkErrorVisible(true);
        setTimeout(() => setNetworkErrorVisible(false), 5000);
      } else {
        // Avoid showing a blocking modal for mark-all-as-read; log instead
        console.warn('Failed to mark admin alerts as read:', error);
      }
    } finally {
      setMarkingAsRead(false);
    }
  };

  const changeFilter = (next) => {
    if (next === 'all' || next === 'unread' || next === 'read') setFilter(next);
  };

  useEffect(() => {
    const handleToggleSidebar = () => toggleSidebar(!sidebarOpen);
    sidebarEventEmitter.on('toggleSidebar', handleToggleSidebar);
    return () => sidebarEventEmitter.off('toggleSidebar', handleToggleSidebar);
  }, [sidebarOpen]);

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: '#FFFFFF' }} />
    );
  }

  return (<>
    <View style={styles.wrapper}>
      <Modal transparent visible={sidebarOpen} animationType="fade" onRequestClose={() => toggleSidebar(false)}>
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={() => toggleSidebar(false)} />
        <Animated.View style={[styles.sidebar, { right: sidebarAnimRight }]}>
          <Text style={styles.sidebarTitle}>Menu</Text>
          
          <TouchableOpacity
            style={[styles.sidebarItem, getActiveSidebarItem('AdminDashboard') && styles.activeSidebarItem]}
            onPress={() => {
              toggleSidebar(false);
              try {
                const parentNav = navigation.getParent?.();
                if (parentNav) {
                  parentNav.navigate('Home', { screen: 'AdminDashboard' });
                } else {
                  navigation.navigate('AdminDashboard');
                }
              } catch {
                navigation.navigate('AdminDashboard');
              }
            }}
          >
            <Ionicons name="home-outline" size={20} color={getActiveSidebarItem('AdminDashboard') ? "#2563EB" : "#111827"} />
            <Text style={[styles.sidebarText, getActiveSidebarItem('AdminDashboard') && styles.activeSidebarText]}>Dashboard</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.sidebarItem, getActiveSidebarItem('Events') && styles.activeSidebarItem]}
            onPress={() => {
              toggleSidebar(false);
              try {
                const parentNav = navigation.getParent?.();
                if (parentNav) {
                  parentNav.navigate('Home', { screen: 'Events' });
                } else {
                  navigation.navigate('Events');
                }
              } catch {
                console.log('Events navigation failed');
              }
            }}
          >
            <Ionicons name="calendar-outline" size={20} color={getActiveSidebarItem('Events') ? "#2563EB" : "#111827"} />
            <Text style={[styles.sidebarText, getActiveSidebarItem('Events') && styles.activeSidebarText]}>Events</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.sidebarItem, getActiveSidebarItem('StudentsTab') && styles.activeSidebarItem]}
            onPress={() => {
              toggleSidebar(false);
              try {
                const parentNav = navigation.getParent?.();
                if (parentNav) {
                  parentNav.navigate('StudentsTab');
                } else {
                  navigation.navigate('StudentsTab');
                }
              } catch {
                navigation.navigate('StudentsTab');
              }
            }}
          >
            <Ionicons name="school-outline" size={20} color={getActiveSidebarItem('StudentsTab') ? "#2563EB" : "#111827"} />
            <Text style={[styles.sidebarText, getActiveSidebarItem('StudentsTab') && styles.activeSidebarText]}>Manage Student</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.sidebarItem, getActiveSidebarItem('ParentsTab') && styles.activeSidebarItem]}
            onPress={() => {
              toggleSidebar(false);
              try {
                const parentNav = navigation.getParent?.();
                if (parentNav) {
                  parentNav.navigate('ParentsTab');
                } else {
                  navigation.navigate('ParentsTab');
                }
              } catch {
                navigation.navigate('ParentsTab');
              }
            }}
          >
            <Ionicons name="people-outline" size={20} color={getActiveSidebarItem('ParentsTab') ? "#2563EB" : "#111827"} />
            <Text style={[styles.sidebarText, getActiveSidebarItem('ParentsTab') && styles.activeSidebarText]}>Manage Parent</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.sidebarItem, getActiveSidebarItem('ActivityLogsTab') && styles.activeSidebarItem]}
            onPress={() => {
              toggleSidebar(false);
              try {
                const parentNav = navigation.getParent?.();
                if (parentNav) {
                  parentNav.navigate('ActivityLogsTab');
                } else {
                  navigation.navigate('ActivityLogsTab');
                }
              } catch {
                navigation.navigate('ActivityLogsTab');
              }
            }}
          >
            <Ionicons name="list-outline" size={20} color={getActiveSidebarItem('ActivityLogsTab') ? "#2563EB" : "#111827"} />
            <Text style={[styles.sidebarText, getActiveSidebarItem('ActivityLogsTab') && styles.activeSidebarText]}>Activity Logs</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.sidebarItem, getActiveSidebarItem('AlertsTab') && styles.activeSidebarItem]}
            onPress={() => {
              toggleSidebar(false);
              try {
                const parentNav = navigation.getParent?.();
                if (parentNav) {
                  parentNav.navigate('AlertsTab');
                } else {
                  navigation.navigate('AlertsTab');
                }
              } catch {
                navigation.navigate('AlertsTab');
              }
            }}
          >
            <Ionicons name="notifications-outline" size={20} color={getActiveSidebarItem('AlertsTab') ? "#2563EB" : "#111827"} />
            <Text style={[styles.sidebarText, getActiveSidebarItem('AlertsTab') && styles.activeSidebarText]}>Alerts</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.sidebarItem, getActiveSidebarItem('About') && styles.activeSidebarItem]}
            onPress={() => {
              toggleSidebar(false);
              try {
                const parentNav = navigation.getParent?.();
                if (parentNav) {
                  parentNav.navigate('Home', { screen: 'About' });
                } else {
                  navigation.navigate('About');
                }
              } catch {
                navigation.navigate('About');
              }
            }}
          >
            <Ionicons name="information-circle-outline" size={20} color={getActiveSidebarItem('About') ? "#2563EB" : "#111827"} />
            <Text style={[styles.sidebarText, getActiveSidebarItem('About') && styles.activeSidebarText]}>About</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.sidebarItem, styles.logoutItem]}
            onPress={() => {
              toggleSidebar(false);
              setLogoutVisible(true);
            }}
          >
            <Ionicons name="log-out-outline" size={20} color="#b91c1c" />
            <Text style={[styles.sidebarText, { color: '#b91c1c' }]}>Logout</Text>
          </TouchableOpacity>
        </Animated.View>
      </Modal>


      <ScrollView 
        contentContainerStyle={styles.contentContainer} 
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >

        {alerts.length > 0 ? (
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
            {alerts.filter(a => {
              if (filter === 'all') return true;
              if (filter === 'unread') return a.status === 'unread';
              if (filter === 'read') return a.status === 'read';
              return true;
            }).map((a) => {
              const typeColor = a.type === 'qr_request' ? '#10B981' : '#2563EB';
              const iconBg = a.type === 'qr_request' ? '#ECFDF5' : '#EFF6FF';
              const iconName = a.type === 'qr_request' ? 'link-variant' : 'information-circle-outline';
              const createdLabel = new Date(a.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
              return (
                <TouchableOpacity key={a.id} activeOpacity={0.8} onPress={() => onTapAlert(a)} style={styles.itemRow}>
                  <View style={[styles.itemAvatar, { backgroundColor: iconBg, borderColor: typeColor }]}>
                    <MaterialCommunityIcons name={iconName} size={14} color={typeColor} />
                  </View>
                  <View style={styles.itemBody}>
                    <Text style={[styles.itemTitle, a.status !== 'read' && styles.itemTitleUnread]} numberOfLines={1}>{a.title || (a.type === 'qr_request' ? 'QR Code Generation Request' : 'Alert')}</Text>
                    <Text style={[styles.itemMeta, a.status !== 'read' && styles.itemMetaUnread]} numberOfLines={2}>{a.message || `Request for ${a.studentName || a.studentId || 'Student'}`}</Text>
                  </View>
                  <Text style={[styles.itemTime, a.status !== 'read' && { color: '#2563EB' }]}>{createdLabel}</Text>
                </TouchableOpacity>
              );
            })}
          </>
        ) : (
          <View style={styles.centerContainer}>
            <View style={styles.emptyCard}>
              <View style={styles.emptyIconWrap}>
                <Ionicons name="notifications-off-outline" size={28} color="#2563EB" />
              </View>
              <Text style={styles.emptyTitle}>No Alerts</Text>
              <Text style={styles.emptySubtext}>
                No alerts are currently available. Alerts will appear here when students request QR code generation or when system notifications are sent to administrators.
              </Text>
            </View>
          </View>
        )}
      </ScrollView>
    </View>
    {/* Delete Confirm Modal (mirrored from Student Alerts) */}
    <Modal transparent animationType="fade" visible={deleteConfirmVisible} onRequestClose={() => setDeleteConfirmVisible(false)}>
      <View style={styles.modalOverlayCenter}>
        <View style={styles.fbModalCard}>
          <View style={styles.fbModalContent}>
            <Text style={styles.fbModalTitle}>Delete notifications?</Text>
            <Text style={styles.fbModalMessage}>
              Delete all admin alerts. This cannot be undone.
            </Text>
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
                { backgroundColor: '#8B0000' },
                isDeleting && styles.fbModalButtonDisabled
              ]} 
              onPress={async () => {
                if (isDeleting) return;
                setIsDeleting(true);
                try {
                  const ref = doc(db, 'admin_alerts', 'inbox');
                  await setDoc(ref, { items: [] }, { merge: true });
                  setFeedbackMessage('Notifications deleted');
                  setFeedbackSuccess(true);
                  setFeedbackVisible(true);
                  setDeleteConfirmVisible(false);
                  setTimeout(() => setFeedbackVisible(false), 3000);
                } catch (e) {
                  console.error('Error deleting alerts:', e);
                  // Only show network error modal for actual network errors
                  if (e?.code?.includes('unavailable') || e?.code?.includes('network') || e?.message?.toLowerCase().includes('network')) {
                    const errorInfo = getNetworkErrorMessage({ type: 'unstable_connection', message: e.message });
                    setNetworkErrorTitle(errorInfo.title);
                    setNetworkErrorMessage(errorInfo.message);
                    setNetworkErrorColor(errorInfo.color);
                    setNetworkErrorVisible(true);
                    setTimeout(() => setNetworkErrorVisible(false), 5000);
                  } else {
                    setFeedbackMessage('Failed to delete notifications');
                    setFeedbackSuccess(false);
                    setFeedbackVisible(true);
                    setDeleteConfirmVisible(false);
                    setTimeout(() => setFeedbackVisible(false), 3000);
                  }
                } finally {
                  setIsDeleting(false);
                }
              }}
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

    {/* Feedback Modal (mirrored from Student Alerts) */}
    <Modal transparent animationType="fade" visible={feedbackVisible} onRequestClose={() => setFeedbackVisible(false)}>
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
  </>);
}

const styles = StyleSheet.create({
  wrapper: { flex: 1, backgroundColor: '#F9FAFB' },
  // Match vertical spacing with Student Alerts so the notifications container
  // does not overlap surrounding UI (tabs/header).
  contentContainer: { padding: 16, paddingBottom: 120, paddingTop: 50, flexGrow: 1 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 16 },
  loadingText: { marginTop: 12, color: '#6B7280', fontSize: 16 },
  section: { marginBottom: 24 },
  pageHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  sectionTitle: { fontSize: 30, fontWeight: '900', color: '#0078cf', marginRight: 8, marginBottom: 5, marginTop: 10, paddingTop: 10, paddingLeft: 10 },
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
  alertCardParentLike: { borderRadius: 8, padding: 16, marginBottom: 12, borderWidth: 1, shadowColor: '#000', shadowOpacity: 0.03, shadowOffset: { width: 0, height: 1 }, shadowRadius: 2, elevation: 1 },
  alertHeader: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12 },
  alertTypeIcon: { width: 40, height: 40, borderRadius: 8, marginRight: 12, alignItems: 'center', justifyContent: 'center' },
  alertInfo: { flex: 1 },
  alertTitle: { fontSize: 16, fontWeight: '600', color: '#111827', marginBottom: 2 },
  alertDetails: { marginBottom: 16, paddingHorizontal: 4 },
  alertMessage: { fontSize: 15, color: '#374151', lineHeight: 22 },
  metaChips: { alignItems: 'flex-end' },
  timeChip: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#EFF6FF', borderColor: '#DBEAFE', borderWidth: 1, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, marginBottom: 6 },
  timeChipText: { color: '#2563EB', fontSize: 10, marginLeft: 4, fontWeight: '600' },
  sidebar: { position: 'absolute', top: 0, bottom: 0, width: width * 0.6, backgroundColor: '#fff', padding: 20, shadowColor: '#000', shadowOpacity: 0.1, shadowOffset: { width: 5, height: 0 }, shadowRadius: 10, zIndex: 10,  borderTopLeftRadius: 15, },
  sidebarTitle: { fontSize: 25, fontWeight: 'bold', marginTop: 30, marginBottom: 20 },
  sidebarItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  sidebarText: { fontSize: 16, marginLeft: 12 },
  activeSidebarItem: {
    backgroundColor: '#EFF6FF',
    borderRadius: 8,
    marginVertical: 2,
  },
  activeSidebarText: { color: '#2563EB', fontWeight: '600' },
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'transparent', zIndex: 9 },
  iconButton: { marginRight: 12 },
  // Empty state (mirrored from Student Alerts)
  centerContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  emptyCard: { 
    backgroundColor: '#fff', 
    borderRadius: 8, 
    padding: 16, 
    alignItems: 'center', 
    borderWidth: 1, 
    borderColor: '#E5E7EB', 
    shadowColor: '#0F172A', 
    shadowOpacity: 0.08, 
    shadowOffset: { width: 0, height: 6 }, 
    shadowRadius: 12, 
    elevation: 4, 
    width: '100%' 
  },
  emptyIconWrap: { 
    width: 40, 
    height: 40, 
    borderRadius: 8, 
    backgroundColor: '#EFF6FF', 
    alignItems: 'center', 
    justifyContent: 'center', 
    marginBottom: 8 
  },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: '#111827', marginTop: 0, marginBottom: 4 },
  emptySubtext: {
    fontSize: 12,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 16,
    marginBottom: 12,
  },
  separator: { height: 1, backgroundColor: '#E5E7EB', marginVertical: 6 },
  titleWithBadge: { flexDirection: 'row', alignItems: 'center' },
  badge: { backgroundColor: '#2563EB', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, marginLeft: 8, marginTop: 15 },
  badgeText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  // Action pill mimicking ParentManagement select-all size
  actionPill: { 
    backgroundColor: '#F3F4F6', 
    paddingHorizontal: 10, 
    paddingVertical: 6, 
    borderRadius: 8, 
    borderWidth: 1, 
    borderColor: '#E5E7EB',
    // Ensure no shadow/elevation
    shadowColor: 'transparent',
    shadowOpacity: 0,
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 0,
    elevation: 0,
  },
  actionButtonsContainer: { flexDirection: 'row', alignItems: 'center', marginLeft: 'auto' },
  itemRow: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  itemAvatar: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center', marginRight: 8, borderWidth: 1 },
  itemBody: { flex: 1 },
  itemTitle: { fontSize: 13, fontWeight: '700', color: '#111827' },
  itemMeta: { fontSize: 11, color: '#6B7280', marginTop: 1 },
  itemTitleUnread: { color: '#2563EB' },
  itemMetaUnread: { color: '#2563EB' },
  itemTime: { fontSize: 10, color: '#6B7280', marginLeft: 6, alignSelf: 'flex-start' },
  // Modal styles aligned with ActivityLog.js
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
  modalButtonDisabled: { opacity: 0.5 },
  modalButtonTextDisabled: { opacity: 0.7 },
  // Facebook-style confirm + feedback (mirrored from Student Alerts)
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


