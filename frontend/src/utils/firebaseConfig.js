// src/utils/firebaseConfig.js
import { initializeApp } from "firebase/app";
import { getFirestore, collection, addDoc, getDocs, doc, setDoc, getDoc, serverTimestamp } from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import {
  initializeAuth,
  getReactNativePersistence,
  getAuth,
  setPersistence,
  browserLocalPersistence,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile,
} from "firebase/auth";
import { Platform } from 'react-native';
import AsyncStorage from "@react-native-async-storage/async-storage";

// ✅ Firebase config
const firebaseConfig = {
  apiKey: "AIzaSyCUoMISHi3xbhdf_ugGd6UYZy_H9Gp7mzs",
  authDomain: "guardientry-database.firebaseapp.com",
  projectId: "guardientry-database",
  storageBucket: "guardientry-database.firebasestorage.app",
  messagingSenderId: "149886535931",
  appId: "1:149886535931:web:ca184f7031591a4869085e",
  measurementId: "G-3X97QCRKH7"
};

// ✅ Initialize Firebase JS SDK (for web and Firestore)
const app = initializeApp(firebaseConfig);

// ✅ Initialize React Native Firebase (for native FCM)
// This is required for @react-native-firebase/messaging to work
let rnFirebaseApp = null;
if (Platform.OS !== 'web') {
  try {
    const rnFirebase = require('@react-native-firebase/app').default;
    // Check if already initialized
    try {
      rnFirebaseApp = rnFirebase.app();
      console.log('✅ React Native Firebase already initialized');
    } catch (e) {
      // Not initialized yet, initialize it
      rnFirebaseApp = rnFirebase.initializeApp(firebaseConfig);
      console.log('✅ React Native Firebase initialized for FCM');
    }
  } catch (e) {
    console.log('ℹ️ React Native Firebase not available (web or not installed)');
  }
}

// ✅ Services
const db = getFirestore(app); // Firestore
// Platform-appropriate Auth initialization
let auth;
if (Platform.OS === 'web') {
  auth = getAuth(app);
  try { setPersistence(auth, browserLocalPersistence); } catch {}
} else {
  auth = initializeAuth(app, { persistence: getReactNativePersistence(AsyncStorage) });
}
const functions = getFunctions(app);

// ✅ Export
export {
  app,
  db,
  auth,
  functions,
  collection,
  addDoc,
  getDocs,
  doc,
  setDoc,
  getDoc,
  serverTimestamp,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile,
  httpsCallable,
};

// Debug functions for testing Firebase
export const testFirebase = async () => {
  try {
    console.log('🧪 Testing Firebase connection...');
    const usersRef = collection(db, 'users');
    const snapshot = await getDocs(usersRef);
    console.log('✅ Firebase connection successful!');
    console.log('📊 Users collection size:', snapshot.size);
    return true;
  } catch (error) {
    console.error('❌ Firebase connection failed:', error);
    return false;
  }
};

// Make debug functions available globally for testing
if (typeof window !== 'undefined') {
  window.testFirebase = testFirebase;
  window.testFirebaseRules = async () => {
    const { testFirebaseRules } = await import('./testFirebaseRules.js');
    return testFirebaseRules();
  };
  window.testAllCollections = async () => {
    const { testAllCollections } = await import('./firebaseDebug.js');
    return testAllCollections();
  };
  window.testUserQuery = async (email) => {
    const { testUserQuery } = await import('./firebaseDebug.js');
    return testUserQuery(email);
  };
  window.testAttendanceQuery = async (studentId) => {
    const { testAttendanceQuery } = await import('./firebaseDebug.js');
    return testAttendanceQuery(studentId);
  };
  window.testRoleSecurity = async () => {
    const { testRoleSecurity } = await import('./securityTest.js');
    return testRoleSecurity();
  };
  window.testRoleSwitchingPrevention = async () => {
    const { testRoleSwitchingPrevention } = await import('./securityTest.js');
    return testRoleSwitchingPrevention();
  };
  window.debugFirebaseRules = async () => {
    const { debugFirebaseRules } = await import('./debugFirebaseRules.js');
    return debugFirebaseRules();
  };
  window.simpleDebug = async () => {
    const { simpleDebug } = await import('./simpleDebug.js');
    return simpleDebug();
  };
}