import React, { useContext, useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Alert,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  ImageBackground,
  Modal,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Keyboard,
  BackHandler,
  Dimensions,
  useWindowDimensions,
} from 'react-native';
import { AuthContext } from '../../contexts/AuthContext';
import theme from '../../utils/theme';
import InputField from '../../components/InputField';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { isValidRole } from '../../utils/roles';
import { isFirestoreConnectionError, getFirestoreErrorMessage, getFirestoreErrorTitle } from '../../utils/firestoreErrorHandler';

const LoginScreen = () => {
  const { login, resetPassword, loading, logout } = useContext(AuthContext);
  const navigation = useNavigation();
  const route = useRoute();
  const { height: windowHeight } = useWindowDimensions();
  const [containerTop, setContainerTop] = useState(null);

  const { role } = route.params || {};
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [passwordDisplay, setPasswordDisplay] = useState('');
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const lastPasswordLengthRef = useRef(0);

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

  // Simple password display logic
  React.useEffect(() => {
    setPasswordDisplay(showPassword ? password : '•'.repeat(password.length));
    lastPasswordLengthRef.current = password.length;
  }, [password, showPassword]);

  // Clean password input handler
  const handlePasswordChange = (text) => {
    if (showPassword) {
      // When password is visible, just set the text directly
      setPassword(text);
      lastPasswordLengthRef.current = text.length;
    } else {
      // When password is hidden, handle input by comparing lengths
      const currentPassword = password;
      const currentLength = currentPassword.length;
      const inputLength = text.length;
      
      // Remove all dots from input (they're just for display)
      const cleanText = text.replace(/•/g, '');
      
      // Compare input length to determine if adding or deleting
      if (inputLength > currentLength) {
        // Input length increased - user is adding characters
        // Extract the new characters from the end of the input
        // Take the last (inputLength - currentLength) characters and remove dots
        const addedCount = inputLength - currentLength;
        const endOfInput = text.slice(-addedCount);
        const newChars = endOfInput.replace(/•/g, '');
        
        if (newChars.length > 0) {
          setPassword(currentPassword + newChars);
        }
      } else if (inputLength < currentLength) {
        // Input length decreased - user is deleting characters
        // Remove characters from the end based on the difference
        const deletedCount = currentLength - inputLength;
        setPassword(currentPassword.slice(0, -deletedCount));
      } else {
        // Same length - could be character replacement or paste
        // If cleanText has content and is different, use it
        if (cleanText.length > 0 && cleanText !== currentPassword) {
          // For same length, prefer cleanText if it's different (paste/replace)
          setPassword(cleanText);
        }
        // Otherwise, keep current password (no change)
      }
    }
  };

  const [errorModalVisible, setErrorModalVisible] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [errorTitle, setErrorTitle] = useState('Login Error');
  const errorTimerRef = useRef(null);

  const showError = (message, title = 'Login Error') => {
    try { if (errorTimerRef.current) { clearTimeout(errorTimerRef.current); } } catch {}
    
    // Handle Firestore connection errors specifically
    if (isFirestoreConnectionError({ message })) {
      setErrorMessage(getFirestoreErrorMessage({ message }));
      setErrorTitle(getFirestoreErrorTitle({ message }));
    } else if (message === 'Invalid credentials') {
      setErrorMessage('Invalid credentials. Please check your email and password and try again.\nIf you forgot your password, tap "Forgot Password?".');
      setErrorTitle(title);
    } else {
      setErrorMessage(message);
      setErrorTitle(title);
    }
    
    setErrorModalVisible(true);
    errorTimerRef.current = setTimeout(() => {
      setErrorModalVisible(false);
    }, 1500);
  };


  const isValidEmail = (value) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(value);
  };

  // Calculate fixed container position on mount to prevent keyboard from affecting it
  React.useEffect(() => {
    const { height } = Dimensions.get('window');
    // Calculate top position: screen height - bottom offset (150) - estimated container height (400)
    // This ensures the container stays in a fixed position regardless of keyboard
    setContainerTop(height - 600);
  }, []);

  // Store initial window dimensions to prevent background from resizing
  // Get initial dimensions before keyboard affects them
  const [screenDimensions] = useState(() => {
    const dims = Dimensions.get('window');
    return dims;
  });

  // Log the role parameter when component mounts or role changes
  React.useEffect(() => {
    console.log('LoginScreen mounted with role:', role);
    if (role) {
      console.log('Role validation:', { role, isValid: isValidRole(role) });
      
      // Additional validation
      if (typeof role !== 'string') {
        console.error('Role parameter is not a string:', { role, type: typeof role });
      } else if (!isValidRole(role)) {
        console.error('Invalid role parameter:', role);
      }
    } else {
      console.warn('No role parameter provided to LoginScreen');
    }
  }, [role]);

  // === HANDLE LOGIN ===
  const handleLogin = async () => {
    if (!email.trim() || !password) {
      showError('Please enter email and password', 'Login Error');
      return;
    }

    // Client-side input validation to avoid triggering loading on invalid input
    if (!isValidEmail(email.trim())) {
      showError('Invalid email format. Please enter a valid email.', 'Login Error');
      return;
    }

    if (password.length < 6) {
      showError('Password must be at least 6 characters.', 'Login Error');
      return;
    }
    if (!role) {
      showError('No role selected. Please select a role first.', 'Login Error');
      return;
    }

    // Restrict login by role before hitting auth: check if the account exists with a different role
    try {
      // Soft client guard: rely on server check but pre-emptively block if role is invalid selection
      if (!isValidRole(role)) {
        showError('Invalid role selected. Please select a valid role.', 'Login Error');
        return;
      }
    } catch {}

    // Validate that the selected role is valid
    if (!isValidRole(role)) {
      console.error('Invalid role selected:', role);
      showError('Invalid role selected. Please select a valid role.', 'Login Error');
      return;
    }

    // Ensure role is a string and normalize it
    if (typeof role !== 'string') {
      console.error('Role is not a string:', { role, type: typeof role });
      showError('Invalid role format. Please try again.', 'Login Error');
      return;
    }

    // Additional validation for role consistency
    if (!role.trim()) {
      console.error('Role is empty or whitespace:', role);
      showError('Invalid role. Please select a valid role.', 'Login Error');
      return;
    }

    // Log the role parameter for debugging
    console.log('Login attempt with role:', { role, roleType: typeof role, roleLower: role.toLowerCase() });

    console.log('Starting login process for role:', role);

    try {
      // Login using AuthContext with expected role for validation
      const userData = await login({ 
        email: email.trim(), 
        password,
        expectedRole: role // Pass the selected role for validation after auth
      });
      
      console.log('Login successful:', { userData, selectedRole: role });
      // Extra client-side safeguard: enforce role match
      if (userData?.role && role && userData.role.toLowerCase() !== String(role).toLowerCase()) {
        await logout();
        showError('Invalid credentials', 'Login Error');
        return;
      }
      
      // Navigation will happen automatically through AppNavigator
      // based on the role set in AuthContext
      
    } catch (error) {
      console.log('Login failed - credentials invalid');
      
      // Check if it's a Firestore connection error
      if (isFirestoreConnectionError(error)) {
        showError(getFirestoreErrorMessage(error), getFirestoreErrorTitle(error));
      } else {
        // Always show a generic login error for other cases
        try { await logout(); } catch {}
        showError('Invalid credentials', 'Login Error');
      }
    }
  };


  // === CHECK USER ROLE BEFORE LOGIN ===
  // Note: This function has been removed to avoid Firebase permissions issues.
  // Role validation now happens after authentication in AuthContext.
  const checkUserRoleBeforeLogin = async (email) => {
    // Return success to allow login attempt - role will be validated after auth
    return { role: role?.toLowerCase() || 'student' };
  };

  const { height: screenHeight } = screenDimensions;
  
  return (
    <View style={[styles.screenWrapper, { height: screenHeight }]}>
      <ImageBackground 
        source={require("../../assets/Rolescreen.png")} 
        style={styles.container}
        resizeMode="cover"
      >
        {/* Back button */}
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
        >
          <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
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
        {containerTop !== null && (
          <View style={[styles.containerWrapper, { top: containerTop }]} pointerEvents="box-none">
            <View style={styles.innerContainer}>
          <ScrollView 
          contentContainerStyle={{ 
            flexGrow: 1 
          }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          {role && (
            <Text style={styles.roleText}>
              Logging in as: <Text style={styles.roleHighlight}>{role}</Text>
            </Text>
          )}

          <Text style={styles.loginTitle}>Login</Text>

          <InputField
            label="Email"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            placeholder="Enter your email"
            placeholderTextColor="#9CA3AF"
            style={{ color: '#000000' }}
            labelStyle={{ color: '#000000' }}
          />

          <View style={styles.passwordContainer}>
            <InputField
              label="Password"
              value={passwordDisplay}
              onChangeText={handlePasswordChange}
              secureTextEntry={false}
              placeholder="Enter password"
              maxLength={16}
              style={[styles.passwordInput, { color: '#000000' }]}
              placeholderTextColor="#9CA3AF"
              labelStyle={{ color: '#000000' }}
            />
            <TouchableOpacity
              style={styles.eyeIcon}
              onPress={() => setShowPassword(!showPassword)}
            >
              <Ionicons
                name={showPassword ? 'eye-off' : 'eye'}
                size={20}
                color="#6B7280"
              />
            </TouchableOpacity>
          </View>

          {role !== 'admin' && role !== 'developer' && (
            <TouchableOpacity
              onPress={() => navigation.navigate('ForgotPassword', { role })}
              style={styles.forgotPasswordContainer}
            >
              <Text style={styles.forgotPasswordText}>Forgot Password?</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={[styles.loginButton, loading && styles.loginButtonDisabled]}
            onPress={handleLogin}
            disabled={loading}
          >
            {loading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="small" color="#ffffff" />
                <Text style={[styles.loginButtonText, styles.loadingText]}>Logging in...</Text>
              </View>
            ) : (
              <Text style={styles.loginButtonText}>Login</Text>
            )}
          </TouchableOpacity>

          {role === 'developer' && (
            <TouchableOpacity
              onPress={() => navigation.navigate('Login', { role: 'admin' })}
            >
              <Text style={styles.registerText}>
                Login as: <Text style={styles.registerLink}>Admin</Text>
              </Text>
            </TouchableOpacity>
          )}

          {role !== 'admin' && role !== 'developer' && (
            <TouchableOpacity
              onPress={() => navigation.navigate('Register', { role })}
            >
              <Text style={styles.registerText}>
                Not registered? <Text style={styles.registerLink}>Sign up</Text>
              </Text>
            </TouchableOpacity>
          )}
        </ScrollView>
            </View>
          </View>
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
              <Text style={[styles.fbModalTitle, { color: errorTitle === 'Connection Error' ? '#F59E0B' : '#DC2626' }]}>{errorTitle}</Text>
              {errorMessage ? <Text style={styles.fbModalMessage}>{errorMessage}</Text> : null}
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
    position: "absolute",
    left: theme.spacing.xl,
    right: theme.spacing.xl,
    width: "100%",
    maxWidth: 420,
    alignSelf: "center",
    zIndex: 5,
  },
  innerContainer: {
    backgroundColor: "rgba(255, 255, 255, 0.25)",
    borderRadius: 8,
    padding: theme.spacing.xl,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 5,
    overflow: "hidden",
    maxHeight: SCREEN_HEIGHT * 0.7,
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
    position: "absolute",
    top: 80,
    left: theme.spacing.xl,
    right: theme.spacing.xl,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1,
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
    fontSize: 16,
    color: theme.colors.textPrimary,
    textAlign: 'center',
    marginBottom: 10,
    marginTop: 0,
  },
  roleHighlight: {
    fontWeight: 'bold',
    color: theme.colors.primary,
    textTransform: 'capitalize',
  },
  loginTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 8,
    textAlign: 'center',
    color: '#000000',
  },
  title: {
    fontSize: theme.typography.sizes.xxl,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.textPrimary,
    textAlign: "center",
    marginBottom: theme.spacing.lg,
  },
  passwordContainer: {
    position: 'relative',
  },
  passwordInput: {
    paddingRight: 50, // Make space for the eye icon
  },
  eyeIcon: {
    position: 'absolute',
    right: 25,
    top: 40, // Positioned to center on the input field (accounts for label height ~20px + input center)
    zIndex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    height: 20,
  },
  forgotPasswordContainer: {
    alignItems: 'flex-end',
    marginTop: 4,
    marginBottom: 10,
  },
  forgotPasswordText: {
    color: theme.colors.primary,
    fontWeight: '600',
  },
  loginButton: {
    backgroundColor: theme.colors.primary,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    marginHorizontal: theme.spacing.xl,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    marginTop: 10,
  },
  loginButtonDisabled: {
    backgroundColor: '#94a3b8',
  },
  loginButtonText: {
    color: "#FFFFFF",
    fontSize: theme.typography.sizes.lg,
    fontWeight: theme.typography.weights.medium,
  },
  registerText: {
    marginTop: 15,
    textAlign: 'center',
    color: theme.colors.textPrimary,
  },
  registerLink: {
    color: theme.colors.primary,
    fontWeight: 'bold',
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginLeft: 8,
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
  modalButton: {
    backgroundColor: theme.colors.primary,
    paddingVertical: 12,
    borderRadius: 10,
  },
  modalButtonText: {
    color: '#FFFFFF',
    textAlign: 'center',
    fontWeight: '600',
    fontSize: 16,
  },
});

export default LoginScreen;