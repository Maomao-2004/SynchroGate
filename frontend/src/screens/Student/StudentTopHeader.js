import React, { useContext, useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, Image, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation, useNavigationState, useFocusEffect, CommonActions } from '@react-navigation/native';
import { AuthContext } from '../../contexts/AuthContext';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../utils/firebaseConfig';
import avatarEventEmitter from '../../utils/avatarEventEmitter';

const DETAIL_ROUTES = ['Profile', 'QRPreview', 'Events', 'AttendanceLog', 'LinkParent', 'ParentProfile', 'About', 'StudentConversation'];

const ROUTE_TITLES = {
  StudentDashboard: 'Dashboard',
  AttendanceLog: 'Attendance',
  ScheduleTab: 'Schedule',
  Schedule: 'Schedule',
  MessagesTab: 'Messages',
  StudentMessages: 'Messages',
  AlertsTab: 'Notifications',
  MenuTab: 'Menu',
  Menu: 'Menu',
  Profile: 'Profile',
  QRPreview: 'Student QR',
  Events: 'Events',
  LinkParent: 'Link Parents',
  ParentProfile: 'Parent Profile',
  About: 'About',
};

export default function StudentTopHeader() {
  const navigation = useNavigation();
  const navigationState = useNavigationState((state) => state);
  const { user } = useContext(AuthContext);
  const [avatarSource, setAvatarSource] = useState(null);

  const loadAvatar = React.useCallback(async () => {
    try {
      const keyBase = user?.studentId ? String(user.studentId) : String(user?.uid || '');
      if (!keyBase) { setAvatarSource(null); return; }
      // Use the same key as Profile.js: profilePic_${user.studentId}
      const primaryKey = `profilePic_${keyBase}`;
      // Also check legacy keys for backward compatibility
      const legacyKey1 = `student_profilePic_${keyBase}`;
      const legacyKey2 = `studentProfilePic_${keyBase}`;
      let stored = await AsyncStorage.getItem(primaryKey);
      if (!stored) stored = await AsyncStorage.getItem(legacyKey1);
      if (!stored) stored = await AsyncStorage.getItem(legacyKey2);
      if (stored) setAvatarSource({ uri: stored });
      else if (user?.avatar) setAvatarSource({ uri: user.avatar });
      else setAvatarSource(require('../../assets/icons/unknown avatar icon.jpg'));
    } catch {
      if (user?.avatar) setAvatarSource({ uri: user.avatar });
      else setAvatarSource(require('../../assets/icons/unknown avatar icon.jpg'));
    }
  }, [user?.studentId, user?.uid, user?.avatar]);

  // Load avatar on mount and when user data changes
  useEffect(() => {
    loadAvatar();
  }, [loadAvatar]);

  // Refresh avatar when screen comes into focus (e.g., returning from Profile screen)
  useFocusEffect(
    React.useCallback(() => {
      loadAvatar();
    }, [loadAvatar])
  );

  // Listen for avatar changes from Profile screen
  useEffect(() => {
    const handleAvatarChange = (data) => {
      const keyBase = user?.studentId ? String(user.studentId) : String(user?.uid || '');
      if (keyBase && data.studentId && String(data.studentId) === String(keyBase)) {
        loadAvatar();
      }
    };

    avatarEventEmitter.on('avatarChanged', handleAvatarChange);
    return () => {
      avatarEventEmitter.off('avatarChanged', handleAvatarChange);
    };
  }, [user?.studentId, user?.uid, loadAvatar]);

  // Initialize studentFullName state first, before any conditional logic
  const [studentFullName, setStudentFullName] = useState('');

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
    return { name: 'StudentDashboard', params: {} };
  };

  const activeRoute = getActiveRoute();
  const currentRoute = activeRoute?.name || 'StudentDashboard';
  const isDetail = DETAIL_ROUTES.includes(currentRoute);
  const isConversation = currentRoute === 'StudentConversation';
  const conversationParams = isConversation ? (activeRoute?.params || {}) : {};
  const parentName = isConversation ? String(conversationParams.parentName || '') : '';
  const studentId = isConversation ? (conversationParams.studentId || null) : null;
  const studentIdNumber = isConversation ? (conversationParams.studentIdNumber || null) : null;
  const studentName = isConversation ? String(conversationParams.studentName || '') : '';
  const isStudentConversation = isConversation && !!(studentId || studentIdNumber);
  
  // Fetch student's firstName and lastName for student-to-student conversations
  useEffect(() => {
    let isActive = true;
    const fetchStudentName = async () => {
      if (!isStudentConversation || (!studentId && !studentIdNumber)) {
        setStudentFullName('');
        return;
      }
      
      // Use passed studentName as initial value
      if (studentName && isActive) {
        setStudentFullName(studentName);
      }
      
      try {
        const usersRef = collection(db, 'users');
        let userSnap = null;
        
        // Try to find by uid first
        if (studentId && !String(studentId).includes('-')) {
          const q = query(usersRef, where('uid', '==', studentId));
          userSnap = await getDocs(q);
        }
        
        // If not found, try by studentId
        if ((!userSnap || userSnap.empty) && studentIdNumber) {
          const q = query(usersRef, where('studentId', '==', studentIdNumber));
          userSnap = await getDocs(q);
        }
        
        if (userSnap && !userSnap.empty && isActive) {
          const userData = userSnap.docs[0].data();
          const firstName = userData.firstName || '';
          const lastName = userData.lastName || '';
          const fullName = `${firstName} ${lastName}`.trim();
          setStudentFullName(fullName || studentName || 'Student');
        } else if (isActive) {
          setStudentFullName(studentName || 'Student');
        }
      } catch (error) {
        console.log('Error fetching student name:', error);
        if (isActive) setStudentFullName(studentName || 'Student');
      }
    };
    
    fetchStudentName();
    return () => { isActive = false; };
  }, [isStudentConversation, studentId, studentIdNumber, studentName]);
  
  // Parse parent name to get first and last name
  const getParentDisplayName = () => {
    if (!parentName) return 'Parent';
    const nameParts = parentName.trim().split(/\s+/);
    if (nameParts.length === 0) return 'Parent';
    if (nameParts.length === 1) return nameParts[0];
    // Return first name and last name
    return `${nameParts[0]} ${nameParts[nameParts.length - 1]}`;
  };
  
  const getConversationTitle = () => {
    if (isStudentConversation) {
      return studentFullName || 'Student';
    } else {
      return getParentDisplayName();
    }
  };
  
  const title = isConversation ? getConversationTitle() : (ROUTE_TITLES[currentRoute] || 'Student');
  const isLinkParent = currentRoute === 'LinkParent';
  const linkParentParams = isLinkParent ? (activeRoute?.params || {}) : {};
  const headerSearchActive = isLinkParent && linkParentParams.searchActive === true;
  const headerSearchText = headerSearchActive ? String(linkParentParams.searchQuery || '') : '';

  const navigateHome = () => {
    try {
      const parent = navigation.getParent?.();
      if (parent) parent.navigate('Home', { screen: 'StudentDashboard' });
      else navigation.navigate('StudentDashboard');
    } catch {}
  };

  const navigateToLinkParent = () => {
    try {
      const parent = navigation.getParent?.();
      if (parent) parent.navigate('Home', { screen: 'LinkParent' });
      else navigation.navigate('LinkParent');
    } catch {}
  };

  const navigateToMessages = () => {
    try {
      const parentNav = navigation.getParent?.();
      if (parentNav) parentNav.navigate('MessagesTab', { screen: 'StudentMessages' });
      else navigation.navigate('MessagesTab', { screen: 'StudentMessages' });
    } catch {
      navigation.navigate('MessagesTab', { screen: 'StudentMessages' });
    }
  };

  const navigateProfile = () => {
    try {
      const parent = navigation.getParent?.();
      if (parent) parent.navigate('Home', { screen: 'Profile' });
      else navigation.navigate('Profile');
    } catch {}
  };

  const updateLinkParentSearch = (params) => {
    try {
      const parent = navigation.getParent?.();
      if (parent) parent.navigate('Home', { screen: 'LinkParent', params });
      else navigation.navigate('LinkParent', params);
    } catch {}
  };

  const resetHomeStackAndNavigateToMenu = () => {
    try {
      const parentNav = navigation.getParent?.();
      if (parentNav) {
        // Get current navigation state
        const navState = parentNav.getState();
        const homeRouteIndex = navState?.routes?.findIndex(r => r.name === 'Home');
        
        if (homeRouteIndex !== undefined && homeRouteIndex >= 0) {
          // Reset the HomeStack to only contain StudentDashboard
          parentNav.dispatch(
            CommonActions.reset({
              index: navState.index,
              routes: navState.routes.map((route, idx) => {
                if (route.name === 'Home') {
                  return {
                    ...route,
                    state: {
                      routes: [{ name: 'StudentDashboard' }],
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

  const handleBack = () => {
    if (currentRoute === 'StudentConversation') {
      navigateToMessages();
      return;
    }
    if (currentRoute === 'ParentProfile') {
      navigateToLinkParent();
      return;
    }
    if (currentRoute === 'LinkParent') {
      // Check if search is active
      if (headerSearchActive) {
        updateLinkParentSearch({ searchActive: false, searchQuery: '' });
        return;
      }
      // Normal state: reset Home stack and navigate to Menu
      resetHomeStackAndNavigateToMenu();
      return;
    }
    if (currentRoute === 'Profile' || currentRoute === 'AttendanceLog' || currentRoute === 'Events' || currentRoute === 'About') {
      // Reset Home stack and navigate to Menu
      resetHomeStackAndNavigateToMenu();
      return;
    }
    // Default: navigate to dashboard
    navigateHome();
  };

  const avatar = avatarSource || require('../../assets/icons/unknown avatar icon.jpg');

  return (
    <SafeAreaView edges={['top']} style={{ backgroundColor: '#004f89' }}>
      <View style={{ height: 60, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          {isDetail ? (
            <TouchableOpacity 
              onPress={handleBack} 
              style={{ width: 36, height: 36, borderRadius: 18, marginRight: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.15)' }}
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
          {isLinkParent && headerSearchActive ? (
            <TextInput
              value={headerSearchText}
              onChangeText={(text) => updateLinkParentSearch({ searchActive: true, searchQuery: text })}
              placeholder="Search parents by name"
              placeholderTextColor="#CFE3F5"
              autoCorrect={false}
              autoCapitalize="words"
              autoFocus={true}
              style={{ minWidth: 180, color: '#FFFFFF', fontSize: 16, paddingVertical: 4, paddingHorizontal: 8, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.5)' }}
            />
          ) : (
            <Text style={{ color: '#FFFFFF', fontSize: 18, fontWeight: '700' }}>{title}</Text>
          )}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          {isLinkParent && (
            <TouchableOpacity
              onPress={() => {
                if (headerSearchActive) {
                  updateLinkParentSearch({ searchActive: false, searchQuery: '' });
                } else {
                  updateLinkParentSearch({ searchActive: true, searchQuery: '' });
                }
              }}
              style={{ marginLeft: 12, width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' }}
            >
              <Ionicons name={headerSearchActive ? 'close' : 'search'} size={22} color="#FFFFFF" />
            </TouchableOpacity>
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}
 