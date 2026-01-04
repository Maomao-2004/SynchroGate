// Simple Password Reset Test
import { auth } from './firebaseConfig';
import { sendPasswordResetEmail } from 'firebase/auth';

export const testSimplePasswordReset = async (email) => {
  console.log('🧪 SIMPLE PASSWORD RESET TEST');
  console.log('==============================');
  console.log('📧 Email:', email);
  
  try {
    console.log('1️⃣ Checking Firebase Auth instance...');
    console.log('Auth:', auth);
    console.log('Auth app:', auth.app);
    console.log('Project ID:', auth.app.options.projectId);
    console.log('Auth domain:', auth.app.options.authDomain);
    
    console.log('2️⃣ Attempting to send password reset email...');
    await sendPasswordResetEmail(auth, email);
    
    console.log('✅ SUCCESS: Password reset email sent!');
    console.log('📬 Check your email inbox and spam folder');
    console.log('📧 From: noreply@guardientry-database.firebaseapp.com');
    console.log('🔗 Link: https://guardientry-database.firebaseapp.com/__/auth/action?mode=resetPassword&oobCode=...');
    
    return {
      success: true,
      message: 'Password reset email sent successfully'
    };
    
  } catch (error) {
    console.error('❌ FAILED: Password reset failed');
    console.error('Error code:', error.code);
    console.error('Error message:', error.message);
    console.error('Full error:', error);
    
    let analysis = '';
    let recommendation = '';
    
    switch (error.code) {
      case 'auth/user-not-found':
        analysis = 'User does not exist in Firebase Auth';
        recommendation = 'Register the user first in Firebase Console → Authentication → Users';
        break;
      case 'auth/invalid-email':
        analysis = 'Invalid email format';
        recommendation = 'Check email format';
        break;
      case 'auth/too-many-requests':
        analysis = 'Too many requests';
        recommendation = 'Wait before trying again';
        break;
      case 'auth/network-request-failed':
        analysis = 'Network error';
        recommendation = 'Check internet connection';
        break;
      case 'auth/quota-exceeded':
        analysis = 'Email quota exceeded';
        recommendation = 'Check Firebase Console → Usage → Upgrade plan if needed';
        break;
      case 'auth/invalid-api-key':
        analysis = 'Invalid API key';
        recommendation = 'Check Firebase configuration';
        break;
      default:
        analysis = 'Unknown error';
        recommendation = 'Check Firebase Console for details';
    }
    
    console.error('🔍 Analysis:', analysis);
    console.error('💡 Recommendation:', recommendation);
    
    return {
      success: false,
      error: error.message,
      code: error.code,
      analysis: analysis,
      recommendation: recommendation
    };
  }
};

export const checkFirebaseProjectStatus = () => {
  console.log('🏗️ FIREBASE PROJECT STATUS');
  console.log('============================');
  console.log('Project ID: guardientry-database');
  console.log('Console URL: https://console.firebase.google.com/project/guardientry-database');
  console.log('Auth URL: https://console.firebase.google.com/project/guardientry-database/authentication');
  console.log('Users URL: https://console.firebase.google.com/project/guardientry-database/authentication/users');
  console.log('Templates URL: https://console.firebase.google.com/project/guardientry-database/authentication/templates');
  console.log('Usage URL: https://console.firebase.google.com/project/guardientry-database/usage');
  
  console.log('\n📋 CHECKLIST:');
  console.log('1. Go to Firebase Console → Authentication → Users');
  console.log('2. Check if your email exists in the users list');
  console.log('3. If not, register the user first');
  console.log('4. Check Authentication → Templates → Password reset');
  console.log('5. Verify email templates are enabled');
  console.log('6. Check Usage → Authentication for email quotas');
  console.log('7. Free tier: 100 emails/day limit');
  
  return {
    projectId: 'guardientry-database',
    consoleUrl: 'https://console.firebase.google.com/project/guardientry-database',
    authUrl: 'https://console.firebase.google.com/project/guardientry-database/authentication',
    usersUrl: 'https://console.firebase.google.com/project/guardientry-database/authentication/users',
    templatesUrl: 'https://console.firebase.google.com/project/guardientry-database/authentication/templates',
    usageUrl: 'https://console.firebase.google.com/project/guardientry-database/usage'
  };
};

// Make functions available globally for testing
if (typeof window !== 'undefined') {
  window.testSimplePasswordReset = testSimplePasswordReset;
  window.checkFirebaseProjectStatus = checkFirebaseProjectStatus;
}
