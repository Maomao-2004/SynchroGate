import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, KeyboardAvoidingView, Platform, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect, useRoute } from '@react-navigation/native';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../utils/firebaseConfig';
import { getNetworkErrorMessage } from '../../utils/networkErrorHandler';
import AdminTopHeader from './AdminTopHeader';

const StudentAttendance = () => {
  const navigation = useNavigation();
  const route = useRoute();
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedYear, setSelectedYear] = useState(null); // 1|2|3|4|null
  const [selectedCourse, setSelectedCourse] = useState(null);
  const [yearCounts, setYearCounts] = useState({ y1: 0, y2: 0, y3: 0, y4: 0 });
  const [courseCounts, setCourseCounts] = useState({});
  const [courseList, setCourseList] = useState([]);
  const [listItems, setListItems] = useState([]);
  const [listLoading, setListLoading] = useState(false);
  const [networkErrorVisible, setNetworkErrorVisible] = useState(false);
  const [networkErrorTitle, setNetworkErrorTitle] = useState('');
  const [networkErrorMessage, setNetworkErrorMessage] = useState('');
  const [networkErrorColor, setNetworkErrorColor] = useState('#DC2626');
  
  // Search state
  const [isSearching, setIsSearching] = useState(false);
  const [searchStudentName, setSearchStudentName] = useState('');
  const searchStateRef = useRef({ isSearching: false, searchQuery: '', navigatingToProfile: false });

  const adminCardPalette = {
    cardBg: '#FFFFFF',
    borderColor: '#E5E7EB',
    iconBg: 'rgba(0,79,137,0.12)',
    accentColor: '#004f89',
    labelColor: '#004f89',
  };
  const DEFAULT_COURSES = ['BSAIS', 'BSBA', 'BSCRIM', 'BSHM', 'BSIT', 'BSTM', 'BTLED'];

  const loadAllStudents = async () => {
    setLoading(true);
    setError(null);
    try {
      const usersRef = collection(db, 'users');
      const q = query(usersRef, where('role', '==', 'student'));
      const snap = await getDocs(q);
      const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setStudents(items);
    } catch (e) {
      console.error('Error loading students:', e);
      if (e?.code?.includes('unavailable') || e?.code?.includes('network') || e?.message?.toLowerCase().includes('network')) {
        const errorInfo = getNetworkErrorMessage({ type: 'unstable_connection', message: e.message });
        setNetworkErrorTitle(errorInfo.title);
        setNetworkErrorMessage(errorInfo.message);
        setNetworkErrorColor(errorInfo.color);
        setNetworkErrorVisible(true);
        setTimeout(() => setNetworkErrorVisible(false), 5000);
      } else {
        setError('Failed to load students');
        setStudents([]);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAllStudents();
  }, []);

  // Handle search text (by name)
  const handleStudentNameInput = (text) => {
    setSearchStudentName(text);
  };

  // Reset search state
  const resetSearchState = () => {
    setSearchStudentName('');
  };

  const exitSearchMode = () => {
    setIsSearching(false);
    resetSearchState();
    searchStateRef.current = { isSearching: false, searchQuery: '', navigatingToProfile: false };
  };

  // Search state is now driven by universal header via route params
  useEffect(() => {
    const active = route?.params?.searchActive === true;
    const q = route?.params?.searchQuery || '';
    setIsSearching(active);
    setSearchStudentName(String(q));
    // Update ref to preserve state
    searchStateRef.current = { 
      isSearching: active, 
      searchQuery: String(q),
      navigatingToProfile: searchStateRef.current?.navigatingToProfile || false
    };
  }, [route?.params?.searchActive, route?.params?.searchQuery]);

  useFocusEffect(
    React.useCallback(() => {
      loadAllStudents();
      
      // If we're coming back from AttendanceLog, exit search mode
      if (searchStateRef.current.navigatingToProfile) {
        searchStateRef.current.navigatingToProfile = false;
        // Clear route params first to prevent re-enabling search mode
        try {
          navigation.setParams?.({
            searchActive: false,
            searchQuery: '',
          });
        } catch {}
        // Exit search mode after clearing params
        exitSearchMode();
        return;
      }
      
      // Check if search state should be preserved (from route params)
      const searchActive = route?.params?.searchActive;
      const searchQuery = route?.params?.searchQuery;
      
      if (searchActive && searchQuery !== undefined) {
        // Restore search state from route params
        setIsSearching(true);
        setSearchStudentName(String(searchQuery || ''));
        searchStateRef.current = { isSearching: true, searchQuery: String(searchQuery || ''), navigatingToProfile: false };
      } else if (!searchActive) {
        // Only exit search mode if not explicitly in search
        exitSearchMode();
      }
    }, [navigation, route?.params])
  );

  useEffect(() => {
    // Compute counts per year and per course when students change
    const normalizeYear = (val) => {
      const str = String(val ?? '').trim().toLowerCase();
      if (!str) return null;
      if (/^1|first|year\s*1|1st/.test(str)) return 1;
      if (/^2|second|year\s*2|2nd/.test(str)) return 2;
      if (/^3|third|year\s*3|3rd/.test(str)) return 3;
      if (/^4|fourth|year\s*4|4th/.test(str)) return 4;
      const num = parseInt(str, 10);
      if ([1,2,3,4].includes(num)) return num;
      return null;
    };
    const nextYears = { y1: 0, y2: 0, y3: 0, y4: 0 };
    const courseMap = new Map();
    students.forEach(s => {
      const yr = normalizeYear(s.yearLevel);
      if (yr === 1) nextYears.y1 += 1;
      else if (yr === 2) nextYears.y2 += 1;
      else if (yr === 3) nextYears.y3 += 1;
      else if (yr === 4) nextYears.y4 += 1;

      const rawCourse = String(s.course || '').trim();
      if (rawCourse) {
        const key = rawCourse.toLowerCase();
        const existing = courseMap.get(key);
        courseMap.set(key, { label: rawCourse, count: (existing?.count || 0) + 1 });
      }
    });
    setYearCounts(nextYears);
    const mergedCourses = new Map();
    DEFAULT_COURSES.forEach((c) => {
      mergedCourses.set(c.toLowerCase(), { label: c, count: 0 });
    });
    courseMap.forEach((value, key) => {
      const existing = mergedCourses.get(key);
      mergedCourses.set(key, {
        label: existing?.label || value.label,
        count: (existing?.count || 0) + value.count,
      });
    });

    const nextCourseCounts = {};
    const nextCourseList = [];
    Array.from(mergedCourses.values())
      .sort((a, b) => a.label.localeCompare(b.label))
      .forEach(({ label, count }) => {
        const key = label.toLowerCase();
        nextCourseCounts[key] = count;
        nextCourseList.push(label);
      });
    setCourseCounts(nextCourseCounts);
    setCourseList(nextCourseList);
  }, [students]);

  const formatYearLabel = (val) => {
    const str = String(val ?? '').trim();
    const num = parseInt(str, 10);
    if (num === 1) return '1st Year';
    if (num === 2) return '2nd Year';
    if (num === 3) return '3rd Year';
    if (num === 4) return '4th Year';
    return str || '';
  };

  const toRomanNumeral = (num) => {
    const romanMap = {
      1: 'I',
      2: 'II',
      3: 'III',
      4: 'IV',
    };
    return romanMap[num] || String(num);
  };

  const getCourseIcon = (course) => {
    const courseUpper = String(course || '').toUpperCase().trim();
    const iconMap = {
      'BSAIS': 'calculator-outline',
      'BSBA': 'briefcase-outline',
      'BSCRIM': 'shield-outline',
      'BSHM': 'restaurant-outline',
      'BSIT': 'laptop-outline',
      'BSTM': 'airplane-outline',
      'BTLED': 'construct-outline',
    };
    return iconMap[courseUpper] || 'school-outline';
  };

  const fetchStudentsForYear = async (year) => {
    setListLoading(true);
    try {
      const usersRef = collection(db, 'users');
      const q = query(usersRef, where('role', '==', 'student'));
      const snap = await getDocs(q);
      const allStudents = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      
      const yearStudents = allStudents.filter(s => {
        const str = String(s.yearLevel ?? '').toLowerCase();
        const n = parseInt(str, 10);
        const yr = !isNaN(n) ? n : (/1|first/.test(str) ? 1 : /2|second/.test(str) ? 2 : /3|third/.test(str) ? 3 : /4|fourth/.test(str) ? 4 : null);
        return yr === year;
      });
      yearStudents.sort((a, b) => {
        const al = String(a.lastName || '').toLowerCase();
        const bl = String(b.lastName || '').toLowerCase();
        const cmp = al.localeCompare(bl);
        if (cmp !== 0) return cmp;
        const af = String(a.firstName || '').toLowerCase();
        const bf = String(b.firstName || '').toLowerCase();
        return af.localeCompare(bf);
      });

      setListItems(yearStudents);
    } catch (e) {
      console.error('Error fetching students for year:', e);
      if (e?.code?.includes('unavailable') || e?.code?.includes('network') || e?.message?.toLowerCase().includes('network')) {
        const errorInfo = getNetworkErrorMessage({ type: 'unstable_connection', message: e.message });
        setNetworkErrorTitle(errorInfo.title);
        setNetworkErrorMessage(errorInfo.message);
        setNetworkErrorColor(errorInfo.color);
        setNetworkErrorVisible(true);
        setTimeout(() => setNetworkErrorVisible(false), 5000);
      }
      setListItems([]);
    } finally {
      setListLoading(false);
    }
  };

  const fetchStudentsForCourse = async (course) => {
    setListLoading(true);
    try {
      const usersRef = collection(db, 'users');
      const q = query(usersRef, where('role', '==', 'student'));
      const snap = await getDocs(q);
      const allStudents = snap.docs.map(d => ({ id: d.id, ...d.data() }));

      const target = String(course || '').trim().toLowerCase();
      const courseStudents = allStudents.filter(s => {
        const c = String(s.course || '').trim().toLowerCase();
        return c === target;
      });

      courseStudents.sort((a, b) => {
        const al = String(a.lastName || '').toLowerCase();
        const bl = String(b.lastName || '').toLowerCase();
        const cmp = al.localeCompare(bl);
        if (cmp !== 0) return cmp;
        const af = String(a.firstName || '').toLowerCase();
        const bf = String(b.firstName || '').toLowerCase();
        return af.localeCompare(bf);
      });

      setListItems(courseStudents);
    } catch (e) {
      console.error('Error fetching students for course:', e);
      if (e?.code?.includes('unavailable') || e?.code?.includes('network') || e?.message?.toLowerCase().includes('network')) {
        const errorInfo = getNetworkErrorMessage({ type: 'unstable_connection', message: e.message });
        setNetworkErrorTitle(errorInfo.title);
        setNetworkErrorMessage(errorInfo.message);
        setNetworkErrorColor(errorInfo.color);
        setNetworkErrorVisible(true);
        setTimeout(() => setNetworkErrorVisible(false), 5000);
      }
      setListItems([]);
    } finally {
      setListLoading(false);
    }
  };

  const handleStudentPress = (student) => {
    // Navigate to AttendanceLog screen with student data
    navigation.navigate('AttendanceLog', { student });
  };

  // Intercept back navigation while drilled into a year/course list
  useEffect(() => {
    if (!selectedYear && !selectedCourse) {
      try {
        navigation.setParams?.({
          selectedCardTitle: null,
        });
      } catch {}
      return;
    }
    const unsubscribe = navigation.addListener('beforeRemove', (e) => {
      e.preventDefault();
      setSelectedYear(null);
      setSelectedCourse(null);
      try {
        navigation.setParams?.({
          selectedCardTitle: null,
        });
      } catch {}
    });
    return unsubscribe;
  }, [navigation, selectedYear, selectedCourse]);

  return (
    <View style={styles.wrapper}>
      <AdminTopHeader />
      <KeyboardAvoidingView 
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        <View style={styles.wrapper}>
          <ScrollView 
            contentContainerStyle={[
              styles.contentContainer,
              { paddingTop: 5 }
            ]}
            showsVerticalScrollIndicator={false}
            bounces={false}
            horizontal={false}
            keyboardShouldPersistTaps="handled"
          >
            {loading ? (
              <View style={styles.centerContainer}>
                <Text style={styles.loadingText}>Loading students...</Text>
              </View>
            ) : error ? (
              <View style={styles.centerContainer}>
                <Text style={styles.errorText}>{error}</Text>
                <TouchableOpacity style={styles.retryButton} onPress={loadAllStudents}>
                  <Text style={styles.retryText}>Retry</Text>
                </TouchableOpacity>
              </View>
            ) : students.length === 0 ? (
              <View style={styles.centerContainer}>
                <View style={styles.emptyCard}>
                  <View style={styles.emptyIconWrap}><Ionicons name="people-outline" size={24} color="#2563EB" /></View>
                  <Text style={styles.emptyTitle}>No Students Found</Text>
                  <Text style={styles.emptySubtext}>Once students register, they will appear here.</Text>
                </View>
              </View>
            ) : (
              <View style={{ flex: 1 }}>
                {!selectedYear && !selectedCourse ? (
                  <View>
                    <View style={styles.yearLevelSection}>
                      <Text style={[styles.sectionTitle, { marginLeft: 0, marginBottom: 0, marginTop: 0 }]}>Year Levels</Text>
                      <View style={styles.cardGrid}>
                        {[
                          { key: 'y1', label: '1st Year', year: 1, icon: 'book-outline' },
                          { key: 'y2', label: '2nd Year', year: 2, icon: 'library-outline' },
                          { key: 'y3', label: '3rd Year', year: 3, icon: 'school-outline' },
                          { key: 'y4', label: '4th Year', year: 4, icon: 'ribbon-outline' },
                        ].map(({ key, label, year, icon }) => (
                          <TouchableOpacity
                            key={key}
                            style={[
                              styles.yearCard,
                              { backgroundColor: adminCardPalette.cardBg, borderColor: adminCardPalette.borderColor },
                            ]}
                            onPress={() => { 
                              setSelectedYear(year);
                              setSelectedCourse(null);
                              fetchStudentsForYear(year);
                              try {
                                navigation.setParams?.({
                                  selectedCardTitle: label,
                                });
                              } catch {}
                            }}
                          >
                            <View style={[styles.yearCardIconWrap, { backgroundColor: adminCardPalette.iconBg }]}>
                              <Text style={styles.yearCardNumber}>{toRomanNumeral(year)}</Text>
                            </View>
                            <View style={styles.yearCardContent}>
                              <Text style={styles.yearCardTitle}>{label}</Text>
                              <Text style={styles.yearCardCount}>{yearCounts[key]} students</Text>
                            </View>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>

                    {courseList && courseList.length > 0 ? (
                      <View style={[styles.yearLevelSection, { marginTop: 0 }]}>
                        <Text style={[styles.sectionTitle, { marginLeft: 0, marginBottom: 4 }]}>Courses</Text>
                        <View style={styles.cardGrid}>
                          {courseList.map((course) => {
                            const count = courseCounts[course.toLowerCase()] || 0;
                            return (
                              <TouchableOpacity
                                key={course}
                                style={[
                                  styles.yearCard,
                                  { backgroundColor: adminCardPalette.cardBg, borderColor: adminCardPalette.borderColor },
                                ]}
                                onPress={() => {
                                  setSelectedCourse(course);
                                  setSelectedYear(null);
                                  fetchStudentsForCourse(course);
                                  try {
                                    navigation.setParams?.({
                                      selectedCardTitle: course,
                                    });
                                  } catch {}
                                }}
                              >
                                <View style={[styles.yearCardIconWrap, { backgroundColor: adminCardPalette.iconBg }]}>
                                  <Ionicons name={getCourseIcon(course)} size={24} color={adminCardPalette.accentColor} />
                                </View>
                                <View style={styles.yearCardContent}>
                                  <Text style={styles.yearCardTitle}>{course}</Text>
                                  <Text style={styles.yearCardCount}>{count} students</Text>
                                </View>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      </View>
                    ) : null}
                  </View>
                ) : (
                  isSearching ? (
                    <View style={{ flex: 1 }}>
                      {(() => {
                        const q = String(searchStudentName || '').trim().toLowerCase();
                        
                        // Only search if a card is selected (year or course)
                        if (!selectedYear && !selectedCourse) {
                          return (
                            <View style={{ flex: 1, padding: 16, paddingTop: 50, paddingBottom: 120 }}>
                              <View style={styles.centerContainer}>
                                <View style={styles.emptyCard}>
                                  <View style={styles.emptyIconWrap}>
                                    <Ionicons name="search" size={24} color="#2563EB" />
                                  </View>
                                  <Text style={styles.emptyTitle}>Select a card first</Text>
                                  <Text style={styles.emptySubtext}>Please select a year level or course card to search within.</Text>
                                </View>
                              </View>
                            </View>
                          );
                        }
                        
                        // Filter students directly from the full students array based on selected card
                        let studentsToSearch = [];
                        
                        if (selectedYear) {
                          // Filter all students to get only those from selectedYear
                          studentsToSearch = students.filter(s => {
                            const str = String(s.yearLevel ?? '').toLowerCase();
                            const n = parseInt(str, 10);
                            const yr = !isNaN(n) ? n : (/1|first/.test(str) ? 1 : /2|second/.test(str) ? 2 : /3|third/.test(str) ? 3 : /4|fourth/.test(str) ? 4 : null);
                            return yr === selectedYear;
                          });
                          // Sort by last name, then first name
                          studentsToSearch.sort((a, b) => {
                            const al = String(a.lastName || '').toLowerCase();
                            const bl = String(b.lastName || '').toLowerCase();
                            const cmp = al.localeCompare(bl);
                            if (cmp !== 0) return cmp;
                            const af = String(a.firstName || '').toLowerCase();
                            const bf = String(b.firstName || '').toLowerCase();
                            return af.localeCompare(bf);
                          });
                        } else if (selectedCourse) {
                          // Filter all students to get only those from selectedCourse
                          const target = String(selectedCourse || '').trim().toLowerCase();
                          studentsToSearch = students.filter(s => {
                            const c = String(s.course || '').trim().toLowerCase();
                            return c === target;
                          });
                          // Sort by last name, then first name
                          studentsToSearch.sort((a, b) => {
                            const al = String(a.lastName || '').toLowerCase();
                            const bl = String(b.lastName || '').toLowerCase();
                            const cmp = al.localeCompare(bl);
                            if (cmp !== 0) return cmp;
                            const af = String(a.firstName || '').toLowerCase();
                            const bf = String(b.firstName || '').toLowerCase();
                            return af.localeCompare(bf);
                          });
                        }
                        
                        if (!q) {
                          return (
                            <View style={styles.centerContainer}>
                              {studentsToSearch.length === 0 ? (
                                <View style={{ backgroundColor: '#FFFFFF', width: '100%', height: 200 }} />
                              ) : (
                                <View style={styles.emptyCard}>
                                  <View style={styles.emptyIconWrap}>
                                    <Ionicons name="search" size={24} color="#2563EB" />
                                  </View>
                                  <Text style={styles.emptyTitle}>Start typing a name</Text>
                                  <Text style={styles.emptySubtext}>Use the search field in the header to find a student by name.</Text>
                                </View>
                              )}
                            </View>
                          );
                        }
                      
                        // Filter only from the students that match the selected card
                        const results = studentsToSearch.filter(s => {
                          const first = String(s.firstName || '').toLowerCase();
                          const last = String(s.lastName || '').toLowerCase();
                          const full = `${first} ${last}`.trim();
                          return first.includes(q) || last.includes(q) || full.includes(q);
                        });
                        
                        if (results.length === 0) {
                          return (
                            <View style={styles.centerContainer}>
                              <View style={styles.emptyCard}>
                                <View style={styles.emptyIconWrap}>
                                  <Ionicons name="search" size={24} color="#2563EB" />
                                </View>
                                <Text style={styles.emptyTitle}>No results</Text>
                                <Text style={styles.emptySubtext}>Try a different name or check the spelling.</Text>
                              </View>
                            </View>
                          );
                        }
                        
                        return (
                          <View>
                            {results.map(s => (
                              <TouchableOpacity 
                                key={s.id} 
                                style={styles.studentRow}
                                activeOpacity={0.7}
                                onPress={() => {
                                  searchStateRef.current.navigatingToProfile = true;
                                  handleStudentPress(s);
                                }}
                              >
                                <View style={styles.studentAvatar}>
                                  <Text style={styles.studentInitials}>{(s.firstName?.[0] || 'S').toUpperCase()}</Text>
                                </View>
                                <View style={{ flex: 1 }}>
                                  <Text style={styles.studentName}>{(() => {
                                    const first = String(s.firstName || '').trim();
                                    const last = String(s.lastName || '').trim();
                                    const mid = String(s.middleName || s.middle || s.middleInitial || '').trim();
                                    const mi = mid ? ` ${mid.charAt(0).toUpperCase()}.` : '';
                                    const name = `${last}${last && (first || mi) ? ', ' : ''}${first}${mi}`.trim();
                                    return name || 'Unknown Student';
                                  })()}</Text>
                                  <Text style={styles.studentMeta}>
                                    {(() => {
                                      const parts = [];
                                      if (s.course) parts.push(s.course);
                                      if (s.yearLevel) parts.push(formatYearLabel(s.yearLevel));
                                      if (s.section) parts.push(s.section);
                                      return parts.join(' - ') || '—';
                                    })()}
                                  </Text>
                                </View>
                              </TouchableOpacity>
                            ))}
                          </View>
                        );
                      })()}
                    </View>
                  ) : listLoading ? (
                    <View style={{ flex: 1, backgroundColor: '#FFFFFF', minHeight: 200 }} />
                  ) : listItems.length === 0 ? (
                    <View style={styles.centerContainer}>
                      <View style={styles.emptyCard}>
                        <View style={styles.emptyIconWrap}>
                          <Ionicons name="school-outline" size={28} color="#2563EB" />
                          <View style={styles.emptyIconSlash} />
                        </View>
                        <Text style={styles.emptyTitle}>No Students Found</Text>
                        <Text style={styles.emptySubtext}>Students will appear here once available.</Text>
                      </View>
                    </View>
                  ) : (
                    <View>
                      {listItems.map(s => (
                        <TouchableOpacity 
                          key={s.id} 
                          style={styles.studentRow}
                          activeOpacity={0.7}
                          onPress={() => handleStudentPress(s)}
                        >
                          <View style={styles.studentAvatar}>
                            <Text style={styles.studentInitials}>{(s.firstName?.[0] || 'S').toUpperCase()}</Text>
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.studentName}>{(() => {
                              const first = String(s.firstName || '').trim();
                              const last = String(s.lastName || '').trim();
                              const mid = String(s.middleName || s.middle || s.middleInitial || '').trim();
                              const mi = mid ? ` ${mid.charAt(0).toUpperCase()}.` : '';
                              const name = `${last}${last && (first || mi) ? ', ' : ''}${first}${mi}`.trim();
                              return name || 'Unknown Student';
                            })()}</Text>
                            <Text style={styles.studentMeta}>
                              {(() => {
                                const parts = [];
                                if (s.course) parts.push(s.course);
                                if (s.yearLevel) parts.push(formatYearLabel(s.yearLevel));
                                if (s.section) parts.push(s.section);
                                return parts.join(' - ') || '—';
                              })()}
                            </Text>
                          </View>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )
                )}
              </View>
            )}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>

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
  contentContainer: { padding: 16, paddingBottom: 120, paddingTop: 120, flexGrow: 1 },
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
  emptySubtext: { fontSize: 12, color: '#6B7280', textAlign: 'center', lineHeight: 16, marginBottom: 12 },
  sectionTitle: { fontSize: 18, fontWeight: '900', color: '#0078cf', marginRight: 8, marginBottom: 4, marginTop: 8 },
  yearLevelSection: { marginTop: 4 },
  cardGrid: { 
    paddingHorizontal: 0,
    paddingBottom: 0,
    marginTop: 0,
    marginBottom: 0,
    width: '100%',
    alignSelf: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  yearCard: { 
    width: '48%',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'flex-start',
    justifyContent: 'flex-start',
    overflow: 'visible',
    marginVertical: 6,
    minHeight: 96,
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 4,
    elevation: 2,
    position: 'relative',
  },
  yearCardIconWrap: { 
    width: 36, 
    height: 36, 
    borderRadius: 8, 
    alignItems: 'center', 
    justifyContent: 'center', 
    marginBottom: 10 
  },
  yearCardNumber: {
    fontSize: 20,
    fontWeight: '800',
    color: '#004f89',
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
  studentRow: { 
    flexDirection: 'row', 
    alignItems: 'flex-start', 
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderBottomWidth: 1, 
    borderBottomColor: '#F3F4F6', 
    borderRadius: 6, 
    marginHorizontal: 2, 
    marginVertical: 2,
    backgroundColor: '#FFFFFF',
  },
  studentAvatar: { 
    width: 40, 
    height: 40, 
    borderRadius: 20, 
    backgroundColor: '#EFF6FF', 
    alignItems: 'center', 
    justifyContent: 'center', 
    marginRight: 12 
  },
  studentInitials: { 
    fontSize: 14, 
    fontWeight: '700', 
    color: '#2563EB' 
  },
  studentName: { 
    fontSize: 15, 
    fontWeight: '700', 
    color: '#111827',
    marginBottom: 2,
  },
  studentMeta: { 
    color: '#6B7280', 
    fontSize: 12,
  },
  modalOverlayCenter: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
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

export default StudentAttendance;

