// src/api/student.js
import axios from 'axios';
import { BASE_URL } from '../utils/apiConfig';

export const bulkGenerateQRCodes = (token, studentIds) =>
  axios.post(`${BASE_URL}/students/bulk-generate-qr`, { studentIds }, {
    headers: { Authorization: `Bearer ${token}` }
  });

// src/api/student.js
import { collection, doc, getDoc, getDocs, query, where, updateDoc } from 'firebase/firestore';
import { db } from '../utils/firebaseConfig';

// Reference to students collection (legacy - most queries use 'users' collection now)
const studentsCollection = collection(db, 'students');

// Get student profile by ID
export const getStudentProfile = async (studentId) => {
  const docRef = doc(studentsCollection, studentId);
  const docSnap = await getDoc(docRef);
  if (!docSnap.exists()) {
    throw new Error('Student not found');
  }
  return { id: docSnap.id, ...docSnap.data() };
};

// Update student profile by ID
export const updateStudentProfile = async (studentId, data) => {
  const docRef = doc(studentsCollection, studentId);
  await updateDoc(docRef, data);
  // Optionally return updated doc
  const updatedDoc = await getDoc(docRef);
  return { id: updatedDoc.id, ...updatedDoc.data() };
};

// Get linked students for a parent or all students for admin
export const getLinkedStudents = async (parentId) => {
  // If parentId is 'admin', return all students
  if (parentId === 'admin') {
    const usersRef = collection(db, 'users');
    const q = query(usersRef, where('role', '==', 'student'));
    const querySnapshot = await getDocs(q);
    const students = [];
    querySnapshot.docs.forEach((doc) => {
      students.push({ id: doc.id, ...doc.data() });
    });
    return students;
  }
  
  // Otherwise, query parent_student_links for linked students
  const linksRef = collection(db, 'parent_student_links');
  const q = query(linksRef, where('parentId', '==', parentId), where('status', '==', 'active'));
  const querySnapshot = await getDocs(q);
  const students = [];
  for (const linkDoc of querySnapshot.docs) {
    const linkData = linkDoc.data();
    const studentId = linkData.studentId;
    if (studentId) {
      const studentDocRef = doc(db, 'users', studentId);
      const studentDoc = await getDoc(studentDocRef);
      if (studentDoc.exists()) {
        students.push({ id: studentDoc.id, ...studentDoc.data() });
      }
    }
  }
  return students;
};

// Generate student QR code (admin-only)
// Assuming QR generation is handled in Firebase backend or via cloud function
// Here, you might just fetch an existing QR code URL or trigger a cloud function
export const generateStudentQRCode = async (studentId) => {
  // Example: fetch QR code URL from student document field 'qrCodeUrl'
  const docRef = doc(studentsCollection, studentId);
  const docSnap = await getDoc(docRef);
  if (!docSnap.exists()) {
    throw new Error('Student not found');
  }
  const data = docSnap.data();
  // If qrCodeUrl doesn't exist, you need to implement generation separately
  if (!data.qrCodeUrl) {
    throw new Error('QR code not generated yet');
  }
  return data.qrCodeUrl;
};
