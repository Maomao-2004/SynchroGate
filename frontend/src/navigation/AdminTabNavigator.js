// src/navigation/AdminTabNavigator.js
import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { getFocusedRouteNameFromRoute, CommonActions } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../utils/firebaseConfig';
import { ADMIN_TAB_BAR_STYLE } from './tabStyles';

import Dashboard from '../screens/Admin/Dashboard';
import NotificationLog from '../screens/Admin/ActivityLog';
import AdminAlerts from '../screens/Admin/Alerts';
import Events from '../screens/Admin/Events';
import About from '../screens/Admin/About';
import Developer from '../screens/Admin/Developer';
import AdminMenu from '../screens/Admin/Menu';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

function HomeStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
      <Stack.Screen name="AdminDashboard" component={Dashboard} />
      <Stack.Screen name="NotificationLog" component={NotificationLog} />
      <Stack.Screen name="Events" component={Events} />
      <Stack.Screen name="About" component={About} />
      <Stack.Screen name="Developer" component={Developer} />
    </Stack.Navigator>
  );
}

export default function AdminTabNavigator() {
  const [unreadAlertsCount, setUnreadAlertsCount] = useState(0);
  const [unreadActivityLogsCount, setUnreadActivityLogsCount] = useState(0);

  useEffect(() => {
    const ref = doc(db, 'admin_alerts', 'inbox');
    const unsubscribe = onSnapshot(ref, (snap) => {
      try {
        const items = snap.exists() ? (Array.isArray(snap.data()?.items) ? snap.data().items : []) : [];
        const unreadCount = items.filter(item => item.status !== 'read').length;
        setUnreadAlertsCount(unreadCount);
      } catch (error) {
        console.error('Error fetching alerts count:', error);
        setUnreadAlertsCount(0);
      }
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const ref = doc(db, 'admin_activity_logs', 'global');
    const unsubscribe = onSnapshot(ref, (snap) => {
      try {
        const items = snap.exists() ? (Array.isArray(snap.data()?.items) ? snap.data().items : []) : [];
        const unreadCount = items.filter(item => item.status === 'unread').length;
        setUnreadActivityLogsCount(unreadCount);
      } catch (error) {
        console.error('Error fetching activity logs count:', error);
        setUnreadActivityLogsCount(0);
      }
    });

    return () => unsubscribe();
  }, []);

  return (
    <Tab.Navigator
      initialRouteName="Home"
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarShowLabel: false,
        tabBarActiveTintColor: '#0078cf',
        tabBarInactiveTintColor: '#FFFFFF',
        tabBarSafeAreaInsets: { bottom: 0 },
        tabBarStyle: ADMIN_TAB_BAR_STYLE,
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
            case 'ActivityLogsTab': icon = focused ? 'time' : 'time-outline'; break;
            case 'AlertsTab': icon = focused ? 'notifications' : 'notifications-outline'; break;
            case 'MenuTab': icon = focused ? 'menu' : 'menu-outline'; break;
            default: icon = 'home-outline';
          }
          
          const iconEl = <Ionicons name={icon} size={22} color={color} />;
          
          // Add badge for AlertsTab if there are unread alerts
          if (route.name === 'AlertsTab' && unreadAlertsCount > 0) {
            return (
              <View style={{ width: 26, height: 26 }}>
                {iconEl}
                <View style={{ position: 'absolute', right: -6, top: -4, backgroundColor: '#DC2626', borderRadius: 8, paddingHorizontal: 4, paddingVertical: 0 }}>
                  <Text style={{ color: '#fff', fontSize: 10, fontWeight: '700' }}>{unreadAlertsCount > 99 ? '99+' : String(unreadAlertsCount)}</Text>
                </View>
              </View>
            );
          }

          // Add badge for ActivityLogsTab if there are unread activity logs
          if (route.name === 'ActivityLogsTab' && unreadActivityLogsCount > 0) {
            return (
              <View style={{ width: 26, height: 26 }}>
                {iconEl}
                <View style={{ position: 'absolute', right: -6, top: -4, backgroundColor: '#DC2626', borderRadius: 8, paddingHorizontal: 4, paddingVertical: 0 }}>
                  <Text style={{ color: '#fff', fontSize: 10, fontWeight: '700' }}>{unreadActivityLogsCount > 99 ? '99+' : String(unreadActivityLogsCount)}</Text>
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
            const routeName = getFocusedRouteNameFromRoute(route) ?? 'AdminDashboard';
            if (routeName === 'Developer' || routeName === 'Events' || routeName === 'About' || routeName === 'NotificationLog') {
              // Reset HomeStack to AdminDashboard when Home tab is pressed from these screens
              e.preventDefault();
              // Get current navigation state
              const currentState = navigation.getState();
              const homeTabIndex = currentState?.routes?.findIndex(r => r.name === 'Home') ?? -1;
              
              if (homeTabIndex >= 0) {
                const homeRoute = currentState.routes[homeTabIndex];
                const homeStackState = homeRoute?.state;
                const homeStackRoutes = homeStackState?.routes || [];
                const isAlreadyReset = homeStackRoutes.length === 1 && homeStackRoutes[0]?.name === 'AdminDashboard';
                
                if (!isAlreadyReset) {
                  // Reset navigation to Home tab with AdminDashboard as the only screen in HomeStack
                  // This will automatically navigate to Home tab and reset the stack in one action
                  navigation.dispatch(
                    CommonActions.reset({
                      index: homeTabIndex,
                      routes: currentState.routes.map((r, idx) => {
                        if (r.name === 'Home') {
                          return {
                            ...r,
                            state: {
                              routes: [{ name: 'AdminDashboard' }],
                              index: 0,
                            },
                          };
                        }
                        return r;
                      }),
                    })
                  );
                } else {
                  // Already reset, just navigate to Home tab
                  navigation.navigate('Home');
                }
              } else {
                // Fallback: just navigate to Home
                navigation.navigate('Home', { screen: 'AdminDashboard' });
              }
            }
          },
        })}
        options={({ route }) => {
          const routeName = getFocusedRouteNameFromRoute(route) ?? 'AdminDashboard';
          // Hide tab bar for screens that need full screen experience
          const hideTabBar = routeName === 'Events' || routeName === 'About' || routeName === 'NotificationLog' || routeName === 'Developer';
          
          return {
            tabBarStyle: hideTabBar ? { display: 'none' } : ADMIN_TAB_BAR_STYLE,
          };
        }}
      />
      <Tab.Screen 
        name="ActivityLogsTab" 
        component={NotificationLog} 
        options={{ tabBarLabel: () => null }}
      />
      <Tab.Screen 
        name="AlertsTab" 
        component={AdminAlerts} 
        options={{ tabBarLabel: () => null }}
      />
      <Tab.Screen
        name="MenuTab"
        component={AdminMenu}
        options={{ tabBarLabel: () => null }}
      />
    </Tab.Navigator>
  );
}

 