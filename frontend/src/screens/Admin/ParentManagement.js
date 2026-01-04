import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, TextInput, Modal, KeyboardAvoidingView, Platform } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect, useRoute, useIsFocused } from '@react-navigation/native';
import { collection, query, where, getDocs, onSnapshot, doc, deleteDoc, setDoc, getDoc } from 'firebase/firestore';
import { db } from '../../utils/firebaseConfig';
import { withNetworkErrorHandling, getNetworkErrorMessage } from '../../utils/networkErrorHandler';
import AdminTopHeader from './AdminTopHeader';
const AboutLogo = require('../../assets/logo.png');

const ParentManagement = () => {
  const navigation = useNavigation();
  const route = useRoute();
  const isFocused = useIsFocused();
  const [parents, setParents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

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
  
  const [detailVisible, setDetailVisible] = useState(false);
  const [detailParent, setDetailParent] = useState(null);
  const [linkedLoading, setLinkedLoading] = useState(false);
  const [linkedStudents, setLinkedStudents] = useState([]);
  const [linkedByParent, setLinkedByParent] = useState({});
  const [isSearching, setIsSearching] = useState(false);
  const [searchParentName, setSearchParentName] = useState('');
  const [networkErrorVisible, setNetworkErrorVisible] = useState(false);
  const [networkErrorTitle, setNetworkErrorTitle] = useState('');
  const [networkErrorMessage, setNetworkErrorMessage] = useState('');
  const [networkErrorColor, setNetworkErrorColor] = useState('#DC2626');
  const searchStateRef = useRef({ isSearching: false, searchQuery: '', navigatingToProfile: false }); // Preserve search state across navigation

  // Search state is now driven by universal header via route params
  useEffect(() => {
    const active = route?.params?.searchActive === true;
    const q = route?.params?.searchQuery || '';
    setIsSearching(active);
    setSearchParentName(String(q));
    // Update ref to preserve state (preserve navigatingToProfile flag)
    searchStateRef.current = { 
      isSearching: active, 
      searchQuery: String(q),
      navigatingToProfile: searchStateRef.current?.navigatingToProfile || false
    };
  }, [route?.params?.searchActive, route?.params?.searchQuery]);


  const loadAllParents = async () => {
    setLoading(true);
    setError(null);
    try {
      const usersRef = collection(db, 'users');
      const q = query(usersRef, where('role', '==', 'parent'));
      const snap = await getDocs(q);
      const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      // Sort by last name, then first name
      items.sort((a, b) => {
        const al = String(a.lastName || '').toLowerCase();
        const bl = String(b.lastName || '').toLowerCase();
        const cmp = al.localeCompare(bl);
        if (cmp !== 0) return cmp;
        const af = String(a.firstName || '').toLowerCase();
        const bf = String(b.firstName || '').toLowerCase();
        return af.localeCompare(bf);
      });
      // Fetch linked students per parent
      const withLinks = await Promise.all(items.map(async (p) => {
        try {
          const pid = p.uid || p.id;
          if (!pid) return { ...p, linkedStudents: [] };
          const linksQ = query(collection(db, 'parent_student_links'), where('parentId', '==', pid), where('status', '==', 'active'));
          const linkSnap = await getDocs(linksQ);
          const names = linkSnap.docs.map(ld => {
            const x = ld.data() || {};
            const name = String(x.studentName || '').trim();
            if (!name) return '';
            if (name.includes(',')) return name; // already formatted
            const parts = name.split(/\s+/);
            if (parts.length === 1) return parts[0];
            const last = parts.pop();
            const first = parts.join(' ');
            return `${last}, ${first}`;
          }).filter(Boolean);
          return { ...p, linkedStudents: names };
        } catch {
          return { ...p, linkedStudents: [] };
        }
      }));
      setParents(withLinks);
      
      // Calculate and pass counts to AdminTopHeader
      const counts = withLinks.reduce((acc, p) => {
        const pid = p.uid || p.id;
        const arr = p.linkedStudents || [];
        if (arr.length > 0) acc.linked += 1; else acc.unlinked += 1;
        return acc;
      }, { linked: 0, unlinked: 0 });
      
      try {
        // Only set params if screen is focused
        if (isFocused && navigation.setParams) {
          navigation.setParams({
            parentCounts: counts,
          });
        }
      } catch {}
    } catch (e) {
      console.error('Error loading parents:', e);
      // Only show network error modal for actual network errors
      if (e?.code?.includes('unavailable') || e?.code?.includes('network') || e?.message?.toLowerCase().includes('network')) {
        const errorInfo = getNetworkErrorMessage({ type: 'unstable_connection', message: e.message });
        setNetworkErrorTitle(errorInfo.title);
        setNetworkErrorMessage(errorInfo.message);
        setNetworkErrorColor(errorInfo.color);
        setNetworkErrorVisible(true);
        setTimeout(() => setNetworkErrorVisible(false), 5000);
        setError(null);
      } else {
        setError('Failed to load parents');
      }
      setParents([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAllParents();
  }, []);

  // Refresh data when screen comes into focus
  useFocusEffect(
    React.useCallback(() => {
      loadAllParents();
      
      // If we're coming back from ParentProfile, exit search mode and show normal list
      if (searchStateRef.current.navigatingToProfile) {
        searchStateRef.current.navigatingToProfile = false;
        // Clear route params first to prevent re-enabling search mode
        try {
          if (navigation.setParams) {
            navigation.setParams({
              searchActive: false,
              searchQuery: '',
            });
          }
        } catch {}
        // Exit search mode after clearing params
        setIsSearching(false);
        setSearchParentName('');
        searchStateRef.current = { isSearching: false, searchQuery: '', navigatingToProfile: false };
        return;
      }
      
      // Check if search state should be preserved (from route params)
      // Use current route params at the time of focus, not as dependency
      const currentRoute = route;
      const searchActive = currentRoute?.params?.searchActive;
      const searchQuery = currentRoute?.params?.searchQuery;
      
      if (searchActive && searchQuery !== undefined) {
        // Restore search state from route params
        setIsSearching(true);
        setSearchParentName(String(searchQuery || ''));
        searchStateRef.current = { isSearching: true, searchQuery: String(searchQuery || ''), navigatingToProfile: false };
      } else if (searchActive === false) {
        // Only exit search mode if explicitly not in search
        setIsSearching(false);
        setSearchParentName('');
        searchStateRef.current = { isSearching: false, searchQuery: '', navigatingToProfile: false };
      }
    }, [navigation])
  );

  // Realtime linked students per parent
  useEffect(() => {
    const qLinks = query(collection(db, 'parent_student_links'), where('status', '==', 'active'));
    const unsub = onSnapshot(qLinks, (snap) => {
      const next = {};
      snap.docs.forEach(docSnap => {
        const x = docSnap.data() || {};
        const pid = x.parentId;
        if (!pid) return;
        if (!next[pid]) next[pid] = [];
        const name = String(x.studentName || '').trim();
        if (name) {
          if (name.includes(',')) next[pid].push(name);
          else {
            const parts = name.split(/\s+/);
            if (parts.length === 1) next[pid].push(parts[0]);
            else {
              const last = parts.pop();
              const first = parts.join(' ');
              next[pid].push(`${last}, ${first}`);
            }
          }
        }
      });
      setLinkedByParent(next);
    }, (error) => {
      console.error('Error in parent_student_links snapshot:', error);
      const errorInfo = getNetworkErrorMessage(error);
      if (error?.code?.includes('unavailable') || error?.code?.includes('deadline-exceeded') || error?.message?.toLowerCase().includes('network') || error?.message?.toLowerCase().includes('connection')) {
        setNetworkErrorTitle(errorInfo.title);
        setNetworkErrorMessage(errorInfo.message);
        setNetworkErrorColor(errorInfo.color);
        setNetworkErrorVisible(true);
        setTimeout(() => setNetworkErrorVisible(false), 5000);
      }
    });
    return () => unsub();
  }, []);

  // Update counts when parents or linkedByParent changes
  useEffect(() => {
    const counts = parents.reduce((acc, p) => {
      const pid = p.uid || p.id;
      const arr = linkedByParent[pid] || [];
      if (arr.length > 0) acc.linked += 1; else acc.unlinked += 1;
      return acc;
    }, { linked: 0, unlinked: 0 });
    
    try {
      // Only set params if screen is focused
      if (isFocused && navigation.setParams) {
        navigation.setParams({
          parentCounts: counts,
        });
      }
    } catch {}
  }, [parents, linkedByParent, isFocused]);



  const openDetail = (parent) => {
    // Mark that we're navigating to ParentProfile so we can exit search mode on return
    searchStateRef.current.navigatingToProfile = true;
    navigation.navigate('ParentProfile', { 
      parent,
    });
  };
  const closeDetail = () => {
    setDetailVisible(false);
    setDetailParent(null);
    setLinkedStudents([]);
  };

  const loadLinkedForParent = async (parent) => {
    try {
      setLinkedLoading(true);
      const pid = parent?.uid || parent?.id || '';
      if (!pid) { setLinkedStudents([]); setLinkedLoading(false); return; }
      const linksQ = query(collection(db, 'parent_student_links'), where('parentId', '==', pid), where('status', '==', 'active'));
      const snap = await getDocs(linksQ);
      const items = snap.docs.map(d => {
        const x = d.data() || {};
        return {
          linkId: d.id,
          studentId: x.studentId || '',
          studentIdNumber: x.studentIdNumber || '',
          studentName: x.studentName || '',
          relationship: x.relationship || '',
        };
      });
      items.sort((a, b) => String(a.studentName||'').toLowerCase().localeCompare(String(b.studentName||'').toLowerCase()));
      setLinkedStudents(items);
    } catch (e) {
      setLinkedStudents([]);
    } finally {
      setLinkedLoading(false);
    }
  };


  return (
    <View style={{ flex: 1, backgroundColor: '#F9FAFB' }}>
      <AdminTopHeader />
      <KeyboardAvoidingView 
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        <View style={styles.wrapper}>

          <ScrollView 
            contentContainerStyle={[styles.container, { paddingTop: isSearching ? 5 : 5 }]}
            showsVerticalScrollIndicator={false}
            bounces={false}
            horizontal={false}
            keyboardShouldPersistTaps="handled"
          >
        {isSearching ? (
          <View style={{ flex: 1 }}>
            {(() => {
              const q = String(searchParentName || '').trim().toLowerCase();
              if (!q) {
                return (
                  <View style={styles.centerContainer}>
                    {parents.length === 0 ? (
                      <View style={{ backgroundColor: '#FFFFFF', width: '100%', height: 200 }} />
                    ) : (
                      <View style={styles.emptyCard}>
                        <View style={styles.emptyIconWrap}>
                          <Ionicons name="search" size={24} color="#2563EB" />
                        </View>
                        <Text style={styles.emptyTitle}>Start typing a name</Text>
                        <Text style={styles.emptySubtext}>Use the search field in the header to find a parent by name.</Text>
                      </View>
                    )}
                  </View>
                );
              }
              const results = parents.filter(s => {
                const first = String(s.firstName || '').toLowerCase();
                const last = String(s.lastName || '').toLowerCase();
                const full = `${first} ${last}`.trim();
                return first.includes(q) || last.includes(q) || full.includes(q);
              });
              if (results.length === 0) {
                return (
                  <View style={styles.centerContainer}>
                    <View style={styles.emptyCard}>
                      <View style={styles.emptyIconWrap}><Ionicons name="search" size={24} color="#2563EB" /></View>
                      <Text style={styles.emptyTitle}>No results</Text>
                      <Text style={styles.emptySubtext}>Try a different name or check the spelling.</Text>
                    </View>
                  </View>
                );
              }
              return (
                <>
                  <View style={styles.headerContainer}>
                    <View style={styles.legendContainer}>
                      <View style={styles.legendItem}>
                        <View style={[styles.legendDot, { backgroundColor: '#DCFCE7' }]} />
                        <Text style={styles.legendText}>Linked</Text>
                      </View>
                      <View style={styles.legendItem}>
                        <View style={[styles.legendDot, { backgroundColor: '#FEF2F2' }]} />
                        <Text style={styles.legendText}>Unlinked</Text>
                      </View>
                    </View>
                    <View style={styles.badgeContainer}>
                    </View>
                  </View>
                  {results.map((p) => {
                    const pid = p.id || p.uid;
                    const arr = linkedByParent[pid] || [];
                    const isLinked = arr.length > 0;
                    const rowStyle = isLinked ? styles.parentRowLinked : styles.parentRowUnlinked;
                    return (
                      <TouchableOpacity 
                        key={p.uid || p.id} 
                        style={rowStyle}
                        activeOpacity={0.7}
                        onPress={() => openDetail(p)}
                      >
                        <View style={styles.parentAvatar}>
                          <Text style={styles.parentInitials}>{(p.firstName?.[0] || 'P').toUpperCase()}</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.parentName}>{(() => {
                            const first = String(p.firstName || '').trim();
                            const last = String(p.lastName || '').trim();
                            const mid = String(p.middleName || p.middle || p.middleInitial || '').trim();
                            const mi = mid ? ` ${mid.charAt(0).toUpperCase()}.` : '';
                            return `${last}${last && (first || mi) ? ', ' : ''}${first}${mi}`.trim() || 'Unknown Parent';
                          })()}</Text>
                        </View>
                        <View style={isLinked ? styles.linkedBadge : styles.unlinkedBadge}>
                          <Text style={isLinked ? styles.linkedBadgeText : styles.unlinkedBadgeText}>
                            {isLinked ? 'Linked' : 'Unlinked'}
                          </Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </>
              );
            })()}
          </View>
        ) : loading ? (
          <View style={{ flex: 1, backgroundColor: '#FFFFFF' }} />
        ) : error ? (
          <View style={styles.centerContainer}>
            <Ionicons name="alert-circle-outline" size={48} color="#DC2626" />
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity style={styles.retryButton} onPress={loadAllParents}>
              <Text style={styles.retryText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : parents.length === 0 ? (
          <View style={styles.centerContainer}>
            <View style={styles.emptyCard}>
              <View style={styles.emptyIconWrap}><Ionicons name="people-outline" size={24} color="#2563EB" /></View>
              <Text style={styles.emptyTitle}>No Parents Found</Text>
              <Text style={styles.emptySubtext}>Once parents register, they will appear here.</Text>
            </View>
          </View>
        ) : (
          <>
            <View style={styles.headerContainer}>
              <View style={styles.legendContainer}>
                <View style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: '#DCFCE7' }]} />
                  <Text style={styles.legendText}>Linked</Text>
                </View>
                <View style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: '#FEF2F2' }]} />
                  <Text style={styles.legendText}>Unlinked</Text>
                </View>
              </View>
              <View style={styles.badgeContainer}>
              </View>
            </View>
            <View>
              {parents.map((p) => {
                const pid = p.id || p.uid;
                const arr = linkedByParent[pid] || [];
                const isLinked = arr.length > 0;
                const rowStyle = isLinked ? styles.parentRowLinked : styles.parentRowUnlinked;
                return (
                  <TouchableOpacity 
                    key={p.uid || p.id} 
                    style={rowStyle}
                    activeOpacity={0.7}
                    onPress={() => openDetail(p)}
                  >
                    <View style={styles.parentAvatar}>
                      <Text style={styles.parentInitials}>{(p.firstName?.[0] || 'P').toUpperCase()}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.parentName}>{(() => {
                        const first = String(p.firstName || '').trim();
                        const last = String(p.lastName || '').trim();
                        const mid = String(p.middleName || p.middle || p.middleInitial || '').trim();
                        const mi = mid ? ` ${mid.charAt(0).toUpperCase()}.` : '';
                        const name = `${last}${last && (first || mi) ? ', ' : ''}${first}${mi}`.trim();
                        return name || 'Unknown Parent';
                      })()}</Text>
                    </View>
                    <View style={isLinked ? styles.linkedBadge : styles.unlinkedBadge}>
                      <Text style={isLinked ? styles.linkedBadgeText : styles.unlinkedBadgeText}>
                        {isLinked ? 'Linked' : 'Unlinked'}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </>
        )}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
      
      {/* Detail Modal (parent) */}
      <Modal transparent animationType="fade" visible={detailVisible} onRequestClose={closeDetail}>
        <View style={styles.modernModalOverlay}>
          <View style={styles.modernModalCard}>
            <View style={styles.modernModalHeader}>
              <View style={styles.modernHeaderGradient}>
                <View style={styles.modernHeaderContent}>
                  <View style={styles.modernAvatar}>
                    <View style={styles.avatarOctagonMedium} />
                    <Text style={[styles.modernAvatarText, styles.avatarInitialOnBlue]}>
                      {(detailParent?.firstName?.[0] || 'P').toUpperCase()}
                    </Text>
                  </View>
                  <View style={styles.modernHeaderInfo}>
                    <Text style={styles.modernName}>
                      {detailParent?.firstName} {detailParent?.lastName}
                    </Text>
                    <Text style={styles.modernId}>ID: {detailParent?.parentId || 'N/A'}</Text>
                  </View>
                </View>
                <TouchableOpacity onPress={closeDetail} style={styles.modernCloseBtn}>
                  <Ionicons name="close" size={20} color="#FFFFFF" />
                </TouchableOpacity>
              </View>
            </View>
            
            <View style={styles.modernInfoGrid}>
              <View style={styles.modernInfoItem}>
                <Ionicons name="mail" size={16} color="#6B7280" />
                <Text style={styles.modernInfoLabel}>Email</Text>
                <Text style={styles.modernInfoValue}>{detailParent?.email || '—'}</Text>
              </View>
            
              <View style={styles.modernInfoItem}>
                <Ionicons name="call" size={16} color="#6B7280" />
                <Text style={styles.modernInfoLabel}>Contact</Text>
                <Text style={styles.modernInfoValue}>{detailParent?.contactNumber || detailParent?.contact || '—'}</Text>
              </View>
              
              <View style={styles.modernInfoItem}>
                <Ionicons name="location" size={16} color="#6B7280" />
                <Text style={styles.modernInfoLabel}>Address</Text>
                <Text style={styles.modernInfoValue}>{detailParent?.address || '—'}</Text>
              </View>
              
              <View style={styles.modernInfoItem}>
                <Ionicons name="people" size={16} color="#6B7280" />
                <Text style={styles.modernInfoLabel}>Linked Students</Text>
                <Text style={styles.modernInfoValue}>
                  {(() => {
                    const pid = detailParent?.uid || detailParent?.id;
                    const arr = linkedByParent[pid] || [];
                    if (arr.length === 0) return '—';
                    return arr.join(', ');
                  })()}
                </Text>
              </View>
            </View>
            
            <View style={styles.modernActions}>
              <TouchableOpacity style={styles.modernCloseButton} onPress={closeDetail}>
                <Text style={styles.modernCloseButtonText}>Close</Text>
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
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: { flex: 1, backgroundColor: '#F9FAFB' },
  container: { padding: 16, paddingBottom: 120, paddingTop: 120, flexGrow: 1 },
  centerContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  loadingText: { marginTop: 12, color: '#6B7280', fontSize: 16 },
  errorText: { marginTop: 8, color: '#DC2626' },
  retryButton: { marginTop: 12, backgroundColor: '#DC2626', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6 },
  retryText: { color: '#fff', fontWeight: '600' },
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
    width: '100%',
  },
  emptyIconWrap: { 
    width: 40, 
    height: 40, 
    borderRadius: 8, 
    backgroundColor: '#EFF6FF', 
    alignItems: 'center', 
    justifyContent: 'center', 
    marginBottom: 8,
  },
  emptyIconSlash: {
    position: 'absolute',
    width: 2,
    height: 32,
    backgroundColor: '#2563EB',
    transform: [{ rotate: '-45deg' }],
    borderRadius: 1,
  },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: '#111827', marginTop: 0, marginBottom: 4 },
  emptySubtext: { fontSize: 14, color: '#6B7280', textAlign: 'center', lineHeight: 20 },
  listSection: { marginTop: 12, backgroundColor: '#fff', borderRadius: 8, borderWidth: 1, borderColor: '#E5E7EB', padding: 12 },
  listHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  titleWithBadge: { flexDirection: 'row', alignItems: 'center' },
  listTitle: { fontSize: 14, fontWeight: '700', color: '#111827', marginRight: 8 },
  badge: { backgroundColor: '#2563EB', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  badgeText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  pageHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2, paddingTop: 2 },
  sectionTitle: { fontSize: 18, fontWeight: '900', color: '#0078cf', marginRight: 8, marginBottom: 4, marginTop: 8 },
  listContainer: { backgroundColor: '#fff', borderRadius: 8, borderWidth: 1, borderColor: '#E5E7EB', paddingHorizontal: 8, paddingVertical: 4, marginTop: 12 },
  separator: { height: 1, backgroundColor: '#E5E7EB', marginVertical: 8 },
  searchSectionHeader: { marginBottom: 8 },
  parentRow: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: '#F3F4F6', borderRadius: 6, marginHorizontal: 2, marginVertical: 1 },
  parentRowLinked: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: '#F3F4F6', borderRadius: 6, marginHorizontal: 2, marginVertical: 1, backgroundColor: '#DCFCE7' },
  parentRowUnlinked: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: '#F3F4F6', borderRadius: 6, marginHorizontal: 2, marginVertical: 1, backgroundColor: '#FEF2F2' },
  parentAvatar: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center', marginRight: 8, marginLeft: 8 },
  parentInitials: { fontSize: 12, fontWeight: '700', color: '#2563EB' },
  parentName: { color: '#111827', fontWeight: '700', fontSize: 13 },
  parentMeta: { color: '#6B7280', fontSize: 11 },
  headerContainer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2, paddingTop: 8, paddingBottom: 8, paddingHorizontal: 12, backgroundColor: '#FFFFFF', borderRadius: 8, borderWidth: 1, borderColor: '#E5E7EB' },
  legendContainer: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  badgeContainer: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 12, height: 12, borderRadius: 6 },
  legendText: { fontSize: 11, color: '#0078cf', fontWeight: '600' },
  linkedBadge: { backgroundColor: '#DCFCE7', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, borderWidth: 1, borderColor: '#BBF7D0', marginRight: 8, alignSelf: 'center' },
  linkedBadgeText: { color: '#16A34A', fontSize: 10, fontWeight: '600' },
  unlinkedBadge: { backgroundColor: '#FEE2E2', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, borderWidth: 1, borderColor: '#FECACA', marginRight: 8, alignSelf: 'center' },
  unlinkedBadgeText: { color: '#DC2626', fontSize: 10, fontWeight: '600' },
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
  modalButtonDangerSolid: { backgroundColor: '#DC2626' },
  modalButtonDangerSolidText: { color: '#fff', fontWeight: '700' },
  disabledButton: { opacity: 0.5 },
  detailActionBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 6, gap: 6 },
  deleteParentBtn: { backgroundColor: '#FEE2E2', borderWidth: 1, borderColor: '#FECACA' },
  deleteParentBtnText: { color: '#DC2626', fontSize: 14, fontWeight: '600', textAlign: 'center' },
  // Detail modal (parent)
  detailOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  detailCard: { width: '100%', maxWidth: 380, backgroundColor: '#fff', borderRadius: 8, padding: 14, borderWidth: 1, borderColor: '#E5E7EB' },
  detailHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  detailTitle: { fontSize: 16, fontWeight: '700', color: '#111827' },
  detailBodyTop: { alignItems: 'center', paddingVertical: 6 },
  detailAvatar: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#EFF6FF', justifyContent: 'center', alignItems: 'center', marginBottom: 6 },
  detailInitials: { fontSize: 20, fontWeight: '700', color: '#2563EB' },
  detailName: { fontSize: 16, fontWeight: '700', color: '#111827', textAlign: 'center' },
  detailSub: { fontSize: 13, color: '#6B7280', marginTop: 2 },
  detailInfoList: { marginTop: 8, paddingHorizontal: 16 },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  infoKey: { color: '#374151', fontWeight: '600', fontSize: 13 },
  infoVal: { color: '#6B7280', maxWidth: '55%', textAlign: 'right', fontSize: 13 },
  infoValWide: { color: '#6B7280', textAlign: 'right', fontSize: 13 },
  detailCloseBtn: { backgroundColor: '#F3F4F6', paddingVertical: 10, paddingHorizontal: 14, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  detailCloseText: { color: '#111827', fontWeight: '600', textAlign: 'center' },
  // Inline search results container
  searchResultContainer: { marginTop: 20, backgroundColor: '#F9FAFB', borderRadius: 8, padding: 15, shadowColor: '#000', shadowOpacity: 0.05, shadowOffset: { width: 0, height: 2 }, shadowRadius: 4, elevation: 2 },
  noResultCard: { alignItems: 'center', paddingVertical: 24, paddingHorizontal: 16 },
  noResultTitle: { fontSize: 18, fontWeight: '700', color: '#111827', marginTop: 12, marginBottom: 8 },
  noResultText: { fontSize: 14, color: '#6B7280', textAlign: 'center', lineHeight: 20, marginBottom: 8 },
  noResultTip: { fontSize: 12, color: '#9CA3AF', textAlign: 'center', fontStyle: 'italic' },
  // Card grid (mirrored from StudentManagement)
  yearLevelSection: { marginTop: 4 },
  cardGrid: { gap: 12, paddingHorizontal: 16, paddingBottom: 4, marginTop: 4, width: '100%', alignSelf: 'center' },
  cardGridHorizontal: { paddingHorizontal: 16, gap: 12, alignItems: 'stretch' },
  yearCard: { 
    width: 220,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'flex-start',
    justifyContent: 'flex-start',
    overflow: 'hidden',
    marginVertical: 6,
    marginRight: 12,
    minHeight: 120,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 4,
    elevation: 2,
  },
  yearCardIconWrap: { 
    width: 44, 
    height: 44, 
    borderRadius: 8, 
    alignItems: 'center', 
    justifyContent: 'center', 
    marginBottom: 10 
  },
  yearCardContent: { 
    alignItems: 'flex-start', 
    justifyContent: 'center',
    width: '100%',
  },
  yearCardTitle: { 
    fontSize: 16, 
    fontWeight: '700', 
    color: '#004f89', 
    marginBottom: 4, 
    textAlign: 'left' 
  },
  yearCardCount: { 
    fontSize: 13, 
    color: '#004f89', 
    fontWeight: '600', 
    textAlign: 'left' 
  },
  centerRow: { alignItems: 'center', justifyContent: 'center', paddingVertical: 16 },
  emptyText: { color: '#6B7280' },
  
  // Modern Modal Styles (mirrored from StudentManagement.js)
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
    width: '90%',
    maxWidth: 360,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 20,
    elevation: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  modernModalHeader: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: 'hidden',
  },
  modernHeaderGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    paddingBottom: 16,
    backgroundColor: '#004f89',
    position: 'relative',
  },
  modernHeaderContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  modernAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 4,
  },
  modernAvatarText: {
    fontSize: 16,
    fontWeight: '900',
    color: '#FFFFFF',
    textShadowColor: 'rgba(0, 0, 0, 0.1)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  modernHeaderInfo: {
    flex: 1,
  },
  modernName: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: 2,
    textShadowColor: 'rgba(0, 0, 0, 0.1)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  modernId: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.8)',
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  modernCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  modernInfoGrid: {
    padding: 12,
    paddingTop: 20,
    backgroundColor: '#FAFBFC',
  },
  modernInfoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  modernInfoLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1F2937',
    marginLeft: 10,
    marginRight: 12,
    minWidth: 60,
    letterSpacing: 0.2,
  },
  modernInfoValue: {
    fontSize: 13,
    color: '#4B5563',
    flex: 1,
    textAlign: 'right',
    fontWeight: '500',
  },
  modernActions: {
    flexDirection: 'row',
    padding: 12,
    paddingTop: 8,
    backgroundColor: '#FFFFFF',
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    gap: 6,
  },
  modernCloseButton: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 2,
  },
  modernCloseButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#475569',
    letterSpacing: 0.2,
  },
  modernDeleteButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#DC2626',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
    shadowColor: '#DC2626',
    shadowOpacity: 0.3,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 6,
    elevation: 4,
    gap: 6,
  },
  modernDeleteButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.2,
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
  avatarInitialOnBlue: { 
    color: '#FFFFFF' 
  },
  // Facebook-style modal styles (from Schedule.js)
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

export default ParentManagement;

 