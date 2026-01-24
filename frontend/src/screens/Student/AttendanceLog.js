
import React, { useEffect, useState, useContext } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  TouchableOpacity,
  Dimensions,
  ScrollView,
  Image,
  Modal,
  Alert,
} from 'react-native';
import { useNavigation, useIsFocused, useFocusEffect, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { AuthContext } from '../../contexts/AuthContext';
import { STUDENT_TAB_BAR_STYLE } from '../../navigation/tabStyles';
import AdminTopHeader from '../Admin/AdminTopHeader';
import { collection, query, where, orderBy, onSnapshot, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '../../utils/firebaseConfig';
import { withNetworkErrorHandling, getNetworkErrorMessage } from '../../utils/networkErrorHandler';
// Removed unused AttendanceCard import
import useNetworkMonitor from '../../hooks/useNetworkMonitor';
import AsyncStorage from '@react-native-async-storage/async-storage';
import OfflineBanner from '../../components/OfflineBanner';
import NetInfo from '@react-native-community/netinfo';
import { wp, hp, fontSizes } from '../../utils/responsive';
import avatarEventEmitter from '../../utils/avatarEventEmitter';
import { cacheAttendanceLogs, getCachedAttendanceLogs } from '../../offline/storage';

const { width } = Dimensions.get('window');

const AttendanceLog = () => {
  const { user } = useContext(AuthContext);
  const navigation = useNavigation();
  const route = useRoute();
  const isFocused = useIsFocused();
  const isConnected = useNetworkMonitor();
  
  // Check if accessed from admin (has student in route params)
  const adminStudent = route?.params?.student;
  const isAdminView = !!adminStudent;
  // Use admin student data if available, otherwise use logged-in user
  const targetStudent = adminStudent || user;
  
  // Debug logging
  React.useEffect(() => {
    console.log('📒 AttendanceLog: targetStudent updated:', {
      hasAdminStudent: !!adminStudent,
      isAdminView,
      studentId: targetStudent?.studentId || targetStudent?.id,
      targetStudent
    });
  }, [adminStudent, isAdminView, targetStudent]);
  
  const [logs, setLogs] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [profilePic, setProfilePic] = useState(null);
  const [stats, setStats] = useState({
    today: 0,        // count of scan-IN today
    thisWeek: 0,     // count of scan-IN in last 7 days
    thisMonth: 0,    // count of scan-IN in last 30 days
  });
  const [todayScheduleCount, setTodayScheduleCount] = useState(0);
  const [announcementsCount, setAnnouncementsCount] = useState(0);
  const [scheduleLoading, setScheduleLoading] = useState(true);
  const [announcementsLoading, setAnnouncementsLoading] = useState(true);
  // Tick to trigger re-render at local midnight so Recent Activity clears automatically
  const [midnightTick, setMidnightTick] = useState(0);
  const currentDayKey = React.useMemo(() => new Date().toDateString(), [midnightTick]);

  const [showAllEntries, setShowAllEntries] = useState(false);
  const [networkErrorVisible, setNetworkErrorVisible] = useState(false);
  const [networkErrorTitle, setNetworkErrorTitle] = useState('');
  const [networkErrorMessage, setNetworkErrorMessage] = useState('');
  const [networkErrorColor, setNetworkErrorColor] = useState('#DC2626');
  const [showOfflineBanner, setShowOfflineBanner] = useState(false);

  // Load profile picture - using same key as Profile.js
  const loadProfilePic = React.useCallback(async () => {
    try {
      const studentId = targetStudent?.studentId || targetStudent?.id;
      if (!studentId) { setProfilePic(null); return; }
      // Use the same key as Profile.js: profilePic_${studentId}
      const primaryKey = `profilePic_${studentId}`;
      const legacyKey = `studentProfilePic_${studentId}`;
      let savedProfile = await AsyncStorage.getItem(primaryKey);
      if (!savedProfile) savedProfile = await AsyncStorage.getItem(legacyKey);
      setProfilePic(savedProfile ? { uri: savedProfile } : null);
    } catch (error) {
      console.log('Error loading profile pic:', error);
      setProfilePic(null);
    }
  }, [targetStudent?.studentId, targetStudent?.id]);

  useEffect(() => {
    if (isFocused) loadProfilePic();
  }, [isFocused, loadProfilePic]);

  // Listen for avatar changes from Profile screen
  useEffect(() => {
    const studentId = targetStudent?.studentId || targetStudent?.id;
    const handleAvatarChange = (data) => {
      if (studentId && data.studentId && String(data.studentId) === String(studentId)) {
        loadProfilePic();
      }
    };

    avatarEventEmitter.on('avatarChanged', handleAvatarChange);
    return () => {
      avatarEventEmitter.off('avatarChanged', handleAvatarChange);
    };
  }, [targetStudent?.studentId, targetStudent?.id, loadProfilePic]);

  // Real-time subscription to attendance logs in Firestore (student_attendances)
  useEffect(() => {
    // Get studentId - prioritize studentId field (the actual student ID), then id (document ID), then uid
    // For admin view, the student object from route params should have studentId field from Firestore document
    const studentId = targetStudent?.studentId || targetStudent?.id || targetStudent?.uid;
    if (!studentId) {
      console.log('📒 AttendanceLog: no studentId, skipping subscription. targetStudent:', {
        hasStudentId: !!targetStudent?.studentId,
        hasId: !!targetStudent?.id,
        hasUid: !!targetStudent?.uid,
        targetStudentKeys: targetStudent ? Object.keys(targetStudent) : [],
        isAdminView,
        adminStudent: adminStudent ? Object.keys(adminStudent) : []
      });
      setLogs([]);
      setStats({ today: 0, thisWeek: 0, thisMonth: 0 });
      return;
    }

    console.log('📒 AttendanceLog: subscribing for studentId:', studentId, {
      source: targetStudent?.studentId ? 'studentId' : (targetStudent?.id ? 'id' : 'uid'),
      isAdminView,
      targetStudent: targetStudent ? { 
        studentId: targetStudent.studentId,
        id: targetStudent.id,
        uid: targetStudent.uid,
        firstName: targetStudent.firstName,
        lastName: targetStudent.lastName
      } : null
    });
    // Hardware writes to subcollection: student_attendances/{studentId}/scans
    // The studentId here should be the actual student ID field, not the document ID
    const attendanceRef = collection(db, 'student_attendances', String(studentId), 'scans');
    let attendanceQuery;
    try {
      attendanceQuery = query(
        attendanceRef,
        orderBy('timeOfScanned', 'desc')
      );
    } catch (error) {
      console.log('📒 AttendanceLog: orderBy failed, using simple query:', error);
      attendanceQuery = attendanceRef;
    }

    // Try to load from cache first (works offline)
    const loadCachedData = async () => {
      try {
        const cachedData = await getCachedAttendanceLogs(studentId);
        if (cachedData && Array.isArray(cachedData.logs)) {
          setLogs(cachedData.logs || []);
          calculateStats(cachedData.logs || []);
          // If offline, use cached data and return early
          if (!isConnected) {
            console.log('📴 Offline mode - using cached attendance logs');
            return;
          }
        }
      } catch (error) {
        console.log('Error loading cached attendance logs:', error);
      }
    };
    
    loadCachedData();
    
    // Only set up real-time listener if online
    if (!isConnected) {
      return;
    }
    
    const unsubscribe = onSnapshot(
      attendanceQuery,
      snapshot => {
        console.log('📒 AttendanceLog: snapshot received, size:', snapshot.size);
        const data = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
        if (data.length) {
          console.log('📒 AttendanceLog: first doc:', { id: data[0].id, ...data[0] });
        }
        setLogs(data || []);
        calculateStats(data || []);
        
        // Cache the data for offline access
        try {
          cacheAttendanceLogs(studentId, { logs: data || [] });
        } catch (cacheError) {
          console.log('Error caching attendance logs:', cacheError);
        }
      },
      error => {
        console.error('❌ AttendanceLog: subscription error:', error?.message || error);
        // Don't show network error modal during navigation/offline mode
      }
    );

    return () => {
      try { unsubscribe?.(); } catch {}
    };
  }, [targetStudent, isFocused, isAdminView, isConnected]);

  // Re-render at midnight without modifying Firestore
  useEffect(() => {
    const now = new Date();
    const nextMidnight = new Date(now);
    nextMidnight.setHours(24, 0, 0, 0);
    const ms = nextMidnight.getTime() - now.getTime();
    const id = setTimeout(() => setMidnightTick(t => t + 1), ms);
    return () => clearTimeout(id);
  }, [midnightTick]);

  // Load today's schedule count
  useEffect(() => {
    const loadTodayScheduleCount = async () => {
      const studentId = targetStudent?.studentId || targetStudent?.id;
      if (!studentId) {
        setTodayScheduleCount(0);
        setScheduleLoading(false);
        return;
      }
      
      setScheduleLoading(true);
      try {
        const today = new Date().toLocaleDateString('en-US', { weekday: 'long' });
        const schedRef = doc(db, 'schedules', String(studentId));
        const schedSnap = await getDoc(schedRef);
        
        let count = 0;
        if (schedSnap.exists()) {
          const data = schedSnap.data();
          const subjectsMap = data?.subjects || {};
          
          // Count schedules for today
          Object.keys(subjectsMap).forEach(subject => {
            const entries = Array.isArray(subjectsMap[subject]) ? subjectsMap[subject] : [];
            const todayEntries = entries.filter(entry => entry.day === today);
            count += todayEntries.length;
          });
        }
        
        setTodayScheduleCount(count);
      } catch (error) {
        console.log('Error loading today\'s schedule:', error);
        setTodayScheduleCount(0);
      } finally {
        setScheduleLoading(false);
      }
    };
    
    if (isFocused) loadTodayScheduleCount();
  }, [isFocused, user?.studentId]);

  // Load announcements count
  useEffect(() => {
    const loadAnnouncementsCount = async () => {
      setAnnouncementsLoading(true);
      try {
        const announcementsRef = collection(db, 'announcements');
        const announcementsSnap = await getDocs(announcementsRef);
        setAnnouncementsCount(announcementsSnap.size);
      } catch (error) {
        console.error('Error loading announcements count:', error);
        // Don't show network error modal during navigation/offline mode
        setAnnouncementsCount(0);
      } finally {
        setAnnouncementsLoading(false);
      }
    };
    
    if (isFocused) loadAnnouncementsCount();
  }, [isFocused]);

  const calculateStats = (attendanceData) => {
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const getDate = (log) => {
      const ts = log?.timeOfScanned ?? log?.timestamp;
      return ts?.toDate?.() ? ts.toDate() : new Date(ts);
    };

    const onlyIns = attendanceData.filter(log => log?.entry === 'IN');

    // Get today's date at midnight for comparison
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);

    const today = onlyIns.filter(log => {
      const logDate = getDate(log);
      return logDate && logDate >= todayStart;
    }).length;

    const thisWeek = onlyIns.filter(log => getDate(log) >= weekAgo).length;

    const thisMonth = onlyIns.filter(log => getDate(log) >= monthAgo).length;

    setStats({
      today,
      thisWeek,
      thisMonth,
    });
  };

  const onRefresh = async () => {
    setRefreshing(true);
    // No manual fetch needed due to real-time subscription; just briefly show refresh UI
    setTimeout(() => setRefreshing(false), 400);
  };

  // Hide student tab while focused and restore on blur
  useFocusEffect(
    React.useCallback(() => {
      const parent = navigation.getParent?.();
      if (parent) parent.setOptions({ tabBarStyle: { display: 'none' } });
      return () => {};
    }, [navigation])
  );

  // Monitor network connectivity for offline banner
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => {
      setShowOfflineBanner(!state.isConnected);
    });
    return () => unsubscribe();
  }, []);

  const formatDate = (timestamp) => {
    try {
      if (!timestamp) return 'Invalid Date';
      
      let date;
      if (timestamp?.toDate && typeof timestamp.toDate === 'function') {
        date = timestamp.toDate();
      } else if (timestamp instanceof Date) {
        date = timestamp;
      } else if (typeof timestamp === 'string' || typeof timestamp === 'number') {
        date = new Date(timestamp);
      } else {
        return 'Invalid Date';
      }
      
      // Check if the date is valid
      if (isNaN(date.getTime())) {
        return 'Invalid Date';
      }
      
      return date.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      });
    } catch (error) {
      console.warn('Error formatting date:', error);
      return 'Invalid Date';
    }
  };

  const formatTime = (timestamp) => {
    try {
      if (!timestamp) return 'Invalid Time';
      
      let date;
      if (timestamp?.toDate && typeof timestamp.toDate === 'function') {
        date = timestamp.toDate();
      } else if (timestamp instanceof Date) {
        date = timestamp;
      } else if (typeof timestamp === 'string' || typeof timestamp === 'number') {
        date = new Date(timestamp);
      } else {
        return 'Invalid Time';
      }
      
      // Check if the date is valid
      if (isNaN(date.getTime())) {
        return 'Invalid Time';
      }
      
      return date.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch (error) {
      console.warn('Error formatting time:', error);
      return 'Invalid Time';
    }
  };

  const renderStatsCard = (title, value, subtitle, icon, color) => (
    <View style={[styles.statsCard, { borderLeftColor: color }]}> 
      <View style={styles.statsContent}>
        <View style={styles.statsHeader}>
          <Ionicons name={icon} size={20} color={color} />
          <Text style={styles.statsTitle}>{title}</Text>
        </View>
        <Text style={[styles.statsValue, { color }]}>{value}</Text>
        <Text style={styles.statsSubtitle}>{subtitle}</Text>
      </View>
    </View>
  );

  const renderLogItem = ({ item, index }) => {
    const ts = item.timeOfScanned ?? item.timestamp;
    const time = formatTime(ts);
    const date = formatDate(ts);
    
    const type = item?.entry === 'IN' ? 'IN' : 'OUT';
    const scanLocation = item?.scanLocation || 'Unknown Location';
    const scannerDeviceId = item?.scannerDeviceId || 'Unknown Device';
    
    const typeColor = type === 'IN' ? '#10B981' : '#EF4444';
    const iconBg = type === 'IN' ? '#ECFDF5' : '#FEE2E2';
    const rowBg = type === 'IN' ? '#ECFDF5' : '#FEE2E2';
    
    return (
      <View style={[styles.itemRow, { backgroundColor: rowBg }]}>
        <View style={styles.itemRowTop}>
          <View style={[styles.itemAvatar, { backgroundColor: iconBg, borderColor: typeColor }]}>
            <Ionicons 
              name={type === 'IN' ? 'enter-outline' : 'exit-outline'} 
              size={14} 
              color={typeColor} 
            />
          </View>
          <View style={styles.itemBody}>
            <Text style={[styles.itemTitle, { color: typeColor }]} numberOfLines={1}>
              {type === 'IN' ? 'Scan IN' : 'Scan OUT'}
            </Text>
            <Text style={styles.itemMeta} numberOfLines={2}>
              {scanLocation} {scannerDeviceId}
            </Text>
          </View>
          <View style={styles.itemTimeContainer}>
            <Text style={styles.itemTime}>{time}</Text>
            <Text style={styles.itemDate}>{date}</Text>
          </View>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.wrapper}>
      {isAdminView && <AdminTopHeader />}
      <View style={[styles.bgCircleOne, { zIndex: 0 }]} />
      <View style={[styles.bgCircleTwo, { zIndex: 0 }]} />

      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={true}
      >
        {/* Quick Overview - hidden when viewing all entries */}
        {!showAllEntries && (
          <View style={styles.section}>
            {/* Overview cards */}
            <View style={styles.statsGrid}>
              <View style={[styles.overviewCard, { marginRight: 6 }]}>
                <View style={styles.overviewHeader}>
                  <View style={[styles.overviewIconWrap, { backgroundColor: 'rgba(0,79,137,0.12)' }]}>
                    <Ionicons name="time-outline" size={20} color="#004f89" />
                  </View>
                  <Text style={[styles.overviewSubtitle, { color: '#004f89' }]}>Today</Text>
                </View>
                <Text style={[styles.overviewValue, { color: '#004f89' }]}>{stats.today}</Text>
                <Text style={[styles.overviewLabel, { color: '#004f89' }]}>Today</Text>
              </View>
              <View style={[styles.overviewCard, { marginRight: 6 }]}>
                <View style={styles.overviewHeader}>
                  <View style={[styles.overviewIconWrap, { backgroundColor: 'rgba(0,79,137,0.12)' }]}>
                    <Ionicons name="calendar-outline" size={20} color="#004f89" />
                  </View>
                  <Text style={[styles.overviewSubtitle, { color: '#004f89' }]}>This week</Text>
                </View>
                <Text style={[styles.overviewValue, { color: '#004f89' }]}>{stats.thisWeek}</Text>
                <Text style={[styles.overviewLabel, { color: '#004f89' }]}>This Week</Text>
              </View>
              <View style={styles.overviewCard}>
                <View style={styles.overviewHeader}>
                  <View style={[styles.overviewIconWrap, { backgroundColor: 'rgba(0,79,137,0.12)' }]}>
                    <Ionicons name="trending-up-outline" size={20} color="#004f89" />
                  </View>
                  <Text style={[styles.overviewSubtitle, { color: '#004f89' }]}>This month</Text>
                </View>
                <Text style={[styles.overviewValue, { color: '#004f89' }]}>{stats.thisMonth}</Text>
                <Text style={[styles.overviewLabel, { color: '#004f89' }]}>This Month</Text>
              </View>
            </View>
          </View>
        )}

        {/* Attendance Logs Section */}
        <View style={[styles.section, styles.recentActivitySection]}>
          {/* Title Header Container */}
          <View style={[styles.titleContainer, showAllEntries && styles.titleContainerAllEntries]}>
            <Text style={styles.sectionTitle}>{showAllEntries ? 'All Entries' : 'Recent Activity'}</Text>
          </View>
          
          {/* Separator */}
          <View style={styles.separator} />

          {showAllEntries ? (
            // All Entries mode
            logs.length > 0 ? (
              <View style={styles.logsListContent}>
                {logs.map((item, index) => (
                  <View key={`${item.id}_${index}`}>
                    {renderLogItem({ item, index })}
                  </View>
                ))}
              </View>
            ) : (
              <View style={[styles.centerContainer, styles.allEntriesCenterContainer]}>
                <View style={styles.emptyCard}>
                  <View style={styles.emptyIconWrap}>
                    <View style={styles.iconContainer}>
                      <Ionicons name="checkmark-done-outline" size={28} color="#2563EB" />
                      <View style={styles.diagonalSlash} />
                    </View>
                  </View>
                  <Text style={styles.emptyTitle}>No Entries</Text>
                  <Text style={styles.emptySubtext}>
                    Attendance entries will appear here after your next scan.
                  </Text>
                </View>
              </View>
            )
          ) : (
            // Recent Activity mode - show logs if any
            logs.filter(item => {
              const ts = item?.timeOfScanned ?? item?.timestamp;
              const d = ts?.toDate?.() || new Date(ts);
              return d?.toDateString?.() === currentDayKey;
            }).length > 0 ? (
              <View style={styles.logsListContent}>
                {logs.filter(item => {
                  const ts = item?.timeOfScanned ?? item?.timestamp;
                  const d = ts?.toDate?.() || new Date(ts);
                  return d?.toDateString?.() === currentDayKey;
                }).map((item, index) => (
                  <View key={`${item.id}_${index}`}>
                    {renderLogItem({ item, index })}
                  </View>
                ))}
              </View>
            ) : null
          )}
        </View>

        {/* No Recent Activity - Separate container, only for Recent Activity mode */}
        {!showAllEntries && logs.filter(item => {
          const ts = item?.timeOfScanned ?? item?.timestamp;
          const d = ts?.toDate?.() || new Date(ts);
          return d?.toDateString?.() === currentDayKey;
        }).length === 0 && (
          <View style={styles.centerContainer}>
            <View style={styles.emptyCard}>
              <View style={styles.emptyIconWrap}>
                <View style={styles.iconContainer}>
                  <Ionicons name="checkmark-done-outline" size={28} color="#2563EB" />
                  <View style={styles.diagonalSlash} />
                </View>
              </View>
              <Text style={styles.emptyTitle}>No Activity Today</Text>
              <Text style={styles.emptySubtext}>
                Today's attendance activity will appear here after your next scan.
              </Text>
            </View>
          </View>
        )}
        
      </ScrollView>
      
      {/* Toggle Button - Fixed at bottom */}
      <TouchableOpacity
        style={styles.toggleAllButton}
        onPress={() => setShowAllEntries(v => !v)}
      >
        <Text style={styles.toggleAllButtonText}>{showAllEntries ? 'See today' : 'All Entries'}</Text>
      </TouchableOpacity>
      <OfflineBanner visible={showOfflineBanner} />
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  scrollView: {
    flex: 1,
  },
  container: { 
    flexGrow: 1,
    backgroundColor: '#F9FAFB',
    padding: 16, 
    paddingBottom: 80, 
    paddingTop: 16
  },
  logsListContent: {
    paddingBottom: 12,
    borderRadius: 8,
  },
  pageTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 12,
    textAlign: 'center',
    paddingTop: 12,
  },
  statsSection: {
    marginBottom: 24,
  },
  statsGrid: {
    flexDirection: 'row',
    gap: 0,
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
    paddingHorizontal: 0,
    marginTop: -4,
    marginBottom: 4,
  },
  overviewCard: {
    flex: 1,
    minWidth: 0,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'flex-start',
    justifyContent: 'flex-start',
    overflow: 'hidden',
    marginTop: 0,
    marginBottom: 0,
    minHeight: 110,
    backgroundColor: '#FFFFFF',
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
    marginBottom: 8,
    flexWrap: 'wrap',
  },
  overviewIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  overviewSubtitle: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.2,
    flexShrink: 1,
    flexGrow: 1,
    minWidth: 0,
  },
  overviewValue: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 3,
    letterSpacing: -0.5,
  },
  overviewLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1F2937',
  },
  statsContent: {
    flex: 1,
  },
  statsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  statsTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6B7280',
    marginLeft: 6,
  },
  statsValue: {
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 4,
  },
  statsSubtitle: {
    fontSize: 11,
    color: '#9CA3AF',
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  section: { marginTop: 0, marginBottom: 2 },
  recentActivitySection: {
    marginBottom: -11,
  },
  titleContainer: {
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingHorizontal: 8,
    paddingTop: 0,
    paddingBottom: 6,
    marginTop: 2,
    marginBottom: 0,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 3,
  },
  titleContainerAllEntries: {
    marginTop: -8,
    marginBottom: 0,
    paddingBottom: 4,
  },
  separator: {
    height: 1,
    backgroundColor: '#E5E7EB',
    marginTop: 6,
    marginBottom: 6,
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
    marginTop: 0,
  },
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
  sectionTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#0078cf',
    marginRight: 8,
    marginBottom: 5,
    marginTop: 10,
  },
  smallSectionTitle: {
    fontSize: 30,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 16,
  },
  filterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
  },
  filterText: {
    fontSize: 12,
    color: '#6B7280',
    marginLeft: 4,
    fontWeight: '500',
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 0, 0, 0.05)',
  },
  itemRowTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    width: '100%',
  },
  itemAvatar: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
    borderWidth: 1,
  },
  itemBody: {
    flex: 1,
  },
  itemTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#111827',
  },
  itemMeta: {
    fontSize: 11,
    color: '#6B7280',
    marginTop: 1,
  },
  itemTimeContainer: {
    alignItems: 'flex-end',
    marginLeft: 6,
    justifyContent: 'flex-start',
  },
  itemTime: {
    fontSize: 10,
    color: '#6B7280',
    marginBottom: 2,
  },
  itemDate: {
    fontSize: 9,
    color: '#9CA3AF',
  },
  centerContainer: { 
    flex: 1, 
    alignItems: 'center', 
    justifyContent: 'center', 
    marginTop: 8,
    minHeight: 300,
  },
  allEntriesCenterContainer: {
    marginTop: 60,
    minHeight: 400,
  },
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
  iconContainer: {
    position: 'relative',
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  diagonalSlash: {
    position: 'absolute',
    width: 32,
    height: 2,
    backgroundColor: '#2563EB',
    transform: [{ rotate: '45deg' }],
  },
  emptyTitle: { 
    fontSize: 16, 
    fontWeight: '700', 
    color: '#111827', 
    marginTop: 0, 
    marginBottom: 4 
  },
  emptySubtext: { 
    fontSize: 12, 
    color: '#6B7280', 
    textAlign: 'center', 
    lineHeight: 16, 
    marginBottom: 12 
  },
  // Modal styles (copied from dashboards)
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
  // Decorative background shapes for a subtle modern look
  bgCircleOne: {
    position: 'absolute',
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: 'rgba(0,79,137,0.08)',
    top: -80,
    left: -60,
  },
  bgCircleTwo: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: 'rgba(16,185,129,0.08)',
    top: 120,
    right: -40,
  },
  toggleAllButton: {
    position: 'absolute',
    bottom: 16,
    left: 16,
    right: 16,
    paddingHorizontal: 0,
    paddingVertical: 12,
    backgroundColor: '#004f89',
    borderRadius: 8,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
  },
  toggleAllButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.3,
    textAlign: 'center',
  },
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
});

export default AttendanceLog;








