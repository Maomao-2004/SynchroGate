import React, { useContext, useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, Image, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation, useNavigationState, useFocusEffect, useRoute, StackActions, CommonActions } from '@react-navigation/native';
import { AuthContext } from '../../contexts/AuthContext';
import avatarEventEmitter from '../../utils/avatarEventEmitter';

const DETAIL_ROUTES = ['NotificationLog', 'Events', 'About', 'Developer', 'StudentsTab', 'ParentsTab', 'StudentProfile', 'ParentProfile', 'AttendanceLog', 'StudentAttendance'];

const ROUTE_TITLES = {
  AdminDashboard: 'Dashboard',
  NotificationLog: 'Activity Logs',
  ActivityLogsTab: 'Activity Logs',
  Events: 'Events',
  AlertsTab: 'Alerts',
  About: 'About',
  Developer: 'Developer',
  StudentsTab: 'Student Management',
  ParentsTab: 'Parent Management',
  StudentProfile: 'Student Profile',
  ParentProfile: 'Parent Profile',
  MenuTab: 'Menu',
  AttendanceLog: 'Attendance Log',
  StudentAttendance: 'Student Attendance',
};

export default function AdminTopHeader() {
  const navigation = useNavigation();
  const navigationState = useNavigationState((state) => state);
  const route = useRoute();
  const { user } = useContext(AuthContext);
  const [avatarSource, setAvatarSource] = useState(null);
  const [searchActive, setSearchActive] = useState(false);
  const [searchText, setSearchText] = useState('');

  const loadAvatar = React.useCallback(async () => {
    try {
      const keyBase = user?.uid || '';
      if (!keyBase) { setAvatarSource(null); return; }
      // Use admin profile pic key
      const primaryKey = `admin_profilePic_${keyBase}`;
      // Also check legacy keys for backward compatibility
      const legacyKey = `profilePic_${keyBase}`;
      let stored = await AsyncStorage.getItem(primaryKey);
      if (!stored) stored = await AsyncStorage.getItem(legacyKey);
      if (stored) setAvatarSource({ uri: stored });
      else if (user?.avatar) setAvatarSource({ uri: user.avatar });
      else setAvatarSource(require('../../assets/icons/unknown avatar icon.jpg'));
    } catch {
      if (user?.avatar) setAvatarSource({ uri: user.avatar });
      else setAvatarSource(require('../../assets/icons/unknown avatar icon.jpg'));
    }
  }, [user?.uid, user?.avatar]);

  // Load avatar on mount and when user data changes
  useEffect(() => {
    loadAvatar();
  }, [loadAvatar]);

  // Refresh avatar when screen comes into focus
  useFocusEffect(
    React.useCallback(() => {
      loadAvatar();
    }, [loadAvatar])
  );

  // Listen for avatar changes
  useEffect(() => {
    const handleAvatarChange = (data) => {
      const keyBase = user?.uid || '';
      if (keyBase && data.uid && String(data.uid) === String(keyBase)) {
        loadAvatar();
      }
    };

    avatarEventEmitter.on('avatarChanged', handleAvatarChange);
    return () => {
      avatarEventEmitter.off('avatarChanged', handleAvatarChange);
    };
  }, [user?.uid, loadAvatar]);

  const getActiveRoute = () => {
    try {
      let current = navigationState || navigation.getState?.();
      let activeRoute = null;
      while (current && current.routes && current.routes.length) {
        const route = current.routes[current.index ?? 0];
        if (!route) break;
        activeRoute = route;
        if (route.state) current = route.state;
        else break;
      }
      if (activeRoute) return activeRoute;
    } catch {}
    return { name: 'AdminDashboard', params: {} };
  };

  const activeRoute = getActiveRoute();
  const currentRoute = activeRoute?.name || 'AdminDashboard';
  const routeParams = activeRoute?.params || route?.params || {};
  const hasStudentParam = !!routeParams.student;
  
  // For AttendanceLog, check both route name and student param
  const isAttendanceLog = currentRoute === 'AttendanceLog' || hasStudentParam;
  const isDetail = DETAIL_ROUTES.includes(currentRoute) || isAttendanceLog;
  
  // Debug logging for AttendanceLog
  React.useEffect(() => {
    if (currentRoute === 'AttendanceLog' || hasStudentParam) {
      console.log('🔍 AdminTopHeader: AttendanceLog detected', {
        currentRoute,
        isDetail,
        isAttendanceLog,
        hasStudentParam,
        routeParams: Object.keys(routeParams)
      });
    }
  }, [currentRoute, isDetail, isAttendanceLog, hasStudentParam, routeParams]);
  const isStudentsTab = currentRoute === 'StudentsTab';
  const isParentsTab = currentRoute === 'ParentsTab';
  const isStudentAttendance = currentRoute === 'StudentAttendance';
  const isSearchableScreen = isStudentsTab || isParentsTab || isStudentAttendance;

  // Get selected card title from route params
  const selectedCardTitle = activeRoute?.params?.selectedCardTitle || route?.params?.selectedCardTitle;
  const title = selectedCardTitle || ROUTE_TITLES[currentRoute] || 'Admin';

  // Get counts from route params (try both route hook and active route)
  const yearCounts = routeParams.yearCounts || { y1: 0, y2: 0, y3: 0, y4: 0 };
  const courseCounts = routeParams.courseCounts || {};
  const parentCounts = routeParams.parentCounts || { linked: 0, unlinked: 0 };
  
  // Check if search button should be shown
  // For StudentsTab: hide search button when on card selection screen (no selectedCardTitle)
  // For ParentsTab: show search button when there are parents
  // For StudentAttendance: show search button when a card is selected (selectedCardTitle exists)
  const shouldShowSearch = isSearchableScreen && (
    isStudentsTab ? (
      // Only show search button if a card is selected (selectedCardTitle exists)
      // and there are students available
      selectedCardTitle != null && (
        (yearCounts.y1 + yearCounts.y2 + yearCounts.y3 + yearCounts.y4 > 0) ||
        Object.values(courseCounts).some(count => count > 0)
      )
    ) : isParentsTab ? (
      (parentCounts.linked + parentCounts.unlinked > 0)
    ) : isStudentAttendance ? (
      // Show search button if a card is selected (selectedCardTitle exists)
      selectedCardTitle != null
    ) : false
  );

  // Sync route params for search state
  useEffect(() => {
    if (isSearchableScreen) {
      const activeRouteParams = getActiveRoute()?.params || {};
      const routeParams = activeRouteParams || route?.params || {};
      const routeSearchActive = routeParams.searchActive === true;
      const routeSearchQuery = String(routeParams.searchQuery || '');
      
      if (routeSearchActive !== searchActive) {
        setSearchActive(routeSearchActive);
      }
      if (routeSearchQuery !== searchText) {
        setSearchText(routeSearchQuery);
      }
    }
  }, [isSearchableScreen, route?.params?.searchActive, route?.params?.searchQuery, navigationState]);

  // Update route params when search state changes
  useEffect(() => {
    if (isSearchableScreen) {
      try {
        const routeParams = route?.params || {};
        const routeSearchActive = routeParams.searchActive === true;
        const routeSearchQuery = String(routeParams.searchQuery || '');
        const localSearchActive = searchActive === true;
        const localSearchQuery = String(searchText || '');
        
        if (localSearchActive !== routeSearchActive || localSearchQuery !== routeSearchQuery) {
          const params = { ...routeParams, searchActive: localSearchActive, searchQuery: localSearchQuery };
          navigation.setParams?.(params);
          const parentNav = navigation.getParent?.();
          if (parentNav) {
            if (isStudentsTab) {
              parentNav.navigate('Home', { screen: 'StudentsTab', params });
            } else if (isParentsTab) {
              parentNav.navigate('Home', { screen: 'ParentsTab', params });
            } else if (isStudentAttendance) {
              parentNav.navigate('StudentAttendance', params);
            }
          }
        }
      } catch {}
    } else if (searchActive) {
      setSearchActive(false);
      setSearchText('');
    }
  }, [isSearchableScreen, searchActive, searchText, route?.params]);

  const toggleSearch = () => {
    if (!searchActive) {
      setSearchActive(true);
      setSearchText('');
    } else {
      setSearchActive(false);
      setSearchText('');
      try {
        const params = { ...route?.params, searchActive: false, searchQuery: '' };
        navigation.setParams?.(params);
        const parentNav = navigation.getParent?.();
        if (parentNav) {
          if (isStudentsTab) {
            parentNav.navigate('Home', { screen: 'StudentsTab', params });
          } else if (isParentsTab) {
            parentNav.navigate('Home', { screen: 'ParentsTab', params });
          } else if (isStudentAttendance) {
            parentNav.navigate('StudentAttendance', params);
          }
        }
      } catch {}
    }
  };

  const navigateBack = () => {
    try {
      // Check if we're on AttendanceLog accessed from admin (has student param)
      const routeParams = activeRoute?.params || route?.params || {};
      const hasStudentParam = !!routeParams.student;
      
      // If on AttendanceLog or has student param (admin view), navigate back to StudentAttendance
      if (currentRoute === 'AttendanceLog' || hasStudentParam) {
        console.log('🔙 Back button pressed - Navigating to StudentAttendance', {
          currentRoute,
          hasStudentParam,
          routeParams: Object.keys(routeParams),
          canGoBack: navigation.canGoBack?.()
        });
        try {
          // Since both AttendanceLog and StudentAttendance are in the same AdminNavigator stack,
          // we can use goBack() or navigate directly
          if (navigation.canGoBack?.()) {
            console.log('🔙 Using goBack()');
            navigation.goBack();
          } else {
            // Fallback: navigate directly to StudentAttendance
            console.log('🔙 Cannot go back, navigating directly to StudentAttendance');
            const parentNav = navigation.getParent?.();
            if (parentNav) {
              parentNav.navigate('StudentAttendance');
            } else {
              navigation.navigate('StudentAttendance');
            }
          }
        } catch (err) {
          console.log('❌ Navigation error:', err);
          // Fallback: try multiple navigation methods
          try {
            // Try direct navigation first
            navigation.navigate('StudentAttendance');
          } catch (err2) {
            console.log('❌ Direct navigation failed, trying parent:', err2);
            try {
              const parentNav = navigation.getParent?.();
              if (parentNav) {
                parentNav.navigate('StudentAttendance');
              } else {
                // Last resort: try goBack
                if (navigation.canGoBack?.()) {
                  navigation.goBack();
                }
              }
            } catch (err3) {
              console.log('❌ All navigation methods failed:', err3);
            }
          }
        }
        return;
      }
      // If on Events, Developer, or About screen, navigate to MenuTab
      if (currentRoute === 'Events' || currentRoute === 'Developer' || currentRoute === 'About') {
        try {
          const parentNav = navigation.getParent?.();
          if (parentNav) {
            // For Developer and About, reset HomeStack to AdminDashboard before navigating to MenuTab
            if (currentRoute === 'Developer' || currentRoute === 'About') {
              // Get current navigation state
              const navState = parentNav.getState();
              const homeRouteIndex = navState?.routes?.findIndex(r => r.name === 'Home');
              
              if (homeRouteIndex !== undefined && homeRouteIndex >= 0) {
                // Reset the HomeStack to only contain AdminDashboard
                parentNav.dispatch(
                  CommonActions.reset({
                    index: navState.index,
                    routes: navState.routes.map((route, idx) => {
                      if (route.name === 'Home') {
                        return {
                          ...route,
                          state: {
                            routes: [{ name: 'AdminDashboard' }],
                            index: 0,
                          },
                        };
                      }
                      return route;
                    }),
                  })
                );
              }
            }
            // Navigate to MenuTab
            parentNav.navigate('MenuTab');
          } else {
            navigation.navigate('MenuTab');
          }
        } catch (err) {
          console.log('Navigation error:', err);
          // Fallback: just navigate to MenuTab
          try {
            const parentNav = navigation.getParent?.();
            if (parentNav) parentNav.navigate('MenuTab');
            else navigation.navigate('MenuTab');
          } catch {
            navigation.navigate('MenuTab');
          }
        }
        return;
      }
      // If in search mode, exit search mode instead of going back
      if (isSearchableScreen && searchActive) {
        setSearchActive(false);
        setSearchText('');
        try {
          const params = { ...route?.params, searchActive: false, searchQuery: '' };
          navigation.setParams?.(params);
          const parentNav = navigation.getParent?.();
          if (parentNav) {
            if (isStudentsTab) {
              parentNav.navigate('Home', { screen: 'StudentsTab', params });
            } else if (isParentsTab) {
              parentNav.navigate('Home', { screen: 'ParentsTab', params });
            }
          }
        } catch {}
        return;
      }
      // Prefer native back navigation so we return to the previous screen,
      // but fall back to the home tab if the stack has no history.
      if (navigation.canGoBack?.()) {
        navigation.goBack();
        return;
      }
    } catch {}
    navigation.navigate('AdminTabs', { screen: 'Home', params: { screen: 'AdminDashboard' } });
  };

  const navigateProfile = () => {
    // Profile icon navigation removed - no action
  };

  const navigateMenuTab = () => {
    try {
      const parentNav = navigation.getParent?.();
      if (parentNav) parentNav.navigate('MenuTab');
      else navigation.navigate('MenuTab');
    } catch {
      navigation.navigate('MenuTab');
    }
  };

  const avatar = require('../../assets/SG.png');

  return (
    <SafeAreaView 
      edges={['top']} 
      style={{ 
        backgroundColor: '#004f89', 
        zIndex: 1000, 
        elevation: 1000
      }}
    >
      <View 
        style={{ 
          height: 60, 
          flexDirection: 'row', 
          alignItems: 'center', 
          justifyContent: 'space-between', 
          paddingHorizontal: 16,
          zIndex: 1000
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, minWidth: 0 }}>
          {(isDetail || isAttendanceLog) ? (
            <TouchableOpacity 
              onPress={() => {
                console.log('🔙 Back button onPress triggered!', { isDetail, isAttendanceLog, currentRoute });
                navigateBack();
              }}
              hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
              activeOpacity={0.6}
              style={{ 
                width: 36, 
                height: 36, 
                borderRadius: 18, 
                marginRight: 10, 
                alignItems: 'center', 
                justifyContent: 'center', 
                backgroundColor: 'rgba(255,255,255,0.15)', 
                zIndex: 1001,
                elevation: 1001
              }}
            >
              <Ionicons name="chevron-back" size={22} color="#FFFFFF" />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity onPress={navigateProfile}>
              <View style={{ width: 46, height: 46, borderRadius: 23, marginRight: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: '#FFFFFF' }}>
                <Image source={avatar} style={{ width: 36, height: 36, borderRadius: 18 }} />
              </View>
            </TouchableOpacity>
          )}
          {isSearchableScreen && searchActive ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, minWidth: 0 }}>
              <TextInput
                value={searchText}
                onChangeText={setSearchText}
                placeholder={isStudentsTab || isStudentAttendance ? "Search student by name" : "Search parent by name"}
                placeholderTextColor="#CFE3F5"
                autoCorrect={false}
                autoCapitalize="words"
                autoFocus={true}
                style={{ flex: 1, minWidth: 0, color: '#fff', fontSize: 16, paddingVertical: 4, paddingHorizontal: 8, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.5)' }}
              />
            </View>
          ) : (
            <Text style={{ color: '#FFFFFF', fontSize: 18, fontWeight: '700', flexShrink: 1 }} numberOfLines={1} ellipsizeMode="tail">{title}</Text>
          )}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', flexShrink: 0 }}>
          {shouldShowSearch ? (
            <TouchableOpacity
              onPress={toggleSearch}
              style={{ marginLeft: 8 }}
            >
              <Ionicons name={searchActive ? 'close' : 'search'} size={22} color="#fff" />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
    </SafeAreaView>
  );
}

