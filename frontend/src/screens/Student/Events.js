import React, { useContext, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
  Modal,
} from 'react-native';
import { useNavigation, useIsFocused, useFocusEffect } from '@react-navigation/native';
import { AuthContext } from '../../contexts/AuthContext';
import { Ionicons } from '@expo/vector-icons';
import { collection, query, getDocs, orderBy } from 'firebase/firestore';
import { db } from '../../utils/firebaseConfig';
import { withNetworkErrorHandling, getNetworkErrorMessage } from '../../utils/networkErrorHandler';

const Events = () => {
  const { user, logout } = useContext(AuthContext);
  const navigation = useNavigation();
  const isFocused = useIsFocused();

  const [logoutVisible, setLogoutVisible] = useState(false);
  const [announcements, setAnnouncements] = useState([]);
  const [announcementsLoading, setAnnouncementsLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState('all');
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

  // Card visual palette (matches admin dashboard card styling)
  const adminCardPalette = {
    cardBg: '#FFFFFF',
    borderColor: '#E5E7EB',
    iconBg: 'rgba(0,79,137,0.12)',
    accentColor: '#004f89',
    badgeBg: '#004f89',
    badgeTextColor: '#FFFFFF',
    textColor: '#004f89',
    labelColor: '#004f89',
  };

  // Categories for filtering
  const categories = [
    { id: 'all', name: 'All', icon: 'apps-outline' },
    { id: 'general', name: 'General', icon: 'information-circle-outline' },
    { id: 'academic', name: 'Academic', icon: 'school-outline' },
    { id: 'sports', name: 'Sports', icon: 'football-outline' },
    { id: 'events', name: 'Events', icon: 'calendar-outline' },
    { id: 'emergency', name: 'Emergency', icon: 'warning-outline' },
  ];


  // Load announcements from Firebase
  const loadAnnouncements = async () => {
    setAnnouncementsLoading(true);
    try {
      const announcementsRef = collection(db, 'announcements');
      const announcementsQuery = query(announcementsRef, orderBy('createdAt', 'desc'));
      const announcementsSnap = await getDocs(announcementsQuery);
      
      const announcementsData = [];
      announcementsSnap.forEach((doc) => {
        const data = doc.data();
        announcementsData.push({
          id: doc.id,
          title: data.title || 'Announcement',
          message: data.message || '',
          category: data.category || 'general',
          createdAt: data.createdAt || new Date().toISOString(),
          priority: data.priority || 'normal',
          author: data.author || 'Admin',
          pinned: data.pinned || false,
          ...data
        });
      });
      
      // Sort announcements: pinned first, then by creation date
      announcementsData.sort((a, b) => {
        if (a.pinned && !b.pinned) return -1;
        if (!a.pinned && b.pinned) return 1;
        return new Date(b.createdAt) - new Date(a.createdAt);
      });
      
      setAnnouncements(announcementsData);
    } catch (error) {
      console.error('Error loading announcements:', error);
      // Only show network error modal for actual network errors
      if (error?.code?.includes('unavailable') || error?.code?.includes('network') || error?.message?.toLowerCase().includes('network')) {
        const errorInfo = getNetworkErrorMessage({ type: 'unstable_connection', message: error.message });
        setNetworkErrorTitle(errorInfo.title);
        setNetworkErrorMessage(errorInfo.message);
        setNetworkErrorColor(errorInfo.color);
        setNetworkErrorVisible(true);
        setTimeout(() => setNetworkErrorVisible(false), 5000);
      }
      setAnnouncements([]);
    } finally {
      setAnnouncementsLoading(false);
    }
  };

  useEffect(() => {
    if (isFocused) loadAnnouncements();
  }, [isFocused]);

  // Modern modal logout
  const handleLogout = () => {
    setLogoutVisible(true);
  };

  const confirmLogout = async () => {
    setLogoutVisible(false);
    try {
      await logout();
    } catch (e) {
      console.log('Logout error:', e);
    }
  };

  const cancelLogout = () => {
    setLogoutVisible(false);
  };


  // Filter announcements based on selected category
  const filteredAnnouncements = announcements.filter(announcement => {
    if (selectedCategory === 'all') return true;
    return announcement.category === selectedCategory;
  });

  // Get category icon and color
  const getCategoryInfo = (category) => {
    const categoryData = categories.find(cat => cat.id === category);
    if (!categoryData) return { icon: 'information-circle-outline', color: '#2563EB', bgColor: '#EFF6FF' };
    
    const colors = {
      general: { color: '#2563EB', bgColor: '#EFF6FF' },
      academic: { color: '#16A34A', bgColor: '#F0FDF4' },
      sports: { color: '#D97706', bgColor: '#FEF3C7' },
      events: { color: '#DC2626', bgColor: '#FEE2E2' },
      emergency: { color: '#7C3AED', bgColor: '#F3E8FF' },
    };
    
    const colorInfo = colors[category] || colors.general;
    return {
      icon: categoryData.icon,
      color: colorInfo.color,
      bgColor: colorInfo.bgColor
    };
  };

  // Format date
  const formatDate = (dateString) => {
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return 'Unknown date';
    }
  };

  return (<>
    <View style={styles.wrapper}>
      {/* Content */}
      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Category Selection - 3x2 Grid */}
        <View style={styles.section}>
          <View style={styles.categoryGrid}>
            {categories.map((category) => {
              const isSelected = selectedCategory === category.id;
              
              return (
                <TouchableOpacity
                  key={category.id}
                  style={[
                    styles.categoryCard,
                    {
                      backgroundColor: isSelected ? '#EFF6FF' : adminCardPalette.cardBg,
                      borderColor: isSelected ? '#004f89' : adminCardPalette.borderColor,
                    }
                  ]}
                  onPress={() => setSelectedCategory(category.id)}
                >
                  <View style={styles.categoryCardContent}>
                    <View style={[
                      styles.categoryCardIconWrap,
                      { backgroundColor: adminCardPalette.iconBg }
                    ]}>
                      <Ionicons 
                        name={category.icon} 
                        size={20} 
                        color={adminCardPalette.accentColor} 
                      />
                    </View>
                    <Text style={[
                      styles.categoryCardLabel,
                      { color: adminCardPalette.labelColor }
                    ]}>
                      {category.name}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Announcements List */}
        <View style={styles.announcementsSection}>
          <Text style={[styles.sectionTitle, { marginTop: 0 }]}>Announcements</Text>
          {announcementsLoading ? (
              <View style={{ flex: 1, backgroundColor: '#FFFFFF', minHeight: 200 }} />
            ) : filteredAnnouncements.length === 0 ? (
              <View style={styles.centerContainer}>
                <View style={styles.emptyCard}>
                  <View style={styles.emptyIconWrap}>
                    <Ionicons name="megaphone-outline" size={28} color="#2563EB" />
                    <View style={styles.emptyIconSlash} />
                  </View>
                  <Text style={styles.emptyTitle}>No Announcements</Text>
                  <Text style={styles.emptySubtext}>
                    {selectedCategory === 'all' 
                      ? 'No announcements have been posted yet.' 
                      : `No ${categories.find(cat => cat.id === selectedCategory)?.name.toLowerCase()} announcements found.`
                    }
                  </Text>
                </View>
              </View>
            ) : (
              filteredAnnouncements.map((announcement) => {
                const categoryInfo = getCategoryInfo(announcement.category);
                
                return (
                  <View
                    key={announcement.id}
                    style={styles.announcementCard}
                  >
                    <View style={styles.announcementHeader}>
                      <View style={styles.announcementTitleRow}>
                        <View style={[styles.categoryBadge, { backgroundColor: 'rgba(0,79,137,0.12)' }]}>
                          <Ionicons name={categoryInfo.icon} size={14} color="#004f89" />
                          <Text style={[styles.categoryBadgeText, { color: '#004f89' }]}>
                            {categories.find(cat => cat.id === announcement.category)?.name || 'General'}
                          </Text>
                        </View>
                        <View style={styles.badgeContainer}>
                          {announcement.priority === 'high' && (
                            <View style={styles.priorityBadge}>
                              <Ionicons name="warning" size={12} color="#DC2626" />
                              <Text style={styles.priorityText}>High Priority</Text>
                            </View>
                          )}
                        </View>
                      </View>
                    </View>
                    
                    <View style={styles.announcementContent}>
                      <Text selectable style={styles.announcementTitle}>Title: {announcement.title}</Text>
                      <Text selectable style={styles.announcementMessage}>
                        {announcement.message}
                      </Text>
                    </View>
                    
                    <View style={styles.announcementFooter}>
                      <Text style={styles.announcementDate}>{formatDate(announcement.createdAt)}</Text>
                    </View>
                  </View>
                );
              })
            )}
        </View>
      </ScrollView>
    </View>

    {/* Logout Modal */}
    <Modal
      transparent
      animationType="fade"
      visible={logoutVisible}
      onRequestClose={() => setLogoutVisible(false)}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalCard}>
          <View style={[styles.modalIconWrap, { backgroundColor: '#FEE2E2' }]}>
            <Ionicons name="log-out-outline" size={28} color="#b91c1c" />
          </View>
          <Text style={styles.modalTitle}>Logout</Text>
          <Text style={styles.modalText}>Are you sure you want to logout?</Text>
          <View style={styles.modalActions}>
            <TouchableOpacity style={styles.modalButton} onPress={cancelLogout}>
              <Text style={styles.modalButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.modalButton, styles.modalButtonDanger]} onPress={confirmLogout}>
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
  </>);
};


const styles = StyleSheet.create({
  wrapper: { flex: 1, backgroundColor: '#F9FAFB' },
  scrollView: { flex: 1 },
  scrollContent: { 
    padding: 16, 
    paddingBottom: 120, 
    paddingTop: 16, 
  },
  
  // Section (matches dashboard)
  section: { marginBottom: 4 },
  sectionTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#0078cf',
    marginRight: 8,
    marginBottom: 5,
    marginTop: 10,
  },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginTop: 0,
    marginBottom: 0,
  },
  categoryCard: {
    width: '31.5%',
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    marginTop: 0,
    marginBottom: 6,
    minHeight: 80,
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 4,
    elevation: 2,
  },
  categoryCardContent: {
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  categoryCardIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  categoryCardLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#004f89',
    textAlign: 'center',
  },
  
  // Announcements Section
  announcementsSection: {
    paddingTop: 0,
    flex: 1,
    minHeight: 400,
  },
  
  // Announcement Cards
  announcementCard: {
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 2,
  },
  announcementHeader: {
    marginBottom: 8,
  },
  announcementTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  categoryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    gap: 4,
  },
  categoryBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  priorityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    gap: 4,
  },
  priorityText: {
    fontSize: 10,
    color: '#DC2626',
    fontWeight: '600',
  },
  announcementTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  announcementContent: {
    marginBottom: 8,
  },
  announcementMessage: {
    fontSize: 14,
    color: '#374151',
    lineHeight: 20,
  },
  announcementFooter: {
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    paddingTop: 8,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  announcementDate: {
    fontSize: 12,
    color: '#6B7280',
  },
  
  // Empty State (mirrored from Admin Alerts)
  centerContainer: { 
    flex: 1, 
    alignItems: 'center', 
    justifyContent: 'center', 
    marginTop: 0,
    minHeight: 300,
  },
  emptyCard: { 
    backgroundColor: '#fff', 
    borderRadius: 8, 
    padding: 16, 
    alignItems: 'center', 
    borderWidth: 1, 
    borderColor: '#E5E7EB', 
    shadowColor: '#0F172A', 
    shadowOpacity: 0.08, 
    shadowOffset: { width: 0, height: 6 }, 
    shadowRadius: 12, 
    elevation: 4, 
    width: '100%' 
  },
  emptyIconWrap: { 
    width: 40, 
    height: 40, 
    borderRadius: 8, 
    backgroundColor: '#EFF6FF', 
    alignItems: 'center', 
    justifyContent: 'center', 
    marginBottom: 8,
    position: 'relative',
  },
  emptyIconSlash: {
    position: 'absolute',
    width: 2,
    height: 32,
    backgroundColor: '#2563EB',
    transform: [{ rotate: '-45deg' }],
    borderRadius: 1,
  },
  emptyTitle: { 
    fontSize: 16, 
    fontWeight: '700', 
    color: '#111827', 
    marginTop: 0, 
    marginBottom: 4 
  },
  emptySubtext: {
    fontSize: 12,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 16,
    marginBottom: 12,
  },
  
  // Badge styles
  badgeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 40 },
   loadingText: { marginTop: 12, color: '#6B7280', fontSize: 16 },
  
  // Modal styles
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
  // Facebook-style modal styles (matching alerts.js)
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
    marginBottom: 12,
    textAlign: 'left',
  },
  fbModalMessage: {
    fontSize: 15,
    color: '#65676B',
    textAlign: 'left',
    lineHeight: 20,
  },
});

export default Events;

