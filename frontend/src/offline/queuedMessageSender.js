import AsyncStorage from '@react-native-async-storage/async-storage';
import { collection, addDoc, doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../utils/firebaseConfig';
import { getPendingMessages, removePendingMessage } from './storage';

/**
 * Send all queued messages for all conversations when connection is restored
 * This runs globally, regardless of which screen the user is on
 * userId is optional - if not provided, will send all queued messages for all conversations
 */
export const sendAllQueuedMessages = async (userId = null) => {
  try {
    // Get all AsyncStorage keys to find pending message queues
    const allKeys = await AsyncStorage.getAllKeys();
    const pendingMessageKeys = allKeys.filter(key => key.startsWith('pending_messages_'));

    if (pendingMessageKeys.length === 0) {
      console.log('✅ No queued messages to send');
      return;
    }

    console.log(`📤 Found ${pendingMessageKeys.length} conversation(s) with queued messages`);

    // Process each conversation's queued messages
    for (const queueKey of pendingMessageKeys) {
      // Extract conversation ID from key format: "pending_messages_{conversationId}"
      const conversationId = queueKey.replace('pending_messages_', '');
      
      if (!conversationId) continue;

      try {
        const queuedMessages = await getPendingMessages(conversationId);
        
        if (queuedMessages.length === 0) {
          continue;
        }

        console.log(`📤 Sending ${queuedMessages.length} queued message(s) for conversation: ${conversationId}`);

        // Ensure conversation exists and send each message
        for (const queuedMsg of queuedMessages) {
          try {
            // Ensure conversation exists (create if needed)
            const convRef = doc(db, 'conversations', conversationId);
            await setDoc(convRef, {
              id: conversationId,
              updatedAt: serverTimestamp(),
            }, { merge: true });

            // Send the message
            const msgsCol = collection(db, 'conversations', conversationId, 'messages');
            await addDoc(msgsCol, {
              senderId: queuedMsg.senderId,
              text: queuedMsg.text,
              createdAt: serverTimestamp(),
              status: 'sent',
            });

            // Remove from queue after successful send
            await removePendingMessage(conversationId, queuedMsg.id);
            console.log(`✅ Sent queued message: ${queuedMsg.id} (conversation: ${conversationId})`);
          } catch (error) {
            console.error(`❌ Error sending queued message ${queuedMsg.id}:`, error);
            // Keep message in queue if send fails - will retry on next connection
          }
        }
      } catch (error) {
        console.error(`❌ Error processing queued messages for conversation ${conversationId}:`, error);
      }
    }

    console.log('✅ Finished processing all queued messages');
  } catch (error) {
    console.error('❌ Error in sendAllQueuedMessages:', error);
  }
};

