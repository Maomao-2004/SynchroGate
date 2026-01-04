// src/api/attendance.js
import { collection, addDoc, query, where, getDocs, orderBy, writeBatch, doc } from 'firebase/firestore';
import { db } from '../utils/firebaseConfig';

const attendanceCollection = collection(db, 'attendanceLogs');

// Student check-in
export const checkInStudent = async (studentId, timestamp = new Date()) => {
  const docRef = await addDoc(attendanceCollection, {
    studentId,
    type: 'IN',
    timestamp,
  });
  return { id: docRef.id };
};

// Student check-out
export const checkOutStudent = async (studentId, timestamp = new Date()) => {
  const docRef = await addDoc(attendanceCollection, {
    studentId,
    type: 'OUT',
    timestamp,
  });
  return { id: docRef.id };
};

// Fetch attendance logs for a student
export const getAttendanceLogs = async (studentId) => {
  try {
    console.log('🔍 Fetching attendance logs for studentId:', studentId);
    
    const q = query(
      attendanceCollection,
      where('studentId', '==', studentId),
      orderBy('timestamp', 'desc')
    );
    
    console.log('🔍 Executing attendance query...');
    const querySnapshot = await getDocs(q);
    
    console.log('🔍 Attendance query results:', {
      empty: querySnapshot.empty,
      size: querySnapshot.size,
      docs: querySnapshot.docs.length
    });
    
    const logs = [];
    querySnapshot.forEach((doc) => {
      logs.push({ id: doc.id, ...doc.data() });
    });
    
    console.log('✅ Attendance logs fetched successfully:', logs);
    return logs;
  } catch (error) {
    console.error('❌ Error fetching attendance logs:', error);
    console.error('❌ Error details:', {
      code: error.code,
      message: error.message,
      stack: error.stack
    });
    throw error;
  }
};

// Bulk upload logs (used by offline sync)
export const syncOfflineLogs = async (logs) => {
  const batch = writeBatch(db);
  logs.forEach((log) => {
    const docRef = doc(attendanceCollection);
    batch.set(docRef, log);
  });
  await batch.commit();
  return { success: true };
};
