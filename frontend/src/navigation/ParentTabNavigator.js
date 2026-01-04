// src/navigation/ParentTabNavigator.js
import React, { useEffect, useState, useContext, useRef } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { getFocusedRouteNameFromRoute, CommonActions } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { doc, onSnapshot, collection, query, where, getDocs, orderBy, limit, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../utils/firebaseConfig';
import { AuthContext } from '../contexts/AuthContext';
import { PARENT_TAB_BAR_STYLE } from './tabStyles';

import Dashboard from '../screens/Parent/Dashboard';
import Profile from '../screens/Parent/Profile';
import LinkStudents from '../screens/Parent/LinkStudents';
import StudentProfile from '../screens/Parent/StudentProfile';
import Alerts from '../screens/Parent/Alerts';
import Schedule from '../screens/Parent/Schedule';
import Messages from '../screens/Parent/Messages';
import Conversation from '../screens/Parent/Conversation';
import Events from '../screens/Parent/Events';
import AttendanceLog from '../screens/Parent/AttendanceLog';
import About from '../screens/Parent/About';
import Menu from '../screens/Parent/Menu';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

function HomeStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
      <Stack.Screen name="ParentDashboard" component={Dashboard} />
      <Stack.Screen name="Profile" component={Profile} />
      <Stack.Screen name="Events" component={Events} />
      <Stack.Screen name="AttendanceLog" component={AttendanceLog} />
      <Stack.Screen name="LinkedStudents" component={LinkStudents} />
      <Stack.Screen name="StudentProfile" component={StudentProfile} />
      <Stack.Screen name="About" component={About} />
      <Stack.Screen name="Menu" component={Menu} />
    </Stack.Navigator>
  );
}

function MessagesStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
      <Stack.Screen name="ParentMessages" component={Messages} />
      <Stack.Screen name="ParentConversation" component={Conversation} />
    </Stack.Navigator>
  );
}

export default function ParentTabNavigator() {
  const navigation = useNavigation();
  const { user } = useContext(AuthContext);
  const [alertsTick, setAlertsTick] = useState(0);
  const [alertsUnread, setAlertsUnread] = useState(0);

  // Global realtime listener to keep Alerts hot even when not focused
  // Must use same logic as Parent Alerts getParentDocId to ensure consistency
  useEffect(() => {
    if (!user?.uid) return;
    
    let unsub = null;
    
    const setupListener = async () => {
      try {
        // Use same resolution logic as Parent Alerts getParentDocId
        let parentDocId = String(user?.parentId || '').trim();
        
        // First try: if user.parentId already includes '-', it's canonical
        if (!parentDocId || !parentDocId.includes('-')) {
          // Second try: query users collection by UID to get canonical parentId
          try {
            const qSnap = await getDocs(query(collection(db, 'users'), where('uid', '==', String(user?.uid || '')), where('role', '==', 'parent')));
            if (!qSnap.empty) {
              const data = qSnap.docs[0].data() || {};
              const cand = String(data.parentId || data.parentIdCanonical || '').trim();
              if (cand && cand.includes('-')) {
                parentDocId = cand;
              }
            }
          } catch {}
          
          // Third try: get from parent_student_links (query by UID)
          if (!parentDocId || !parentDocId.includes('-')) {
            try {
              const linksQ = query(collection(db, 'parent_student_links'), where('parentId', '==', user.uid), where('status', '==', 'active'));
              const linksSnap = await getDocs(linksQ);
              if (!linksSnap.empty) {
                const linkData = linksSnap.docs[0].data();
                const canonicalId = String(linkData.parentIdNumber || linkData.parentNumber || linkData.parentId || '').trim();
                if (canonicalId && canonicalId.includes('-')) {
                  parentDocId = canonicalId;
                }
              }
            } catch {}
          }
          
          // Fallback to UID if no canonical ID found
          if (!parentDocId || !parentDocId.includes('-')) {
            parentDocId = String(user?.uid || '').trim();
          }
        }
        
        if (!parentDocId) return;
        
        console.log('🔍 PARENT BADGE: Listening to parent_alerts document:', parentDocId);
        const ref = doc(db, 'parent_alerts', parentDocId);
        unsub = onSnapshot(ref, (snap) => {
          try {
            const items = snap.exists() ? (Array.isArray(snap.data()?.items) ? snap.data().items : []) : [];
            // Count all unread notifications including link_response
            const unreadCount = items.filter(it => {
              const status = String(it?.status || 'unread').toLowerCase();
              return status === 'unread';
            }).length;
            setAlertsUnread(unreadCount);
            setAlertsTick((t) => t + 1);
            console.log('🔍 PARENT BADGE: Updated unread count:', unreadCount, 'from', items.length, 'total items');
          } catch (error) {
            console.error('Error in parent alerts badge listener:', error);
          }
        }, (error) => {
          console.error('Error setting up parent alerts badge listener:', error);
        });
      } catch (error) {
        console.error('Error in setupListener:', error);
      }
    };
    
    setupListener();
    
    return () => {
      if (unsub) {
        try {
          unsub();
        } catch {}
      }
    };
  }, [user?.uid, user?.parentId]);
  const [parentUnread, setParentUnread] = useState(0);
  const [childrenUnread, setChildrenUnread] = useState(0);
  const [messagesUnread, setMessagesUnread] = useState(0);
  const childUnsubsRef = useRef([]);
  const childCountsRef = useRef({});
  const msgUnsubsRef = useRef([]);
  const convStateRef = useRef({});

  useEffect(() => {
    // cleanup old message listeners
    msgUnsubsRef.current.forEach(u => { try { u && u(); } catch {} });
    msgUnsubsRef.current = [];
    convStateRef.current = {};
    setMessagesUnread(0);

    if (!user?.uid) { return undefined; }
    const linksQ = query(collection(db, 'parent_student_links'), where('parentId', '==', user.uid), where('status', '==', 'active'));
    const unsubLinks = onSnapshot(linksQ, (linksSnap) => {
      try {
        // reset on each change
        msgUnsubsRef.current.forEach(u => { try { u && u(); } catch {} });
        msgUnsubsRef.current = [];
        convStateRef.current = {};
        setMessagesUnread(0);

        const links = linksSnap.docs.map(d => d.data()).filter(Boolean);
        links.forEach((l) => {
          const studentKey = l.studentIdNumber || l.studentId;
          const parentKey = user?.parentId || user?.uid;
          if (!studentKey || !parentKey) return;
          const convId = `${studentKey}-${parentKey}`;
          if (!convStateRef.current[convId]) convStateRef.current[convId] = { lastCreatedAtMs: 0, lastSenderId: null, lastReadAtMs: 0 };
          // latest message
          const unsubMsg = onSnapshot(query(collection(db, 'conversations', convId, 'messages'), orderBy('createdAt', 'desc'), limit(1)), (snap) => {
            const d = snap.docs[0]?.data();
            const createdAtMs = d?.createdAt?.toMillis ? d.createdAt.toMillis() : 0;
            convStateRef.current[convId].lastCreatedAtMs = createdAtMs || 0;
            convStateRef.current[convId].lastSenderId = d?.senderId || null;
            const total = Object.values(convStateRef.current).reduce((acc, s) => acc + ((s.lastCreatedAtMs && (s.lastReadAtMs || 0) < s.lastCreatedAtMs && s.lastSenderId !== user?.uid) ? 1 : 0), 0);
            setMessagesUnread(total);
          }, () => {});
          msgUnsubsRef.current.push(unsubMsg);
          // read receipt
          const unsubRead = onSnapshot(doc(db, 'conversations', convId, 'reads', user?.uid), (readSnap) => {
            const lastReadAt = readSnap.exists() ? readSnap.data()?.lastReadAt : null;
            const lastReadAtMs = lastReadAt?.toMillis ? lastReadAt.toMillis() : 0;
            convStateRef.current[convId].lastReadAtMs = lastReadAtMs || 0;
            const total = Object.values(convStateRef.current).reduce((acc, s) => acc + ((s.lastCreatedAtMs && (s.lastReadAtMs || 0) < s.lastCreatedAtMs && s.lastSenderId !== user?.uid) ? 1 : 0), 0);
            setMessagesUnread(total);
          }, () => {});
          msgUnsubsRef.current.push(unsubRead);
        });
      } catch {
        setMessagesUnread(0);
      }
    }, () => setMessagesUnread(0));

    return () => {
      try { unsubLinks && unsubLinks(); } catch {}
      msgUnsubsRef.current.forEach(u => { try { u && u(); } catch {} });
      msgUnsubsRef.current = [];
      convStateRef.current = {};
    };
  }, [user?.uid]);

  useEffect(() => {
    if (!user?.uid) {
      setParentUnread(0);
      return undefined;
    }
    let unsub;
    let unsubLinks;
    (async () => {
      try {
        // Resolve canonical parent alerts doc id (prefer formatted parentId like 0000-00000)
        const resolveParentDocId = async () => {
          const direct = String(user?.parentId || '').trim();
          if (direct && direct.includes('-')) return direct;
          try {
            const uSnap = await (await import('firebase/firestore')).getDoc((0, (await import('firebase/firestore')).doc)(db, 'users', String(user?.uid || '')));
            if (uSnap.exists()) {
              const d = uSnap.data() || {};
              const cands = [d.parentId, d.parentID, d.parent_id, d.ParentId, d.ParentID].map(v => (v == null ? null : String(v).trim()));
              const found = cands.find(v => v && v.includes('-'));
              if (found) return found;
            }
          } catch {}
          return String(user?.uid || '');
        };
        // Listen to linked students and filter parent_alerts accordingly
        const linksQ = query(collection(db, 'parent_student_links'), where('parentId', '==', user.uid), where('status', '==', 'active'));
        unsubLinks = onSnapshot(linksQ, (linksSnap) => {
          const linkedIds = linksSnap.docs
            .map(d => d.data())
            .filter(l => {
              const s = String(l?.status || '').toLowerCase();
              return s === 'active';
            })
            .map(l => l?.studentId)
            .filter(Boolean);
          const startSub = async () => {
            const docId = await resolveParentDocId();
            const ref = doc(db, 'parent_alerts', docId);
            try { unsub && unsub(); } catch {}
            unsub = onSnapshot(ref, (snap) => {
              const items = snap.exists() ? (snap.data()?.items || []) : [];
              const requiresLinkedStudent = (t) => (
                t === 'schedule_current' ||
                t === 'class_happening'
              );
              const filtered = items.filter((it) => {
                if (!requiresLinkedStudent(it?.type)) return true;
                const sid = String(it?.studentId || '');
                return sid && linkedIds.includes(sid);
              });
              const count = filtered.filter((it) => it?.status !== 'read').length;
              setParentUnread(count);
            }, () => setParentUnread(0));
          };
          startSub();
        }, () => setParentUnread(0));
      } catch {
        setParentUnread(0);
      }
    })();
    return () => { try { unsub && unsub(); } catch {}; try { unsubLinks && unsubLinks(); } catch {} };
  }, [user?.uid]);

  // Background mirror: keep parent_alerts schedule_current in sync without opening Alerts screen
  useEffect(() => {
    if (!user?.uid) return undefined;
    let scheduleUnsubs = {};
    let unsubLinks;

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

    const resolveParentDocId = async () => {
      const direct = String(user?.parentId || '').trim();
      if (direct && direct.includes('-')) return direct;
      try {
        const uSnap = await getDoc(doc(db, 'users', String(user?.uid || '')));
        if (uSnap.exists()) {
          const d = uSnap.data() || {};
          const cands = [d.parentId, d.parentID, d.parent_id, d.ParentId, d.ParentID].map(v => (v == null ? null : String(v).trim()));
          const found = cands.find(v => v && v.includes('-'));
          if (found) return found;
        }
      } catch {}
      return String(user?.uid || '');
    };

    const DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];

    const unsubLinksFn = onSnapshot(query(collection(db, 'parent_student_links'), where('parentId', '==', user.uid), where('status', '==', 'active')),
      (linksSnap) => {
        try {
          const studentIds = Array.from(new Set(linksSnap.docs.map(d => d.data()?.studentId).filter(Boolean).map(String)));
          // Unsubscribe removed
          Object.keys(scheduleUnsubs).forEach((sid) => {
            if (!studentIds.includes(sid)) { try { scheduleUnsubs[sid] && scheduleUnsubs[sid](); } catch {} delete scheduleUnsubs[sid]; }
          });
          // Subscribe added
          studentIds.forEach((sid) => {
            if (scheduleUnsubs[sid]) return;
            const sRef = doc(db, 'schedules', String(sid));
            scheduleUnsubs[sid] = onSnapshot(sRef, async (ssnap) => {
              try {
                if (!ssnap.exists()) {
                  // Schedule doesn't exist - remove all schedule_current notifications for this student
                  const parentDocId = await resolveParentDocId();
                  const parentAlertsRef = doc(db, 'parent_alerts', parentDocId);
                  const latestSnap = await getDoc(parentAlertsRef);
                  if (latestSnap.exists()) {
                    const pItems = Array.isArray(latestSnap.data()?.items) ? latestSnap.data().items : [];
                    const updated = pItems.filter(it => !(it?.type === 'schedule_current' && String(it?.studentId) === String(sid)));
                    if (updated.length !== pItems.length) {
                      await setDoc(parentAlertsRef, { items: updated }, { merge: true });
                      console.log('🧹 ParentTabNavigator: Removed schedule_current notifications - schedule does not exist for student:', sid);
                    }
                  }
                  return;
                }
                const now = new Date();
                const currentDay = DAYS[now.getDay() === 0 ? 6 : now.getDay() - 1];
                const subjectsAny = ssnap.data()?.subjects;
                const activeList = [];
                if (subjectsAny && !Array.isArray(subjectsAny) && typeof subjectsAny === 'object') {
                  Object.keys(subjectsAny).forEach(subj => {
                    const entries = Array.isArray(subjectsAny[subj]) ? subjectsAny[subj] : [];
                    for (const e of entries) {
                      const t = e?.time || e?.Time; const d = e?.day || e?.Day || e?.dayOfWeek;
                      if ((d === currentDay || String(d || '').toLowerCase() === String(currentDay).toLowerCase()) && isNowWithin(t)) {
                        const todayKey = `${currentDay}_${subj}_${t}_${now.getFullYear()}-${now.getMonth()+1}-${now.getDate()}`;
                        activeList.push({ subject: subj, time: t, currentKey: todayKey });
                      }
                    }
                  });
                } else if (Array.isArray(subjectsAny)) {
                  for (const e of subjectsAny) {
                    const t = e?.time || e?.Time; const d = e?.day || e?.Day || e?.dayOfWeek; const subj = e?.subject || e?.Subject;
                    if ((d === currentDay || String(d || '').toLowerCase() === String(currentDay).toLowerCase()) && isNowWithin(t)) {
                      const todayKey = `${currentDay}_${subj}_${t}_${now.getFullYear()}-${now.getMonth()+1}-${now.getDate()}`;
                      activeList.push({ subject: subj, time: t, currentKey: todayKey });
                    }
                  }
                }

                const parentDocId = await resolveParentDocId();
                const parentAlertsRef = doc(db, 'parent_alerts', parentDocId);
                const latestSnap = await getDoc(parentAlertsRef);
                const pItems = latestSnap.exists() ? (Array.isArray(latestSnap.data()?.items) ? latestSnap.data().items : []) : [];
                
                // Fetch student name if we have active classes
                let studentName = 'Student';
                if (activeList.length > 0) {
                  try {
                    // Try to get from parent_student_links first
                    const linksQ = query(
                      collection(db, 'parent_student_links'),
                      where('parentId', '==', user?.parentId || user?.uid),
                      where('studentId', '==', sid),
                      where('status', '==', 'active')
                    );
                    const linksSnap = await getDocs(linksQ);
                    if (!linksSnap.empty) {
                      studentName = linksSnap.docs[0].data()?.studentName || 'Student';
                    }
                    
                    // Fallback: If still 'Student', fetch from users collection
                    if (studentName === 'Student' || !studentName || studentName.trim() === '') {
                      const userRef = doc(db, 'users', String(sid));
                      const userSnap = await getDoc(userRef);
                      if (userSnap.exists()) {
                        const userData = userSnap.data();
                        const firstName = userData.firstName || '';
                        const lastName = userData.lastName || '';
                        const fullName = `${firstName} ${lastName}`.trim();
                        if (fullName) {
                          studentName = fullName;
                        } else {
                          // Try other name fields as fallback
                          const altName = userData.fullName || userData.displayName || userData.studentName || userData.name;
                          if (altName && String(altName).trim()) {
                            studentName = String(altName).trim();
                          }
                        }
                      }
                    }
                  } catch (error) {
                    console.warn('Error fetching student name in ParentTabNavigator:', error);
                  }
                }
                
                const currentKeys = new Set(activeList.map(a => a.currentKey));
                let nextItems = pItems.filter((it) => {
                  if (!(it?.type === 'schedule_current' && String(it?.studentId) === String(sid))) return true;
                  const timeNow = isNowWithin(it.time);
                  const keyMismatch = currentKeys.size > 0 && !currentKeys.has(String(it.currentKey));
                  return timeNow || !keyMismatch;
                });
                // Create schedule_current notifications for active classes
                for (const a of activeList) {
                  const exists = nextItems.some(it => it?.type === 'schedule_current' && String(it?.studentId) === String(sid) && it?.currentKey === a.currentKey);
                  if (!exists) {
                    nextItems.push({
                      id: `sched_current_${sid}_${a.currentKey}`,
                      type: 'schedule_current',
                      title: 'Class Happening Now',
                      message: `${studentName}'s ${a.subject} is happening now (${a.time}).`,
                      createdAt: new Date().toISOString(),
                      status: 'unread',
                      parentId: parentDocId,
                      studentId: String(sid),
                      studentName: studentName,
                      subject: a.subject,
                      time: a.time,
                      currentKey: a.currentKey,
                    });
                  }
                }
                if (JSON.stringify(nextItems) !== JSON.stringify(pItems)) {
                  await setDoc(parentAlertsRef, { items: nextItems }, { merge: true });
                }
              } catch {}
            }, () => {});
          });
        } catch {}
      }, () => {});

    unsubLinks = unsubLinksFn;

    return () => {
      try { unsubLinks && unsubLinks(); } catch {}
      Object.values(scheduleUnsubs).forEach((u) => { try { u && u(); } catch {} });
      scheduleUnsubs = {};
    };
  }, [user?.uid, user?.parentId]);

  // Aggregate unread from children's alerts collection (live updates as links change)
  useEffect(() => {
    // cleanup previous listeners
    childUnsubsRef.current.forEach(unsub => { try { unsub && unsub(); } catch {} });
    childUnsubsRef.current = [];
    childCountsRef.current = {};

    if (!user?.uid) { setChildrenUnread(0); return; }

    const linksQ = query(collection(db, 'parent_student_links'), where('parentId', '==', user.uid), where('status', '==', 'active'));
    const unsubLinks = onSnapshot(linksQ, (linksSnap) => {
      try {
        // tear down existing child listeners
        childUnsubsRef.current.forEach(unsub => { try { unsub && unsub(); } catch {} });
        childUnsubsRef.current = [];
        childCountsRef.current = {};

        const childIds = linksSnap.docs.map(d => d.data()?.studentId).filter(Boolean);
        if (!childIds.length) { setChildrenUnread(0); return; }

        childIds.forEach((sid) => {
          const childRef = doc(db, 'student_alerts', sid);
          const unsub = onSnapshot(childRef, (snap) => {
            const items = snap.exists() ? (snap.data()?.items || []) : [];
            const count = items.filter((it) => it?.status !== 'read').length;
            childCountsRef.current[sid] = count;
            const sum = Object.values(childCountsRef.current).reduce((a, b) => a + (Number(b) || 0), 0);
            setChildrenUnread(sum);
          }, () => {
            childCountsRef.current[sid] = 0;
            const sum = Object.values(childCountsRef.current).reduce((a, b) => a + (Number(b) || 0), 0);
            setChildrenUnread(sum);
          });
          childUnsubsRef.current.push(unsub);
        });
      } catch {
        setChildrenUnread(0);
      }
    }, () => setChildrenUnread(0));

    return () => {
      try { unsubLinks && unsubLinks(); } catch {}
      childUnsubsRef.current.forEach(unsub => { try { unsub && unsub(); } catch {} });
      childUnsubsRef.current = [];
      childCountsRef.current = {};
    };
  }, [user?.uid]);

  const navigateSafe = (target) => {
    try {
      const parentNav = navigation.getParent?.();
      if (parentNav) parentNav.navigate(target.name, target.params || {});
      else navigation.navigate(target.name, target.params || {});
    } catch { /* noop */ }
  };

  return (
    <Tab.Navigator
      initialRouteName="Home"
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarShowLabel: false,
        tabBarActiveTintColor: '#0078cf',
        tabBarInactiveTintColor: '#FFFFFF',
        tabBarSafeAreaInsets: { bottom: 0 },
        tabBarStyle: PARENT_TAB_BAR_STYLE,
        sceneContainerStyle: { paddingTop: 110 },
        tabBarButton: (props) => {
          const { accessibilityState } = props;
          const isFocused = accessibilityState?.selected;
          return (
            <TouchableOpacity
              {...props}
              activeOpacity={0.7}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              style={[
                {
                  flex: 1,
                  alignItems: 'center',
                  justifyContent: 'center',
                  paddingVertical: 8,
                  borderRadius: 8,
                  marginHorizontal: 4,
                  backgroundColor: isFocused ? 'rgba(0, 120, 207, 0.2)' : 'transparent',
                },
                props.style,
              ]}
            />
          );
        },
        tabBarIcon: ({ color, size, focused }) => {
          let icon = 'home';
          switch (route.name) {
            case 'ScheduleTab': icon = focused ? 'calendar' : 'calendar-outline'; break;
            case 'Home': icon = focused ? 'home' : 'home-outline'; break;
            case 'NotificationsTab': icon = focused ? 'notifications' : 'notifications-outline'; break;
            case 'MessagesTab': icon = focused ? 'chatbubble' : 'chatbubble-outline'; break;
            case 'ProfileTab': icon = focused ? 'person' : 'person-outline'; break;
            case 'MenuTab': icon = focused ? 'menu' : 'menu-outline'; break;
            default: icon = 'home-outline';
          }
          const iconEl = <Ionicons name={icon} size={22} color={color} />;
          // Badges: alerts and messages
          const totalUnread = parentUnread;
          if (route.name === 'NotificationsTab' && totalUnread > 0) {
            return (
              <View style={{ width: 26, height: 26 }}>
                {iconEl}
                <View style={{ position: 'absolute', right: -6, top: -4, backgroundColor: '#DC2626', borderRadius: 8, paddingHorizontal: 4, paddingVertical: 0 }}>
                  <Text style={{ color: '#fff', fontSize: 10, fontWeight: '700' }}>{totalUnread > 99 ? '99+' : String(totalUnread)}</Text>
                </View>
              </View>
            );
          }
          if (route.name === 'MessagesTab' && messagesUnread > 0) {
            return (
              <View style={{ width: 26, height: 26 }}>
                {iconEl}
                <View style={{ position: 'absolute', right: -6, top: -4, backgroundColor: '#DC2626', borderRadius: 8, paddingHorizontal: 4, paddingVertical: 0 }}>
                  <Text style={{ color: '#fff', fontSize: 10, fontWeight: '700' }}>{messagesUnread > 99 ? '99+' : String(messagesUnread)}</Text>
                </View>
              </View>
            );
          }
          return iconEl;
        },
      })}
    >
      <Tab.Screen 
        name="Home" 
        component={HomeStack}
        listeners={({ navigation, route }) => ({
          tabPress: (e) => {
            // When Home tab is pressed, check if we need to reset the stack
            const routeName = getFocusedRouteNameFromRoute(route) ?? 'ParentDashboard';
            if (routeName === 'Profile' || routeName === 'Events' || routeName === 'AttendanceLog' || routeName === 'LinkedStudents' || routeName === 'About') {
              // Reset HomeStack to ParentDashboard when Home tab is pressed from these screens
              e.preventDefault();
              // Get current navigation state
              const currentState = navigation.getState();
              const currentIndex = currentState?.index ?? 0;
              
              // Reset navigation to Home tab with ParentDashboard as the only screen in HomeStack
              navigation.dispatch(
                CommonActions.reset({
                  index: currentIndex,
                  routes: currentState.routes.map((r, idx) => {
                    if (r.name === 'Home') {
                      return {
                        ...r,
                        state: {
                          routes: [{ name: 'ParentDashboard' }],
                          index: 0,
                        },
                      };
                    }
                    return r;
                  }),
                })
              );
            }
          },
        })}
        options={({ route }) => {
          const routeName = getFocusedRouteNameFromRoute(route) ?? 'ParentDashboard';
          const hideTabBar = routeName === 'Profile' || routeName === 'Events' || routeName === 'AttendanceLog' || routeName === 'LinkedStudents' || routeName === 'StudentProfile' || routeName === 'About';
          return {
            tabBarStyle: hideTabBar ? { display: 'none' } : PARENT_TAB_BAR_STYLE,
          };
        }}
      />
      <Tab.Screen name="ScheduleTab" component={Schedule} options={{ tabBarLabel: () => null }} />
      <Tab.Screen 
        name="MessagesTab" 
        component={MessagesStack} 
        options={({ route }) => {
          const routeName = getFocusedRouteNameFromRoute(route) ?? 'ParentMessages';
          const hideTabBar = routeName === 'ParentConversation';
          return {
            tabBarLabel: () => null,
            tabBarStyle: hideTabBar ? { display: 'none' } : PARENT_TAB_BAR_STYLE,
          };
        }}
      />
      <Tab.Screen
        name="NotificationsTab"
        component={Alerts}
        options={{ tabBarLabel: () => null }}
      />
      <Tab.Screen
        name="MenuTab"
        component={Menu}
        options={{ tabBarLabel: () => null }}
      />
    </Tab.Navigator>
  );
}
