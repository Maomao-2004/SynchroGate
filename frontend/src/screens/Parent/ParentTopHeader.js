import React, { useContext, useEffect, useState, useRef } from 'react';
import { View, Text, TouchableOpacity, Image, Dimensions, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation, useRoute, CommonActions } from '@react-navigation/native';
import { AuthContext } from '../../contexts/AuthContext';
import avatarEventEmitter from '../../utils/avatarEventEmitter';

const { width } = Dimensions.get('window');

export default function ParentTopHeader() {
  const navigation = useNavigation();
  const route = useRoute();
  const { user, logout } = useContext(AuthContext);

  const [profilePic, setProfilePic] = useState(null);
  const [searchActive, setSearchActive] = useState(false);
  const [searchText, setSearchText] = useState('');
  const prevRouteParamsRef = useRef({ searchActive: undefined, searchQuery: undefined });
  const isResettingRef = useRef(false);
  const searchTextTimeoutRef = useRef(null);

  const loadProfilePic = React.useCallback(async () => {
    try {
      const base = user?.parentId ? String(user.parentId) : String(user?.uid || '');
      if (!base) { setProfilePic(null); return; }
      // New key used by Profile.js
      const newKey = `parent_profilePic_${base}`;
      // Legacy fallback key
      const legacyKey = `parentProfilePic_${base}`;
      let saved = await AsyncStorage.getItem(newKey);
      if (!saved) saved = await AsyncStorage.getItem(legacyKey);
      setProfilePic(saved ? { uri: saved } : null);
    } catch { setProfilePic(null); }
  }, [user?.parentId, user?.uid]);

  useEffect(() => {
    loadProfilePic();
  }, [loadProfilePic]);

  // Listen for avatar changes from Profile screen
  useEffect(() => {
    const handleAvatarChange = (data) => {
      const base = user?.parentId ? String(user.parentId) : String(user?.uid || '');
      if (base && data.parentId && String(data.parentId) === String(base)) {
        loadProfilePic();
      }
    };

    avatarEventEmitter.on('avatarChanged', handleAvatarChange);
    return () => {
      avatarEventEmitter.off('avatarChanged', handleAvatarChange);
    };
  }, [user?.parentId, user?.uid, loadProfilePic]);

  // Sidebar handled in navbar

  const navigateSafe = (target) => {
    try {
      const parentNav = navigation.getParent?.();
      if (parentNav) parentNav.navigate(target.name, target.params || {});
      else navigation.navigate(target.name, target.params || {});
    } catch { /* noop */ }
  };

  const getActiveRoute = () => {
    try {
      let current = navigation.getState?.();
      while (current && current.routes && current.routes.length) {
        const r = current.routes[current.index ?? 0];
        if (!r) break;
        if (r.state) current = r.state; else return r;
      }
    } catch {}
    return route || { name: '', params: {} };
  };

  const activeRoute = getActiveRoute();
  const focusedName = activeRoute?.name || '';
  const conversationParams = focusedName === 'ParentConversation' ? (activeRoute?.params || route?.params || {}) : {};
  const isMenu = focusedName === 'Menu' || focusedName === 'MenuTab';
  const isConversation = focusedName === 'ParentConversation';
  const isDetailScreen = ['Profile','Events','AttendanceLog','LinkedStudents','About','StudentProfile'].includes(focusedName) || isConversation;
  const isLinkedStudents = focusedName === 'LinkedStudents';
  const currentTitle = (() => {
    const n = focusedName;
    if (n === 'NotificationsTab') return 'Alerts';
    if (n === 'ScheduleTab' || n === 'ParentSchedule') return "Children's Schedule";
    if (n === 'MessagesTab' || n === 'ParentMessages') return 'Messages';
    if (n === 'Profile') return 'Profile';
    if (n === 'Events') return 'Events';
    if (n === 'AttendanceLog') return 'Attendance';
    if (n === 'LinkedStudents') return 'Linked Students';
    if (n === 'StudentProfile') return 'Student Profile';
    if (n === 'About') return 'About Us';
    if (n === 'Menu' || n === 'MenuTab') return 'Menu';
    if (n === 'Home' || n === 'ParentDashboard') return 'Dashboard';
    return 'Parent';
  })();

  const conversationStudentName = isConversation ? String((conversationParams.studentName || conversationParams.name || '').trim()) : '';
  const displayTitle = isConversation ? (conversationStudentName || 'Student') : currentTitle;

  // Sync route params back to local state when route params change (only if different)
  useEffect(() => {
    if (isLinkedStudents) {
      const routeParams = route?.params || {};
      const routeSearchActive = routeParams.searchActive === true;
      const routeSearchQuery = String(routeParams.searchQuery || '');
      
      // Check if this is a reset (route params changed from true to false with empty query)
      const prevParams = prevRouteParamsRef.current;
      const wasActive = prevParams.searchActive === true;
      const isNowInactive = routeParams.searchActive === false && routeSearchQuery === '';
      const isReset = wasActive && isNowInactive;
      
      if (isReset) {
        isResettingRef.current = true;
      }
      
      // Update ref to track route params for the second useEffect (before state updates)
      prevRouteParamsRef.current = { searchActive: routeParams.searchActive, searchQuery: routeSearchQuery };
      
      // Always sync local state to match route params (route params are source of truth)
      if (routeSearchActive !== searchActive) {
        setSearchActive(routeSearchActive);
      }
      if (routeSearchQuery !== searchText) {
        setSearchText(routeSearchQuery);
      }
      
      // Clear reset flag after state update completes
      if (isReset) {
        setTimeout(() => {
          isResettingRef.current = false;
        }, 300);
      }
    } else {
      // Not on LinkedStudents screen - reset state
      if (searchActive) {
        setSearchActive(false);
        setSearchText('');
      }
      prevRouteParamsRef.current = { searchActive: undefined, searchQuery: undefined };
      isResettingRef.current = false;
    }
  }, [isLinkedStudents, route?.params?.searchActive, route?.params?.searchQuery]);

  const navigateToMessages = () => {
    try {
      const parentNav = navigation.getParent?.();
      if (parentNav) parentNav.navigate('MessagesTab', { screen: 'ParentMessages' });
      else navigation.navigate('MessagesTab', { screen: 'ParentMessages' });
    } catch {
      navigation.navigate('MessagesTab', { screen: 'ParentMessages' });
    }
  };

  // Keep LinkedStudents search state in sync with screen via params (only if different from route params)
  useEffect(() => {
    try {
      if (isLinkedStudents) {
        // If we're in the middle of a reset, don't override - let the first useEffect handle it
        if (isResettingRef.current) {
          return;
        }
        
        const routeParams = route?.params || {};
        const routeSearchActive = routeParams.searchActive === true;
        const routeSearchQuery = String(routeParams.searchQuery || '');
        const localSearchActive = searchActive === true;
        const localSearchQuery = String(searchText || '');
        
        // Normal sync: update route params if local state differs from route params
        // Debounce searchQuery updates to avoid too many navigations while typing
        if (localSearchActive !== routeSearchActive) {
          // searchActive changed - update immediately
          const params = { searchActive: localSearchActive, searchQuery: localSearchQuery };
          const parentNav = navigation.getParent?.();
          if (parentNav) parentNav.navigate('Home', { screen: 'LinkedStudents', params });
          else navigation.navigate('LinkedStudents', params);
        } else if (localSearchQuery !== routeSearchQuery) {
          // searchQuery changed - debounce to avoid too many navigations
          if (searchTextTimeoutRef.current) {
            clearTimeout(searchTextTimeoutRef.current);
          }
          searchTextTimeoutRef.current = setTimeout(() => {
            const params = { searchActive: localSearchActive, searchQuery: localSearchQuery };
            const parentNav = navigation.getParent?.();
            if (parentNav) parentNav.navigate('Home', { screen: 'LinkedStudents', params });
            else navigation.navigate('LinkedStudents', params);
          }, 300);
        }
      } else if (searchActive) {
        setSearchActive(false); setSearchText('');
      }
    } catch {}
    
    return () => {
      if (searchTextTimeoutRef.current) {
        clearTimeout(searchTextTimeoutRef.current);
      }
    };
  }, [isLinkedStudents, searchActive, searchText, route?.params]);

  const clearLinkedStudentsSearch = () => {
    setSearchActive(false);
    setSearchText('');
    try {
      const params = { searchActive: false, searchQuery: '' };
      navigation.setParams?.(params);
      navigation.getParent?.()?.setParams?.(params);
      // Navigate to ensure params are properly propagated
      const parentNav = navigation.getParent?.();
      if (parentNav) {
        parentNav.navigate('Home', { screen: 'LinkedStudents', params });
      } else {
        navigation.navigate('LinkedStudents', params);
      }
    } catch {}
  };

  const handleBack = () => {
    if (focusedName === 'StudentProfile') {
      // Navigate back to LinkedStudents in normal state (not search)
      navigateSafe({ name: 'Home', params: { screen: 'LinkedStudents', params: { searchActive: false, searchQuery: '' } } });
      return;
    }
    if (focusedName === 'LinkedStudents') {
      // Check both local state and route params to determine if search is active
      const routeSearchActive = route?.params?.searchActive === true || activeRoute?.params?.searchActive === true;
      const isSearchMode = searchActive || routeSearchActive;
      
      // If search is open (in any form), close it and stay on screen
      if (isSearchMode) {
        clearLinkedStudentsSearch();
        return;
      }
      // Normal state: reset Home stack and navigate to Menu
      clearLinkedStudentsSearch();
      resetHomeStackAndNavigateToMenu();
      return;
    }
    if (focusedName === 'AttendanceLog' || focusedName === 'Events' || focusedName === 'About' || focusedName === 'Profile') {
      // Reset Home stack and navigate to Menu
      resetHomeStackAndNavigateToMenu();
      return;
    }
    // Default detail back goes to dashboard
    navigateSafe({ name: 'Home', params: { screen: 'ParentDashboard' } });
  };

  const resetHomeStackAndNavigateToMenu = () => {
    try {
      const parentNav = navigation.getParent?.();
      if (parentNav) {
        // Get current navigation state
        const navState = parentNav.getState();
        const homeRouteIndex = navState?.routes?.findIndex(r => r.name === 'Home');
        
        if (homeRouteIndex !== undefined && homeRouteIndex >= 0) {
          // Reset the HomeStack to only contain ParentDashboard
          parentNav.dispatch(
            CommonActions.reset({
              index: navState.index,
              routes: navState.routes.map((route, idx) => {
                if (route.name === 'Home') {
                  return {
                    ...route,
                    state: {
                      routes: [{ name: 'ParentDashboard' }],
                      index: 0,
                    },
                  };
                }
                return route;
              }),
            })
          );
        }
        // Navigate to MenuTab
        parentNav.navigate('MenuTab');
      } else {
        navigation.navigate('MenuTab');
      }
    } catch (error) {
      // Fallback: just navigate to MenuTab
      try {
        const parentNav = navigation.getParent?.();
        if (parentNav) parentNav.navigate('MenuTab');
        else navigation.navigate('MenuTab');
      } catch {
        navigation.navigate('MenuTab');
      }
    }
  };

  return (
    <SafeAreaView edges={['top']} style={{ backgroundColor: '#004f89' }}>
      <View style={{ height: 60, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, minWidth: 0 }}>
          {isConversation ? (
            <TouchableOpacity onPress={navigateToMessages} style={{ width: 36, height: 36, borderRadius: 18, marginRight: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.15)' }}>
              <Ionicons name="chevron-back" size={22} color="#FFFFFF" />
            </TouchableOpacity>
          ) : isDetailScreen ? (
            <TouchableOpacity onPress={handleBack} style={{ width: 36, height: 36, borderRadius: 18, marginRight: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.15)' }}>
              <Ionicons name="chevron-back" size={22} color="#FFFFFF" />
            </TouchableOpacity>
          ) : isMenu ? (
            <TouchableOpacity onPress={() => navigateSafe({ name: 'Home', params: { screen: 'Profile' } })}>
              <View style={{ width: 46, height: 46, borderRadius: 23, marginRight: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: '#FFFFFF' }}>
                <Image
                  source={ profilePic ? profilePic : (user?.avatar ? { uri: user.avatar } : require('../../assets/icons/unknown avatar icon.jpg')) }
                  style={{ width: 36, height: 36, borderRadius: 18 }}
                />
              </View>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity onPress={() => navigateSafe({ name: 'Home', params: { screen: 'Profile' } })}>
              <View style={{ width: 46, height: 46, borderRadius: 23, marginRight: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: '#FFFFFF' }}>
                <Image
                  source={ profilePic ? profilePic : (user?.avatar ? { uri: user.avatar } : require('../../assets/icons/unknown avatar icon.jpg')) }
                  style={{ width: 36, height: 36, borderRadius: 18 }}
                />
              </View>
            </TouchableOpacity>
          )}
          {isLinkedStudents && searchActive ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, minWidth: 0 }}>
              <TextInput
                value={searchText}
                onChangeText={setSearchText}
                placeholder="Search student by name"
                placeholderTextColor="#CFE3F5"
                autoCorrect={false}
                autoCapitalize="words"
                autoFocus={true}
                style={{ flex: 1, minWidth: 0, color: '#fff', fontSize: 16, paddingVertical: 4, paddingHorizontal: 8, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.5)' }}
              />
            </View>
          ) : (
            <Text style={{ color: '#fff', fontSize: 18, fontWeight: '700', flexShrink: 1 }} numberOfLines={1} ellipsizeMode="tail">{displayTitle}</Text>
          )}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', flexShrink: 0 }}>
          {isLinkedStudents ? (
            <TouchableOpacity
              onPress={() => {
                if (!searchActive) { setSearchActive(true); setSearchText(''); }
                else { setSearchActive(false); setSearchText(''); }
              }}
              style={{ marginRight: 0 }}
            >
              <Ionicons name={searchActive ? 'close' : 'search'} size={22} color="#fff" />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
    </SafeAreaView>
  );
}






