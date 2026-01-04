import React, { useContext, useEffect, useState } from 'react';
import { View, StyleSheet, Text, ScrollView, Image, TouchableOpacity, Modal, Pressable, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { AuthContext } from '../../contexts/AuthContext';
import { PARENT_TAB_BAR_STYLE } from '../../navigation/tabStyles';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import avatarEventEmitter from '../../utils/avatarEventEmitter';
import { query, collection, where, getDocs } from 'firebase/firestore';
import { db } from '../../utils/firebaseConfig';
import { getNetworkErrorMessage } from '../../utils/networkErrorHandler';

export default function Profile({ navigation }) {
  const { user, loading } = useContext(AuthContext);

  const defaultProfile = require('../../assets/icons/unknown avatar icon.jpg');
  const defaultCover = null;

  const [profilePic, setProfilePic] = useState(defaultProfile);
  const [coverPhoto, setCoverPhoto] = useState(defaultCover);
  const [modalVisible, setModalVisible] = useState(false);
  const [activeType, setActiveType] = useState(null);
  const [linkedStudents, setLinkedStudents] = useState([]);
  const [networkErrorVisible, setNetworkErrorVisible] = useState(false);
  const [networkErrorTitle, setNetworkErrorTitle] = useState('');
  const [networkErrorMessage, setNetworkErrorMessage] = useState('');
  const [networkErrorColor, setNetworkErrorColor] = useState('#DC2626');

  useFocusEffect(
    React.useCallback(() => {
      const parent = navigation.getParent?.();
      if (parent) parent.setOptions({ tabBarStyle: { display: 'none' } });
      return () => {
        try {
          const p = navigation.getParent?.();
          if (p) p.setOptions({ tabBarStyle: PARENT_TAB_BAR_STYLE });
        } catch {}
      };
    }, [navigation])
  );

  useEffect(() => {
    try { console.log('ParentProfile - User data:', user); } catch {}
  }, [user]);

  // Load saved images
  useEffect(() => {
    const loadImages = async () => {
      try {
        const keyBase = String(user?.parentId || user?.uid || '').trim();
        if (!keyBase) return;
        const savedProfile = await AsyncStorage.getItem(`parent_profilePic_${keyBase}`);
        const savedCover = await AsyncStorage.getItem(`parent_coverPhoto_${keyBase}`);
        if (savedProfile) setProfilePic({ uri: savedProfile });
        if (savedCover) setCoverPhoto({ uri: savedCover });
      } catch (error) {
        console.log('Error loading parent images:', error);
      }
    };
    loadImages();
  }, [user?.parentId, user?.uid]);

  // ✅ Check linked students status
  useEffect(() => {
    const checkLinkedStatus = async () => {
      try {
        const parentId = user?.parentId || user?.id || user?.uid;
        if (!parentId) {
          setLinkedStudents([]);
          return;
        }
        
        const linksQuery = query(collection(db, 'parent_student_links'), where('parentId', '==', parentId), where('status', '==', 'active'));
        const linksSnap = await getDocs(linksQuery);
        
        if (!linksSnap.empty) {
          const students = linksSnap.docs.map(doc => {
            const data = doc.data();
            return {
              id: doc.id,
              studentName: data.studentName || '',
              studentId: data.studentId || data.studentIdNumber || '',
              relationship: data.relationship || '',
            };
          });
          students.sort((a, b) => String(a.studentName || '').toLowerCase().localeCompare(String(b.studentName || '').toLowerCase()));
          setLinkedStudents(students);
        } else {
          setLinkedStudents([]);
        }
      } catch (error) {
        console.error('Error checking linked students:', error);
        // Only show network error modal for actual network errors
        if (error?.code?.includes('unavailable') || error?.code?.includes('network') || error?.message?.toLowerCase().includes('network')) {
          const errorInfo = getNetworkErrorMessage({ type: 'unstable_connection', message: error.message });
          setNetworkErrorTitle(errorInfo.title);
          setNetworkErrorMessage(errorInfo.message);
          setNetworkErrorColor(errorInfo.color);
          setNetworkErrorVisible(true);
          setTimeout(() => setNetworkErrorVisible(false), 5000);
        }
        console.log("Error checking linked status:", error);
        setLinkedStudents([]);
      }
    };
    checkLinkedStatus();
  }, [user?.parentId, user?.id, user?.uid]);

  const pickImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: activeType === 'cover' ? [16, 9] : [1, 1],
        quality: 1,
      });
      if (!result.canceled) {
        const uri = result.assets[0].uri;
        const keyBase = String(user?.parentId || user?.uid || '').trim();
        if (activeType === 'profile') {
          setProfilePic({ uri });
          await AsyncStorage.setItem(`parent_profilePic_${keyBase}`, uri);
          // Emit event to notify other screens
          avatarEventEmitter.emit('avatarChanged', { parentId: keyBase, uri });
        } else if (activeType === 'cover') {
          setCoverPhoto({ uri });
          await AsyncStorage.setItem(`parent_coverPhoto_${keyBase}`, uri);
        }
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to pick image.');
    } finally {
      setModalVisible(false);
    }
  };

  const removeCurrentImage = async () => {
    try {
      const keyBase = String(user?.parentId || user?.uid || '').trim();
      if (activeType === 'profile') {
        await AsyncStorage.removeItem(`parent_profilePic_${keyBase}`);
        setProfilePic(defaultProfile);
        // Emit event to notify other screens
        avatarEventEmitter.emit('avatarChanged', { parentId: keyBase, uri: null });
      } else if (activeType === 'cover') {
        await AsyncStorage.removeItem(`parent_coverPhoto_${keyBase}`);
        setCoverPhoto(defaultCover);
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to remove image.');
    } finally {
      setModalVisible(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <Text>Loading profile...</Text>
      </View>
    );
  }

  if (!user) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <Text>No user data available</Text>
      </View>
    );
  }

  const fullName = `${user?.lastName || ''}, ${user?.firstName || ''} ${user?.middleName || ''}`.trim();

  return (
    <View style={{ flex: 1 }}>
      <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 16 }}>
        <View style={styles.coverContainer}>
          {coverPhoto ? (
            <Image source={coverPhoto} style={styles.coverPhoto} />
          ) : (
            <View style={styles.coverFallback} />
          )}
          <View style={styles.coverOverlay} />

          <TouchableOpacity
            style={styles.coverChangeBadge}
            activeOpacity={0.9}
            onPress={() => { setActiveType('cover'); setModalVisible(true); }}
          >
            <Ionicons name="image" size={16} color="#fff" />
            <Text style={styles.coverChangeText}>Change cover</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.profilePicContainer}>
          <Image source={profilePic} style={styles.profilePic} />
          <TouchableOpacity
            style={styles.changePhotoBadge}
            activeOpacity={0.9}
            onPress={() => { setActiveType('profile'); setModalVisible(true); }}
          >
            <Ionicons name="camera" size={14} color="#fff" />
          </TouchableOpacity>
        </View>

        <View style={styles.nameSection}>
          <Text style={styles.fullName}>{fullName || 'Parent'}</Text>
          <View style={styles.chipsRow}>
            {!!user?.role && (
              <View style={[styles.chip, { backgroundColor: '#E5E7EB' }]}>
                <Ionicons name="person-outline" size={14} color="#111827" />
                <Text style={styles.chipText}>{String(user.role || '').toUpperCase()}</Text>
              </View>
            )}
            {!!user?.parentId && (
              <View style={[styles.chip, { backgroundColor: '#DBEAFE' }]}>
                <Ionicons name="id-card-outline" size={14} color="#2563eb" />
                <Text style={[styles.chipText, { color: '#2563eb' }]}>ID: {user.parentId}</Text>
              </View>
            )}
          </View>
        </View>

        <View style={[styles.infoRow, { marginTop: 14 }]}>
          <Text style={styles.label}>Parent ID</Text>
          <Text style={styles.value}>{user?.parentId || '—'}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.label}>Email</Text>
          <Text style={styles.value}>{user?.email || '—'}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.label}>Contact</Text>
          <Text style={styles.value}>{user?.contactNumber || user?.contact || '—'}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.label}>Gender</Text>
          <Text style={styles.value}>{user?.gender || '—'}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.label}>Age</Text>
          <Text style={styles.value}>{user?.age || '—'}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.label}>Birthday</Text>
          <Text style={styles.value}>
            {(() => { 
              if (!user?.birthday) return '—'; 
              try { 
                const d = new Date(user.birthday); 
                if (isNaN(d.getTime())) return String(user.birthday); 
                return d.toLocaleDateString(); 
              } catch { 
                return String(user.birthday); 
              } 
            })()}
          </Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.label}>Address</Text>
          <Text style={styles.value} numberOfLines={3}>
            {user?.address || '—'}
          </Text>
        </View>

        {/* Linked Students Section */}
        <View style={styles.infoRow}>
          <Text style={styles.label}>Linked Students</Text>
          {linkedStudents.length > 0 ? (
            <View style={styles.linkedStudentsContainer}>
              {linkedStudents.map((student, index) => (
                <View key={student.id || index} style={styles.linkedStudentItem}>
                  <Ionicons name="person-outline" size={14} color="#004f89" />
                  <Text style={styles.linkedStudentText}>{student.studentName || 'Unknown Student'}</Text>
                  {student.relationship && (
                    <Text style={styles.relationshipText}>({student.relationship})</Text>
                  )}
                </View>
              ))}
            </View>
          ) : (
            <Text style={styles.value}>N/A</Text>
          )}
        </View>
      </ScrollView>

      <Modal
        transparent={true}
        visible={modalVisible}
        animationType="slide"
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>
              {activeType === 'profile' ? 'Change Profile Picture' : 'Change Cover Photo'}
            </Text>
            <Pressable style={[styles.modalButton, { backgroundColor: '#004f89' }]} onPress={pickImage}>
              <Text style={styles.modalButtonText}>Choose from Gallery</Text>
            </Pressable>
            {((activeType === 'profile' && profilePic !== defaultProfile) || (activeType === 'cover' && coverPhoto)) && (
              <Pressable style={[styles.modalButton, { backgroundColor: '#8B0000' }]} onPress={removeCurrentImage}>
                <Text style={styles.modalButtonText}>Remove {activeType === 'profile' ? 'Profile' : 'Cover'} Photo</Text>
              </Pressable>
            )}
            <Pressable
              style={[styles.modalButton, { backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#D1D5DB' }]}
              onPress={() => setModalVisible(false)}
            >
              <Text style={[styles.modalButtonText, { color: '#374151' }]}>Cancel</Text>
            </Pressable>
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
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  coverContainer: { width: '100%', height: 160, position: 'relative', borderBottomLeftRadius: 12, borderBottomRightRadius: 12, overflow: 'hidden' },
  coverPhoto: { width: '100%', height: '100%' },
  coverFallback: { width: '100%', height: '100%', backgroundColor: '#E5E7EB' },
  coverOverlay: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.15)' },
  backButton: { position: 'absolute', left: 16, top: 50, width: 50, height: 50, borderRadius: 30, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center', zIndex: 40 },
  coverChangeBadge: { position: 'absolute', right: 12, bottom: 12, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: '#2563eb', alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 6, zIndex: 30, borderWidth: 2, borderColor: '#fff' },
  coverChangeText: { color: '#fff', fontWeight: '700' },
  profilePicContainer: { alignSelf: 'center', marginTop: -40, borderWidth: 6, borderColor: '#004f89', borderRadius: 50, overflow: 'visible', width: 100, height: 100, backgroundColor: '#fff', shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 6, position: 'relative', zIndex: 20, alignItems: 'center', justifyContent: 'center', padding: 6 },
  profilePic: { width: 76, height: 76, borderRadius: 38, alignSelf: 'center' },
  changePhotoBadge: { position: 'absolute', right: 2, bottom: 2, width: 28, height: 28, borderRadius: 14, backgroundColor: '#2563eb', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#fff', zIndex: 50, elevation: 10 },
  nameSection: { marginTop: 10, alignItems: 'center', paddingHorizontal: 20 },
  fullName: { fontSize: 22, fontWeight: '800', color: '#111827', textAlign: 'center' },
  chipsRow: { flexDirection: 'row', gap: 8, marginTop: 8, flexWrap: 'wrap', justifyContent: 'center' },
  chip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, flexDirection: 'row', alignItems: 'center', gap: 6 },
  chipText: { color: '#111827', fontWeight: '700', fontSize: 12 },
  infoRow: {
    flexDirection: 'column',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 79, 137, 0.15)',
  },
  label: { 
    fontWeight: '700', 
    color: '#374151', 
    fontSize: 12,
    marginBottom: 3,
    letterSpacing: 0.2,
  },
  value: { 
    color: '#6B7280', 
    fontWeight: '500', 
    fontSize: 13,
    lineHeight: 18,
  },
  linkedStudentsContainer: {
    marginTop: 4,
    gap: 6,
  },
  linkedStudentItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
  },
  linkedStudentText: {
    color: '#6B7280',
    fontWeight: '500',
    fontSize: 13,
  },
  relationshipText: {
    color: '#9CA3AF',
    fontSize: 11,
    fontStyle: 'italic',
  },
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  modalContent: { backgroundColor: '#fff', padding: 20, borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  modalTitle: { fontSize: 18, fontWeight: '700', marginBottom: 15, textAlign: 'center' },
  modalButton: { backgroundColor: '#2563eb', paddingVertical: 12, borderRadius: 8, marginTop: 10 },
  modalButtonText: { textAlign: 'center', color: '#fff', fontSize: 16, fontWeight: '700' },
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



