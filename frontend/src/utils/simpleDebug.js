// Simple Firebase Debug - No Dynamic Imports
import { collection, getDocs, query, where, orderBy, limit } from 'firebase/firestore';
import { auth, db } from './firebaseConfig';

export const simpleDebug = async () => {
  console.log('🔍 SIMPLE FIREBASE DEBUG');
  console.log('========================');
  
  // Check authentication status
  console.log('\n1️⃣ AUTHENTICATION STATUS:');
  if (auth.currentUser) {
    console.log('✅ User is authenticated:', {
      uid: auth.currentUser.uid,
      email: auth.currentUser.email,
      emailVerified: auth.currentUser.emailVerified
    });
  } else {
    console.log('❌ User is NOT authenticated');
    console.log('🚨 This is why you get permission errors!');
    return false;
  }
  
  // Test basic Firestore access
  console.log('\n2️⃣ TESTING FIRESTORE ACCESS:');
  try {
    console.log('✅ Firestore connection established');
    console.log('📊 Project ID:', db.app.options.projectId);
  } catch (error) {
    console.error('❌ Firestore connection failed:', error);
    return false;
  }
  
  // Test users collection
  console.log('\n3️⃣ TESTING USERS COLLECTION:');
  try {
    const usersRef = collection(db, 'users');
    const usersSnapshot = await getDocs(usersRef);
    console.log('✅ Users collection accessible');
    console.log('📊 Total users:', usersSnapshot.size);
    
    if (usersSnapshot.size > 0) {
      const firstUser = usersSnapshot.docs[0].data();
      console.log('👤 Sample user data:', {
        email: firstUser.email,
        role: firstUser.role,
        firstName: firstUser.firstName
      });
    }
  } catch (error) {
    console.error('❌ Users collection error:', {
      code: error.code,
      message: error.message
    });
  }
  
  // Test attendanceLogs collection
  console.log('\n4️⃣ TESTING ATTENDANCE LOGS COLLECTION:');
  try {
    const attendanceRef = collection(db, 'attendanceLogs');
    const attendanceSnapshot = await getDocs(attendanceRef);
    console.log('✅ Attendance logs collection accessible');
    console.log('📊 Total attendance logs:', attendanceSnapshot.size);
  } catch (error) {
    console.error('❌ Attendance logs collection error:', {
      code: error.code,
      message: error.message
    });
  }
  
  // Test specific user query
  console.log('\n5️⃣ TESTING SPECIFIC USER QUERY:');
  try {
    const testEmail = '20palabayronhiel04@gmail.com';
    const usersRef = collection(db, 'users');
    const userQuery = query(usersRef, where('email', '==', testEmail));
    const userSnapshot = await getDocs(userQuery);
    
    if (userSnapshot.size > 0) {
      const userData = userSnapshot.docs[0].data();
      console.log('✅ User query successful');
      console.log('👤 User data:', {
        email: userData.email,
        role: userData.role,
        firstName: userData.firstName,
        lastName: userData.lastName
      });
    } else {
      console.log('⚠️ User not found in database');
    }
  } catch (error) {
    console.error('❌ User query error:', {
      code: error.code,
      message: error.message
    });
  }
  
  // Test attendance query
  console.log('\n6️⃣ TESTING ATTENDANCE QUERY:');
  try {
    const attendanceRef = collection(db, 'attendanceLogs');
    const attendanceQuery = query(
      attendanceRef,
      where('studentId', '==', '2022-00689'),
      orderBy('timestamp', 'desc'),
      limit(5)
    );
    const attendanceSnapshot = await getDocs(attendanceQuery);
    console.log('✅ Attendance query successful');
    console.log('📊 Attendance logs found:', attendanceSnapshot.size);
  } catch (error) {
    console.error('❌ Attendance query error:', {
      code: error.code,
      message: error.message
    });
  }
  
  // Test other collections
  console.log('\n7️⃣ TESTING OTHER COLLECTIONS:');
  const collections = [
    'parent_student_links',
    'students',
    'notifications',
    'notificationLogs',
    'alerts'
  ];
  
  for (const collectionName of collections) {
    try {
      const collectionRef = collection(db, collectionName);
      const snapshot = await getDocs(collectionRef);
      console.log(`✅ ${collectionName}: ${snapshot.size} documents`);
    } catch (error) {
      console.error(`❌ ${collectionName}: ${error.code} - ${error.message}`);
    }
  }
  
  console.log('\n🎯 DIAGNOSIS:');
  console.log('=============');
  
  if (!auth.currentUser) {
    console.log('🚨 MAIN ISSUE: User is not authenticated');
    console.log('💡 SOLUTION: Make sure user is logged in before testing');
  } else {
    console.log('✅ User is authenticated - rules should work');
    console.log('💡 If still getting errors, Firebase rules may not be updated');
    console.log('📋 Check Firebase Console to verify rules are published');
  }
  
  return true;
};

// Make it available globally
if (typeof window !== 'undefined') {
  window.simpleDebug = simpleDebug;
}
