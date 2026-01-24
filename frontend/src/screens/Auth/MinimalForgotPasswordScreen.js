import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
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
import theme from '../../utils/theme';
import InputField from '../../components/InputField';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '../../utils/firebaseConfig';

const MinimalForgotPasswordScreen = () => {
  const navigation = useNavigation();
  const route = useRoute();
  const { role } = route.params || {};
  const { height: windowHeight } = useWindowDimensions();
  const [containerTop, setContainerTop] = useState(null);
  
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [errorModalVisible, setErrorModalVisible] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successModalVisible, setSuccessModalVisible] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const errorTimerRef = useRef(null);
  const successTimerRef = useRef(null);

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

  const showError = (message) => {
    try { if (errorTimerRef.current) { clearTimeout(errorTimerRef.current); } } catch {}
    setErrorMessage(message);
    setErrorModalVisible(true);
    errorTimerRef.current = setTimeout(() => {
      setErrorModalVisible(false);
    }, 3000);
  };

  const showSuccess = (message) => {
    try { if (successTimerRef.current) { clearTimeout(successTimerRef.current); } } catch {}
    setSuccessMessage(message);
    setSuccessModalVisible(true);
    successTimerRef.current = setTimeout(() => {
      setSuccessModalVisible(false);
      navigation.goBack();
    }, 3000);
  };

  const isValidEmail = (value) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(value);
  };

  const handleResetPassword = async () => {
    console.log('=== MINIMAL FORGOT PASSWORD ===');
    console.log('Email:', email);
    console.log('Role:', role);
    
    if (!email.trim()) {
      showError('Please enter your email address');
      return;
    }
    
    if (!isValidEmail(email.trim())) {
      showError('Please enter a valid email address');
      return;
    }
    
    setLoading(true);
    
    try {
      console.log('Firebase Auth instance:', auth);
      console.log('Project ID:', auth.app.options.projectId);
      console.log('Auth domain:', auth.app.options.authDomain);
      console.log('Sending password reset email to:', email.trim());

      // Use actionCodeSettings to ensure the continue URL is on an authorized domain
      const actionCodeSettings = {
        // Redirect to your Firebase Hosting domain (authorized by default)
        url: `https://${auth?.app?.options?.authDomain || 'guardientry-database.firebaseapp.com'}`,
        handleCodeInApp: false,
      };

      await sendPasswordResetEmail(auth, email.trim().toLowerCase(), actionCodeSettings);
      
      console.log('✅ SUCCESS: Password reset email sent!');
      showSuccess('Password reset email sent! Please check your inbox and spam folder. Look for email from noreply@guardientry-database.firebaseapp.com');
      
    } catch (error) {
      console.error('❌ FAILED: Password reset failed');
      console.error('Error object:', error);
      console.error('Error code:', error.code);
      console.error('Error message:', error.message);
      console.error('Error stack:', error.stack);
      
      let errorMessage = '';
      let solution = '';
      
      switch (error.code) {
        case 'auth/user-not-found':
          errorMessage = 'No account found with this email address.';
          solution = 'Please register first or use a different email.';
          break;
        case 'auth/invalid-email':
          errorMessage = 'Invalid email format.';
          solution = 'Please enter a valid email address.';
          break;
        case 'auth/too-many-requests':
          errorMessage = 'Too many requests.';
          solution = 'Please try again later.';
          break;
        case 'auth/network-request-failed':
          errorMessage = 'Network error.';
          solution = 'Please check your internet connection.';
          break;
        case 'auth/quota-exceeded':
          errorMessage = 'Email quota exceeded.';
          solution = 'Please try again later or contact support.';
          break;
        case 'auth/invalid-api-key':
          errorMessage = 'Firebase configuration error.';
          solution = 'Please contact support.';
          break;
        case 'auth/operation-not-allowed':
          errorMessage = 'Password reset is not enabled.';
          solution = 'Please contact support.';
          break;
        default:
          errorMessage = error.message || 'Unknown error occurred.';
          solution = 'Please try again or contact support.';
      }
      
      const fullErrorMessage = `${errorMessage}\n\n${solution}\n\nError code: ${error.code || 'unknown'}`;
      showError(fullErrorMessage);
      
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
                <Text style={styles.title}>Reset Password</Text>
                
                <Text style={styles.subtitle}>
                  Enter your email address and we'll send you a link to reset your password.
                </Text>

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

                <TouchableOpacity
                  style={[styles.resetButton, loading && styles.resetButtonDisabled]}
                  onPress={handleResetPassword}
                  disabled={loading}
                >
                  {loading ? (
                    <View style={styles.loadingContainer}>
                      <ActivityIndicator size="small" color="#ffffff" />
                      <Text style={[styles.resetButtonText, styles.loadingText]}>Sending...</Text>
                    </View>
                  ) : (
                    <Text style={styles.resetButtonText}>Send Reset Email</Text>
                  )}
                </TouchableOpacity>
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
                <Text style={[styles.fbModalTitle, { color: '#DC2626' }]}>Error</Text>
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
                <Text style={[styles.fbModalTitle, { color: '#10B981' }]}>Success</Text>
                {successMessage ? <Text style={styles.fbModalMessage}>{successMessage}</Text> : null}
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
  title: {
    fontSize: theme.typography.sizes.xxl,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.textPrimary,
    textAlign: "center",
    marginBottom: theme.spacing.md,
  },
  subtitle: {
    fontSize: 16,
    color: theme.colors.textPrimary,
    textAlign: 'center',
    marginBottom: 30,
    lineHeight: 22,
  },
  resetButton: {
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
  resetButtonDisabled: {
    backgroundColor: '#94a3b8',
  },
  resetButtonText: {
    color: "#FFFFFF",
    fontSize: theme.typography.sizes.lg,
    fontWeight: theme.typography.weights.medium,
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
});

export default MinimalForgotPasswordScreen;
