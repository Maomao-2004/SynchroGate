// Deep Firebase Debug Utility
import { auth, db } from './firebaseConfig';
import { collection, getDocs, query, where, limit } from 'firebase/firestore';

export const deepFirebaseDebug = async () => {
  console.log('🔍 DEEP FIREBASE DEBUG');
  console.log('======================');
  
  try {
    // 1. Check Firebase App Configuration
    console.log('\n1️⃣ FIREBASE APP CONFIGURATION:');
    console.log('App name:', auth.app.name);
    console.log('Project ID:', auth.app.options.projectId);
    console.log('Auth Domain:', auth.app.options.authDomain);
    console.log('API Key present:', !!auth.app.options.apiKey);
    console.log('Storage Bucket:', auth.app.options.storageBucket);
    console.log('Messaging Sender ID:', auth.app.options.messagingSenderId);
    console.log('App ID:', auth.app.options.appId);
    
    // 2. Check Firestore Connection
    console.log('\n2️⃣ FIRESTORE CONNECTION:');
    try {
      const testRef = collection(db, 'users');
      const snapshot = await getDocs(testRef.limit(1));
      console.log('✅ Firestore connected successfully');
      console.log('Total users in database:', snapshot.size);
    } catch (error) {
      console.error('❌ Firestore connection failed:', error);
    }
    
    // 3. Check Auth Service
    console.log('\n3️⃣ FIREBASE AUTH SERVICE:');
    console.log('Auth instance:', auth);
    console.log('Auth config:', auth.config);
    console.log('Current user:', auth.currentUser);
    console.log('Auth state:', auth.currentUser ? 'Authenticated' : 'Not authenticated');
    
    // 4. Test Basic Auth Operations
    console.log('\n4️⃣ TESTING AUTH OPERATIONS:');
    try {
      // Test if we can import auth functions
      const { sendPasswordResetEmail } = await import('firebase/auth');
      console.log('✅ sendPasswordResetEmail function available');
      
      // Test auth instance
      if (auth && auth.app) {
        console.log('✅ Auth instance is valid');
      } else {
        console.error('❌ Auth instance is invalid');
      }
      
    } catch (error) {
      console.error('❌ Auth operations test failed:', error);
    }
    
    // 5. Check Network Connectivity
    console.log('\n5️⃣ NETWORK CONNECTIVITY:');
    try {
      const response = await fetch('https://www.google.com', { method: 'HEAD' });
      console.log('✅ Internet connection available');
    } catch (error) {
      console.error('❌ No internet connection:', error);
    }
    
    // 6. Check Firebase Project Status
    console.log('\n6️⃣ FIREBASE PROJECT STATUS:');
    console.log('Project URL: https://console.firebase.google.com/project/guardientry-database');
    console.log('Auth URL: https://console.firebase.google.com/project/guardientry-database/authentication');
    console.log('Users URL: https://console.firebase.google.com/project/guardientry-database/authentication/users');
    
    return {
      success: true,
      message: 'Deep debug completed - check console for details'
    };
    
  } catch (error) {
    console.error('❌ Deep debug failed:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

export const testEmailSending = async (email) => {
  console.log('📧 TESTING EMAIL SENDING');
  console.log('========================');
  console.log('Email:', email);
  
  try {
    // Import auth functions
    const { sendPasswordResetEmail } = await import('firebase/auth');
    
    console.log('\n1️⃣ PREPARING EMAIL SEND:');
    console.log('Auth instance:', auth);
    console.log('Email address:', email);
    
    // Test the actual send
    console.log('\n2️⃣ SENDING EMAIL:');
    console.log('Calling sendPasswordResetEmail...');
    
    await sendPasswordResetEmail(auth, email);
    
    console.log('✅ Email send completed successfully!');
    console.log('📬 Check your email inbox');
    console.log('📧 From: noreply@guardientry-database.firebaseapp.com');
    console.log('📧 Subject: Reset your password for Guardientry');
    console.log('🔗 Link format: https://guardientry-database.firebaseapp.com/__/auth/action?mode=resetPassword&oobCode=...');
    
    return {
      success: true,
      message: 'Email sent successfully'
    };
    
  } catch (error) {
    console.error('❌ Email sending failed:', error);
    console.error('Error code:', error.code);
    console.error('Error message:', error.message);
    
    // Detailed error analysis
    let analysis = '';
    switch (error.code) {
      case 'auth/user-not-found':
        analysis = 'User does not exist in Firebase Auth. Check Firebase Console → Authentication → Users';
        break;
      case 'auth/invalid-email':
        analysis = 'Email format is invalid';
        break;
      case 'auth/too-many-requests':
        analysis = 'Too many requests. Wait before trying again';
        break;
      case 'auth/network-request-failed':
        analysis = 'Network error. Check internet connection';
        break;
      case 'auth/quota-exceeded':
        analysis = 'Email quota exceeded. Check Firebase Console → Usage';
        break;
      case 'auth/invalid-api-key':
        analysis = 'Invalid API key. Check Firebase configuration';
        break;
      default:
        analysis = 'Unknown error. Check Firebase Console for details';
    }
    
    console.error('🔍 Error analysis:', analysis);
    
    return {
      success: false,
      error: error.message,
      code: error.code,
      analysis: analysis
    };
  }
};

export const checkFirebaseQuotas = () => {
  console.log('📊 FIREBASE QUOTAS CHECK');
  console.log('========================');
  console.log('Check these in Firebase Console:');
  console.log('1. Go to: https://console.firebase.google.com/project/guardientry-database/usage');
  console.log('2. Look for "Authentication" section');
  console.log('3. Check "Email" quota usage');
  console.log('4. Free tier limit: 100 emails/day');
  console.log('5. If quota exceeded, upgrade plan or wait for reset');
  
  return {
    message: 'Check Firebase Console for quota details',
    url: 'https://console.firebase.google.com/project/guardientry-database/usage'
  };
};

// Make functions available globally for testing
if (typeof window !== 'undefined') {
  window.deepFirebaseDebug = deepFirebaseDebug;
  window.testEmailSending = testEmailSending;
  window.checkFirebaseQuotas = checkFirebaseQuotas;
}
