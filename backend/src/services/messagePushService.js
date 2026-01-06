// messagePushService.js - Backend service to automatically send push notifications when new messages are sent in conversations
const { firestore } = require('../config/firebase');
const pushService = require('./pushService');
const { getLinkFcmTokens } = require('../utils/linkFcmTokenHelper');

let conversationListeners = new Map(); // Key: conversationId, Value: unsubscribe function
let previousMessages = new Map(); // Key: conversationId, Value: Set of message IDs

/**
 * CRITICAL: Verify user is logged in and active
 * Returns true only if user has ALL required fields and logged in within 12 HOURS
 * This prevents sending notifications to users who logged out or are inactive
 */
const isUserLoggedIn = (userData) => {
  if (!userData) {
    return false;
  }
  
  // Must have role, uid, and fcmToken
  if (!userData.role || !userData.uid || !userData.fcmToken) {
    return false;
  }
  
  // Must have login timestamp
  const lastLoginAt = userData.lastLoginAt;
  if (!lastLoginAt) {
    return false;
  }
  
  // Parse timestamp
  let loginTimestampMs = null;
  try {
    if (typeof lastLoginAt === 'string') {
      loginTimestampMs = new Date(lastLoginAt).getTime();
    } else if (lastLoginAt.toMillis) {
      loginTimestampMs = lastLoginAt.toMillis();
    } else if (lastLoginAt.seconds) {
      loginTimestampMs = lastLoginAt.seconds * 1000;
    } else if (typeof lastLoginAt === 'number') {
      loginTimestampMs = lastLoginAt > 1000000000000 ? lastLoginAt : lastLoginAt * 1000;
    }
  } catch (e) {
    return false;
  }
  
  if (!loginTimestampMs || isNaN(loginTimestampMs)) {
    return false;
  }
  
  // Must be logged in within 12 HOURS
  const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;
  const timeSinceLogin = Date.now() - loginTimestampMs;
  
  if (timeSinceLogin > TWELVE_HOURS_MS) {
    return false;
  }
  
  return true;
};

/**
 * Get user FCM token - try to get from users collection or from parent_student_links
 */
const getUserFcmToken = async (userId, role) => {
  try {
    // First, try to get from users collection
    const userDoc = await firestore.collection('users').doc(userId).get();
    if (userDoc.exists) {
      const userData = userDoc.data();
      if (userData.fcmToken && isUserLoggedIn(userData)) {
        return userData.fcmToken;
      }
    }
    
    // If not found and role is parent/student, try parent_student_links
    if (role === 'parent' || role === 'student') {
      const links = await getLinkFcmTokens({
        parentId: role === 'parent' ? userId : null,
        parentIdNumber: role === 'parent' ? userId : null,
        studentId: role === 'student' ? userId : null,
        studentIdNumber: role === 'student' ? userId : null
      });
      
      if (links.length > 0) {
        const link = links[0];
        if (role === 'parent' && link.parentFcmToken) {
          return link.parentFcmToken;
        } else if (role === 'student' && link.studentFcmToken) {
          return link.studentFcmToken;
        }
      }
    }
    
    return null;
  } catch (error) {
    console.error(`Error getting FCM token for ${role} ${userId}:`, error);
    return null;
  }
};

/**
 * Send push notification for a new message
 */
const sendMessagePushNotification = async (message, conversationId, conversationData) => {
  try {
    const senderId = message.senderId;
    if (!senderId) {
      return;
    }
    
    // Get conversation members
    const members = conversationData.members || [];
    if (members.length < 2) {
      return;
    }
    
    // Find recipient (the one who didn't send the message)
    const recipientId = members.find(id => id !== senderId);
    if (!recipientId) {
      return;
    }
    
    // Determine recipient role and document ID
    let recipientDocId = recipientId;
    let recipientRole = null;
    
    // Try to get user document to determine role
    try {
      const userDoc = await firestore.collection('users').doc(recipientId).get();
      if (userDoc.exists) {
        const userData = userDoc.data();
        recipientRole = userData.role;
        // Use canonical ID if available
        if (userData.role === 'student' && userData.studentId) {
          recipientDocId = userData.studentId;
        } else if (userData.role === 'parent' && (userData.parentId || userData.parentIdNumber)) {
          recipientDocId = userData.parentId || userData.parentIdNumber || recipientId;
        }
        
        // Check if user is logged in
        if (!isUserLoggedIn(userData)) {
          console.log(`⏭️ [MESSAGE] SKIP - recipient ${recipientId} is NOT LOGGED IN`);
          return;
        }
      } else {
        // If document doesn't exist with this ID, try querying by UID
        const userQuery = await firestore.collection('users')
          .where('uid', '==', recipientId)
          .limit(1)
          .get();
        
        if (!userQuery.empty) {
          const userData = userQuery.docs[0].data();
          recipientRole = userData.role;
          recipientDocId = userQuery.docs[0].id;
          
          if (!isUserLoggedIn(userData)) {
            console.log(`⏭️ [MESSAGE] SKIP - recipient ${recipientId} is NOT LOGGED IN`);
            return;
          }
        } else {
          console.log(`⏭️ [MESSAGE] SKIP - recipient ${recipientId} not found in users collection`);
          return;
        }
      }
    } catch (error) {
      console.error(`Error getting recipient user data for ${recipientId}:`, error);
      return;
    }
    
    // Get sender name for notification
    let senderName = 'Someone';
    try {
      const senderDoc = await firestore.collection('users').doc(senderId).get();
      if (senderDoc.exists) {
        const senderData = senderDoc.data();
        const firstName = senderData.firstName || '';
        const lastName = senderData.lastName || '';
        senderName = `${firstName} ${lastName}`.trim() || 'Someone';
      }
    } catch (error) {
      console.warn('Error getting sender name:', error);
    }
    
    // Get FCM token for recipient
    const fcmToken = await getUserFcmToken(recipientDocId, recipientRole);
    if (!fcmToken) {
      console.log(`⏭️ [MESSAGE] SKIP - recipient ${recipientId} has no FCM token`);
      return;
    }
    
    // Prepare message text (truncate if too long)
    const messageText = String(message.text || '').trim();
    const truncatedText = messageText.length > 100 ? messageText.substring(0, 100) + '...' : messageText;
    
    // Send push notification
    await pushService.sendPush(
      fcmToken,
      `New message from ${senderName}`,
      truncatedText,
      {
        type: 'message',
        conversationId: conversationId,
        messageId: message.id || '',
        senderId: senderId,
        senderName: senderName,
        text: messageText,
        createdAt: message.createdAt ? (typeof message.createdAt.toMillis === 'function' ? message.createdAt.toMillis() : String(message.createdAt)) : Date.now()
      }
    );
    
    console.log(`✅✅✅ MESSAGE PUSH SENT to ${recipientRole} ${recipientId} from ${senderName}`);
    
  } catch (error) {
    console.error(`❌ Message push notification failed:`, error.message);
  }
};

/**
 * Initialize listener for messages in a specific conversation
 */
const initializeConversationListener = async (conversationId) => {
  // Clean up existing listener if any
  if (conversationListeners.has(conversationId)) {
    try {
      conversationListeners.get(conversationId)();
    } catch {}
    conversationListeners.delete(conversationId);
  }
  
  // Get conversation data first
  let conversationData = null;
  try {
    const conversationRef = firestore.collection('conversations').doc(conversationId);
    const conversationSnap = await conversationRef.get();
    if (!conversationSnap.exists) {
      return;
    }
    conversationData = conversationSnap.data();
  } catch (error) {
    console.error(`Error getting conversation ${conversationId}:`, error);
    return;
  }
  
  let previousMessageIds = previousMessages.get(conversationId) || new Set();
  let isInitialSnapshot = true;
  const listenerStartTime = Date.now();
  
  // Listen to messages subcollection
  const messagesRef = firestore.collection('conversations').doc(conversationId).collection('messages');
  
  const unsubscribe = messagesRef.orderBy('createdAt', 'desc').limit(1).onSnapshot(async (messagesSnap) => {
    if (isInitialSnapshot) {
      // Store existing message IDs
      messagesSnap.docs.forEach(doc => {
        previousMessageIds.add(doc.id);
      });
      previousMessages.set(conversationId, previousMessageIds);
      isInitialSnapshot = false;
      return;
    }
    
    // Check for new messages
    for (const change of messagesSnap.docChanges()) {
      if (change.type === 'added') {
        const messageId = change.doc.id;
        
        // Skip if we've already processed this message
        if (previousMessageIds.has(messageId)) {
          continue;
        }
        
        // Skip messages older than listener start time (to avoid processing old messages)
        const messageData = change.doc.data();
        let messageTime = null;
        try {
          if (messageData.createdAt) {
            if (typeof messageData.createdAt.toMillis === 'function') {
              messageTime = messageData.createdAt.toMillis();
            } else if (messageData.createdAt.seconds) {
              messageTime = messageData.createdAt.seconds * 1000;
            } else if (typeof messageData.createdAt === 'string') {
              messageTime = new Date(messageData.createdAt).getTime();
            }
          }
        } catch (e) {
          // Ignore
        }
        
        if (messageTime && messageTime < listenerStartTime) {
          previousMessageIds.add(messageId);
          previousMessages.set(conversationId, previousMessageIds);
          continue;
        }
        
        // Mark as processed
        previousMessageIds.add(messageId);
        previousMessages.set(conversationId, previousMessageIds);
        
        // Send push notification
        await sendMessagePushNotification(
          { id: messageId, ...messageData },
          conversationId,
          conversationData
        );
      }
    }
  }, (error) => {
    console.error(`Error in messages listener for conversation ${conversationId}:`, error);
  });
  
  conversationListeners.set(conversationId, unsubscribe);
};

/**
 * Initialize listener for all conversations
 * This will listen to new conversations and set up listeners for each
 */
const initializeAllConversationListeners = () => {
  console.log('🔄 Initializing message push notification listeners...');
  
  const conversationsRef = firestore.collection('conversations');
  
  // Listen to all conversations
  conversationsRef.onSnapshot(async (snapshot) => {
    const currentConversationIds = new Set();
    
    // Initialize listeners for existing and new conversations
    snapshot.docs.forEach((doc) => {
      const conversationId = doc.id;
      currentConversationIds.add(conversationId);
      
      if (!conversationListeners.has(conversationId)) {
        console.log(`📨 Setting up listener for conversation: ${conversationId}`);
        initializeConversationListener(conversationId).catch(error => {
          console.error(`Error initializing listener for conversation ${conversationId}:`, error);
        });
      }
    });
    
    // Clean up listeners for conversations that no longer exist
    for (const [conversationId, unsubscribe] of conversationListeners.entries()) {
      if (!currentConversationIds.has(conversationId)) {
        console.log(`🧹 Cleaning up listener for conversation: ${conversationId}`);
        try {
          unsubscribe();
        } catch {}
        conversationListeners.delete(conversationId);
        previousMessages.delete(conversationId);
      }
    }
  }, (error) => {
    console.error('Error in conversations collection listener:', error);
  });
  
  console.log('✅ Message push notification listeners initialized');
};

/**
 * Cleanup all conversation listeners
 */
const cleanupConversationListeners = () => {
  console.log('🧹 Cleaning up message push notification listeners...');
  for (const [conversationId, unsubscribe] of conversationListeners.entries()) {
    try {
      unsubscribe();
    } catch {}
  }
  conversationListeners.clear();
  previousMessages.clear();
  console.log('✅ Message push notification listeners cleaned up');
};

module.exports = {
  initializeAllConversationListeners,
  cleanupConversationListeners
};

