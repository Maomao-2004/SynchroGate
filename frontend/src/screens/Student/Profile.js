import React, { useContext, useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Image,
  ScrollView,
  TouchableOpacity,
  Modal,
  Pressable,
  Alert,
  Animated,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { AuthContext } from "../../contexts/AuthContext";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from '@react-navigation/native';
import { STUDENT_TAB_BAR_STYLE } from '../../navigation/tabStyles';
import avatarEventEmitter from '../../utils/avatarEventEmitter';
import { query, collection, where, getDocs } from 'firebase/firestore';
import { db } from '../../utils/firebaseConfig';
import { withNetworkErrorHandling, getNetworkErrorMessage } from '../../utils/networkErrorHandler';

const Profile = ({ navigation }) => {
  const { user, loading, refreshUserData } = useContext(AuthContext);

  const defaultProfile = require("../../assets/icons/unknown avatar icon.jpg");
  const defaultCover = null; // use themed color background when not set

  const [profilePic, setProfilePic] = useState(defaultProfile);
  const [coverPhoto, setCoverPhoto] = useState(defaultCover);

  const [modalVisible, setModalVisible] = useState(false);
  const [activeType, setActiveType] = useState(null);
  const [linkedParents, setLinkedParents] = useState([]);
  const [networkErrorVisible, setNetworkErrorVisible] = useState(false);
  const [networkErrorTitle, setNetworkErrorTitle] = useState('');
  const [networkErrorMessage, setNetworkErrorMessage] = useState('');
  const [networkErrorColor, setNetworkErrorColor] = useState('#DC2626');

  // Hide student tab while focused and restore on blur
  useFocusEffect(
    React.useCallback(() => {
      const parent = navigation.getParent?.();
      if (parent) parent.setOptions({ tabBarStyle: { display: 'none' } });
      return () => {};
    }, [navigation])
  );

  // Debug logging
  useEffect(() => {
    console.log("StudentProfile - User data:", user);
  }, [user]);

  // Show loading state
  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: '#FFFFFF' }} />
    );
  }

  // Show error state if no user data
  if (!user) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <Text>No user data available</Text>
      </View>
    );
  }

  // ✅ Load saved images
  useEffect(() => {
    const loadImages = async () => {
      try {
        const keyBase = user?.studentId ? String(user.studentId) : String(user?.uid || '');
        if (!keyBase) return;
        
        const savedProfile = await AsyncStorage.getItem(`profilePic_${keyBase}`);
        const savedCover = await AsyncStorage.getItem(`coverPhoto_${keyBase}`);

        if (savedProfile) setProfilePic({ uri: savedProfile });
        if (savedCover) setCoverPhoto({ uri: savedCover });
      } catch (error) {
        console.log("Error loading images:", error);
      }
    };
    loadImages();
  }, [user?.studentId, user?.uid]);

  // ✅ Check linked parents status
  useEffect(() => {
    const checkLinkedParents = async () => {
      try {
        const studentUid = user?.uid || user?.id;
        const studentIdNumber = user?.studentId;
        
        if (!studentUid && !studentIdNumber) {
          setLinkedParents([]);
          return;
        }
        
        // Query both studentId (UID) and studentIdNumber (canonical ID)
        const queries = [];
        if (studentUid) {
          queries.push(query(
            collection(db, 'parent_student_links'), 
            where('studentId', '==', studentUid), 
            where('status', '==', 'active')
          ));
        }
        if (studentIdNumber) {
          queries.push(query(
            collection(db, 'parent_student_links'), 
            where('studentIdNumber', '==', studentIdNumber), 
            where('status', '==', 'active')
          ));
        }
        
        if (queries.length === 0) {
          setLinkedParents([]);
          return;
        }
        
        // Execute all queries and combine results
        const allResults = [];
        for (const q of queries) {
          const linksSnap = await getDocs(q);
          linksSnap.docs.forEach(doc => {
            const data = doc.data();
            allResults.push({
              id: doc.id,
              parentName: data.parentName || '',
              parentId: data.parentId || '',
              relationship: data.relationship || '',
            });
          });
        }
        
        // Remove duplicates and sort
        const uniqueParents = Array.from(
          new Map(allResults.map(p => [p.parentId || p.id, p])).values()
        );
        uniqueParents.sort((a, b) => String(a.parentName || '').toLowerCase().localeCompare(String(b.parentName || '').toLowerCase()));
        setLinkedParents(uniqueParents);
      } catch (error) {
        console.error("Error checking linked parents:", error);
        // Only show network error modal for actual network errors
        if (error?.code?.includes('unavailable') || error?.code?.includes('network') || error?.message?.toLowerCase().includes('network')) {
          const errorInfo = getNetworkErrorMessage({ type: 'unstable_connection', message: error.message });
          setNetworkErrorTitle(errorInfo.title);
          setNetworkErrorMessage(errorInfo.message);
          setNetworkErrorColor(errorInfo.color);
          setNetworkErrorVisible(true);
          setTimeout(() => setNetworkErrorVisible(false), 5000);
        }
        setLinkedParents([]);
      }
    };
    checkLinkedParents();
  }, [user?.studentId, user?.uid, user?.id]);

  const formatYearLabel = (val) => {
    const str = String(val ?? '').trim();
    const num = parseInt(str, 10);
    if (num === 1) return '1st Year';
    if (num === 2) return '2nd Year';
    if (num === 3) return '3rd Year';
    if (num === 4) return '4th Year';
    return str || '';
  };

  // ✅ Pick image & save
  const pickImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: activeType === "cover" ? [16, 9] : [1, 1],
        quality: 1,
      });

      if (!result.canceled) {
        const uri = result.assets[0].uri;
        const keyBase = user?.studentId ? String(user.studentId) : String(user?.uid || '');

        if (activeType === "profile") {
          setProfilePic({ uri });
          await AsyncStorage.setItem(`profilePic_${keyBase}`, uri);
          // Emit event to notify other screens
          avatarEventEmitter.emit('avatarChanged', { studentId: keyBase, uri });
        } else if (activeType === "cover") {
          setCoverPhoto({ uri });
          await AsyncStorage.setItem(`coverPhoto_${keyBase}`, uri);
        }
      }
    } catch (error) {
      Alert.alert("Error", "Failed to pick image.");
    } finally {
      setModalVisible(false);
    }
  };

  // ✅ Remove current image
  const removeCurrentImage = async () => {
    try {
      const keyBase = user?.studentId ? String(user.studentId) : String(user?.uid || '');
      if (activeType === 'profile') {
        await AsyncStorage.removeItem(`profilePic_${keyBase}`);
        setProfilePic(defaultProfile);
        // Emit event to notify other screens
        avatarEventEmitter.emit('avatarChanged', { studentId: keyBase, uri: null });
      } else if (activeType === 'cover') {
        await AsyncStorage.removeItem(`coverPhoto_${keyBase}`);
        setCoverPhoto(defaultCover);
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to remove image.');
    } finally {
      setModalVisible(false);
    }
  };


  const fullName = `${user?.lastName || ""}, ${user?.firstName || ""} ${user?.middleName || ""}`.trim();

  return (
    <View style={{ flex: 1 }}>
      <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 16 }}>
        {/* Cover Photo (tap only via the labeled button) */}
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

        {/* Profile Picture (Centered) */}
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

        {/* Name + Chips */}
        <View style={styles.nameSection}>
          <Text style={styles.fullName}>{fullName || "Student"}</Text>
          <View style={styles.chipsRow}>
            {!!user?.role && (
              <View style={[styles.chip, { backgroundColor: "#E5E7EB" }]}>
                <Ionicons name="person-outline" size={14} color="#111827" />
                <Text style={styles.chipText}>{(user.role || "").toUpperCase()}</Text>
              </View>
            )}
            {!!user?.studentId && (
              <View style={[styles.chip, { backgroundColor: "#DBEAFE" }]}>
                <Ionicons name="id-card-outline" size={14} color="#2563eb" />
                <Text style={[styles.chipText, { color: "#2563eb" }]}>ID: {user.studentId}</Text>
              </View>
            )}
          </View>


        </View>

        {/* Info Section */}
        <View style={[styles.infoRow, { marginTop: 14 }]}>
          <Text style={styles.label}>Student ID</Text>
          <Text style={styles.value}>{user?.studentId || "—"}</Text>
        </View>

        <View style={styles.infoRow}>
          <Text style={styles.label}>Course</Text>
          <Text style={styles.value}>{user?.course || "—"}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.label}>Section</Text>
          <Text style={styles.value}>{user?.section || "—"}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.label}>Year Level</Text>
          <Text style={styles.value}>{formatYearLabel(user?.yearLevel) || "—"}</Text>
        </View>

        <View style={styles.infoRow}>
          <Text style={styles.label}>Email</Text>
          <Text style={styles.value}>{user?.email || "—"}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.label}>Contact</Text>
          <Text style={styles.value}>{user?.contactNumber || "—"}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.label}>Gender</Text>
          <Text style={styles.value}>{user?.gender || "—"}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.label}>Age</Text>
          <Text style={styles.value}>{user?.age || "—"}</Text>
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
            {user?.address || "—"}
          </Text>
        </View>

        {/* Linked Parent Section */}
        <View style={styles.infoRow}>
          <Text style={styles.label}>Linked Parent</Text>
          {linkedParents.length > 0 ? (
            <View style={styles.linkedStudentsContainer}>
              {linkedParents.map((parent, index) => (
                <View key={parent.id || index} style={styles.linkedStudentItem}>
                  <Ionicons name="person-outline" size={14} color="#004f89" />
                  <Text style={styles.linkedStudentText}>{parent.parentName || 'Unknown Parent'}</Text>
                  {parent.relationship && (
                    <Text style={styles.relationshipText}>({parent.relationship})</Text>
                  )}
                </View>
              ))}
            </View>
          ) : (
            <Text style={styles.value}>N/A</Text>
          )}
        </View>

        <View style={{ height: 12 }} />
      </ScrollView>


      {/* Modal */}
      <Modal
        transparent={true}
        visible={modalVisible}
        animationType="slide"
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>
              {activeType === "profile"
                ? "Change Profile Picture"
                : "Change Cover Photo"}
            </Text>
            <Pressable style={[styles.modalButton, { backgroundColor: "#004f89" }]} onPress={pickImage}>
              <Text style={styles.modalButtonText}>Choose from Gallery</Text>
            </Pressable>
            {((activeType === 'profile' && profilePic !== defaultProfile) || (activeType === 'cover' && coverPhoto)) && (
              <Pressable
                style={[styles.modalButton, { backgroundColor: "#8B0000" }]}
                onPress={removeCurrentImage}
              >
                <Text style={styles.modalButtonText}>
                  Remove {activeType === 'profile' ? 'Profile' : 'Cover'} Photo
                </Text>
              </Pressable>
            )}
            <Pressable
              style={[styles.modalButton, { backgroundColor: "#ffffff", borderWidth: 1, borderColor: "#D1D5DB" }]}
              onPress={() => setModalVisible(false)}
            >
              <Text style={[styles.modalButtonText, { color: "#374151" }]}>Cancel</Text>
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
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F9FAFB" },
  coverContainer: { width: "100%", height: 160, position: "relative", borderBottomLeftRadius: 12, borderBottomRightRadius: 12, overflow: 'hidden' },
  coverPhoto: {
    width: "100%",
    height: "100%",
  },
  coverFallback: {
    width: "100%",
    height: "100%",
    backgroundColor: "#E5E7EB",
  },
  coverOverlay: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.15)",
  },
  coverChangeBadge: {
    position: 'absolute',
    right: 12,
    bottom: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#2563eb',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 6,
    zIndex: 30,
    borderWidth: 2,
    borderColor: '#fff',
  },
  coverChangeText: { color: '#fff', fontWeight: '700' },
  sideActions: {
    position: "absolute",
    right: 12,
    top: 140,
    alignItems: 'center',
    gap: 8,
  },
  sideBtn: {
    backgroundColor: '#2563eb',
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  
  profilePicContainer: {
    alignSelf: "center",
    marginTop: -40,
    borderWidth: 6,
    borderColor: "#004f89",
    borderRadius: 50,
    overflow: "visible",
    width: 100,
    height: 100,
    backgroundColor: "#fff",
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
    position: 'relative',
    zIndex: 20,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 6,
  },
  profilePic: { width: 76, height: 76, borderRadius: 38, alignSelf: "center" },
  changePhotoBadge: {
    position: 'absolute',
    right: 2,
    bottom: 2,
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: '#2563eb',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#fff',
    zIndex: 50,
    elevation: 10,
  },
  
  nameSection: { marginTop: 10, alignItems: "center", paddingHorizontal: 20 },
  fullName: { fontSize: 22, fontWeight: "800", color: "#111827", textAlign: "center" },
  chipsRow: { flexDirection: "row", gap: 8, marginTop: 8, flexWrap: "wrap", justifyContent: "center" },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  chipText: { color: "#111827", fontWeight: "700", fontSize: 12 },

  infoRow: {
    flexDirection: "column",
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0, 79, 137, 0.15)",
  },
  label: { 
    fontWeight: "700", 
    color: "#374151", 
    fontSize: 12,
    marginBottom: 3,
    letterSpacing: 0.2,
  },
  value: { 
    color: "#6B7280", 
    fontWeight: "500", 
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
    color: "#6B7280",
    fontWeight: "500",
    fontSize: 13,
  },
  relationshipText: {
    color: "#9CA3AF",
    fontSize: 11,
    fontStyle: 'italic',
  },
  
  modalOverlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.5)" },
  modalContent: {
    backgroundColor: "#fff",
    padding: 20,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  modalTitle: { fontSize: 18, fontWeight: "700", marginBottom: 15, textAlign: "center" },
  modalButton: {
    backgroundColor: "#2563eb",
    paddingVertical: 12,
    borderRadius: 8,
    marginTop: 10,
  },
  modalButtonText: { textAlign: "center", color: "#fff", fontSize: 16, fontWeight: "700" },
});

export default Profile;
