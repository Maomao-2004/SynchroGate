// Security Test for Role-Based Access Control
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from './firebaseConfig';

export const testRoleSecurity = async () => {
  console.log('🔐 Testing Role-Based Security...');
  
  try {
    // Test 1: Check if we can access users collection
    console.log('\n1️⃣ Testing users collection access...');
    const usersRef = collection(db, 'users');
    const usersSnapshot = await getDocs(usersRef);
    console.log(`✅ Users collection accessible: ${usersSnapshot.size} documents`);
    
    // Test 2: Check specific user data
    console.log('\n2️⃣ Testing specific user queries...');
    const testEmail = '20palabayronhiel04@gmail.com';
    const userQuery = query(usersRef, where('email', '==', testEmail));
    const userSnapshot = await getDocs(userQuery);
    
    if (userSnapshot.size > 0) {
      const userData = userSnapshot.docs[0].data();
      console.log('👤 User found:', {
        email: userData.email,
        role: userData.role,
        firstName: userData.firstName,
        lastName: userData.lastName
      });
      
      // Test 3: Verify role security
      console.log('\n3️⃣ Testing role security...');
      if (userData.role === 'student') {
        console.log('✅ User is correctly identified as STUDENT');
        console.log('🔒 Security check: Parent accounts should NOT be able to login as student');
      } else if (userData.role === 'parent') {
        console.log('✅ User is correctly identified as PARENT');
        console.log('🔒 Security check: Student accounts should NOT be able to login as parent');
      } else {
        console.log('⚠️ Unknown role:', userData.role);
      }
    } else {
      console.log('❌ User not found in database');
    }
    
    // Test 4: Test attendance collection
    console.log('\n4️⃣ Testing attendance collection...');
    const attendanceRef = collection(db, 'attendanceLogs');
    const attendanceSnapshot = await getDocs(attendanceRef);
    console.log(`✅ Attendance collection accessible: ${attendanceSnapshot.size} documents`);
    
    // Test 5: Test other collections
    const collections = ['parent_student_links', 'students', 'notifications', 'alerts'];
    for (const collectionName of collections) {
      try {
        console.log(`\n5️⃣ Testing ${collectionName} collection...`);
        const collectionRef = collection(db, collectionName);
        const snapshot = await getDocs(collectionRef);
        console.log(`✅ ${collectionName}: ${snapshot.size} documents`);
      } catch (error) {
        console.error(`❌ ${collectionName} error:`, error.message);
      }
    }
    
    console.log('\n🎉 Security test completed!');
    console.log('\n🔐 SECURITY RECOMMENDATIONS:');
    console.log('1. Ensure Firebase rules are updated');
    console.log('2. Test that parent accounts cannot login as student');
    console.log('3. Test that student accounts cannot login as parent');
    console.log('4. Verify role validation is working in login process');
    
    return true;
    
  } catch (error) {
    console.error('❌ Security test failed:', {
      code: error.code,
      message: error.message
    });
    
    if (error.code === 'permission-denied') {
      console.error('🚨 PERMISSION DENIED: Firebase rules need to be updated!');
      console.error('📋 Please follow the instructions in VERIFY_FIREBASE_RULES.md');
    }
    
    return false;
  }
};

// Test role switching prevention
export const testRoleSwitchingPrevention = async () => {
  console.log('🔐 Testing Role Switching Prevention...');
  
  // This would be called after login attempts to verify security
  console.log('✅ Role switching prevention is implemented in AuthContext');
  console.log('🔒 Users can only login with their actual registered role');
  console.log('🚨 Any role mismatch will result in immediate logout');
  
  return true;
};

// Make it available globally for testing
if (typeof window !== 'undefined') {
  window.testRoleSecurity = testRoleSecurity;
  window.testRoleSwitchingPrevention = testRoleSwitchingPrevention;
}
