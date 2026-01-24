import React, { useEffect, useState, useContext, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  TouchableOpacity,
  Dimensions,
  Modal,
  Alert,
  ScrollView,
  Image,
} from 'react-native';
import { useNavigation, useIsFocused, useFocusEffect } from '@react-navigation/native';
import { PARENT_TAB_BAR_STYLE } from '../../navigation/tabStyles';
import { Ionicons } from '@expo/vector-icons';
import { AuthContext } from '../../contexts/AuthContext';
import { NetworkContext } from '../../contexts/NetworkContext';
import { collection, query, where, orderBy, onSnapshot, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '../../utils/firebaseConfig';
import { cacheAttendanceLogs, getCachedAttendanceLogs, getCachedLinkedStudents, cacheLinkedStudents } from '../../offline/storage';
import useNetworkMonitor from '../../hooks/useNetworkMonitor';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { wp, hp, fontSizes } from '../../utils/responsive';
import OfflineBanner from '../../components/OfflineBanner';
import NetInfo from '@react-native-community/netinfo';

const { width } = Dimensions.get('window');

// AttendanceLog screen for Parent role
// Mirrors Student/AttendanceLog but scopes to selected linked student
const AttendanceLog = () => {
  const { user, logout } = useContext(AuthContext);
  const networkContext = useContext(NetworkContext);
  const isConnectedFromContext = networkContext?.isConnected ?? true;
  const navigation = useNavigation();
  const isFocused = useIsFocused();
  const isConnectedMonitor = useNetworkMonitor();
  const isConnected = isConnectedFromContext && isConnectedMonitor;

  useFocusEffect(
    React.useCallback(() => {
      const parent = navigation.getParent?.();
      if (parent) parent.setOptions({ tabBarStyle: { display: 'none' } });
      return () => {
        try {
          const p = navigation.getParent?.();
          if (p) p.setOptions({ tabBarStyle: PARENT_TAB_BAR_STYLE });
        } catch {}
        // Reset to normal state when navigating away
        setShowAllEntries(false);
      };
    }, [navigation])
  );

  const [linkedStudents, setLinkedStudents] = useState([]);
  const [selectedStudentId, setSelectedStudentId] = useState(null);
  const [selectedStudentName, setSelectedStudentName] = useState('');
  const [selectedStudentDocId, setSelectedStudentDocId] = useState(null);
  const [todayScheduleCount, setTodayScheduleCount] = useState(0);
  const [announcementsCount, setAnnouncementsCount] = useState(0);
  const [scheduleLoading, setScheduleLoading] = useState(true);
  const [announcementsLoading, setAnnouncementsLoading] = useState(true);

  const [logs, setLogs] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [profilePic, setProfilePic] = useState(null);
  const [stats, setStats] = useState({ today: 0, thisWeek: 0, thisMonth: 0 });
  // Tick to force re-render at midnight so today's section clears automatically
  const [midnightTick, setMidnightTick] = useState(0);
  const currentDayKey = useMemo(() => new Date().toDateString(), [midnightTick]);

  const [logoutVisible, setLogoutVisible] = useState(false);
  const [showAllEntries, setShowAllEntries] = useState(false);
  const [showOfflineBanner, setShowOfflineBanner] = useState(false);

  // Load profile picture
  useEffect(() => {
    const loadProfilePic = async () => {
      try {
        const savedProfile = await AsyncStorage.getItem('profilePic');
        if (savedProfile) setProfilePic({ uri: savedProfile });
        else setProfilePic(null);
      } catch (error) {
        // ignore
      }
    };
    if (isFocused) loadProfilePic();
  }, [isFocused]);

  // Load linked students for the parent
  useEffect(() => {
    const loadLinks = async () => {
      console.log('📊 PARENT ATTENDANCE: Loading links for user:', user?.uid, 'parentId:', user?.parentId);
      if (!user?.uid) { 
        console.log('📊 PARENT ATTENDANCE: No user UID, clearing students');
        setLinkedStudents([]); 
        setSelectedStudentId(null); 
        return; 
      }
      
      // Always try to load cached data first (for immediate display)
      try {
        const cachedLinkedStudents = await getCachedLinkedStudents(user.uid);
        if (cachedLinkedStudents && Array.isArray(cachedLinkedStudents) && cachedLinkedStudents.length > 0) {
          const formatted = cachedLinkedStudents.map(s => ({
            id: s.studentId || s.id,
            studentIdNumber: s.studentIdNumber || s.studentId || '',
            name: s.studentName || s.firstName || 'Student',
            relationship: s.relationship || '',
          }));
          setLinkedStudents(formatted);
          if (formatted.length > 0) {
            const firstStudent = formatted[0];
            const attendanceDocId = firstStudent.studentIdNumber || firstStudent.id;
            setSelectedStudentId(firstStudent.id);
            setSelectedStudentName(firstStudent.name || 'Student');
            setSelectedStudentDocId(attendanceDocId);
            console.log('✅ Linked students loaded from cache');
          }
          // If offline, use cached data and return early
          if (!isConnected) {
            return;
          }
        }
      } catch (error) {
        console.log('Error loading cached linked students:', error);
      }
      
      // Only fetch from Firestore if online
      if (!isConnected) {
        return;
      }
      
      try {
        const canonicalId = String(user?.parentId || '').trim();
        const qUid = query(
          collection(db, 'parent_student_links'),
          where('parentId', '==', user.uid),
          where('status', '==', 'active')
        );
        const qCanonical = canonicalId && canonicalId.includes('-')
          ? query(collection(db, 'parent_student_links'), where('parentIdNumber', '==', canonicalId), where('status', '==', 'active'))
          : null;
        const [snap1, snap2] = await Promise.all([getDocs(qUid), qCanonical ? getDocs(qCanonical) : Promise.resolve({ docs: [] })]);
        console.log('📊 PARENT ATTENDANCE: Query results - snap1:', snap1.size, 'snap2:', snap2.size);
        const seen = new Set();
        const students = [];
        const collect = async (docs) => {
          for (const d of docs) {
            const x = d.data() || {};
            const sid = String(x.studentId || '').trim();
            if (!sid || seen.has(sid)) continue;
            seen.add(sid);
            
            // Get canonical student ID - prefer from link, otherwise fetch from user document
            let canonicalId = String(x.studentIdNumber || '').trim();
            if (!canonicalId) {
              try {
                const userDocRef = doc(db, 'users', sid);
                const userDocSnap = await getDoc(userDocRef);
                if (userDocSnap.exists()) {
                  const userData = userDocSnap.data();
                  canonicalId = String(userData.studentId || userData.studentID || userData.studentIdNumber || userData.studentNumber || userData.lrn || '').trim();
                }
              } catch (err) {
                console.log('📊 PARENT ATTENDANCE: Error fetching user doc for canonical ID:', err);
              }
            }
            
            students.push({
              id: sid,
              studentIdNumber: canonicalId,
              name: x.studentName || 'Student',
              relationship: x.relationship || '',
            });
          }
        };
        await collect(snap1.docs);
        await collect(snap2.docs);
        console.log('📊 PARENT ATTENDANCE: Loaded linked students:', students);
        setLinkedStudents(students);
        if (students.length > 0) {
          const firstStudent = students[0];
          console.log('📊 PARENT ATTENDANCE: Setting first student:', firstStudent);
          // Prefer canonical studentIdNumber for attendance lookup, fallback to id (UID)
          const attendanceDocId = firstStudent.studentIdNumber || firstStudent.id;
          setSelectedStudentId(firstStudent.id);
          setSelectedStudentName(firstStudent.name || 'Student');
          setSelectedStudentDocId(attendanceDocId);
          console.log('📊 PARENT ATTENDANCE: Using attendanceDocId:', attendanceDocId, 'studentIdNumber:', firstStudent.studentIdNumber, 'id:', firstStudent.id);
        }
        
        // Cache linked students for offline access
        try {
          const studentsForCache = students.map(s => ({
            studentId: s.id,
            studentIdNumber: s.studentIdNumber,
            studentName: s.name,
            relationship: s.relationship,
            linkedAt: new Date().toISOString()
          }));
          await cacheLinkedStudents(user.uid, studentsForCache);
        } catch (error) {
          console.log('Error caching linked students:', error);
        }
      } catch (error) {
        console.error('Error loading linked students:', error);
        setLinkedStudents([]);
        setSelectedStudentId(null);
      }
    };
    loadLinks();
  }, [user?.uid, user?.parentId, isConnected]);

  // Load today's schedule count for selected student
  useEffect(() => {
    const loadTodayScheduleCount = async () => {
      if (!selectedStudentDocId) {
        setTodayScheduleCount(0);
        setScheduleLoading(false);
        return;
      }
      
      setScheduleLoading(true);
      try {
        const today = new Date().toLocaleDateString('en-US', { weekday: 'long' });
        const schedRef = doc(db, 'schedules', String(selectedStudentDocId));
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
        console.error('Error loading today\'s schedule:', error);
        setTodayScheduleCount(0);
      } finally {
        setScheduleLoading(false);
      }
    };
    
    if (isFocused) loadTodayScheduleCount();
  }, [isFocused, selectedStudentDocId]);

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
        setAnnouncementsCount(0);
      } finally {
        setAnnouncementsLoading(false);
      }
    };
    
    if (isFocused) loadAnnouncementsCount();
  }, [isFocused]);

  // Subscribe to attendance logs for selected student
  useEffect(() => {
    if (!selectedStudentDocId) { 
      console.log('📊 PARENT ATTENDANCE: No selectedStudentDocId, clearing logs');
      setLogs([]); 
      setStats({ today: 0, thisWeek: 0, thisMonth: 0 }); 
      return; 
    }
    
    // Always try to load from cache first (for immediate display)
    const loadCachedData = async () => {
      try {
        const cachedData = await getCachedAttendanceLogs(selectedStudentDocId);
        if (cachedData && Array.isArray(cachedData.logs)) {
          setLogs(cachedData.logs || []);
          calculateStats(cachedData.logs || []);
          console.log('✅ Attendance logs loaded from cache');
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
    
    console.log('📊 PARENT ATTENDANCE: Subscribing to attendance for studentDocId:', selectedStudentDocId);
    const attendanceRef = collection(db, 'student_attendances', String(selectedStudentDocId), 'scans');
    let attendanceQuery;
    try {
      attendanceQuery = query(attendanceRef, orderBy('timeOfScanned', 'desc'));
    } catch (error) {
      console.log('📊 PARENT ATTENDANCE: orderBy failed, using simple query:', error);
      attendanceQuery = attendanceRef;
    }
    const unsubscribe = onSnapshot(
      attendanceQuery,
      snapshot => {
        console.log('📊 PARENT ATTENDANCE: Snapshot received, size:', snapshot.size);
        const data = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
        if (data.length > 0) {
          console.log('📊 PARENT ATTENDANCE: First log entry:', { id: data[0].id, entry: data[0].entry, timeOfScanned: data[0].timeOfScanned });
        }
        setLogs(data || []);
        calculateStats(data || []);
        
        // Cache the data for offline access
        try {
          cacheAttendanceLogs(selectedStudentDocId, { logs: data || [] });
        } catch (cacheError) {
          console.log('Error caching attendance logs:', cacheError);
        }
      },
      error => {
        console.error('❌ PARENT ATTENDANCE: Subscription error:', error?.message || String(error));
        console.error('❌ PARENT ATTENDANCE: Error details:', {
          code: error?.code,
          message: error?.message,
          studentDocId: selectedStudentDocId
        });
        // Don't show network error modal during navigation/offline mode
        setLogs([]);
        setStats({ today: 0, thisWeek: 0, thisMonth: 0 });
      }
    );
    return () => { 
      try { 
        console.log('📊 PARENT ATTENDANCE: Unsubscribing from attendance for:', selectedStudentDocId);
        unsubscribe?.(); 
      } catch (e) {
        console.log('📊 PARENT ATTENDANCE: Error unsubscribing:', e);
      }
    };
  }, [selectedStudentDocId, isConnected]);

  // Network monitoring
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => {
      const connected = state.isConnected && state.isInternetReachable;
      setShowOfflineBanner(!connected);
    });

    // Check initial network state
    NetInfo.fetch().then(state => {
      const connected = state.isConnected && state.isInternetReachable;
      setShowOfflineBanner(!connected);
    });

    return () => unsubscribe();
  }, []);

  // Re-render at midnight to clear today's activity section (no deletion in Firestore)
  useEffect(() => {
    const now = new Date();
    const nextMidnight = new Date(now);
    nextMidnight.setHours(24, 0, 0, 0);
    const msUntilMidnight = nextMidnight.getTime() - now.getTime();
    const timerId = setTimeout(() => {
      setMidnightTick(t => t + 1);
    }, msUntilMidnight);
    return () => clearTimeout(timerId);
  }, [midnightTick]);

  // Reset to normal state when navigating away
  useEffect(() => {
    const unsub = navigation.addListener('blur', () => {
      setShowAllEntries(false);
    });
    return unsub;
  }, [navigation]);

  const calculateStats = (attendanceData) => {
    try {
      const now = new Date();
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      
      const getDate = (log) => {
        try {
          const ts = log?.timeOfScanned ?? log?.timestamp;
          if (!ts) return null;
          
          let dateObj;
          if (ts?.toDate && typeof ts.toDate === 'function') {
            dateObj = ts.toDate();
          } else if (ts instanceof Date) {
            dateObj = ts;
          } else {
            dateObj = new Date(ts);
          }
          
          // Check if date is valid
          if (isNaN(dateObj.getTime())) return null;
          
          return dateObj;
        } catch (error) {
          console.warn('Error getting date in calculateStats:', error);
          return null;
        }
      };
      
      // Mirror Student AttendanceLog: count only 'IN' scans
      const onlyIns = (attendanceData || []).filter(log => log?.entry === 'IN');
      
      // Get today's date at midnight for comparison
      const todayStart = new Date(now);
      todayStart.setHours(0, 0, 0, 0);
      
      const today = onlyIns.filter(log => {
        const logDate = getDate(log);
        return logDate && logDate >= todayStart;
      }).length;
      
      const thisWeek = onlyIns.filter(log => {
        const logDate = getDate(log);
        return logDate && logDate >= weekAgo;
      }).length;
      const thisMonth = onlyIns.filter(log => {
        const logDate = getDate(log);
        return logDate && logDate >= monthAgo;
      }).length;
      
      setStats({ today, thisWeek, thisMonth });
    } catch (error) {
      console.warn('Error calculating stats:', error);
      setStats({ today: 0, thisWeek: 0, thisMonth: 0 });
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 400);
  };

  const handleLogout = () => { setLogoutVisible(true); };
  const confirmLogout = async () => {
    setLogoutVisible(false);
    try { await logout?.(); } catch {}
  };
  const cancelLogout = () => setLogoutVisible(false);

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
      
      return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
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
      
      return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    } catch (error) {
      console.warn('Error formatting time:', error);
      return 'Invalid Time';
    }
  };

  const todayLogs = useMemo(() => {
    return logs.filter(item => {
      try {
        const ts = item?.timeOfScanned ?? item?.timestamp;
        if (!ts) return false;
        
        let dateObj;
        if (ts?.toDate && typeof ts.toDate === 'function') {
          dateObj = ts.toDate();
        } else if (ts instanceof Date) {
          dateObj = ts;
        } else {
          dateObj = new Date(ts);
        }
        
        // Check if date is valid before comparing
        if (isNaN(dateObj.getTime())) return false;
        
        return dateObj.toDateString() === currentDayKey;
      } catch (error) {
        console.warn('Error filtering date for today in AttendanceLog:', error);
        return false;
      }
    });
  }, [logs, currentDayKey]);

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

  const changeSelectedStudent = (s) => {
    // Prefer canonical studentIdNumber for attendance lookup, fallback to id (UID)
    const attendanceDocId = s.studentIdNumber || s.id;
    setSelectedStudentId(s.id);
    setSelectedStudentName(s.name || 'Student');
    setSelectedStudentDocId(attendanceDocId);
    console.log('📊 PARENT ATTENDANCE: Changed student, using attendanceDocId:', attendanceDocId);
  };

  return (
    <View style={styles.wrapper}>
      <View style={styles.bgCircleOne} />
      <View style={styles.bgCircleTwo} />

      {/* In-screen header removed; unified header is used instead */}

      {/* Sidebar removed */}


      {/* Logout Confirmation Modal */}
      <Modal transparent animationType="fade" visible={logoutVisible} onRequestClose={cancelLogout}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={[styles.modalIconWrap, { backgroundColor: '#FEE2E2' }]}>
              <Ionicons name="log-out-outline" size={28} color="#b91c1c" />
            </View>
            <Text style={styles.modalTitle}>Logout</Text>
            <Text style={styles.modalText}>Are you sure you want to logout?</Text>
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalButton} onPress={cancelLogout}>
                <Text style={styles.modalButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalButton, styles.modalButtonDanger]} onPress={confirmLogout}>
                <Text style={[styles.modalButtonText, styles.modalButtonDangerText]}>Logout</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={true}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={['#2563EB']}
            tintColor="#2563EB"
          />
        }
      >
        {/* Empty state when no linked students */}
        {linkedStudents.length === 0 ? (
          <View style={styles.centerContainer}>
            <View style={styles.emptyCard}>
              <View style={styles.emptyIconWrap}>
                <View style={styles.iconContainer}>
                  <Ionicons name="checkmark-done-outline" size={28} color="#2563EB" />
                  <View style={styles.diagonalSlash} />
                </View>
              </View>
              <Text style={styles.emptyTitle}>Attendance Unavailable</Text>
              <Text style={styles.emptySubtext}>
                Link your student to view attendance logs. Entries will appear here after linking.
              </Text>
            </View>
          </View>
        ) : (
        <>
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

            {/* Student Selection Buttons */}
            {linkedStudents.length > 0 && (
              <View style={styles.studentSelectionContainer}>
                <View style={styles.chipsWrap}>
                  {linkedStudents.map((student, index) => {
                    const firstName = student.name ? student.name.split(' ')[0] : 'Student';
                    const isLast = index === linkedStudents.length - 1;
                    return (
                      <TouchableOpacity
                        key={student.id}
                        style={[styles.childChip, selectedStudentId === student.id ? styles.childChipActive : null, isLast && styles.childChipLast]}
                        onPress={() => changeSelectedStudent(student)}
                      >
                        <Text style={[styles.childChipText, selectedStudentId === student.id ? styles.childChipTextActive : null]} numberOfLines={1} ellipsizeMode="tail">
                          {firstName}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            )}
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
              <View style={[styles.centerContainer, styles.allEntriesEmptyContainer]}>
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
            todayLogs.length > 0 ? (
              <View style={styles.logsListContent}>
                {todayLogs.map((item, index) => (
                  <View key={`${item.id}_${index}`}>
                    {renderLogItem({ item, index })}
                  </View>
                ))}
              </View>
            ) : null
          )}
        </View>

        {/* No Recent Activity - Separate container, only for Recent Activity mode */}
        {!showAllEntries && todayLogs.length === 0 && (
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
        </>
        )}
      </ScrollView>
      
      {/* Toggle Button - Fixed at bottom */}
      {linkedStudents.length > 0 && (
      <TouchableOpacity
        style={styles.toggleAllButton}
        onPress={() => setShowAllEntries(v => !v)}
      >
        <Text style={styles.toggleAllButtonText}>{showAllEntries ? 'See today' : 'All Entries'}</Text>
      </TouchableOpacity>
      )}
      
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
  allEntriesEmptyContainer: {
    marginTop: 150,
    minHeight: 200,
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
  modalCard: { backgroundColor: '#fff', borderRadius: 16, padding: 24, width: '85%', maxWidth: 400, alignItems: 'center' },
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
  chipsWrap: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  childChip: { 
    flex: 1,
    marginRight: 8,
    marginBottom: 8,
    height: 24, 
    paddingHorizontal: 4, 
    paddingVertical: 2, 
    borderRadius: 6, 
    backgroundColor: '#F3F4F6', 
    borderWidth: 1, 
    borderColor: '#E5E7EB', 
    alignItems: 'center',
    justifyContent: 'center',
  },
  childChipActive: { 
    backgroundColor: '#004f89', 
    borderColor: '#004f89' 
  },
  childChipText: { 
    fontSize: 10, 
    fontWeight: '600', 
    color: '#374151',
    textAlign: 'center',
  },
  childChipTextActive: { 
    color: '#FFFFFF' 
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
  childChipLast: {
    marginRight: 0,
  },
  studentSelectionContainer: {
    marginTop: 12,
  },
});

export default AttendanceLog;


