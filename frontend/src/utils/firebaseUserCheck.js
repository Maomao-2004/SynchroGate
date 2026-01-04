// Firebase User Check Utility
import { auth, db } from './firebaseConfig';
import { collection, query, where, getDocs } from 'firebase/firestore';

export const checkUserInFirebase = async (email) => {
  console.log('🔍 CHECKING USER IN FIREBASE');
  console.log('============================');
  console.log('📧 Email:', email);
  
  const results = {
    email: email,
    timestamp: new Date().toISOString(),
    checks: {}
  };
  
  try {
    // 1. Check Firestore users collection
    console.log('\n1️⃣ CHECKING FIRESTORE USERS:');
    try {
      const usersRef = collection(db, 'users');
      const q = query(usersRef, where('email', '==', email));
      const querySnapshot = await getDocs(q);
      
      if (querySnapshot.empty) {
        results.checks.firestore = {
          exists: false,
          message: 'User not found in Firestore'
        };
        console.log('❌ User not found in Firestore');
      } else {
        const userDoc = querySnapshot.docs[0];
        const userData = userDoc.data();
        results.checks.firestore = {
          exists: true,
          data: userData,
          id: userDoc.id
        };
        console.log('✅ User found in Firestore:', userData);
      }
    } catch (error) {
      results.checks.firestore = {
        exists: false,
        error: error.message
      };
      console.error('❌ Firestore check failed:', error.message);
    }
    
    // 2. Check Firebase Auth (indirectly by attempting password reset)
    console.log('\n2️⃣ CHECKING FIREBASE AUTH:');
    try {
      const { sendPasswordResetEmail } = await import('firebase/auth');
      
      console.log('📧 Attempting password reset to check if user exists in Firebase Auth...');
      await sendPasswordResetEmail(auth, email);
      
      results.checks.firebaseAuth = {
        exists: true,
        message: 'User exists in Firebase Auth (password reset sent)'
      };
      console.log('✅ User exists in Firebase Auth - password reset email sent!');
      
    } catch (error) {
      results.checks.firebaseAuth = {
        exists: false,
        error: error.message,
        code: error.code
      };
      console.error('❌ Firebase Auth check failed:', error.message);
      console.error('Error code:', error.code);
      
      if (error.code === 'auth/user-not-found') {
        console.log('💡 This means the user does not exist in Firebase Auth');
        console.log('💡 The user needs to be registered first');
      }
    }
    
    // 3. Summary and recommendations
    console.log('\n3️⃣ SUMMARY:');
    const firestoreExists = results.checks.firestore?.exists || false;
    const firebaseAuthExists = results.checks.firebaseAuth?.exists || false;
    
    console.log('Firestore user exists:', firestoreExists);
    console.log('Firebase Auth user exists:', firebaseAuthExists);
    
    if (!firebaseAuthExists) {
      console.log('\n🚨 ISSUE IDENTIFIED:');
      console.log('The user does not exist in Firebase Auth.');
      console.log('Password reset emails can only be sent to users registered in Firebase Auth.');
      
      console.log('\n💡 SOLUTIONS:');
      console.log('1. Register the user in Firebase Console → Authentication → Users');
      console.log('2. Or use a different email that is already registered');
      console.log('3. Or register the user through your app first');
      
      results.recommendations = [
        'User does not exist in Firebase Auth',
        'Register the user first in Firebase Console',
        'Or use a registered email address',
        'Or register through the app'
      ];
    } else {
      console.log('\n✅ USER EXISTS:');
      console.log('The user exists in Firebase Auth.');
      console.log('Password reset email should have been sent.');
      console.log('Check your email inbox and spam folder.');
      
      results.recommendations = [
        'User exists in Firebase Auth',
        'Password reset email sent',
        'Check email inbox and spam folder',
        'Look for email from noreply@guardientry-database.firebaseapp.com'
      ];
    }
    
    return results;
    
  } catch (error) {
    console.error('❌ User check failed:', error);
    results.error = error.message;
    return results;
  }
};

export const registerTestUser = async (email, password = 'testpassword123') => {
  console.log('👤 REGISTERING TEST USER');
  console.log('========================');
  console.log('📧 Email:', email);
  console.log('🔑 Password:', password);
  
  try {
    const { createUserWithEmailAndPassword } = await import('firebase/auth');
    
    console.log('📝 Creating user in Firebase Auth...');
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;
    
    console.log('✅ User created in Firebase Auth:', user.uid);
    
    // Also create user document in Firestore
    try {
      const { doc, setDoc } = await import('firebase/firestore');
      const userDocRef = doc(db, 'users', user.uid);
      
      await setDoc(userDocRef, {
        email: email,
        role: 'student',
        firstName: 'Test',
        lastName: 'User',
        createdAt: new Date().toISOString()
      });
      
      console.log('✅ User document created in Firestore');
      
    } catch (firestoreError) {
      console.error('❌ Firestore document creation failed:', firestoreError);
    }
    
    return {
      success: true,
      uid: user.uid,
      email: user.email,
      message: 'User registered successfully'
    };
    
  } catch (error) {
    console.error('❌ User registration failed:', error);
    return {
      success: false,
      error: error.message,
      code: error.code
    };
  }
};

// Make functions available globally for testing
if (typeof window !== 'undefined') {
  window.checkUserInFirebase = checkUserInFirebase;
  window.registerTestUser = registerTestUser;
}
