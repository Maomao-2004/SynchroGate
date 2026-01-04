import { doc, deleteDoc, collection, getDocs, getDoc, query, where } from 'firebase/firestore';
import { db } from './firebaseConfig';

/**
 * Deletes a conversation document and all its messages when a parent-student link is removed
 * 
 * This function is called automatically when:
 * - A student unlinks a parent (Student LinkParent.js)
 * - A parent unlinks a student (Parent LinkStudents.js)
 * 
 * The conversation ID follows the format: {studentKey}-{parentKey}
 * Handles both possible formats in case the order is reversed.
 * Also tries all combinations of different ID formats (studentId vs studentIdNumber, parentId vs parentIdNumber).
 * 
 * @param {string|Array<string>} studentId - The student's ID(s) (can be uid, studentId, studentIdNumber, or array of all)
 * @param {string|Array<string>} parentId - The parent's ID(s) (can be uid, parentId, parentIdNumber, or array of all)
 * @returns {Promise<void>} - Resolves when deletion is complete or fails silently
 */
export const deleteConversationOnUnlink = async (studentId, parentId) => {
  // Normalize to arrays
  const studentIds = Array.isArray(studentId) ? studentId.filter(Boolean) : [studentId].filter(Boolean);
  const parentIds = Array.isArray(parentId) ? parentId.filter(Boolean) : [parentId].filter(Boolean);
  
  if (studentIds.length === 0 || parentIds.length === 0) {
    console.warn('deleteConversationOnUnlink: Missing studentId or parentId');
    return;
  }

  try {
    // Generate all possible conversation ID combinations
    const conversationIds = new Set();
    
    // Try all combinations of student IDs and parent IDs
    for (const sid of studentIds) {
      for (const pid of parentIds) {
        // Try both orders: student-parent and parent-student
        conversationIds.add(`${sid}-${pid}`);
        conversationIds.add(`${pid}-${sid}`);
      }
    }
    
    console.log(`🗑️ Attempting to delete conversation with IDs:`, Array.from(conversationIds));
    
    let deleted = false;
    for (const conversationId of conversationIds) {
      try {
        const conversationRef = doc(db, 'conversations', conversationId);
        
        // Check if conversation exists before trying to delete
        const convSnap = await getDoc(conversationRef);
        if (!convSnap.exists()) {
          continue; // Try next combination
        }
        
        // Delete all messages first
        try {
          const messagesRef = collection(db, 'conversations', conversationId, 'messages');
          const messagesSnapshot = await getDocs(messagesRef);
          
          const messageDeletions = messagesSnapshot.docs.map((messageDoc) => 
            deleteDoc(messageDoc.ref)
          );
          
          // Wait for all message deletions to complete
          await Promise.all(messageDeletions);
          console.log(`🗑️ Deleted ${messagesSnapshot.docs.length} messages from conversation: ${conversationId}`);
        } catch (msgError) {
          // Messages might not exist, continue
          console.log(`⚠️ No messages found in conversation: ${conversationId}`);
        }
        
        // Delete the conversation document
        await deleteDoc(conversationRef);
        console.log(`✅ Successfully deleted conversation: ${conversationId}`);
        deleted = true;
        break; // Found and deleted, no need to try other combinations
      } catch (error) {
        // Conversation might not exist in this format, continue to try other combinations
        continue;
      }
    }
    
    if (!deleted) {
      console.warn(`⚠️ No conversation found to delete with provided IDs`);
    }
  } catch (error) {
    console.error('Error deleting conversation on unlink:', error);
    // Don't throw the error to prevent unlink operation from failing
  }
};

/**
 * Deletes a student-to-student conversation document and all its messages
 * 
 * @param {string} studentId1 - First student's ID (can be uid, studentId, or studentIdNumber)
 * @param {string} studentId2 - Second student's ID (can be uid, studentId, or studentIdNumber)
 * @returns {Promise<void>} - Resolves when deletion is complete or fails silently
 */
export const deleteStudentConversationOnUnlink = async (studentId1, studentId2) => {
  if (!studentId1 || !studentId2) {
    console.warn('deleteStudentConversationOnUnlink: Missing studentId1 or studentId2');
    return;
  }

  try {
    // Student-student conversations use sorted keys for consistency
    const keys = [studentId1, studentId2].sort();
    const conversationId = `${keys[0]}-${keys[1]}`;
    
    console.log(`🗑️ Deleting student-student conversation: ${conversationId}`);
    
    // Delete all messages in the conversation
    const messagesRef = collection(db, 'conversations', conversationId, 'messages');
    const messagesSnapshot = await getDocs(messagesRef);
    
    const messageDeletions = messagesSnapshot.docs.map((messageDoc) => 
      deleteDoc(messageDoc.ref)
    );
    
    // Wait for all message deletions to complete
    await Promise.all(messageDeletions);
    
    // Delete the conversation document itself
    const conversationRef = doc(db, 'conversations', conversationId);
    await deleteDoc(conversationRef);
    
    console.log(`✅ Successfully deleted student-student conversation: ${conversationId}`);
  } catch (error) {
    console.error('Error deleting student-student conversation on unlink:', error);
    // Don't throw the error to prevent unlink operation from failing
  }
};

/**
 * Deletes all student-to-student conversations for a student when a parent-student link is removed
 * 
 * This function finds all student-to-student conversations where the student is involved
 * and deletes them. Students can only message each other if they share a linked parent,
 * so when a parent-student link is removed, those conversations should be deleted.
 * 
 * @param {string|Array<string>} studentIds - The student's ID(s) (can be uid, studentId, studentIdNumber, or array of all)
 * @returns {Promise<void>} - Resolves when deletion is complete or fails silently
 */
export const deleteAllStudentToStudentConversations = async (studentIds) => {
  // Normalize to array
  const studentIdArray = Array.isArray(studentIds) ? studentIds.filter(Boolean) : [studentIds].filter(Boolean);
  
  if (studentIdArray.length === 0) {
    console.warn('deleteAllStudentToStudentConversations: Missing studentIds');
    return;
  }

  try {
    console.log(`🗑️ Deleting all student-to-student conversations for student with IDs:`, studentIdArray);
    
    // Get all conversation documents
    const conversationsRef = collection(db, 'conversations');
    const conversationsSnapshot = await getDocs(conversationsRef);
    
    const conversationsToDelete = [];
    
    // Check each conversation to see if it's a student-to-student conversation involving this student
    for (const convDoc of conversationsSnapshot.docs) {
      const conversationId = convDoc.id;
      const conversationData = convDoc.data();
      
      // Skip parent-student conversations (they have parentId field)
      if (conversationData?.parentId || conversationData?.parentIdNumber) {
        continue;
      }
      
      // Check if this is a student-to-student conversation (has studentId1/studentId2 fields)
      const isStudentConversation = !!(conversationData?.studentId1 || conversationData?.studentId2);
      if (!isStudentConversation) {
        continue;
      }
      
      // Check if the student is involved in this conversation
      const studentId1 = conversationData?.studentId1 || conversationData?.studentIdNumber1;
      const studentId2 = conversationData?.studentId2 || conversationData?.studentIdNumber2;
      const members = conversationData?.members || [];
      
      // Check if any of the student's IDs match
      const isInvolved = studentIdArray.some(sid => {
        // Check conversation ID (student-student conversations use sorted keys)
        const conversationIdParts = conversationId.split('-');
        if (conversationIdParts.includes(String(sid))) {
          return true;
        }
        // Check studentId1/studentId2 fields
        if (String(studentId1) === String(sid) || String(studentId2) === String(sid)) {
          return true;
        }
        // Check members array
        if (members.includes(String(sid))) {
          return true;
        }
        return false;
      });
      
      if (isInvolved) {
        conversationsToDelete.push(conversationId);
      }
    }
    
    console.log(`📋 Found ${conversationsToDelete.length} student-to-student conversations to delete`);
    
    // Delete all messages and conversations
    for (const conversationId of conversationsToDelete) {
      try {
        // Delete all messages in the conversation
        const messagesRef = collection(db, 'conversations', conversationId, 'messages');
        const messagesSnapshot = await getDocs(messagesRef);
        
        const messageDeletions = messagesSnapshot.docs.map((messageDoc) => 
          deleteDoc(messageDoc.ref)
        );
        
        // Wait for all message deletions to complete
        await Promise.all(messageDeletions);
        
        // Delete the conversation document itself
        const conversationRef = doc(db, 'conversations', conversationId);
        await deleteDoc(conversationRef);
        
        console.log(`✅ Successfully deleted student-to-student conversation: ${conversationId}`);
      } catch (error) {
        console.error(`❌ Error deleting student-to-student conversation ${conversationId}:`, error);
        // Continue with other conversations
      }
    }
    
    console.log(`✅ Completed deletion of ${conversationsToDelete.length} student-to-student conversations`);
  } catch (error) {
    console.error('Error deleting all student-to-student conversations:', error);
    // Don't throw the error to prevent unlink operation from failing
  }
};

/**
 * Deletes all conversations for a user (student or parent) when their account is deleted
 * 
 * This function finds all conversations where the user is involved by:
 * 1. Getting all conversation documents
 * 2. Checking if the user's ID appears in the conversation ID or members
 * 3. Deleting those conversations and all their messages
 * 
 * @param {string} userId - The user's ID (can be uid, studentId, studentIdNumber, parentId, or parentIdNumber)
 * @param {Array<string>} allUserIds - All possible IDs for this user (uid, studentId, studentIdNumber, parentId, parentIdNumber, etc.)
 * @returns {Promise<void>} - Resolves when deletion is complete or fails silently
 */
export const deleteAllUserConversations = async (userId, allUserIds = []) => {
  if (!userId) {
    console.warn('deleteAllUserConversations: Missing userId');
    return;
  }

  try {
    // Collect all possible user identifiers
    const userIds = new Set([userId, ...allUserIds].filter(Boolean));
    
    console.log(`🗑️ Deleting all conversations for user: ${userId}`);
    console.log(`🔍 Checking with IDs:`, Array.from(userIds));
    
    // Get all conversation documents
    const conversationsRef = collection(db, 'conversations');
    const conversationsSnapshot = await getDocs(conversationsRef);
    
    const conversationsToDelete = [];
    
    // Check each conversation to see if this user is involved
    for (const convDoc of conversationsSnapshot.docs) {
      const conversationId = convDoc.id;
      const conversationData = convDoc.data();
      
      // Check if any of the user's IDs appear in the conversation ID
      const conversationIdParts = conversationId.split('-');
      const isInvolved = conversationIdParts.some(part => userIds.has(part));
      
      // Also check if user is in members array
      const members = conversationData?.members || [];
      const isInMembers = members.some(memberId => userIds.has(memberId));
      
      // Check conversation data fields
      const isInFields = userIds.has(conversationData?.studentId) ||
                        userIds.has(conversationData?.studentIdNumber) ||
                        userIds.has(conversationData?.parentId) ||
                        userIds.has(conversationData?.parentIdNumber) ||
                        userIds.has(conversationData?.studentId1) ||
                        userIds.has(conversationData?.studentIdNumber1) ||
                        userIds.has(conversationData?.studentId2) ||
                        userIds.has(conversationData?.studentIdNumber2);
      
      if (isInvolved || isInMembers || isInFields) {
        conversationsToDelete.push(conversationId);
      }
    }
    
    console.log(`📋 Found ${conversationsToDelete.length} conversations to delete`);
    
    // Delete all messages and conversations
    for (const conversationId of conversationsToDelete) {
      try {
        // Delete all messages in the conversation
        const messagesRef = collection(db, 'conversations', conversationId, 'messages');
        const messagesSnapshot = await getDocs(messagesRef);
        
        const messageDeletions = messagesSnapshot.docs.map((messageDoc) => 
          deleteDoc(messageDoc.ref)
        );
        
        // Wait for all message deletions to complete
        await Promise.all(messageDeletions);
        
        // Delete the conversation document itself
        const conversationRef = doc(db, 'conversations', conversationId);
        await deleteDoc(conversationRef);
        
        console.log(`✅ Successfully deleted conversation: ${conversationId}`);
      } catch (error) {
        console.error(`❌ Error deleting conversation ${conversationId}:`, error);
        // Continue with other conversations
      }
    }
    
    console.log(`✅ Completed deletion of ${conversationsToDelete.length} conversations`);
  } catch (error) {
    console.error('Error deleting all user conversations:', error);
    // Don't throw the error to prevent account deletion from failing
  }
};
