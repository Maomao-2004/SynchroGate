import React, { useContext, useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Dimensions, Image, Animated, Modal } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { AuthContext } from '../../contexts/AuthContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../utils/firebaseConfig';
import { getNetworkErrorMessage } from '../../utils/networkErrorHandler';

const DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
const UNIVERSAL_HEADER_COLOR = '#004F89';
const { width } = Dimensions.get('window');

const ParentSchedule = () => {
  // Add current time state for active schedule detection
  const [currentTime, setCurrentTime] = useState(new Date());
  const navigation = useNavigation();
  const { user, logout } = useContext(AuthContext);
  const [profilePic, setProfilePic] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [logoutVisible, setLogoutVisible] = useState(false);
  const sidebarAnimRight = useState(new Animated.Value(-width * 0.6))[0];

  const [children, setChildren] = useState([]); // [{id, firstName, lastName, studentId}]
  const [selectedChildId, setSelectedChildId] = useState(null);
  const [loadingChildren, setLoadingChildren] = useState(true);

  const [schedule, setSchedule] = useState([]); // [{subject, day, time}]
  const [studentName, setStudentName] = useState('');
  const [loadingSchedule, setLoadingSchedule] = useState(false);
  const [networkErrorVisible, setNetworkErrorVisible] = useState(false);
  const [networkErrorTitle, setNetworkErrorTitle] = useState('');
  const [networkErrorMessage, setNetworkErrorMessage] = useState('');
  const [networkErrorColor, setNetworkErrorColor] = useState('#DC2626');

  useEffect(() => {
    const loadProfile = async () => {
      try {
        if (!user?.parentId) { setProfilePic(null); return; }
        const savedProfile = await AsyncStorage.getItem(`parentProfilePic_${user.parentId}`);
        setProfilePic(savedProfile ? { uri: savedProfile } : null);
      } catch { setProfilePic(null); }
    };
    const unsub = navigation.addListener('focus', loadProfile);
    return unsub;
  }, [navigation, user?.parentId]);

  // Update current time every minute for active schedule detection
  useEffect(() => {
    const updateTime = () => {
      setCurrentTime(new Date());
    };
    
    // Update immediately
    updateTime();
    
    // Set up interval to update every minute
    const interval = setInterval(updateTime, 60000);
    
    return () => clearInterval(interval);
  }, []);

  // Load linked children using broader matching and merge duplicates
  useEffect(() => {
    const fetchChildren = async () => {
      if (!user?.uid) { 
        setChildren([]); 
        setLoadingChildren(false); 
        return; 
      }
      try {
        setLoadingChildren(true);
        console.log('Loading linked children for parent:', user.uid);
        
        const idsToMatch = [String(user.uid)].filter(Boolean);
        if (user?.parentId) idsToMatch.push(String(user.parentId));

        // Use 'in' query to match parentId against both uid and canonical parentId
        const linksQ = query(
          collection(db, 'parent_student_links'),
          where('parentId', 'in', Array.from(new Set(idsToMatch)))
        );
        const linksSnap = await getDocs(linksQ);
        console.log('Found links (pre-filter):', linksSnap.size);
        
        const byStudent = new Map();
        for (const d of linksSnap.docs) {
          const link = d.data();
          const status = String(link?.status || '').toLowerCase();
          if (status !== 'active') continue; // filter in memory for any case variants
          const studentUid = String(link?.studentId || '').trim();
          if (!studentUid) continue;
          const studentIdNumber = String(link?.studentIdNumber || '').trim();
          const fullName = String(link?.studentName || '').trim();
          const firstName = fullName.split(' ')[0] || fullName || 'Student';
          if (!byStudent.has(studentUid)) {
            byStudent.set(studentUid, {
              id: studentUid,
              studentId: studentIdNumber,
              firstName,
              lastName: '',
              relationship: link?.relationship || '',
            });
          }
        }
        
        const list = Array.from(byStudent.values());
        console.log('Collected children (unique, active):', list.length);
        setChildren(list);
        if (list.length && !selectedChildId) setSelectedChildId(list[0].id);
      } catch (error) {
        console.error('Error loading children:', error);
        // Only show network error modal for actual network errors
        if (error?.code?.includes('unavailable') || error?.code?.includes('network') || error?.message?.toLowerCase().includes('network')) {
          const errorInfo = getNetworkErrorMessage({ type: 'unstable_connection', message: error.message });
          setNetworkErrorTitle(errorInfo.title);
          setNetworkErrorMessage(errorInfo.message);
          setNetworkErrorColor(errorInfo.color);
          setNetworkErrorVisible(true);
          setTimeout(() => setNetworkErrorVisible(false), 5000);
        }
        setChildren([]);
      } finally { 
        setLoadingChildren(false); 
      }
    };
    fetchChildren();
  }, [user?.uid]);

  // Refresh linked children and schedule when navigating back to this screen
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', async () => {
      // Reload children with same broader matching
      try {
        const idsToMatch = [String(user?.uid || '')].filter(Boolean);
        if (user?.parentId) idsToMatch.push(String(user.parentId));
        const linksQ = query(
          collection(db, 'parent_student_links'),
          where('parentId', 'in', Array.from(new Set(idsToMatch)))
        );
        const linksSnap = await getDocs(linksQ);
        const byStudent = new Map();
        for (const d of linksSnap.docs) {
          const link = d.data();
          const status = String(link?.status || '').toLowerCase();
          if (status !== 'active') continue;
          const studentUid = String(link?.studentId || '').trim();
          if (!studentUid) continue;
          const studentIdNumber = String(link?.studentIdNumber || '').trim();
          const fullName = String(link?.studentName || '').trim();
          const firstName = fullName.split(' ')[0] || fullName || 'Student';
          if (!byStudent.has(studentUid)) {
            byStudent.set(studentUid, {
              id: studentUid,
              studentId: studentIdNumber,
              firstName,
              lastName: '',
              relationship: link?.relationship || '',
            });
          }
        }
        const list = Array.from(byStudent.values());
        setChildren(list);
        // Keep current selection if still present; otherwise select first
        if (list.length) {
          const stillExists = list.find(c => c.id === selectedChildId);
          setSelectedChildId(stillExists ? selectedChildId : list[0].id);
        } else {
          setSelectedChildId(null);
        }
      } catch (error) {
        console.error('Error loading children on focus:', error);
        // Only show network error modal for actual network errors
        if (error?.code?.includes('unavailable') || error?.code?.includes('network') || error?.message?.toLowerCase().includes('network')) {
          const errorInfo = getNetworkErrorMessage({ type: 'unstable_connection', message: error.message });
          setNetworkErrorTitle(errorInfo.title);
          setNetworkErrorMessage(errorInfo.message);
          setNetworkErrorColor(errorInfo.color);
          setNetworkErrorVisible(true);
          setTimeout(() => setNetworkErrorVisible(false), 5000);
        }
      }

      // Reload schedule for selected child (if any)
      try {
        if (selectedChildId) {
          const selectedChild = (prev => prev.find ? prev : children).find?.(c => c.id === selectedChildId) || children.find(c => c.id === selectedChildId);
          const studentIdNumber = selectedChild?.studentId;
          const studentUid = selectedChild?.id;
          if (studentIdNumber) {
            const schedRef = doc(db, 'schedules', studentIdNumber);
            const schedSnap = await getDoc(schedRef);
            let subjectsMap = {};
            let sName = selectedChild?.firstName || '';
            if (schedSnap.exists()) {
              const data = schedSnap.data();
              subjectsMap = data?.subjects || {};
              sName = data?.studentName || sName;
            } else if (studentUid) {
              // Fallback: some schedules may be stored under the student's UID
              const uidRef = doc(db, 'schedules', String(studentUid));
              const uidSnap = await getDoc(uidRef);
              if (uidSnap.exists()) {
                const data = uidSnap.data();
                subjectsMap = data?.subjects || {};
                sName = data?.studentName || sName;
              }
            }
            setStudentName(sName);
            const flattened = [];
            Object.keys(subjectsMap).forEach(subj => {
              const arr = Array.isArray(subjectsMap[subj]) ? subjectsMap[subj] : [];
              arr.forEach(e => flattened.push({ subject: subj, day: e.day, time: e.time }));
            });
            setSchedule(flattened);
          } else {
            setSchedule([]);
            setStudentName('');
          }
        } else {
          setSchedule([]);
          setStudentName('');
        }
      } catch {}
    });
    return unsubscribe;
  }, [navigation, user?.uid, selectedChildId, children]);

  // Helper function to convert time to minutes for comparison
  const timeToNumber = (timeString, ampm) => {
    const [h, m] = timeString.split(':').map(Number);
    let hour = h;
    if (ampm === 'PM' && h !== 12) hour += 12;
    if (ampm === 'AM' && h === 12) hour = 0;
    return hour * 60 + m;
  };

  // Function to check if current time is within a schedule entry
  const isCurrentlyActive = (timeString, day) => {
    const now = currentTime;
    const currentDay = DAYS[now.getDay() === 0 ? 6 : now.getDay() - 1]; // Convert Sunday=0 to our format
    
    if (currentDay !== day) return false;
    
    // Parse the time string (format: "HH:MM AM - HH:MM PM")
    const [startPart, endPart] = timeString.split(' - ');
    const [startTime, startAMPM] = startPart.split(' ');
    const [endTime, endAMPM] = endPart.split(' ');
    
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const startMinutes = timeToNumber(startTime, startAMPM);
    const endMinutes = timeToNumber(endTime, endAMPM);
    
    // Handle cases where end time might be next day (rare but possible)
    if (endMinutes < startMinutes) {
      // Schedule crosses midnight
      return currentMinutes >= startMinutes || currentMinutes <= endMinutes;
    } else {
      // Normal schedule within same day
      return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
    }
  };

  // Load schedule for selected child
  useEffect(() => {
    const fetchSchedule = async () => {
      if (!selectedChildId) { 
        setSchedule([]); 
        setStudentName(''); 
        return; 
      }
      try {
        setLoadingSchedule(true);
        
        // Find the selected child to get their identifiers
        const selectedChild = children.find(child => child.id === selectedChildId);
        if (!selectedChild) {
          console.log('Selected child not found in children list');
          setSchedule([]);
          setStudentName('');
          setLoadingSchedule(false);
          return;
        }
        
        const studentIdNumber = selectedChild.studentId;
        const studentUid = selectedChild.id;
        console.log('Fetching schedule for student ID:', studentIdNumber);
        
        if (!studentIdNumber) { 
          console.log('No student ID number available, will try UID fallback');
        }
        
        let subjectsMap = {};
        let sName = selectedChild.firstName || '';
        let found = false;
        if (studentIdNumber) {
          const schedRef = doc(db, 'schedules', studentIdNumber);
          const schedSnap = await getDoc(schedRef);
          if (schedSnap.exists()) {
            const data = schedSnap.data();
            subjectsMap = data?.subjects || {};
            sName = data?.studentName || selectedChild.firstName || '';
            console.log('Schedule data found by studentIdNumber:', data);
            found = true;
          }
        }
        
        // Fallback: try fetching by student UID if not found by studentIdNumber
        if (!found && studentUid) {
          console.log('Trying UID fallback for schedules using UID:', studentUid);
          const uidRef = doc(db, 'schedules', String(studentUid));
          const uidSnap = await getDoc(uidRef);
          if (uidSnap.exists()) {
            const data = uidSnap.data();
            subjectsMap = data?.subjects || {};
            sName = data?.studentName || sName;
            console.log('Schedule data found by UID:', data);
            found = true;
          } else {
            console.log('No schedule document found for UID fallback:', studentUid);
          }
        }
        
        setStudentName(sName);
        const flattened = [];
        Object.keys(subjectsMap).forEach(subj => {
          const arr = Array.isArray(subjectsMap[subj]) ? subjectsMap[subj] : [];
          arr.forEach(e => flattened.push({ subject: subj, day: e.day, time: e.time }));
        });
        
        console.log('Flattened schedule:', flattened);
        setSchedule(flattened);
      } catch (error) {
        console.error('Error fetching schedule:', error);
        // Only show network error modal for actual network errors
        if (error?.code?.includes('unavailable') || error?.code?.includes('network') || error?.message?.toLowerCase().includes('network')) {
          const errorInfo = getNetworkErrorMessage({ type: 'unstable_connection', message: error.message });
          setNetworkErrorTitle(errorInfo.title);
          setNetworkErrorMessage(errorInfo.message);
          setNetworkErrorColor(errorInfo.color);
          setNetworkErrorVisible(true);
          setTimeout(() => setNetworkErrorVisible(false), 5000);
        }
        setSchedule([]); 
      } finally { 
        setLoadingSchedule(false); 
      }
    };
    fetchSchedule();
  }, [selectedChildId, children]);

  const subjects = [...new Set(schedule.map(s => s.subject))];
  const getEntries = (day, subject) => schedule.filter(s => s.day === day && s.subject === subject)
    .sort((a,b) => {
      const toNum = (time) => {
        const [startPart] = time.split(' - ');
        const [t, ampm] = startPart.split(' ');
        const [h, m] = t.split(':').map(Number);
        let hh = h;
        if (ampm === 'PM' && h !== 12) hh = h + 12;
        if (ampm === 'AM' && h === 12) hh = 0;
        return hh * 60 + (m || 0);
      };
      return toNum(a.time) - toNum(b.time);
    });

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good Morning';
    if (hour < 18) return 'Good Afternoon';
    return 'Good Evening';
  };

  // Responsive cell sizes similar to student schedule UI
  const { width: screenWidth } = Dimensions.get('window');
  const isSmallScreen = screenWidth < 400;
  const dynamicStyles = {
    cell: {
      width: isSmallScreen ? 75 : 85,
      height: isSmallScreen ? 60 : 70,
      borderWidth: 1.5,
      borderColor: '#E5E7EB',
      justifyContent: 'center',
      alignItems: 'center',
    },
    headerText: {
      fontWeight: '700',
      color: '#ffffff',
      fontSize: isSmallScreen ? 8 : 9,
      textAlign: 'center',
    },
    subjectText: {
      fontWeight: '600',
      color: '#111827',
      fontSize: isSmallScreen ? 8 : 9,
      textAlign: 'center',
      paddingHorizontal: 2,
      flexShrink: 1,
    },
    entryText: {
      color: '#fff',
      fontWeight: '600',
      textAlign: 'center',
      fontSize: isSmallScreen ? 7 : 8,
      paddingHorizontal: 2,
      maxWidth: '100%',
      flexWrap: 'wrap',
    },
  };
  const tableMaxHeight = (isSmallScreen ? 60 : 70) * 7; // mirror student table scroll height

  const toggleSidebar = (open) => {
    Animated.timing(sidebarAnimRight, {
      toValue: open ? 0 : -width * 0.6,
      duration: 300,
      useNativeDriver: false,
    }).start();
    setSidebarOpen(open);
  };

  const handleLogout = () => { setLogoutVisible(true); toggleSidebar(false); };
  const confirmLogout = async () => {
    setLogoutVisible(false);
    toggleSidebar(false);
    try { await logout?.(); } catch {}
  };
  const cancelLogout = () => setLogoutVisible(false);

  return (
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
          style={styles.sidebarItem}
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
          <Ionicons name="home-outline" size={20} color="#111827" />
          <Text style={styles.sidebarText}>Dashboard</Text>
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
          style={[styles.sidebarItem, styles.activeSidebarItem]}
          onPress={() => {
            toggleSidebar(false);
            try {
              const parentNav = navigation.getParent?.();
              if (parentNav) parentNav.navigate('ScheduleTab');
              else navigation.navigate('ScheduleTab');
            } catch { navigation.navigate('ScheduleTab'); }
          }}
        >
          <Ionicons name="calendar-outline" size={20} color="#2563EB" />
          <Text style={[styles.sidebarText, styles.activeSidebarText]}>Schedules</Text>
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

      <ScrollView 
        style={{ flex: 1 }}
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={true}
        bounces={true}
        nestedScrollEnabled={true}
      >

        {loadingChildren ? (
          <View style={{ flex: 1, backgroundColor: '#FFFFFF' }} />
        ) : children.length === 0 ? (
          <View style={styles.centerContainer}>
            <View style={styles.emptyCard}>
              <View style={styles.emptyIconWrap}>
                <View style={{ position: 'relative', width: 28, height: 28, alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="calendar-outline" size={28} color="#2563EB" />
                  <View style={{ position: 'absolute', width: 32, height: 2, backgroundColor: '#2563EB', transform: [{ rotate: '45deg' }] }} />
                </View>
              </View>
              <Text style={styles.emptyTitle}>Schedules Unavailable</Text>
              <Text style={styles.emptySubtext}>
                You need to link your children to your account before you can view their schedules. Connect with your students to start monitoring their class schedules and activities.
              </Text>
            </View>
          </View>
        ) : (
          <View>
            {/* Legend in its own container */}
            <View style={styles.legendContainer}>
              <View style={styles.legendRow}>
                <View style={[styles.legendChip, { backgroundColor: UNIVERSAL_HEADER_COLOR }]} />
                <Text style={styles.legendText}>Scheduled</Text>
                <View style={[styles.legendChip, { backgroundColor: '#DC2626' }]} />
                <Text style={styles.legendText}>Happening Now</Text>
              </View>
            </View>
            <View style={styles.buttonsTableContainer}>
              <View style={[styles.chipsWrap, { paddingRight: 4 }]}>
                {children.map((child, index) => {
                  const isLast = index === children.length - 1;
                  return (
                    <TouchableOpacity
                      key={child.id}
                      style={[styles.childChip, selectedChildId === child.id ? styles.childChipActive : null, isLast && styles.childChipLast]}
                      onPress={() => setSelectedChildId(child.id)}
                    >
                      <Text style={[styles.childChipText, selectedChildId === child.id ? styles.childChipTextActive : null]}>
                        {child.firstName}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {subjects.length === 0 ? (
              <View style={styles.centerContainer}>
                <View style={styles.emptyCard}>
                  <View style={styles.emptyIconWrap}>
                    <View style={{ position: 'relative', width: 28, height: 28, alignItems: 'center', justifyContent: 'center' }}>
                      <Ionicons name="calendar-outline" size={28} color="#2563EB" />
                      <View style={{ position: 'absolute', width: 32, height: 2, backgroundColor: '#2563EB', transform: [{ rotate: '45deg' }] }} />
                    </View>
                  </View>
                  <Text style={styles.emptyTitle}>Schedules Unavailable</Text>
                  <Text style={styles.emptySubtext}>
                    No schedule available for the selected student.
                  </Text>
                </View>
              </View>
            ) : (
               <>
                 <View style={styles.tableScrollContainer}>
                   <ScrollView 
                     horizontal 
                     showsHorizontalScrollIndicator={true} 
                     persistentScrollbar={true}
                     style={styles.horizontalScrollView}
                     contentContainerStyle={styles.scrollContentContainer}
                     nestedScrollEnabled={true}
                     scrollEnabled={true}
                   >
                     <View style={styles.tableContainer}>
                       <View style={styles.row}>
                         <View style={[dynamicStyles.cell, styles.headerCell, { width: isSmallScreen ? 90 : 100 }]}>
                           <Text style={dynamicStyles.headerText}>Subject</Text>
                         </View>
                         {DAYS.map(d => (
                           <View key={d} style={[dynamicStyles.cell, styles.headerCell]}>
                             <Text style={dynamicStyles.headerText}>{d.slice(0,3)}</Text>
                           </View>
                         ))}
                       </View>
                       <View style={styles.tableBody}>
                         {subjects.map((subject, rowIndex) => (
                           <View key={subject || `row-${rowIndex}`} style={styles.row}>
                             <View style={[dynamicStyles.cell, styles.subjectCell, { width: isSmallScreen ? 90 : 100 }]}>
                               <Text style={dynamicStyles.subjectText} numberOfLines={2}>{subject || '-'}</Text>
                             </View>
                             {DAYS.map(day => {
                               const entry = schedule.find(s => s.day === day && s.subject === subject);
                               if (!entry) {
                                 return (
                                   <View key={day} style={[dynamicStyles.cell, styles.bodyCell, { justifyContent: 'center', alignItems: 'center', paddingVertical: 4 }]}>
                                     <Text style={[dynamicStyles.entryText, { color: '#9CA3AF' }]}>-</Text>
                                   </View>
                                 );
                               }
                               const active = isCurrentlyActive(entry.time, day);
                               return (
                                 <View key={day} style={[dynamicStyles.cell, styles.bodyCell, { justifyContent: 'center', alignItems: 'center', paddingVertical: 4 }]}>
                                   <View style={[styles.entryPill, { backgroundColor: active ? '#DC2626' : UNIVERSAL_HEADER_COLOR, marginVertical: 2 }]}>
                                     <Text style={dynamicStyles.entryText}>{entry.time}</Text>
                                   </View>
                                 </View>
                               );
                             })}
                           </View>
                         ))}
                       </View>
                     </View>
                   </ScrollView>
                 </View>
              </>
            )}
          </View>
        )}
      </ScrollView>
      
      <Modal
        transparent
        animationType="fade"
        visible={logoutVisible}
        onRequestClose={() => setLogoutVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
              <View style={[styles.modalIconWrap, { backgroundColor: '#FEE2E2' }] }>
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
    </View>
  );
};

export default ParentSchedule;
const styles = StyleSheet.create({
  wrapper: { flex: 1, backgroundColor: '#F9FAFB' },
  container: { padding: 16, paddingBottom: 120, paddingTop: 50, flexGrow: 1 },
  scheduleContainer: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 16,
    marginTop: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 2,
    overflow: 'hidden'
  },
  legendContainer: {
    backgroundColor: '#fff',
    borderRadius: 8,
    paddingTop: 8,
    paddingBottom: 8,
    paddingLeft: 10,
    paddingRight: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginTop: 12,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 8,
    elevation: 4,
  },
  separator: {
    height: 1,
    backgroundColor: '#E5E7EB',
    marginTop: 8,
    marginBottom: 12,
    marginHorizontal: 0,
  },
  headerRow: {
    position: 'absolute', top: 0, left: 0, right: 0,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 20, paddingTop: 50,
    zIndex: 5, backgroundColor: '#004f89', shadowColor: '#000', shadowOpacity: 0.05, shadowOffset: { width: 0, height: 2 }, shadowRadius: 5,
    borderBottomEndRadius: 15,
    borderBottomStartRadius: 15,
  },
  profileContainer: { flexDirection: 'row', alignItems: 'center' },
  avatar: { width: 50, height: 50, borderRadius: 30, marginRight: 8 },
  greeting: { fontSize: 20, fontWeight: '600', color: '#FFFFFF' },
  iconButton: { marginRight: 12 },
  sectionHeader: { 
    marginBottom: 16,
    alignItems: 'center',
    justifyContent: 'center'
  },
  sectionTitle: { 
    fontSize: 25, 
    fontWeight: '600', 
    color: '#111827', 
    marginBottom: 5,
    textAlign: 'center'
  },
  centerContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', marginTop: 100 },
  loadingContainer: { alignItems: 'center', justifyContent: 'center', paddingVertical: 40 },
  loadingText: { marginTop: 12, color: '#6B7280', fontSize: 16 },
  emptyCard: { backgroundColor: '#fff', borderRadius: 8, padding: 16, alignItems: 'center', borderWidth: 1, borderColor: '#E5E7EB', shadowColor: '#0F172A', shadowOpacity: 0.08, shadowOffset: { width: 0, height: 6 }, shadowRadius: 12, elevation: 4, width: '100%' },
  emptyText: { color: '#6B7280' },
  emptyIconWrap: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: '#111827', marginTop: 0, marginBottom: 4 },
  emptySubtext: {
    fontSize: 12,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 16,
    marginBottom: 12,
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
  childChipLast: {
    marginRight: 0,
  },
  chipsWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'nowrap',
    justifyContent: 'flex-start',
  },
  tableScrollContainer: { 
    marginTop: 12, 
    marginBottom: 12,
    marginLeft: 0, 
    width: '100%',
    maxWidth: '100%'
  },
  horizontalScrollView: {
    // Removed maxHeight to allow table to expand fully and scroll with main screen
  },
  scrollContentContainer: {
    alignItems: 'flex-start',
  },
  buttonsTableContainer: { marginTop: 12, paddingLeft: 0, paddingRight: 0, marginBottom: 8 },
  buttonsTableCard: {
    backgroundColor: '#fff',
    borderRadius: 8,
    paddingTop: 8,
    paddingBottom: 8,
    paddingLeft: 10,
    paddingRight: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginTop: 0,
    marginBottom: 12
  },
  legendRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, marginTop: 4, marginBottom: 4 },
  legendChip: { width: 10, height: 10, borderRadius: 5, marginRight: 6 },
  legendText: { marginRight: 14, color: '#374151', fontSize: 12, paddingTop: 2 },
  tableContainer: { 
    borderWidth: 0, 
    borderColor: 'transparent', 
    borderRadius: 0, 
    overflow: 'visible', 
    backgroundColor: '#fff',
  },
  tableBody: {
    flexDirection: 'column',
  },
  row: { flexDirection: 'row' },
  cell: { 
    borderWidth: 1.5, 
    borderColor: '#E5E7EB', 
    justifyContent: 'center', 
    alignItems: 'center' 
  },
  headerCell: { backgroundColor: '#000' },
  subjectHeaderCell: { 
    backgroundColor: '#000', 
    borderWidth: 0.5, 
    borderColor: '#E5E7EB', 
    justifyContent: 'center', 
    alignItems: 'center' 
  },
  subjectCell: { 
    backgroundColor: '#fff'
  },
  dayCell: { },
  bodyCell: { 
    backgroundColor: '#fff', 
    paddingHorizontal: 4 
  },
  headerText: { color: '#fff', fontWeight: '700', fontSize: 9 },
  subjectPill: { backgroundColor: '#000', paddingVertical: 4, paddingHorizontal: 6, borderRadius: 6, maxWidth: '95%' },
  subjectText: { 
    color: '#111827', 
    fontWeight: '600', 
    fontSize: 9, 
    textAlign: 'center',
    paddingHorizontal: 2,
    flexShrink: 1
  },
  entryPill: { paddingVertical: 2, paddingHorizontal: 4, borderRadius: 4, marginVertical: 2, maxWidth: '100%', minWidth: '90%' },
  entryText: { color: '#fff', fontWeight: '600', fontSize: 8, textAlign: 'center' },
  // Sidebar styles copied from Dashboard for consistency
  sidebar: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: Dimensions.get('window').width * 0.6,
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
  sidebarText: { fontSize: 16, marginLeft: 12 },
  activeSidebarItem: {
    backgroundColor: '#EFF6FF',
    borderRadius: 8,
    marginVertical: 2,
  },
  activeSidebarText: { color: '#2563EB', fontWeight: '600' },
  logoutItem: { marginTop: 20 },
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(17,24,39,0.25)', zIndex: 9 },
  // Modal styles - exactly matching Dashboard.js
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
