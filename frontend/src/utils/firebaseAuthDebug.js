// Firebase Auth Debug Utility
import { auth } from './firebaseConfig';
import { sendPasswordResetEmail } from 'firebase/auth';

export const testPasswordReset = async (email) => {
  console.log('🔍 TESTING FIREBASE PASSWORD RESET');
  console.log('===================================');
  
  try {
    console.log('📧 Attempting password reset for:', email);
    console.log('🔧 Firebase Auth instance:', auth);
    console.log('🏗️ Auth app:', auth.app);
    console.log('📱 Auth app name:', auth.app.name);
    console.log('🔑 Auth config:', auth.config);
    
    // Test the password reset function
    await sendPasswordResetEmail(auth, email);
    
    console.log('✅ Password reset email sent successfully!');
    console.log('📬 Check your email inbox for the reset link');
    console.log('🔗 Reset link format: https://guardientry-database.firebaseapp.com/__/auth/action?mode=resetPassword&oobCode=...');
    
    return {
      success: true,
      message: 'Password reset email sent successfully'
    };
    
  } catch (error) {
    console.error('❌ Password reset failed:', error);
    console.error('🔍 Error details:', {
      code: error.code,
      message: error.message,
      stack: error.stack
    });
    
    // Handle specific Firebase errors
    let errorMessage = 'Unknown error occurred';
    
    switch (error.code) {
      case 'auth/user-not-found':
        errorMessage = 'No user found with this email address';
        break;
      case 'auth/invalid-email':
        errorMessage = 'Invalid email address format';
        break;
      case 'auth/too-many-requests':
        errorMessage = 'Too many requests. Please try again later';
        break;
      case 'auth/network-request-failed':
        errorMessage = 'Network error. Check your internet connection';
        break;
      case 'auth/invalid-api-key':
        errorMessage = 'Invalid Firebase API key';
        break;
      case 'auth/quota-exceeded':
        errorMessage = 'Email quota exceeded. Try again later';
        break;
      default:
        errorMessage = error.message || 'Unknown error occurred';
    }
    
    return {
      success: false,
      error: errorMessage,
      code: error.code
    };
  }
};

export const checkFirebaseAuthConfig = () => {
  console.log('🔍 FIREBASE AUTH CONFIGURATION CHECK');
  console.log('====================================');
  
  try {
    console.log('✅ Firebase Auth instance created successfully');
    console.log('📱 App name:', auth.app.name);
    console.log('🔑 Project ID:', auth.app.options.projectId);
    console.log('🌐 Auth domain:', auth.app.options.authDomain);
    console.log('🔧 API key:', auth.app.options.apiKey ? 'Present' : 'Missing');
    
    // Check if auth is properly initialized
    if (auth.app.options.projectId === 'guardientry-database') {
      console.log('✅ Project ID matches expected value');
    } else {
      console.warn('⚠️ Project ID mismatch:', auth.app.options.projectId);
    }
    
    if (auth.app.options.authDomain === 'guardientry-database.firebaseapp.com') {
      console.log('✅ Auth domain matches expected value');
    } else {
      console.warn('⚠️ Auth domain mismatch:', auth.app.options.authDomain);
    }
    
    return {
      success: true,
      config: {
        projectId: auth.app.options.projectId,
        authDomain: auth.app.options.authDomain,
        apiKey: auth.app.options.apiKey ? 'Present' : 'Missing'
      }
    };
    
  } catch (error) {
    console.error('❌ Firebase Auth configuration check failed:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

// Make functions available globally for testing
if (typeof window !== 'undefined') {
  window.testPasswordReset = testPasswordReset;
  window.checkFirebaseAuthConfig = checkFirebaseAuthConfig;
}
