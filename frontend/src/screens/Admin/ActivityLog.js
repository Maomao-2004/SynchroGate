import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Image,
  Animated,
  Dimensions,
  Modal,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { AuthContext } from '../../contexts/AuthContext';
import sidebarEventEmitter from '../../utils/sidebarEventEmitter';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { doc, getDoc, setDoc, onSnapshot, deleteDoc, getDocFromServer } from 'firebase/firestore';
import * as Notifications from 'expo-notifications';
import { db } from '../../utils/firebaseConfig';
import { withNetworkErrorHandling, getNetworkErrorMessage } from '../../utils/networkErrorHandler';
const AboutLogo = require('../../assets/logo.png');

const { width } = Dimensions.get('window');

// Mirror of Student Alerts UI with copy tweaks for Activity Logs only (empty state text)
export default function NotificationLog() {
  const navigation = useNavigation();
  const { logout } = React.useContext(AuthContext);
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [logoutVisible, setLogoutVisible] = useState(false);
  const [deleteConfirmVisible, setDeleteConfirmVisible] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [feedbackVisible, setFeedbackVisible] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState('');
  const [feedbackSuccess, setFeedbackSuccess] = useState(true);
  const [networkErrorVisible, setNetworkErrorVisible] = useState(false);
  const [networkErrorTitle, setNetworkErrorTitle] = useState('');
  const [networkErrorMessage, setNetworkErrorMessage] = useState('');
  const [networkErrorColor, setNetworkErrorColor] = useState('#DC2626');
  const [detailVisible, setDetailVisible] = useState(false);
  const [detailStudents, setDetailStudents] = useState([]);
  const [detailAlert, setDetailAlert] = useState(null);
  const [markingAsRead, setMarkingAsRead] = useState(false);

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

  const alertTypes = {
    'qr_generated': { label: 'QR Generated', icon: 'qr-code-outline', color: '#10B981' },
    'general': { label: 'General Notice', icon: 'information-circle-outline', color: '#10B981' },
    'emergency': { label: 'Emergency', icon: 'alert-circle-outline', color: '#DC2626' },
    'student_deleted': { label: 'Student Account Deleted', icon: 'school-outline', color: '#DC2626' },
    'parent_deleted': { label: 'Parent Account Deleted', icon: 'person-outline', color: '#DC2626' },
  };

  // Source of admin activity logs
  const loadLogs = async () => {
    try {
      setLoading(true);
      const ref = doc(db, 'admin_activity_logs', 'global');
      let snap;
      try {
        snap = await getDocFromServer(ref);
      } catch {
        snap = await getDoc(ref);
      }
      const items = snap.exists() ? (Array.isArray(snap.data()?.items) ? snap.data().items : []) : [];
      const mapped = items.map(item => ({
        alertId: item.id,
        alertType: item.type || 'general',
        title: item.title || 'Activity',
        message: item.message || '',
        createdAt: item.createdAt || new Date().toISOString(),
        status: item.status || 'read',
        students: Array.isArray(item.students) ? item.students : [],
        parent: item.parent || null,
        student: item.student || null,
      })).sort((a,b)=> new Date(b.createdAt) - new Date(a.createdAt));
      setAlerts(mapped);
      // No write-backs here to avoid exceeding write quotas
    } catch (e) {
      console.error('Error loading logs:', e);
      // Only show network error modal for actual network errors
      if (e?.code?.includes('unavailable') || e?.code?.includes('network') || e?.message?.toLowerCase().includes('network')) {
        const errorInfo = getNetworkErrorMessage({ type: 'unstable_connection', message: e.message });
        setNetworkErrorTitle(errorInfo.title);
        setNetworkErrorMessage(errorInfo.message);
        setNetworkErrorColor(errorInfo.color);
        setNetworkErrorVisible(true);
        setTimeout(() => setNetworkErrorVisible(false), 5000);
      }
    } finally {
      setLoading(false);
    }
  };

  const markAllAsRead = async () => {
    try {
      setMarkingAsRead(true);
      const ref = doc(db, 'admin_activity_logs', 'global');
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
        console.warn('Failed to mark admin activity logs as read:', error);
      }
    } finally {
      setMarkingAsRead(false);
    }
  };

  const changeFilter = (next) => {
    if (next === 'all' || next === 'unread' || next === 'read') setFilter(next);
  };

  useEffect(() => { loadLogs(); }, []);
  // Safety: never let loading hang due to any unexpected async behavior
  useEffect(() => {
    const timer = setTimeout(() => setLoading(false), 4000);
    return () => clearTimeout(timer);
  }, []);

  // Refresh data when screen comes into focus
  useFocusEffect(
    React.useCallback(() => {
      loadLogs();
    }, [])
  );
  useEffect(() => {
    const ref = doc(db, 'admin_activity_logs', 'global');
    const unsub = onSnapshot(ref, { includeMetadataChanges: true }, async (snap) => {
      try {
        // Only skip if it's from cache AND there are no pending writes (meaning it's stale data)
        if (snap.metadata?.fromCache && !snap.metadata?.hasPendingWrites) {
          return;
        }
        
        const items = snap.exists() ? (Array.isArray(snap.data()?.items) ? snap.data().items : []) : [];
        
        const mapped = items.map(item => ({
          alertId: item.id,
          alertType: item.type || 'general',
          title: item.title || 'Activity',
          message: item.message || '',
          createdAt: item.createdAt || new Date().toISOString(),
          status: item.status || 'read',
          students: Array.isArray(item.students) ? item.students : [],
          parent: item.parent || null,
          student: item.student || null,
        })).sort((a,b)=> new Date(b.createdAt) - new Date(a.createdAt));

        setAlerts(mapped);
      } catch (error) {
        console.warn('Error in activity log listener:', error);
      } finally {
        setLoading(false);
      }
    }, (error) => {
      console.error('Error in admin activity logs snapshot:', error);
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
    
    return () => { 
      try { unsub(); } catch {} 
    };
  }, []);


  const toggleSidebar = (open) => {
    Animated.timing(sidebarAnimRight, { toValue: open ? 0 : -width * 0.6, duration: 300, useNativeDriver: false }).start();
    setSidebarOpen(open);
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
            activeOpacity={0.7}
            hitSlop={{ top: 5, bottom: 5, left: 5, right: 5 }}
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
            }).map((alert) => {
              // Determine alert type based on title or alertType
              let alertTypeKey = alert.alertType;
              let iconName = alertTypes[alertTypeKey]?.icon || 'information-circle-outline';
              
              if (alert.title === 'Student Account Deleted') {
                alertTypeKey = 'student_deleted';
              } else if (alert.title === 'Parent Account Deleted') {
                alertTypeKey = 'parent_deleted';
              } else if (alert.title === 'QR Code Changed' || alert.title === 'QR Codes Changed') {
                // Use refresh icon for QR code changes (like in StudentManagement)
                iconName = 'refresh-outline';
              }
              
              let typeColor = alertTypes[alertTypeKey]?.color || '#2563EB';
              // Force QR Changed to modern light blue even if type is qr_generated
              if (alert.title === 'QR Code Changed' || alert.title === 'QR Codes Changed') {
                typeColor = '#2563EB';
              }
              const iconBg = typeColor === '#10B981' ? '#ECFDF5' : typeColor === '#DC2626' ? '#FEE2E2' : '#EFF6FF';
              const createdLabel = new Date(alert.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
              const isUnread = alert.status === 'unread';
              const onPress = async () => {
                try {
                  // Mark as read
                  const ref = doc(db, 'admin_activity_logs', 'global');
                  const snap = await getDocFromServer(ref);
                  if (snap.exists()) {
                    const items = Array.isArray(snap.data()?.items) ? snap.data().items : [];
                    const updated = items.map(it => it.id === alert.alertId ? { ...it, status: 'read' } : it);
                    await setDoc(ref, { items: updated }, { merge: true });
                  }
                } catch (e) {
                  console.error('Error marking activity as read:', e);
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

                if (alert.alertType === 'qr_generated' && Array.isArray(alert.students) && alert.students.length > 0) {
                  setDetailStudents(alert.students);
                  setDetailAlert(alert);
                  setDetailVisible(true);
                  return;
                }
                // Show modal for parent account deleted
                if (alert.title === 'Parent Account Deleted') {
                  setDetailStudents([{
                    id: alert.parent?.id || 'unknown',
                    firstName: alert.parent?.firstName || 'Unknown',
                    lastName: alert.parent?.lastName || 'Parent',
                    parentId: alert.parent?.parentId || 'unknown',
                    yearLevel: 'N/A', // Parents don't have year levels
                    course: 'N/A',
                    section: 'N/A'
                  }]);
                  setDetailAlert(alert);
                  setDetailVisible(true);
                  return;
                }
                // Show modal for student account deleted
                if (alert.title === 'Student Account Deleted') {
                  setDetailStudents([{
                    id: alert.student?.id || 'unknown',
                    firstName: alert.student?.firstName || 'Unknown',
                    lastName: alert.student?.lastName || 'Student',
                    studentId: alert.student?.studentId || 'unknown',
                    yearLevel: 'N/A', // We don't store year level in student deletion logs
                    course: 'N/A',
                    section: 'N/A'
                  }]);
                  setDetailAlert(alert);
                  setDetailVisible(true);
                  return;
                }
              };
              return (
                <TouchableOpacity 
                  key={alert.alertId} 
                  activeOpacity={0.7} 
                  onPress={onPress} 
                  style={styles.itemRow}
                  hitSlop={{ top: 5, bottom: 5, left: 5, right: 5 }}
                >
                  <View style={[styles.itemAvatar, { backgroundColor: iconBg, borderColor: typeColor }]}>
                    <Ionicons name={iconName} size={14} color={typeColor} />
                  </View>
                  <View style={styles.itemBody}>
                    <Text style={[styles.itemTitle, isUnread && styles.itemTitleUnread]} numberOfLines={1}>{alert.title}</Text>
                    <Text style={[styles.itemMeta, isUnread && styles.itemMetaUnread]} numberOfLines={2}>{alert.message}</Text>
                  </View>
                  <Text style={[styles.itemTime, isUnread && { color: '#2563EB' }]}>{createdLabel}</Text>
                </TouchableOpacity>
              );
            })}
          </>
        ) : (
          <View style={styles.centerContainer}>
            <View style={styles.emptyCard}>
              <View style={styles.emptyIconWrap}>
                <Ionicons name="time-outline" size={28} color="#2563EB" />
                <View style={styles.emptyIconSlash} />
              </View>
              <Text style={styles.emptyTitle}>No Activity Logs</Text>
              <Text style={styles.emptySubtext}>
                No activity logs are currently available. Activity logs will appear here when system events occur, such as QR code generation, account deletions, or other administrative actions.
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
            <Text style={styles.fbModalTitle}>Delete activity logs?</Text>
            <Text style={styles.fbModalMessage}>
              Delete all activity log notifications. This cannot be undone.
            </Text>
          </View>
          <View style={styles.fbModalButtonContainer}>
            <TouchableOpacity 
              style={[styles.fbModalCancelButton, deleting && styles.fbModalButtonDisabled]} 
              onPress={() => setDeleteConfirmVisible(false)}
              disabled={deleting}
              activeOpacity={0.8}
              hitSlop={{ top: 5, bottom: 5, left: 5, right: 5 }}
            >
              <Text style={styles.fbModalCancelText}>Close</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[
                styles.fbModalConfirmButton, 
                { backgroundColor: '#8B0000' },
                deleting && styles.fbModalButtonDisabled
              ]} 
              disabled={deleting}
              activeOpacity={0.8}
              hitSlop={{ top: 5, bottom: 5, left: 5, right: 5 }}
              onPress={async () => {
                if (deleting) return;
                setDeleting(true);
                try {
                  const ref = doc(db, 'admin_activity_logs', 'global');
                  // Try to delete the entire document
                  await deleteDoc(ref);
                  // Optimistically clear UI immediately
                  setAlerts([]);
                  setFeedbackMessage('Activity log notifications deleted');
                  setFeedbackSuccess(true);
                  setFeedbackVisible(true);
                  setDeleteConfirmVisible(false);
                  setTimeout(() => {
                    setFeedbackVisible(false);
                  }, 3000);
                } catch (e) {
                  console.error('Error deleting activity logs:', e);
                  // Only show network error modal for actual network errors
                  if (e?.code?.includes('unavailable') || e?.code?.includes('network') || e?.message?.toLowerCase().includes('network')) {
                    const errorInfo = getNetworkErrorMessage({ type: 'unstable_connection', message: e.message });
                    setNetworkErrorTitle(errorInfo.title);
                    setNetworkErrorMessage(errorInfo.message);
                    setNetworkErrorColor(errorInfo.color);
                    setNetworkErrorVisible(true);
                    setTimeout(() => setNetworkErrorVisible(false), 5000);
                  } else {
                    try {
                      // Fallback: if delete is not permitted, clear items array instead
                      const ref = doc(db, 'admin_activity_logs', 'global');
                      await setDoc(ref, { items: [] }, { merge: true });
                      setAlerts([]);
                      setFeedbackMessage('Activity log notifications deleted');
                      setFeedbackSuccess(true);
                      setFeedbackVisible(true);
                      setDeleteConfirmVisible(false);
                      setTimeout(() => {
                        setFeedbackVisible(false);
                      }, 3000);
                    } catch (fallbackError) {
                      const fallbackErrorInfo = getNetworkErrorMessage(fallbackError);
                      if (fallbackError.type === 'no_internet' || fallbackError.type === 'timeout' || fallbackError.type === 'unstable_connection') {
                        setNetworkErrorTitle(fallbackErrorInfo.title);
                        setNetworkErrorMessage(fallbackErrorInfo.message);
                        setNetworkErrorColor(fallbackErrorInfo.color);
                        setNetworkErrorVisible(true);
                        setTimeout(() => setNetworkErrorVisible(false), 5000);
                      } else {
                        setFeedbackMessage('Failed to delete activity logs');
                        setFeedbackSuccess(false);
                        setFeedbackVisible(true);
                        setDeleteConfirmVisible(false);
                        setTimeout(() => {
                          setFeedbackVisible(false);
                        }, 3000);
                      }
                    }
                  }
                } finally {
                  setDeleting(false);
                }
              }}
            >
              <Text style={styles.fbModalConfirmText}>
                {deleting ? 'Deleting...' : 'Confirm'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>

    {/* QR Code Details Modal - Single or Multiple Students */}
    <Modal transparent animationType="fade" visible={detailVisible} onRequestClose={() => { setDetailVisible(false); setDetailAlert(null); }}>
      <View style={styles.modernModalOverlay}>
        <View style={styles.modernModalCard}>
          <View style={styles.modernModalHeader}>
            <View style={styles.modernHeaderGradient}>
              <View style={styles.modernHeaderContent}>
                <View style={styles.modernAvatar}>
                  <Ionicons 
                    name={
                      detailAlert?.title === 'QR Code Changed' || detailAlert?.title === 'QR Codes Changed' 
                        ? 'refresh-outline' 
                        : 'qr-code-outline'
                    } 
                    size={20} 
                    color="#FFFFFF" 
                  />
                </View>
                <View style={styles.modernHeaderInfo}>
                  <Text style={styles.modernName}>
                    {(() => {
                      const formatYear = (val) => {
                        const str = String(val ?? '').trim();
                        const num = parseInt(str, 10);
                        if (num === 1) return '1st Year';
                        if (num === 2) return '2nd Year';
                        if (num === 3) return '3rd Year';
                        if (num === 4) return '4th Year';
                        return str || '';
                      };
                      
                      // Check notification type
                      const isQRChange = detailAlert?.title === 'QR Code Changed' || detailAlert?.title === 'QR Codes Changed';
                      const isParentDeleted = detailAlert?.title === 'Parent Account Deleted';
                      const isStudentDeleted = detailAlert?.title === 'Student Account Deleted';
                      
                      if (isParentDeleted) {
                        return 'Parent Account Deleted';
                      } else if (isStudentDeleted) {
                        return 'Student Account Deleted';
                      } else if (detailStudents.length === 1) {
                        // Single student
                        const yearLevel = detailStudents[0]?.yearLevel;
                        const yearText = yearLevel && yearLevel !== 'N/A' ? ` (${formatYear(yearLevel)})` : '';
                        
                        if (isQRChange) {
                          return `QR Code Changed${yearText}`;
                        } else {
                          return `QR Code Details${yearText}`;
                        }
                      } else {
                        // Multiple students
                        const yearLevels = detailStudents.map(s => s.yearLevel).filter(Boolean);
                        const uniqueYears = [...new Set(yearLevels)];
                        const yearText = (uniqueYears.length === 1 && uniqueYears[0] && uniqueYears[0] !== 'N/A') ? ` (${formatYear(uniqueYears[0])})` : '';
                        
                        if (isQRChange) {
                          return `QR Codes Changed${yearText}`;
                        } else {
                          return `Generated QR Codes${yearText}`;
                        }
                      }
                    })()}
                  </Text>
                  <Text style={styles.modernId}>
                    {(() => {
                      const isParentDeleted = detailAlert?.title === 'Parent Account Deleted';
                      const isStudentDeleted = detailAlert?.title === 'Student Account Deleted';
                      
                      if (isParentDeleted) {
                        return `Parent: ${detailStudents[0]?.firstName} ${detailStudents[0]?.lastName}`;
                      } else if (isStudentDeleted) {
                        return `Student: ${detailStudents[0]?.firstName} ${detailStudents[0]?.lastName}`;
                      } else {
                        return detailStudents.length === 1 ? `Student: ${detailStudents[0]?.firstName} ${detailStudents[0]?.lastName}` : `${detailStudents.length} Students`;
                      }
                    })()}
                  </Text>
                </View>
              </View>
              <TouchableOpacity onPress={() => { setDetailVisible(false); setDetailAlert(null); }} style={styles.modernCloseBtn}>
                <Ionicons name="close" size={20} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
          </View>
          
          <View style={styles.modernInfoGrid}>
            <ScrollView 
              style={{ maxHeight: 300 }} 
              showsVerticalScrollIndicator={true}
              nestedScrollEnabled={true}
            >
              {detailStudents.map((s, index) => {
                const isParentDeleted = detailAlert?.title === 'Parent Account Deleted';
                const isStudentDeleted = detailAlert?.title === 'Student Account Deleted';
                
                return (
                  <View key={s.id || index} style={styles.modernInfoItem}>
                    <Ionicons name={isParentDeleted ? "person-outline" : "school-outline"} size={16} color="#6B7280" />
                    <Text style={styles.modernInfoLabel}>
                      {isParentDeleted ? 'Parent' : isStudentDeleted ? 'Student' : `Student ${index + 1}`}
                    </Text>
                    <View style={{ flex: 1, alignItems: 'flex-end' }}>
                      <Text style={styles.modernInfoValue}>{s.firstName} {s.lastName}</Text>
                      <Text style={[styles.modernInfoValue, { fontSize: 11, color: '#9CA3AF', marginTop: 2 }]}>
                        {isParentDeleted ? `Parent ID: ${s.parentId}` : `Student ID: ${s.studentId}`}
                      </Text>
                      {!isParentDeleted && !isStudentDeleted && (
                        <Text style={[styles.modernInfoValue, { fontSize: 11, color: '#9CA3AF', marginTop: 2 }]}>
                          {(() => {
                            // Get course and section as separate fields
                            const courseField = s.course || '';
                            const sectionField = s.section || '';
                            
                            // Clean and validate the fields
                            const course = String(courseField).trim();
                            const section = String(sectionField).trim();
                            
                            // Display as "Course - Section" format
                            if (course && section) {
                              return `${course} - ${section}`;
                            } else if (course) {
                              return `${course} - (No Section)`;
                            } else if (section) {
                              return `(No Course) - ${section}`;
                            } else {
                              return '— (No Course/Section Data Available)';
                            }
                          })()}
                        </Text>
                      )}
                      {(isParentDeleted || isStudentDeleted) && (
                        <Text style={[styles.modernInfoValue, { fontSize: 11, color: '#DC2626', marginTop: 2, fontWeight: '600' }]}>
                          Account Deleted
                        </Text>
                      )}
                    </View>
                  </View>
                );
              })}
            </ScrollView>
          </View>
          
          <View style={styles.modernActions}>
            <TouchableOpacity style={styles.modernCloseButton} onPress={() => { setDetailVisible(false); setDetailAlert(null); }}>
              <Text style={styles.modernCloseButtonText}>Close</Text>
            </TouchableOpacity>
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
            <TouchableOpacity 
              style={styles.modalButtonCancel} 
              onPress={() => setLogoutVisible(false)}
              activeOpacity={0.8}
              hitSlop={{ top: 5, bottom: 5, left: 5, right: 5 }}
            >
              <Text style={styles.modalButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.modalButton, styles.modalButtonDanger]} 
              onPress={async () => { setLogoutVisible(false); try { await logout(); } catch {} }}
              activeOpacity={0.8}
              hitSlop={{ top: 5, bottom: 5, left: 5, right: 5 }}
            >
              <Text style={[styles.modalButtonText, styles.modalButtonDangerText]}>Logout</Text>
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
  </>);
}

const styles = StyleSheet.create({
  wrapper: { flex: 1, backgroundColor: '#F9FAFB' },
  // Align with Student Alerts spacing so the notification list container
  // sits below the header and avoids overlap.
  contentContainer: { padding: 16, paddingBottom: 120, paddingTop: 50, flexGrow: 1 },
  pageHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  section: { marginBottom: 24 },
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
    marginTop: 6,
  },
  filterRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 0, marginTop: 0, paddingHorizontal: 0 },
  filterChipsContainer: { flexDirection: 'row', gap: 8 },
  filterChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: '#F3F4F6', borderWidth: 1, borderColor: '#E5E7EB' },
  filterChipActive: { backgroundColor: '#004f89', borderColor: '#004f89' },
  filterChipText: { color: '#111827', fontWeight: '600', fontSize: 12 },
  filterChipTextActive: { color: '#fff' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 0 },
  loadingOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 12, color: '#6B7280', fontSize: 16 },
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
  sidebarItem: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    paddingVertical: 12, 
    borderBottomWidth: 1, 
    borderBottomColor: '#E5E7EB',
    borderRadius: 8,
    marginHorizontal: 4,
    marginVertical: 2,
  },
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
    marginBottom: 8,
  },
  emptyIconSlash: {
    position: 'absolute',
    width: 2,
    height: 32,
    backgroundColor: '#2563EB',
    // Flipped horizontally relative to the original diagonal
    transform: [{ rotate: '-45deg' }],
    borderRadius: 1,
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
  itemRow: { 
    flexDirection: 'row', 
    alignItems: 'flex-start', 
    paddingVertical: 6, 
    borderBottomWidth: 1, 
    borderBottomColor: '#F3F4F6',
    borderRadius: 8,
    marginHorizontal: 4,
    marginVertical: 2,
  },
  itemAvatar: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center', marginRight: 8, borderWidth: 1 },
  itemBody: { flex: 1 },
  itemTitle: { fontSize: 13, fontWeight: '700', color: '#111827' },
  itemMeta: { fontSize: 11, color: '#6B7280', marginTop: 1 },
  itemTitleUnread: { color: '#2563EB' },
  itemMetaUnread: { color: '#2563EB' },
  itemTime: { fontSize: 10, color: '#6B7280', marginLeft: 6, alignSelf: 'flex-start' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  modalCard: { backgroundColor: '#fff', borderRadius: 8, padding: 24, width: '85%', maxWidth: 400, alignItems: 'center' },
  modalIconWrap: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  modalTitle: { fontSize: 20, fontWeight: '700', color: '#111827', marginBottom: 8 },
  modalText: { fontSize: 16, color: '#6B7280', textAlign: 'center', marginBottom: 24 },
  modalActions: { flexDirection: 'row', gap: 12 },
  modalButton: { 
    flex: 1, 
    paddingVertical: 12, 
    paddingHorizontal: 16, 
    borderRadius: 8, 
    alignItems: 'center',
  },
  modalButtonText: { fontSize: 16, fontWeight: '600', color: '#6B7280' },
  modalButtonDanger: { backgroundColor: '#FEE2E2' },
  modalButtonDangerText: { color: '#b91c1c' },
  modalButtonDisabled: { opacity: 0.5 },
  modalButtonTextDisabled: { opacity: 0.7 },
  modalButtonCancel: { 
    flex: 1, 
    paddingVertical: 12, 
    paddingHorizontal: 16, 
    borderRadius: 8, 
    alignItems: 'center',
  },
  detailCloseBtn: { 
    paddingVertical: 12, 
    paddingHorizontal: 16, 
    borderRadius: 8, 
    alignItems: 'center', 
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 2,
  },
  detailCloseText: { color: '#111827', fontWeight: '600', textAlign: 'center' },
  
  // Modern Modal Styles (mirrored from StudentManagement.js)
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
    width: '90%',
    maxWidth: 360,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 20,
    elevation: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  modernModalHeader: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: 'hidden',
  },
  modernHeaderGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    paddingBottom: 16,
    backgroundColor: '#004f89',
    position: 'relative',
  },
  modernHeaderContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  modernAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 4,
  },
  modernHeaderInfo: {
    flex: 1,
  },
  modernName: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: 2,
    textShadowColor: 'rgba(0, 0, 0, 0.1)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  modernId: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.8)',
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  modernCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  modernInfoGrid: {
    padding: 12,
    paddingTop: 20,
    backgroundColor: '#FAFBFC',
  },
  modernInfoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  modernInfoLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1F2937',
    marginLeft: 10,
    marginRight: 12,
    minWidth: 60,
    letterSpacing: 0.2,
  },
  modernInfoValue: {
    fontSize: 13,
    color: '#4B5563',
    flex: 1,
    textAlign: 'right',
    fontWeight: '500',
  },
  modernActions: {
    flexDirection: 'row',
    padding: 12,
    paddingTop: 8,
    backgroundColor: '#FFFFFF',
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    gap: 6,
  },
  modernCloseButton: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    paddingVertical: 12,
    paddingHorizontal: 12,
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
    fontSize: 13,
    fontWeight: '700',
    color: '#475569',
    letterSpacing: 0.2,
  },
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
