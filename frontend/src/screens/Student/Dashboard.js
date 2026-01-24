import React, { useContext, useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
  Image,
  Modal,
  StatusBar,
  Platform,
} from 'react-native';
import { useNavigation, useIsFocused, useFocusEffect } from '@react-navigation/native';
import { STUDENT_TAB_BAR_STYLE } from '../../navigation/tabStyles';
import { AuthContext } from '../../contexts/AuthContext';
import useNetworkMonitor from '../../hooks/useNetworkMonitor';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, onSnapshot, getDoc, setDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../utils/firebaseConfig';
import { wp, hp, fontSizes, responsiveStyles, getResponsiveDimensions } from '../../utils/responsive';
import avatarEventEmitter from '../../utils/avatarEventEmitter';
import { cacheDashboardData, getCachedDashboardData } from '../../offline/storage';
import OfflineBanner from '../../components/OfflineBanner';
import NetInfo from '@react-native-community/netinfo';

const { width, height } = Dimensions.get('window');
const statusBarHeight = StatusBar.currentHeight || 0;
const dimensions = getResponsiveDimensions();

const StudentDashboard = () => {
  const { user } = useContext(AuthContext);
  const isConnected = useNetworkMonitor();
  const navigation = useNavigation();
  const isFocused = useIsFocused();
  // Ensure dashboard always restores the student tab bar
  useFocusEffect(
    React.useCallback(() => {
      const parent = navigation.getParent?.();
      if (parent) parent.setOptions({ tabBarStyle: STUDENT_TAB_BAR_STYLE });
      return () => {};
    }, [navigation])
  );

  const [profilePic, setProfilePic] = useState(null);
  const [qrRequestVisible, setQrRequestVisible] = useState(false);
  const [qrRequestSending, setQrRequestSending] = useState(false);
  const [feedbackVisible, setFeedbackVisible] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState('');
  const [feedbackSuccess, setFeedbackSuccess] = useState(true);
  const [hasQrCode, setHasQrCode] = useState(false);
  const [errorModalVisible, setErrorModalVisible] = useState(false);
  const [errorModalMessage, setErrorModalMessage] = useState('');
  
  const showErrorModal = (message) => {
    setErrorModalMessage(message);
    setErrorModalVisible(true);
    setTimeout(() => setErrorModalVisible(false), 3000);
  };
  
  const [loading, setLoading] = useState(false);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [qrLoaded, setQrLoaded] = useState(false);
  const [linkedParents, setLinkedParents] = useState([]);
  const [parentsLoading, setParentsLoading] = useState(true);
  const [todayScheduleCount, setTodayScheduleCount] = useState(0);
  const [ongoingClass, setOngoingClass] = useState(null);
  const [scheduleLoading, setScheduleLoading] = useState(true);
  const [ongoingLoading, setOngoingLoading] = useState(true);
  const [isLandscape, setIsLandscape] = useState(false);
  const [showOfflineBanner, setShowOfflineBanner] = useState(false);

  // Load profile picture using same key as Profile; refresh on focus
  const loadProfilePic = React.useCallback(async () => {
    try {
      if (!user?.studentId) { setProfilePic(null); return; }
      const savedProfile = await AsyncStorage.getItem(`profilePic_${user.studentId}`);
      setProfilePic(savedProfile ? { uri: savedProfile } : null);
    } catch (error) {
      console.log('Error loading profile pic:', error);
      setProfilePic(null);
    }
    try { setProfileLoaded(true); } catch {}
  }, [user?.studentId]);

  useEffect(() => {
    if (isFocused) loadProfilePic();
  }, [isFocused, loadProfilePic]);

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

  // Listen for avatar changes from Profile screen
  useEffect(() => {
    const handleAvatarChange = (data) => {
      if (user?.studentId && data.studentId && String(data.studentId) === String(user.studentId)) {
        loadProfilePic();
      }
    };

    avatarEventEmitter.on('avatarChanged', handleAvatarChange);
    return () => {
      avatarEventEmitter.off('avatarChanged', handleAvatarChange);
    };
  }, [user?.studentId, loadProfilePic]);


  // Load QR code status (following same pattern as Schedule/Alerts/Events)
  const loadQrStatus = async () => {
    if (!user?.studentId) { 
      setHasQrCode(false); 
      try { setQrLoaded(true); } catch {} 
      return; 
    }
    
    // Try to load from cache first (works offline)
    try {
      const cached = await AsyncStorage.getItem(`qrCodeUrl_${user.studentId}`);
      if (cached) {
        setHasQrCode(true);
        console.log('✅ QR code status loaded from cache');
        // If offline, use cached value and return early
        if (!isConnected) {
          console.log('📴 Offline mode - using cached QR code status');
          try { setQrLoaded(true); } catch {}
          return;
        }
      } else {
        setHasQrCode(false);
      }
    } catch (error) {
      console.log('Error loading cached QR code status:', error);
    }
    
    // Only fetch from Firestore if online
    if (!isConnected) {
      try { setQrLoaded(true); } catch {}
      return;
    }
    
    try {
      const qrRef = doc(db, 'student_QRcodes', String(user.studentId));
      const qrSnap = await getDoc(qrRef);
      const data = qrSnap.exists() ? qrSnap.data() : {};
      const has = Boolean(data?.qrCodeUrl);
      setHasQrCode(has);
      
      // Cache the data for offline access
      try {
        if (has && data.qrCodeUrl) {
          await AsyncStorage.setItem(`qrCodeUrl_${user.studentId}`, String(data.qrCodeUrl));
          console.log('✅ QR code saved to cache');
        } else {
          await AsyncStorage.removeItem(`qrCodeUrl_${user.studentId}`);
        }
      } catch (cacheError) {
        console.log('Error caching QR code:', cacheError);
      }
    } catch (error) {
      console.error('Error loading QR code status:', error);
      // Keep using cached state if available
      try {
        const cached = await AsyncStorage.getItem(`qrCodeUrl_${user.studentId}`);
        if (cached) {
          setHasQrCode(true);
          console.log('Using cached QR code after Firestore error');
        }
      } catch {}
    } finally {
      try { setQrLoaded(true); } catch {}
    }
  };

  // Check if student has QR generated by admin (student_QRcodes)
  useEffect(() => {
    if (isFocused) loadQrStatus();
  }, [isFocused, user?.studentId, isConnected]);

  // Show loading on navigate/focus until initial profile and QR checks complete
  useEffect(() => {
    if (isFocused) {
      setLoading(true);
      setProfileLoaded(false);
      setQrLoaded(false);
    }
  }, [isFocused]);

  useEffect(() => {
    if (loading && profileLoaded && qrLoaded) {
      const t = setTimeout(() => setLoading(false), 200); // brief delay for smoother UX
      return () => clearTimeout(t);
    }
  }, [loading, profileLoaded, qrLoaded]);

  // Live updates for QR availability from student_QRcodes (only when online)
  useEffect(() => {
    if (!user?.studentId || !isConnected) return undefined;
    const ref = doc(db, 'student_QRcodes', String(user.studentId));
    const unsub = onSnapshot(ref, (snap) => {
      try {
        const data = snap.exists() ? snap.data() : {};
        const has = Boolean(data?.qrCodeUrl);
        setHasQrCode(has);
        try {
          if (has && data.qrCodeUrl) {
            AsyncStorage.setItem(`qrCodeUrl_${user.studentId}`, String(data.qrCodeUrl));
            console.log('✅ QR code updated from real-time listener and cached');
          } else {
            AsyncStorage.removeItem(`qrCodeUrl_${user.studentId}`);
          }
        } catch {}
      } catch {
        // ignore
      }
    });
    return () => { try { unsub && unsub(); } catch {} };
  }, [user?.studentId, isConnected]);

  // Load linked parents with real-time listener (query both studentId and studentIdNumber)
  useEffect(() => {
    if (!user?.uid) {
      setLinkedParents([]);
      setParentsLoading(false);
      return;
    }
    
    const loadLinkedParents = async () => {
      setParentsLoading(true);
      
      // Try to load from cache first (works offline)
      try {
        const cachedData = await getCachedDashboardData(user.studentId || user.uid, 'student');
        if (cachedData?.linkedParents) {
          setLinkedParents(cachedData.linkedParents);
          // If offline, use cached data and return early
          if (!isConnected) {
            setParentsLoading(false);
            return;
          }
        }
      } catch (error) {
        console.log('Error loading cached linked parents:', error);
      }
    
      // Only fetch from Firestore if online
      if (!isConnected) {
        setParentsLoading(false);
        return;
      }
    
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
        setParentsLoading(false);
        return;
      }
      
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
      const updateCombinedResults = () => {
        const allParents = new Map();
        resultsMap.forEach((queryResults) => {
          queryResults.forEach((parent, parentId) => {
            if (!allParents.has(parentId)) {
              allParents.set(parentId, parent);
            }
          });
        });
        const parentsArray = Array.from(allParents.values());
        setLinkedParents(parentsArray);
        
        // Cache the data for offline access
        try {
          cacheDashboardData(user.studentId || user.uid, 'student', {
            linkedParents: parentsArray,
          });
        } catch (error) {
          console.log('Error caching linked parents:', error);
        }
        
        // Set loading to false after all queries have initialized
        if (initializedSet.size >= queries.length) {
          setParentsLoading(false);
        }
      };
      
      // Set up real-time listeners for each query
      const unsubscribes = queries.map((qRef, index) => {
        return onSnapshot(qRef, (linksSnapshot) => {
          try {
            // Store results for this query
            const queryResults = new Map();
            linksSnapshot.forEach((doc) => {
              const data = doc.data();
              const parentId = String(data.parentId || '').trim();
              if (parentId) {
                queryResults.set(parentId, {
                  id: doc.id,
                  parentId: data.parentId,
                  parentName: data.parentName || 'Parent',
                  relationship: data.relationship || '',
                });
              }
            });
            
            resultsMap.set(index, queryResults);
            initializedSet.add(index);
            
            // Combine all results and update state
            updateCombinedResults();
          } catch (error) {
            console.log('Error processing linked parents:', error);
            setParentsLoading(false);
          }
        }, (error) => {
          console.log('Error loading linked parents:', error);
          setParentsLoading(false);
        });
      });
      
      return () => {
        unsubscribes.forEach((unsub) => {
          try { unsub(); } catch {}
        });
      };
    };
    
    const cleanup = loadLinkedParents();
    return () => {
      if (cleanup && typeof cleanup.then === 'function') {
        cleanup.then((unsub) => {
          if (unsub && typeof unsub === 'function') unsub();
        });
      } else if (cleanup && typeof cleanup === 'function') {
        cleanup();
      }
    };
  }, [user?.uid, user?.studentId, isConnected]);

  // Load today's schedule count
  useEffect(() => {
    const loadTodayScheduleCount = async () => {
      if (!user?.studentId) {
        setTodayScheduleCount(0);
        setScheduleLoading(false);
        return;
      }
      
      setScheduleLoading(true);
      
      // Try to load from cache first (works offline)
      try {
        const cachedData = await getCachedDashboardData(user.studentId, 'student');
        if (cachedData?.todayScheduleCount !== undefined) {
          setTodayScheduleCount(cachedData.todayScheduleCount);
          // If offline, use cached data and return early
          if (!isConnected) {
            setScheduleLoading(false);
            return;
          }
        }
      } catch (error) {
        console.log('Error loading cached schedule count:', error);
      }
      
      // Only fetch from Firestore if online
      if (!isConnected) {
        setScheduleLoading(false);
        return;
      }
      
      try {
        const today = new Date().toLocaleDateString('en-US', { weekday: 'long' });
        const schedRef = doc(db, 'schedules', String(user.studentId));
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
        
        // Cache the data for offline access
        try {
          const cachedData = await getCachedDashboardData(user.studentId, 'student') || {};
          await cacheDashboardData(user.studentId, 'student', {
            ...cachedData,
            todayScheduleCount: count,
          });
        } catch (error) {
          console.log('Error caching schedule count:', error);
        }
      } catch (error) {
        console.log('Error loading today\'s schedule:', error);
        setTodayScheduleCount(0);
      } finally {
        setScheduleLoading(false);
      }
    };
    
    if (isFocused) loadTodayScheduleCount();
  }, [isFocused, user?.studentId, isConnected]);

  // Load ongoing classes
  useEffect(() => {
    const loadOngoingClasses = async () => {
      if (!user?.studentId) {
        setOngoingClass(null);
        setOngoingLoading(false);
        return;
      }
      setOngoingLoading(true);
      
      // Try to load from cache first (works offline)
      try {
        const cachedData = await getCachedDashboardData(user.studentId, 'student');
        if (cachedData?.ongoingClass !== undefined) {
          setOngoingClass(cachedData.ongoingClass);
          // If offline, use cached data and return early
          if (!isConnected) {
            setOngoingLoading(false);
            return;
          }
        }
      } catch (error) {
        console.log('Error loading cached ongoing class:', error);
      }
      
      // Only fetch from Firestore if online
      if (!isConnected) {
        setOngoingLoading(false);
        return;
      }
      
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

        const schedRef = doc(db, 'schedules', String(user.studentId));
        const schedSnap = await getDoc(schedRef);
        
        let foundClass = null;
        if (schedSnap.exists()) {
          const subjectsAny = schedSnap.data()?.subjects;
          if (subjectsAny && !Array.isArray(subjectsAny) && typeof subjectsAny === 'object') {
            Object.keys(subjectsAny).forEach(subj => {
              if (foundClass) return;
              const entries = Array.isArray(subjectsAny[subj]) ? subjectsAny[subj] : [];
              for (const e of entries) {
                const t = e?.time || e?.Time;
                const d = e?.day || e?.Day || e?.dayOfWeek;
                if ((d === currentDay || String(d || '').toLowerCase() === String(currentDay).toLowerCase()) && isNowWithin(t)) {
                  foundClass = { subject: subj, time: String(t || '') };
                  return;
                }
              }
            });
          } else if (Array.isArray(subjectsAny)) {
            for (const e of subjectsAny) {
              if (foundClass) break;
              const t = e?.time || e?.Time;
              const d = e?.day || e?.Day || e?.dayOfWeek;
              const subj = e?.subject || e?.Subject;
              if ((d === currentDay || String(d || '').toLowerCase() === String(currentDay).toLowerCase()) && isNowWithin(t)) {
                foundClass = { subject: String(subj || ''), time: String(t || '') };
                break;
              }
            }
          }
        }
        setOngoingClass(foundClass);
        
        // Cache the data for offline access
        try {
          const cachedData = await getCachedDashboardData(user.studentId, 'student') || {};
          await cacheDashboardData(user.studentId, 'student', {
            ...cachedData,
            ongoingClass: foundClass,
          });
        } catch (error) {
          console.log('Error caching ongoing class:', error);
        }
      } catch {
        setOngoingClass(null);
      } finally {
        setOngoingLoading(false);
      }
    };

    if (isFocused) {
      loadOngoingClasses();
      // Refresh every minute to check for ongoing classes (only when online)
      if (isConnected) {
        const interval = setInterval(loadOngoingClasses, 60000);
        return () => clearInterval(interval);
      }
    }
  }, [isFocused, user?.studentId, isConnected]);

  // Handle orientation changes
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

  const studentCardPalette = {
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
      key: 'classesToday',
      title: 'Classes Today',
      subtitle: 'Plan the day',
      value: todayScheduleCount,
      loading: scheduleLoading,
      badgeText: scheduleLoading
        ? 'Syncing schedule'
        : todayScheduleCount === 0
          ? "You're all caught up"
          : `${todayScheduleCount} scheduled`,
      palette: studentCardPalette,
      renderIcon: () => <Ionicons name="calendar-outline" size={22} color={studentCardPalette.accentColor} />,
    },
    {
      key: 'liveClasses',
      title: 'Ongoing Classes',
      subtitle: 'Happening right now',
      value: ongoingClass ? ongoingClass.subject : 'None',
      loading: ongoingLoading,
      badgeText: ongoingLoading
        ? 'Checking in...'
        : ongoingClass
          ? ongoingClass.time
          : 'Nothing live yet',
      palette: studentCardPalette,
      renderIcon: () => <Ionicons name="time-outline" size={22} color={studentCardPalette.accentColor} />,
    },
  ];


  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: '#FFFFFF' }} />
    );
  }

  return (
    <>
      <View style={styles.wrapper}>
        <ScrollView 
          style={styles.scrollView}
          contentContainerStyle={styles.container}
          showsVerticalScrollIndicator={false}
        >
          {/* Overview Section */}
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

          {/* QR image button - moved below Quick Overview */}
          <View style={styles.qrContainer}>
            <TouchableOpacity
              style={styles.Container}
              onPress={() => {
                if (hasQrCode) navigation.navigate('QRPreview');
                else setQrRequestVisible(true);
              }}
            >
              <Image
                source={hasQrCode ? require('../../assets/scanme.png') : require('../../assets/404.png')}
                style={styles.Image}
                resizeMode="cover"
              />
            </TouchableOpacity>
          </View>

          {/* Only show empty state when not loading and no parents linked */}
          {!parentsLoading && linkedParents.length === 0 && (
            <View style={styles.emptyStateContainer}>
              <View style={styles.emptyCard}>
                <View style={styles.emptyIconWrap}>
                  <Ionicons name="person-outline" size={20} color="#EF4444" />
                </View>
                <Text style={styles.emptyTitle}>No Linked Parents</Text>
                <Text style={styles.emptySubtext}>
                  You haven't linked any parents to your account yet. Link your parents to start sharing your attendance and activities.
                </Text>
                <TouchableOpacity
                  style={styles.primaryButton}
                  onPress={() => navigation.navigate('LinkParent')}
                >
                  <Ionicons name="add-outline" size={14} color="#fff" />
                  <Text style={styles.primaryButtonText}>Link Now</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
          
          {/* Show loading state when parents are loading */}
          {parentsLoading && (
            <View style={{ flex: 1, backgroundColor: '#FFFFFF', minHeight: 200 }} />
          )}
        </ScrollView>
        
        <OfflineBanner visible={showOfflineBanner} />
      </View>

      {/* QR Request Modal */}
      <Modal
        transparent
        animationType="fade"
        visible={qrRequestVisible}
        onRequestClose={() => setQrRequestVisible(false)}
      >
        <View style={styles.modalOverlayCenter}>
          <View style={styles.fbModalCard}>
            <View style={styles.fbModalContent}>
              <Text style={styles.fbModalTitle}>Request QR Code</Text>
              <Text style={styles.fbModalMessage}>
                Send a request to the admin to generate your QR code?
              </Text>
            </View>
            <View style={styles.fbModalButtonContainer}>
              <TouchableOpacity
                style={[styles.fbModalCancelButton, qrRequestSending && styles.fbModalButtonDisabled]}
                disabled={qrRequestSending}
                onPress={() => setQrRequestVisible(false)}
              >
                <Text style={styles.fbModalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.fbModalConfirmButton,
                  { backgroundColor: '#004f89' },
                  qrRequestSending && styles.fbModalButtonDisabled
                ]}
                disabled={qrRequestSending}
                onPress={async () => {
                  if (!user?.studentId) { setQrRequestVisible(false); return; }
                  setQrRequestSending(true);
                  try {
                    // Rate-limit: if an existing request from this student is still present, block
                    const inboxRef = doc(db, 'admin_alerts', 'inbox');
                    const snap = await getDoc(inboxRef);
                    const items = snap.exists() && Array.isArray(snap.data()?.items) ? snap.data().items : [];
                    const existingForStudent = items.find(it => it?.type === 'qr_request' && String(it?.studentId) === String(user.studentId));

                    // If an existing request is still present in admin alerts, block new requests
                    if (existingForStudent) {
                      setFeedbackMessage('You already have a pending QR request. Please wait.');
                      setFeedbackSuccess(false);
                      setFeedbackVisible(true);
                      setQrRequestSending(false);
                      setQrRequestVisible(false);
                      setTimeout(() => setFeedbackVisible(false), 1500);
                      return;
                    }

                    // Local 1-hour cooldown is bypassed if the admin has deleted the previous request
                    // (i.e., no existing request in inbox). So we do not block here when no existing.
                    // We still record last sent time below to avoid accidental rapid re-taps.

                    const fullName = `${user?.firstName || ''} ${user?.lastName || ''}`.trim();
                    const yr = user?.yearLevel ? `${user.yearLevel}` : '';
                    const newItem = {
                      id: `${Date.now()}_${Math.random().toString(36).slice(2,8)}`,
                      type: 'qr_request',
                      title: 'Generate QR Code Request',
                      message: `${fullName} (${yr}) requested for QR code`.
                        replace(/\s+/g, ' ').trim(),
                      createdAt: new Date().toISOString(),
                      status: 'unread',
                      studentId: String(user.studentId),
                      studentName: fullName,
                      yearLevel: user?.yearLevel || '',
                    };
                    await setDoc(inboxRef, { items: [newItem, ...items].slice(0, 200) }, { merge: true });
                    try { await AsyncStorage.setItem(`qrRequestLastSent_${user.studentId}`, String(Date.now())); } catch {}
                    setFeedbackMessage('QR request sent to admin');
                    setFeedbackSuccess(true);
                    setFeedbackVisible(true);
                  } catch {}
                  setQrRequestSending(false);
                  setQrRequestVisible(false);
                  setTimeout(() => setFeedbackVisible(false), 1500);
                }}
              >
                <Text style={styles.fbModalConfirmText}>
                  {qrRequestSending ? 'Sending...' : 'Confirm'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Feedback Modal */}
      <Modal
        transparent
        animationType="fade"
        visible={feedbackVisible}
        onRequestClose={() => setFeedbackVisible(false)}
      >
        <View style={styles.modalOverlayCenter}>
          <View style={styles.fbModalCard}>
            <View style={styles.fbModalContent}>
              <Text style={[styles.fbModalTitle, { color: feedbackSuccess ? '#10B981' : '#DC2626' }]}>
                {feedbackSuccess ? 'Success' : 'Notice'}
              </Text>
              <Text style={styles.fbModalMessage}>{feedbackMessage}</Text>
            </View>
          </View>
        </View>
      </Modal>

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

    </>
  );
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
  qrContainer: {
    marginTop: 4,
    marginHorizontal: 0,
    marginBottom: 4,
  },
  Container: {
    borderRadius: wp(4),
    overflow: 'hidden',
    justifyContent: 'center',
    height: hp(22),
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#0F172A',
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 12,
    elevation: 4,
  },
  Image: { width: '100%', height: '100%' },
  subHeadingWrapper: { position: 'absolute', left: wp(8), top: '50%' },
  subHeadingText: {
    fontSize: fontSizes.lg,
    fontWeight: '500',
    color: '#fff',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 12, color: '#6B7280', fontSize: 16 },
  bottomNavWrapper: {
    position: 'absolute',
    bottom: hp(2),
    left: wp(4),
    right: wp(4),
  },
  bottomNav: {
    flexDirection: 'row',
    paddingVertical: hp(1.2),
    borderRadius: wp(4),
    borderWidth: 1,
    borderColor: '#e5e7eb',
    justifyContent: 'space-between',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: -2 },
    shadowRadius: 5,
    backgroundColor: '#fff',
  },
  navItem: { alignItems: 'center', flex: 1 },
  navItemActive: { alignItems: 'center', flex: 1 },
  navText: { fontSize: fontSizes.xs, marginTop: hp(0.2), color: '#111827' },
  navTextActive: { fontSize: fontSizes.xs, color: '#2563eb', marginTop: hp(0.2), fontWeight: '600' },
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
  // Empty state styles (mirrored from Parent Dashboard)
  emptyStateContainer: { 
    marginTop: 8, // Same gap as between cards and QR container (section marginBottom 8 + qrContainer marginTop 4 = 12, so qrContainer marginBottom 4 + this marginTop 8 = 12)
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  loadingStateContainer: { 
    marginTop: 8, // Reduced gap below QR button
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', minHeight: 500, marginTop: -50 },
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
    width: '100%',
  },
  emptyIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    marginTop: 0,
    marginBottom: 4,
  },
  emptySubtext: {
    fontSize: 12,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 16,
    marginBottom: 12,
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
  // Overview section styles (matching parent dashboard)
  section: { marginTop: 0, marginBottom: 8 },
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
    borderRadius: 10,
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
});

export default StudentDashboard;





