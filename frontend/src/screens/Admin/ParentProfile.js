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

const ParentProfile = () => {
  const route = useRoute();
  const navigation = useNavigation();
  const parent = route?.params?.parent || {};

  const defaultProfile = require("../../assets/icons/unknown avatar icon.jpg");

  const [profilePic, setProfilePic] = useState(defaultProfile);
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [isLinked, setIsLinked] = useState(false);
  const [linkedStudents, setLinkedStudents] = useState([]);
  const [fieldErrors, setFieldErrors] = useState({});
  const [currentParent, setCurrentParent] = useState(parent);
  const [expandedDropdown, setExpandedDropdown] = useState(null); // 'gender' | null
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
    firstName: parent?.firstName || '',
    middleName: parent?.middleName || '',
    lastName: parent?.lastName || '',
    email: parent?.email || '',
    contactNumber: parent?.contactNumber || parent?.contact || '',
    gender: parent?.gender || '',
    age: parent?.age || '',
    birthday: parent?.birthday || '',
    address: parent?.address || '',
  });

  // Initialize currentParent from route params
  useEffect(() => {
    if (parent?.id) {
      setCurrentParent(parent);
    }
  }, [parent?.id]);

  useEffect(() => {
    const birthday = currentParent?.birthday || '';
    const calculatedAge = calculateAgeFromBirthday(birthday) || currentParent?.age || '';
    
    setEditedData({
      firstName: currentParent?.firstName || '',
      middleName: currentParent?.middleName || '',
      lastName: currentParent?.lastName || '',
      email: currentParent?.email || '',
      contactNumber: currentParent?.contactNumber || currentParent?.contact || '',
      gender: currentParent?.gender || '',
      age: calculatedAge,
      birthday: birthday,
      address: currentParent?.address || '',
    });
  }, [currentParent]);

  // ✅ Load saved images
  useEffect(() => {
    const loadImages = async () => {
      try {
        const keyBase = currentParent?.parentId ? String(currentParent.parentId) : String(currentParent?.id || currentParent?.uid || '');
        if (!keyBase) return;
        
        const savedProfile = await AsyncStorage.getItem(`profilePic_${keyBase}`);

        if (savedProfile) setProfilePic({ uri: savedProfile });
      } catch (error) {
        console.log("Error loading images:", error);
      }
    };
    loadImages();
  }, [currentParent?.parentId, currentParent?.id, currentParent?.uid]);

  // ✅ Check linked students status
  useEffect(() => {
    const checkLinkedStatus = async () => {
      try {
        const parentId = currentParent?.parentId || currentParent?.id || currentParent?.uid;
        if (!parentId) {
          setIsLinked(false);
          setLinkedStudents([]);
          return;
        }
        
        await withNetworkErrorHandling(async () => {
          const linksQuery = query(collection(db, 'parent_student_links'), where('parentId', '==', parentId), where('status', '==', 'active'));
          const linksSnap = await getDocs(linksQuery);
          
          if (!linksSnap.empty) {
            setIsLinked(true);
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
            setIsLinked(false);
            setLinkedStudents([]);
          }
        });
      } catch (error) {
        console.log("Error checking linked status:", error);
        const errorInfo = getNetworkErrorMessage(error);
        if (error.type === 'no_internet' || error.type === 'timeout' || error.type === 'unstable_connection') {
          setNetworkErrorTitle(errorInfo.title);
          setNetworkErrorMessage(errorInfo.message);
          setNetworkErrorColor(errorInfo.color);
          setNetworkErrorVisible(true);
          setTimeout(() => setNetworkErrorVisible(false), 5000);
        }
        setIsLinked(false);
        setLinkedStudents([]);
      }
    };
    checkLinkedStatus();
  }, [currentParent?.parentId, currentParent?.id, currentParent?.uid]);

  const fullName = `${currentParent?.lastName || ""}, ${currentParent?.firstName || ""} ${currentParent?.middleName || ""}`.trim();

  // Dropdown options
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

  // Validation function
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
      case 'email':
        // Email is non-editable, so no validation needed
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
      safeTrim(editedData.firstName) !== safeTrim(currentParent?.firstName) ||
      safeTrim(editedData.middleName) !== safeTrim(currentParent?.middleName) ||
      safeTrim(editedData.lastName) !== safeTrim(currentParent?.lastName) ||
      safeTrim(editedData.contactNumber) !== safeTrim(currentParent?.contactNumber || currentParent?.contact) ||
      safeTrim(editedData.gender) !== safeTrim(currentParent?.gender) ||
      safeTrim(editedData.birthday) !== safeTrim(currentParent?.birthday) ||
      safeTrim(editedData.address) !== safeTrim(currentParent?.address)
    );
  };

  const handleSave = async () => {
    if (!currentParent?.id) {
      Alert.alert('Error', 'Parent ID not found');
      return;
    }

    // Validate all fields before saving
    const errors = {};
    const fieldsToValidate = ['firstName', 'lastName', 'middleName', 'contactNumber', 'gender', 'birthday', 'address'];
    
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
        const parentDocRef = doc(db, 'users', currentParent.id);
        
        // Calculate age from birthday before saving
        const finalAge = editedData.birthday ? calculateAgeFromBirthday(editedData.birthday) : editedData.age;
        
        // Prepare update data
        const safeTrim = (val) => String(val || '').trim();
        const updateData = {
          firstName: safeTrim(editedData.firstName) || null,
          middleName: safeTrim(editedData.middleName) || null,
          lastName: safeTrim(editedData.lastName) || null,
          email: safeTrim(editedData.email) || null,
          contactNumber: safeTrim(editedData.contactNumber) || null,
          contact: safeTrim(editedData.contactNumber) || null, // Also update contact field for compatibility
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

        await updateDoc(parentDocRef, updateData);
        
        // Clear errors and exit edit mode
        setFieldErrors({});
        setIsEditing(false);
        
        // Close confirmation modal first
        setConfirmVisible(false);
        
        // Show success feedback
        setFeedbackTitle('Success');
        setFeedbackMessage('Parent information updated successfully');
        setFeedbackTextColor('#16A34A');
        setFeedbackVisible(true);
        
        // Auto-hide feedback modal after 3 seconds
        setTimeout(() => {
          setFeedbackVisible(false);
        }, 3000);
      });
    } catch (error) {
      console.error('Error updating parent:', error);
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
        setFeedbackMessage(`Failed to update parent information: ${error.message}`);
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

  // Auto-close validation error modal after 3 seconds
  useEffect(() => {
    if (validationErrorVisible) {
      const timer = setTimeout(() => {
        setValidationErrorVisible(false);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [validationErrorVisible]);

  // Helper function to delete all documents related to a parent
  const deleteAllParentRelatedDocuments = async (parent) => {
    const targetParentId = parent.id || parent.uid;
    if (!targetParentId) {
      throw new Error('Parent ID is required');
    }

    const targetParentUid = parent.uid || parent.id;
    const targetParentIdNumber = parent.parentId || parent.parentIdNumber || targetParentId;
    
    // Collect all possible parent identifiers
    const parentIdentifiers = new Set([
      targetParentId,
      targetParentUid,
      targetParentIdNumber,
      parent.parentId,
      parent.parentIdNumber,
      parent.uid,
    ].filter(Boolean));

    // Delete from parent_student_links
    try {
      const allLinksToDelete = new Set();
      
      for (const pid of parentIdentifiers) {
        const queries = [
          query(collection(db, 'parent_student_links'), where('parentId', '==', pid)),
          query(collection(db, 'parent_student_links'), where('parentIdNumber', '==', pid)),
          query(collection(db, 'parent_student_links'), where('parentUid', '==', pid)),
          query(collection(db, 'parent_student_links'), where('uid', '==', pid)),
        ];
        
        for (const q of queries) {
          try {
            const snap = await getDocs(q);
            snap.docs.forEach(d => allLinksToDelete.add(d.id));
          } catch (e) {
            // Continue on error
          }
        }
      }
      
      // Delete collected links
      if (allLinksToDelete.size > 0) {
        const deletePromises = Array.from(allLinksToDelete).map(linkId => 
          deleteDoc(doc(db, 'parent_student_links', linkId))
        );
        await Promise.all(deletePromises);
      }
    } catch (e) {
      console.log('Error deleting parent_student_links:', e);
    }

    // Delete from conversations - delete all conversations involving this parent
    try {
      console.log(`🔍 Deleting all conversations for parent: ${targetParentId}`);
      
      // Collect all possible parent identifiers
      const allParentIds = Array.from(parentIdentifiers);
      
      // Delete all conversations for this parent (handles both parent-student conversations)
      await deleteAllUserConversations(targetParentId, allParentIds);
      
      console.log(`✅ Completed conversation deletion for parent`);
    } catch (e) {
      console.log('Error deleting conversations:', e);
    }

    // Delete from parent_alerts
    try {
      const allParentAlertsToDelete = new Set();
      
      for (const pid of parentIdentifiers) {
        try {
          await deleteDoc(doc(db, 'parent_alerts', pid));
        } catch (e) {
          // Document might not exist
        }
        
        const queries = [
          query(collection(db, 'parent_alerts'), where('parentId', '==', pid)),
          query(collection(db, 'parent_alerts'), where('parentIdNumber', '==', pid)),
          query(collection(db, 'parent_alerts'), where('parentUid', '==', pid)),
          query(collection(db, 'parent_alerts'), where('uid', '==', pid)),
        ];
        
        for (const q of queries) {
          try {
            const snap = await getDocs(q);
            snap.docs.forEach(d => allParentAlertsToDelete.add(d.id));
          } catch (e) {
            // Continue on error
          }
        }
      }
      
      const deletePromises = Array.from(allParentAlertsToDelete).map(alertId => 
        deleteDoc(doc(db, 'parent_alerts', alertId))
      );
      await Promise.all(deletePromises);
    } catch (e) {
      console.log('Error deleting parent_alerts:', e);
    }

    // Delete from linked_students
    try {
      const allLinkedStudentsToDelete = new Set();
      
      for (const pid of parentIdentifiers) {
        try {
          await deleteDoc(doc(db, 'linked_students', pid));
        } catch (e) {
          // Document might not exist
        }
        
        const queries = [
          query(collection(db, 'linked_students'), where('parentId', '==', pid)),
          query(collection(db, 'linked_students'), where('parentIdNumber', '==', pid)),
          query(collection(db, 'linked_students'), where('parentUid', '==', pid)),
          query(collection(db, 'linked_students'), where('uid', '==', pid)),
        ];
        
        for (const q of queries) {
          try {
            const snap = await getDocs(q);
            snap.docs.forEach(d => allLinkedStudentsToDelete.add(d.id));
          } catch (e) {
            // Continue on error
          }
        }
      }
      
      const deletePromises = Array.from(allLinkedStudentsToDelete).map(docId => 
        deleteDoc(doc(db, 'linked_students', docId))
      );
      await Promise.all(deletePromises);
    } catch (e) {
      console.log('Error deleting linked_students:', e);
    }

    // Delete from linked_parents
    try {
      const allLinkedParentsToDelete = new Set();
      
      for (const pid of parentIdentifiers) {
        const queries = [
          query(collection(db, 'linked_parents'), where('parentId', '==', pid)),
          query(collection(db, 'linked_parents'), where('parentIdNumber', '==', pid)),
          query(collection(db, 'linked_parents'), where('parentUid', '==', pid)),
          query(collection(db, 'linked_parents'), where('uid', '==', pid)),
        ];
        
        for (const q of queries) {
          try {
            const snap = await getDocs(q);
            snap.docs.forEach(d => allLinkedParentsToDelete.add(d.id));
          } catch (e) {
            // Continue on error
          }
        }
      }
      
      const deletePromises = Array.from(allLinkedParentsToDelete).map(docId => 
        deleteDoc(doc(db, 'linked_parents', docId))
      );
      await Promise.all(deletePromises);
    } catch (e) {
      console.log('Error deleting linked_parents:', e);
    }

    // Delete from student_alerts
    try {
      const allStudentAlertsToDelete = new Set();
      
      for (const pid of parentIdentifiers) {
        const queries = [
          query(collection(db, 'student_alerts'), where('parentId', '==', pid)),
          query(collection(db, 'student_alerts'), where('parentIdNumber', '==', pid)),
          query(collection(db, 'student_alerts'), where('parentUid', '==', pid)),
          query(collection(db, 'student_alerts'), where('uid', '==', pid)),
        ];
        
        for (const q of queries) {
          try {
            const snap = await getDocs(q);
            snap.docs.forEach(d => allStudentAlertsToDelete.add(d.id));
          } catch (e) {
            // Continue on error
          }
        }
      }
      
      const deletePromises = Array.from(allStudentAlertsToDelete).map(docId => 
        deleteDoc(doc(db, 'student_alerts', docId))
      );
      await Promise.all(deletePromises);
    } catch (e) {
      console.log('Error deleting student_alerts:', e);
    }

    // Finally, delete from users collection (delete last)
    await deleteDoc(doc(db, 'users', targetParentId));
  };

  const deleteParentAccount = async () => {
    if (!currentParent?.id) return;
    
    setDeletingAccount(true);
    try {
      await withNetworkErrorHandling(async () => {
        console.log('🗑️ Starting parent deletion for:', currentParent.id);
        console.log('🔍 Detail parent object:', currentParent);
        
        await deleteAllParentRelatedDocuments(currentParent);
      
      console.log('✅ Successfully deleted all parent-related documents');

      // Create activity log entry
      try {
        const activityLogRef = doc(db, 'admin_activity_logs', 'global');
        const activityLogSnap = await getDoc(activityLogRef);
        const existingLogs = activityLogSnap.exists() ? (Array.isArray(activityLogSnap.data()?.items) ? activityLogSnap.data().items : []) : [];
        const newLog = {
          id: `parent_deleted_${Date.now()}`,
          type: 'parent_deleted',
          title: 'Parent Account Deleted',
          message: `Deleted parent account: ${currentParent.firstName} ${currentParent.lastName} (${currentParent.parentId})`,
          createdAt: new Date().toISOString(),
          status: 'unread',
          parent: {
            id: currentParent.id,
            firstName: currentParent.firstName,
            lastName: currentParent.lastName,
            parentId: currentParent.parentId,
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
      setDeleteFeedbackMessage('Parent account deleted successfully');
      setDeleteFeedbackVisible(true);
      
      setTimeout(() => {
        setDeleteFeedbackVisible(false);
        // Navigate back to ParentManagement immediately to refresh the list
        // The ParentManagement screen will automatically refresh via useFocusEffect
        navigation.goBack();
      }, 3000);
      });
    } catch (error) {
      console.error('Error deleting parent:', error);
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
        setDeleteFeedbackMessage('Failed to delete parent account');
        setDeleteFeedbackVisible(true);
        setTimeout(() => {
          setDeleteFeedbackVisible(false);
        }, 3000);
      }
    }
  };

  // Real-time listener for parent data updates
  useEffect(() => {
    if (!parent?.id) return;

    const parentDocRef = doc(db, 'users', parent.id);
    const unsubscribe = onSnapshot(parentDocRef, (snapshot) => {
      if (snapshot.exists()) {
        const updatedData = { id: snapshot.id, ...snapshot.data() };
        setCurrentParent(updatedData);
        // Update editedData if not in edit mode
        if (!isEditing) {
          const birthday = updatedData?.birthday || '';
          const calculatedAge = calculateAgeFromBirthday(birthday) || updatedData?.age || '';
          setEditedData({
            firstName: updatedData?.firstName || '',
            middleName: updatedData?.middleName || '',
            lastName: updatedData?.lastName || '',
            email: updatedData?.email || '',
            contactNumber: updatedData?.contactNumber || updatedData?.contact || '',
            gender: updatedData?.gender || '',
            age: calculatedAge,
            birthday: birthday,
            address: updatedData?.address || '',
          });
        }
      }
    }, (error) => {
      console.log('Error listening to parent updates:', error);
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
  }, [parent?.id, isEditing]);

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
                {(currentParent?.lastName?.[0] || 'P').toUpperCase()}
              </Text>
            </View>
            <View style={styles.nameSection}>
              <Text style={styles.fullName}>{fullName || "Parent"}</Text>
              <View style={styles.chipsRow}>
                <View style={[styles.chip, isLinked ? styles.chipLinked : styles.chipUnlinked]}>
                  <Ionicons name={isLinked ? "link" : "unlink"} size={12} color={isLinked ? "#16A34A" : "#DC2626"} />
                  <Text style={[styles.chipText, isLinked ? styles.chipTextLinked : styles.chipTextUnlinked]}>
                    {isLinked ? "LINKED" : "UNLINKED"}
                  </Text>
                </View>
                {!!currentParent?.parentId && (
                  <View style={[styles.chip, { backgroundColor: "#DBEAFE" }]}>
                    <Ionicons name="id-card-outline" size={12} color="#2563eb" />
                    <Text style={[styles.chipText, { color: "#2563eb", fontSize: 11 }]}>ID: {currentParent.parentId}</Text>
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
            <Text style={styles.label}>Parent ID</Text>
            <Text style={styles.value}>{currentParent?.parentId || "—"}</Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.label}>Email</Text>
            <Text style={styles.value}>{currentParent?.email || "—"}</Text>
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
              <Text style={styles.value}>{currentParent?.contactNumber || currentParent?.contact || "—"}</Text>
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
              <Text style={styles.value}>{currentParent?.gender || "—"}</Text>
            )}
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.label}>Age</Text>
            <Text style={styles.value}>{editedData.age || currentParent?.age || "—"}</Text>
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
                  if (!currentParent?.birthday) return '—'; 
                  try { 
                    const d = new Date(currentParent.birthday); 
                    if (isNaN(d.getTime())) return String(currentParent.birthday); 
                    return d.toLocaleDateString(); 
                  } catch { 
                    return String(currentParent.birthday); 
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
                {currentParent?.address || "—"}
              </Text>
            )}
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
              const birthday = currentParent?.birthday || '';
              const calculatedAge = calculateAgeFromBirthday(birthday) || currentParent?.age || '';
              setEditedData({
                firstName: currentParent?.firstName || '',
                middleName: currentParent?.middleName || '',
                lastName: currentParent?.lastName || '',
                email: currentParent?.email || '',
                contactNumber: currentParent?.contactNumber || currentParent?.contact || '',
                gender: currentParent?.gender || '',
                age: calculatedAge,
                birthday: birthday,
                address: currentParent?.address || '',
              });
            }}
          >
            <Text style={styles.bottomCancelButtonText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.bottomButton, styles.bottomSaveButton, (saving || !hasChanges() || Object.values(fieldErrors).some(e => e !== '')) && styles.bottomButtonDisabled]}
            onPress={() => setConfirmVisible(true)}
            disabled={saving || !hasChanges() || Object.values(fieldErrors).some(e => e !== '')}
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

      {/* Delete Parent Confirmation Modal */}
      <Modal transparent animationType="fade" visible={deleteConfirmVisible} onRequestClose={() => !deletingAccount && setDeleteConfirmVisible(false)}>
        <View style={styles.modalOverlayCenter}>
          <View style={styles.fbModalCard}>
            <View style={styles.fbModalContent}>
              <Text style={styles.fbModalTitle}>Delete Parent?</Text>
              <Text style={styles.fbModalMessage}>Are you sure you want to delete this parent account? This cannot be undone.</Text>
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
                    await deleteParentAccount();
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
  chipLinked: {
    backgroundColor: "#DCFCE7",
    borderWidth: 1,
    borderColor: "#86EFAC",
  },
  chipUnlinked: {
    backgroundColor: "#FEE2E2",
    borderWidth: 1,
    borderColor: "#FCA5A5",
  },
  chipTextLinked: { color: "#16A34A", fontWeight: "700", fontSize: 11 },
  chipTextUnlinked: { color: "#DC2626", fontWeight: "700", fontSize: 11 },
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
});

export default ParentProfile;

