// Simple Firebase Test Utility
import { auth } from './firebaseConfig';
import { sendPasswordResetEmail } from 'firebase/auth';

export const testFirebasePasswordReset = async (email) => {
  console.log('🧪 FIREBASE PASSWORD RESET TEST');
  console.log('================================');
  console.log('📧 Email:', email);
  
  try {
    console.log('1️⃣ Checking Firebase Auth configuration...');
    console.log('Auth instance:', !!auth);
    console.log('Auth app:', auth.app.name);
    console.log('Project ID:', auth.app.options.projectId);
    console.log('Auth domain:', auth.app.options.authDomain);
    
    console.log('2️⃣ Attempting password reset...');
    await sendPasswordResetEmail(auth, email);
    
    console.log('✅ SUCCESS: Password reset email sent!');
    console.log('📬 Check your email inbox and spam folder');
    console.log('📧 From: noreply@guardientry-database.firebaseapp.com');
    
    return {
      success: true,
      message: 'Password reset email sent successfully'
    };
    
  } catch (error) {
    console.error('❌ FAILED: Password reset failed');
    console.error('Error code:', error.code);
    console.error('Error message:', error.message);
    
    let analysis = '';
    let solution = '';
    
    switch (error.code) {
      case 'auth/user-not-found':
        analysis = 'User does not exist in Firebase Auth';
        solution = 'Register the user first in Firebase Console → Authentication → Users';
        break;
      case 'auth/invalid-email':
        analysis = 'Invalid email format';
        solution = 'Check email format';
        break;
      case 'auth/too-many-requests':
        analysis = 'Too many requests';
        solution = 'Wait before trying again';
        break;
      case 'auth/network-request-failed':
        analysis = 'Network error';
        solution = 'Check internet connection';
        break;
      case 'auth/quota-exceeded':
        analysis = 'Email quota exceeded';
        solution = 'Check Firebase Console → Usage → Upgrade plan if needed';
        break;
      default:
        analysis = 'Unknown error';
        solution = 'Check Firebase Console for details';
    }
    
    console.error('🔍 Analysis:', analysis);
    console.error('💡 Solution:', solution);
    
    return {
      success: false,
      error: error.message,
      code: error.code,
      analysis: analysis,
      solution: solution
    };
  }
};

// Make function available globally for testing
if (typeof window !== 'undefined') {
  window.testFirebasePasswordReset = testFirebasePasswordReset;
}
