// src/navigation/StudentTabNavigator.js
import React, { useEffect, useState, useContext, useRef } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { getFocusedRouteNameFromRoute, CommonActions } from '@react-navigation/native';
import { doc, onSnapshot, collection, query, where, orderBy, limit } from 'firebase/firestore';
import { db } from '../utils/firebaseConfig';
import { AuthContext } from '../contexts/AuthContext';

import Dashboard from '../screens/Student/Dashboard';
import AttendanceLog from '../screens/Student/AttendanceLog';
import Messages from '../screens/Student/Messages';
import Conversation from '../screens/Student/Conversation';
import Schedule from '../screens/Student/Schedule';
import Alerts from '../screens/Student/Alerts';
import Profile from '../screens/Student/Profile';
import QRPreview from '../screens/Student/QRPreview';
import Events from '../screens/Student/Events';
import LinkParent from '../screens/Student/LinkParent';
import ParentProfile from '../screens/Student/ParentProfile';
import About from '../screens/Student/About';
import Menu from '../screens/Student/Menu';
import { STUDENT_TAB_BAR_STYLE } from './tabStyles';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();
function MessagesStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
      <Stack.Screen name="StudentMessages" component={Messages} />
      <Stack.Screen name="StudentConversation" component={Conversation} />
    </Stack.Navigator>
  );
}

function HomeStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
      <Stack.Screen name="StudentDashboard" component={Dashboard} />
      <Stack.Screen name="AttendanceLog" component={AttendanceLog} />
      <Stack.Screen name="Profile" component={Profile} />
      <Stack.Screen name="QRPreview" component={QRPreview} />
      <Stack.Screen name="Events" component={Events} />
      <Stack.Screen name="LinkParent" component={LinkParent} />
      <Stack.Screen name="ParentProfile" component={ParentProfile} />
      <Stack.Screen name="About" component={About} />
    </Stack.Navigator>
  );
}

export default function StudentTabNavigator() {
  const { user } = useContext(AuthContext);
  const [unreadCount, setUnreadCount] = useState(0);
  const [messagesUnread, setMessagesUnread] = useState(0);
  const convStateRef = useRef({});
  const msgUnsubsRef = useRef([]);

  useEffect(() => {
    console.log('🔍 BADGE COUNT: User object changed:', {
      uid: user?.uid,
      studentId: user?.studentId,
      role: user?.role,
      hasUser: !!user
    });
    
    if (!user?.uid) {
      console.log('🔍 BADGE COUNT: No user UID available, setting count to 0');
      setUnreadCount(0);
      return undefined;
    }
    
    if (!user?.studentId) {
      console.log('🔍 BADGE COUNT: No student ID available, user object:', user);
      setUnreadCount(0);
      return undefined;
    }
    // Use user.studentId as the document ID for student_alerts collection
    console.log('🔍 BADGE COUNT: Setting up listener for student ID:', user.studentId);
    const ref = doc(db, 'student_alerts', user.studentId);
    console.log('🔍 BADGE COUNT: Document path:', ref.path);
    const unsub = onSnapshot(ref, (snap) => {
      console.log('🔍 BADGE COUNT: Snapshot received, exists:', snap.exists());
      if (snap.exists()) {
        console.log('🔍 BADGE COUNT: Document data:', snap.data());
      }
      const items = snap.exists() ? (snap.data()?.items || []) : [];
      console.log('🔍 BADGE COUNT: Items array:', items);
      const count = items.filter((it) => it?.status !== 'read').length;
      console.log('🔍 BADGE COUNT: Found', items.length, 'total items,', count, 'unread');
      console.log('🔍 BADGE COUNT: Unread items:', items.filter((it) => it?.status !== 'read'));
      setUnreadCount(count);
    }, (error) => {
      console.log('🔍 BADGE COUNT: Error in listener:', error);
      setUnreadCount(0);
    });
    return () => unsub && unsub();
  }, [user?.studentId]);

  useEffect(() => {
    // cleanup
    msgUnsubsRef.current.forEach(u => { try { u && u(); } catch {} });
    msgUnsubsRef.current = [];
    convStateRef.current = {};
    setMessagesUnread(0);

    if (!user?.uid) { return undefined; }
    const linksQ = query(collection(db, 'parent_student_links'), where('studentId', '==', user.studentId), where('status', '==', 'active'));
    const unsubLinks = onSnapshot(linksQ, (linksSnap) => {
      try {
        msgUnsubsRef.current.forEach(u => { try { u && u(); } catch {} });
        msgUnsubsRef.current = [];
        convStateRef.current = {};
        setMessagesUnread(0);
        const links = linksSnap.docs.map(d => d.data()).filter(Boolean);
        links.forEach((l) => {
          const studentKey = user?.studentId || user?.uid;
          const parentKey = l.parentIdNumber || l.parentId;
          if (!studentKey || !parentKey) return;
          const convId = `${studentKey}-${parentKey}`;
          if (!convStateRef.current[convId]) convStateRef.current[convId] = { lastCreatedAtMs: 0, lastSenderId: null, lastReadAtMs: 0 };
          const unsubMsg = onSnapshot(query(collection(db, 'conversations', convId, 'messages'), orderBy('createdAt', 'desc'), limit(1)), (snap) => {
            const d = snap.docs[0]?.data();
            const createdAtMs = d?.createdAt?.toMillis ? d.createdAt.toMillis() : 0;
            convStateRef.current[convId].lastCreatedAtMs = createdAtMs || 0;
            convStateRef.current[convId].lastSenderId = d?.senderId || null;
            const total = Object.values(convStateRef.current).reduce((acc, s) => acc + ((s.lastCreatedAtMs && (s.lastReadAtMs || 0) < s.lastCreatedAtMs && s.lastSenderId !== user?.uid) ? 1 : 0), 0);
            setMessagesUnread(total);
          }, () => {});
          msgUnsubsRef.current.push(unsubMsg);
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
  }, [user?.uid, user?.studentId]);

  return (
    <Tab.Navigator
      initialRouteName="Home"
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarShowLabel: false,
        tabBarActiveTintColor: '#0078cf',
        tabBarInactiveTintColor: '#FFFFFF',
        tabBarSafeAreaInsets: { bottom: 0 },
        tabBarStyle: STUDENT_TAB_BAR_STYLE,
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
        tabBarIcon: ({ color, focused }) => {
          let icon = 'home-outline';
          switch (route.name) {
            case 'Home': icon = focused ? 'home' : 'home-outline'; break;
            case 'ScheduleTab': icon = focused ? 'calendar' : 'calendar-outline'; break;
            case 'MessagesTab': icon = focused ? 'chatbubble' : 'chatbubble-outline'; break;
            case 'AlertsTab': icon = focused ? 'notifications' : 'notifications-outline'; break;
            case 'MenuTab': icon = focused ? 'menu' : 'menu-outline'; break;
            default: icon = 'home-outline';
          }
          const iconEl = <Ionicons name={icon} size={22} color={color} />;
          if (route.name === 'AlertsTab' && unreadCount > 0) {
            return (
              <View style={{ width: 26, height: 26 }}>
                {iconEl}
                <View style={{ position: 'absolute', right: -6, top: -4, backgroundColor: '#DC2626', borderRadius: 8, paddingHorizontal: 4, paddingVertical: 0 }}>
                  <Text style={{ color: '#fff', fontSize: 10, fontWeight: '700' }}>{unreadCount > 99 ? '99+' : String(unreadCount)}</Text>
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
            const routeName = getFocusedRouteNameFromRoute(route) ?? 'StudentDashboard';
            if (routeName === 'Profile' || routeName === 'Events' || routeName === 'AttendanceLog' || routeName === 'LinkParent' || routeName === 'About') {
              // Reset HomeStack to StudentDashboard when Home tab is pressed from these screens
              e.preventDefault();
              // Get current navigation state
              const currentState = navigation.getState();
              const currentIndex = currentState?.index ?? 0;
              
              // Reset navigation to Home tab with StudentDashboard as the only screen in HomeStack
              navigation.dispatch(
                CommonActions.reset({
                  index: currentIndex,
                  routes: currentState.routes.map((r, idx) => {
                    if (r.name === 'Home') {
                      return {
                        ...r,
                        state: {
                          routes: [{ name: 'StudentDashboard' }],
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
          const routeName = getFocusedRouteNameFromRoute(route) ?? 'StudentDashboard';
          const hideTabBar = routeName === 'Profile' || routeName === 'QRPreview' || routeName === 'Events' || routeName === 'AttendanceLog' || routeName === 'LinkParent' || routeName === 'ParentProfile' || routeName === 'About';
          return {
            tabBarStyle: hideTabBar ? { display: 'none' } : STUDENT_TAB_BAR_STYLE,
          };
        }}
      />
      <Tab.Screen name="ScheduleTab" component={Schedule} options={{ tabBarLabel: () => null }} />
      <Tab.Screen 
        name="MessagesTab" 
        component={MessagesStack} 
        options={({ route }) => {
          const routeName = getFocusedRouteNameFromRoute(route) ?? 'StudentMessages';
          const hideTabBar = routeName === 'StudentConversation';
          return {
            tabBarLabel: () => null,
            tabBarStyle: hideTabBar ? { display: 'none' } : STUDENT_TAB_BAR_STYLE,
          };
        }} 
      />
      <Tab.Screen
        name="AlertsTab"
        component={Alerts}
        options={{
          tabBarLabel: () => null,
          // Custom badge handled in tabBarIcon
        }}
      />
      <Tab.Screen
        name="MenuTab"
        component={Menu}
        options={{ tabBarLabel: () => null }}
      />
    </Tab.Navigator>
  );
}