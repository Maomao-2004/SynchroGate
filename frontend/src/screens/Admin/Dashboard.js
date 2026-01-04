import React, { useContext, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Animated,
  Dimensions,
  Image,
  Modal,
} from 'react-native';
import { useNavigation, useIsFocused, CommonActions } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AuthContext } from '../../contexts/AuthContext';
import { getLinkedStudents } from '../../api/student';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../utils/firebaseConfig';
import { withNetworkErrorHandling, getNetworkErrorMessage } from '../../utils/networkErrorHandler';
import { wp, hp, fontSizes, responsiveStyles, getResponsiveDimensions } from '../../utils/responsive';
import sidebarEventEmitter from '../../utils/sidebarEventEmitter';
const AboutLogo = require('../../assets/logo.png');

const { width } = Dimensions.get('window');
const dimensions = getResponsiveDimensions();

const AdminDashboard = () => {
  const navigation = useNavigation();
  const isFocused = useIsFocused();
  const { user, logout } = useContext(AuthContext);

  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [studentsLoading, setStudentsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [profilePic, setProfilePic] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [logoutVisible, setLogoutVisible] = useState(false);
  const [unlinkedStudentsCount, setUnlinkedStudentsCount] = useState(0);
  const [unlinkedParentsCount, setUnlinkedParentsCount] = useState(0);
  const [studentsWithoutQrCount, setStudentsWithoutQrCount] = useState(0);
  const [totalStudentsCount, setTotalStudentsCount] = useState(0);
  const [totalParentsCount, setTotalParentsCount] = useState(0);
  const [announcementsCount, setAnnouncementsCount] = useState(0);
  const [networkErrorVisible, setNetworkErrorVisible] = useState(false);
  const [networkErrorTitle, setNetworkErrorTitle] = useState('');
  const [networkErrorMessage, setNetworkErrorMessage] = useState('');
  const [networkErrorColor, setNetworkErrorColor] = useState('#DC2626');

  const sidebarWidth = Math.min(wp(75), 300);
  const sidebarAnimRight = useState(new Animated.Value(-sidebarWidth))[0];

  // Card visual palette (matches student dashboard card styling)
  const adminCardPalette = {
    cardBg: '#FFFFFF',
    borderColor: '#E5E7EB',
    iconBg: 'rgba(0,79,137,0.12)',
    accentColor: '#004f89',
    badgeBg: '#004f89',
    badgeTextColor: '#FFFFFF',
    textColor: '#004f89',
    labelColor: '#004f89',
  };

  // Overview cards shown at the top of the admin dashboard
  const overviewCards = [
    {
      key: 'allStudents',
      title: 'All Students',
      subtitle: 'Total registered',
      value: totalStudentsCount,
      badgeText: `${totalStudentsCount} in system`,
      renderIcon: () => <Ionicons name="school-outline" size={22} color={adminCardPalette.accentColor} />,
    },
    {
      key: 'allParents',
      title: 'All Parents',
      subtitle: 'Linked accounts',
      value: totalParentsCount,
      badgeText: `${totalParentsCount} in system`,
      renderIcon: () => <Ionicons name="people-outline" size={22} color={adminCardPalette.accentColor} />,
    },
    {
      key: 'announcements',
      title: 'Announcements',
      subtitle: 'Broadcast messages',
      value: announcementsCount,
      badgeText: announcementsCount === 0 ? 'No announcements yet' : `${announcementsCount} published`,
      renderIcon: () => <Ionicons name="megaphone-outline" size={22} color={adminCardPalette.accentColor} />,
    },
    {
      key: 'unlinkedStudents',
      title: 'Unlinked Students',
      subtitle: 'No parent linked',
      value: unlinkedStudentsCount,
      badgeText: unlinkedStudentsCount === 0 ? 'All students linked' : `${unlinkedStudentsCount} to review`,
      renderIcon: () => <Ionicons name="school-outline" size={22} color={adminCardPalette.accentColor} />,
    },
    {
      key: 'unlinkedParents',
      title: 'Unlinked Parents',
      subtitle: 'No student assigned',
      value: unlinkedParentsCount,
      badgeText: unlinkedParentsCount === 0 ? 'All parents linked' : `${unlinkedParentsCount} to review`,
      renderIcon: () => <Ionicons name="people-outline" size={22} color={adminCardPalette.accentColor} />,
    },
    {
      key: 'noQrCodes',
      title: 'No QR Codes',
      subtitle: 'Awaiting generation',
      value: studentsWithoutQrCount,
      badgeText: studentsWithoutQrCount === 0 ? 'All students have QR' : `${studentsWithoutQrCount} pending`,
      renderIcon: () => <Ionicons name="qr-code-outline" size={22} color={adminCardPalette.accentColor} />,
    },
  ];


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

  useEffect(() => {
    const loadProfilePic = async () => {
      try {
        if (!user?.uid) { setProfilePic(null); return; }
        const key = `adminProfilePic_${user.adminId || user.uid}`;
        const savedProfile = await AsyncStorage.getItem(key);
        setProfilePic(savedProfile ? { uri: savedProfile } : null);
      } catch (e) {
        setProfilePic(null);
      }
    };
    if (isFocused) loadProfilePic();
  }, [isFocused, user?.uid, user?.adminId]);

    const fetchStudents = async () => {
      setStudentsLoading(true);
      try {
        setError(null);
        const data = await getLinkedStudents('admin');
        setStudents(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error('Error fetching students:', err);
        // Only show network error modal for actual network errors
        if (err?.code?.includes('unavailable') || err?.code?.includes('network') || err?.message?.toLowerCase().includes('network')) {
          const errorInfo = getNetworkErrorMessage({ type: 'unstable_connection', message: err.message });
          setNetworkErrorTitle(errorInfo.title);
          setNetworkErrorMessage(errorInfo.message);
          setNetworkErrorColor(errorInfo.color);
          setNetworkErrorVisible(true);
          setTimeout(() => setNetworkErrorVisible(false), 5000);
        } else {
          setError('Failed to load students. Please try again.');
        }
        setStudents([]);
      } finally {
        setStudentsLoading(false);
        setLoading(false);
      }
    };

  useEffect(() => {
    fetchStudents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Listen for sidebar toggle events from AdminTopHeader
  useEffect(() => {
    const handleToggleSidebar = () => {
      toggleSidebar(!sidebarOpen);
    };

    sidebarEventEmitter.on('toggleSidebar', handleToggleSidebar);
    return () => {
      sidebarEventEmitter.off('toggleSidebar', handleToggleSidebar);
    };
  }, [sidebarOpen]);

  // Fetch total counts and compute unlinked counts
  const fetchAllCounts = async () => {
    try {
      const usersRef = collection(db, 'users');
      const studentsQ = query(usersRef, where('role', '==', 'student'));
      const parentsQ = query(usersRef, where('role', '==', 'parent'));
      const [studentsSnap, parentsSnap] = await Promise.all([
        getDocs(studentsQ),
        getDocs(parentsQ),
      ]);

      const allStudents = studentsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      const allParents = parentsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

      // Set total counts
      setTotalStudentsCount(allStudents.length);
      setTotalParentsCount(allParents.length);

      const linksRef = collection(db, 'parent_student_links');
      const activeLinksQ = query(linksRef, where('status', '==', 'active'));
      const linksSnap = await getDocs(activeLinksQ);

      const linkedStudentIds = new Set();
      const linkedParentIds = new Set();
      linksSnap.docs.forEach(linkDoc => {
        const link = linkDoc.data();
        if (link?.studentId) linkedStudentIds.add(link.studentId);
        if (link?.parentId) linkedParentIds.add(link.parentId);
      });

      const unlinkedStudents = allStudents.filter(s => !linkedStudentIds.has(s.uid || s.id));
      const unlinkedParents = allParents.filter(p => !linkedParentIds.has(p.uid || p.id));

      setUnlinkedStudentsCount(unlinkedStudents.length);
      setUnlinkedParentsCount(unlinkedParents.length);
    } catch (e) {
      console.error('Error fetching counts:', e);
      // Only show network error modal for actual network errors
      if (e?.code?.includes('unavailable') || e?.code?.includes('network') || e?.message?.toLowerCase().includes('network')) {
        const errorInfo = getNetworkErrorMessage({ type: 'unstable_connection', message: e.message });
        setNetworkErrorTitle(errorInfo.title);
        setNetworkErrorMessage(errorInfo.message);
        setNetworkErrorColor(errorInfo.color);
        setNetworkErrorVisible(true);
        setTimeout(() => setNetworkErrorVisible(false), 5000);
      }
      // keep previous values on error
    }
  };

  useEffect(() => {
    if (isFocused) fetchAllCounts();
  }, [isFocused]);

  const fetchAnnouncementsCount = async () => {
    try {
      // Count total announcements from the announcements collection
      const announcementsRef = collection(db, 'announcements');
      const announcementsSnap = await getDocs(announcementsRef);
      setAnnouncementsCount(announcementsSnap.size);
    } catch (e) {
      console.error('Error fetching announcements count:', e);
      // Only show network error modal for actual network errors
      if (e?.code?.includes('unavailable') || e?.code?.includes('network') || e?.message?.toLowerCase().includes('network')) {
        const errorInfo = getNetworkErrorMessage({ type: 'unstable_connection', message: e.message });
        setNetworkErrorTitle(errorInfo.title);
        setNetworkErrorMessage(errorInfo.message);
        setNetworkErrorColor(errorInfo.color);
        setNetworkErrorVisible(true);
        setTimeout(() => setNetworkErrorVisible(false), 5000);
      }
      // keep previous values
    }
  };

  const fetchStudentsQrCounts = async () => {
    try {
      // Count from users (role=student) and compare with those present in student_QRcodes
      const usersRef = collection(db, 'users');
      const studentsQ = query(usersRef, where('role', '==', 'student'));
      const [usersSnap, qrSnap] = await Promise.all([
        getDocs(studentsQ),
        getDocs(collection(db, 'student_QRcodes')),
      ]);
      const hasQrSet = new Set();
      qrSnap.docs.forEach(d => { hasQrSet.add(String(d.id)); });
      let withoutCount = 0;
      usersSnap.docs.forEach(docRef => {
        const data = docRef.data() || {};
        const sid = String(data.studentId || docRef.id);
        if (!hasQrSet.has(sid)) {
          withoutCount += 1;
        }
      });
      setStudentsWithoutQrCount(withoutCount);
    } catch (e) {
      console.error('Error fetching QR counts:', e);
      // Only show network error modal for actual network errors
      if (e?.code?.includes('unavailable') || e?.code?.includes('network') || e?.message?.toLowerCase().includes('network')) {
        const errorInfo = getNetworkErrorMessage({ type: 'unstable_connection', message: e.message });
        setNetworkErrorTitle(errorInfo.title);
        setNetworkErrorMessage(errorInfo.message);
        setNetworkErrorColor(errorInfo.color);
        setNetworkErrorVisible(true);
        setTimeout(() => setNetworkErrorVisible(false), 5000);
      }
      // keep previous values
    }
  };

  useEffect(() => {
    if (isFocused) {
      fetchStudentsQrCounts();
      fetchAnnouncementsCount();
    }
  }, [isFocused]);

  const toggleSidebar = (open) => {
    Animated.timing(sidebarAnimRight, {
      toValue: open ? 0 : -width * 0.6,
      duration: 300,
      useNativeDriver: false,
    }).start();
    setSidebarOpen(open);
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good Morning';
    if (hour < 18) return 'Good Afternoon';
    return 'Good Evening';
  };

  const handleLogout = () => setLogoutVisible(true);
  const confirmLogout = async () => {
    setLogoutVisible(false);
    toggleSidebar(false);
    try { await logout(); } catch {}
  };
  const cancelLogout = () => setLogoutVisible(false);

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: '#FFFFFF' }} />
    );
  }

  return (<>
    <View style={styles.wrapper}>
      {/* Sidebar shown above everything using Modal to avoid tab overlap */}
      <Modal transparent visible={sidebarOpen} animationType="fade" onRequestClose={() => toggleSidebar(false)}>
        <TouchableOpacity
          style={styles.overlay}
          activeOpacity={1}
          onPress={() => toggleSidebar(false)}
        />
        <Animated.View style={[styles.sidebar, { right: sidebarAnimRight }]}>
          <Text style={styles.sidebarTitle}>Menu</Text>
          
          <TouchableOpacity
            style={[styles.sidebarItem, getActiveSidebarItem('AdminDashboard') && styles.activeSidebarItem]}
            onPress={() => {
              toggleSidebar(false);
              try {
                // Reset the HomeStack to only contain AdminDashboard
                navigation.reset({
                  index: 0,
                  routes: [{ name: 'AdminDashboard' }],
                });
              } catch {
                // Fallback: try parent navigation
                const parentNav = navigation.getParent?.();
                if (parentNav) {
                  parentNav.navigate('Home', { screen: 'AdminDashboard' });
                } else {
                  navigation.navigate('AdminDashboard');
                }
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
        style={styles.scrollView}
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
      >

        {error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity
              style={styles.retryButton}
              onPress={() => { 
                setError(null); 
                fetchStudents(); 
                fetchAllCounts(); 
                fetchStudentsQrCounts();
                fetchAnnouncementsCount(); 
              }}
            >
              <Text style={styles.retryText}>Retry</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.section}>
          <View style={styles.statsGrid}>
            {overviewCards.map((card, idx) => (
              <View
                key={card.key}
                style={[
                  styles.overviewCard,
                  {
                    backgroundColor: adminCardPalette.cardBg,
                    borderColor: adminCardPalette.borderColor,
                  },
                ]}
              >
                <View style={styles.overviewHeader}>
                  <View
                    style={[
                      styles.overviewIconWrap,
                      { backgroundColor: adminCardPalette.iconBg },
                    ]}
                  >
                    {card.renderIcon()}
                  </View>
                  <Text
                    style={[
                      styles.overviewSubtitle,
                      { color: adminCardPalette.accentColor },
                    ]}
                  >
                    {card.subtitle}
                  </Text>
                </View>
                <Text
                  style={[
                    styles.overviewValue,
                    { color: adminCardPalette.textColor },
                  ]}
                  numberOfLines={1}
                  ellipsizeMode="tail"
                >
                  {card.value}
                </Text>
                <Text
                  style={[
                    styles.overviewLabel,
                    { color: adminCardPalette.labelColor },
                  ]}
                >
                  {card.title}
                </Text>
                {card.badgeText ? (
                  <View
                    style={[
                      styles.overviewBadge,
                      { backgroundColor: adminCardPalette.badgeBg },
                    ]}
                  >
                    <Text
                      style={[
                        styles.overviewBadgeText,
                        { color: adminCardPalette.badgeTextColor },
                      ]}
                    >
                      {card.badgeText}
                    </Text>
                  </View>
                ) : null}
              </View>
            ))}
          </View>
        </View>
      </ScrollView>
    </View>
    <Modal
      transparent
      animationType="fade"
      visible={logoutVisible}
      onRequestClose={cancelLogout}
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
          style={styles.modalButton} 
          onPress={cancelLogout}
          activeOpacity={0.8}
          hitSlop={{ top: 5, bottom: 5, left: 5, right: 5 }}
        >
          <Text style={styles.modalButtonText}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.modalButton, styles.modalButtonDanger]} 
          onPress={confirmLogout}
          activeOpacity={0.8}
          hitSlop={{ top: 5, bottom: 5, left: 5, right: 5 }}
        >
          <Text style={[styles.modalButtonText, styles.modalButtonDangerText]}>Logout</Text>
        </TouchableOpacity>
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
};

const styles = StyleSheet.create({
  wrapper: { flex: 1, backgroundColor: '#F9FAFB' },
  scrollView: { flex: 1 },
  container: { 
    padding: 16, 
    paddingBottom: 120, 
    paddingTop: 50, 
    flexGrow: 1,
  },
  // Sidebar
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
    borderTopLeftRadius: 15,
  },
  sidebarTitle: { fontSize: 25, fontWeight: 'bold', marginTop: 30, marginBottom: 20 },
  sidebarItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  sidebarText: { fontSize: 16, marginLeft: 12 },
  activeSidebarItem: {
    backgroundColor: '#EFF6FF',
    borderRadius: 8,
    marginVertical: 2,
  },
  activeSidebarText: { color: '#2563EB', fontWeight: '600' },
  logoutItem: { marginTop: 20 },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'transparent',
    zIndex: 9,
  },
  // Sections and cards
  section: { marginBottom: 24 },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  blockCard: {
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 12,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    marginTop: 20,
  },
  sectionTitle: {
    fontSize: 30,
    fontWeight: '900',
    color: '#0078cf',
    marginRight: 8,
    marginBottom: 5,
    marginTop: 10,
  },
  // Grid + overview card styles (mirrors student dashboard cards)
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginTop: 4,
    marginBottom: 4,
  },
  overviewCard: {
    width: '48%',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'flex-start',
    justifyContent: 'flex-start',
    overflow: 'hidden',
    marginVertical: 6,
    minHeight: 96,
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 4,
    elevation: 2,
  },
  overviewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    width: '100%',
    marginBottom: 10,
    flexWrap: 'wrap',
  },
  overviewIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  overviewSubtitle: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.2,
    flexShrink: 1,
    flexGrow: 1,
    minWidth: 0,
  },
  overviewValue: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 4,
    letterSpacing: -0.5,
  },
  overviewLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1F2937',
  },
  overviewBadge: {
    marginTop: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  overviewBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    marginHorizontal: 4,
    marginVertical: 2,
    overflow: 'hidden',
    position: 'relative',
  },
  statIcon: {
    width: 40,
    height: 40,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  statNumber: { fontSize: 16, fontWeight: '700', color: '#111827', marginBottom: 4 },
  statLabel: { fontSize: 12, color: '#6B7280', textAlign: 'center' },
  accentBar: { position: 'absolute', top: 0, left: 0, right: 0, height: 4, opacity: 0.95 },
  badge: {
    backgroundColor: '#2563EB',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    minWidth: 20,
    alignItems: 'center',
  },
  badgeText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 16 },
  loadingText: { marginTop: 12, color: '#6B7280', fontSize: 16 },
  loadingCard: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  studentsContainer: { gap: 12 },
  studentCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
  },
  studentAvatar: {
    width: 48,
    height: 48,
    borderRadius: 8,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  studentInitials: { fontSize: 18, fontWeight: '600', color: '#2563EB' },
  studentInfo: { flex: 1 },
  studentName: { fontSize: 16, fontWeight: '600', color: '#111827', marginBottom: 2 },
  studentClass: { fontSize: 14, color: '#6B7280', marginBottom: 2 },
  studentId: { fontSize: 12, color: '#9CA3AF', marginBottom: 4 },
  studentActions: { flexDirection: 'row', gap: 8, marginTop: 8 },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F3F4F6',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  actionButtonText: { fontSize: 12, color: '#374151', fontWeight: '500' },
  emptyCard: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
  },
  emptyIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#111827', marginBottom: 8 },
  emptySubtext: { fontSize: 14, color: '#6B7280', textAlign: 'center', lineHeight: 20, marginBottom: 20 },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#2563EB',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
  },
  primaryButtonText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  // Modal
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
  // Facebook-style modal styles (matching alerts.js)
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
  // Additional styles from ActivityLog
  listContainer: { 
    backgroundColor: '#fff', 
    borderRadius: 8, 
    borderWidth: 1, 
    borderColor: '#E5E7EB', 
    paddingHorizontal: 8, 
    paddingVertical: 4, 
    paddingBottom: 16, 
    marginTop: 12,
  },
  pageHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  titleWithBadge: { flexDirection: 'row', alignItems: 'center' },
  separator: { height: 1, backgroundColor: '#E5E7EB', marginVertical: 8 },
});

export default AdminDashboard;
