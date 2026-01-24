import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Alert,
  TouchableOpacity,
  Modal,
  ScrollView,
  TextInput,
  Platform,
  KeyboardAvoidingView,
  SafeAreaView,
  Keyboard,
  BackHandler,
  ImageBackground,
  Image,
  Dimensions,
  useWindowDimensions,
} from 'react-native';
import theme from '../../utils/theme';
import { Ionicons } from '@expo/vector-icons';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { useNavigation, useRoute } from '@react-navigation/native';
import { auth, db } from '../../utils/firebaseConfig';
import DateTimePicker from '@react-native-community/datetimepicker';

// Local InputField definition with validation and error display
const InputField = ({
  label,
  value,
  onChangeText,
  placeholder,
  secureTextEntry = false,
  editable = true,
  keyboardType = 'default',
  autoCapitalize = 'sentences',
  style = {},
  error = '',
  onBlur = () => {},
  maxLength,
}) => {
  return (
    <View style={styles.inputContainer}>
      {label && <Text style={styles.label}>{label}</Text>}
      <TextInput
        style={[styles.input, error ? styles.inputError : null, style]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        secureTextEntry={secureTextEntry}
        editable={editable}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        placeholderTextColor="#9CA3AF"
        onBlur={onBlur}
        maxLength={maxLength}
      />
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </View>
  );
};

// Custom Calendar Picker Component
const CalendarPicker = ({ onDateSelect, selectedDate, maxDate, minDate, currentYear, onYearChange }) => {
  // Convert string date to Date object if needed
  const getDateFromSelected = () => {
    if (selectedDate instanceof Date) {
      return selectedDate;
    } else if (typeof selectedDate === 'string' && selectedDate) {
      return new Date(selectedDate);
    }
    return new Date();
  };
  
  const [currentMonth, setCurrentMonth] = useState(getDateFromSelected());
  
  // Update currentMonth when selectedDate changes
  React.useEffect(() => {
    if (selectedDate) {
      setCurrentMonth(getDateFromSelected());
    }
  }, [selectedDate]);
  
  // Update currentMonth when currentYear changes
  React.useEffect(() => {
    if (currentYear) {
      setCurrentMonth(prev => {
        const newMonth = new Date(currentYear, prev.getMonth(), 1);
        // Only update if year actually changed
        if (newMonth.getFullYear() !== prev.getFullYear()) {
          return newMonth;
        }
        return prev;
      });
    }
  }, [currentYear]);
  
  // Update currentYear when navigating to different months - only call onYearChange when month changes
  const prevMonthRef = React.useRef(currentMonth);
  React.useEffect(() => {
    if (onYearChange && currentMonth) {
      const currentYear = currentMonth.getFullYear();
      const prevYear = prevMonthRef.current?.getFullYear();
      // Only call onYearChange if year actually changed
      if (currentYear !== prevYear) {
        onYearChange(currentYear);
      }
    }
    prevMonthRef.current = currentMonth;
  }, [currentMonth, onYearChange]);
  
  const getDaysInMonth = (date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();
    
    const days = [];
    
    // Add empty cells for days before the first day of the month
    for (let i = 0; i < startingDayOfWeek; i++) {
      days.push(null);
    }
    
    // Add all days of the month
    for (let i = 1; i <= daysInMonth; i++) {
      days.push(new Date(year, month, i));
    }
    
    return days;
  };
  
  const goToPreviousMonth = () => {
    const newMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1);
    setCurrentMonth(newMonth);
    // Update year dropdown if we crossed year boundary
    if (newMonth.getFullYear() !== currentMonth.getFullYear()) {
      onYearChange && onYearChange(newMonth.getFullYear());
    }
  };
  
  const goToNextMonth = () => {
    const newMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1);
    setCurrentMonth(newMonth);
    // Update year dropdown if we crossed year boundary
    if (newMonth.getFullYear() !== currentMonth.getFullYear()) {
      onYearChange && onYearChange(newMonth.getFullYear());
    }
  };
  
  const isDateDisabled = (date) => {
    return date < minDate || date > maxDate;
  };
  
  const isDateSelected = (date) => {
    if (!selectedDate) return false;
    
    let compareDate;
    if (selectedDate instanceof Date) {
      compareDate = selectedDate;
    } else if (typeof selectedDate === 'string' && selectedDate) {
      compareDate = new Date(selectedDate);
    } else {
      return false;
    }
    
    return date.getDate() === compareDate.getDate() &&
           date.getMonth() === compareDate.getMonth() &&
           date.getFullYear() === compareDate.getFullYear();
  };
  
  const handleDatePress = (date) => {
    if (date && !isDateDisabled(date)) {
      onDateSelect(date);
    }
  };
  
  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  
  const days = getDaysInMonth(currentMonth);
  
  return (
    <View style={styles.calendarContainer}>
      {/* Month Navigation */}
      <View style={styles.calendarHeader}>
        <TouchableOpacity onPress={goToPreviousMonth} style={styles.calendarNavButton}>
          <Ionicons name="chevron-back" size={20} color="#374151" />
        </TouchableOpacity>
        <Text style={styles.calendarMonthText}>
          {monthNames[currentMonth.getMonth()]} {currentMonth.getFullYear()}
        </Text>
        <TouchableOpacity onPress={goToNextMonth} style={styles.calendarNavButton}>
          <Ionicons name="chevron-forward" size={20} color="#374151" />
        </TouchableOpacity>
      </View>
      
      {/* Day Names */}
      <View style={styles.calendarDaysHeader}>
        {dayNames.map((day, index) => (
          <Text key={index} style={styles.calendarDayName}>{day}</Text>
        ))}
      </View>
      
      {/* Calendar Grid */}
      <View style={styles.calendarGrid}>
        {days.map((date, index) => (
          <TouchableOpacity
            key={index}
            style={[
              styles.calendarDay,
              date && isDateSelected(date) && styles.calendarDaySelected,
              date && isDateDisabled(date) && styles.calendarDayDisabled
            ]}
            onPress={() => handleDatePress(date)}
            disabled={!date || isDateDisabled(date)}
          >
            <Text style={[
              styles.calendarDayText,
              date && isDateSelected(date) && styles.calendarDayTextSelected,
              date && isDateDisabled(date) && styles.calendarDayTextDisabled
            ]}>
              {date ? date.getDate() : ''}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
};

const RegisterScreen = () => {
  const navigation = useNavigation();
  const route = useRoute();
  const { role } = route.params || {};
  const { height: windowHeight } = useWindowDimensions();

  // States
  const [lastName, setLastName] = useState('');
  const [firstName, setFirstName] = useState('');
  const [middleName, setMiddleName] = useState('');
  const [gender, setGender] = useState('');
  const [age, setAge] = useState('');
  const [birthday, setBirthday] = useState(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [contactNumber, setContactNumber] = useState('');
  const [address, setAddress] = useState('');
  const [course, setCourse] = useState('');
  const [section, setSection] = useState('');
  const [yearLevel, setYearLevel] = useState('');
  const [studentId, setStudentId] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [passwordDisplay, setPasswordDisplay] = useState('');
  const [confirmPasswordDisplay, setConfirmPasswordDisplay] = useState('');
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  // Handle keyboard events
  React.useEffect(() => {
    const keyboardDidShowListener = Keyboard.addListener('keyboardDidShow', (event) => {
      setKeyboardVisible(true);
      setKeyboardHeight(event.endCoordinates.height);
    });
    const keyboardDidHideListener = Keyboard.addListener('keyboardDidHide', () => {
      setKeyboardVisible(false);
      setKeyboardHeight(0);
    });

    return () => {
      keyboardDidShowListener?.remove();
      keyboardDidHideListener?.remove();
    };
  }, []);

  // Handle hardware back button on Android
  React.useEffect(() => {
    const backAction = () => {
      if (keyboardVisible) {
        Keyboard.dismiss();
        return true; // Prevent default behavior
      }
      return false; // Allow default behavior
    };

    const backHandler = BackHandler.addEventListener('hardwareBackPress', backAction);

    return () => backHandler.remove();
  }, [keyboardVisible]);

  // No longer need fixed container position - using natural flow with screen scroll

  // Store initial window dimensions to prevent background from resizing
  const [screenDimensions] = useState(() => {
    const dims = Dimensions.get('window');
    return dims;
  });

  // Simple password display logic
  React.useEffect(() => {
    setPasswordDisplay(showPassword ? password : '•'.repeat(password.length));
  }, [password, showPassword]);

  React.useEffect(() => {
    setConfirmPasswordDisplay(showConfirmPassword ? confirmPassword : '•'.repeat(confirmPassword.length));
  }, [confirmPassword, showConfirmPassword]);

  // Clean password input handlers
  const handlePasswordChange = (text) => {
    if (showPassword) {
      // When password is visible, just set the text directly
      setPassword(text);
    } else {
      // When password is hidden, we need to be more careful
      const currentPassword = password;
      
      // Calculate how many characters were actually added/removed
      const actualInputLength = text.length;
      const currentPasswordLength = currentPassword.length;
      
      if (actualInputLength < currentPasswordLength) {
        // User is deleting characters
        setPassword(text);
      } else if (actualInputLength > currentPasswordLength) {
        // User is adding characters
        const newChars = text.slice(currentPasswordLength);
        setPassword(currentPassword + newChars);
      } else {
        // Same length - might be a replacement or paste
        setPassword(text);
      }
    }
  };

  const handleConfirmPasswordChange = (text) => {
    if (showConfirmPassword) {
      // When password is visible, just set the text directly
      setConfirmPassword(text);
    } else {
      // When password is hidden, we need to be more careful
      const currentPassword = confirmPassword;
      
      // Calculate how many characters were actually added/removed
      const actualInputLength = text.length;
      const currentPasswordLength = currentPassword.length;
      
      if (actualInputLength < currentPasswordLength) {
        // User is deleting characters
        setConfirmPassword(text);
      } else if (actualInputLength > currentPasswordLength) {
        // User is adding characters
        const newChars = text.slice(currentPasswordLength);
        setConfirmPassword(currentPassword + newChars);
      } else {
        // Same length - might be a replacement or paste
        setConfirmPassword(text);
      }
    }
  };

  const [loading, setLoading] = useState(false);
  const [expandedDropdown, setExpandedDropdown] = useState(null); // 'course' | 'section' | 'yearLevel' | 'gender' | null
  const [errorModalVisible, setErrorModalVisible] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const errorTimerRef = useRef(null);
  const [successModalVisible, setSuccessModalVisible] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const successTimerRef = useRef(null);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [termsModalVisible, setTermsModalVisible] = useState(false);

  // Validation states
  const [errors, setErrors] = useState({});
  const [touched, setTouched] = useState({});
  const [validationErrors, setValidationErrors] = useState([]);

  const genderOptions = ['Male', 'Female'];
  // Course options match StudentManagement.js DEFAULT_COURSES
  const courseOptions = ['BSAIS', 'BSBA', 'BSCRIM', 'BSHM', 'BSIT', 'BSTM', 'BTLED'];
  const sectionOptions = ['A', 'B', 'C', 'D'];
  const yearOptions = ['1st Year', '2nd Year', '3rd Year', '4th Year'];

  // Expandable Dropdown Component
  const ExpandableDropdown = ({ field, options, selectedValue, onSelect, error, placeholder, formatLabel }) => {
    const isExpanded = expandedDropdown === field;
    
    return (
      <View style={styles.dropdownWrapper}>
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
            size={16} 
            color="#6B7280" 
          />
        </TouchableOpacity>
        {isExpanded && (
          <View style={styles.dropdownOptionsContainer}>
            <ScrollView nestedScrollEnabled style={{ maxHeight: 300 }}>
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
                    <Ionicons name="checkmark" size={16} color={theme.colors.primary} />
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}
      </View>
    );
  };

  // Validation helpers
  const isAllowedRegistrationRole = (r) => {
    if (!r || typeof r !== 'string') return false;
    const normalized = r.toLowerCase();
    return normalized === 'student' || normalized === 'parent';
  };

  React.useEffect(() => {
    if (!isAllowedRegistrationRole(role)) {
      setErrorMessage('Registration is only available for Student or Parent accounts.');
      setErrorModalVisible(true);
      try { if (errorTimerRef.current) { clearTimeout(errorTimerRef.current); } } catch {}
      errorTimerRef.current = setTimeout(() => {
        setErrorModalVisible(false);
        navigation.goBack();
      }, 1500);
    }
  }, [role]);
  React.useEffect(() => {
    // Cleanup timers on unmount
    return () => {
      try { if (errorTimerRef.current) { clearTimeout(errorTimerRef.current); } } catch {}
      try { if (successTimerRef.current) { clearTimeout(successTimerRef.current); } } catch {}
    };
  }, []);
  const handleAlphabetic = (text, setter, maxLength = 20) => {
    const filtered = text.replace(/[^A-Za-z ]/g, '').slice(0, maxLength);
    setter(filtered);
  };

  const handleStrictNumeric = (text, setter, maxLength) => {
    const filtered = text.replace(/[^0-9]/g, '').slice(0, maxLength);
    setter(filtered);
  };

  const handleAlphanumericAddress = (text, setter, maxLength = 50) => {
    const filtered = text.replace(/[^A-Za-z0-9\s,.-]/g, '').slice(0, maxLength);
    setter(filtered);
  };

  // Calculate age from birthday
  const calculateAge = (birthDate) => {
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    
    return age;
  };

  // Check if user is at least 15 years old
  const isMinimumAge = (birthDate) => {
    const age = calculateAge(birthDate);
    return age >= 15;
  };

  // Handle birthday date picker
  const handleBirthdayChange = (event, selectedDate) => {
    setShowDatePicker(false);
    if (selectedDate) {
      setBirthday(selectedDate);
      const calculatedAge = calculateAge(selectedDate);
      setAge(calculatedAge.toString());
    }
  };



  // Custom calendar picker modal
  const [showCalendarModal, setShowCalendarModal] = useState(false);
  const [showYearPicker, setShowYearPicker] = useState(false);
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
  
  // Generate year options from 1900 to current year
  const yearPickerOptions = Array.from(
    { length: new Date().getFullYear() - 1959 }, 
    (_, i) => new Date().getFullYear() - i
  );
  
  const openCalendarModal = () => {
    setShowCalendarModal(true);
    let birthYear = new Date().getFullYear();
    if (birthday instanceof Date) {
      birthYear = birthday.getFullYear();
    } else if (typeof birthday === 'string' && birthday) {
      birthYear = new Date(birthday).getFullYear();
    }
    setCurrentYear(birthYear);
  };

  const closeCalendarModal = () => {
    setShowCalendarModal(false);
  };

  const handleDateSelect = (selectedDate) => {
    // Check if user is at least 15 years old
    if (!isMinimumAge(selectedDate)) {
      setErrorMessage('You must be at least 15 years old to register. Please select a different birth date.');
      setErrorModalVisible(true);
      try { if (errorTimerRef.current) { clearTimeout(errorTimerRef.current); } } catch {}
      errorTimerRef.current = setTimeout(() => {
        setErrorModalVisible(false);
      }, 1500);
      return;
    }
    
    setBirthday(selectedDate);
    const calculatedAge = calculateAge(selectedDate);
    setAge(calculatedAge.toString());
    closeCalendarModal();
  };

  const showDatePickerModal = () => {
    console.log('Date picker modal triggered'); // Debug log
    if (Platform.OS === 'web') {
      // For web, we'll use the HTML date input
      return;
    }
    setShowDatePicker(true);
  };

  const handleStudentIdInput = (text) => {
    const digits = text.replace(/[^0-9]/g, '').slice(0, 9);
    if (digits.length > 4) {
      setStudentId(digits.slice(0, 4) + '-' + digits.slice(4));
    } else {
      setStudentId(digits);
    }
  };

  // Contact number with +63 prefix
  const handleContactNumber = (text) => {
    // Remove +63 prefix for processing
    const cleanText = text.replace('+63', '');
    // Allow 10 digits after +63 (total length +63XXXXXXXXXX => 13 chars)
    const filtered = cleanText.replace(/[^0-9]/g, '').slice(0, 10);
    setContactNumber('+63' + filtered);
  };

  // Password validation
  const validatePassword = (password) => {
    const minLength = password.length >= 8;
    const maxLength = password.length <= 16;
    const hasNumber = /\d/.test(password);
    const hasSpecialChar = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password);
    
    return {
      minLength,
      maxLength,
      hasNumber,
      hasSpecialChar,
      isValid: minLength && maxLength && hasNumber && hasSpecialChar
    };
  };

  // Field validation
  const validateField = (fieldName, value) => {
    let error = '';
    
    switch (fieldName) {
      case 'lastName':
        if (!value.trim()) error = 'Last name is required';
        else if (value.trim().length < 2) error = 'Last name must be at least 2 characters';
        break;
      case 'firstName':
        if (!value.trim()) error = 'First name is required';
        else if (value.trim().length < 2) error = 'First name must be at least 2 characters';
        break;
      case 'middleName':
        if (!value.trim()) error = 'Middle name is required';
        else if (value.trim().length < 2) error = 'Middle name must be at least 2 characters';
        break;
      case 'gender':
        if (!value) error = 'Gender is required';
        break;
      case 'age':
        if (!value) error = 'Age is required';
        else if (parseInt(value) < 1 || parseInt(value) > 120) error = 'Age must be between 1 and 120';
        break;
      case 'birthday':
        if (!value) error = 'Birthday is required';
        else if (value instanceof Date && isNaN(value.getTime())) error = 'Please select a valid birthday';
        break;
      case 'contactNumber':
        if (!value || value === '+63') error = 'Contact number is required';
        else if (value.length < 13) error = 'Contact number must be complete (+63XXXXXXXXXX)';
        break;
      case 'address':
        if (!value.trim()) error = 'Address is required';
        else if (value.trim().length < 5) error = 'Address must be at least 5 characters';
        break;
      case 'course':
        if (role !== 'parent' && !value) error = 'Course is required';
        break;
      case 'section':
        if (role !== 'parent' && !value) error = 'Section is required';
        break;
      case 'yearLevel':
        if (role !== 'parent' && !value) error = 'Year level is required';
        break;
      case 'studentId':
        if (role !== 'parent' && !value) error = 'Student ID is required';
        else if (role !== 'parent' && value.length !== 10) error = 'Student ID must be in XXXX-XXXXX format';
        break;
      case 'email':
        if (!value.trim()) error = 'Email is required';
        else if (!/\S+@\S+\.\S+/.test(value.trim())) error = 'Please enter a valid email address';
        break;
      case 'password':
        if (!value) error = 'Password is required';
        else {
          const validation = validatePassword(value);
          if (!validation.isValid) {
            const issues = [];
            if (!validation.minLength) issues.push('at least 8 characters');
            if (!validation.maxLength) issues.push('maximum 16 characters');
            if (!validation.hasNumber) issues.push('at least one number');
            if (!validation.hasSpecialChar) issues.push('at least one special character');
            error = `Password must have: ${issues.join(', ')}`;
          }
        }
        break;
      case 'confirmPassword':
        if (!value) error = 'Please confirm your password';
        else if (value !== password) error = 'Passwords do not match';
        break;
      case 'acceptedTerms':
        if (!value) error = 'You must accept the Terms and Policies to register';
        break;
      default:
        break;
    }
    
    return error;
  };

  // Handle field blur (validation trigger)
  const handleFieldBlur = (fieldName, valueOverride = null) => {
    setTouched(prev => ({ ...prev, [fieldName]: true }));
    
    let value;
    if (valueOverride !== null) {
      value = valueOverride;
    } else {
      switch (fieldName) {
        case 'lastName': value = lastName; break;
        case 'firstName': value = firstName; break;
        case 'middleName': value = middleName; break;
        case 'gender': value = gender; break;
        case 'age': value = age; break;
        case 'birthday': value = birthday; break;
        case 'contactNumber': value = contactNumber; break;
        case 'address': value = address; break;
        case 'course': value = course; break;
        case 'section': value = section; break;
        case 'yearLevel': value = yearLevel; break;
        case 'studentId': value = studentId; break;
        case 'email': value = email; break;
        case 'password': value = password; break;
        case 'confirmPassword': value = confirmPassword; break;
        default: break;
      }
    }
    
    const error = validateField(fieldName, value);
    setErrors(prev => ({ ...prev, [fieldName]: error }));
  };

  // Validate all fields before submission
  const validateAllFields = () => {
    const requiredFields = [
      'lastName',
      'firstName',
      'middleName',
      'gender',
      'age',
      'birthday',
      'contactNumber',
      'address',
      'email',
      'password',
      'confirmPassword',
      'acceptedTerms',
    ];

    if (role !== 'parent') {
      requiredFields.push('course', 'section', 'yearLevel', 'studentId');
    }

    const getFieldValue = (fieldName) => {
      switch (fieldName) {
        case 'lastName': return lastName;
        case 'firstName': return firstName;
        case 'middleName': return middleName;
        case 'gender': return gender;
        case 'age': return age;
        case 'birthday': return birthday;
        case 'contactNumber': return contactNumber;
        case 'address': return address;
        case 'course': return course;
        case 'section': return section;
        case 'yearLevel': return yearLevel;
        case 'studentId': return studentId;
        case 'email': return email;
        case 'password': return password;
        case 'confirmPassword': return confirmPassword;
        case 'acceptedTerms': return acceptedTerms;
        default: return undefined;
      }
    };

    const newErrors = {};
    requiredFields.forEach((field) => {
      const value = getFieldValue(field);
      const error = validateField(field, value);
      if (error) newErrors[field] = error;
    });

    // Mark all validated fields as touched so errors show up
    const touchedUpdates = {};
    requiredFields.forEach((f) => { touchedUpdates[f] = true; });
    setTouched(prev => ({ ...prev, ...touchedUpdates }));
    setErrors(prev => ({ ...prev, ...newErrors }));

    // Extra guard: minimum age enforcement at submit time
    if (birthday instanceof Date && !isMinimumAge(birthday)) {
      newErrors.birthday = 'You must be at least 15 years old';
      setErrors(prev => ({ ...prev, birthday: newErrors.birthday }));
    }

    return Object.keys(newErrors).length === 0;
  };

  // === GENERATE PARENT ID - FIXED VERSION ===
  const generateParentId = () => {
    // Generate 9 random digits (excluding the dash position)
    const digits = [];
    for (let i = 0; i < 9; i++) {
      digits.push(Math.floor(Math.random() * 10));
    }
    
    // Format as XXXX-XXXXX (4 digits, dash, 5 digits) - Total 9 digits
    const parentId = `${digits[0]}${digits[1]}${digits[2]}${digits[3]}-${digits[4]}${digits[5]}${digits[6]}${digits[7]}${digits[8]}`;
    return parentId;
  };

  // Clear validation errors when user starts typing
  const clearValidationErrors = () => {
    if (validationErrors.length > 0) {
      setValidationErrors([]);
    }
  };

  // Check for existing data
  const checkExistingData = async () => {
    const errors = [];
    
    try {
      // Check for existing email
      const emailQuery = query(collection(db, 'users'), where('email', '==', email.trim().toLowerCase()));
      const emailSnapshot = await getDocs(emailQuery);
      if (!emailSnapshot.empty) {
        errors.push('Email already exists');
      }
      
      // Check for existing contact number
      const contactQuery = query(collection(db, 'users'), where('contactNumber', '==', contactNumber));
      const contactSnapshot = await getDocs(contactQuery);
      if (!contactSnapshot.empty) {
        errors.push('Contact number already exists');
      }
      
      // Check for existing student ID (only for students)
      if (role !== 'parent' && studentId) {
        const studentIdQuery = query(collection(db, 'users'), where('studentId', '==', studentId));
        const studentIdSnapshot = await getDocs(studentIdQuery);
        if (!studentIdSnapshot.empty) {
          errors.push('Student ID already exists');
        }
      }
      
      return errors;
    } catch (error) {
      console.error('Error checking existing data:', error);
      return ['Error checking existing data'];
    }
  };

  // Register
  const handleRegister = async () => {
    // Disallow registration for admin or unknown roles
    if (!isAllowedRegistrationRole(role)) {
      setErrorMessage('Registration is only available for Student or Parent accounts.');
      setErrorModalVisible(true);
      try { if (errorTimerRef.current) { clearTimeout(errorTimerRef.current); } } catch {}
      errorTimerRef.current = setTimeout(() => {
        setErrorModalVisible(false);
      }, 1500);
      return;
    }
    // Check if terms are accepted
    if (!acceptedTerms) {
      handleFieldBlur('acceptedTerms', false);
      setErrorMessage('You must accept the Terms and Policies to register.');
      setErrorModalVisible(true);
      try { if (errorTimerRef.current) { clearTimeout(errorTimerRef.current); } } catch {}
      errorTimerRef.current = setTimeout(() => {
        setErrorModalVisible(false);
      }, 1500);
      return;
    }
    // Comprehensive validation of all fields
    const isValid = validateAllFields();
    if (!isValid) {
      setErrorMessage('Please fix the highlighted fields.');
      setErrorModalVisible(true);
      try { if (errorTimerRef.current) { clearTimeout(errorTimerRef.current); } } catch {}
      errorTimerRef.current = setTimeout(() => {
        setErrorModalVisible(false);
      }, 1500);
      return;
    }

    setLoading(true);
    try {
      // Check for existing data first
      const existingErrors = await checkExistingData();
      if (existingErrors.length > 0) {
        setValidationErrors(existingErrors);
        return;
      }

      // Create user account
      const userCredential = await createUserWithEmailAndPassword(auth, email.trim(), password);
      const user = userCredential.user;

      // Generate parentId for parent role
      const generatedParentId = role.toLowerCase() === 'parent' ? generateParentId() : null;

      // Prepare user data
      const normalizedRole = role.toLowerCase();
      const isStudentRole = normalizedRole === 'student';
      const userData = {
        uid: user.uid,
        lastName: lastName.trim(), 
        firstName: firstName.trim(), 
        middleName: middleName.trim(), 
        gender, 
        age: parseInt(age),
        birthday: birthday instanceof Date ? birthday.toISOString().split('T')[0] : null, 
        contactNumber, 
        address: address.trim(),
        course: normalizedRole === 'parent' ? '' : course,
        section: normalizedRole === 'parent' ? '' : section,
        yearLevel: normalizedRole === 'parent' ? '' : yearLevel,
        studentId: normalizedRole === 'parent' ? null : studentId,
        parentId: generatedParentId,
        email: email.trim().toLowerCase(), 
        role: normalizedRole,
        // Newly registered students must be verified by an admin
        // isVerify: false  -> show VerifyDashboard (cannot access other screens)
        // isVerify: true   -> allow full navigation
        isVerify: isStudentRole ? false : true,
        // Keep a simple status string for admin/debugging (optional)
        verificationStatus: isStudentRole ? 'pending' : 'approved',
        createdAt: new Date().toISOString(),
      };

      // Save to Firestore
      const documentId = role.toLowerCase() === 'parent' ? generatedParentId : studentId;
      await setDoc(doc(db, 'users', documentId), userData);

      console.log('User data saved to Firestore:', userData);

      // Show success modal, then navigate to Login (role-dependent)
      const successText = `Registration successful!${role === 'parent' ? `\n\nYour Parent ID is: ${generatedParentId}\n\nPlease save this ID for future reference.` : ''}`;
      try { if (successTimerRef.current) { clearTimeout(successTimerRef.current); } } catch {}
      setSuccessMessage(successText);
      setSuccessModalVisible(true);
      successTimerRef.current = setTimeout(() => {
        setSuccessModalVisible(false);
      }, 2000);
    } catch (error) {
      console.error('Registration error:', error);
      setErrorMessage(error.message || 'Registration failed');
      setErrorModalVisible(true);
      try { if (errorTimerRef.current) { clearTimeout(errorTimerRef.current); } } catch {}
      errorTimerRef.current = setTimeout(() => {
        setErrorModalVisible(false);
      }, 1500);
    } finally {
      setLoading(false);
    }
  };

  const { height: screenHeight } = screenDimensions;

  return (
    <View style={[styles.screenWrapper, { height: screenHeight }]}>
      <ImageBackground 
        source={require("../../assets/Rolescreen.png")} 
        style={styles.container}
        resizeMode="cover"
      >
        {/* Back Button */}
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => {
            if (keyboardVisible) {
              Keyboard.dismiss();
              // Small delay to ensure keyboard is dismissed before navigation
              setTimeout(() => {
                navigation.goBack();
              }, 100);
            } else {
              navigation.goBack();
            }
          }}
          activeOpacity={0.7}
        >
          <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          bounces={false}
          overScrollMode={Platform.OS === 'android' ? 'never' : 'auto'}
          scrollEventThrottle={16}
          onScrollBeginDrag={() => setExpandedDropdown(null)}
        >
          {/* Logo Container */}
          <View style={styles.logoContainer}>
            <TouchableOpacity
              activeOpacity={0.85}
              style={styles.logoButton}
            >
              <Image
                source={require("../../assets/SG.png")}
                style={styles.logo}
                resizeMode="contain"
              />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>
              <Text style={styles.headerTitleLarge}>S</Text>
              YNCHRO
              <Text style={styles.headerTitleLarge}>G</Text>
              ATE
            </Text>
          </View>

          <View style={styles.containerWrapper}>
            <View style={styles.innerContainer}>
        {role && (
          <Text style={styles.roleText}>
            Registering as: <Text style={styles.roleHighlight}>{role}</Text>
          </Text>
        )}
        <Text style={styles.title}>Register</Text>
        <Text style={styles.warningText}>
          ⚠️ Please ensure all information provided is accurate and legitimate. 
          False information may result in account suspension.
        </Text>

      <InputField
        label="Last Name"
        value={lastName}
        onChangeText={(text) => handleAlphabetic(text, setLastName, 20)}
        placeholder="Enter last name"
        error={touched.lastName ? errors.lastName : ''}
        onBlur={() => handleFieldBlur('lastName')}
        maxLength={20}
      />
      <InputField
        label="First Name"
        value={firstName}
        onChangeText={(text) => handleAlphabetic(text, setFirstName, 20)}
        placeholder="Enter first name"
        error={touched.firstName ? errors.firstName : ''}
        onBlur={() => handleFieldBlur('firstName')}
        maxLength={20}
      />
      <InputField
        label="Middle Name"
        value={middleName}
        onChangeText={(text) => handleAlphabetic(text, setMiddleName, 20)}
        placeholder="Enter middle name"
        error={touched.middleName ? errors.middleName : ''}
        onBlur={() => handleFieldBlur('middleName')}
        maxLength={20}
      />

      {/* Gender | Age | Birthday */}
      <View style={styles.row}>
        <View style={styles.rowInput}>
          <Text style={styles.label}>Gender</Text>
          <ExpandableDropdown
            field="gender"
            options={genderOptions}
            selectedValue={gender}
            onSelect={(value) => {
              setGender(value);
              // Validate with the new value immediately
              handleFieldBlur('gender', value);
            }}
            error={touched.gender ? errors.gender : ''}
            placeholder="Select"
          />
          {touched.gender && errors.gender && <Text style={styles.errorText}>{errors.gender}</Text>}
        </View>

        <View style={styles.rowInput}>
          <InputField
            label="Age"
            value={age}
            editable={false}
            placeholder="Auto"
            style={{ textAlign: 'center', backgroundColor: '#F3F4F6', width: '100%' }}
            error={touched.age ? errors.age : ''}
          />
        </View>
        <View style={styles.rowInput}>
          <TouchableOpacity 
            onPress={openCalendarModal} 
            activeOpacity={0.8}
            style={{ width: '100%' }}
          >
            <View pointerEvents="none" style={{ width: '100%' }}>
              <InputField
                label="Birthday"
                value={birthday instanceof Date ? birthday.toLocaleDateString() : (typeof birthday === 'string' ? birthday : '')}
                editable={false}
                placeholder="Select Birthdate"
                style={{ textAlign: 'center', backgroundColor: '#F0F9FF', width: '100%' }}
                error={touched.birthday ? errors.birthday : ''}
                onBlur={() => handleFieldBlur('birthday')}
              />
            </View>
          </TouchableOpacity>
        </View>
      </View>

      {/* Contact Number */}
      <InputField
        label="Contact Number"
        value={contactNumber}
        onChangeText={(text) => {
          handleContactNumber(text);
          clearValidationErrors();
        }}
        placeholder="+63XXXXXXXXXX"
        keyboardType="number-pad"
        error={touched.contactNumber ? errors.contactNumber : ''}
        onBlur={() => handleFieldBlur('contactNumber')}
        maxLength={13}
      />

      {/* Address */}
      <InputField
        label="Address"
        value={address}
        onChangeText={(text) => handleAlphanumericAddress(text, setAddress, 50)}
        placeholder="Enter address"
        error={touched.address ? errors.address : ''}
        onBlur={() => handleFieldBlur('address')}
        maxLength={50}
      />

      {/* Course | Year | Section */}
      {role !== 'parent' && (
        <View style={styles.row}>
          <View style={styles.rowInput}>
            <Text style={styles.label}>Course</Text>
            <ExpandableDropdown
              field="course"
              options={courseOptions}
              selectedValue={course}
              onSelect={(value) => {
                setCourse(value);
                // Validate with the new value immediately
                handleFieldBlur('course', value);
              }}
              error={touched.course ? errors.course : ''}
              placeholder="Select"
            />
            {touched.course && errors.course && <Text style={styles.errorText}>{errors.course}</Text>}
          </View>

          <View style={styles.rowInput}>
            <Text style={styles.label}>Year Level</Text>
            <ExpandableDropdown
              field="yearLevel"
              options={yearOptions}
              selectedValue={yearLevel}
              onSelect={(value) => {
                setYearLevel(value);
                // Validate with the new value immediately
                handleFieldBlur('yearLevel', value);
              }}
              error={touched.yearLevel ? errors.yearLevel : ''}
              placeholder="Select"
            />
            {touched.yearLevel && errors.yearLevel && <Text style={styles.errorText}>{errors.yearLevel}</Text>}
          </View>

          <View style={styles.rowInput}>
            <Text style={styles.label}>Section</Text>
            <ExpandableDropdown
              field="section"
              options={sectionOptions}
              selectedValue={section}
              onSelect={(value) => {
                setSection(value);
                // Validate with the new value immediately
                handleFieldBlur('section', value);
              }}
              error={touched.section ? errors.section : ''}
              placeholder="Select"
            />
            {touched.section && errors.section && <Text style={styles.errorText}>{errors.section}</Text>}
          </View>
        </View>
      )}

      {/* Student ID */}
      {role !== 'parent' && (
        <InputField
          label="Student ID"
          value={studentId}
          onChangeText={(text) => {
            handleStudentIdInput(text);
            clearValidationErrors();
          }}
          keyboardType="number-pad"
          placeholder="Enter your student ID, e.g. (2022-00689)"
          autoCapitalize="none"
          style={{ textAlign: 'left' }}
          error={touched.studentId ? errors.studentId : ''}
          onBlur={() => handleFieldBlur('studentId')}
          maxLength={10}
        />
      )}

      {/* Email */}
      <InputField
        label="Email"
        value={email}
        onChangeText={(text) => {
          setEmail(text);
          clearValidationErrors();
        }}
        autoCapitalize="none"
        keyboardType="email-address"
        placeholder="Enter email"
        error={touched.email ? errors.email : ''}
        onBlur={() => handleFieldBlur('email')}
      />

      {/* Password */}
      <View style={styles.passwordContainer}>
        <InputField
          label="Password"
          value={passwordDisplay}
          onChangeText={handlePasswordChange}
          secureTextEntry={false}
          placeholder="Enter password"
          error={touched.password ? errors.password : ''}
          onBlur={() => handleFieldBlur('password')}
          maxLength={16}
          style={styles.passwordInput}
        />
        <TouchableOpacity style={styles.eyeIcon} onPress={() => setShowPassword(!showPassword)}>
          <Ionicons name={showPassword ? 'eye-off' : 'eye'} size={20} color="#6B7280" />
        </TouchableOpacity>
      </View>

      {/* Confirm Password */}
      <View style={styles.passwordContainer}>
        <InputField
          label="Confirm Password"
          value={confirmPasswordDisplay}
          onChangeText={handleConfirmPasswordChange}
          secureTextEntry={false}
          placeholder="Confirm password"
          error={touched.confirmPassword ? errors.confirmPassword : ''}
          onBlur={() => handleFieldBlur('confirmPassword')}
          maxLength={16}
          style={styles.passwordInput}
        />
        <TouchableOpacity style={styles.eyeIcon} onPress={() => setShowConfirmPassword(!showConfirmPassword)}>
          <Ionicons name={showConfirmPassword ? 'eye-off' : 'eye'} size={20} color="#6B7280" />
        </TouchableOpacity>
      </View>

      {/* Register Button */}
      <TouchableOpacity
        style={[styles.loginButton, loading && styles.loginButtonDisabled]}
        onPress={handleRegister}
        disabled={loading}
        activeOpacity={0.8}
      >
        <Text style={styles.loginButtonText}>
          {loading ? 'Registering...' : 'Register'}
        </Text>
      </TouchableOpacity>

      {/* Validation Errors */}
      {validationErrors.length > 0 && (
        <View style={styles.validationErrorContainer}>
          {validationErrors.map((error, index) => (
            <Text key={index} style={styles.validationErrorText}>
              ❌ {error}
            </Text>
          ))}
        </View>
      )}

      {/* Already Registered Link */}
      <View style={[styles.signInContainer, { marginBottom: 12 }]}>
        <Text style={styles.signInText}>Already registered? </Text>
        <TouchableOpacity onPress={() => navigation.navigate('Login', { role })}>
          <Text style={styles.signInLink}>Sign in</Text>
        </TouchableOpacity>
      </View>

      {/* Terms and Policies Checkbox */}
      <View style={styles.termsContainer}>
        <View style={styles.termsContentContainer}>
          <TouchableOpacity
            style={styles.checkboxContainer}
            onPress={() => setAcceptedTerms(!acceptedTerms)}
            activeOpacity={0.7}
          >
            <View style={[styles.checkbox, acceptedTerms && styles.checkboxChecked]}>
              {acceptedTerms && <Ionicons name="checkmark" size={16} color="#FFFFFF" />}
            </View>
          </TouchableOpacity>
          <View style={styles.termsTextContainer}>
            <Text style={styles.termsText}>I agree to the </Text>
            <TouchableOpacity onPress={() => setTermsModalVisible(true)} activeOpacity={0.7}>
              <Text style={styles.termsLink}>Terms and Policies</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Terminal spacer removed to stop exactly at Sign in */}
            </View>
          </View>
        </ScrollView>

        {/* Custom Calendar Modal */}
        {showCalendarModal && (
          <Modal transparent animationType="fade" visible={showCalendarModal}>
            <View style={styles.modalOverlay}>
              <View style={styles.calendarModalContainer}>
                <View style={styles.modalHeader}>
                  <Text style={styles.calendarModalTitle}>Select Birthday</Text>
                  <TouchableOpacity
                    onPress={closeCalendarModal}
                    style={styles.modalCloseButton}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="close" size={24} color="#374151" />
                  </TouchableOpacity>
                </View>
                
                {/* Year Dropdown */}
                <View style={styles.yearSelectorContainer}>
                  <Text style={styles.yearSelectorLabel}>Year:</Text>
                  <TouchableOpacity 
                    style={styles.yearDropdown} 
                    onPress={() => setShowYearPicker(true)}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.yearDropdownText}>
                      {currentYear}
                    </Text>
                    <Ionicons name="chevron-down" size={16} color="#6B7280" />
                  </TouchableOpacity>
                </View>
                
                <CalendarPicker
                  onDateSelect={handleDateSelect}
                  selectedDate={birthday}
                  maxDate={new Date()}
                  minDate={new Date(1960, 0, 1)}
                  currentYear={currentYear}
                  onYearChange={setCurrentYear}
                />
              </View>
            </View>
          </Modal>
        )}
        
        {/* Year Picker Modal */}
        {showYearPicker && (
          <Modal transparent animationType="fade" visible={showYearPicker}>
            <View style={styles.modalOverlay}>
              <View style={styles.yearPickerContainer}>
                <View style={styles.modalHeader}>
                  <Text style={styles.yearPickerTitle}>Select Year</Text>
                  <TouchableOpacity
                    onPress={() => setShowYearPicker(false)}
                    style={styles.modalCloseButton}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="close" size={24} color="#374151" />
                  </TouchableOpacity>
                </View>
                <ScrollView style={styles.yearPickerScroll} showsVerticalScrollIndicator={false}>
                  {yearPickerOptions.map((year) => (
                    <TouchableOpacity
                      key={year}
                      style={[
                        styles.yearOption,
                        currentYear === year && styles.yearOptionSelected
                      ]}
                      onPress={() => {
                        setCurrentYear(year);
                        setShowYearPicker(false);
                      }}
                      activeOpacity={0.7}
                    >
                      <Text style={[
                        styles.yearOptionText,
                        currentYear === year && styles.yearOptionTextSelected
                      ]}>
                        {year}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            </View>
          </Modal>
        )}
        
        {/* Date Picker Modal - Only for mobile platforms */}
        {Platform.OS !== 'web' && showDatePicker && (
          <DateTimePicker
            value={birthday}
            mode="date"
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            onChange={handleBirthdayChange}
            maximumDate={new Date()}
            minimumDate={new Date(1960, 0, 1)}
            style={Platform.OS === 'ios' ? styles.datePicker : undefined}
          />
        )}

        {/* Error Modal */}
      <Modal
        visible={errorModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setErrorModalVisible(false)}
      >
        <View style={styles.modalOverlayCenter}>
          <View style={styles.fbModalCard}>
            <View style={styles.fbModalContent}>
              <Text style={[styles.fbModalTitle, { color: '#DC2626' }]}>Registration Error</Text>
              {errorMessage ? <Text style={styles.fbModalMessage}>{errorMessage}</Text> : null}
            </View>
          </View>
        </View>
      </Modal>

      {/* Success Modal */}
      <Modal
        visible={successModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setSuccessModalVisible(false)}
      >
        <View style={styles.modalOverlayCenter}>
          <View style={styles.fbModalCard}>
            <View style={styles.fbModalContent}>
              <Text style={[styles.fbModalTitle, { color: '#10B981' }]}>Registration Successful</Text>
              {successMessage ? <Text style={styles.fbModalMessage}>{successMessage}</Text> : null}
            </View>
          </View>
        </View>
      </Modal>

      {/* Terms and Policies Modal */}
      <Modal
        visible={termsModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setTermsModalVisible(false)}
      >
        <View style={styles.modalOverlayCenter}>
          <View style={styles.termsModalCard}>
            <View style={styles.termsModalContent}>
              <Text style={styles.termsModalTitle}>Terms and Policies</Text>
              <ScrollView 
                style={styles.termsModalScroll}
                showsVerticalScrollIndicator={true}
                nestedScrollEnabled={true}
              >
                <Text style={styles.termsModalSectionTitle}>1. Account Registration</Text>
                <Text style={styles.termsModalText}>
                  By registering for SyncroGate, you agree to provide accurate, current, and complete information. You are responsible for maintaining the confidentiality of your account credentials.
                </Text>

                <Text style={styles.termsModalSectionTitle}>2. Acceptable Use</Text>
                <Text style={styles.termsModalText}>
                  You agree to use SyncroGate only for lawful purposes and in accordance with these Terms. You shall not:
                </Text>
                <Text style={styles.termsModalText}>
                  • Use false or misleading information when registering{'\n'}
                  • Attempt to gain unauthorized access to any part of the application{'\n'}
                  • Interfere with or disrupt the integrity or performance of the application{'\n'}
                  • Use the application for any illegal or unauthorized purpose
                </Text>

                <Text style={styles.termsModalSectionTitle}>3. Data Privacy</Text>
                <Text style={styles.termsModalText}>
                  Your personal information will be collected and processed in accordance with our Privacy Policy. We are committed to protecting your privacy and handling your data responsibly.
                </Text>

                <Text style={styles.termsModalSectionTitle}>4. Account Verification</Text>
                <Text style={styles.termsModalText}>
                  Student accounts require admin verification before full access is granted. You agree to cooperate with the verification process and understand that false information may result in account suspension or termination.
                </Text>

                <Text style={styles.termsModalSectionTitle}>5. User Responsibilities</Text>
                <Text style={styles.termsModalText}>
                  You are responsible for all activities that occur under your account. You must immediately notify us of any unauthorized use of your account or any other breach of security.
                </Text>

                <Text style={styles.termsModalSectionTitle}>6. Prohibited Activities</Text>
                <Text style={styles.termsModalText}>
                  The following activities are strictly prohibited:
                </Text>
                <Text style={styles.termsModalText}>
                  • Sharing account credentials with others{'\n'}
                  • Impersonating another user or entity{'\n'}
                  • Engaging in any form of harassment or abuse{'\n'}
                  • Violating any applicable laws or regulations
                </Text>

                <Text style={styles.termsModalSectionTitle}>7. Account Suspension and Termination</Text>
                <Text style={styles.termsModalText}>
                  We reserve the right to suspend or terminate your account if you violate these Terms and Policies or engage in any behavior that we deem inappropriate or harmful.
                </Text>

                <Text style={styles.termsModalSectionTitle}>8. Changes to Terms</Text>
                <Text style={styles.termsModalText}>
                  We may modify these Terms and Policies at any time. Continued use of the application after changes constitutes acceptance of the modified terms.
                </Text>

                <Text style={styles.termsModalSectionTitle}>9. Disclaimer</Text>
                <Text style={styles.termsModalText}>
                  SyncroGate is provided "as is" without warranties of any kind. We do not guarantee that the application will be error-free or continuously available.
                </Text>

                <Text style={styles.termsModalSectionTitle}>10. Contact Information</Text>
                <Text style={styles.termsModalText}>
                  If you have any questions about these Terms and Policies, please contact the administration through the appropriate channels provided in the application.
                </Text>

                <Text style={styles.termsModalFooter}>
                  By accepting these Terms and Policies, you acknowledge that you have read, understood, and agree to be bound by all the terms and conditions stated above.
                </Text>
              </ScrollView>
              <TouchableOpacity
                style={styles.termsModalCloseButton}
                onPress={() => setTermsModalVisible(false)}
                activeOpacity={0.8}
              >
                <Text style={styles.termsModalCloseButtonText}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      </ImageBackground>
    </View>
  );
};

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

const styles = StyleSheet.create({
  screenWrapper: {
    width: '100%',
    overflow: 'hidden',
  },
  container: {
    flex: 1,
    paddingHorizontal: theme.spacing.xl,
    paddingTop: theme.spacing.xxl,
  },
  containerWrapper: {
    marginHorizontal: theme.spacing.xl,
    maxWidth: 420,
    alignSelf: "center",
    width: "100%",
    marginTop: 20,
    marginBottom: 40,
    borderWidth: 0,
    borderColor: 'transparent',
  },
  innerContainer: {
    backgroundColor: "rgba(255, 255, 255, 0.25)",
    borderRadius: 8,
    padding: theme.spacing.lg,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 5,
    overflow: "hidden",
    borderWidth: 0,
    borderColor: 'transparent',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 0,
    paddingTop: theme.spacing.xxl,
    paddingBottom: 40,
  },
  backButton: {
    position: 'absolute',
    top: 50,
    left: 20,
    width: 50,
    height: 50,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
    zIndex: 10,
  },
  logoContainer: {
    marginHorizontal: theme.spacing.xl,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 16,
    marginBottom: 20,
  },
  logoButton: {
    alignSelf: "center",
  },
  logo: {
    width: 50,
    height: 50,
    borderRadius: 8,
    backgroundColor: "#FFFFFF",
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: theme.typography.weights.bold,
    color: "#FFFFFF",
    marginLeft: theme.spacing.md,
    textTransform: "uppercase",
  },
  headerTitleLarge: {
    fontSize: 36,
    fontWeight: theme.typography.weights.bold,
    color: "#FFFFFF",
  },
  roleText: { 
    fontSize: 13, 
    color: '#000000', 
    textAlign: 'center', 
    marginBottom: 6, 
    marginTop: 0,
    fontWeight: '500',
  },
  roleHighlight: { 
    fontWeight: 'bold', 
    color: theme.colors.primary, 
    textTransform: 'capitalize' 
  },
  title: { 
    fontSize: 20, 
    fontWeight: 'bold', 
    marginBottom: 8, 
    textAlign: 'center', 
    color: '#000000' 
  },
  warningText: { 
    fontSize: 11, 
    color: '#DC2626', 
    textAlign: 'center', 
    marginBottom: 12, 
    paddingHorizontal: 16,
    lineHeight: 14,
    backgroundColor: 'rgba(254, 242, 242, 0.9)',
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#FECACA'
  },
  row: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  rowInput: { flex: 1 },
  passwordContainer: {
    position: 'relative',
  },
  passwordInput: {
    paddingRight: 42, // Make space for the eye icon
  },
  eyeIcon: { 
    position: 'absolute', 
    right: 10, 
    top: 28, // Centered: label (12px + 3px margin) + input center (16px) - icon half (10px)
    zIndex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    height: 18,
  },
  loginButton: { backgroundColor: theme.colors.primary, paddingVertical: 10, borderRadius: 10, marginTop: 8 },
  loginButtonDisabled: { backgroundColor: '#94a3b8' },
  loginButtonText: { color: '#fff', textAlign: 'center', fontSize: 16, fontWeight: '600' },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
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
  modalContainer: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
    maxWidth: 350,
    width: '90%',
  },
  modalTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 12, color: '#111827', textAlign: 'center' },
  modalItem: { paddingVertical: 12, paddingHorizontal: 10 },
  modalText: { fontSize: 16, color: '#374151' },
  modalDivider: { height: 1, backgroundColor: '#E5E7EB' },
  modalCloseBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    marginTop: 15,
    backgroundColor: '#2563EB',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    gap: 6,
  },
  modalCloseBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 14 },
  inputContainer: { marginBottom: 10 },
  label: { 
    fontSize: 12, 
    marginBottom: 3, 
    color: '#000000',
    fontWeight: '500',
  },
  input: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    textAlign: 'left',
    color: '#000000',
  },
  inputError: {
    borderColor: '#EF4444',
  },
  errorText: {
    color: '#EF4444',
    fontSize: 11,
    marginTop: 3,
    marginLeft: 4,
  },
  dropdownWrapper: {
    position: 'relative',
    zIndex: 1,
  },
  dropdownField: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginTop: 2,
    minHeight: 36,
  },
  dropdownFieldText: {
    fontSize: 14,
    color: '#000000',
    flex: 1,
  },
  dropdownFieldPlaceholder: {
    color: '#9CA3AF',
  },
  dropdownOptionsContainer: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 6,
    marginTop: 4,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 8,
    elevation: 5,
    overflow: 'hidden',
    zIndex: 1000,
  },
  dropdownOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  dropdownOptionSelected: {
    backgroundColor: '#F0F7FF',
  },
  dropdownOptionText: {
    fontSize: 14,
    color: '#374151',
    flex: 1,
  },
  dropdownOptionTextSelected: {
    color: theme.colors.primary,
    fontWeight: '600',
  },
  readOnlyInput: {
    backgroundColor: '#F3F4F6',
    color: '#6B7280',
  },
  datePicker: {
    backgroundColor: '#fff',
    width: '100%',
  },
  calendarIcon: {
    position: 'absolute',
    right: 12,
    top: '50%',
    marginTop: -8,
  },
  webDateInput: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    opacity: 0,
    cursor: 'pointer',
    zIndex: 10,
  },
  calendarModalContainer: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
    maxWidth: 300,
    width: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    width: '100%',
  },
  modalCloseButton: {
    padding: 4,
    borderRadius: 4,
    backgroundColor: '#F3F4F6',
  },
  calendarModalTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#111827',
    flex: 1,
    textAlign: 'center',
  },
  calendarContainer: {
    marginBottom: 16,
  },
  calendarHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  calendarNavButton: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
  },
  calendarMonthText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
  },
  calendarDaysHeader: {
    flexDirection: 'row',
    marginBottom: 10,
  },
  calendarDayName: {
    flex: 1,
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '600',
    color: '#6B7280',
    marginBottom: 5,
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  calendarDay: {
    width: '14.28%',
    aspectRatio: 1,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
    margin: 1,
  },
  calendarDaySelected: {
    backgroundColor: '#004f89',
  },
  calendarDayDisabled: {
    opacity: 0.3,
  },
  calendarDayText: {
    fontSize: 14,
    color: '#374151',
  },
  calendarDayTextSelected: {
    color: '#fff',
    fontWeight: '600',
  },
  calendarDayTextDisabled: {
    color: '#9CA3AF',
  },
  yearSelectorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    paddingHorizontal: 16,
  },
  yearSelectorLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
    marginRight: 12,
  },
  yearDropdown: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    minWidth: 100,
  },
  yearDropdownText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
    marginRight: 8,
  },
  yearPickerContainer: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
    maxWidth: 280,
    width: '75%',
    maxHeight: '70%',
  },
  yearPickerTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#111827',
    flex: 1,
    textAlign: 'center',
  },
  yearPickerScroll: {
    maxHeight: 250,
  },
  yearOption: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  yearOptionSelected: {
    backgroundColor: '#DBEAFE',
    borderBottomColor: '#2563EB',
  },
  yearOptionText: {
    fontSize: 16,
    color: '#374151',
    textAlign: 'center',
  },
  yearOptionTextSelected: {
    color: '#2563EB',
    fontWeight: '600',
  },
  signInContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 12,
    paddingHorizontal: 20,
  },
  signInText: {
    fontSize: 12,
    color: '#000000',
  },
  signInLink: {
    fontSize: 12,
    color: theme.colors.primary,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  validationErrorContainer: {
    marginTop: 10,
    paddingHorizontal: 20,
  },
  validationErrorText: {
    color: '#DC2626',
    fontSize: 12,
    fontWeight: '500',
    marginBottom: 4,
    textAlign: 'center',
  },
  centeredPlaceholder: { textAlign: 'center' },
  termsContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 20,
    marginBottom: 20,
  },
  termsContentContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxContainer: {
    marginRight: 8,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderWidth: 2,
    borderColor: '#D1D5DB',
    borderRadius: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxChecked: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  termsTextContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  termsText: {
    fontSize: 12,
    color: '#000000',
  },
  termsLink: {
    fontSize: 12,
    color: theme.colors.primary,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  termsModalCard: {
    width: '90%',
    maxWidth: 500,
    maxHeight: '85%',
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 20,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 8,
    elevation: 5,
  },
  termsModalContent: {
    flex: 1,
  },
  termsModalTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#050505',
    marginBottom: 16,
    textAlign: 'left',
  },
  termsModalScroll: {
    maxHeight: 400,
    marginBottom: 16,
  },
  termsModalSectionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
    marginTop: 12,
    marginBottom: 6,
  },
  termsModalText: {
    fontSize: 14,
    color: '#65676B',
    textAlign: 'left',
    lineHeight: 20,
    marginBottom: 8,
  },
  termsModalFooter: {
    fontSize: 13,
    color: '#374151',
    fontStyle: 'italic',
    marginTop: 12,
    marginBottom: 8,
    lineHeight: 18,
  },
  termsModalCloseButton: {
    backgroundColor: theme.colors.primary,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    alignSelf: 'center',
    marginTop: 8,
  },
  termsModalCloseButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default RegisterScreen;