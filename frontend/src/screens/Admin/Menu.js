import React, { useContext, useEffect, useCallback, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Modal, Dimensions, Image } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { AuthContext } from '../../contexts/AuthContext';
import avatarEventEmitter from '../../utils/avatarEventEmitter';

const DEFAULT_PROFILE = require('../../assets/icons/unknown avatar icon.jpg');

const { width } = Dimensions.get('window');
const CARD_GAP = 12;
const CARD_PADDING = 16;
const CARD_WIDTH = (width - (CARD_PADDING * 2) - CARD_GAP) / 2;
const FULL_WIDTH = width - (CARD_PADDING * 2);

export default function AdminMenu() {
  const navigation = useNavigation();
  const { logout, user } = useContext(AuthContext);
  const [logoutVisible, setLogoutVisible] = useState(false);
  const [profilePic, setProfilePic] = useState(null);

  const loadProfilePic = useCallback(async () => {
    let mounted = true;
    try {
      const base = user?.uid ? String(user.uid) : '';
      if (!base) return;
      const key = `admin_profilePic_${base}`;
      let saved = await AsyncStorage.getItem(key);
      if (mounted) setProfilePic(saved ? { uri: saved } : null);
    } catch {
      if (mounted) setProfilePic(null);
    }
    return () => { mounted = false; };
  }, [user?.uid]);

  useEffect(() => {
    loadProfilePic();
  }, [loadProfilePic]);

  useEffect(() => {
    const handleAvatarChange = (data) => {
      const base = user?.uid ? String(user.uid) : '';
      if (base && data.uid && String(data.uid) === String(base)) {
        loadProfilePic();
      }
    };

    avatarEventEmitter.on('avatarChanged', handleAvatarChange);
    return () => {
      avatarEventEmitter.off('avatarChanged', handleAvatarChange);
    };
  }, [user?.uid, loadProfilePic]);

  const navigateSafe = (target) => {
    try {
      const parentNav = navigation.getParent?.();
      if (parentNav) parentNav.navigate(target.name, target.params || {});
      else navigation.navigate(target.name, target.params || {});
    } catch {
      navigation.navigate(target.name, target.params || {});
    }
  };

  const menuItems = [
    {
      id: 'students',
      label: 'Students',
      icon: 'school-outline',
      onPress: () => navigateSafe({ name: 'StudentsTab' }),
    },
    {
      id: 'parents',
      label: 'Parents',
      icon: 'people-outline',
      onPress: () => navigateSafe({ name: 'ParentsTab' }),
    },
    {
      id: 'events',
      label: 'Events',
      icon: 'megaphone-outline',
      onPress: () => navigateSafe({ name: 'Home', params: { screen: 'Events' } }),
    },
    {
      id: 'attendance',
      label: 'Attendance',
      icon: 'checkmark-done-outline',
      onPress: () => navigateSafe({ name: 'StudentAttendance' }),
    },
  ];

  const confirmLogout = async () => {
    setLogoutVisible(false);
    try {
      await logout?.();
    } catch {}
  };

  const cancelLogout = () => setLogoutVisible(false);

  const displayName = `${(user?.firstName || '').trim()} ${(user?.lastName || '').trim()}`.trim() || 'Admin';

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        {/* Profile full-width card */}
        <View style={styles.profileCard}>
          <View style={styles.profileRow}>
            <View style={styles.profileAvatarWrap}>
              <Image
                source={require('../../assets/SG.png')}
                style={styles.profileAvatarImg}
              />
            </View>
            <View style={styles.profileTextCol}>
              <Text style={styles.profileTitle}>{displayName}</Text>
              <Text style={styles.profileSubtitle}>System administrator</Text>
            </View>
          </View>
        </View>

        {/* Grid of actions */}
        <View style={styles.gridContainer}>
          {menuItems.map((item) => (
            <TouchableOpacity
              key={item.id}
              style={styles.card}
              onPress={item.onPress}
              activeOpacity={0.8}
            >
              <View style={[styles.iconContainer, { backgroundColor: 'rgba(0,79,137,0.12)' }]}>
                <Ionicons name={item.icon} size={22} color="#004f89" />
              </View>
              <Text style={styles.cardLabel}>{item.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Developer and About row */}
        <View style={[styles.gridContainer, { marginTop: 0 }]}>
          <TouchableOpacity
            style={styles.card}
            onPress={() => navigateSafe({ name: 'Home', params: { screen: 'Developer' } })}
            activeOpacity={0.8}
          >
            <View style={[styles.iconContainer, { backgroundColor: 'rgba(0,79,137,0.12)' }]}>
              <Ionicons name="code-outline" size={22} color="#004f89" />
            </View>
            <Text style={styles.cardLabel}>Developer</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.card}
            onPress={() => navigateSafe({ name: 'Home', params: { screen: 'About' } })}
            activeOpacity={0.8}
          >
            <View style={[styles.iconContainer, { backgroundColor: 'rgba(0,79,137,0.12)' }]}>
              <Ionicons name="information-circle-outline" size={22} color="#004f89" />
            </View>
            <Text style={styles.cardLabel}>About</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Logout full-width card - sticky bottom */}
      <TouchableOpacity
        style={styles.logoutCardContainer}
        activeOpacity={0.85}
        onPress={() => setLogoutVisible(true)}
      >
        <View style={styles.logoutCard}>
          <Text style={styles.logoutLabel}>Logout</Text>
        </View>
      </TouchableOpacity>

      <Modal
        transparent
        animationType="fade"
        visible={logoutVisible}
        onRequestClose={() => setLogoutVisible(false)}
      >
        <View style={styles.modalOverlayCenter}>
          <View style={styles.modalCard}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Logout</Text>
              <Text style={styles.modalMessage}>Are you sure you want to logout?</Text>
            </View>
            <View style={styles.modalButtonContainer}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={cancelLogout}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalConfirmButton, { backgroundColor: '#7F1D1D' }]}
                onPress={confirmLogout}
              >
                <Text style={styles.modalConfirmText}>Logout</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  scrollView: { flex: 1 },
  contentContainer: {
    padding: CARD_PADDING,
    paddingBottom: 20,
    paddingTop: 50,
    flexGrow: 1,
  },
  profileCard: {
    width: FULL_WIDTH,
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginTop: 12,
    marginBottom: 4,
    minHeight: 96,
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 3,
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  profileAvatarWrap: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    borderColor: '#004f89',
  },
  profileAvatarImg: {
    width: 36,
    height: 36,
    borderRadius: 18,
    resizeMode: 'cover',
  },
  profileTextCol: { flex: 1, justifyContent: 'center' },
  profileTitle: { fontSize: 16, fontWeight: '700', color: '#111827' },
  profileSubtitle: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  card: {
    width: CARD_WIDTH,
    backgroundColor: '#fff',
    borderRadius: 8,
    paddingVertical: 14,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginBottom: CARD_GAP,
    gap: 12,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 3,
  },
  fullWidthCard: {
    width: FULL_WIDTH,
    backgroundColor: '#fff',
    borderRadius: 8,
    paddingVertical: 14,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginBottom: CARD_GAP,
    gap: 12,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 3,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#111827',
    textAlign: 'left',
  },
  listCard: {
    width: FULL_WIDTH,
    backgroundColor: '#fff',
    borderRadius: 8,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 3,
    marginBottom: CARD_GAP,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  listIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listLabel: { flex: 1, fontSize: 14, fontWeight: '700', color: '#111827' },
  logoutCardContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: CARD_PADDING,
    paddingBottom: 10,
    backgroundColor: '#F9FAFB',
  },
  logoutCard: {
    width: '100%',
    backgroundColor: '#fff',
    borderRadius: 8,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 3,
  },
  logoutLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#991B1B',
    textAlign: 'center',
  },
  modalOverlayCenter: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  modalCard: {
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
  modalContent: { flex: 1 },
  modalTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#050505',
    marginBottom: 12,
    textAlign: 'left',
  },
  modalMessage: {
    fontSize: 15,
    color: '#65676B',
    textAlign: 'left',
    lineHeight: 20,
  },
  modalButtonContainer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 20,
    gap: 8,
  },
  modalCancelButton: {
    backgroundColor: '#E4E6EB',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCancelText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#050505',
  },
  modalConfirmButton: {
    backgroundColor: '#1877F2',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalConfirmText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});


