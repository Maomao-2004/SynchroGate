// Firebase Debug Utility
import { collection, getDocs, query, where, orderBy } from 'firebase/firestore';
import { db } from './firebaseConfig';

export const testAllCollections = async () => {
  const collections = [
    'users',
    'attendanceLogs', 
    'parent_student_links',
    'students',
    'notifications',
    'notificationLogs',
    'alerts'
  ];

  console.log('🧪 Testing all Firebase collections...');
  
  for (const collectionName of collections) {
    try {
      console.log(`\n🔍 Testing collection: ${collectionName}`);
      const collectionRef = collection(db, collectionName);
      const snapshot = await getDocs(collectionRef);
      
      console.log(`✅ ${collectionName}: ${snapshot.size} documents`);
      
      if (snapshot.size > 0) {
        console.log(`📄 Sample document:`, snapshot.docs[0].data());
      }
    } catch (error) {
      console.error(`❌ ${collectionName} error:`, {
        code: error.code,
        message: error.message
      });
    }
  }
};

export const testUserQuery = async (email) => {
  try {
    console.log(`\n🔍 Testing user query for email: ${email}`);
    const usersRef = collection(db, 'users');
    const q = query(usersRef, where('email', '==', email.toLowerCase()));
    const snapshot = await getDocs(q);
    
    console.log(`✅ User query result: ${snapshot.size} documents`);
    if (snapshot.size > 0) {
      console.log(`👤 User data:`, snapshot.docs[0].data());
    }
  } catch (error) {
    console.error(`❌ User query error:`, {
      code: error.code,
      message: error.message
    });
  }
};

export const testAttendanceQuery = async (studentId) => {
  try {
    console.log(`\n🔍 Testing attendance query for studentId: ${studentId}`);
    const attendanceRef = collection(db, 'attendanceLogs');
    const q = query(
      attendanceRef,
      where('studentId', '==', studentId),
      orderBy('timestamp', 'desc')
    );
    const snapshot = await getDocs(q);
    
    console.log(`✅ Attendance query result: ${snapshot.size} documents`);
    if (snapshot.size > 0) {
      console.log(`📊 Sample attendance:`, snapshot.docs[0].data());
    }
  } catch (error) {
    console.error(`❌ Attendance query error:`, {
      code: error.code,
      message: error.message
    });
  }
};

// Run tests if this file is executed directly
if (typeof window !== 'undefined') {
  // Test all collections
  testAllCollections();
}
