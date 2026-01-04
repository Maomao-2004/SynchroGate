// Test Firebase Rules and Connection
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from './firebaseConfig';

export const testFirebaseRules = async () => {
  console.log('🧪 Testing Firebase Rules and Connection...');
  
  try {
    // Test 1: Basic connection
    console.log('\n1️⃣ Testing basic Firebase connection...');
    const usersRef = collection(db, 'users');
    const basicSnapshot = await getDocs(usersRef);
    console.log('✅ Basic connection successful!');
    console.log(`📊 Users collection size: ${basicSnapshot.size}`);
    
    // Test 2: Query with where clause
    console.log('\n2️⃣ Testing query with where clause...');
    const testEmail = '20palabayronhiel04@gmail.com';
    const q = query(usersRef, where('email', '==', testEmail));
    const querySnapshot = await getDocs(q);
    console.log(`✅ Query successful! Found ${querySnapshot.size} documents for email: ${testEmail}`);
    
    if (querySnapshot.size > 0) {
      const userData = querySnapshot.docs[0].data();
      console.log('👤 User data found:', {
        firstName: userData.firstName,
        lastName: userData.lastName,
        email: userData.email,
        role: userData.role,
        studentId: userData.studentId
      });
    }
    
    // Test 3: Test attendance collection
    console.log('\n3️⃣ Testing attendance collection...');
    const attendanceRef = collection(db, 'attendanceLogs');
    const attendanceSnapshot = await getDocs(attendanceRef);
    console.log(`✅ Attendance collection accessible! Size: ${attendanceSnapshot.size}`);
    
    // Test 4: Test other collections
    const collections = ['parent_student_links', 'students', 'notifications', 'alerts'];
    for (const collectionName of collections) {
      try {
        console.log(`\n4️⃣ Testing ${collectionName} collection...`);
        const collectionRef = collection(db, collectionName);
        const snapshot = await getDocs(collectionRef);
        console.log(`✅ ${collectionName}: ${snapshot.size} documents`);
      } catch (error) {
        console.error(`❌ ${collectionName} error:`, error.message);
      }
    }
    
    console.log('\n🎉 All Firebase tests completed!');
    return true;
    
  } catch (error) {
    console.error('❌ Firebase test failed:', {
      code: error.code,
      message: error.message,
      stack: error.stack
    });
    
    if (error.code === 'permission-denied') {
      console.error('🚨 PERMISSION DENIED: Firebase rules need to be updated!');
      console.error('📋 Please follow the instructions in UPDATE_FIREBASE_RULES.md');
    }
    
    return false;
  }
};

// Make it available globally for testing
if (typeof window !== 'undefined') {
  window.testFirebaseRules = testFirebaseRules;
}
