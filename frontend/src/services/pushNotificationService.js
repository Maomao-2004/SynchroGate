// pushNotificationService.js - Send push notifications from frontend
import { doc, getDoc, setDoc, updateDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../utils/firebaseConfig';
import { BASE_URL } from '../utils/apiConfig';

// Send push notification to parent when schedule changes
export const sendScheduleChangeNotification = async (parentId, title, message, data = {}) => {
  try {
    // Get parent's push token from users collection
    const parentUserQuery = query(collection(db, 'users'), where('parentId', '==', parentId));
    const parentUserSnap = await getDocs(parentUserQuery);
    
    if (!parentUserSnap.empty) {
      const parentUserData = parentUserSnap.docs[0].data();
      const pushToken = parentUserData?.fcmToken;
      
      if (pushToken) {
        // Call backend API to send push notification
        const response = await fetch(`${BASE_URL}/notifications/push`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${await getAuthToken()}` // You'll need to implement this
          },
          body: JSON.stringify({
            fcmToken: pushToken,
            title,
            body: message,
            data
          })
        });
        
        if (response.ok) {
          console.log(`Push notification sent to parent ${parentId}`);
          return true;
        } else {
          console.error('Failed to send push notification:', response.statusText);
          return false;
        }
      } else {
        console.log(`No push token found for parent ${parentId}`);
        return false;
      }
    }
    return false;
  } catch (error) {
    console.error('Error sending push notification:', error);
    return false;
  }
};

// Get auth token for API calls
const getAuthToken = async () => {
  // This should return the current user's auth token
  // You might need to implement this based on your auth system
  return null;
};

// Send push notification to multiple parents
export const sendScheduleChangeNotificationToParents = async (parentIds, title, message, data = {}) => {
  const results = await Promise.all(
    parentIds.map(parentId => 
      sendScheduleChangeNotification(parentId, title, message, data)
    )
  );
  return results.some(result => result === true);
};

