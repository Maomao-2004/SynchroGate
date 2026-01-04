import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Image,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
  Modal,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { useRoute, useNavigation } from '@react-navigation/native';
import { doc, updateDoc, getDoc, query, collection, where, getDocs, onSnapshot, deleteDoc, setDoc } from 'firebase/firestore';
import { db } from '../../utils/firebaseConfig';
import { deleteAllUserConversations } from '../../utils/conversationUtils';
import { withNetworkErrorHandling, getNetworkErrorMessage } from '../../utils/networkErrorHandler';
import AdminTopHeader from './AdminTopHeader';

const StudentProfile = () => {
  const route = useRoute();
  const navigation = useNavigation();
  const student = route?.params?.student || {};

  const defaultProfile = require("../../assets/icons/unknown avatar icon.jpg");

  const [profilePic, setProfilePic] = useState(defaultProfile);
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [hasQR, setHasQR] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const [currentStudent, setCurrentStudent] = useState(student);
  const [linkedParents, setLinkedParents] = useState([]);
  const [expandedDropdown, setExpandedDropdown] = useState(null); // 'course' | 'section' | 'yearLevel' | 'gender' | null
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [feedbackVisible, setFeedbackVisible] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState('');
  const [feedbackTitle, setFeedbackTitle] = useState('');
  const [feedbackTextColor, setFeedbackTextColor] = useState('#050505');
  const [validationErrorVisible, setValidationErrorVisible] = useState(false);
  const [validationErrorTitle, setValidationErrorTitle] = useState('Validation Error');
  const [validationErrorMessage, setValidationErrorMessage] = useState('');
  const [deleteConfirmVisible, setDeleteConfirmVisible] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [deleteFeedbackVisible, setDeleteFeedbackVisible] = useState(false);
  const [deleteFeedbackSuccess, setDeleteFeedbackSuccess] = useState(false);
  const [deleteFeedbackMessage, setDeleteFeedbackMessage] = useState('');
  const [networkErrorVisible, setNetworkErrorVisible] = useState(false);
  const [networkErrorTitle, setNetworkErrorTitle] = useState('');
  const [networkErrorMessage, setNetworkErrorMessage] = useState('');
  const [networkErrorColor, setNetworkErrorColor] = useState('#DC2626');
  const [editedData, setEditedData] = useState({
    firstName: student?.firstName || '',
    middleName: student?.middleName || '',
    lastName: student?.lastName || '',
    course: student?.course || '',
    section: student?.section || '',
    yearLevel: student?.yearLevel || '',
    email: student?.email || '',
    contactNumber: student?.contactNumber || '',
    gender: student?.gender || '',
    age: student?.age || '',
    birthday: student?.birthday || '',
    address: student?.address || '',
  });

  // Initialize currentStudent from route params
  useEffect(() => {
    if (student?.id) {
      setCurrentStudent(student);
    }
  }, [student?.id]);

  useEffect(() => {
    const birthday = currentStudent?.birthday || '';
    const calculatedAge = calculateAgeFromBirthday(birthday) || currentStudent?.age || '';
    
    setEditedData({
      firstName: currentStudent?.firstName || '',
      middleName: currentStudent?.middleName || '',
      lastName: currentStudent?.lastName || '',
      course: currentStudent?.course || '',
      section: currentStudent?.section || '',
      yearLevel: currentStudent?.yearLevel || '',
      email: currentStudent?.email || '',
      contactNumber: currentStudent?.contactNumber || '',
      gender: currentStudent?.gender || '',
      age: calculatedAge,
      birthday: birthday,
      address: currentStudent?.address || '',
    });
  }, [currentStudent]);

  // ✅ Load saved images
  useEffect(() => {
    const loadImages = async () => {
      try {
        const keyBase = currentStudent?.studentId ? String(currentStudent.studentId) : String(currentStudent?.id || currentStudent?.uid || '');
        if (!keyBase) return;
        
        const savedProfile = await AsyncStorage.getItem(`profilePic_${keyBase}`);

        if (savedProfile) setProfilePic({ uri: savedProfile });
      } catch (error) {
        console.log("Error loading images:", error);
      }
    };
    loadImages();
  }, [currentStudent?.studentId, currentStudent?.id, currentStudent?.uid]);

  // ✅ Check QR code status
  useEffect(() => {
    const checkQRStatus = async () => {
      try {
        const studentId = currentStudent?.studentId || currentStudent?.id;
        if (!studentId) {
          setHasQR(false);
          return;
        }
        
        await withNetworkErrorHandling(async () => {
          const qrDocRef = doc(db, 'student_QRcodes', String(studentId));
          const qrDoc = await getDoc(qrDocRef);
          
          if (!qrDoc.exists()) {
            const qrQuery = query(collection(db, 'student_QRcodes'), where('studentId', '==', studentId));
            const qrSnapshot = await getDocs(qrQuery);
            setHasQR(!qrSnapshot.empty);
          } else {
            setHasQR(true);
          }
        });
      } catch (error) {
        console.log("Error checking QR status:", error);
        const errorInfo = getNetworkErrorMessage(error);
        if (error.type === 'no_internet' || error.type === 'timeout' || error.type === 'unstable_connection') {
          setNetworkErrorTitle(errorInfo.title);
          setNetworkErrorMessage(errorInfo.message);
          setNetworkErrorColor(errorInfo.color);
          setNetworkErrorVisible(true);
          setTimeout(() => setNetworkErrorVisible(false), 5000);
        }
        setHasQR(false);
      }
    };
    checkQRStatus();
  }, [currentStudent?.studentId, currentStudent?.id]);

  // ✅ Check linked parents status
  useEffect(() => {
    const checkLinkedParents = async () => {
      try {
        const studentUid = currentStudent?.id || currentStudent?.uid;
        const studentIdNumber = currentStudent?.studentId;
        
        if (!studentUid && !studentIdNumber) {
          setLinkedParents([]);
          return;
        }
        
        await withNetworkErrorHandling(async () => {
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
        });
      } catch (error) {
        console.log("Error checking linked parents:", error);
        const errorInfo = getNetworkErrorMessage(error);
        if (error.type === 'no_internet' || error.type === 'timeout' || error.type === 'unstable_connection') {
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
  }, [currentStudent?.studentId, currentStudent?.id, currentStudent?.uid]);

  const formatYearLabel = (val) => {
    const str = String(val ?? '').trim();
    const num = parseInt(str, 10);
    if (num === 1) return '1st Year';
    if (num === 2) return '2nd Year';
    if (num === 3) return '3rd Year';
    if (num === 4) return '4th Year';
    return str || '';
  };

  const fullName = `${currentStudent?.lastName || ""}, ${currentStudent?.firstName || ""} ${currentStudent?.middleName || ""}`.trim();

  // Dropdown options
  const COURSES = ['BSAIS', 'BSBA', 'BSCRIM', 'BSHM', 'BSIT', 'BSTM', 'BTLED'];
  const SECTIONS = ['A', 'B', 'C', 'D', 'E', 'F'];
  const YEAR_LEVELS = ['1', '2', '3', '4'];
  const GENDERS = ['Male', 'Female'];

  // Format birthday input (xxxx-xx-xx)
  const formatBirthday = (text) => {
    // Remove all non-digits
    const digits = text.replace(/\D/g, '');
    
    // Format as xxxx-xx-xx
    if (digits.length <= 4) {
      return digits;
    } else if (digits.length <= 6) {
      return `${digits.slice(0, 4)}-${digits.slice(4)}`;
    } else {
      return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
    }
  };

  // Expandable Dropdown Component
  const ExpandableDropdown = ({ field, options, selectedValue, onSelect, error, placeholder, formatLabel }) => {
    const isExpanded = expandedDropdown === field;
    
    return (
      <View>
        <TouchableOpacity
          style={[styles.dropdownField, error && styles.inputError]}
          onPress={() => {
            // Close other dropdowns and toggle this one
            setExpandedDropdown(isExpanded ? null : field);
          }}
          activeOpacity={0.7}
        >
          <Text style={[styles.dropdownFieldText, !selectedValue && styles.dropdownFieldPlaceholder]}>
            {selectedValue ? (formatLabel ? formatLabel(selectedValue) : selectedValue) : placeholder}
          </Text>
          <Ionicons 
            name={isExpanded ? "chevron-up" : "chevron-down"} 
            size={18} 
            color="#6B7280" 
          />
        </TouchableOpacity>
        {isExpanded && (
          <View style={styles.dropdownOptionsContainer}>
            <ScrollView nestedScrollEnabled style={{ maxHeight: 200 }}>
              {options.map((option, index) => (
                <TouchableOpacity
                  key={index}
                  style={[
                    styles.dropdownOption,
                    selectedValue === option && styles.dropdownOptionSelected
                  ]}
                  onPress={() => {
                    onSelect(option);
                    setExpandedDropdown(null);
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={[
                    styles.dropdownOptionText,
                    selectedValue === option && styles.dropdownOptionTextSelected
                  ]}>
                    {formatLabel ? formatLabel(option) : option}
                  </Text>
                  {selectedValue === option && (
                    <Ionicons name="checkmark" size={18} color="#004f89" />
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}
      </View>
    );
  };

  // Check if there are any validation errors
  const hasValidationErrors = () => {
    return Object.values(fieldErrors).some(error => error !== '');
  };

  // Auto-close validation error modal after 3 seconds
  useEffect(() => {
    if (validationErrorVisible) {
      const timer = setTimeout(() => {
        setValidationErrorVisible(false);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [validationErrorVisible]);

  // Helper function to delete all documents related to a student
  const deleteAllStudentRelatedDocuments = async (student) => {
    const sid = student?.id || student?.uid;
    if (!sid) {
      throw new Error('Student ID is required');
    }

    console.log('Starting deletion for student:', sid, student);

    // Step 1: Delete all related documents from Firestore collections
    const targets = Array.from(new Set([sid, student?.uid, student?.id, student?.studentId].filter(Boolean)));
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

      // student_alerts - delete document directly by student ID
      try {
        const studentAlertDocRef = doc(db, 'student_alerts', targetStudentId);
        await deleteDoc(studentAlertDocRef);
        console.log(`✅ Deleted student_alerts document: ${targetStudentId}`);
      } catch (e) {
        console.log('Error deleting student_alerts document:', e);
      }

      // linked_parents - delete document directly by student ID
      try {
        const linkedParentsDocRef = doc(db, 'linked_parents', targetStudentId);
        await deleteDoc(linkedParentsDocRef);
        console.log(`✅ Deleted linked_parents document: ${targetStudentId}`);
      } catch (e) {
        console.log('Error deleting linked_parents document:', e);
      }

      // parent_student_links
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
          student?.uid,
          student?.id,
          student?.studentId,
          student?.studentIdNumber
        ].filter(Boolean);
        
        // Delete all conversations for this student (handles both parent-student and student-student conversations)
        await deleteAllUserConversations(targetStudentId, allStudentIds);
        
        console.log(`✅ Completed conversation deletion for student`);
      } catch (e) {
        console.log('Error deleting conversations:', e);
      }

      // linked_students
      try {
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

      // schedules
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

    // Delete parent_alerts
    try {
      const queries = [
        query(collection(db, 'parent_alerts'), where('studentId', '==', sid)),
        query(collection(db, 'parent_alerts'), where('studentId', '==', student?.studentId)),
        query(collection(db, 'parent_alerts'), where('studentIdNumber', '==', sid)),
        query(collection(db, 'parent_alerts'), where('studentIdNumber', '==', student?.studentId)),
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

    // Finally, delete from users collection (delete last)
    await deleteDoc(doc(db, 'users', sid));
    console.log('✅ Deleted main user document for:', sid);
  };

  const deleteStudentAccount = async () => {
    if (!currentStudent?.id) return;
    
    setDeletingAccount(true);
    try {
      await withNetworkErrorHandling(async () => {
        console.log('🗑️ Starting student deletion for:', currentStudent.id);
        console.log('🔍 Detail student object:', currentStudent);
        
        await deleteAllStudentRelatedDocuments(currentStudent);
      
      console.log('✅ Successfully deleted all student-related documents');

      // Create activity log entry
      try {
        const activityLogRef = doc(db, 'admin_activity_logs', 'global');
        const activityLogSnap = await getDoc(activityLogRef);
        const existingLogs = activityLogSnap.exists() ? (Array.isArray(activityLogSnap.data()?.items) ? activityLogSnap.data().items : []) : [];
        const newLog = {
          id: `student_deleted_${Date.now()}`,
          type: 'student_deleted',
          title: 'Student Account Deleted',
          message: `Deleted student account: ${currentStudent.firstName} ${currentStudent.lastName} (${currentStudent.studentId})`,
          createdAt: new Date().toISOString(),
          status: 'unread',
          student: {
            id: currentStudent.id,
            firstName: currentStudent.firstName,
            lastName: currentStudent.lastName,
            studentId: currentStudent.studentId,
          }
        };
        await setDoc(activityLogRef, { items: [newLog, ...existingLogs] }, { merge: true });
        console.log('✅ Created activity log entry');
      } catch (e) {
        console.error('❌ Error creating activity log entry:', e);
      }

      // Close confirmation modal first
      setDeleteConfirmVisible(false);
      setDeletingAccount(false);
      
      // Show feedback modal
      setDeleteFeedbackSuccess(true);
      setDeleteFeedbackMessage('Student account deleted successfully');
      setDeleteFeedbackVisible(true);
      
      setTimeout(() => {
        setDeleteFeedbackVisible(false);
        // Navigate back to StudentManagement immediately to refresh the list
        // The StudentManagement screen will automatically refresh via useFocusEffect
        navigation.goBack();
      }, 3000);
      });
    } catch (error) {
      console.error('Error deleting student:', error);
      const errorInfo = getNetworkErrorMessage(error);
      if (error.type === 'no_internet' || error.type === 'timeout' || error.type === 'unstable_connection') {
        setNetworkErrorTitle(errorInfo.title);
        setNetworkErrorMessage(errorInfo.message);
        setNetworkErrorColor(errorInfo.color);
        setNetworkErrorVisible(true);
        setTimeout(() => setNetworkErrorVisible(false), 5000);
      } else {
        // Close confirmation modal first
        setDeleteConfirmVisible(false);
        setDeletingAccount(false);
        
        // Show feedback modal
        setDeleteFeedbackSuccess(false);
        setDeleteFeedbackMessage('Failed to delete student account');
        setDeleteFeedbackVisible(true);
        setTimeout(() => {
          setDeleteFeedbackVisible(false);
        }, 3000);
      }
    }
  };

  // Real-time listener for student data updates
  useEffect(() => {
    if (!student?.id) return;

    const studentDocRef = doc(db, 'users', student.id);
    const unsubscribe = onSnapshot(studentDocRef, (snapshot) => {
      if (snapshot.exists()) {
        const updatedData = { id: snapshot.id, ...snapshot.data() };
        setCurrentStudent(updatedData);
        // Update editedData if not in edit mode
        if (!isEditing) {
          const birthday = updatedData?.birthday || '';
          const calculatedAge = calculateAgeFromBirthday(birthday) || updatedData?.age || '';
          setEditedData({
            firstName: updatedData?.firstName || '',
            middleName: updatedData?.middleName || '',
            lastName: updatedData?.lastName || '',
            course: updatedData?.course || '',
            section: updatedData?.section || '',
            yearLevel: updatedData?.yearLevel || '',
            email: updatedData?.email || '',
            contactNumber: updatedData?.contactNumber || '',
            gender: updatedData?.gender || '',
            age: calculatedAge,
            birthday: birthday,
            address: updatedData?.address || '',
          });
        }
      }
    }, (error) => {
      console.log('Error listening to student updates:', error);
      const errorInfo = getNetworkErrorMessage(error);
      if (error?.code?.includes('unavailable') || error?.code?.includes('deadline-exceeded') || error?.message?.toLowerCase().includes('network') || error?.message?.toLowerCase().includes('connection')) {
        setNetworkErrorTitle(errorInfo.title);
        setNetworkErrorMessage(errorInfo.message);
        setNetworkErrorColor(errorInfo.color);
        setNetworkErrorVisible(true);
        setTimeout(() => setNetworkErrorVisible(false), 5000);
      }
    });

    return () => unsubscribe();
  }, [student?.id, isEditing]);

  // Validation function based on RegisterScreen rules
  const validateField = (fieldName, value) => {
    let error = '';
    const trimmedValue = String(value || '').trim();
    
    switch (fieldName) {
      case 'firstName':
        if (!trimmedValue) error = 'First name is required';
        else if (trimmedValue.length < 2) error = 'First name must be at least 2 characters';
        break;
      case 'middleName':
        // Middle name is optional, but if provided should be at least 2 characters
        if (trimmedValue && trimmedValue.length < 2) error = 'Middle name must be at least 2 characters if provided';
        break;
      case 'lastName':
        if (!trimmedValue) error = 'Last name is required';
        else if (trimmedValue.length < 2) error = 'Last name must be at least 2 characters';
        break;
      case 'course':
        if (!trimmedValue) error = 'Course is required';
        break;
      case 'section':
        if (!trimmedValue) error = 'Section is required';
        break;
      case 'yearLevel':
        if (!trimmedValue) error = 'Year level is required';
        else {
          const yearNum = parseInt(trimmedValue);
          if (isNaN(yearNum) || yearNum < 1 || yearNum > 4) {
            error = 'Year level must be between 1 and 4';
          }
        }
        break;
      case 'email':
        if (!trimmedValue) error = 'Email is required';
        else if (!/\S+@\S+\.\S+/.test(trimmedValue)) error = 'Please enter a valid email address';
        break;
      case 'contactNumber':
        if (!trimmedValue || trimmedValue === '+63') error = 'Contact number is required';
        else if (trimmedValue.length !== 13) error = 'Contact number must be exactly 13 characters (+63XXXXXXXXXX)';
        else if (!trimmedValue.startsWith('+63')) error = 'Contact number must start with +63';
        break;
      case 'gender':
        if (!trimmedValue) error = 'Gender is required';
        break;
      case 'age':
        // Age is auto-calculated from birthday, so validation is done through birthday
        // But we still check if age exists and is valid
        if (!trimmedValue) {
          // Age will be calculated from birthday, so no error if birthday is valid
          return '';
        } else {
          const ageNum = parseInt(trimmedValue);
          if (isNaN(ageNum) || ageNum < 15 || ageNum > 60) {
            error = 'Age must be between 15 and 60 (calculated from birthday)';
          }
        }
        break;
      case 'birthday':
        if (!trimmedValue) error = 'Birthday is required';
        else {
          // Validate format xxxx-xx-xx
          const dateRegex = /^(\d{4})-(\d{2})-(\d{2})$/;
          if (!dateRegex.test(trimmedValue)) {
            error = 'Birthday must be in format YYYY-MM-DD';
          } else {
            const [, year, month, day] = trimmedValue.match(dateRegex);
            const yearNum = parseInt(year);
            const monthNum = parseInt(month);
            const dayNum = parseInt(day);
            
            if (yearNum < 1950 || yearNum > new Date().getFullYear()) {
              error = 'Year must be between 1950 and current year';
            } else if (monthNum < 1 || monthNum > 12) {
              error = 'Month must be between 01 and 12';
            } else {
              // Get days in month (handles leap years)
              const daysInMonth = new Date(yearNum, monthNum, 0).getDate();
              if (dayNum < 1 || dayNum > daysInMonth) {
                error = `Day must be between 01 and ${daysInMonth} (month has ${daysInMonth} days)`;
              } else {
                const date = new Date(yearNum, monthNum - 1, dayNum);
                if (isNaN(date.getTime())) {
                  error = 'Invalid date';
                } else if (date > new Date()) {
                  error = 'Birthday cannot be in the future';
                }
              }
            }
          }
        }
        break;
      case 'address':
        if (!trimmedValue) error = 'Address is required';
        else if (trimmedValue.length < 5) error = 'Address must be at least 5 characters';
        else if (trimmedValue.length > 50) error = 'Address must be maximum 50 characters';
        break;
      default:
        break;
    }
    
    return error;
  };

  const calculateAgeFromBirthday = (birthday) => {
    if (!birthday) return '';
    
    try {
      // Parse birthday in YYYY-MM-DD format
      const dateRegex = /^(\d{4})-(\d{2})-(\d{2})$/;
      if (!dateRegex.test(birthday)) return '';
      
      const [, year, month, day] = birthday.match(dateRegex);
      const birthDate = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
      
      if (isNaN(birthDate.getTime())) return '';
      
      const today = new Date();
      let age = today.getFullYear() - birthDate.getFullYear();
      const monthDiff = today.getMonth() - birthDate.getMonth();
      
      if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
        age--;
      }
      
      return age >= 0 ? String(age) : '';
    } catch {
      return '';
    }
  };

  const handleFieldChange = (fieldName, value) => {
    setEditedData({ ...editedData, [fieldName]: value });
    // Clear error when user starts typing
    if (fieldErrors[fieldName]) {
      setFieldErrors({ ...fieldErrors, [fieldName]: '' });
    }
    
    // Auto-calculate age when birthday changes
    if (fieldName === 'birthday') {
      const calculatedAge = calculateAgeFromBirthday(value);
      if (calculatedAge) {
        setEditedData(prev => ({ ...prev, [fieldName]: value, age: calculatedAge }));
      }
    }
  };

  const handleFieldBlur = (fieldName) => {
    const error = validateField(fieldName, editedData[fieldName]);
    setFieldErrors({ ...fieldErrors, [fieldName]: error });
  };

  // Check if there are any changes (age is auto-calculated, so we compare birthday)
  const hasChanges = () => {
    const safeTrim = (val) => String(val || '').trim();
    return (
      safeTrim(editedData.firstName) !== safeTrim(currentStudent?.firstName) ||
      safeTrim(editedData.middleName) !== safeTrim(currentStudent?.middleName) ||
      safeTrim(editedData.lastName) !== safeTrim(currentStudent?.lastName) ||
      safeTrim(editedData.course) !== safeTrim(currentStudent?.course) ||
      safeTrim(editedData.section) !== safeTrim(currentStudent?.section) ||
      safeTrim(editedData.yearLevel) !== safeTrim(currentStudent?.yearLevel) ||
      safeTrim(editedData.email) !== safeTrim(currentStudent?.email) ||
      safeTrim(editedData.contactNumber) !== safeTrim(currentStudent?.contactNumber) ||
      safeTrim(editedData.gender) !== safeTrim(currentStudent?.gender) ||
      safeTrim(editedData.birthday) !== safeTrim(currentStudent?.birthday) ||
      safeTrim(editedData.address) !== safeTrim(currentStudent?.address)
    );
  };

  const handleSave = async () => {
    if (!currentStudent?.id) {
      setFeedbackTitle('Error');
      setFeedbackMessage('Student ID not found');
      setFeedbackTextColor('#DC2626');
      setFeedbackVisible(true);
      setTimeout(() => {
        setFeedbackVisible(false);
      }, 2000);
      return;
    }

    // Validate all fields before saving
    const errors = {};
    const fieldsToValidate = ['firstName', 'lastName', 'middleName', 'course', 'section', 'yearLevel', 'email', 'contactNumber', 'gender', 'birthday', 'address'];
    
    // Auto-calculate age from birthday before validation
    if (editedData.birthday) {
      const calculatedAge = calculateAgeFromBirthday(editedData.birthday);
      if (calculatedAge) {
        setEditedData(prev => ({ ...prev, age: calculatedAge }));
      }
    }
    
    fieldsToValidate.forEach(field => {
      const error = validateField(field, editedData[field]);
      if (error) errors[field] = error;
    });

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      // Show validation error modal instead of Alert
      const errorMessages = Object.values(errors).filter(e => e).join('\n');
      setValidationErrorTitle('Validation Error');
      setValidationErrorMessage(errorMessages || 'Please fix the errors before saving');
      setValidationErrorVisible(true);
      return;
    }

    setSaving(true);
    try {
      await withNetworkErrorHandling(async () => {
        const studentDocRef = doc(db, 'users', currentStudent.id);
        
        // Calculate age from birthday before saving
        const finalAge = editedData.birthday ? calculateAgeFromBirthday(editedData.birthday) : editedData.age;
        
        // Prepare update data
        const safeTrim = (val) => String(val || '').trim();
        const updateData = {
          firstName: safeTrim(editedData.firstName) || null,
          middleName: safeTrim(editedData.middleName) || null,
          lastName: safeTrim(editedData.lastName) || null,
          course: safeTrim(editedData.course) || null,
          section: safeTrim(editedData.section) || null,
          yearLevel: safeTrim(editedData.yearLevel) || null,
          email: safeTrim(editedData.email) || null,
          contactNumber: safeTrim(editedData.contactNumber) || null,
          gender: safeTrim(editedData.gender) || null,
          age: finalAge ? String(finalAge) : null,
          birthday: safeTrim(editedData.birthday) || null,
          address: safeTrim(editedData.address) || null,
          updatedAt: new Date().toISOString(),
        };

        // Remove null/empty values
        Object.keys(updateData).forEach(key => {
          if (updateData[key] === null || updateData[key] === '') {
            delete updateData[key];
          }
        });

        await updateDoc(studentDocRef, updateData);
        
        // Clear errors and exit edit mode
        setFieldErrors({});
        setIsEditing(false);
        
        // Close confirmation modal first
        setConfirmVisible(false);
        
        // Show success feedback
        setFeedbackTitle('Success');
        setFeedbackMessage('Student information updated successfully');
        setFeedbackTextColor('#16A34A');
        setFeedbackVisible(true);
        
        // Auto-hide feedback modal after 3 seconds
        setTimeout(() => {
          setFeedbackVisible(false);
        }, 3000);
      });
    } catch (error) {
      console.error('Error updating student:', error);
      const errorInfo = getNetworkErrorMessage(error);
      if (error.type === 'no_internet' || error.type === 'timeout' || error.type === 'unstable_connection') {
        setNetworkErrorTitle(errorInfo.title);
        setNetworkErrorMessage(errorInfo.message);
        setNetworkErrorColor(errorInfo.color);
        setNetworkErrorVisible(true);
        setTimeout(() => setNetworkErrorVisible(false), 5000);
      } else {
        // Close confirmation modal first
        setConfirmVisible(false);
        
        // Show feedback modal
        setFeedbackTitle('Error');
        setFeedbackMessage(`Failed to update student information: ${error.message}`);
        setFeedbackTextColor('#DC2626');
        setFeedbackVisible(true);
        
        // Auto-hide feedback modal after 3 seconds
        setTimeout(() => {
          setFeedbackVisible(false);
        }, 3000);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={{ flex: 1 }}>
      <AdminTopHeader />
      <ScrollView 
        style={styles.container} 
        contentContainerStyle={{ paddingBottom: 100 }}
        onScrollBeginDrag={() => setExpandedDropdown(null)}
        scrollEventThrottle={16}
      >
        {/* Profile Picture and Name Section */}
        <View style={styles.profileContainer}>
          <View style={styles.profileSection}>
            <View style={styles.profilePicContainer}>
              <Text style={styles.profilePicInitial}>
                {(currentStudent?.lastName?.[0] || 'S').toUpperCase()}
              </Text>
            </View>
            <View style={styles.nameSection}>
              <Text style={styles.fullName}>{fullName || "Student"}</Text>
              <View style={styles.chipsRow}>
                <View style={[styles.chip, hasQR ? styles.chipWithQR : styles.chipNoQR]}>
                  <Ionicons name={hasQR ? "checkmark-circle" : "close-circle"} size={12} color={hasQR ? "#16A34A" : "#DC2626"} />
                  <Text style={[styles.chipText, hasQR ? styles.chipTextWithQR : styles.chipTextNoQR]}>
                    {hasQR ? "WITH QR" : "NO QR"}
                  </Text>
                </View>
                {!!currentStudent?.studentId && (
                  <View style={[styles.chip, { backgroundColor: "#DBEAFE" }]}>
                    <Ionicons name="id-card-outline" size={12} color="#2563eb" />
                    <Text style={[styles.chipText, { color: "#2563eb", fontSize: 11 }]}>ID: {currentStudent.studentId}</Text>
                  </View>
                )}
              </View>
            </View>
          </View>
        </View>

        {/* Separator with Edit Button */}
        <View style={styles.separatorContainer}>
          <View style={styles.separator} />
          <TouchableOpacity 
            style={styles.editButton}
            onPress={() => {
              setIsEditing(!isEditing);
              if (isEditing) {
                // Reset errors when canceling edit
                setFieldErrors({});
              }
            }}
          >
            <Ionicons name={isEditing ? "close" : "create-outline"} size={20} color="#004f89" />
          </TouchableOpacity>
        </View>

        {/* Info Section */}
        <View style={styles.infoSection}>
          {/* Name fields - only shown in edit mode */}
          {isEditing && (
            <>
              <View style={styles.infoRow}>
                <Text style={styles.label}>First Name</Text>
                <TextInput
                  style={[styles.input, fieldErrors.firstName && styles.inputError]}
                  value={editedData.firstName}
                  onChangeText={(text) => handleFieldChange('firstName', text)}
                  onBlur={() => handleFieldBlur('firstName')}
                  placeholder="Enter first name"
                />
                {fieldErrors.firstName && <Text style={styles.errorText}>{fieldErrors.firstName}</Text>}
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.label}>Middle Name</Text>
                <TextInput
                  style={[styles.input, fieldErrors.middleName && styles.inputError]}
                  value={editedData.middleName}
                  onChangeText={(text) => handleFieldChange('middleName', text)}
                  onBlur={() => handleFieldBlur('middleName')}
                  placeholder="Enter middle name (optional)"
                />
                {fieldErrors.middleName && <Text style={styles.errorText}>{fieldErrors.middleName}</Text>}
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.label}>Last Name</Text>
                <TextInput
                  style={[styles.input, fieldErrors.lastName && styles.inputError]}
                  value={editedData.lastName}
                  onChangeText={(text) => handleFieldChange('lastName', text)}
                  onBlur={() => handleFieldBlur('lastName')}
                  placeholder="Enter last name"
                />
                {fieldErrors.lastName && <Text style={styles.errorText}>{fieldErrors.lastName}</Text>}
              </View>
            </>
          )}

          <View style={styles.infoRow}>
            <Text style={styles.label}>Student ID</Text>
            <Text style={styles.value}>{currentStudent?.studentId || "—"}</Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.label}>Course</Text>
            {isEditing ? (
              <>
                <ExpandableDropdown
                  field="course"
                  options={COURSES}
                  selectedValue={editedData.course}
                  onSelect={(value) => {
                    handleFieldChange('course', value);
                    handleFieldBlur('course');
                  }}
                  error={fieldErrors.course}
                  placeholder="Select course"
                />
                {fieldErrors.course && <Text style={styles.errorText}>{fieldErrors.course}</Text>}
              </>
            ) : (
              <Text style={styles.value}>{currentStudent?.course || "—"}</Text>
            )}
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.label}>Section</Text>
            {isEditing ? (
              <>
                <ExpandableDropdown
                  field="section"
                  options={SECTIONS}
                  selectedValue={editedData.section}
                  onSelect={(value) => {
                    handleFieldChange('section', value);
                    handleFieldBlur('section');
                  }}
                  error={fieldErrors.section}
                  placeholder="Select section"
                />
                {fieldErrors.section && <Text style={styles.errorText}>{fieldErrors.section}</Text>}
              </>
            ) : (
              <Text style={styles.value}>{currentStudent?.section || "—"}</Text>
            )}
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.label}>Year Level</Text>
            {isEditing ? (
              <>
                <ExpandableDropdown
                  field="yearLevel"
                  options={YEAR_LEVELS}
                  selectedValue={editedData.yearLevel}
                  onSelect={(value) => {
                    handleFieldChange('yearLevel', value);
                    handleFieldBlur('yearLevel');
                  }}
                  error={fieldErrors.yearLevel}
                  placeholder="Select year level"
                  formatLabel={formatYearLabel}
                />
                {fieldErrors.yearLevel && <Text style={styles.errorText}>{fieldErrors.yearLevel}</Text>}
              </>
            ) : (
              <Text style={styles.value}>{formatYearLabel(currentStudent?.yearLevel) || "—"}</Text>
            )}
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.label}>Email</Text>
            <Text style={styles.value}>{currentStudent?.email || "—"}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.label}>Contact</Text>
            {isEditing ? (
              <>
                <View style={styles.contactInputContainer}>
                  <Text style={styles.contactPrefix}>+63</Text>
                  <TextInput
                    style={[styles.contactInput, fieldErrors.contactNumber && styles.inputError]}
                    value={editedData.contactNumber?.replace('+63', '') || ''}
                    onChangeText={(text) => {
                      // Only allow digits, max 10 digits (after +63)
                      const digits = text.replace(/\D/g, '').slice(0, 10);
                      handleFieldChange('contactNumber', '+63' + digits);
                    }}
                    onBlur={() => handleFieldBlur('contactNumber')}
                    placeholder="XXXXXXXXXX"
                    keyboardType="number-pad"
                    maxLength={10}
                  />
                </View>
                {fieldErrors.contactNumber && <Text style={styles.errorText}>{fieldErrors.contactNumber}</Text>}
              </>
            ) : (
              <Text style={styles.value}>{currentStudent?.contactNumber || "—"}</Text>
            )}
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.label}>Gender</Text>
            {isEditing ? (
              <>
                <ExpandableDropdown
                  field="gender"
                  options={GENDERS}
                  selectedValue={editedData.gender}
                  onSelect={(value) => {
                    handleFieldChange('gender', value);
                    handleFieldBlur('gender');
                  }}
                  error={fieldErrors.gender}
                  placeholder="Select gender"
                />
                {fieldErrors.gender && <Text style={styles.errorText}>{fieldErrors.gender}</Text>}
              </>
            ) : (
              <Text style={styles.value}>{currentStudent?.gender || "—"}</Text>
            )}
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.label}>Age</Text>
            <Text style={styles.value}>{editedData.age || currentStudent?.age || "—"}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.label}>Birthday</Text>
            {isEditing ? (
              <>
                <TextInput
                  style={[styles.input, fieldErrors.birthday && styles.inputError]}
                  value={editedData.birthday}
                  onChangeText={(text) => {
                    const formatted = formatBirthday(text);
                    handleFieldChange('birthday', formatted);
                  }}
                  onBlur={() => handleFieldBlur('birthday')}
                  placeholder="YYYY-MM-DD"
                  keyboardType="number-pad"
                  maxLength={10}
                />
                {fieldErrors.birthday && <Text style={styles.errorText}>{fieldErrors.birthday}</Text>}
              </>
            ) : (
              <Text style={styles.value}>
                {(() => { 
                  if (!currentStudent?.birthday) return '—'; 
                  try { 
                    const d = new Date(currentStudent.birthday); 
                    if (isNaN(d.getTime())) return String(currentStudent.birthday); 
                    return d.toLocaleDateString(); 
                  } catch { 
                    return String(currentStudent.birthday); 
                  } 
                })()}
              </Text>
            )}
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.label}>Address</Text>
            {isEditing ? (
              <>
                <TextInput
                  style={[styles.input, styles.textArea, fieldErrors.address && styles.inputError]}
                  value={editedData.address}
                  onChangeText={(text) => handleFieldChange('address', text)}
                  onBlur={() => handleFieldBlur('address')}
                  placeholder="Enter address (min. 5 characters)"
                  multiline
                  numberOfLines={3}
                  maxLength={50}
                />
                {fieldErrors.address && <Text style={styles.errorText}>{fieldErrors.address}</Text>}
              </>
            ) : (
              <Text style={styles.value} numberOfLines={3}>
                {currentStudent?.address || "—"}
              </Text>
            )}
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
        </View>
      </ScrollView>

      {/* Confirmation Modal */}
      <Modal transparent animationType="fade" visible={confirmVisible} onRequestClose={() => !saving && setConfirmVisible(false)}>
        <View style={styles.modalOverlayCenter}>
          <View style={styles.fbModalCard}>
            <View style={styles.fbModalContent}>
              <Text style={styles.fbModalTitle}>Save Changes</Text>
              <Text style={styles.fbModalMessage}>Are you sure you want to save these changes?</Text>
            </View>
            <View style={styles.fbModalButtonContainer}>
              <TouchableOpacity 
                style={[styles.fbModalCancelButton, saving && styles.fbModalButtonDisabled]} 
                onPress={() => !saving && setConfirmVisible(false)}
                disabled={saving}
              >
                <Text style={styles.fbModalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[
                  styles.fbModalConfirmButton, 
                  { backgroundColor: '#004f89' },
                  saving && styles.fbModalButtonDisabled
                ]} 
                onPress={handleSave}
                disabled={saving}
              >
                <Text style={styles.fbModalConfirmText}>
                  {saving ? 'Saving...' : 'Confirm'}
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

      {/* Validation Error Modal */}
      <Modal visible={validationErrorVisible} transparent animationType="fade">
        <View style={styles.modalOverlayCenter}>
          <View style={styles.fbModalCard}>
            <View style={styles.fbModalContent}>
              <Text style={[styles.fbModalTitle, { color: '#F59E0B' }]}>{validationErrorTitle}</Text>
              <Text style={styles.fbModalMessage}>{validationErrorMessage}</Text>
            </View>
          </View>
        </View>
      </Modal>

      {/* Bottom Action Buttons - Fixed at bottom */}
      {isEditing ? (
        <View style={styles.bottomButtonContainer}>
          <TouchableOpacity 
            style={[styles.bottomButton, styles.bottomCancelButton]}
            onPress={() => {
              setIsEditing(false);
              setFieldErrors({});
              const birthday = currentStudent?.birthday || '';
              const calculatedAge = calculateAgeFromBirthday(birthday) || currentStudent?.age || '';
              setEditedData({
                firstName: currentStudent?.firstName || '',
                middleName: currentStudent?.middleName || '',
                lastName: currentStudent?.lastName || '',
                course: currentStudent?.course || '',
                section: currentStudent?.section || '',
                yearLevel: currentStudent?.yearLevel || '',
                email: currentStudent?.email || '',
                contactNumber: currentStudent?.contactNumber || '',
                gender: currentStudent?.gender || '',
                age: calculatedAge,
                birthday: birthday,
                address: currentStudent?.address || '',
              });
            }}
          >
            <Text style={styles.bottomCancelButtonText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.bottomButton, styles.bottomSaveButton, (saving || !hasChanges() || hasValidationErrors()) && styles.bottomButtonDisabled]}
            onPress={() => setConfirmVisible(true)}
            disabled={saving || !hasChanges() || hasValidationErrors()}
          >
            <Text style={styles.bottomSaveButtonText}>Save</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity
          style={styles.deleteAccountButtonContainer}
          activeOpacity={0.85}
          onPress={() => setDeleteConfirmVisible(true)}
          disabled={deletingAccount}
        >
          <View style={[styles.deleteAccountButton, deletingAccount && styles.deleteAccountButtonDisabled]}>
            <Text style={styles.deleteAccountButtonText}>Delete Account</Text>
          </View>
        </TouchableOpacity>
      )}

      {/* Delete Student Confirmation Modal */}
      <Modal transparent animationType="fade" visible={deleteConfirmVisible} onRequestClose={() => !deletingAccount && setDeleteConfirmVisible(false)}>
        <View style={styles.modalOverlayCenter}>
          <View style={styles.fbModalCard}>
            <View style={styles.fbModalContent}>
              <Text style={styles.fbModalTitle}>Delete Student?</Text>
              <Text style={styles.fbModalMessage}>Are you sure you want to delete this student account? This cannot be undone.</Text>
            </View>
            <View style={styles.fbModalButtonContainer}>
              <TouchableOpacity 
                style={[styles.fbModalCancelButton, deletingAccount && styles.fbModalButtonDisabled]} 
                onPress={() => !deletingAccount && setDeleteConfirmVisible(false)}
                disabled={deletingAccount}
              >
                <Text style={styles.fbModalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[
                  styles.fbModalConfirmButton, 
                  { backgroundColor: '#8B0000' },
                  deletingAccount && styles.fbModalButtonDisabled
                ]} 
                onPress={async () => { 
                  if (!deletingAccount) {
                    await deleteStudentAccount();
                  }
                }}
                disabled={deletingAccount}
              >
                <Text style={styles.fbModalConfirmText}>
                  {deletingAccount ? 'Deleting...' : 'Confirm'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Delete Feedback Modal */}
      <Modal transparent animationType="fade" visible={deleteFeedbackVisible} onRequestClose={() => setDeleteFeedbackVisible(false)}>
        <View style={styles.modalOverlayCenter}>
          <View style={styles.fbModalCard}>
            <View style={styles.fbModalContent}>
              <Text style={[styles.fbModalTitle, { color: deleteFeedbackSuccess ? '#10B981' : '#DC2626' }]}>
                {deleteFeedbackSuccess ? 'Success' : 'Error'}
              </Text>
              <Text style={styles.fbModalMessage}>{deleteFeedbackMessage}</Text>
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
  container: { flex: 1, backgroundColor: "#F9FAFB" },
  profileContainer: {
    backgroundColor: "#fff",
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 6,
  },
  profileSection: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  profilePicContainer: {
    width: 70,
    height: 70,
    borderRadius: 35,
    borderWidth: 2.5,
    borderColor: "#004f89",
    overflow: "hidden",
    backgroundColor: "#EFF6FF",
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
    marginRight: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profilePic: { width: "100%", height: "100%", borderRadius: 32.5 },
  profilePicInitial: {
    fontSize: 28,
    fontWeight: '700',
    color: '#2563EB',
  },
  nameSection: {
    flex: 1,
    justifyContent: 'center',
    paddingTop: 2,
  },
  fullName: { fontSize: 18, fontWeight: "800", color: "#111827", marginBottom: 4 },
  nameInputContainer: {
    gap: 6,
    marginBottom: 4,
  },
  nameInput: {
    backgroundColor: "#F9FAFB",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 13,
    color: "#111827",
  },
  chipsRow: { flexDirection: "row", gap: 6, flexWrap: "wrap", marginTop: 2 },
  chip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderWidth: 0,
  },
  chipText: { color: "#111827", fontWeight: "700", fontSize: 11 },
  chipWithQR: {
    backgroundColor: "#DCFCE7",
    borderWidth: 1,
    borderColor: "#86EFAC",
  },
  chipNoQR: {
    backgroundColor: "#FEE2E2",
    borderWidth: 1,
    borderColor: "#FCA5A5",
  },
  chipTextWithQR: { color: "#16A34A", fontWeight: "700", fontSize: 11 },
  chipTextNoQR: { color: "#DC2626", fontWeight: "700", fontSize: 11 },
  separatorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 1,
    backgroundColor: "#fff",
    marginTop: 0,
  },
  separator: {
    flex: 1,
    height: 1,
    backgroundColor: "#004f89",
    opacity: 0.3,
    marginRight: 12,
  },
  editButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#F0F7FF",
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: "#E0EFFF",
  },
  infoSection: {
    backgroundColor: "#fff",
    paddingHorizontal: 20,
    paddingVertical: 0,
  },
  infoRow: {
    flexDirection: "column",
    paddingVertical: 6,
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
  input: {
    backgroundColor: "#F9FAFB",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 13,
    color: "#111827",
    marginTop: 2,
  },
  inputError: {
    borderColor: "#DC2626",
    backgroundColor: "#FEF2F2",
  },
  errorText: {
    color: "#DC2626",
    fontSize: 11,
    marginTop: 4,
    marginLeft: 2,
  },
  textArea: {
    minHeight: 60,
    textAlignVertical: 'top',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  dropdownField: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: "#F9FAFB",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginTop: 2,
    minHeight: 40,
  },
  dropdownFieldText: {
    fontSize: 13,
    color: "#111827",
    flex: 1,
  },
  dropdownFieldPlaceholder: {
    color: "#9CA3AF",
  },
  dropdownOptionsContainer: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 6,
    marginTop: 4,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 3,
    overflow: 'hidden',
    zIndex: 1000,
  },
  dropdownOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  dropdownOptionSelected: {
    backgroundColor: "#F0F7FF",
  },
  dropdownOptionText: {
    fontSize: 13,
    color: "#374151",
    flex: 1,
  },
  dropdownOptionTextSelected: {
    color: "#004f89",
    fontWeight: '600',
  },
  contactInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: "#F9FAFB",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 6,
    marginTop: 2,
    overflow: 'hidden',
  },
  contactPrefix: {
    fontSize: 13,
    color: "#111827",
    fontWeight: '600',
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: "#E5E7EB",
    borderRightWidth: 1,
    borderRightColor: "#D1D5DB",
  },
  contactInput: {
    flex: 1,
    fontSize: 13,
    color: "#111827",
    paddingHorizontal: 10,
    paddingVertical: 8,
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
  deleteAccountButtonContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingBottom: 10,
    backgroundColor: '#F9FAFB',
  },
  deleteAccountButton: {
    width: '100%',
    backgroundColor: 'transparent',
    borderRadius: 8,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#991B1B',
    justifyContent: 'center',
    alignItems: 'center',
  },
  deleteAccountButtonDisabled: {
    backgroundColor: 'transparent',
    opacity: 0.6,
    borderColor: '#E5E7EB',
  },
  deleteAccountButtonText: {
    color: '#991B1B',
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
  },
  bottomButtonContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingBottom: 10,
    backgroundColor: '#F9FAFB',
    gap: 12,
  },
  bottomButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottomCancelButton: {
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  bottomCancelButtonText: {
    color: '#374151',
    fontSize: 14,
    fontWeight: '700',
  },
  bottomSaveButton: {
    backgroundColor: '#004f89',
  },
  bottomSaveButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  bottomButtonDisabled: {
    opacity: 0.6,
  },
  // Modal styles
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

export default StudentProfile;

