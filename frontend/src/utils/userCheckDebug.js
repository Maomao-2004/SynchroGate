// User Check Debug Utility
import { auth, db } from './firebaseConfig';
import { collection, query, where, getDocs } from 'firebase/firestore';

export const checkUserExists = async (email) => {
  console.log('🔍 CHECKING IF USER EXISTS');
  console.log('==========================');
  console.log('📧 Email to check:', email);
  
  try {
    // Check in Firestore users collection
    console.log('\n1️⃣ CHECKING FIRESTORE USERS COLLECTION:');
    const usersRef = collection(db, 'users');
    const q = query(usersRef, where('email', '==', email));
    const querySnapshot = await getDocs(q);
    
    if (querySnapshot.empty) {
      console.log('❌ No user found in Firestore with email:', email);
      console.log('💡 This means the user is not registered in your system');
      return {
        exists: false,
        source: 'firestore',
        message: 'User not found in Firestore'
      };
    } else {
      const userDoc = querySnapshot.docs[0];
      const userData = userDoc.data();
      console.log('✅ User found in Firestore:', {
        id: userDoc.id,
        email: userData.email,
        role: userData.role,
        firstName: userData.firstName,
        lastName: userData.lastName
      });
      
      return {
        exists: true,
        source: 'firestore',
        data: userData,
        id: userDoc.id
      };
    }
    
  } catch (error) {
    console.error('❌ Error checking user in Firestore:', error);
    return {
      exists: false,
      error: error.message,
      source: 'firestore'
    };
  }
};

export const checkFirebaseAuthUser = async (email) => {
  console.log('\n2️⃣ CHECKING FIREBASE AUTH:');
  console.log('Note: Firebase Auth users can only be checked through Firebase Console');
  console.log('or by attempting authentication operations');
  
  return {
    message: 'Use Firebase Console to check Auth users',
    consoleUrl: 'https://console.firebase.google.com/project/guardientry-database/authentication/users'
  };
};

export const testPasswordResetForUser = async (email) => {
  console.log('\n3️⃣ TESTING PASSWORD RESET FOR USER:');
  console.log('====================================');
  
  // First check if user exists
  const userCheck = await checkUserExists(email);
  
  if (!userCheck.exists) {
    console.log('❌ Cannot test password reset - user does not exist');
    console.log('💡 User must be registered first');
    return {
      success: false,
      error: 'User not found in system',
      suggestion: 'Register the user first or check if email is correct'
    };
  }
  
  // If user exists, test password reset
  try {
    const { sendPasswordResetEmail } = await import('firebase/auth');
    console.log('📧 Attempting password reset for existing user...');
    
    await sendPasswordResetEmail(auth, email);
    
    console.log('✅ Password reset email sent successfully!');
    console.log('📬 Check email inbox (including spam folder)');
    console.log('🔗 Reset link should be from: noreply@guardientry-database.firebaseapp.com');
    
    return {
      success: true,
      message: 'Password reset email sent successfully',
      userData: userCheck.data
    };
    
  } catch (error) {
    console.error('❌ Password reset failed:', error);
    
    let errorMessage = 'Unknown error';
    switch (error.code) {
      case 'auth/user-not-found':
        errorMessage = 'User not found in Firebase Auth (but exists in Firestore)';
        break;
      case 'auth/invalid-email':
        errorMessage = 'Invalid email format';
        break;
      case 'auth/too-many-requests':
        errorMessage = 'Too many requests. Try again later';
        break;
      default:
        errorMessage = error.message;
    }
    
    return {
      success: false,
      error: errorMessage,
      code: error.code,
      userData: userCheck.data
    };
  }
};

// Make functions available globally for testing
if (typeof window !== 'undefined') {
  window.checkUserExists = checkUserExists;
  window.checkFirebaseAuthUser = checkFirebaseAuthUser;
  window.testPasswordResetForUser = testPasswordResetForUser;
}
