import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, TextInput, Modal, KeyboardAvoidingView, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect, useRoute } from '@react-navigation/native';
import { collection, query, where, getDocs, orderBy, limit, doc, setDoc, getDoc, deleteDoc, updateDoc, arrayUnion, onSnapshot } from 'firebase/firestore';
import { db } from '../../utils/firebaseConfig';
import { deleteAllUserConversations } from '../../utils/conversationUtils';
import { withNetworkErrorHandling, getNetworkErrorMessage } from '../../utils/networkErrorHandler';
import AdminTopHeader from './AdminTopHeader';
const AboutLogo = require('../../assets/logo.png');

const StudentManagement = () => {
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
  const [yearNoQRCounts, setYearNoQRCounts] = useState({ y1: 0, y2: 0, y3: 0, y4: 0 });
  const [courseNoQRCounts, setCourseNoQRCounts] = useState({});

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
  const [isSearching, setIsSearching] = useState(false);
  const [searchStudentName, setSearchStudentName] = useState('');
  const [detailStudent, setDetailStudent] = useState(null);
  const [listItems, setListItems] = useState([]);
  const [listLoading, setListLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [changing, setChanging] = useState(false);
  const [progressDone, setProgressDone] = useState(0);
  const [progressTotal, setProgressTotal] = useState(0);
  const [feedbackVisible, setFeedbackVisible] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState('');
  const [feedbackSuccess, setFeedbackSuccess] = useState(false);
  const [feedbackTitle, setFeedbackTitle] = useState('');
  const [feedbackTextColor, setFeedbackTextColor] = useState('#050505');
  const [networkErrorVisible, setNetworkErrorVisible] = useState(false);
  const [networkErrorTitle, setNetworkErrorTitle] = useState('');
  const [networkErrorMessage, setNetworkErrorMessage] = useState('');
  const [networkErrorColor, setNetworkErrorColor] = useState('#DC2626');
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [isChangingQR, setIsChangingQR] = useState(false);
  const [changeQrConfirmVisible, setChangeQrConfirmVisible] = useState(false);
  const [deleteStudentConfirmVisible, setDeleteStudentConfirmVisible] = useState(false);
  const [changingQr, setChangingQr] = useState(false);
  const [deletingStudent, setDeletingStudent] = useState(false);
  const [studentsWithQR, setStudentsWithQR] = useState(new Set());
  const [searchResultsQRStatus, setSearchResultsQRStatus] = useState(new Map()); // Map<studentId, {hasQR, isNew}>
  const [listItemsQRStatus, setListItemsQRStatus] = useState(new Map()); // Map<studentId, {hasQR, isNew}> for filtered list
  const countsRef = useRef({ yearCounts: null, courseCounts: null });
  const searchStateRef = useRef({ isSearching: false, searchQuery: '', navigatingToProfile: false }); // Preserve search state across navigation
  const adminCardPalette = {
    cardBg: '#FFFFFF',
    borderColor: '#E5E7EB',
    iconBg: 'rgba(0,79,137,0.12)',
    accentColor: '#004f89',
    labelColor: '#004f89',
  };
  const DEFAULT_COURSES = ['BSAIS', 'BSBA', 'BSCRIM', 'BSHM', 'BSIT', 'BSTM', 'BTLED'];

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
    // Update ref to preserve state (preserve navigatingToProfile flag)
    searchStateRef.current = { 
      isSearching: active, 
      searchQuery: String(q),
      navigatingToProfile: searchStateRef.current?.navigatingToProfile || false
    };
  }, [route?.params?.searchActive, route?.params?.searchQuery]);

  // Check QR status for search results when search query changes
  useEffect(() => {
    if (!isSearching || !searchStudentName.trim()) {
      setSearchResultsQRStatus(new Map());
      return;
    }
    
    let isCancelled = false;
    
    const checkQRStatuses = async () => {
      const q = String(searchStudentName || '').trim().toLowerCase();
      if (!q) {
        if (!isCancelled) setSearchResultsQRStatus(new Map());
        return;
      }
      
      // Use current students value at the time of execution
      const currentStudents = students;
      const results = currentStudents.filter(s => {
        const first = String(s.firstName || '').toLowerCase();
        const last = String(s.lastName || '').toLowerCase();
        const full = `${first} ${last}`.trim();
        return first.includes(q) || last.includes(q) || full.includes(q);
      });
      
      const statusMap = new Map();
      for (const student of results) {
        if (isCancelled) break;
        const status = await getQRCodeStatus(student);
        statusMap.set(student.id, status);
      }
      
      if (!isCancelled) {
        setSearchResultsQRStatus(statusMap);
      }
    };
    
    // Add a small delay to debounce rapid changes
    const timeoutId = setTimeout(() => {
      checkQRStatuses();
    }, 300);
    
    return () => {
      isCancelled = true;
      clearTimeout(timeoutId);
    };
  }, [isSearching, searchStudentName]); // Removed 'students' from dependencies

  const loadAllStudents = async () => {
    setLoading(true);
    setError(null);
    try {
      const usersRef = collection(db, 'users');
      const q = query(usersRef, where('role', '==', 'student'));
      const snap = await getDocs(q);
      const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      console.log('Loaded students with fields:', items.length > 0 ? Object.keys(items[0]) : 'No students');
      console.log('Sample student data:', items.length > 0 ? items[0] : 'No students');
      setStudents(items);
    } catch (e) {
      console.error('Error loading students:', e);
      // Only show network error modal for actual network errors
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

  // Real-time listener: refresh list when any student document changes (e.g., verification)
  useEffect(() => {
    const studentsQuery = query(collection(db, 'users'), where('role', '==', 'student'));
    let firstSnapshot = true;

    const unsubscribe = onSnapshot(
      studentsQuery,
      (snap) => {
        const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        setStudents(items);
        if (firstSnapshot) {
          setLoading(false);
          firstSnapshot = false;
        }
      },
      (error) => {
        console.error('Error listening to students collection:', error);
        setError('Failed to load students');
        setLoading(false);
      }
    );

    return () => {
      unsubscribe?.();
    };
  }, []);

  // Update listItems when students change and we're viewing a filtered list
  useEffect(() => {
    if (selectedYear) {
      // Filter and sort students for the selected year
      const yearStudents = students.filter(s => {
        const str = String(s.yearLevel ?? '').toLowerCase();
        const n = parseInt(str, 10);
        const yr = !isNaN(n) ? n : (/1|first/.test(str) ? 1 : /2|second/.test(str) ? 2 : /3|third/.test(str) ? 3 : /4|fourth/.test(str) ? 4 : null);
        return yr === selectedYear;
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
    } else if (selectedCourse) {
      // Filter and sort students for the selected course
      const target = String(selectedCourse || '').trim().toLowerCase();
      const courseStudents = students.filter(s => {
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
    }
  }, [students, selectedYear, selectedCourse]);

  // Always refresh when screen becomes active
  useFocusEffect(
    React.useCallback(() => {
      loadAllStudents();
      
      // If we're coming back from StudentProfile, exit search mode and show normal list
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
      
      return () => {
        // Tab bar visibility is handled by navigation structure
      };
    }, [navigation, route?.params])
  );

  useEffect(() => {
    // compute counts per year and per course when students change
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
    const courseMap = new Map(); // key -> { label, count }
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
    // Merge with defaults to ensure all courses appear even if zero students
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

    // Pass counts to AdminTopHeader via route params
    // Use a ref to prevent infinite loops from navigation.setParams
    const prevYearCounts = JSON.stringify(countsRef.current.yearCounts);
    const prevCourseCounts = JSON.stringify(countsRef.current.courseCounts);
    const newYearCounts = JSON.stringify(nextYears);
    const newCourseCounts = JSON.stringify(nextCourseCounts);
    
    if (prevYearCounts !== newYearCounts || prevCourseCounts !== newCourseCounts) {
      try {
        navigation.setParams?.({
          yearCounts: nextYears,
          courseCounts: nextCourseCounts,
        });
        countsRef.current = { yearCounts: nextYears, courseCounts: nextCourseCounts };
      } catch {}
    }
  }, [students]); // Removed navigation from dependencies

  // Calculate no QR counts per year and course
  useEffect(() => {
    if (students.length === 0) {
      setYearNoQRCounts({ y1: 0, y2: 0, y3: 0, y4: 0 });
      setCourseNoQRCounts({});
      return;
    }

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

    const checkAllQRStatuses = async () => {
      const nextYearNoQR = { y1: 0, y2: 0, y3: 0, y4: 0 };
      const courseNoQRMap = new Map();

      // Initialize course map with default courses
      DEFAULT_COURSES.forEach((c) => {
        courseNoQRMap.set(c.toLowerCase(), 0);
      });

      // Check QR status for each student
      for (const student of students) {
        const status = await getQRCodeStatus(student);
        if (!status.hasQR) {
          // Count by year
          const yr = normalizeYear(student.yearLevel);
          if (yr === 1) nextYearNoQR.y1 += 1;
          else if (yr === 2) nextYearNoQR.y2 += 1;
          else if (yr === 3) nextYearNoQR.y3 += 1;
          else if (yr === 4) nextYearNoQR.y4 += 1;

          // Count by course
          const rawCourse = String(student.course || '').trim();
          if (rawCourse) {
            const key = rawCourse.toLowerCase();
            const current = courseNoQRMap.get(key) || 0;
            courseNoQRMap.set(key, current + 1);
          }
        }
      }

      // Convert course map to object
      const nextCourseNoQR = {};
      courseNoQRMap.forEach((count, key) => {
        nextCourseNoQR[key] = count;
      });

      setYearNoQRCounts(nextYearNoQR);
      setCourseNoQRCounts(nextCourseNoQR);
    };

    checkAllQRStatuses();
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
      'BSAIS': 'calculator-outline',      // Accountancy Information Systems
      'BSBA': 'briefcase-outline',        // Business Administration
      'BSCRIM': 'shield-outline',         // Criminology
      'BSHM': 'restaurant-outline',       // Hospitality Management
      'BSIT': 'laptop-outline',           // Information Technology
      'BSTM': 'airplane-outline',         // Tourism Management
      'BTLED': 'construct-outline',       // Technology and Livelihood Education
    };
    return iconMap[courseUpper] || 'school-outline'; // Default icon for unknown courses
  };

  // Unverified = newly created / not yet approved
  const isUnverifiedStudent = (student) => {
    // Check verificationStatus: 'pending' means waiting for verification
    const verificationStatus = String(student?.verificationStatus || '').trim().toLowerCase();
    if (verificationStatus === 'pending') return true;
    // If verificationStatus exists and is not pending, treat as verified
    if (verificationStatus) return false;

    // Fallback: only use isVerify when verificationStatus is absent (legacy data)
    if (student && Object.prototype.hasOwnProperty.call(student, 'isVerify')) {
      return student.isVerify === false;
    }
    // If field is missing, treat as verified (for older data)
    return false;
  };

  const fetchStudentsForYear = async (year) => {
    setListLoading(true);
    try {
      const usersRef = collection(db, 'users');
      const q = query(usersRef, where('role', '==', 'student'));
      const snap = await getDocs(q);
      const allStudents = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      
      // Filter by year level only
      const yearStudents = allStudents.filter(s => {
        const str = String(s.yearLevel ?? '').toLowerCase();
        const n = parseInt(str, 10);
        const yr = !isNaN(n) ? n : (/1|first/.test(str) ? 1 : /2|second/.test(str) ? 2 : /3|third/.test(str) ? 3 : /4|fourth/.test(str) ? 4 : null);
        return yr === year;
      });
      // Sort by last name, then first name
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
      // Only show network error modal for actual network errors
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
      // Only show network error modal for actual network errors
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

  const toggleSelect = (studentId) => {
    if (!isSelectionMode) return; // Only allow selection in selection mode
    
    // Find the student to check if they're unverified
    const student = listItems.find(s => s.id === studentId) || 
                    students.find(s => s.id === studentId);
    
    // Prevent selecting unverified students
    if (student && isUnverifiedStudent(student)) {
      return;
    }
    
    const newSelected = new Set(selectedIds);
    if (newSelected.has(studentId)) {
      newSelected.delete(studentId);
    } else {
      newSelected.add(studentId);
    }
    setSelectedIds(newSelected);
  };

  const handleRowPress = (student) => {
    if (isSelectionMode) {
      // Don't allow selecting unverified students
      if (!isUnverifiedStudent(student)) {
        toggleSelect(student.id);
      }
    } else {
      openQrDetail(student);
    }
  };

  const handleRowLongPress = (student) => {
    // Don't allow activating selection mode for unverified students
    if (isUnverifiedStudent(student)) {
      return;
    }
    
    // Activate selection mode on long press
    if (!isSelectionMode) {
      setIsSelectionMode(true);
      setSelectedIds(new Set([student.id]));
    } else {
      toggleSelect(student.id);
    }
  };

  const hasStudentsWithoutQR = () => {
    if (isSearching && searchStudentName.trim()) {
      // In search mode, check against searchResultsQRStatus
      return Array.from(selectedIds).some(id => {
        const status = searchResultsQRStatus.get(id);
        return !status || !status.hasQR;
      });
    }
    return Array.from(selectedIds).some(id => !studentsWithQR.has(id));
  };

  // Get confirmation modal text based on QR status
  const getConfirmationModalText = () => {
    if (selectedIds.size === 0) return { title: 'Change QR Codes', message: 'Change QR codes for selected students?', buttonText: 'Change' };
    
    let hasNoQR = false;
    let hasQR = false;
    
    if (isSearching && searchStudentName.trim()) {
      // In search mode, check against searchResultsQRStatus
      for (const id of selectedIds) {
        const status = searchResultsQRStatus.get(id);
        if (!status || !status.hasQR) {
          hasNoQR = true;
        } else {
          hasQR = true;
        }
      }
    } else {
      // In normal list mode
      for (const id of selectedIds) {
        if (studentsWithQR.has(id)) {
          hasQR = true;
        } else {
          hasNoQR = true;
        }
      }
    }
    
    const isPlural = selectedIds.size > 1;
    const codeText = isPlural ? 'Codes' : 'Code';
    
    if (hasNoQR && hasQR) {
      // Mixed: some have QR, some don't
      return {
        title: 'Generate/Change QR Codes',
        message: `Generate QR codes for students without QR and change QR codes for students with existing QR codes?`,
        buttonText: 'Generate/Change'
      };
    } else if (hasNoQR) {
      // All have no QR
      return {
        title: `Generate QR ${codeText}`,
        message: `Generate QR ${codeText.toLowerCase()} for ${selectedIds.size} selected ${selectedIds.size === 1 ? 'student' : 'students'}?`,
        buttonText: 'Generate'
      };
    } else {
      // All have QR
      return {
        title: `Change QR ${codeText}`,
        message: `Change QR ${codeText.toLowerCase()} for ${selectedIds.size} selected ${selectedIds.size === 1 ? 'student' : 'students'}?`,
        buttonText: 'Change'
      };
    }
  };

  const getStudentsWithQR = () => {
    return listItems.filter(student => studentsWithQR.has(student.id));
  };

  const isAllSelected = () => {
    const studentsWithQRList = getStudentsWithQR();
    return studentsWithQRList.length > 0 && selectedIds.size === studentsWithQRList.length;
  };

  const toggleSelectionMode = () => {
    if (isSelectionMode) {
      // Exit selection mode
      setIsSelectionMode(false);
      setSelectedIds(new Set());
    } else {
      // Enter selection mode
      setIsSelectionMode(true);
    }
  };

  const selectAllStudents = () => {
    // Only select verified students (exclude unverified ones)
    const verifiedStudentIds = new Set(
      listItems
        .filter(s => !isUnverifiedStudent(s))
        .map(s => s.id)
    );
    const allSelected = verifiedStudentIds.size > 0 && selectedIds.size === verifiedStudentIds.size && 
                       Array.from(verifiedStudentIds).every(id => selectedIds.has(id));
    
    if (allSelected) {
      // Unselect all
      setSelectedIds(new Set());
    } else {
      // Select all verified students only
      setSelectedIds(verifiedStudentIds);
    }
  };

  const openQrDetail = (student) => {
    // Mark that we're navigating to StudentProfile so we can exit search mode on return
    searchStateRef.current.navigatingToProfile = true;
    navigation.navigate('StudentProfile', { 
      student,
    });
  };

  // Check if student has QR code
  const hasQRCode = async (student) => {
    try {
      const studentId = student?.studentId || student?.id;
      if (!studentId) return false;
      const qrQuery = query(collection(db, 'student_QRcodes'), where('studentId', '==', studentId));
      const qrSnapshot = await getDocs(qrQuery);
      return !qrSnapshot.empty;
    } catch {
      return false;
    }
  };

  // Check QR code status (no QR, new QR within 24h, or old QR)
  const getQRCodeStatus = async (student) => {
    try {
      const studentId = student?.studentId || student?.id;
      if (!studentId) return { hasQR: false, isNew: false };
      
      // Try direct document access first (studentId is the document ID)
      const qrDocRef = doc(db, 'student_QRcodes', String(studentId));
      const qrDoc = await getDoc(qrDocRef);
      
      if (!qrDoc.exists()) {
        // Fallback: query by studentId field
        const qrQuery = query(collection(db, 'student_QRcodes'), where('studentId', '==', studentId));
        const qrSnapshot = await getDocs(qrQuery);
        if (qrSnapshot.empty) {
          return { hasQR: false, isNew: false };
        }
        const qrData = qrSnapshot.docs[0].data();
        const generatedAt = qrData.generatedAt || qrData.createdAt;
        
        if (generatedAt) {
          const generatedTime = new Date(generatedAt).getTime();
          const now = Date.now();
          const hoursDiff = (now - generatedTime) / (1000 * 60 * 60);
          const isNew = hoursDiff <= 24;
          return { hasQR: true, isNew };
        }
        return { hasQR: true, isNew: false };
      }
      
      const qrData = qrDoc.data();
      const generatedAt = qrData.generatedAt || qrData.createdAt;
      
      if (generatedAt) {
        const generatedTime = new Date(generatedAt).getTime();
        const now = Date.now();
        const hoursDiff = (now - generatedTime) / (1000 * 60 * 60);
        const isNew = hoursDiff <= 24;
        return { hasQR: true, isNew };
      }
      
      return { hasQR: true, isNew: false };
    } catch (error) {
      // Silently return false on error to not break the UI
      console.warn('Error checking QR status:', error);
      return { hasQR: false, isNew: false };
    }
  };

  // Check QR codes for all students in the list
  const checkAllStudentsQR = async () => {
    if (listItems.length === 0) {
      setStudentsWithQR(new Set());
      setListItemsQRStatus(new Map());
      return;
    }
    
    const qrStatus = new Set();
    const statusMap = new Map();
    
    for (const student of listItems) {
      const status = await getQRCodeStatus(student);
      statusMap.set(student.id, status);
      if (status.hasQR) {
        qrStatus.add(student.id);
      }
    }
    
    setStudentsWithQR(qrStatus);
    setListItemsQRStatus(statusMap);
  };

  // Real-time listener for QR codes
  useEffect(() => {
    if (listItems.length === 0) {
      setStudentsWithQR(new Set());
      setListItemsQRStatus(new Map());
      return;
    }

    // Create a set of student IDs from listItems
    const studentIds = new Set(listItems.map(s => s.studentId || s.id));
    
    // Set up real-time listeners for each student's QR code
    const unsubscribeFunctions = [];
    
    const checkQRStatuses = async () => {
      const qrStatus = new Set();
      const statusMap = new Map();
      
      for (const student of listItems) {
        const status = await getQRCodeStatus(student);
        statusMap.set(student.id, status);
        if (status.hasQR) {
          qrStatus.add(student.id);
        }
      }
      
      setStudentsWithQR(qrStatus);
      setListItemsQRStatus(statusMap);
    };

    // Initial check
    checkQRStatuses();

    // Set up listeners for each student's QR code document
    for (const student of listItems) {
      const studentId = student.studentId || student.id;
      if (!studentId) continue;

      const qrDocRef = doc(db, 'student_QRcodes', String(studentId));
      const unsubscribe = onSnapshot(qrDocRef, (snapshot) => {
        // When QR code changes, refresh all QR statuses
        checkQRStatuses();
      }, (error) => {
        // If document doesn't exist, that's fine - just refresh
        checkQRStatuses();
      });
      
      unsubscribeFunctions.push(unsubscribe);
    }

    return () => {
      unsubscribeFunctions.forEach(unsub => unsub());
    };
  }, [listItems.length]); // Only depend on length to prevent infinite loops

  // Intercept back navigation while drilled into a year list
  useEffect(() => {
    if (!selectedYear && !selectedCourse) {
      // Clear selected card title when returning to cards
      try {
        navigation.setParams?.({
          selectedCardTitle: null,
        });
      } catch {}
      return;
    }
    const unsubscribe = navigation.addListener('beforeRemove', (e) => {
      // If we're viewing a specific year, consume the back action and reset state instead
      e.preventDefault();
      setSelectedYear(null);
      setSelectedCourse(null);
      setSelectedIds(new Set());
      setIsSelectionMode(false);
      try {
        navigation.setParams?.({
          selectedCardTitle: null,
        });
      } catch {}
    });
    return unsubscribe;
  }, [navigation, selectedYear, selectedCourse]);

  // Note: Tab bar visibility is now handled by the navigation structure
  // StudentsTab is a separate stack screen that automatically hides the tab bar

  // Change QR code for a single student
  const changeStudentQR = async () => {
    if (!detailStudent) return;
    setChangingQr(true);
    try {
      const sid = String(detailStudent.studentId || detailStudent.id);
      const qrValue = `${sid}:${Date.now()}`;
      await setDoc(doc(db, 'student_QRcodes', sid), { studentId: sid, qrCodeUrl: qrValue }, { merge: true });
      // Notify student about QR change
      try {
        const studentAlertsRef = doc(db, 'student_alerts', sid);
        const notif = {
          id: `qr_changed_${sid}_${Date.now()}`,
          type: 'qr_changed',
          title: 'QR Code Changed',
          message: 'Your QR code has been changed by the administrator.',
          createdAt: new Date().toISOString(),
          status: 'unread',
          studentId: sid,
        };
        try {
          await updateDoc(studentAlertsRef, { items: arrayUnion(notif) });
        } catch {
          await setDoc(studentAlertsRef, { items: arrayUnion(notif) }, { merge: true });
        }
      } catch {}
      
      // Log activity with fresh student data
      try {
        const activityRef = doc(db, 'admin_activity_logs', 'global');
        const activitySnap = await getDoc(activityRef);
        const items = activitySnap.exists() ? (Array.isArray(activitySnap.data()?.items) ? activitySnap.data().items : []) : [];
        const id = `${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
        
        // Fetch fresh student data to ensure we have complete information
        let freshStudentData = detailStudent;
        try {
          // Try multiple approaches to get student data
          const studentId = detailStudent?.id || detailStudent?.studentId;
          console.log('Attempting to fetch student with ID:', studentId);
          
          // First try: by document ID (user ID)
          let studentDoc = await getDoc(doc(db, 'users', studentId));
          
          // Second try: query by studentId field if first fails
          if (!studentDoc.exists() && detailStudent?.studentId) {
            console.log('Trying to find student by studentId field:', detailStudent.studentId);
            const q = query(collection(db, 'users'), where('studentId', '==', detailStudent.studentId));
            const querySnap = await getDocs(q);
            if (!querySnap.empty) {
              studentDoc = querySnap.docs[0];
              console.log('Found student by studentId query');
            }
          }
          
          if (studentDoc.exists()) {
            freshStudentData = { id: studentDoc.id, ...studentDoc.data() };
            console.log('=== FRESH STUDENT DATA DEBUG ===');
            console.log('Fresh student data for activity log:', JSON.stringify(freshStudentData, null, 2));
            console.log('Available keys:', Object.keys(freshStudentData));
            console.log('Course field:', freshStudentData.course, 'Type:', typeof freshStudentData.course);
            console.log('Section field:', freshStudentData.section, 'Type:', typeof freshStudentData.section);
            console.log('=== END FRESH DATA DEBUG ===');
          } else {
            console.log('No student document found, using existing data');
          }
        } catch (fetchError) {
          console.log('Could not fetch fresh student data, using existing:', fetchError);
        }
        
        const formatYear = (val) => {
          const str = String(val ?? '').trim();
          const num = parseInt(str, 10);
          if (num === 1) return '1st Year';
          if (num === 2) return '2nd Year';
          if (num === 3) return '3rd Year';
          if (num === 4) return '4th Year';
          return str || '';
        };
        const newItem = {
          id,
          type: 'qr_generated',
          title: 'QR Code Changed',
          message: `Changed QR code for ${freshStudentData?.firstName} ${freshStudentData?.lastName} (${formatYear(freshStudentData?.yearLevel)})`,
          createdAt: new Date().toISOString(),
          status: 'unread',
          students: [{
            id: freshStudentData?.id,
            firstName: freshStudentData?.firstName,
            lastName: freshStudentData?.lastName,
            studentId: freshStudentData?.studentId,
            yearLevel: freshStudentData?.yearLevel,
            course: freshStudentData?.course || 'BSIT', // Temporary fallback for testing
            section: freshStudentData?.section || 'A'   // Temporary fallback for testing
          }]
        };
        await setDoc(activityRef, { items: [newItem, ...items] }, { merge: true });
      } catch (logError) {
        console.log('Failed to log activity:', logError);
      }
      
      setFeedbackMessage('QR code changed successfully.');
      setFeedbackTitle('Success');
      setFeedbackTextColor('#16A34A');
      setFeedbackSuccess(true);
      
      // Refresh the student list immediately
      if (selectedYear) {
        await fetchStudentsForYear(selectedYear);
      } else if (selectedCourse) {
        await fetchStudentsForCourse(selectedCourse);
      } else {
        await loadAllStudents();
      }
      
      // Also refresh the main students list
      await loadAllStudents();
    } catch (e) {
      console.error('Error changing QR code:', e);
      // Only show network error modal for actual network errors
      if (e?.code?.includes('unavailable') || e?.code?.includes('network') || e?.message?.toLowerCase().includes('network')) {
        const errorInfo = getNetworkErrorMessage({ type: 'unstable_connection', message: e.message });
        setNetworkErrorTitle(errorInfo.title);
        setNetworkErrorMessage(errorInfo.message);
        setNetworkErrorColor(errorInfo.color);
        setNetworkErrorVisible(true);
        setTimeout(() => setNetworkErrorVisible(false), 5000);
      } else {
        setFeedbackMessage(`Failed to change QR code: ${e.message}`);
        setFeedbackTitle('Error');
        setFeedbackTextColor('#DC2626');
        setFeedbackSuccess(false);
      }
    } finally {
      setChangingQr(false);
      setChangeQrConfirmVisible(false);
      setFeedbackVisible(true);
      setTimeout(() => {
        setFeedbackVisible(false);
        // Reset to normal state
        setSelectedYear(null);
        setSelectedCourse(null);
        setSelectedIds(new Set());
        setIsSelectionMode(false);
        setDetailStudent(null);
      }, 1500);
    }
  };

  // Delete student account
  const deleteStudentAccount = async () => {
    if (!detailStudent) return;
    setDeletingStudent(true);
    try {
      const sid = detailStudent?.id || detailStudent?.uid;
      if (!sid) throw new Error('Missing student id');

      console.log('Starting deletion for student:', sid, detailStudent);

      // Step 1: Skip Firebase Auth user deletion (no cloud function available)
      // Note: Firebase Auth users will remain but won't be able to access the system
      // since their Firestore data will be deleted
      console.log('Skipping Firebase Auth user deletion - no cloud function available');

      // Step 2: Delete all related documents from Firestore collections
      const targets = Array.from(new Set([sid, detailStudent?.uid, detailStudent?.id, detailStudent?.studentId].filter(Boolean)));
      console.log('Deleting documents for targets:', targets);

      // Delete student_QRcodes by document ID
      try {
        const qrDocRef = doc(db, 'student_QRcodes', sid);
        await deleteDoc(qrDocRef);
        console.log('✅ Deleted student_QRcodes for:', sid);
      } catch (e) {
        console.log('No QR code found for student:', sid);
      }

      // Delete from all collections using different field names
      for (const targetStudentId of targets) {
        console.log('Processing target:', targetStudentId);

        // student_alerts - delete document directly by student ID (document name is based on users collection document name)
        try {
          console.log(`🔍 Deleting student_alerts document directly by ID: ${targetStudentId}`);
          const studentAlertDocRef = doc(db, 'student_alerts', targetStudentId);
          await deleteDoc(studentAlertDocRef);
          console.log(`✅ Deleted student_alerts document: ${targetStudentId}`);
        } catch (e) {
          console.log('❌ Error deleting student_alerts document directly:', e);
          console.log('ℹ️ Document might not exist or have different ID structure');
        }

        // linked_parents - delete document directly by student ID (document name is based on users collection document name)
        try {
          console.log(`🔍 Deleting linked_parents document directly by ID: ${targetStudentId}`);
          const linkedParentsDocRef = doc(db, 'linked_parents', targetStudentId);
          await deleteDoc(linkedParentsDocRef);
          console.log(`✅ Deleted linked_parents document: ${targetStudentId}`);
        } catch (e) {
          console.log('❌ Error deleting linked_parents document directly:', e);
          console.log('ℹ️ Document might not exist or have different ID structure');
        }

        // parent_student_links - use correct field names based on actual structure
        try {
          const queries = [
            query(collection(db, 'parent_student_links'), where('studentId', '==', targetStudentId)),
            query(collection(db, 'parent_student_links'), where('studentIdNumber', '==', targetStudentId)),
          ];
          
          for (const q of queries) {
            const snap = await getDocs(q);
            if (snap.docs.length > 0) {
              const deletePromises = snap.docs.map(d => deleteDoc(d.ref));
              await Promise.all(deletePromises);
              console.log(`✅ Deleted ${snap.docs.length} parent_student_links for:`, targetStudentId);
            }
          }
        } catch (e) {
          console.log('Error deleting parent_student_links:', e);
        }

        // conversations - delete all conversations involving this student
        try {
          console.log(`🔍 Deleting all conversations for student: ${targetStudentId}`);
          
          // Collect all possible student identifiers
          const allStudentIds = [
            targetStudentId,
            detailStudent?.uid,
            detailStudent?.id,
            detailStudent?.studentId,
            detailStudent?.studentIdNumber
          ].filter(Boolean);
          
          // Delete all conversations for this student (handles both parent-student and student-student conversations)
          await deleteAllUserConversations(targetStudentId, allStudentIds);
          
          console.log(`✅ Completed conversation deletion for student`);
        } catch (e) {
          console.log('Error deleting conversations:', e);
        }

        // linked_students - use correct field names based on actual structure
        try {
          // Query for documents that reference this student
          const queries = [
            query(collection(db, 'linked_students'), where('studentId', '==', targetStudentId)),
            query(collection(db, 'linked_students'), where('studentIdNumber', '==', targetStudentId)),
          ];
          
          for (const q of queries) {
            const snap = await getDocs(q);
            if (snap.docs.length > 0) {
              const deletePromises = snap.docs.map(d => deleteDoc(d.ref));
              await Promise.all(deletePromises);
              console.log(`✅ Deleted ${snap.docs.length} linked_students for:`, targetStudentId);
            }
          }
        } catch (e) {
          console.log('Error deleting linked_students:', e);
        }

        // schedules - use correct field names based on actual structure
        try {
          const queries = [
            query(collection(db, 'schedules'), where('studentId', '==', targetStudentId)),
            query(collection(db, 'schedules'), where('studentIdNumber', '==', targetStudentId)),
          ];
          
          for (const q of queries) {
            const snap = await getDocs(q);
            if (snap.docs.length > 0) {
              const deletePromises = snap.docs.map(d => deleteDoc(d.ref));
              await Promise.all(deletePromises);
              console.log(`✅ Deleted ${snap.docs.length} schedules for:`, targetStudentId);
            }
          }
        } catch (e) {
          console.log('Error deleting schedules:', e);
        }
      }

      // Delete parent_alerts - use correct field names based on actual structure
      try {
        const queries = [
          query(collection(db, 'parent_alerts'), where('studentId', '==', sid)),
          query(collection(db, 'parent_alerts'), where('studentId', '==', detailStudent?.studentId)),
          query(collection(db, 'parent_alerts'), where('studentIdNumber', '==', sid)),
          query(collection(db, 'parent_alerts'), where('studentIdNumber', '==', detailStudent?.studentId)),
        ];
        
        for (const q of queries) {
          const snap = await getDocs(q);
          if (snap.docs.length > 0) {
            const deletePromises = snap.docs.map(d => deleteDoc(d.ref));
            await Promise.all(deletePromises);
            console.log(`✅ Deleted ${snap.docs.length} parent_alerts for:`, sid);
          }
        }
      } catch (e) {
        console.log('Error deleting parent_alerts:', e);
      }

      // Step 3: Delete the main user document (MOST IMPORTANT)
      try {
        await deleteDoc(doc(db, 'users', sid));
        console.log('✅ Deleted main user document for:', sid);
      } catch (userError) {
        console.error('Failed to delete main user document:', userError);
        throw new Error(`Failed to delete user document: ${userError.message}`);
      }

      // Step 4: Log activity
      try {
        const activityRef = doc(db, 'admin_activity_logs', 'global');
        const activitySnap = await getDoc(activityRef);
        const items = activitySnap.exists() ? (Array.isArray(activitySnap.data()?.items) ? activitySnap.data().items : []) : [];
        const id = `${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
        const newItem = {
          id,
          type: 'student_deleted',
          title: 'Student Account Deleted',
          message: `Deleted student account: ${detailStudent?.firstName} ${detailStudent?.lastName} (${detailStudent?.studentId}).`,
          createdAt: new Date().toISOString(),
          status: 'unread',
          student: {
            id: detailStudent?.id,
            firstName: detailStudent?.firstName,
            lastName: detailStudent?.lastName,
            studentId: detailStudent?.studentId,
          }
        };
        await setDoc(activityRef, { items: [newItem, ...items] }, { merge: true });
        console.log('✅ Activity logged successfully');
      } catch (logError) {
        console.log('Activity logging failed (non-critical):', logError);
      }

      setFeedbackMessage('Student account deleted successfully.');
      setFeedbackTitle('Success');
      setFeedbackTextColor('#16A34A');
      setFeedbackSuccess(true);
      
      // Refresh the student list immediately
      if (selectedYear) {
        await fetchStudentsForYear(selectedYear);
      } else if (selectedCourse) {
        await fetchStudentsForCourse(selectedCourse);
      } else {
        await loadAllStudents();
      }
      
      // Also refresh the main students list
      await loadAllStudents();
    } catch (e) {
      console.error('Error deleting student account:', e);
      // Only show network error modal for actual network errors
      if (e?.code?.includes('unavailable') || e?.code?.includes('network') || e?.message?.toLowerCase().includes('network')) {
        const errorInfo = getNetworkErrorMessage({ type: 'unstable_connection', message: e.message });
        setNetworkErrorTitle(errorInfo.title);
        setNetworkErrorMessage(errorInfo.message);
        setNetworkErrorColor(errorInfo.color);
        setNetworkErrorVisible(true);
        setTimeout(() => setNetworkErrorVisible(false), 5000);
      } else {
        setFeedbackMessage(`Failed to delete student account: ${e.message}`);
        setFeedbackTitle('Error');
        setFeedbackTextColor('#DC2626');
        setFeedbackSuccess(false);
      }
    } finally {
      setDeletingStudent(false);
      setDeleteStudentConfirmVisible(false);
      setFeedbackVisible(true);
      setTimeout(() => {
        setFeedbackVisible(false);
        // Reset to normal state
        setSelectedYear(null);
        setSelectedCourse(null);
        setSelectedIds(new Set());
        setDetailStudent(null);
      }, 1500);
    }
  };

  // Change QR codes for selected students
  const changeSelectedQRCodes = async () => {
    if (selectedIds.size === 0) return;
    setChanging(true);
    setProgressDone(0);
    setProgressTotal(selectedIds.size);
    try {
      let done = 0;
      // Use search results if in search mode, otherwise use listItems
      const sourceList = isSearching && searchStudentName.trim() 
        ? (() => {
            const q = String(searchStudentName || '').trim().toLowerCase();
            let studentsToSearch = [];
            if (selectedYear) {
              studentsToSearch = students.filter(s => {
                const str = String(s.yearLevel ?? '').toLowerCase();
                const n = parseInt(str, 10);
                const yr = !isNaN(n) ? n : (/1|first/.test(str) ? 1 : /2|second/.test(str) ? 2 : /3|third/.test(str) ? 3 : /4|fourth/.test(str) ? 4 : null);
                return yr === selectedYear;
              });
            } else if (selectedCourse) {
              const target = String(selectedCourse || '').trim().toLowerCase();
              studentsToSearch = students.filter(s => {
                const c = String(s.course || '').trim().toLowerCase();
                return c === target;
              });
            }
            return studentsToSearch.filter(s => {
              const first = String(s.firstName || '').toLowerCase();
              const last = String(s.lastName || '').toLowerCase();
              const full = `${first} ${last}`.trim();
              return (first.includes(q) || last.includes(q) || full.includes(q)) && selectedIds.has(s.id);
            });
          })()
        : listItems.filter(s => selectedIds.has(s.id));
      const selectedStudents = sourceList;
      
      for (const student of selectedStudents) {
        try {
          const studentId = String(student.studentId || student.id);
          if (!studentId) continue;
          
          const hasQR = studentsWithQR.has(student.id);
          
          // Delete existing QR code if it exists
          if (hasQR) {
            const qrQuery = query(collection(db, 'student_QRcodes'), where('studentId', '==', studentId));
            const qrSnapshot = await getDocs(qrQuery);
            for (const docSnapshot of qrSnapshot.docs) {
              await deleteDoc(docSnapshot.ref);
            }
          }
          
          // Generate new QR code with timestamp
          const qrValue = `${studentId}:${Date.now()}`;
          const newQRData = {
            studentId: studentId,
            qrCodeUrl: qrValue,
            firstName: student.firstName,
            lastName: student.lastName,
            course: student.course,
            yearLevel: student.yearLevel,
            section: student.section,
            generatedAt: new Date().toISOString(),
            generatedBy: 'admin'
          };
          
          // Use studentId as document ID for consistency
          await setDoc(doc(db, 'student_QRcodes', studentId), newQRData);
          // Notify student
          try {
            const studentAlertsRef = doc(db, 'student_alerts', studentId);
            const notif = {
              id: `qr_${hasQR ? 'changed' : 'generated'}_${studentId}_${Date.now()}`,
              type: hasQR ? 'qr_changed' : 'qr_generated',
              title: hasQR ? 'QR Code Changed' : 'QR Code Generated',
              message: hasQR ? 'Your QR code has been changed by the administrator.' : 'Your QR code has been generated by the administrator.',
              createdAt: new Date().toISOString(),
              status: 'unread',
              studentId,
            };
            try {
              await updateDoc(studentAlertsRef, { items: arrayUnion(notif) });
            } catch {
              await setDoc(studentAlertsRef, { items: arrayUnion(notif) }, { merge: true });
            }
          } catch {}
          
          done++;
          setProgressDone(done);
        } catch (error) {
          console.error('Error changing QR for student:', student.firstName, error);
        }
      }
      
      // Log activity with fresh student data
      try {
        const activityRef = doc(db, 'admin_activity_logs', 'global');
        const activitySnap = await getDoc(activityRef);
        const items = activitySnap.exists() ? (Array.isArray(activitySnap.data()?.items) ? activitySnap.data().items : []) : [];
        const id = `${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
        
        // Fetch fresh student data for all selected students
        const freshStudentsData = [];
        for (const student of selectedStudents) {
          try {
            const studentDoc = await getDoc(doc(db, 'users', student.id));
            if (studentDoc.exists()) {
              const freshData = { id: studentDoc.id, ...studentDoc.data() };
              console.log('=== BULK FRESH STUDENT DATA DEBUG ===');
              console.log('Fresh student data for bulk activity log:', JSON.stringify(freshData, null, 2));
              console.log('Available keys:', Object.keys(freshData));
              console.log('Course:', freshData.course, 'Section:', freshData.section);
              console.log('=== END BULK FRESH DATA DEBUG ===');
              freshStudentsData.push(freshData);
            } else {
              console.log('Student document does not exist for ID:', student.id);
              freshStudentsData.push(student); // fallback to existing data
            }
          } catch (fetchError) {
            console.log('Could not fetch fresh data for student:', student.id, fetchError);
            freshStudentsData.push(student); // fallback to existing data
          }
        }
        
        const formatYear = (val) => {
          const str = String(val ?? '').trim();
          const num = parseInt(str, 10);
          if (num === 1) return '1st Year';
          if (num === 2) return '2nd Year';
          if (num === 3) return '3rd Year';
          if (num === 4) return '4th Year';
          return str || '';
        };
        const multiYear = selectedYear ? formatYear(selectedYear) : '';
        const multiCourse = selectedCourse ? selectedCourse : '';
        const contextLabel = multiYear || multiCourse;
        const hasNoQR = hasStudentsWithoutQR();
        const message = selectedIds.size === 1 && freshStudentsData.length > 0
          ? `${hasNoQR ? 'Generated' : 'Changed'} QR code for ${freshStudentsData[0].firstName} ${freshStudentsData[0].lastName} (${formatYear(freshStudentsData[0].yearLevel)})`
          : `${hasNoQR ? 'Generated/Changed' : 'Changed'} QR codes for ${selectedIds.size} student${selectedIds.size === 1 ? '' : 's'}${contextLabel ? ` (${contextLabel})` : ''}`;
        const newItem = {
          id,
          type: 'qr_generated',
          title: selectedIds.size === 1 
            ? (hasNoQR ? 'QR Code Generated' : 'QR Code Changed')
            : (hasNoQR ? 'QR Codes Generated/Changed' : 'QR Codes Changed'),
          message,
          createdAt: new Date().toISOString(),
          status: 'unread',
          students: freshStudentsData.map(s => ({
            id: s.id,
            firstName: s.firstName,
            lastName: s.lastName,
            studentId: s.studentId,
            yearLevel: s.yearLevel,
            course: s.course || 'BSIT', // Temporary fallback for testing
            section: s.section || 'A'   // Temporary fallback for testing
          }))
        };
        await setDoc(activityRef, { items: [newItem, ...items] }, { merge: true });
      } catch (logError) {
        console.log('Failed to log activity:', logError);
      }
      
      const hasNoQR = hasStudentsWithoutQR();
      setFeedbackMessage(`Successfully ${hasNoQR ? 'generated/changed' : 'changed'} QR codes for ${selectedIds.size} ${selectedIds.size === 1 ? 'student' : 'students'}`);
      setFeedbackTitle('Success');
      setFeedbackTextColor('#16A34A');
      setFeedbackSuccess(true);
      setFeedbackVisible(true);
      
      // Close the confirmation modal immediately
      setConfirmVisible(false);
      setIsChangingQR(false);
      
      // Refresh the main students list to update year counts
      await loadAllStudents();
      
      // If in search mode, refresh search results QR status
      // Use a small delay to ensure students state is updated
      if (isSearching && searchStudentName.trim()) {
        setTimeout(async () => {
          const q = String(searchStudentName || '').trim().toLowerCase();
          let studentsToSearch = [];
          if (selectedYear) {
            studentsToSearch = students.filter(s => {
              const str = String(s.yearLevel ?? '').toLowerCase();
              const n = parseInt(str, 10);
              const yr = !isNaN(n) ? n : (/1|first/.test(str) ? 1 : /2|second/.test(str) ? 2 : /3|third/.test(str) ? 3 : /4|fourth/.test(str) ? 4 : null);
              return yr === selectedYear;
            });
          } else if (selectedCourse) {
            const target = String(selectedCourse || '').trim().toLowerCase();
            studentsToSearch = students.filter(s => {
              const c = String(s.course || '').trim().toLowerCase();
              return c === target;
            });
          }
          const results = studentsToSearch.filter(s => {
            const first = String(s.firstName || '').toLowerCase();
            const last = String(s.lastName || '').toLowerCase();
            const full = `${first} ${last}`.trim();
            return first.includes(q) || last.includes(q) || full.includes(q);
          });
          const statusMap = new Map();
          for (const student of results) {
            const status = await getQRCodeStatus(student);
            statusMap.set(student.id, status);
          }
          setSearchResultsQRStatus(statusMap);
        }, 100);
      }
      
      // Reset selections and return to normal state after a short delay to allow UI to update
      setTimeout(() => {
        setSelectedIds(new Set());
        setIsSelectionMode(false);
      }, 500);
    } catch (e) {
      console.error('Error changing QR codes:', e);
      // Only show network error modal for actual network errors
      if (e?.code?.includes('unavailable') || e?.code?.includes('network') || e?.message?.toLowerCase().includes('network')) {
        const errorInfo = getNetworkErrorMessage({ type: 'unstable_connection', message: e.message });
        setNetworkErrorTitle(errorInfo.title);
        setNetworkErrorMessage(errorInfo.message);
        setNetworkErrorColor(errorInfo.color);
        setNetworkErrorVisible(true);
        setTimeout(() => setNetworkErrorVisible(false), 5000);
      } else {
        setFeedbackMessage(`Failed to change QR codes: ${e.message}`);
        setFeedbackTitle('Error');
        setFeedbackTextColor('#DC2626');
        setFeedbackSuccess(false);
        setFeedbackVisible(true);
      }
    } finally {
      setChanging(false);
      setProgressDone(0);
      setProgressTotal(0);
      // Auto-hide feedback modal after 2 seconds
      setTimeout(() => {
        setFeedbackVisible(false);
      }, 2000);
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
            contentContainerStyle={[
              styles.contentContainer,
              { paddingTop: isSearching ? 5 : 5 }
            ]}
            showsVerticalScrollIndicator={false}
            bounces={false}
            horizontal={false}
            keyboardShouldPersistTaps="handled"
          >
        {isSearching ? (
          <View 
            style={{ flex: 1 }}
          >
              {(() => {
                const q = String(searchStudentName || '').trim().toLowerCase();
                
                // Only search if a card is selected (year or course)
                if (!selectedYear && !selectedCourse) {
                  return (
                    <View style={{ flex: 1, padding: 16, paddingTop: 50, paddingBottom: 120 }}>
                    <View style={styles.centerContainer}>
                      <View style={styles.emptyCard}>
                        <View style={styles.emptyIconWrap}><Ionicons name="search" size={24} color="#2563EB" /></View>
                        <Text style={styles.emptyTitle}>Select a card first</Text>
                        <Text style={styles.emptySubtext}>Please select a year level or course card to search within.</Text>
                      </View>
                    </View>
                  </View>
                  );
                }
                
                // Filter students directly from the full students array based on selected card
                // This ensures we always get the correct students even if listItems is incorrect
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
                        <View style={[styles.legendDot, { backgroundColor: '#FEF3C7' }]} />
                        <Text style={styles.legendText}>Verification</Text>
                      </View>
                      <View style={styles.legendItem}>
                        <View style={[styles.legendDot, { backgroundColor: '#FEE2E2' }]} />
                        <Text style={styles.legendText}>No QR Code</Text>
                      </View>
                    </View>
                    <View style={styles.badgeContainer}>
                      {isSelectionMode && (
                        <TouchableOpacity style={styles.selectAllBadge} onPress={() => {
                          // Only select verified students (exclude unverified ones)
                          const verifiedResultIds = new Set(
                            results
                              .filter(r => !isUnverifiedStudent(r))
                              .map(r => r.id)
                          );
                          const allSelected = verifiedResultIds.size > 0 && selectedIds.size === verifiedResultIds.size && 
                                             Array.from(verifiedResultIds).every(id => selectedIds.has(id));
                          if (allSelected) {
                            setSelectedIds(new Set());
                          } else {
                            setSelectedIds(verifiedResultIds);
                          }
                        }}>
                          <Text style={styles.selectAllText}>Select All</Text>
                        </TouchableOpacity>
                      )}
                      <TouchableOpacity style={[styles.selectAllBadge, isSelectionMode && styles.selectAllBadgeActive]} onPress={toggleSelectionMode}>
                        <Text style={styles.selectAllText}>{isSelectionMode ? 'Cancel' : 'Select'}</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                  <View>
                    {results.map((s) => {
                      // Check verificationStatus first
                      const verificationStatus = String(s?.verificationStatus || '').toLowerCase();
                      const isPending = verificationStatus === 'pending';
                      const isVerified = verificationStatus === 'verified';
                      
                      const qrStatus = searchResultsQRStatus.get(s.id) || { hasQR: false, isNew: false };
                      const hasQR = qrStatus.hasQR;
                      
                      // Determine row style based on verificationStatus and QR code:
                      // - If pending: light yellow (studentRowVerify)
                      // - If verified but no QR: light red (studentRowNoQR)
                      // - If verified and has QR: normal or green if new
                      let rowStyle;
                      if (isPending) {
                        rowStyle = styles.studentRowVerify;
                      } else if (isVerified && !hasQR) {
                        rowStyle = styles.studentRowNoQR;
                      } else if (hasQR) {
                        rowStyle = qrStatus.isNew ? styles.studentRowNewQR : styles.studentRow;
                      } else {
                        // Fallback: treat as verified if no verificationStatus field (older data)
                        rowStyle = styles.studentRowNoQR;
                      }
                      
                      const pendingVerify = isPending;
                      
                      const isSelected = selectedIds.has(s.id);
                      const finalRowStyle = isSelected 
                        ? [rowStyle, styles.studentRowSelected]
                        : rowStyle;
                      
                      // In selection mode, unverified students cannot be selected
                      const isSelectable = !isSelectionMode || !pendingVerify;
                      
                      return (
                        <TouchableOpacity 
                          key={s.id} 
                          style={finalRowStyle}
                          activeOpacity={isSelectable ? 0.7 : 0.3}
                          onPress={() => {
                            if (isSelectable) {
                              handleRowPress(s);
                            }
                          }}
                          onLongPress={() => {
                            if (isSelectable) {
                              handleRowLongPress(s);
                            }
                          }}
                          disabled={!isSelectable}
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
                          {isPending && (
                            <View style={styles.verifyingBadge}>
                              <Text style={styles.verifyingBadgeText}>Verify</Text>
                            </View>
                          )}
                          {!isPending && !hasQR && (
                            <View style={styles.noQrBadge}>
                              <Text style={styles.noQrBadgeText}>No QR</Text>
                            </View>
                          )}
                          {isSelectionMode && pendingVerify && (
                            <View style={styles.unselectableIndicator}>
                              <Text style={styles.unselectableText}>Verify first</Text>
                            </View>
                          )}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
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
                          console.log('Card tapped for year:', year);
                          setSelectedYear(year);
                          setSelectedCourse(null);
                          setSelectedIds(new Set());
                          setIsSelectionMode(false);
                          fetchStudentsForYear(year);
                          
                          // Update header title
                          try {
                            navigation.setParams?.({
                              selectedCardTitle: label,
                            });
                          } catch {}
                          
                          // Tab bar visibility is handled by navigation structure
                        }}
                      >
                        {yearNoQRCounts[key] > 0 && (
                          <View style={styles.cardNoQrBadge}>
                            <Text style={styles.cardNoQrBadgeText}>{yearNoQRCounts[key]} No QR</Text>
                          </View>
                        )}
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
                              console.log('Card tapped for course:', course);
                              setSelectedCourse(course);
                              setSelectedYear(null);
                              setSelectedIds(new Set());
                              setIsSelectionMode(false);
                              fetchStudentsForCourse(course);
                              
                              // Update header title
                              try {
                                navigation.setParams?.({
                                  selectedCardTitle: course,
                                });
                              } catch {}
                            }}
                          >
                            {courseNoQRCounts[course.toLowerCase()] > 0 && (
                              <View style={styles.cardNoQrBadge}>
                                <Text style={styles.cardNoQrBadgeText}>{courseNoQRCounts[course.toLowerCase()]} No QR</Text>
                              </View>
                            )}
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
              listLoading ? (
                <View style={{ flex: 1, backgroundColor: '#FFFFFF', minHeight: 200 }} />
              ) : listItems.length === 0 ? (
                <View style={styles.centerContainer}>
                  <View style={styles.emptyCard}>
                    <View style={styles.emptyIconWrap}>
                      <Ionicons name="school-outline" size={28} color="#2563EB" />
                      <View style={styles.emptyIconSlash} />
                    </View>
                    <Text style={styles.emptyTitle}>No Students Found</Text>
                    <Text style={styles.emptySubtext}>Students will appear here once available. Once new student accounts are added to your selection, they will automatically show up in this list.</Text>
                  </View>
                </View>
              ) : (
                <>
                  <View style={styles.headerContainer}>
                    <View style={styles.legendContainer}>
                      <View style={styles.legendItem}>
                        <View style={[styles.legendDot, { backgroundColor: '#FEF3C7' }]} />
                        <Text style={styles.legendText}>Verification</Text>
                      </View>
                      <View style={styles.legendItem}>
                        <View style={[styles.legendDot, { backgroundColor: '#FEE2E2' }]} />
                        <Text style={styles.legendText}>No QR Code</Text>
                      </View>
                    </View>
                    <View style={styles.badgeContainer}>
                      {isSelectionMode && (
                        <TouchableOpacity style={styles.selectAllBadge} onPress={selectAllStudents}>
                          <Text style={styles.selectAllText}>Select All</Text>
                        </TouchableOpacity>
                      )}
                      <TouchableOpacity style={[styles.selectAllBadge, isSelectionMode && styles.selectAllBadgeActive]} onPress={toggleSelectionMode}>
                        <Text style={styles.selectAllText}>{isSelectionMode ? 'Cancel' : 'Select'}</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                  <View>
                    {listItems.map(s => {
                      // Check verificationStatus first
                      const verificationStatus = String(s?.verificationStatus || '').toLowerCase();
                      const isPending = verificationStatus === 'pending';
                      const isVerified = verificationStatus === 'verified';
                      
                      const hasQR = studentsWithQR.has(s.id);
                      const qrStatus = listItemsQRStatus.get(s.id) || { hasQR: false, isNew: false };
                      
                      // Determine row style based on verificationStatus and QR code:
                      // - If pending: light yellow (studentRowVerify)
                      // - If verified but no QR: light red (studentRowNoQR)
                      // - If verified and has QR: normal or green if new
                      let rowStyle;
                      if (isPending) {
                        rowStyle = styles.studentRowVerify;
                      } else if (isVerified && !hasQR) {
                        rowStyle = styles.studentRowNoQR;
                      } else if (hasQR) {
                        rowStyle = qrStatus.isNew ? styles.studentRowNewQR : styles.studentRow;
                      } else {
                        // Fallback: treat as verified if no verificationStatus field (older data)
                        rowStyle = styles.studentRowNoQR;
                      }
                      
                      const pendingVerify = isPending;
                      
                      const isSelected = selectedIds.has(s.id);
                      const finalRowStyle = isSelected 
                        ? [rowStyle, styles.studentRowSelected]
                        : rowStyle;
                      
                      // In selection mode, unverified students cannot be selected
                      const isSelectable = !isSelectionMode || !pendingVerify;
                      
                      return (
                      <TouchableOpacity 
                        key={s.id} 
                        style={finalRowStyle}
                        activeOpacity={isSelectable ? 0.7 : 0.3}
                        onPress={() => {
                          if (isSelectable) {
                            handleRowPress(s);
                          }
                        }}
                        onLongPress={() => {
                          if (isSelectable) {
                            handleRowLongPress(s);
                          }
                        }}
                        disabled={!isSelectable}
                      >
                        <View style={styles.studentAvatar}><Text style={styles.studentInitials}>{(s.firstName?.[0] || 'S').toUpperCase()}</Text></View>
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
                        {isPending && (
                          <View style={styles.verifyingBadge}>
                            <Text style={styles.verifyingBadgeText}>Verify</Text>
                          </View>
                        )}
                        {!isPending && !hasQR && (
                          <View style={styles.noQrBadge}>
                            <Text style={styles.noQrBadgeText}>No QR</Text>
                          </View>
                        )}
                        {isSelectionMode && pendingVerify && (
                          <View style={styles.unselectableIndicator}>
                            <Text style={styles.unselectableText}>Verify first</Text>
                          </View>
                        )}
                      </TouchableOpacity>
                      );
                    })}
                  </View>
                </>
              )
            )}
          </View>
        )}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
      
      {/* Change/Generate QR Code Button - Show when in selection mode (normal list or search) */}
      {isSelectionMode && ((selectedYear || selectedCourse) || isSearching) && (listItems.length > 0 || (isSearching && searchStudentName.trim())) ? (
        <View style={styles.generateBarFixed} pointerEvents="box-none">
          <TouchableOpacity
            style={[styles.generateButton, (selectedIds.size === 0 || changing) && styles.generateButtonDisabled]}
            onPress={() => setConfirmVisible(true)}
            disabled={selectedIds.size === 0 || changing}
          >
            <Text style={styles.generateButtonText}>
              {changing 
                ? `Changing (${progressDone}/${progressTotal})` 
                : hasStudentsWithoutQR() 
                  ? `Change/Generate QR (${selectedIds.size})`
                  : `Change QR (${selectedIds.size})`
              }
            </Text>
          </TouchableOpacity>
        </View>
      ) : null}
      {/* Change QR Confirmation Modal */}
      <Modal transparent animationType="fade" visible={confirmVisible} onRequestClose={() => !isChangingQR && setConfirmVisible(false)}>
        <View style={styles.modalOverlayCenter}>
          <View style={styles.fbModalCard}>
            <View style={styles.fbModalContent}>
              <Text style={styles.fbModalTitle}>{getConfirmationModalText().title}</Text>
              <Text style={styles.fbModalMessage}>{getConfirmationModalText().message}</Text>
            </View>
            <View style={styles.fbModalButtonContainer}>
              <TouchableOpacity 
                style={[styles.fbModalCancelButton, isChangingQR && styles.fbModalButtonDisabled]} 
                onPress={() => !isChangingQR && setConfirmVisible(false)}
                disabled={isChangingQR}
              >
                <Text style={styles.fbModalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[
                  styles.fbModalConfirmButton, 
                  { backgroundColor: '#004f89' },
                  isChangingQR && styles.fbModalButtonDisabled
                ]} 
                onPress={async () => { 
                  if (!isChangingQR) {
                    setIsChangingQR(true);
                    await changeSelectedQRCodes(); 
                  }
                }}
                disabled={isChangingQR}
              >
                <Text style={styles.fbModalConfirmText}>
                  {isChangingQR ? 'Processing...' : getConfirmationModalText().buttonText}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Change QR Confirmation Modal */}
      <Modal transparent animationType="fade" visible={changeQrConfirmVisible} onRequestClose={() => setChangeQrConfirmVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={[styles.modalIconWrap, { backgroundColor: '#DBEAFE' }]}>
              <Ionicons name="refresh-outline" size={28} color="#2563EB" />
            </View>
            <Text style={styles.modalTitle}>Change QR Code</Text>
            <Text style={styles.modalText}>Change QR code for this student? This action cannot be undone.</Text>
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalButton, changingQr && styles.disabledButton]} 
                onPress={() => setChangeQrConfirmVisible(false)}
                disabled={changingQr}
              >
                <Text style={styles.modalButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.modalButton, styles.modalButtonPrimarySolid, changingQr && styles.disabledButton]} 
                onPress={changeStudentQR}
                disabled={changingQr}
              >
                <Text style={[styles.modalButtonText, styles.modalButtonPrimarySolidText]}>
                  {changingQr ? 'Changing...' : 'Change'}
                </Text>
              </TouchableOpacity>
            </View>
                  </View>
                </View>
      </Modal>

      {/* Delete Student Confirmation Modal */}
      <Modal transparent animationType="fade" visible={deleteStudentConfirmVisible} onRequestClose={() => setDeleteStudentConfirmVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={[styles.modalIconWrap, { backgroundColor: '#FEE2E2' }]}>
              <Ionicons name="trash-outline" size={28} color="#DC2626" />
                    </View>
            <Text style={styles.modalTitle}>Delete Student</Text>
            <Text style={styles.modalText}>Are you sure you want to delete this student account? This action cannot be undone.</Text>
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalButton, deletingStudent && styles.disabledButton]} 
                onPress={() => setDeleteStudentConfirmVisible(false)}
                disabled={deletingStudent}
              >
                <Text style={styles.modalButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.modalButton, styles.modalButtonDangerSolid, deletingStudent && styles.disabledButton]} 
                onPress={deleteStudentAccount}
                disabled={deletingStudent}
              >
                <Text style={[styles.modalButtonText, styles.modalButtonDangerSolidText]}>
                  {deletingStudent ? 'Deleting...' : 'Delete'}
                </Text>
              </TouchableOpacity>
            </View>
                </View>
            </View>
      </Modal>

      {/* Feedback Modal */}
      <Modal transparent animationType="fade" visible={feedbackVisible} onRequestClose={() => setFeedbackVisible(false)}>
        <View style={styles.modalOverlayCenter}>
          <View style={styles.fbModalCard}>
            <View style={styles.fbModalContent}>
              <Text style={[styles.fbModalTitle, { color: feedbackTextColor }]}>{feedbackTitle}</Text>
              {feedbackMessage ? <Text style={styles.fbModalMessage}>{feedbackMessage}</Text> : null}
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
  listContainer: { gap: 6 },
  sectionTitle: { fontSize: 22, fontWeight: '700', color: '#111827', marginRight: 8, marginBottom: 5, marginTop: 10 },
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
  card: { flexBasis: '48%', backgroundColor: '#fff', borderRadius: 8, borderWidth: 1, borderColor: '#E5E7EB', padding: 16, alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.05, shadowOffset: { width: 0, height: 2 }, shadowRadius: 4, marginBottom: 12 },
  cardIconWrap: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  cardTitle: { fontSize: 16, fontWeight: '700', color: '#111827', marginBottom: 4, textAlign: 'center' },
  cardSub: { fontSize: 12, color: '#6B7280' },
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
  cardNoQrBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    backgroundColor: '#FEF2F2',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FECACA',
    zIndex: 10,
  },
  cardNoQrBadgeText: {
    color: '#DC2626',
    fontSize: 10,
    fontWeight: '700',
  },
  pageHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  studentCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
  },
  studentAvatar: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center', marginRight: 8 },
  studentInitials: { fontSize: 12, fontWeight: '700', color: '#2563EB' },
  studentInfo: { flex: 1 },
  studentName: { fontSize: 13, fontWeight: '700', color: '#111827' },
  studentClass: { fontSize: 12, color: '#6B7280', marginTop: 1 },
  studentId: { fontSize: 11, color: '#9CA3AF', marginTop: 2 },
  viewButton: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: '#BFDBFE', backgroundColor: '#EEF2FF' },
  viewText: { marginLeft: 6, color: '#2563EB', fontWeight: '700' },
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'transparent', zIndex: 9 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  modalCard: { backgroundColor: '#fff', borderRadius: 8, padding: 24, width: '85%', maxWidth: 400, alignItems: 'center' },
  modalIconWrap: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  modalTitle: { fontSize: 20, fontWeight: '700', color: '#111827', marginBottom: 8 },
  modalText: { fontSize: 16, color: '#6B7280', textAlign: 'center', marginBottom: 24 },
  modalActions: { flexDirection: 'row', gap: 12 },
  modalButton: { flex: 1, paddingVertical: 12, paddingHorizontal: 16, borderRadius: 8, alignItems: 'center' },
  modalButtonText: { fontSize: 16, fontWeight: '600', color: '#6B7280' },
  modalButtonPrimary: { backgroundColor: '#EFF6FF', borderWidth: 1, borderColor: '#BFDBFE' },
  modalButtonPrimaryText: { color: '#2563EB' },
  modalButtonPrimarySolid: { backgroundColor: '#2563EB' },
  modalButtonPrimarySolidText: { color: '#fff', fontWeight: '700' },
  modalButtonDanger: { backgroundColor: '#FEE2E2' },
  modalButtonDangerText: { color: '#b91c1c' },
  modalButtonDangerSolid: { backgroundColor: '#8B0000' },
  modalButtonDangerSolidText: { color: '#fff', fontWeight: '700' },
  disabledButton: { opacity: 0.5 },
  disabledButtonText: { opacity: 0.7 },
  // Detail modal copied from Parent/LinkStudents.js
  detailOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  detailCard: { width: '100%', maxWidth: 380, backgroundColor: '#fff', borderRadius: 8, padding: 14, borderWidth: 1, borderColor: '#E5E7EB' },
  detailHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  detailTitle: { fontSize: 16, fontWeight: '700', color: '#111827' },
  detailBodyTop: { alignItems: 'center', paddingVertical: 6 },
  detailAvatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#EFF6FF', justifyContent: 'center', alignItems: 'center', marginBottom: 6 },
  detailInitials: { fontSize: 18, fontWeight: '700', color: '#2563EB' },
  detailName: { fontSize: 16, fontWeight: '700', color: '#111827', textAlign: 'center' },
  detailSub: { fontSize: 13, color: '#6B7280', marginTop: 2 },
  detailInfoList: { marginTop: 8, paddingHorizontal: 16 },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  infoKey: { color: '#374151', fontWeight: '600', fontSize: 13 },
  infoVal: { color: '#6B7280', maxWidth: '55%', textAlign: 'right', fontSize: 13 },
  infoValWide: { color: '#6B7280', textAlign: 'right', fontSize: 13 },
  detailCloseBtn: { backgroundColor: '#F3F4F6', paddingVertical: 10, paddingHorizontal: 14, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  detailCloseText: { color: '#111827', fontWeight: '600', textAlign: 'center' },
  detailActionButtons: { flexDirection: 'row', gap: 8 },
  detailActionBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 6, gap: 6 },
  changeQrBtn: { backgroundColor: '#EFF6FF', borderWidth: 1, borderColor: '#BFDBFE' },
  changeQrBtnText: { color: '#2563EB', fontSize: 14, fontWeight: '600', textAlign: 'center' },
  deleteStudentBtn: { backgroundColor: '#FEE2E2', borderWidth: 1, borderColor: '#FECACA' },
  deleteStudentBtnText: { color: '#DC2626', fontSize: 14, fontWeight: '600', textAlign: 'center' },
  // Students without QR styles (copied from GenerateQRScreen.js)
  listSection: { flex: 1, backgroundColor: '#fff', borderRadius: 8, borderWidth: 1, borderColor: '#E5E7EB', paddingHorizontal: 8, paddingVertical: 4, marginTop: 12, minHeight: 500 },
  listHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, paddingHorizontal: 8, paddingTop: 8 },
  titleWithBadge: { flexDirection: 'row', alignItems: 'center' },
  listTitle: { fontSize: 14, fontWeight: '700', color: '#111827', marginRight: 8 },
  badge: { backgroundColor: '#2563EB', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  badgeText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  badgeContainer: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  selectAllBadge: { backgroundColor: '#EFF6FF', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, borderWidth: 1, borderColor: '#BFDBFE' },
  selectAllBadgeActive: { backgroundColor: '#DBEAFE', borderColor: '#93C5FD' },
  selectAllText: { color: '#2563EB', fontWeight: '700', fontSize: 11 },
  studentRowSelected: { backgroundColor: '#DBEAFE' },
  separator: { height: 1, backgroundColor: '#E5E7EB', marginVertical: 8 },
  centerRow: { alignItems: 'center', justifyContent: 'center', paddingVertical: 16 },
  emptyText: { color: '#6B7280' },
  studentRow: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: '#F3F4F6', borderRadius: 6, marginHorizontal: 2, marginVertical: 1 },
  studentRowVerify: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: '#F3F4F6', borderRadius: 6, marginHorizontal: 2, marginVertical: 1, backgroundColor: '#FEF3C7' },
  studentMeta: { color: '#6B7280', fontSize: 11 },
  studentActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  noQrBadge: { backgroundColor: '#FEF2F2', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8, borderWidth: 1, borderColor: '#FECACA', marginRight: 8, alignSelf: 'center' },
  noQrBadgeText: { color: '#DC2626', fontSize: 10, fontWeight: '600' },
  verifyingBadge: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FBBF24',
    marginRight: 8,
    alignSelf: 'center',
  },
  verifyingBadgeText: {
    color: '#92400E',
    fontSize: 10,
    fontWeight: '700',
  },
  unselectableIndicator: {
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    marginRight: 8,
    alignSelf: 'center',
  },
  unselectableText: {
    color: '#6B7280',
    fontSize: 9,
    fontWeight: '600',
  },
  checkboxWrap: { paddingHorizontal: 8, paddingVertical: 6 },
  detailMeta: { fontSize: 11, color: '#9CA3AF', marginTop: 4 },
  noResultCard: { alignItems: 'center', paddingVertical: 24, paddingHorizontal: 16 },
  noResultTitle: { fontSize: 18, fontWeight: '700', color: '#111827', marginTop: 12, marginBottom: 8 },
  noResultText: { fontSize: 14, color: '#6B7280', textAlign: 'center', lineHeight: 20, marginBottom: 8 },
  noResultTip: { fontSize: 12, color: '#9CA3AF', textAlign: 'center', fontStyle: 'italic' },
  searchSectionHeader: { marginBottom: 8 },
  legendContainer: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 12, height: 12, borderRadius: 6 },
  legendText: { fontSize: 9, color: '#0078cf', fontWeight: '600' },
  searchResultContainer: { marginTop: 20, backgroundColor: '#F9FAFB', borderRadius: 8, padding: 15, shadowColor: '#000', shadowOpacity: 0.05, shadowOffset: { width: 0, height: 2 }, shadowRadius: 4, elevation: 2 },
  studentRowNoQR: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: '#F3F4F6', borderRadius: 6, marginHorizontal: 2, marginVertical: 1, backgroundColor: '#FEF2F2' },
  studentRowNewQR: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: '#F3F4F6', borderRadius: 6, marginHorizontal: 2, marginVertical: 1, backgroundColor: '#DCFCE7' },
  checkboxDisabled: { opacity: 0.5 },
  generateBarFixed: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: '#F9FAFB', paddingHorizontal: 16, paddingBottom: 10, zIndex: 1000 },
  generateButton: { width: '100%', backgroundColor: '#004f89', borderRadius: 8, paddingVertical: 14, paddingHorizontal: 14, borderWidth: 1, borderColor: '#004f89', justifyContent: 'center', alignItems: 'center' },
  generateButtonDisabled: { backgroundColor: '#F3F4F6', opacity: 0.6, borderColor: '#E5E7EB' },
  generateButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700', textAlign: 'center' },
  // Additional styles from GenerateQRScreen.js
  pageHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2, paddingTop: 2, gap: 12 },
  headerContainer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2, paddingTop: 8, paddingBottom: 8, paddingHorizontal: 12, backgroundColor: '#FFFFFF', borderRadius: 8, borderWidth: 1, borderColor: '#E5E7EB' },
  sectionTitle: { fontSize: 18, fontWeight: '900', color: '#0078cf', marginRight: 8, marginBottom: 4, marginTop: 8 },
  listContainer: { gap: 6, width: '100%' },
  
  // Modern Modal Styles (mirrored from GenerateQRScreen.js)
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
  modernInfoContainer: {
    padding: 16,
    paddingTop: 20,
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    margin: 12,
    marginTop: 0,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  modernInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  modernInfoLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  modernInfoLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1F2937',
    marginLeft: 10,
    minWidth: 100,
    letterSpacing: 0.2,
  },
  modernInfoValue: {
    fontSize: 13,
    color: '#4B5563',
    textAlign: 'right',
    fontWeight: '500',
    flex: 1,
    marginLeft: 12,
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
    borderRadius: 8,
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
  modernChangeQrButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#3B82F6',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 8,
    shadowColor: '#3B82F6',
    shadowOpacity: 0.3,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 6,
    elevation: 4,
    gap: 6,
  },
  modernChangeQrButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
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
    borderRadius: 8,
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
    width: 36,
    height: 36,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.35)',
    borderRadius: 8,
  },
  avatarInitialOnBlue: {
    color: '#FFFFFF',
  },
  // Facebook-style modal styles (matching Schedule.js)
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

export default StudentManagement;

 