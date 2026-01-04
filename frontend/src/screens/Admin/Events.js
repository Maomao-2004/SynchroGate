import React, { useContext, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Animated,
  Dimensions,
  Image,
  Modal,
  StatusBar,
  Platform,
  TextInput,
  Alert,
  Pressable,
} from 'react-native';
import { useNavigation, useIsFocused, useFocusEffect, CommonActions } from '@react-navigation/native';
import { AuthContext } from '../../contexts/AuthContext';
import sidebarEventEmitter from '../../utils/sidebarEventEmitter';
import useNetworkMonitor from '../../hooks/useNetworkMonitor';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, onSnapshot, getDoc, setDoc, collection, query, where, getDocs, orderBy, addDoc, deleteDoc, updateDoc } from 'firebase/firestore';
import { db } from '../../utils/firebaseConfig';
import { withNetworkErrorHandling, getNetworkErrorMessage } from '../../utils/networkErrorHandler';
import { wp, hp, fontSizes, responsiveStyles, getResponsiveDimensions } from '../../utils/responsive';

const { width, height } = Dimensions.get('window');
const statusBarHeight = StatusBar.currentHeight || 0;
const dimensions = getResponsiveDimensions();

const Events = () => {
  const { user, logout } = useContext(AuthContext);
  const isConnected = useNetworkMonitor();
  const navigation = useNavigation();
  const isFocused = useIsFocused();

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [logoutVisible, setLogoutVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [announcements, setAnnouncements] = useState([]);
  const [announcementsLoading, setAnnouncementsLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [expandedAnnouncements, setExpandedAnnouncements] = useState([]);
  
  // Create announcement states
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [newAnnouncement, setNewAnnouncement] = useState({
    title: '',
    message: '',
    category: 'general',
    author: user?.firstName || 'Admin'
  });
  const [creating, setCreating] = useState(false);
  
  // Feedback modal states
  const [feedbackVisible, setFeedbackVisible] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState('');
  const [feedbackSuccess, setFeedbackSuccess] = useState(true);
  const [networkErrorVisible, setNetworkErrorVisible] = useState(false);
  const [networkErrorTitle, setNetworkErrorTitle] = useState('');
  const [networkErrorMessage, setNetworkErrorMessage] = useState('');
  const [networkErrorColor, setNetworkErrorColor] = useState('#DC2626');
  
  // Delete confirmation modal states
  const [deleteConfirmVisible, setDeleteConfirmVisible] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [announcementToDelete, setAnnouncementToDelete] = useState(null);
  
  // Create confirmation modal states
  const [createConfirmVisible, setCreateConfirmVisible] = useState(false);

  // Sidebar animation - responsive
  const sidebarAnimRight = useState(new Animated.Value(-SIDEBAR_WIDTH))[0];

  // Tab bar visibility is handled by navigation structure

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

  // Remove profile loading logic that causes infinite loading
  useEffect(() => {
    if (isFocused) {
      setLoading(false); // Set loading to false immediately
    }
  }, [isFocused]);

  // Update author when user changes
  useEffect(() => {
    if (user?.firstName) {
      setNewAnnouncement(prev => ({ ...prev, author: user.firstName }));
    }
  }, [user?.firstName]);

  // Load announcements from Firebase
  const loadAnnouncements = async () => {
    setAnnouncementsLoading(true);
    try {
      const announcementsRef = collection(db, 'announcements');
      const announcementsQuery = query(announcementsRef, orderBy('createdAt', 'desc'));
      const announcementsSnap = await getDocs(announcementsQuery);
      
      const announcementsData = [];
      announcementsSnap.docs.forEach((doc) => {
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

  // Toggle Sidebar
  const toggleSidebar = (open) => {
    setSidebarOpen(open);
    Animated.timing(sidebarAnimRight, {
      toValue: open ? 0 : -SIDEBAR_WIDTH,
      duration: 300,
      useNativeDriver: false,
    }).start();
  };

  useEffect(() => {
    const handleToggleSidebar = () => toggleSidebar(!sidebarOpen);
    sidebarEventEmitter.on('toggleSidebar', handleToggleSidebar);
    return () => sidebarEventEmitter.off('toggleSidebar', handleToggleSidebar);
  }, [sidebarOpen]);

  // Determine active sidebar item based on current route
  const getActiveSidebarItem = (routeName) => {
    const state = navigation.getState();
    const currentRoute = state.routes[state.index]?.name;
    const currentScreen = state.routes[state.index]?.state?.routes?.[state.routes[state.index]?.state?.index]?.name;
    
    // Check both tab route and screen route
    if (currentRoute === routeName || currentScreen === routeName) {
      return true;
    }
    
    // Special cases for nested navigation
    if (routeName === 'Home' && (currentScreen === 'AdminDashboard' || currentRoute === 'Home')) {
      return true;
    }
    
    return false;
  };

  const confirmLogout = async () => {
    setLogoutVisible(false);
    toggleSidebar(false);
    try {
      await logout();
    } catch (e) {
      console.log('Logout error:', e);
    }
  };

  const cancelLogout = () => {
    setLogoutVisible(false);
  };

  // Create announcement functions
  const openCreateModal = () => {
    setCreateModalVisible(true);
    setNewAnnouncement({
      title: '',
      message: '',
      category: 'general',
      author: user?.firstName || 'Admin'
    });
  };

  const closeCreateModal = () => {
    setCreateModalVisible(false);
    setNewAnnouncement({
      title: '',
      message: '',
      category: 'general',
      author: user?.firstName || 'Admin'
    });
  };

  const handleCreatePress = () => {
    if (!newAnnouncement.title.trim() || !newAnnouncement.message.trim()) {
      setFeedbackMessage('Please fill in both title and message');
      setFeedbackSuccess(false);
      setFeedbackVisible(true);
      setTimeout(() => setFeedbackVisible(false), 3000);
      return;
    }
    setCreateConfirmVisible(true);
  };

  const createAnnouncement = async () => {
    if (!newAnnouncement.title.trim() || !newAnnouncement.message.trim()) {
      setFeedbackMessage('Please fill in both title and message');
      setFeedbackSuccess(false);
      setFeedbackVisible(true);
      setCreateConfirmVisible(false);
      setTimeout(() => setFeedbackVisible(false), 3000);
      return;
    }

    setCreating(true);
    try {
      const announcementData = {
        title: newAnnouncement.title.trim(),
        message: newAnnouncement.message.trim(),
        category: newAnnouncement.category,
        priority: 'normal', // Default priority
        author: newAnnouncement.author,
        createdAt: new Date().toISOString(),
        createdBy: user?.uid || user?.adminId || 'admin'
      };

      await addDoc(collection(db, 'announcements'), announcementData);
      
      setFeedbackMessage('Announcement created successfully!');
      setFeedbackSuccess(true);
      setFeedbackVisible(true);
      setCreateConfirmVisible(false);
      closeCreateModal();
      loadAnnouncements();
      setTimeout(() => setFeedbackVisible(false), 3000);
    } catch (error) {
      console.error('Error creating announcement:', error);
      // Only show network error modal for actual network errors
      if (error?.code?.includes('unavailable') || error?.code?.includes('network') || error?.message?.toLowerCase().includes('network')) {
        const errorInfo = getNetworkErrorMessage({ type: 'unstable_connection', message: error.message });
        setNetworkErrorTitle(errorInfo.title);
        setNetworkErrorMessage(errorInfo.message);
        setNetworkErrorColor(errorInfo.color);
        setNetworkErrorVisible(true);
        setTimeout(() => setNetworkErrorVisible(false), 5000);
      } else {
        setFeedbackMessage('Failed to create announcement. Please try again.');
        setFeedbackSuccess(false);
        setFeedbackVisible(true);
        setCreateConfirmVisible(false);
        closeCreateModal();
        loadAnnouncements();
        setTimeout(() => setFeedbackVisible(false), 3000);
      }
    } finally {
      setCreating(false);
    }
  };

  // Delete announcement function
  const deleteAnnouncement = async () => {
    if (!announcementToDelete || isDeleting) return;
    
    setIsDeleting(true);
    try {
      await deleteDoc(doc(db, 'announcements', announcementToDelete.id));
      
      setFeedbackMessage('Announcement deleted successfully');
      setFeedbackSuccess(true);
      setFeedbackVisible(true);
      setDeleteConfirmVisible(false);
      setAnnouncementToDelete(null);
      loadAnnouncements();
      setTimeout(() => setFeedbackVisible(false), 3000);
    } catch (error) {
      console.error('Error deleting announcement:', error);
      // Only show network error modal for actual network errors
      if (error?.code?.includes('unavailable') || error?.code?.includes('network') || error?.message?.toLowerCase().includes('network')) {
        const errorInfo = getNetworkErrorMessage({ type: 'unstable_connection', message: error.message });
        setNetworkErrorTitle(errorInfo.title);
        setNetworkErrorMessage(errorInfo.message);
        setNetworkErrorColor(errorInfo.color);
        setNetworkErrorVisible(true);
        setTimeout(() => setNetworkErrorVisible(false), 5000);
      } else {
        setFeedbackMessage('Failed to delete announcement');
        setFeedbackSuccess(false);
        setFeedbackVisible(true);
        setDeleteConfirmVisible(false);
        setAnnouncementToDelete(null);
        setTimeout(() => setFeedbackVisible(false), 3000);
      }
    } finally {
      setIsDeleting(false);
    }
  };

  // Handle delete button press
  const handleDeletePress = (announcement) => {
    setAnnouncementToDelete(announcement);
    setDeleteConfirmVisible(true);
  };

  // Handle pin button press
  const handlePinPress = async (announcement) => {
    try {
      const newPinnedState = !announcement.pinned;
      
      // Update Firebase document
      await updateDoc(doc(db, 'announcements', announcement.id), {
        pinned: newPinnedState
      });
      
      // Refresh announcements to show new order
      loadAnnouncements();
    } catch (error) {
      console.log('Error updating pin status:', error);
    }
  };

  // Toggle announcement expansion
  const toggleAnnouncement = (id) => {
    setExpandedAnnouncements(prev => 
      prev.includes(id) 
        ? prev.filter(item => item !== id)
        : [...prev, id]
    );
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

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: '#FFFFFF' }} />
    );
  }

  return (<>
    <View style={styles.wrapper}>
      {/* Sidebar shown above everything using Modal to avoid tab overlap */}
      <Modal transparent visible={sidebarOpen} animationType="fade" onRequestClose={() => toggleSidebar(false)}>
        <TouchableOpacity
          style={styles.overlay}
          activeOpacity={1}
          onPress={() => toggleSidebar(false)}
        />
        <Animated.View style={[styles.sidebar, { right: sidebarAnimRight }]}>
          <Text style={styles.sidebarTitle}>Menu</Text>
          
          <TouchableOpacity
            style={[styles.sidebarItem, getActiveSidebarItem('AdminDashboard') && styles.activeSidebarItem]}
            onPress={() => {
              toggleSidebar(false);
              try {
                // Reset the HomeStack to only contain AdminDashboard
                navigation.reset({
                  index: 0,
                  routes: [{ name: 'AdminDashboard' }],
                });
              } catch {
                // Fallback: try parent navigation
                const parentNav = navigation.getParent?.();
                if (parentNav) {
                  parentNav.navigate('Home', { screen: 'AdminDashboard' });
                } else {
                  navigation.navigate('AdminDashboard');
                }
              }
            }}
          >
            <Ionicons name="home-outline" size={20} color={getActiveSidebarItem('AdminDashboard') ? "#2563EB" : "#111827"} />
            <Text style={[styles.sidebarText, getActiveSidebarItem('AdminDashboard') && styles.activeSidebarText]}>Dashboard</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.sidebarItem, getActiveSidebarItem('Events') && styles.activeSidebarItem]}
            onPress={() => {
              toggleSidebar(false);
              try {
                const parentNav = navigation.getParent?.();
                if (parentNav) {
                  parentNav.navigate('Home', { screen: 'Events' });
                } else {
                  navigation.navigate('Events');
                }
              } catch {
                console.log('Events navigation failed');
              }
            }}
          >
            <Ionicons name="calendar-outline" size={20} color={getActiveSidebarItem('Events') ? "#2563EB" : "#111827"} />
            <Text style={[styles.sidebarText, getActiveSidebarItem('Events') && styles.activeSidebarText]}>Events</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.sidebarItem, getActiveSidebarItem('StudentsTab') && styles.activeSidebarItem]}
            onPress={() => {
              toggleSidebar(false);
              try {
                const parentNav = navigation.getParent?.();
                if (parentNav) {
                  parentNav.navigate('StudentsTab');
                } else {
                  navigation.navigate('StudentsTab');
                }
              } catch {
                navigation.navigate('StudentsTab');
              }
            }}
          >
            <Ionicons name="school-outline" size={20} color={getActiveSidebarItem('StudentsTab') ? "#2563EB" : "#111827"} />
            <Text style={[styles.sidebarText, getActiveSidebarItem('StudentsTab') && styles.activeSidebarText]}>Manage Student</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.sidebarItem, getActiveSidebarItem('ParentsTab') && styles.activeSidebarItem]}
            onPress={() => {
              toggleSidebar(false);
              try {
                const parentNav = navigation.getParent?.();
                if (parentNav) {
                  parentNav.navigate('ParentsTab');
                } else {
                  navigation.navigate('ParentsTab');
                }
              } catch {
                navigation.navigate('ParentsTab');
              }
            }}
          >
            <Ionicons name="people-outline" size={20} color={getActiveSidebarItem('ParentsTab') ? "#2563EB" : "#111827"} />
            <Text style={[styles.sidebarText, getActiveSidebarItem('ParentsTab') && styles.activeSidebarText]}>Manage Parent</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.sidebarItem, getActiveSidebarItem('ActivityLogsTab') && styles.activeSidebarItem]}
            onPress={() => {
              toggleSidebar(false);
              try {
                const parentNav = navigation.getParent?.();
                if (parentNav) {
                  parentNav.navigate('ActivityLogsTab');
                } else {
                  navigation.navigate('ActivityLogsTab');
                }
              } catch {
                navigation.navigate('ActivityLogsTab');
              }
            }}
          >
            <Ionicons name="list-outline" size={20} color={getActiveSidebarItem('ActivityLogsTab') ? "#2563EB" : "#111827"} />
            <Text style={[styles.sidebarText, getActiveSidebarItem('ActivityLogsTab') && styles.activeSidebarText]}>Activity Logs</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.sidebarItem, getActiveSidebarItem('AlertsTab') && styles.activeSidebarItem]}
            onPress={() => {
              toggleSidebar(false);
              try {
                const parentNav = navigation.getParent?.();
                if (parentNav) {
                  parentNav.navigate('AlertsTab');
                } else {
                  navigation.navigate('AlertsTab');
                }
              } catch {
                navigation.navigate('AlertsTab');
              }
            }}
          >
            <Ionicons name="notifications-outline" size={20} color={getActiveSidebarItem('AlertsTab') ? "#2563EB" : "#111827"} />
            <Text style={[styles.sidebarText, getActiveSidebarItem('AlertsTab') && styles.activeSidebarText]}>Alerts</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.sidebarItem, getActiveSidebarItem('About') && styles.activeSidebarItem]}
            onPress={() => {
              toggleSidebar(false);
              try {
                const parentNav = navigation.getParent?.();
                if (parentNav) {
                  parentNav.navigate('Home', { screen: 'About' });
                } else {
                  navigation.navigate('About');
                }
              } catch {
                navigation.navigate('About');
              }
            }}
          >
            <Ionicons name="information-circle-outline" size={20} color={getActiveSidebarItem('About') ? "#2563EB" : "#111827"} />
            <Text style={[styles.sidebarText, getActiveSidebarItem('About') && styles.activeSidebarText]}>About</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.sidebarItem, styles.logoutItem]}
            onPress={() => {
              toggleSidebar(false);
              setLogoutVisible(true);
            }}
          >
            <Ionicons name="log-out-outline" size={20} color="#b91c1c" />
            <Text style={[styles.sidebarText, { color: '#b91c1c' }]}>Logout</Text>
          </TouchableOpacity>
        </Animated.View>
      </Modal>
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
                          <TouchableOpacity 
                            style={[styles.actionBadge, announcement.pinned && styles.pinnedBadge]}
                            onPress={() => handlePinPress(announcement)}
                          >
                            <Ionicons 
                              name={announcement.pinned ? "pin" : "pin-outline"} 
                              size={16} 
                              color={announcement.pinned ? "#FFFFFF" : "#004f89"} 
                            />
                          </TouchableOpacity>
                          <TouchableOpacity 
                            style={styles.actionBadge}
                            onPress={() => handleDeletePress(announcement)}
                          >
                            <Ionicons name="trash-outline" size={16} color="#004f89" />
                          </TouchableOpacity>
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

    {/* Create Announcement Modal */}
    <Modal
      transparent
      animationType="fade"
      visible={createModalVisible}
      onRequestClose={closeCreateModal}
    >
      <View style={styles.modernModalOverlay}>
        <View style={[styles.modernModalCard, { maxHeight: height * 0.85, minHeight: height * 0.6 }]}>
          <View style={styles.modernModalHeader}>
            <View style={[styles.modernHeaderGradient, { backgroundColor: '#004f89' }]}>
              <View style={styles.modernHeaderContent}>
                <View style={styles.modernAvatar}>
                  <View style={styles.avatarOctagonMedium} />
                  <Ionicons 
                    name="add-circle-outline" 
                    size={24} 
                    color="#FFFFFF" 
                  />
                </View>
                <View style={styles.modernHeaderInfo}>
                  <Text style={styles.modernName}>
                    Create Announcement
                  </Text>
                  <Text style={styles.modernId}>
                    Create a new announcement
                  </Text>
                </View>
              </View>
              <TouchableOpacity 
                onPress={closeCreateModal} 
                style={styles.modernCloseBtn}
                disabled={creating}
              >
                <Ionicons name="close" size={20} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
          </View>
          
          <ScrollView 
            showsVerticalScrollIndicator={false}
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingBottom: 16 }}
          >
            <View style={styles.modernInfoGrid}>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Title</Text>
                <TextInput
                  style={styles.textInput}
                  value={newAnnouncement.title}
                  onChangeText={(text) => setNewAnnouncement(prev => ({ ...prev, title: text }))}
                  placeholder="Enter announcement title"
                  placeholderTextColor="#9CA3AF"
                  maxLength={50}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Message</Text>
                <TextInput
                  style={[styles.textInput, styles.messageInput]}
                  value={newAnnouncement.message}
                  onChangeText={(text) => setNewAnnouncement(prev => ({ ...prev, message: text }))}
                  placeholder="Enter announcement message"
                  placeholderTextColor="#9CA3AF"
                  multiline
                  numberOfLines={4}
                  textAlignVertical="top"
                  maxLength={1000}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Category</Text>
                <View style={styles.categorySelector}>
                  {categories.filter(cat => cat.id !== 'all').map((category) => (
                    <TouchableOpacity
                      key={category.id}
                      style={[
                        styles.categoryOption,
                        newAnnouncement.category === category.id && styles.categoryOptionSelected
                      ]}
                      onPress={() => setNewAnnouncement(prev => ({ ...prev, category: category.id }))}
                    >
                      <Ionicons 
                        name={category.icon} 
                        size={16} 
                        color={newAnnouncement.category === category.id ? '#004f89' : '#6B7280'} 
                      />
                      <Text style={[
                        styles.categoryOptionText,
                        newAnnouncement.category === category.id && styles.categoryOptionTextSelected
                      ]}>
                        {category.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </View>
          </ScrollView>

          <View style={styles.modernActions}>
            <TouchableOpacity 
              style={styles.modernCloseButton} 
              onPress={closeCreateModal}
              disabled={creating}
            >
              <Text style={styles.modernCloseButtonText}>
                Cancel
              </Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.modernSaveButton, creating && styles.modernSaveButtonDisabled]} 
              onPress={handleCreatePress}
              disabled={creating}
            >
              <Text style={styles.modernSaveButtonText}>
                Create
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>

    {/* Create Confirmation Modal */}
    <Modal transparent animationType="fade" visible={createConfirmVisible} onRequestClose={() => setCreateConfirmVisible(false)}>
      <View style={styles.modalOverlayCenter}>
        <View style={styles.fbModalCard}>
          <View style={styles.fbModalContent}>
            <Text style={styles.fbModalTitle}>Create announcement?</Text>
            <Text style={styles.fbModalMessage}>
              Are you sure you want to create this announcement? It will be visible to all users.
            </Text>
          </View>
          <View style={styles.fbModalButtonContainer}>
            <TouchableOpacity 
              style={[styles.fbModalCancelButton, creating && styles.fbModalButtonDisabled]} 
              onPress={() => setCreateConfirmVisible(false)}
              disabled={creating}
            >
              <Text style={styles.fbModalCancelText}>Close</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[
                styles.fbModalConfirmButton, 
                { backgroundColor: '#004f89' },
                creating && styles.fbModalButtonDisabled
              ]} 
              onPress={createAnnouncement}
              disabled={creating}
            >
              <Text style={styles.fbModalConfirmText}>
                {creating ? 'Creating...' : 'Confirm'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>

    {/* Delete Confirmation Modal (mirrored from Admin Alerts) */}
    <Modal transparent animationType="fade" visible={deleteConfirmVisible} onRequestClose={() => setDeleteConfirmVisible(false)}>
      <View style={styles.modalOverlayCenter}>
        <View style={styles.fbModalCard}>
          <View style={styles.fbModalContent}>
            <Text style={styles.fbModalTitle}>Delete announcement?</Text>
            <Text style={styles.fbModalMessage}>
              Are you sure you want to delete this announcement? This cannot be undone.
            </Text>
          </View>
          <View style={styles.fbModalButtonContainer}>
            <TouchableOpacity 
              style={[styles.fbModalCancelButton, isDeleting && styles.fbModalButtonDisabled]} 
              onPress={() => setDeleteConfirmVisible(false)}
              disabled={isDeleting}
            >
              <Text style={styles.fbModalCancelText}>Close</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[
                styles.fbModalConfirmButton, 
                { backgroundColor: '#8B0000' },
                isDeleting && styles.fbModalButtonDisabled
              ]} 
              onPress={deleteAnnouncement}
              disabled={isDeleting}
            >
              <Text style={styles.fbModalConfirmText}>
                {isDeleting ? 'Deleting...' : 'Confirm'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>

    {/* Feedback Modal (mirrored from Admin Alerts) */}
    <Modal transparent animationType="fade" visible={feedbackVisible} onRequestClose={() => setFeedbackVisible(false)}>
      <View style={styles.modalOverlayCenter}>
        <View style={styles.fbModalCard}>
          <View style={styles.fbModalContent}>
            <Text style={[styles.fbModalTitle, { color: feedbackSuccess ? '#10B981' : '#DC2626' }]}>
              {feedbackSuccess ? 'Success' : 'Error'}
            </Text>
            <Text style={styles.fbModalMessage}>{feedbackMessage}</Text>
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

    {/* Floating Create Button */}
    <TouchableOpacity 
      style={styles.floatingCreateButton}
      onPress={openCreateModal}
      activeOpacity={0.8}
    >
      <Ionicons name="add" size={28} color="#FFFFFF" />
    </TouchableOpacity>
  </>);
};

// Define sidebar width outside component for use in styles
const SIDEBAR_WIDTH = Dimensions.get('window').width * 0.6;

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
  floatingCreateButton: {
    position: 'absolute',
    bottom: 20,
    right: 16,
    width: 56,
    height: 56,
    borderRadius: 8,
    backgroundColor: '#004f89',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 12,
    elevation: 10,
    zIndex: 1000,
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
  
  // Sidebar styles
  sidebar: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: SIDEBAR_WIDTH,
    backgroundColor: '#fff',
    padding: 20,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowOffset: { width: -5, height: 0 },
    shadowRadius: 10,
    zIndex: 10,
    borderTopStartRadius: 15,
  },
  sidebarTitle: { fontSize: 25, fontWeight: 'bold', marginTop: 30, marginBottom: 20 },
  sidebarItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  sidebarText: { fontSize: 16, marginLeft: 12 },
  activeSidebarItem: {
    backgroundColor: '#EFF6FF',
    borderRadius: 8,
    marginVertical: 2,
  },
  activeSidebarText: { color: '#2563EB', fontWeight: '600' },
  logoutItem: { marginTop: 20 },
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(17,24,39,0.25)', zIndex: 10 },
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
  
  // Modern Modal Styles (mirrored from Schedule.js)
  modernModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  modernModalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    width: '100%',
    maxWidth: 420,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowOffset: { width: 0, height: 12 },
    shadowRadius: 32,
    elevation: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.8)',
    maxHeight: height * 0.85,
    minHeight: height * 0.65,
  },
  modernModalHeader: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
  },
  modernHeaderGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 24,
    paddingTop: 20,
    paddingBottom: 20,
    backgroundColor: '#004f89',
    position: 'relative',
  },
  modernHeaderContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  modernAvatar: {
    width: 56,
    height: 56,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
    borderWidth: 3,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 8,
  },
  avatarOctagonMedium: { 
    position: 'absolute', 
    width: 44, 
    height: 44, 
    backgroundColor: 'rgba(255,255,255,0.18)', 
    borderWidth: 2, 
    borderColor: 'rgba(255,255,255,0.35)', 
    borderRadius: 10 
  },
  modernHeaderInfo: {
    flex: 1,
  },
  modernName: {
    fontSize: 20,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: 4,
    textShadowColor: 'rgba(0, 0, 0, 0.1)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  modernId: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.8)',
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  modernCloseBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  modernInfoGrid: {
    padding: 16,
    paddingTop: 16,
    backgroundColor: '#FAFBFC',
  },
  modernActions: {
    flexDirection: 'row',
    padding: 16,
    paddingTop: 8,
    backgroundColor: '#FFFFFF',
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    gap: 8,
  },
  modernCloseButton: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    minHeight: 48,
    minWidth: 0,
  },
  modernCloseButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#475569',
    letterSpacing: 0.3,
  },
  modernSaveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#004f89',
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderRadius: 8,
    gap: 8,
    flex: 1,
    minHeight: 48,
    minWidth: 0,
    borderWidth: 1.5,
    borderColor: '#004f89',
  },
  modernSaveButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
  modernSaveButtonDisabled: {
    opacity: 0.5,
  },
  inputGroup: {
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  textInput: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: '#111827',
    backgroundColor: '#FFFFFF',
  },
  messageInput: {
    height: 100,
    textAlignVertical: 'top',
  },
  categorySelector: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  categoryOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    backgroundColor: '#FFFFFF',
    gap: 6,
  },
  categoryOptionSelected: {
    borderColor: '#004f89',
    backgroundColor: '#EFF6FF',
  },
  categoryOptionText: {
    fontSize: 12,
    color: '#6B7280',
    fontWeight: '500',
  },
  categoryOptionTextSelected: {
    color: '#004f89',
    fontWeight: '600',
  },
  
  // Badge styles
  badgeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  actionBadge: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: 'rgba(0,79,137,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pinnedBadge: {
    backgroundColor: '#004f89',
  },
  modalButtonDisabled: {
    opacity: 0.5,
  },
  modalButtonTextDisabled: {
    opacity: 0.5,
  },
  // Facebook-style confirm + feedback (mirrored from Admin Alerts)
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
  fbModalButtonContainer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 20,
    gap: 8,
  },
  fbModalCancelButton: {
    backgroundColor: '#E4E6EB',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fbModalCancelText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#050505',
  },
  fbModalConfirmButton: {
    backgroundColor: '#1877F2',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fbModalConfirmText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  fbModalButtonDisabled: {
    opacity: 0.5,
  },
});

export default Events;