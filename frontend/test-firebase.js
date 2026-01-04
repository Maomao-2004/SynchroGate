// Test Firebase connection and data fetching
import { collection, getDocs } from 'firebase/firestore';
import { db } from './src/utils/firebaseConfig';

export const testFirebaseConnection = async () => {
  try {
    console.log('🧪 Testing Firebase connection...');
    
    // Test basic connection
    const usersRef = collection(db, 'users');
    const snapshot = await getDocs(usersRef);
    
    console.log('✅ Firebase connection successful!');
    console.log('📊 Users collection size:', snapshot.size);
    
    if (snapshot.size > 0) {
      console.log('👥 Available users:');
      snapshot.docs.forEach((doc, index) => {
        const data = doc.data();
        console.log(`  ${index + 1}. ID: ${doc.id}, Email: ${data.email}, Role: ${data.role}`);
      });
    } else {
      console.log('⚠️ No users found in the collection');
    }
    
    return true;
  } catch (error) {
    console.error('❌ Firebase connection failed:', error);
    return false;
  }
};

// Run test if this file is executed directly
if (typeof window !== 'undefined') {
  testFirebaseConnection();
}
