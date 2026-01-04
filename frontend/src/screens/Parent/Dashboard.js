import React, { useContext, useEffect, useMemo, useState } from 'react';
import ErrorBoundary from '../../components/ErrorBoundary';
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
  FlatList,
  RefreshControl,
} from 'react-native';
import { useNavigation, useIsFocused } from '@react-navigation/native';
import { AuthContext } from '../../contexts/AuthContext';
import { Ionicons } from '@expo/vector-icons';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { collection, query, where, getDocs, doc, getDoc, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '../../utils/firebaseConfig';
import { getNetworkErrorMessage } from '../../utils/networkErrorHandler';
import { wp, hp, fontSizes, responsiveStyles, getResponsiveDimensions } from '../../utils/responsive';

const { width } = Dimensions.get('window');
const dimensions = getResponsiveDimensions();
const UPCOMING_CARD_HEIGHT = 152;

const Dashboard = () => {
  const { user, logout } = useContext(AuthContext);
  const navigation = useNavigation();
  const isFocused = useIsFocused();

  const [profilePic, setProfilePic] = useState(null);
  const [logoutVisible, setLogoutVisible] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [students, setStudents] = useState([]);
  const [studentsLoading, setStudentsLoading] = useState(true);
  const [todayScheduleCount, setTodayScheduleCount] = useState(0);
  const [scheduleLoading, setScheduleLoading] = useState(true);
  const [ongoingClassesCount, setOngoingClassesCount] = useState(0);
  const [ongoingLoading, setOngoingLoading] = useState(true);
  const [allLogs, setAllLogs] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [midnightTick, setMidnightTick] = useState(0);
  const [upcomingByStudent, setUpcomingByStudent] = useState({});
  const [latestEvents, setLatestEvents] = useState([]);
  const [upcomingIndex, setUpcomingIndex] = useState(0);
  const [upcomingContainerWidth, setUpcomingContainerWidth] = useState(width - 56);
  const [isLandscape, setIsLandscape] = useState(dimensions.isLandscape);
  const [networkErrorVisible, setNetworkErrorVisible] = useState(false);
  const [networkErrorTitle, setNetworkErrorTitle] = useState('');
  const [networkErrorMessage, setNetworkErrorMessage] = useState('');
  const [networkErrorColor, setNetworkErrorColor] = useState('#DC2626');

  const scannedInTodayCount = useMemo(() => {
    if (!Array.isArray(allLogs) || allLogs.length === 0) return 0;
    const uniqueStudentIds = new Set();
    allLogs.forEach((log) => {
      try {
        const entryValue = String(log?.entry ?? log?.Entry ?? '').trim().toUpperCase();
        if (entryValue === 'IN') {
          const studentId = String(log?._studentId ?? '').trim();
          if (studentId) uniqueStudentIds.add(studentId);
        }
      } catch {}
    });
    return uniqueStudentIds.size;
  }, [allLogs]);

  useEffect(() => {
    const handleOrientationChange = ({ window }) => {
      try {
        setIsLandscape(window.width > window.height);
      } catch {}
    };

    let subscription;
    try {
      if (typeof Dimensions.addEventListener === 'function') {
        subscription = Dimensions.addEventListener('change', handleOrientationChange);
      } else {
        Dimensions.addEventListener?.('change', handleOrientationChange);
      }
    } catch {}

    return () => {
      try {
        if (subscription?.remove) {
          subscription.remove();
        } else if (typeof Dimensions.removeEventListener === 'function') {
          Dimensions.removeEventListener('change', handleOrientationChange);
        }
      } catch {}
    };
  }, []);

  const parentCardPalette = {
    cardBg: '#FFFFFF',
    borderColor: '#E5E7EB',
    iconBg: 'rgba(0,79,137,0.12)',
    accentColor: '#004f89', // matches universal top header
    haloColor: 'transparent',
    badgeBg: '#004f89', // header color background
    badgeTextColor: '#FFFFFF', // white text on header-colored badge
    textColor: '#004f89', // primary numbers/text match header color
    labelColor: '#004f89', // titles match header color
  };

  const quickOverviewCards = [
    {
      key: 'linkedStudents',
      title: 'Linked Students',
      subtitle: 'Connected profiles',
      value: students.length,
      loading: false,
      badgeText: students.length > 0 ? `${students.length} linked` : 'Link a student',
      palette: parentCardPalette,
      renderIcon: () => <Ionicons name="school-outline" size={22} color={parentCardPalette.accentColor} />,
    },
    {
      key: 'firstDayScans',
      title: 'Entry Scan-Ins',
      subtitle: 'First-day arrivals',
      value: scannedInTodayCount,
      loading: false,
      badgeText:
        students.length === 0
          ? 'No students linked'
          : scannedInTodayCount === students.length
            ? 'All accounted for'
            : `${scannedInTodayCount}/${students.length} checked in`,
      palette: parentCardPalette,
      renderIcon: () => <Ionicons name="log-in-outline" size={22} color={parentCardPalette.accentColor} />,
    },
  ];

  // Sidebar animation - responsive
  const sidebarWidth = Math.min(wp(75), 300);
  const sidebarAnimRight = useState(new Animated.Value(-sidebarWidth))[0];

  // Load profile picture using same key as Parent/Profile; refresh on focus
  useEffect(() => {
    const loadProfilePic = async () => {
      setLoading(true);
      try {
        if (!user?.parentId) { setProfilePic(null); return; }
        const savedProfile = await AsyncStorage.getItem(`parentProfilePic_${user.parentId}`);
        setProfilePic(savedProfile ? { uri: savedProfile } : null);
      } catch (error) {
        console.log('Error loading profile pic:', error);
        setProfilePic(null);
      } finally {
        setLoading(false);
      }
    };
    if (isFocused) loadProfilePic();
  }, [isFocused, user?.parentId]);

  // Load connected students from Firestore using same approach as LinkStudents.js
  useEffect(() => {
    const loadStudents = async () => {
      if (!user?.uid) { 
        setStudents([]); 
        setStudentsLoading(false);
        return; 
      }
      setStudentsLoading(true);
      try {
        console.log('Loading linked students for parent:', user.uid);
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
        const seen = new Set();
        const collected = [];
        const collect = (docs) => {
          docs.forEach(d => {
            const linkData = d.data() || {};
            const sid = String(linkData.studentId || '').trim();
            if (!sid || seen.has(sid)) return;
            seen.add(sid);
            collected.push({
              id: sid,
              firstName: linkData.studentName || '',
              lastName: '',
              studentId: linkData.studentIdNumber || '',
              relationship: linkData.relationship,
              linkedAt: linkData.linkedAt || new Date().toISOString()
            });
          });
        };
        collect(snap1.docs);
        collect(snap2.docs);
        console.log('Collected students:', collected);
        setStudents(collected);
      } catch (error) {
        console.error('Error loading students:', error);
        // Only show network error modal for actual network errors
        if (error?.code?.includes('unavailable') || error?.code?.includes('network') || error?.message?.toLowerCase().includes('network')) {
          const errorInfo = getNetworkErrorMessage({ type: 'unstable_connection', message: error.message });
          setNetworkErrorTitle(errorInfo.title);
          setNetworkErrorMessage(errorInfo.message);
          setNetworkErrorColor(errorInfo.color);
          setNetworkErrorVisible(true);
          setTimeout(() => setNetworkErrorVisible(false), 5000);
        }
        setStudents([]);
      } finally {
        setStudentsLoading(false);
      }
    };
    if (isFocused) loadStudents();
  }, [isFocused, user?.uid, user?.parentId]);

  // Load today's schedule count for all linked students
  useEffect(() => {
    const loadTodayScheduleCount = async () => {
      if (!user?.uid || students.length === 0) { 
        setTodayScheduleCount(0); 
        setScheduleLoading(false);
        return; 
      }
      setScheduleLoading(true);
      try {
        console.log('Loading today\'s schedules for students:', students);
        
        const today = new Date().toLocaleDateString('en-US', { weekday: 'long' });
        let totalCount = 0;
        
        for (const student of students) {
          try {
            const studentIdNumber = student.studentId;
            if (studentIdNumber) {
              const schedRef = doc(db, 'schedules', studentIdNumber);
              const schedSnap = await getDoc(schedRef);
            
              if (schedSnap.exists()) {
                const data = schedSnap.data();
                const subjectsMap = data?.subjects || {};
                
                // Count schedules for today
                Object.keys(subjectsMap).forEach(subject => {
                  const entries = Array.isArray(subjectsMap[subject]) ? subjectsMap[subject] : [];
                  const todayEntries = entries.filter(entry => entry.day === today);
                  totalCount += todayEntries.length;
                });
              }
            }
          } catch (error) {
            console.error('Error loading schedule for student:', student.id, error);
          }
        }
        
        console.log('Today\'s schedule count:', totalCount);
        setTodayScheduleCount(totalCount);
      } catch (error) {
        console.error('Error loading today\'s schedules:', error);
        // Only show network error modal for actual network errors
        if (error?.code?.includes('unavailable') || error?.code?.includes('network') || error?.message?.toLowerCase().includes('network')) {
          const errorInfo = getNetworkErrorMessage({ type: 'unstable_connection', message: error.message });
          setNetworkErrorTitle(errorInfo.title);
          setNetworkErrorMessage(errorInfo.message);
          setNetworkErrorColor(errorInfo.color);
          setNetworkErrorVisible(true);
          setTimeout(() => setNetworkErrorVisible(false), 5000);
        }
        setTodayScheduleCount(0);
      } finally {
        setScheduleLoading(false);
      }
    };
    
    if (isFocused && students.length > 0) {
      loadTodayScheduleCount();
    } else if (isFocused && students.length === 0) {
      setTodayScheduleCount(0);
      setScheduleLoading(false);
    }
  }, [isFocused, students]);

  // Load ongoing classes (Class Happening Now) count across linked students
  useEffect(() => {
    const loadOngoingClasses = async () => {
      if (!user?.uid || students.length === 0) {
        setOngoingClassesCount(0);
        setOngoingLoading(false);
        return;
      }
      setOngoingLoading(true);
      try {
        const isNowWithin = (timeRange) => {
          try {
            const raw = String(timeRange || '').trim();
            if (!raw) return false;
            const dashNormalized = raw.replace(/[–—−]/g, '-');
            const parts = dashNormalized.split('-').map(p => p.trim()).filter(Boolean);
            if (parts.length !== 2) return true;
            const normalize = (s) => s.replace(/\s+/g, '').toUpperCase();
            const parsePart = (p) => {
              const n = normalize(p);
              let m = n.match(/^(\d{1,2}):(\d{2})(AM|PM)$/);
              if (m) return { h: parseInt(m[1],10), min: parseInt(m[2],10), ap: m[3] };
              m = n.match(/^(\d{1,2}):(\d{2})$/);
              if (m) return { h: parseInt(m[1],10), min: parseInt(m[2],10), ap: null };
              m = n.match(/^(\d{1,2})(\d{2})(AM|PM)$/);
              if (m) return { h: parseInt(m[1],10), min: parseInt(m[2],10), ap: m[3] };
              m = n.match(/^(\d{1,2})(\d{2})$/);
              if (m) return { h: parseInt(m[1],10), min: parseInt(m[2],10), ap: null };
              return null;
            };
            const toMinutes = ({ h, min, ap }) => {
              let hh = h;
              if (ap) { if (ap === 'PM' && hh !== 12) hh += 12; if (ap === 'AM' && hh === 12) hh = 0; }
              return hh * 60 + (min || 0);
            };
            const start = parsePart(parts[0]);
            const end = parsePart(parts[1]);
            if (!start || !end) return true;
            const now = new Date();
            const nowMin = now.getHours() * 60 + now.getMinutes();
            const s = toMinutes(start);
            const e = toMinutes(end);
            const grace = 3;
            return e < s
              ? (nowMin >= Math.max(0, s - grace) || nowMin <= Math.min(24*60, e + grace))
              : (nowMin >= Math.max(0, s - grace) && nowMin <= Math.min(24*60, e + grace));
          } catch { return true; }
        };

        const DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
        const now = new Date();
        const currentDay = DAYS[now.getDay() === 0 ? 6 : now.getDay() - 1];

        let ongoing = 0;
        for (const student of students) {
          try {
            const studentIdNumber = student.studentId || student.id;
            if (!studentIdNumber) continue;
            const schedRef = doc(db, 'schedules', String(studentIdNumber));
            const schedSnap = await getDoc(schedRef);
            if (!schedSnap.exists()) continue;

            const subjectsAny = schedSnap.data()?.subjects;
            if (subjectsAny && !Array.isArray(subjectsAny) && typeof subjectsAny === 'object') {
              Object.keys(subjectsAny).forEach(subj => {
                const entries = Array.isArray(subjectsAny[subj]) ? subjectsAny[subj] : [];
                for (const e of entries) {
                  const t = e?.time || e?.Time;
                  const d = e?.day || e?.Day || e?.dayOfWeek;
                  if ((d === currentDay || String(d || '').toLowerCase() === String(currentDay).toLowerCase()) && isNowWithin(t)) {
                    ongoing += 1;
                  }
                }
              });
            } else if (Array.isArray(subjectsAny)) {
              for (const e of subjectsAny) {
                const t = e?.time || e?.Time;
                const d = e?.day || e?.Day || e?.dayOfWeek;
                if ((d === currentDay || String(d || '').toLowerCase() === String(currentDay).toLowerCase()) && isNowWithin(t)) {
                  ongoing += 1;
                }
              }
            }
          } catch {}
        }
        setOngoingClassesCount(ongoing);
      } catch {
        setOngoingClassesCount(0);
      } finally {
        setOngoingLoading(false);
      }
    };

    if (isFocused && students.length > 0) {
      loadOngoingClasses();
    } else if (isFocused && students.length === 0) {
      setOngoingClassesCount(0);
      setOngoingLoading(false);
    }
  }, [isFocused, students, user?.uid]);

  // Re-render at midnight to clear today's activity section automatically
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

  const currentDayKey = new Date().toDateString();

  // Subscribe to attendance logs for all linked students and aggregate
  useEffect(() => {
    if (!isFocused || students.length === 0) { setAllLogs([]); return; }
    const unsubscribes = [];
    // Keep a temp map of logs per student to avoid race conditions
    const studentIdToLogs = {};

    students.forEach((student) => {
      try {
        const studentDocId = student.studentId || student.id;
        if (!studentDocId) return;
        const scansRef = collection(db, 'student_attendances', String(studentDocId), 'scans');
        const scansQuery = query(scansRef, orderBy('timeOfScanned', 'desc'));
        const unsubscribe = onSnapshot(scansQuery, (snapshot) => {
          const docs = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
          // Annotate with student info
          const annotated = docs.map(log => ({
            ...log,
            _studentName: `${(student.firstName || '').trim()} ${(student.lastName || '').trim()}`.trim() || (student.studentId || 'Student'),
            _studentId: student.studentId || student.id,
          }));
          studentIdToLogs[studentDocId] = annotated;
          // Combine all students and filter to today only
          const combined = Object.values(studentIdToLogs).flat();
          const todays = combined.filter(item => {
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
              console.warn('Error filtering date for today:', error);
              return false;
            }
          });
          
          // Sort desc by timestamp with safe date handling
          todays.sort((a, b) => {
            try {
              const ta = (a?.timeOfScanned ?? a?.timestamp);
              const tb = (b?.timeOfScanned ?? b?.timestamp);
              
              let da, db;
              if (ta?.toDate && typeof ta.toDate === 'function') {
                da = ta.toDate();
              } else if (ta instanceof Date) {
                da = ta;
              } else {
                da = new Date(ta);
              }
              
              if (tb?.toDate && typeof tb.toDate === 'function') {
                db = tb.toDate();
              } else if (tb instanceof Date) {
                db = tb;
              } else {
                db = new Date(tb);
              }
              
              // Handle invalid dates by putting them at the end
              if (isNaN(da.getTime()) && isNaN(db.getTime())) return 0;
              if (isNaN(da.getTime())) return 1;
              if (isNaN(db.getTime())) return -1;
              
              return db - da;
            } catch (error) {
              console.warn('Error sorting dates:', error);
              return 0;
            }
          });
          setAllLogs(todays);
        }, () => {});
        unsubscribes.push(unsubscribe);
      } catch {}
    });

    return () => { unsubscribes.forEach(u => { try { u?.(); } catch {} }); };
  }, [isFocused, students, currentDayKey]);

  // Build upcoming schedules (ongoing first if present, then next 2 upcoming)
  useEffect(() => {
    const DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    const isNowWithin = (timeRange) => {
      try {
        const raw = String(timeRange || '').trim();
        if (!raw) return false;
        const dashNormalized = raw.replace(/[–—−]/g, '-');
        const parts = dashNormalized.split('-').map(p => p.trim()).filter(Boolean);
        if (parts.length !== 2) return false;
        const normalize = (s) => s.replace(/\s+/g, '').toUpperCase();
        const parsePart = (p) => {
          const n = normalize(p);
          let m = n.match(/^(\d{1,2}):(\d{2})(AM|PM)$/);
          if (m) return { h: parseInt(m[1],10), min: parseInt(m[2],10), ap: m[3] };
          m = n.match(/^(\d{1,2})(\d{2})(AM|PM)$/);
          if (m) return { h: parseInt(m[1],10), min: parseInt(m[2],10), ap: m[3] };
          return null;
        };
        const toMinutes = ({ h, min, ap }) => {
          let hh = h;
          if (ap) { if (ap === 'PM' && hh !== 12) hh += 12; if (ap === 'AM' && hh === 12) hh = 0; }
          return hh * 60 + (min || 0);
        };
        const start = parsePart(parts[0]);
        const end = parsePart(parts[1]);
        if (!start || !end) return false;
        const now = new Date();
        const nowMin = now.getHours() * 60 + now.getMinutes();
        const s = toMinutes(start);
        const e = toMinutes(end);
        return e < s ? (nowMin >= s || nowMin <= e) : (nowMin >= s && nowMin <= e);
      } catch { return false; }
    };
    const parseStartToDate = (dayName, timeRange) => {
      try {
        const now = new Date();
        const startStr = String(timeRange || '').split('-')[0].trim();
        const m = startStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
        if (!m) return null;
        let h = parseInt(m[1], 10), min = parseInt(m[2], 10);
        const ap = m[3].toUpperCase();
        if (ap === 'PM' && h !== 12) h += 12; if (ap === 'AM' && h === 12) h = 0;
        // Determine next occurrence date for the given dayName
        const targetDow = DAYS.indexOf(dayName);
        if (targetDow < 0) return null;
        const d = new Date(now);
        const delta = (targetDow - d.getDay() + 7) % 7;
        d.setDate(d.getDate() + (delta === 0 && (h*60+min) <= (d.getHours()*60+d.getMinutes()) ? 7 : delta));
        d.setHours(h, min, 0, 0);
        return d;
      } catch { return null; }
    };

    const compute = async () => {
      if (!students || students.length === 0) { setUpcomingByStudent({}); return; }
      const nextMap = {};
      for (const s of students) {
        try {
          const studentIdNumber = s.studentId || s.id;
          if (!studentIdNumber) { nextMap[s.id] = []; continue; }
          const schedSnap = await getDoc(doc(db, 'schedules', String(studentIdNumber)));
          if (!schedSnap.exists()) { nextMap[s.id] = []; continue; }
          const subjects = schedSnap.data()?.subjects || {};
          const flat = [];
          const now = new Date();
          const todayName = DAYS[now.getDay()];
          Object.keys(subjects).forEach(subj => {
            const arr = Array.isArray(subjects[subj]) ? subjects[subj] : [];
            arr.forEach(e => {
              const dayName = e.day || e.Day || e.dayOfWeek;
              const time = e.time || e.Time;
              const when = parseStartToDate(dayName, time);
              const ongoing = String(dayName) === String(todayName) && isNowWithin(time);
              if (ongoing) {
                flat.push({ subject: subj, day: dayName, time, when: new Date(0), ongoing: true });
              } else if (when && when > now) {
                flat.push({ subject: subj, day: dayName, time, when, ongoing: false });
              }
            });
          });
          flat.sort((a,b) => (Number(b.ongoing === true) - Number(a.ongoing === true)) || (a.when - b.when));
          nextMap[s.id] = flat.slice(0, 3);
        } catch { nextMap[s.id] = []; }
      }
      setUpcomingByStudent(nextMap);
    };
    compute();
  }, [students, isFocused]);

  // Load latest 3 events from announcements (category 'events')
  useEffect(() => {
    const load = async () => {
      try {
        const announcementsRef = collection(db, 'announcements');
        const q = query(announcementsRef, orderBy('createdAt', 'desc'));
        const snap = await getDocs(q);
        const items = [];
        snap.forEach(d => {
          const data = d.data() || {};
          items.push({ id: d.id, ...data });
        });
        const events = items.filter(it => (String(it.category || '').toLowerCase() === 'events'));
        setLatestEvents(events.slice(0,3));
      } catch { setLatestEvents([]); }
    };
    if (isFocused) load();
  }, [isFocused]);

  const onRefresh = async () => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 400);
  };

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

  const renderLogItem = ({ item, index }) => {
    const ts = item.timeOfScanned ?? item.timestamp;
    const time = formatTime(ts);
    
    const type = item?.entry === 'IN' ? 'IN' : 'OUT';
    const scanLocation = item?.scanLocation || 'Unknown Location';
    const scannerDeviceId = item?.scannerDeviceId || 'Unknown Device';
    const studentName = item?._studentName || 'Student';
    
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
              {studentName} • {scanLocation} {scannerDeviceId}
            </Text>
          </View>
          <Text style={styles.itemTime}>{time}</Text>
        </View>
      </View>
    );
  };

  // Toggle Sidebar
  const toggleSidebar = (open) => {
    Animated.timing(sidebarAnimRight, {
      toValue: open ? 0 : -width * 0.6,
      duration: 300,
      useNativeDriver: false,
    }).start();
    setSidebarOpen(open);
  };

  // Greeting
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good Morning';
    if (hour < 18) return 'Good Afternoon';
    return 'Good Evening';
  };

  // Modern modal logout
  const handleLogout = () => {
    toggleSidebar(false);
    setLogoutVisible(true);
  };

  const confirmLogout = async () => {
    setLogoutVisible(false);
    toggleSidebar(false);
    try {
      await logout();
    } catch (e) {
      console.log('Logout error:', e);
    }
  };

  const cancelLogout = () => {
    setLogoutVisible(false);
  };

  if (loading) {
    return (
      <View style={[styles.wrapper, { backgroundColor: '#FFFFFF' }]} />
    );
  }

  return (<>
    <ErrorBoundary fallback={<View style={[styles.wrapper, { backgroundColor: '#FFFFFF' }]} /> }>
    <View style={styles.wrapper}>
      <Modal transparent visible={sidebarOpen} animationType="fade" onRequestClose={() => toggleSidebar(false)}>
        <TouchableOpacity
          style={styles.overlay}
          activeOpacity={1}
          onPress={() => toggleSidebar(false)}
        />
        <Animated.View style={[styles.sidebar, { right: sidebarAnimRight }]}>        
        <Text style={styles.sidebarTitle}>Menu</Text>

        <TouchableOpacity
          style={[styles.sidebarItem, styles.activeSidebarItem]}
          onPress={() => {
            toggleSidebar(false);
            try {
              const parentNav = navigation.getParent?.();
              if (parentNav) parentNav.navigate('Home', { screen: 'ParentDashboard' });
              else navigation.navigate('Home', { screen: 'ParentDashboard' });
            } catch {
              navigation.navigate('Home', { screen: 'ParentDashboard' });
            }
          }}
        >
          <Ionicons name="home-outline" size={20} color="#2563EB" />
          <Text style={[styles.sidebarText, styles.activeSidebarText]}>Dashboard</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.sidebarItem}
          onPress={() => {
            toggleSidebar(false);
            try {
              const parentNav = navigation.getParent?.();
              if (parentNav) parentNav.navigate('Home', { screen: 'Profile' });
              else navigation.navigate('Profile');
            } catch { navigation.navigate('Profile'); }
          }}
        >
          <Ionicons name="person-outline" size={20} color="#111827" />
          <Text style={styles.sidebarText}>Profile</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.sidebarItem}
          onPress={() => {
            toggleSidebar(false);
            try {
              const parentNav = navigation.getParent?.();
              if (parentNav) parentNav.navigate('Home', { screen: 'LinkedStudents' });
              else navigation.navigate('LinkedStudents');
            } catch { navigation.navigate('LinkedStudents'); }
          }}
        >
          <Ionicons name="school-outline" size={20} color="#111827" />
          <Text style={styles.sidebarText}>Linked Students</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.sidebarItem}
          onPress={() => {
            toggleSidebar(false);
            try {
              const parentNav = navigation.getParent?.();
              if (parentNav) parentNav.navigate('Home', { screen: 'Events' });
              else navigation.navigate('Events');
            } catch {
              navigation.navigate('Events');
            }
          }}
        >
          <Ionicons name="megaphone-outline" size={20} color="#111827" />
          <Text style={styles.sidebarText}>Events</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.sidebarItem}
          onPress={() => {
            toggleSidebar(false);
            try {
              const parentNav = navigation.getParent?.();
              if (parentNav) parentNav.navigate('ScheduleTab');
              else navigation.navigate('ScheduleTab');
            } catch { navigation.navigate('ScheduleTab'); }
          }}
        >
          <Ionicons name="calendar-outline" size={20} color="#111827" />
          <Text style={styles.sidebarText}>Schedules</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.sidebarItem}
          onPress={() => {
            toggleSidebar(false);
            try {
              const parentNav = navigation.getParent?.();
              if (parentNav) parentNav.navigate('Home', { screen: 'AttendanceLog' });
              else navigation.navigate('AttendanceLog');
            } catch { navigation.navigate('AttendanceLog'); }
          }}
        >
          <Ionicons name="checkmark-done-outline" size={20} color="#111827" />
          <Text style={styles.sidebarText}>Attendance</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.sidebarItem}
          onPress={() => {
            toggleSidebar(false);
            try {
              const parentNav = navigation.getParent?.();
              if (parentNav) parentNav.navigate('MessagesTab');
              else navigation.navigate('MessagesTab');
            } catch { navigation.navigate('MessagesTab'); }
          }}
        >
          <Ionicons name="chatbubble-outline" size={20} color="#111827" />
          <Text style={styles.sidebarText}>Messages</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.sidebarItem}
          onPress={() => {
            toggleSidebar(false);
            try {
              const parentNav = navigation.getParent?.();
              if (parentNav) parentNav.navigate('NotificationsTab');
              else navigation.navigate('NotificationsTab');
            } catch { navigation.navigate('NotificationsTab'); }
          }}
        >
          <Ionicons name="notifications-outline" size={20} color="#111827" />
          <Text style={styles.sidebarText}>Alerts</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.sidebarItem}
          onPress={() => {
            toggleSidebar(false);
            try {
              const parentNav = navigation.getParent?.();
              if (parentNav) parentNav.navigate('Home', { screen: 'About' });
              else navigation.navigate('About');
            } catch {
              navigation.navigate('About');
            }
          }}
        >
          <Ionicons name="information-circle-outline" size={20} color="#111827" />
          <Text style={styles.sidebarText}>About</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.sidebarItem, styles.logoutItem]}
          onPress={handleLogout}
        >
          <Ionicons name="log-out-outline" size={20} color="#b91c1c" />
          <Text style={[styles.sidebarText, { color: '#b91c1c' }]}>Logout</Text>
        </TouchableOpacity>
        </Animated.View>
      </Modal>


      {/* In-screen header removed; unified header is used instead */}

      {/* QR image button removed as requested */}

      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
      >
        {/* Overview Section */}
        {students.length > 0 && (
          <View style={styles.section}>
            {/* Overview cards */}
            <View style={styles.statsGrid}>
              {quickOverviewCards.map((card, idx) => {
                const {
                  key,
                  title,
                  subtitle,
                  palette,
                  badgeText,
                  loading,
                  value,
                  renderIcon,
                } = card;

                return (
                  <View
                    key={key}
                    style={[
                      styles.overviewCard,
                      isLandscape ? styles.overviewCardLandscape : styles.overviewCardPortrait,
                      {
                        backgroundColor: palette.cardBg,
                        borderColor: palette.borderColor,
                        marginRight: !isLandscape && (idx % 2 === 0) ? 6 : 0,
                      },
                    ]}
                  >
                    <View style={styles.overviewHeader}>
                      <View
                        style={[
                          styles.overviewIconWrap,
                          { backgroundColor: palette.iconBg },
                        ]}
                      >
                        {renderIcon()}
                      </View>
                      <Text
                        style={[
                          styles.overviewSubtitle,
                          { color: palette.accentColor },
                        ]}
                      >
                        {subtitle}
                      </Text>
                    </View>
                    <Text
                      style={[
                        styles.overviewValue,
                        palette?.textColor ? { color: palette.textColor } : null,
                      ]}
                      numberOfLines={1}
                      ellipsizeMode="tail"
                    >
                      {loading ? '—' : value}
                    </Text>
                    <Text
                      style={[
                        styles.overviewLabel,
                        palette?.labelColor ? { color: palette.labelColor } : null,
                      ]}
                    >
                      {title}
                    </Text>
                    {badgeText ? (
                      <View
                        style={[
                          styles.overviewBadge,
                          { backgroundColor: palette.badgeBg },
                        ]}
                      >
                        <Text
                          style={[
                            styles.overviewBadgeText,
                            { color: palette.badgeTextColor },
                          ]}
                        >
                          {badgeText}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {students.length > 0 && !studentsLoading && (
          <View style={styles.section}>
            <View style={[styles.sectionHeader, { marginBottom: 8 }]}>
              <Text style={styles.upcomingScheduleTitle}>Upcoming Schedule</Text>
            </View>
            <View
              style={{ marginTop: -2 }}
              onLayout={(event) => {
                try {
                  const measuredWidth = event?.nativeEvent?.layout?.width;
                  if (measuredWidth && measuredWidth > 0) {
                    setUpcomingContainerWidth(measuredWidth);
                  }
                } catch {}
              }}
            >
              <ScrollView
                horizontal
                pagingEnabled
                decelerationRate="fast"
                showsHorizontalScrollIndicator={false}
                onMomentumScrollEnd={(e) => {
                  try {
                    const pageWidth = Math.max(1, upcomingContainerWidth);
                    const idx = Math.round((e.nativeEvent.contentOffset.x || 0) / pageWidth);
                    setUpcomingIndex(Math.max(0, Math.min(idx, Math.max(0, students.length - 1))));
                  } catch {}
                }}
                contentContainerStyle={{ paddingBottom: 6 }}
                scrollEventThrottle={16}
              >
                {students.map((s) => {
                  const upcoming = upcomingByStudent[s.id] || [];
                  return (
                    <View key={s.id} style={{ width: upcomingContainerWidth }}>
                      <View style={styles.upcomingStudentCard}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                          <View style={{ width: 36, height: 36, borderRadius: 8, backgroundColor: 'rgba(0,79,137,0.12)', alignItems: 'center', justifyContent: 'center', marginRight: 10 }}>
                            <Ionicons name="person-outline" size={18} color="#004f89" />
                          </View>
                          <Text style={{ fontWeight: '700', color: '#004f89', fontSize: 13 }}>{s.firstName || 'Student'}</Text>
                        </View>
                        {upcoming.length === 0 ? (
                          <Text style={{ color: '#0F172A', fontSize: 12 }}>No upcoming classes.</Text>
                        ) : (
                          upcoming.map((it, idx) => (
                            <View key={idx} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 6, borderTopWidth: idx === 0 ? 0 : 1, borderTopColor: '#E5E7EB' }}>
                              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: it.ongoing ? '#DC2626' : '#004f89', marginRight: 8 }} />
                              <Text style={{ flex: 1, color: '#0F172A', fontWeight: '600', fontSize: 12 }}>{it.subject}</Text>
                              <Text style={{ color: '#4B5563', marginLeft: 8, fontSize: 12 }}>{it.day} {String(it.time || '')}</Text>
                            </View>
                          ))
                        )}
                      </View>
                    </View>
                  );
                })}
              </ScrollView>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'center', marginTop: 4 }}>
              {students.map((_, i) => (
                <View key={i} style={{ width: i === upcomingIndex ? 18 : 6, height: 6, borderRadius: 3, backgroundColor: i === upcomingIndex ? '#004f89' : 'rgba(0,79,137,0.35)', marginHorizontal: 3 }} />
              ))}
            </View>
          </View>
        )}

        {students.length > 0 && !studentsLoading && (
          <View style={[styles.section, styles.recentActivitySection]}>
            {/* Title Header Container */}
            <View style={styles.titleContainer}>
              <Text style={styles.sectionTitle}>Recent Activity</Text>
            </View>
            
            {/* Separator */}
            <View style={styles.separator} />

            {allLogs.length > 0 ? (
              <View style={styles.logsListContent}>
                {allLogs.map((item, index) => (
                  <View key={item.id || `${item._studentId}-${index}`}>
                    {renderLogItem({ item, index })}
                  </View>
                ))}
              </View>
            ) : (
              <View style={[styles.emptyCard, { marginTop: -1 }]}>
                <View style={styles.emptyIconWrap}>
                  <View style={styles.iconContainer}>
                    <Ionicons name="checkmark-done-outline" size={28} color="#2563EB" />
                    <View style={styles.diagonalSlash} />
                  </View>
                </View>
                <Text style={styles.emptyTitle}>No Activity Today</Text>
                <Text style={styles.emptySubtext}>
                  Today's attendance activity across your linked students will appear here.
                </Text>
              </View>
            )}
          </View>
        )}
        
        {/* Attendance at-a-glance removed per request */}

        {/* Only show empty state when not loading and no students linked */}
        {!studentsLoading && students.length === 0 && (
          <View style={styles.emptyStateContainer}>
            <View style={styles.emptyCard}>
              <View style={styles.emptyIconWrap}>
                <Ionicons name="school-outline" size={20} color="#EF4444" />
              </View>
              <Text style={styles.emptyTitle}>No Linked Students</Text>
              <Text style={styles.emptySubtext}>
                You haven't linked any students to your account yet. Link your children to start monitoring their attendance and activities.
              </Text>
              <TouchableOpacity 
                style={styles.primaryButton}
                onPress={() => { try { const parentNav = navigation.getParent?.(); if (parentNav) parentNav.navigate('Home', { screen: 'LinkedStudents' }); else navigation.navigate('LinkedStudents'); } catch { navigation.navigate('LinkedStudents'); } }}
              >
                <Ionicons name="add-outline" size={14} color="#fff" />
                <Text style={styles.primaryButtonText}>Link Students</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
        
        {/* Show loading state when students are loading */}
        {studentsLoading && (
          <View style={{ flex: 1, backgroundColor: '#FFFFFF', minHeight: 200 }} />
        )}
        
      </ScrollView>
    </View>
    </ErrorBoundary>
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
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonDanger]}
                onPress={async () => { setLogoutVisible(false); try { await logout(); } catch {} }}
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
    flexGrow: 1 
  },
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
  avatar: { width: 50, height: 50, borderRadius: 30, marginRight: 8 },
  greeting: { fontSize: 20, fontWeight: '600', color: '#FFFFFF' },
  iconButton: { marginRight: 12 },
  qrContainer: {
    position: 'absolute',
    top: 100,
    left: 16,
    right: 16,
    zIndex: 1,
    marginTop: 20,
  },
  Container: {
    borderRadius: 8,
    overflow: 'hidden',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    height: 180,
    backgroundColor: '#fff',
  },
  Image: { width: '100%', height: '100%' },
  // removed old quick overview styles (quickCard, quickText, helperText)
  // Overview section styles (matching student dashboard)
  section: { marginTop: 0, marginBottom: 8 },
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
  separator: {
    height: 1,
    backgroundColor: '#E5E7EB',
    marginTop: 0,
    marginBottom: -6,
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
  secondaryButton: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 },
  secondaryButtonText: { color: '#2563EB', fontWeight: '700', marginLeft: 8 },
  recentActivityCard: {
    height: undefined,
    maxHeight: hp(46),
  },
  upcomingStudentCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    height: UPCOMING_CARD_HEIGHT,
    justifyContent: 'space-between',
    position: 'relative',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 4,
    elevation: 2,
  },
  upcomingBlockCard: {
    backgroundColor: '#004f89',
    borderColor: '#004f89',
  },
  upcomingTitle: {
    color: '#FFFFFF',
  },
  recentBlockCard: {
    backgroundColor: '#fff',
    borderColor: '#E5E7EB',
  },
  eventsBlockCard: {
    backgroundColor: '#fff',
    borderColor: '#E5E7EB',
  },
  separator: { height: 1, backgroundColor: '#E5E7EB', marginVertical: 8 },
  recentActivityCardEmpty: {
    height: undefined,
    maxHeight: undefined,
    minHeight: hp(42),
    paddingBottom: 24,
  },
  // removed old quick overview container style (listContainer)
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTight: { marginTop: 4 },
  sectionTightBelow: { marginBottom: 8 },
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
    fontWeight: '900',
    color: '#0078cf',
    marginRight: 8,
    marginBottom: 5,
    marginTop: 10,
  },
  upcomingScheduleTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#0078cf',
    marginRight: 8,
    marginBottom: 0,
  },
  // Logs (match AttendanceLog styles)
  logsListContent: { paddingBottom: 8, borderRadius: 8 },
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
  itemTime: {
    fontSize: 10,
    color: '#6B7280',
    marginLeft: 6,
    alignSelf: 'flex-start',
  },
  scrollableContainer: {
    height: undefined,
    maxHeight: hp(38),
    flex: 1,
  },
  activityFlatList: {
    height: '100%',
  },
  logItem: {
    backgroundColor: '#EFF6FF',
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 2,
    elevation: 1,
    borderWidth: 1,
    borderColor: '#DBEAFE',
  },
  todayLogItem: { borderWidth: 2, borderColor: '#EFF6FF', backgroundColor: '#FAFBFF' },
  logHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  logDateContainer: { flexDirection: 'row', alignItems: 'center' },
  logDate: { fontSize: 16, fontWeight: '600', color: '#111827' },
  todayBadge: { backgroundColor: '#2563EB', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, marginLeft: 8 },
  todayText: { fontSize: 10, color: '#fff', fontWeight: '600' },
  statusBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  inBadge: { backgroundColor: '#ECFDF5', borderWidth: 1, borderColor: '#D1FAE5' },
  outBadge: { backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FECACA' },
  statusText: { fontSize: 12, fontWeight: '600', marginLeft: 4 },
  inText: { color: '#10B981' },
  outText: { color: '#EF4444' },
  logDetails: { flexDirection: 'row', justifyContent: 'space-between' },
  timeContainer: { flexDirection: 'row', alignItems: 'center' },
  timeText: { fontSize: 14, color: '#6B7280', marginLeft: 6 },
  locationContainer: { flexDirection: 'row', alignItems: 'center' },
  locationText: { fontSize: 14, color: '#6B7280', marginLeft: 6 },
  emptyState: { alignItems: 'center', justifyContent: 'center', paddingVertical: 0, backgroundColor: '#fff', borderRadius: 8, padding: 24, flex: 1 },
  emptyTitle: { fontSize: 18, fontWeight: '600', color: '#111827', marginTop: 16, marginBottom: 8 },
  emptySubtitle: { fontSize: 14, color: '#6B7280', textAlign: 'center', lineHeight: 20 },
  badge: {
    backgroundColor: '#2563EB',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  badgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  studentsContainer: {
    gap: 12,
  },
  studentCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
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
  loadingContainer: { alignItems: 'center', justifyContent: 'center', paddingVertical: 40 },
  loadingText: { marginTop: 12, color: '#6B7280', fontSize: 16 },
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
    backgroundColor: 'rgba(17,24,39,0.25)',
    zIndex: 9,
  },
  // Modal (copied values from Student dashboard)
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
  badge: {
    backgroundColor: '#2563EB',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    minWidth: 20,
    alignItems: 'center',
  },
  badgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  loadingCard: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  studentsContainer: {
    gap: 12,
  },
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
  studentInitials: {
    fontSize: 18,
    fontWeight: '600',
    color: '#2563EB',
  },
  studentInfo: {
    flex: 1,
  },
  studentName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 2,
  },
  studentClass: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 2,
  },
  studentId: {
    fontSize: 12,
    color: '#9CA3AF',
    marginBottom: 4,
  },
  studentActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
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
  actionButtonText: {
    fontSize: 12,
    color: '#374151',
    fontWeight: '500',
  },
  statsSection: {
    marginTop: 24,
  },
  statsGrid: {
    flexDirection: 'row',
    gap: 0,
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
    paddingHorizontal: 0,
    marginTop: 4,
    marginBottom: 4,
  },
  overviewCard: {
    flexGrow: 1,
    minWidth: 0,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'flex-start',
    justifyContent: 'flex-start',
    overflow: 'hidden',
    marginTop: 10,
    marginBottom: 0,
    minHeight: 118,
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 4,
    elevation: 2,
  },
  overviewCardPortrait: {
    width: '48%',
  },
  overviewCardLandscape: {
    width: '23.5%',
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
  emptyCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#0F172A',
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 12,
    elevation: 4,
    width: '100%',
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
    marginBottom: 4,
  },
  emptySubtext: {
    fontSize: 12,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 16,
    marginBottom: 12,
  },
  // Linked card styles (copied from LinkStudents.js)
  linkedCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 14,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
  },
  linkedLeft: { 
    flex: 1, 
    flexDirection: 'row', 
    alignItems: 'center' 
  },
  linkedAvatar: { 
    width: 48, 
    height: 48, 
    borderRadius: 8, 
    marginRight: 12, 
    backgroundColor: '#EFF6FF',
    justifyContent: 'center',
    alignItems: 'center'
  },
  linkedMeta: { 
    flex: 1, 
    flexDirection: 'column' 
  },
  linkedName: { 
    fontSize: 16, 
    fontWeight: '700', 
    color: '#111827' 
  },
  linkedSub: { 
    fontSize: 13, 
    color: '#6B7280', 
 
    marginTop: 2 
  },
  linkedFoot: { 
    fontSize: 12, 
    color: '#9CA3AF', 
    marginTop: 4 
  },
  unlinkPill: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    gap: 6, 
    backgroundColor: '#EFF6FF', 
    paddingVertical: 8, 
    paddingHorizontal: 12, 
    borderRadius: 999, 
    borderWidth: 1, 
    borderColor: '#DBEAFE', 
    marginLeft: 12, 
    flexShrink: 0 
  },
  unlinkPillText: { 
    color: '#2563EB', 
    fontWeight: '700', 
    fontSize: 12 
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#004f89',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  primaryButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 12,
  },
  // Empty state styles (mirrored from Student Dashboard)
  emptyStateContainer: { 
    marginTop: 8,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  loadingStateContainer: { 
    marginTop: 8,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', minHeight: 500, marginTop: -50 },
});
export default Dashboard;