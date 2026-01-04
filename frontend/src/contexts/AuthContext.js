import React, { createContext, useState, useEffect } from "react";
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import AsyncStorage from "@react-native-async-storage/async-storage";
import { auth, db } from "../utils/firebaseConfig";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  sendPasswordResetEmail,
} from "firebase/auth";
import { doc, setDoc, getDoc, updateDoc, collection, query, where, getDocs, deleteDoc, onSnapshot } from "firebase/firestore";
import { initializeGlobalPushNotifications, cleanupGlobalPushNotifications } from "../services/globalPushNotificationService";
import { initializeGlobalParentPushNotifications, cleanupGlobalParentPushNotifications } from "../services/globalParentPushNotificationService";
import { generateAndSavePushToken } from "../utils/pushTokenGenerator";

export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null);
  const [loading, setLoading] = useState(false);
  const [initializing, setInitializing] = useState(true);
  const [sessionRestored, setSessionRestored] = useState(false);
  const parentScheduleUnsubsRef = React.useRef({});
  const parentStudentAlertsUnsubsRef = React.useRef({});
  const parentLinksUnsubRef = React.useRef(null);
  // Track previous schedules per linked student to detect add/update/delete
  const parentPrevSchedulesRef = React.useRef({}); // sid -> Map(subject|day -> time)
  const parentPrevSchedulesInitializedRef = React.useRef({}); // sid -> boolean

  // Initialize global push notifications when user logs in
  useEffect(() => {
    if (user && role) {
      console.log('🔔 Setting up global push notifications for:', { role, uid: user.uid });
      
      if (role === 'student' && user.studentId) {
        initializeGlobalPushNotifications(user);
      } else if (role === 'parent') {
        initializeGlobalParentPushNotifications(user);
      }
    } else {
      console.log('🔔 Cleaning up global push notifications');
      cleanupGlobalPushNotifications();
      cleanupGlobalParentPushNotifications();
    }

    // Cleanup on unmount
    return () => {
      cleanupGlobalPushNotifications();
      cleanupGlobalParentPushNotifications();
    };
  }, [user, role]);

  // === GENERATE PARENT ID - FIXED VERSION ===
  const generateParentId = () => {
    // Generate 9 random digits (excluding the dash position)
    const digits = [];
    for (let i = 0; i < 9; i++) {
      digits.push(Math.floor(Math.random() * 10));
    }
    
    // Format as XXXX-XXXXX (4 digits, dash, 5 digits) - Total 9 digits
    const parentId = `${digits[0]}${digits[1]}${digits[2]}${digits[3]}-${digits[4]}${digits[5]}${digits[6]}${digits[7]}${digits[8]}`;
    return parentId;
  };

  // === UPDATE USER DATA ===
  const updateUserData = async (updates) => {
    if (!user?.uid) return;
    
    try {
      setLoading(true);
      
      // Validate role updates if present
      if (updates.role) {
        if (!['student', 'parent', 'admin', 'developer'].includes(updates.role.toLowerCase())) {
          throw new Error('Invalid role specified.');
        }
        
        // Additional validation for role format
        if (typeof updates.role !== 'string' || updates.role.trim().length === 0) {
          throw new Error('Invalid role format.');
        }
        
        // Additional validation for role format
        if (!/^[a-zA-Z]+$/.test(updates.role.trim())) {
          throw new Error('Invalid role format.');
        }
        
        // Additional validation for role length
        if (updates.role.trim().length > 20) {
          throw new Error('Invalid role length.');
        }
        
        // Additional validation for role length
        if (updates.role.trim().length < 3) {
          throw new Error('Invalid role length.');
        }
        
        // Ensure role consistency
        if (updates.role.toLowerCase() === 'student' && updates.parentId) {
          console.warn('Student account cannot have parentId, clearing it');
          updates.parentId = null;
        }
        
        if (updates.role.toLowerCase() === 'parent' && updates.studentId) {
          console.warn('Parent account cannot have studentId, clearing it');
          updates.studentId = null;
        }
        
        // Additional validation for role format
        if (updates.role !== updates.role?.toLowerCase()) {
          console.warn('Role case mismatch in updateUserData:', { 
            originalRole: updates.role, 
            normalizedRole: updates.role?.toLowerCase() 
          });
        }
      }
      
      // Update in Firestore
      const userDocRef = doc(db, "users", user.uid);
      await updateDoc(userDocRef, updates);
      
      // Update local state
      const updatedUser = { ...user, ...updates };
      setUser(updatedUser);
      await AsyncStorage.setItem("user", JSON.stringify(updatedUser));
      
      return updatedUser;
    } catch (err) {
      console.error("Update user data failed:", err);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  // === REFRESH USER DATA ===
  const refreshUserData = async () => {
    if (!user?.uid) return;
    
    try {
      const userDocRef = doc(db, "users", user.uid);
      const userSnap = await getDoc(userDocRef);
      
      if (userSnap.exists()) {
        const userData = userSnap.data();
        userData.role = userData.role?.toLowerCase() || "student";
        
        // Ensure proper field assignment based on role
        if (userData.role !== "student") {
          userData.studentId = null;
          userData.course = "";
          userData.section = "";
          userData.yearLevel = "";
        }
        
        if (userData.role !== "parent") {
          userData.parentId = null;
        }
        
        // Validate role
        if (!['student', 'parent', 'admin', 'developer'].includes(userData.role)) {
          console.error('Invalid role in refreshUserData:', userData.role);
          throw new Error('Invalid user role detected. Please contact support.');
        }
        
        // Additional validation for role format
        if (typeof userData.role !== 'string' || userData.role.trim().length === 0) {
          console.error('Invalid role format in refreshUserData:', userData.role);
          throw new Error('Invalid user role format. Please contact support.');
        }
        
        // Additional validation for role format
        if (!/^[a-zA-Z]+$/.test(userData.role.trim())) {
          console.error('Invalid role format in refreshUserData:', userData.role);
          throw new Error('Invalid user role format. Please contact support.');
        }
        
        // Additional validation for role length
        if (userData.role.trim().length > 20) {
          console.error('Invalid role length in refreshUserData:', userData.role);
          throw new Error('Invalid user role length. Please contact support.');
        }
        
        // Additional validation for role length
        if (userData.role.trim().length < 3) {
          console.error('Invalid role length in refreshUserData:', userData.role);
          throw new Error('Invalid user role length. Please contact support.');
        }
        
        // Additional validation for role format
        if (!/^[a-zA-Z]+$/.test(userData.role.trim())) {
          console.error('Invalid role format in refreshUserData:', userData.role);
          throw new Error('Invalid user role format. Please contact support.');
        }
        
        // Additional validation for role consistency
        if (userData.role === 'student' && userData.parentId) {
          console.warn('Student account has parentId in refreshUserData, clearing it:', userData.parentId);
          userData.parentId = null;
        }
        
        if (userData.role === 'parent' && userData.studentId) {
          console.warn('Parent account has studentId in refreshUserData, clearing it:', userData.studentId);
          userData.studentId = null;
        }
        
        // Additional validation for role format
        if (userData.role !== userData.role?.toLowerCase()) {
          console.warn('Role case mismatch in refreshUserData:', { 
            originalRole: userData.role, 
            normalizedRole: userData.role?.toLowerCase() 
          });
        }
        
        setUser(userData);
        setRole(userData.role);
        await AsyncStorage.setItem("user", JSON.stringify(userData));
        
        return userData;
      }
    } catch (err) {
      console.error("Refresh user data failed:", err);
      throw err;
    }
  };

  // === REGISTER USER ===
  const register = async (data) => {
    const {
      lastName,
      firstName,
      middleName,
      gender,
      age,
      birthday,
      contactNumber,
      address,
      course,
      section,
      yearLevel,
      studentId,
      email,
      password,
      role: userRole,
    } = data;

    setLoading(true);
    try {
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        email.trim(),
        password
      );
      const firebaseUser = userCredential.user;

      // Generate parentId for parent role - FIXED
      const generatedParentId = userRole.toLowerCase() === "parent" ? generateParentId() : null;

      const userData = {
        uid: firebaseUser.uid,
        lastName: lastName || "",
        firstName: firstName || "",
        middleName: middleName || "",
        gender: gender || "",
        age: age || "",
        birthday: birthday || "",
        contactNumber: contactNumber || "",
        address: address || "",
        course: userRole.toLowerCase() === "student" ? (course || "") : "",
        section: userRole.toLowerCase() === "student" ? (section || "") : "",
        yearLevel: userRole.toLowerCase() === "student" ? (yearLevel || "") : "",
        studentId: userRole.toLowerCase() === "student" ? studentId : null,
        parentId: generatedParentId,
        email: email || "",
        role: userRole.toLowerCase(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      // Validate role before saving
      if (!['student', 'parent', 'admin', 'developer'].includes(userData.role)) {
        throw new Error('Invalid role specified. Please select a valid role.');
      }

      // Additional validation for role format
      if (typeof userData.role !== 'string' || userData.role.trim().length === 0) {
        throw new Error('Invalid role format. Please select a valid role.');
      }

      // Additional validation for role format
      if (!/^[a-zA-Z]+$/.test(userData.role.trim())) {
        throw new Error('Invalid role format. Please select a valid role.');
      }

      // Additional validation for role length
      if (userData.role.trim().length > 20) {
        throw new Error('Invalid role length. Please select a valid role.');
      }

      // Additional validation for role length
      if (userData.role.trim().length < 3) {
        throw new Error('Invalid role length. Please select a valid role.');
      }

      // Additional validation for role format
      if (!/^[a-zA-Z]+$/.test(userData.role.trim())) {
        throw new Error('Invalid role format. Please select a valid role.');
      }

      // Additional validation for role consistency
      if (userData.role === 'student' && !userData.studentId) {
        throw new Error('Student ID is required for student accounts.');
      }
      
      if (userData.role === 'parent' && !userData.parentId) {
        throw new Error('Parent ID is required for parent accounts.');
      }

      // Additional validation for role format
      if (userData.role !== userData.role?.toLowerCase()) {
        console.warn('Role case mismatch in register:', { 
          originalRole: userData.role, 
          normalizedRole: userData.role?.toLowerCase() 
        });
      }

      // Save to Firestore
      const documentId = userRole.toLowerCase() === "parent" ? generatedParentId : studentId;
      await setDoc(doc(db, "users", documentId), userData);
      
      console.log("User data saved to Firestore:", userData); // Debug log

      setUser(userData);
      setRole(userData.role);
      await AsyncStorage.setItem("user", JSON.stringify(userData));

      // Generate and save FCM token immediately after registration
      // CRITICAL: This ensures all users have FCM tokens in the database
      // Run this asynchronously so it doesn't block registration
      generateAndSavePushToken(userData).then(token => {
        if (token) {
          console.log('✅ FCM token generated and saved during registration');
          console.log('   Token length:', token.length);
        } else {
          console.log('⚠️ FCM token not available (app may not be built with FCM support)');
          console.log('   User will need to rebuild app with FCM to receive notifications');
        }
      }).catch(tokenError => {
        console.error('❌ Error generating FCM token during registration:', tokenError?.message || tokenError);
        console.error('   Stack:', tokenError?.stack?.substring(0, 200));
        // Don't fail registration if token generation fails
      });

      // Ensure parent_alerts is initialized for parents so notifications can be written immediately
      try {
        if (userData.role === 'parent') {
          const canonical = String(userData.parentId || '').trim();
          const uid = String(userData.uid || '').trim();
          if (canonical && canonical.includes('-')) {
            const newRef = doc(db, 'parent_alerts', canonical);
            const newSnap = await getDoc(newRef);
            // If there is a legacy UID-based doc, merge and delete it
            if (uid && uid !== canonical) {
              const oldRef = doc(db, 'parent_alerts', uid);
              const oldSnap = await getDoc(oldRef);
              if (oldSnap.exists()) {
                const oldItems = Array.isArray(oldSnap.data()?.items) ? oldSnap.data().items : [];
                const base = newSnap.exists() ? (Array.isArray(newSnap.data()?.items) ? newSnap.data().items : []) : [];
                const merged = [...base, ...oldItems.map(it => ({ ...it, parentId: canonical }))];
                await setDoc(newRef, { items: merged }, { merge: true });
                try { await setDoc(oldRef, { items: [] }, { merge: true }); } catch {}
                try { await deleteDoc(oldRef); } catch {}
              }
            }
            if (!newSnap.exists()) {
              await setDoc(newRef, { items: [] }, { merge: true });
            }
          }
        }
      } catch {}

      return userData;
    } catch (err) {
      console.error("Register failed:", err);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  // === FETCH USER DATA FROM FIRESTORE ===
  const fetchUserDataByUid = async (uid) => {
    try {
      if (!uid) return null;
      
      // First, try to find user by UID in the general users collection
      const usersRef = collection(db, "users");
      const q = query(usersRef, where("uid", "==", uid));
      const querySnapshot = await getDocs(q);
      
      if (!querySnapshot.empty) {
        const userDoc = querySnapshot.docs[0];
        const userData = userDoc.data();
        userData.id = userDoc.id;
        userData.role = userData.role?.toLowerCase() || "student";

        if (userData.role !== "student") {
          userData.studentId = null;
          userData.course = "";
          userData.section = "";
          userData.yearLevel = "";
        }
        if (userData.role !== "parent") {
          userData.parentId = null;
        }

        // Normalize required fields
        userData.firstName = userData.firstName || "";
        userData.lastName = userData.lastName || "";
        userData.middleName = userData.middleName || "";
        userData.contactNumber = userData.contactNumber || "";
        userData.address = userData.address || "";
        userData.gender = userData.gender || "";
        userData.age = userData.age || "";
        userData.birthday = userData.birthday || "";

        console.log("✅ User data fetched by UID:", userData);
        return userData;
      }
      
      // If not found by UID, check if this is a developer or admin user
      // by checking the Developer and Admin documents directly
      const developerDoc = await getDoc(doc(db, "users", "Developer"));
      if (developerDoc.exists() && developerDoc.data().uid === uid) {
        const userData = developerDoc.data();
        userData.id = "Developer";
        userData.role = "developer";
        
        // Normalize required fields
        userData.firstName = userData.firstName || userData.fname || "";
        userData.lastName = userData.lastName || userData.lname || "";
        userData.middleName = userData.middleName || "";
        userData.contactNumber = userData.contactNumber || "";
        userData.address = userData.address || "";
        userData.gender = userData.gender || "";
        userData.age = userData.age || "";
        userData.birthday = userData.birthday || "";
        
        console.log("✅ Developer user data fetched:", userData);
        return userData;
      }
      
      const adminDoc = await getDoc(doc(db, "users", "Admin"));
      if (adminDoc.exists() && adminDoc.data().uid === uid) {
        const userData = adminDoc.data();
        userData.id = "Admin";
        userData.role = "admin";
        
        // Normalize required fields
        userData.firstName = userData.firstName || userData.fName || "";
        userData.lastName = userData.lastName || userData.lName || "";
        userData.middleName = userData.middleName || "";
        userData.contactNumber = userData.contactNumber || "";
        userData.address = userData.address || "";
        userData.gender = userData.gender || "";
        userData.age = userData.age || "";
        userData.birthday = userData.birthday || "";
        
        console.log("✅ Admin user data fetched:", userData);
        return userData;
      }
      
      return null;
    } catch (error) {
      console.error("❌ Error fetching user by uid:", error);
      return null;
    }
  };

  const fetchUserData = async (email) => {
    try {
      console.log("🔍 Attempting to fetch user data for email:", email);
      console.log("🔍 Current Firebase project:", db.app.options.projectId);

      // Search for user by email since we use parent/student IDs as document names
      const usersRef = collection(db, "users");
      const q = query(usersRef, where("email", "==", email.toLowerCase()));
      
      console.log("🔍 Executing Firestore query...");
      const querySnapshot = await getDocs(q);
      
      console.log("🔍 Query results:", {
        empty: querySnapshot.empty,
        size: querySnapshot.size,
        docs: querySnapshot.docs.length
      });

      if (querySnapshot.empty) {
        console.warn("⚠️ User profile not found in general users collection for email:", email);
        
        // Check if this is a developer or admin user by checking specific documents
        const developerDoc = await getDoc(doc(db, "users", "Developer"));
        if (developerDoc.exists() && developerDoc.data().email === email.toLowerCase()) {
          const userData = developerDoc.data();
          userData.id = "Developer";
          userData.role = "developer";
          
          // Normalize required fields
          userData.firstName = userData.firstName || userData.fname || "";
          userData.lastName = userData.lastName || userData.lname || "";
          userData.middleName = userData.middleName || "";
          userData.contactNumber = userData.contactNumber || "";
          userData.address = userData.address || "";
          userData.gender = userData.gender || "";
          userData.age = userData.age || "";
          userData.birthday = userData.birthday || "";
          
          console.log("✅ Developer user data fetched by email:", userData);
          return userData;
        }
        
        const adminDoc = await getDoc(doc(db, "users", "Admin"));
        if (adminDoc.exists() && adminDoc.data().email === email.toLowerCase()) {
          const userData = adminDoc.data();
          userData.id = "Admin";
          userData.role = "admin";
          
          // Normalize required fields
          userData.firstName = userData.firstName || userData.fName || "";
          userData.lastName = userData.lastName || userData.lName || "";
          userData.middleName = userData.middleName || "";
          userData.contactNumber = userData.contactNumber || "";
          userData.address = userData.address || "";
          userData.gender = userData.gender || "";
          userData.age = userData.age || "";
          userData.birthday = userData.birthday || "";
          
          console.log("✅ Admin user data fetched by email:", userData);
          return userData;
        }
        
        console.log("🔍 Available documents in users collection:");
        
        // Let's check what documents exist in the users collection
        try {
          const allUsersRef = collection(db, "users");
          const allUsersSnapshot = await getDocs(allUsersRef);
          console.log("🔍 All users in collection:", allUsersSnapshot.docs.map(doc => ({
            id: doc.id,
            email: doc.data().email,
            role: doc.data().role
          })));
        } catch (allUsersError) {
          console.error("❌ Error fetching all users:", allUsersError);
        }
        
        return null;
      }

      const userDoc = querySnapshot.docs[0];
      const userData = userDoc.data();
      
      console.log("🔍 Raw user data from Firestore:", userData);
      
      // Add the document ID to userData for reference
      userData.id = userDoc.id;
      userData.role = userData.role?.toLowerCase() || "student";

      // Ensure proper field assignment based on role
      console.log("🔍 User role from Firestore:", userData.role);
      console.log("🔍 User studentId from Firestore:", userData.studentId);
      
      if (userData.role !== "student") {
        userData.studentId = null;
        userData.course = "";
        userData.section = "";
        userData.yearLevel = "";
      } else {
        console.log("🔍 Preserving studentId for student role:", userData.studentId);
      }
      
      if (userData.role !== "parent") {
        userData.parentId = null;
      }

      // Handle different data structures (fullName vs firstName/lastName)
      if (userData.fullName && !userData.firstName) {
        // Convert fullName to firstName and lastName
        const nameParts = userData.fullName.split(' ');
        userData.firstName = nameParts[0] || "";
        userData.lastName = nameParts.slice(1).join(' ') || "";
        userData.middleName = "";
      }

      // Ensure required fields exist
      userData.firstName = userData.firstName || "";
      userData.lastName = userData.lastName || "";
      userData.middleName = userData.middleName || "";
      userData.contactNumber = userData.contactNumber || "";
      userData.address = userData.address || "";
      userData.gender = userData.gender || "";
      userData.age = userData.age || "";
      userData.birthday = userData.birthday || "";

      console.log("✅ User data fetched and processed from Firestore:", userData);
      return userData;
    } catch (error) {
      console.error("❌ Error fetching user data:", error);
      console.error("❌ Error details:", {
        code: error.code,
        message: error.message,
        stack: error.stack
      });
      
      // Check if it's a permissions error
      if (error.code === 'permission-denied') {
        console.error("🚨 PERMISSION DENIED: Firebase rules need to be updated!");
        console.error("📋 Please follow the instructions in VERIFY_FIREBASE_RULES.md");
      }
      
      return null;
    }
  };

  // === LOGIN USER ===
  const login = async ({ email, password, expectedRole = null }) => {
    setLoading(true);
    try {
      // Pre-auth restriction: if a profile exists for this email and role mismatches, block before signIn
      if (expectedRole) {
        try {
          const preUser = await fetchUserData(email.trim());
          if (preUser && String(preUser.role || '').toLowerCase() !== String(expectedRole).toLowerCase()) {
            throw new Error(`Security Error: This account is registered as ${preUser.role}. You cannot access ${expectedRole} features. Please select the correct role.`);
          }
        } catch (preErr) {
          // If error thrown above, rethrow to caller
          if (preErr && /Security Error:/.test(String(preErr.message || ''))) {
            throw preErr;
          }
          // If fetch fails (e.g., permission), proceed to auth and post-auth checks
        }
      }

      const userCredential = await signInWithEmailAndPassword(
        auth,
        email.trim(),
        password
      );
      const firebaseUser = userCredential.user;

      // Try to fetch user data from Firestore (prefer by UID)
      console.log("🔍 Starting user data fetch process...");
      let userData = await fetchUserDataByUid(firebaseUser.uid);
      if (!userData) {
        userData = await fetchUserData(email.trim());
      }
      if (!userData) {
        console.error('🚨 SECURITY ALERT: No profile found for authenticated user');
        await signOut(auth);
        throw new Error('Account profile not found. Please contact support.');
      }
      // Ensure UID is present
      userData.uid = firebaseUser.uid;

      // CRITICAL SECURITY CHECK: Verify role matches expected role if provided
      if (expectedRole && userData.role !== expectedRole.toLowerCase()) {
        console.error('🚨 SECURITY ALERT: Role mismatch during login:', { 
          expectedRole: expectedRole.toLowerCase(), 
          actualRole: userData.role,
          email: email
        });
        // Sign out the user immediately
        await signOut(auth);
        throw new Error(`Security Error: This account is registered as ${userData.role}. You cannot access ${expectedRole} features. Please select the correct role.`);
      }
      
      // ADDITIONAL SECURITY: Always require role validation - no role means security breach
      if (!expectedRole) {
        console.error('🚨 SECURITY ALERT: No expected role provided during login');
        await signOut(auth);
        throw new Error('Security Error: Role selection is required for login.');
      }

      // Validate the role
      if (!['student', 'parent', 'admin', 'developer'].includes(userData.role)) {
        console.error('Invalid role detected:', userData.role);
        await signOut(auth);
        throw new Error('Invalid user role detected. Please contact support.');
      }
      
      // SECURITY: Log successful login for audit purposes
      console.log('🔐 SECURE LOGIN SUCCESSFUL:', {
        email: email,
        role: userData.role,
        expectedRole: expectedRole,
        timestamp: new Date().toISOString()
      });

      console.log("User logged in successfully:", userData);

      setUser(userData);
      setRole(userData.role);
      await AsyncStorage.setItem("user", JSON.stringify(userData));

      // Generate and save FCM token immediately after login
      // CRITICAL: This ensures tokens are always up to date and refreshed
      // Run this asynchronously so it doesn't block login
      generateAndSavePushToken(userData).then(token => {
        if (token) {
          console.log('✅ FCM token generated and saved during login');
          console.log('   Token length:', token.length);
        } else {
          console.log('⚠️ FCM token not available (app may not be built with FCM support)');
          console.log('   User will need to rebuild app with FCM to receive notifications');
        }
      }).catch(tokenError => {
        console.error('❌ Error generating FCM token during login:', tokenError?.message || tokenError);
        console.error('   Stack:', tokenError?.stack?.substring(0, 200));
        // Don't fail login if token generation fails
      });

      return userData;
    } catch (err) {
      // Suppress Firebase error logging to prevent it from showing below screen
      console.log("Login failed - credentials invalid");
      throw err;
    } finally {
      setLoading(false);
    }
  };

  // === LOGOUT USER ===
  const logout = async () => {
    setLoading(true);
    try {
      console.log('Starting logout process...');
      
      // Sign out from Firebase Auth
      await signOut(auth);
      
      // Clear all local state
      setUser(null);
      setRole(null);
      
      // Clear all stored session data
      await AsyncStorage.removeItem("user");
      
      // Clear any cached QR codes
      if (user?.studentId) {
        try {
          await AsyncStorage.removeItem(`qrCodeUrl_${user.studentId}`);
        } catch (error) {
          console.log('Error clearing QR cache:', error);
        }
      }
      
      console.log('Logout completed successfully');
    } catch (err) {
      console.error("Logout failed:", err);
      // Even if logout fails, clear local state
      setUser(null);
      setRole(null);
      try {
        await AsyncStorage.removeItem("user");
      } catch (clearError) {
        console.error("Failed to clear stored user data:", clearError);
      }
      throw err;
    } finally {
      setLoading(false);
    }
  };

  // === RESET PASSWORD ===
  const resetPassword = async (email) => {
    try {
      console.log('Attempting password reset for email:', email);
      console.log('Firebase auth instance:', auth);
      console.log('Auth app:', auth.app);

      const normalizedEmail = String(email || '').trim().toLowerCase();

      const actionCodeSettings = {
        url: `https://${auth?.app?.options?.authDomain || 'guardientry-database.firebaseapp.com'}`,
        handleCodeInApp: false,
      };

      await sendPasswordResetEmail(auth, normalizedEmail, actionCodeSettings);
      console.log('Password reset email sent successfully');
    } catch (err) {
      console.error("Password reset failed:", err);
      console.error("Error code:", err.code);
      console.error("Error message:", err.message);
      throw err;
    }
  };

  // === VALIDATE SESSION ===
  const validateSession = async (userData) => {
    try {
      if (!userData || !userData.uid || !userData.email) {
        return false;
      }

      // Check if Firebase user is still valid
      const currentUser = auth.currentUser;
      if (!currentUser || currentUser.uid !== userData.uid) {
        console.log('Firebase user mismatch, session invalid');
        return false;
      }

      // Check if user data is still valid in Firestore
      const freshUserData = await fetchUserData(userData.email);
      if (!freshUserData || freshUserData.uid !== userData.uid) {
        console.log('User data no longer exists in Firestore, session invalid');
        return false;
      }

      return true;
    } catch (error) {
      console.error('Session validation error:', error);
      return false;
    }
  };

  // === REFRESH SESSION ===
  const refreshSession = async () => {
    try {
      if (!user || !user.uid) {
        return false;
      }

      console.log('Refreshing session for user:', user.email);
      
      // Get fresh user data from Firestore
      const freshUserData = await fetchUserData(user.email);
      if (!freshUserData) {
        console.log('Failed to refresh session - user data not found');
        return false;
      }

      // Update local state with fresh data
      const updatedUser = { ...freshUserData, uid: user.uid };
      setUser(updatedUser);
      setRole(updatedUser.role);
      
      // Update stored session data
      await AsyncStorage.setItem("user", JSON.stringify(updatedUser));
      
      console.log('Session refreshed successfully');
      return true;
    } catch (error) {
      console.error('Session refresh error:', error);
      return false;
    }
  };

  // === RESTORE SESSION ===
  const restoreSession = async () => {
    try {
      setInitializing(true);
      
      // Check if this is a fresh install (first launch after installation)
      // Use a more reliable key that persists across app updates
      const hasLaunchedBefore = await AsyncStorage.getItem("app_has_launched_v2");
      
      if (!hasLaunchedBefore) {
        // First launch after installation - clear any stored session and force role selection
        console.log("🚀 First launch detected - clearing ALL stored session data and requiring role selection");
        
        // Clear ALL possible session storage keys
        await AsyncStorage.multiRemove([
          "user",
          "app_has_launched", // Clear old key too
          "session_restored",
          "last_login"
        ]);
        
        // Sign out from Firebase auth to clear any persisted session
        try {
          const currentUser = auth.currentUser;
          if (currentUser) {
            console.log("   Signing out Firebase user on first launch");
            await signOut(auth);
          }
        } catch (signOutError) {
          console.log("   No Firebase user to sign out:", signOutError.message);
        }
        
        // Mark as launched BEFORE setting state to prevent race conditions
        await AsyncStorage.setItem("app_has_launched_v2", "true");
        
        // Clear state
        setUser(null);
        setRole(null);
        setSessionRestored(true);
        
        // Add minimum delay for splash screen
        await new Promise(resolve => setTimeout(resolve, 5000));
        setInitializing(false);
        console.log("✅ First launch setup complete - user will see SelectRole screen");
        return;
      }
      
      // CRITICAL: Check Firebase auth state - if there's a Firebase user but no stored user data,
      // sign them out to prevent auto-login. This can happen after app reinstall.
      const currentFirebaseUser = auth.currentUser;
      if (currentFirebaseUser) {
        const storedUser = await AsyncStorage.getItem("user");
        if (!storedUser) {
          console.log("⚠️ Firebase auth has user but no stored session - signing out to prevent auto-login");
          try {
            await signOut(auth);
          } catch (signOutError) {
            console.log("Error signing out:", signOutError.message);
          }
          setUser(null);
          setRole(null);
          setSessionRestored(true);
          await new Promise(resolve => setTimeout(resolve, 5000));
          setInitializing(false);
          return;
        }
      }
      
      const storedUser = await AsyncStorage.getItem("user");
      console.log("Stored user data:", storedUser); // Debug log
      
      if (storedUser) {
        const parsedUser = JSON.parse(storedUser);
        console.log("Parsed user data:", parsedUser); // Debug log
        
        // Validate session before restoring
        const isSessionValid = await validateSession(parsedUser);
        if (!isSessionValid) {
          console.log('Session validation failed, clearing stored data');
          await AsyncStorage.removeItem("user");
          setUser(null);
          setRole(null);
          setInitializing(false);
          return;
        }
        
        // Ensure proper field assignment based on role
        if (parsedUser.role !== "student") {
          parsedUser.studentId = null;
        }
        if (parsedUser.role !== "parent") {
          parsedUser.parentId = null;
        }
        
        // Validate role
        if (!parsedUser.role || !['student', 'parent', 'admin', 'developer'].includes(parsedUser.role)) {
          console.error('Invalid role in stored session:', parsedUser.role);
          await AsyncStorage.removeItem("user");
          setUser(null);
          setRole(null);
          setInitializing(false);
          return;
        }
        
        // Additional validation for role format
        if (typeof parsedUser.role !== 'string' || parsedUser.role.trim().length === 0) {
          console.error('Invalid role format in stored session:', parsedUser.role);
          await AsyncStorage.removeItem("user");
          setUser(null);
          setRole(null);
          setInitializing(false);
          return;
        }
        
        // Additional validation for role format
        if (!/^[a-zA-Z]+$/.test(parsedUser.role.trim())) {
          console.error('Invalid role format in stored session:', parsedUser.role);
          await AsyncStorage.removeItem("user");
          setUser(null);
          setRole(null);
          setInitializing(false);
          return;
        }
        
        // Additional validation for role length
        if (parsedUser.role.trim().length > 20) {
          console.error('Invalid role length in stored session:', parsedUser.role);
          await AsyncStorage.removeItem("user");
          setUser(null);
          setRole(null);
          setInitializing(false);
          return;
        }
        
        // Additional validation for role length
        if (parsedUser.role.trim().length < 3) {
          console.error('Invalid role length in stored session:', parsedUser.role);
          await AsyncStorage.removeItem("user");
          setUser(null);
          setRole(null);
          setInitializing(false);
          return;
        }
        
        // Additional validation for role format
        if (!/^[a-zA-Z]+$/.test(parsedUser.role.trim())) {
          console.error('Invalid role format in stored session:', parsedUser.role);
          await AsyncStorage.removeItem("user");
          setUser(null);
          setRole(null);
          setInitializing(false);
          return;
        }
        
        // Additional validation for role consistency
        if (parsedUser.role === 'student' && parsedUser.parentId) {
          console.warn('Student account has parentId in stored session, clearing it:', parsedUser.parentId);
          parsedUser.parentId = null;
        }
        
        if (parsedUser.role === 'parent' && parsedUser.studentId) {
          console.warn('Parent account has studentId in stored session, clearing it:', parsedUser.studentId);
          parsedUser.studentId = null;
        }
        
        // Additional validation for role format
        if (parsedUser.role !== parsedUser.role?.toLowerCase()) {
          console.warn('Role case mismatch in stored session:', { 
            originalRole: parsedUser.role, 
            normalizedRole: parsedUser.role?.toLowerCase() 
          });
        }
        
        // Ensure required fields exist
        parsedUser.firstName = parsedUser.firstName || "";
        parsedUser.lastName = parsedUser.lastName || "";
        parsedUser.email = parsedUser.email || "";
        parsedUser.contactNumber = parsedUser.contactNumber || "";
        parsedUser.address = parsedUser.address || "";
        parsedUser.gender = parsedUser.gender || "";
        parsedUser.age = parsedUser.age || "";
        parsedUser.birthday = parsedUser.birthday || "";
        
        console.log("Session restored successfully:", parsedUser); // Debug log
        
        setUser(parsedUser);
        setRole(parsedUser.role);
        setSessionRestored(true);
        
        // Add minimum delay to ensure splash screen animation is visible
        // This also gives AppNavigator time to switch to authenticated navigator
        const minSplashTime = 5000; // 5 seconds minimum to prevent SelectRole flash
        await new Promise(resolve => setTimeout(resolve, minSplashTime));
        
        setInitializing(false);
      } else {
        console.log("No stored user data found"); // Debug log
        setSessionRestored(true);
        
        // Add minimum delay for splash screen even when no session
        await new Promise(resolve => setTimeout(resolve, 5000)); // 5 seconds minimum to match authenticated flow
        
        setInitializing(false);
      }
    } catch (err) {
      console.error("Failed to restore session", err);
      await AsyncStorage.removeItem("user"); // Clear corrupted data
      setInitializing(false);
    } finally {
      // Ensure the restoration flag is set so UI can proceed even on errors
      try { setSessionRestored(true); } catch {}
    }
  };

  // === AUTH STATE CHANGED HANDLER ===
  const handleAuthStateChanged = async (firebaseUser) => {
    try {
      console.log('Auth state changed:', firebaseUser ? 'User logged in' : 'User logged out');
      console.log('Current user state before auth change:', { user: !!user, role, initializing });
      
      // CRITICAL: Check if this is a fresh install - if so, ignore auth state changes
      const hasLaunchedBefore = await AsyncStorage.getItem("app_has_launched_v2");
      if (!hasLaunchedBefore) {
        console.log('⚠️ Fresh install detected in auth handler - ignoring auth state change to prevent auto-login');
        if (firebaseUser) {
          // Sign out any persisted user
          try {
            await signOut(auth);
            console.log('   Signed out persisted Firebase user');
          } catch (signOutError) {
            console.log('   Error signing out:', signOutError.message);
          }
        }
        setUser(null);
        setRole(null);
        return;
      }
      
      if (firebaseUser) {
        // Check if we have stored user data
        const storedUser = await AsyncStorage.getItem("user");
        
        if (storedUser) {
          try {
            const parsedUser = JSON.parse(storedUser);
            
            // Validate stored user data
            if (parsedUser.uid === firebaseUser.uid && parsedUser.email === firebaseUser.email) {
              console.log('Restoring user from stored data:', parsedUser);
              console.log('User studentId from stored data:', parsedUser.studentId);
              setUser(parsedUser);
              setRole(parsedUser.role);
              setInitializing(false);
              return;
            }
          } catch (parseError) {
            console.error('Error parsing stored user data:', parseError);
          }
        }
        
        // If no valid stored data, try to fetch from Firestore
        console.log('No stored user data found, attempting to fetch from Firestore');
        try {
          const userData = await fetchUserData(firebaseUser.email);
          if (userData) {
            // Add Firebase UID to fetched user data
            userData.uid = firebaseUser.uid;
            console.log('User data restored from Firestore:', userData);
            console.log('User studentId:', userData.studentId);
            setUser(userData);
            setRole(userData.role);
            await AsyncStorage.setItem("user", JSON.stringify(userData));
            console.log('User data saved to AsyncStorage with studentId:', userData.studentId);
          } else {
            console.log('No user data found in Firestore, user needs to re-authenticate');
            await signOut(auth);
            setUser(null);
            setRole(null);
            await AsyncStorage.removeItem("user");
          }
        } catch (fetchError) {
          console.error('Error fetching user data from Firestore:', fetchError);
          await signOut(auth);
          setUser(null);
          setRole(null);
          await AsyncStorage.removeItem("user");
        }
      } else {
        console.log('Firebase user is null, checking if we should clear user data');
        
        // Only clear user data if we've completed session restoration
        // and we don't have a valid stored session
        if (!sessionRestored) {
          console.log('Session restoration not complete, not clearing data yet');
          return;
        }
        
        const storedUser = await AsyncStorage.getItem("user");
        if (storedUser) {
          console.log('Have stored user data, not clearing on auth state change');
          return;
        }
        
        console.log('Clearing user data');
        setUser(null);
        setRole(null);
        await AsyncStorage.removeItem("user");
      }
    } catch (err) {
      console.error("Auth state change error:", err);
    } finally {
      setInitializing(false);
    }
  };

  // === PERIODIC SESSION REFRESH ===
  useEffect(() => {
    if (!user || !user.uid) return;

    // Set up periodic session refresh every 30 minutes
    const refreshInterval = setInterval(async () => {
      try {
        const success = await refreshSession();
        if (!success) {
          console.log('Session refresh failed, user may need to re-authenticate');
        }
      } catch (error) {
        console.error('Periodic session refresh error:', error);
      }
    }, 30 * 60 * 1000); // 30 minutes

    return () => {
      clearInterval(refreshInterval);
    };
  }, [user?.uid]);

  useEffect(() => {
    // Ensure local notification handler and Android channel exist
    try {
      Notifications.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowAlert: true,
          shouldPlaySound: true,
          shouldSetBadge: false,
        }),
      });
    } catch {}
    (async () => {
      try {
        const { status: existing } = await Notifications.getPermissionsAsync();
        if (existing !== 'granted') {
          await Notifications.requestPermissionsAsync();
        }
        if (Platform.OS === 'android') {
          await Notifications.setNotificationChannelAsync('alerts_high', {
            name: 'Alerts High',
            importance: Notifications.AndroidImportance.MAX,
            vibrationPattern: [0, 250, 250, 250],
            lightColor: '#FF231F7C',
            sound: 'default',
          });
          await Notifications.setNotificationChannelAsync('default', {
            name: 'default',
            importance: Notifications.AndroidImportance.DEFAULT,
            vibrationPattern: [0, 250, 250, 250],
            lightColor: '#FF231F7C',
          });
        }
      } catch {}
    })();
    const initializeAuth = async () => {
      // CRITICAL: Check for fresh install FIRST, before any Firebase auth operations
      const hasLaunchedBefore = await AsyncStorage.getItem("app_has_launched_v2");
      
      if (!hasLaunchedBefore) {
        // Fresh install - sign out from Firebase Auth FIRST to prevent auto-login
        console.log("🚀 Fresh install detected - signing out Firebase Auth to prevent auto-login");
        try {
          const currentUser = auth.currentUser;
          if (currentUser) {
            console.log("   Signing out persisted Firebase user on fresh install");
            await signOut(auth);
          }
        } catch (signOutError) {
          console.log("   Error signing out on fresh install:", signOutError.message);
        }
        
        // Clear all stored data
        await AsyncStorage.multiRemove([
          "user",
          "app_has_launched",
          "session_restored",
          "last_login"
        ]);
        
        // Mark as launched
        await AsyncStorage.setItem("app_has_launched_v2", "true");
        
        // Clear state
        setUser(null);
        setRole(null);
        setSessionRestored(true);
        setInitializing(false);
        
        console.log("✅ Fresh install setup complete - user will see SelectRole screen");
        
        // Set up auth listener but it should not trigger auto-login now
        const unsubscribe = onAuthStateChanged(auth, handleAuthStateChanged);
        return unsubscribe;
      }
      
      // Not a fresh install - proceed with normal session restoration
      await restoreSession();
      
      // Wait a bit to ensure restoreSession has completed
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Then set up the auth state listener
      const unsubscribe = onAuthStateChanged(auth, handleAuthStateChanged);
      
      return unsubscribe;
    };

    let unsubscribe;
    initializeAuth().then((unsub) => {
      unsubscribe = unsub;
    });

    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, []);

  // Global: For logged-in students, watch their schedule and write student_alerts with schedule_current
  useEffect(() => {
    try { if (!user?.uid) return; } catch { return; }
    const roleLower = String(user?.role || '').toLowerCase();
    if (roleLower !== 'student' || !user?.studentId) return;

    const isNowWithin = (timeRange) => {
      try {
        const raw = String(timeRange || '').trim();
        if (!raw) return false;
        const normalize = (s) => s.replace(/\s+/g, '').toUpperCase();
        const parts = raw.split('-').map(p => p.trim());
        if (parts.length !== 2) return false;
        const parsePart = (p) => {
          const n = normalize(p);
          let m = n.match(/^(\d{1,2}):(\d{2})(AM|PM)$/);
          if (m) return { h: parseInt(m[1],10), min: parseInt(m[2],10), ap: m[3] };
          m = n.match(/^(\d{1,2}):(\d{2})$/);
          if (m) return { h: parseInt(m[1],10), min: parseInt(m[2],10), ap: null };
          m = n.match(/^(\d{1,2})(\d{2})(AM|PM)$/);
          if (m) return { h: parseInt(m[1],10), min: parseInt(m[2],10), ap: m[3] };
          return null;
        };
        const start = parsePart(parts[0]);
        const end = parsePart(parts[1]);
        if (!start || !end) return false;
        const toMinutes = ({ h, min, ap }) => {
          let hh = h;
          if (ap) {
            if (ap === 'PM' && hh !== 12) hh += 12;
            if (ap === 'AM' && hh === 12) hh = 0;
          }
          return hh * 60 + (min || 0);
        };
        const now = new Date();
        const nowMin = now.getHours() * 60 + now.getMinutes();
        const s = toMinutes(start);
        const e = toMinutes(end);
        const grace = 1;
        if (e < s) {
          return nowMin >= (s - grace) || nowMin <= (e + grace);
        }
        return nowMin >= (s - grace) && nowMin <= (e + grace);
      } catch { return false; }
    };

    const sRef = doc(db, 'schedules', String(user.studentId));
    // Local token cache for this effect
    let tokenCache = null;
    const ensureStudentToken = async () => {
      if (tokenCache) return tokenCache;
      try {
        const primary = await getDoc(doc(db, 'users', String(user.studentId)));
        let token = primary.exists() ? primary.data()?.fcmToken : null;
        if (!token) {
          const fallback = await getDoc(doc(db, 'users', String(user.uid)));
          token = fallback.exists() ? fallback.data()?.fcmToken : null;
        }
        if (token) tokenCache = token;
      } catch {}
      return tokenCache;
    };
    const unsub = onSnapshot(sRef, async (ssnap) => {
      try {
        if (!ssnap.exists()) return;
        const subjectsAny = ssnap.data()?.subjects;
        const DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
        const now = new Date();
        const currentDay = DAYS[now.getDay() === 0 ? 6 : now.getDay() - 1];
        const activeList = [];
        if (subjectsAny && !Array.isArray(subjectsAny) && typeof subjectsAny === 'object') {
          Object.keys(subjectsAny).forEach(subj => {
            const entries = Array.isArray(subjectsAny[subj]) ? subjectsAny[subj] : [];
            for (const e of entries) {
              const t = e?.time || e?.Time; const d = e?.day || e?.Day || e?.dayOfWeek;
              if (d === currentDay && isNowWithin(t)) {
                const todayKey = `${now.getFullYear()}-${now.getMonth()+1}-${now.getDate()}`;
                activeList.push({ subject: subj, time: t, currentKey: `${currentDay}_${subj}_${t}_${todayKey}` });
              }
            }
          });
        } else if (Array.isArray(subjectsAny)) {
          for (const e of subjectsAny) {
            const t = e?.time || e?.Time; const d = e?.day || e?.Day || e?.dayOfWeek; const subj = e?.subject || e?.Subject;
            if (d === currentDay && isNowWithin(t)) {
              const todayKey = `${now.getFullYear()}-${now.getMonth()+1}-${now.getDate()}`;
              activeList.push({ subject: subj, time: t, currentKey: `${currentDay}_${subj}_${t}_${todayKey}` });
            }
          }
        }

        const saRef = doc(db, 'student_alerts', String(user.studentId));
        const sSnap = await getDoc(saRef);
        const items = sSnap.exists() ? (Array.isArray(sSnap.data()?.items) ? sSnap.data().items : []) : [];
        const currentKeys = new Set(activeList.map(a => a.currentKey));
        let next = items.filter(it => !(it?.type === 'schedule_current' && (!currentKeys.has(String(it.currentKey)) || !it?.time || !isNowWithin(it.time))));
        for (const a of activeList) {
          const exists = next.some(it => it?.type === 'schedule_current' && it?.currentKey === a.currentKey);
          if (!exists) {
            const newItem = {
              id: `sched_current_${user.uid}_${Date.now()}_${Math.floor(Math.random()*100000)}`,
              type: 'schedule_current',
              title: 'Class Happening Now',
              message: `Your ${a.subject} is happening now (${a.time}).`,
              createdAt: new Date().toISOString(),
              status: 'unread',
              studentId: user.uid,
              subject: a.subject,
              time: a.time,
              currentKey: a.currentKey,
            };
            next.push(newItem);
            // Notifications disabled per request; no push/local sends
          }
        }
        if (JSON.stringify(next) !== JSON.stringify(items)) {
          await setDoc(saRef, { items: next }, { merge: true });
        }
      } catch {}
    }, () => {});

    return () => { try { unsub && unsub(); } catch {} };
  }, [user?.uid, user?.studentId, user?.role]);

  // Global: For logged-in students, fire push when new schedule_current appears in student_alerts
  useEffect(() => {
    try { if (!user?.uid) return; } catch { return; }
    const roleLower = String(user?.role || '').toLowerCase();
    if (roleLower !== 'student' || !user?.studentId) return;

    const pushedKeysRef = { current: new Set() };
    const prevKeysRef = { current: new Set() };
    let tokenCache = null;

    const ensureStudentToken = async () => {
      if (tokenCache) return tokenCache;
      try {
        const primary = await getDoc(doc(db, 'users', String(user.studentId)));
        let token = primary.exists() ? primary.data()?.fcmToken : null;
        if (!token) {
          const fallback = await getDoc(doc(db, 'users', String(user.uid)));
          token = fallback.exists() ? fallback.data()?.fcmToken : null;
        }
        if (token) tokenCache = token;
      } catch {}
      return tokenCache;
    };

    const saRef = doc(db, 'student_alerts', String(user.studentId));
    const unsub = onSnapshot(saRef, async (snap) => {
      try {
        if (!snap.exists()) return;
        const items = Array.isArray(snap.data()?.items) ? snap.data().items : [];
        const nowItems = items.filter(it => it?.type === 'schedule_current' && it?.time);
        const currentKeys = new Set(nowItems.map(it => String(it?.currentKey || it?.id || '')));

        // Send only for newly appeared keys and still time-valid
        for (const it of nowItems) {
          const key = String(it?.currentKey || it?.id || '');
          if (!key) continue;
          const isNew = !prevKeysRef.current.has(key);
          const alreadySent = pushedKeysRef.current.has(key);
          // Simple time check using same parser as screens
          const raw = String(it?.time || '').trim();
          const isValidTime = !!raw;
          if (!isNew || alreadySent || !isValidTime) continue;

          // Notifications disabled per request; no push/local sends
        }

        prevKeysRef.current = currentKeys;
      } catch {}
    }, () => {});

    return () => { try { unsub && unsub(); } catch {} };
  }, [user?.uid, user?.studentId, user?.role]);

  // Global: For logged-in parents, keep parent_alerts schedule_current in sync from schedules even when Alerts screen isn't open
  useEffect(() => {
    // Teardown previous
    try { parentLinksUnsubRef.current && parentLinksUnsubRef.current(); } catch {}
    parentLinksUnsubRef.current = null;
    Object.values(parentScheduleUnsubsRef.current || {}).forEach((u) => { try { u && u(); } catch {} });
    Object.values(parentStudentAlertsUnsubsRef.current || {}).forEach((u) => { try { u && u(); } catch {} });
    parentScheduleUnsubsRef.current = {};
    parentStudentAlertsUnsubsRef.current = {};

    // Only for parents with uid
    if (!user?.uid || String(role || '').toLowerCase() !== 'parent') return undefined;

    const isNowWithin = (timeRange) => {
      try {
        const raw = String(timeRange || '').trim();
        if (!raw) return false;
        const norm = raw.replace(/[–—−]/g, '-');
        const parts = norm.split('-').map(p => p.trim()).filter(Boolean);
        if (parts.length !== 2) return true;
        const normalize = (s) => s.replace(/\s+/g, '').toUpperCase();
        const parsePart = (p) => {
          const n = normalize(p);
          let m = n.match(/^(\d{1,2}):(\d{2})(AM|PM)$/);
          if (m) return { h: parseInt(m[1],10), min: parseInt(m[2],10), ap: m[3] };
          m = n.match(/^(\d{1,2}):(\d{2})$/);
          if (m) return { h: parseInt(m[1],10), min: parseInt(m[2],10), ap: null };
          m = n.match(/^(\d{1,2})(\d{2})(AM|PM)$/);
          if (m) return { h: parseInt(m[1],10), min: parseInt(m[2],10), ap: m[3] };
          m = n.match(/^(\d{1,2})(\d{2})$/);
          if (m) return { h: parseInt(m[1],10), min: parseInt(m[2],10), ap: null };
          return null;
        };
        const toMinutes = ({ h, min, ap }) => { let hh = h; if (ap) { if (ap === 'PM' && hh !== 12) hh += 12; if (ap === 'AM' && hh === 12) hh = 0; } return hh * 60 + (min || 0); };
        const start = parsePart(parts[0]);
        const end = parsePart(parts[1]);
        if (!start || !end) return true;
        const now = new Date();
        const nowMin = now.getHours() * 60 + now.getMinutes();
        const s = toMinutes(start);
        const e = toMinutes(end);
        const grace = 3;
        return e < s
          ? (nowMin >= Math.max(0, s - grace) || nowMin <= Math.min(24*60, e + grace))
          : (nowMin >= Math.max(0, s - grace) && nowMin <= Math.min(24*60, e + grace));
      } catch { return true; }
    };

    const resolveParentDocId = async () => {
      const direct = String(user?.parentId || '').trim();
      if (direct && direct.includes('-')) return direct;
      try {
        const uSnap = await getDoc(doc(db, 'users', String(user?.uid || '')));
        if (uSnap.exists()) {
          const d = uSnap.data() || {};
          const cands = [d.parentId, d.parentID, d.parent_id, d.ParentId, d.ParentID].map(v => (v == null ? null : String(v).trim()));
          const found = cands.find(v => v && v.includes('-'));
          if (found) return found;
        }
      } catch {}
      return String(user?.uid || '');
    };

    const DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];

    // Listen to active links and then to each linked student's schedule
    // Listen to only active links to prevent notifications for pending requests
    const linksQuery = query(
      collection(db, 'parent_student_links'),
      where('parentId', '==', user.uid),
      where('status', '==', 'active')
    );
    const hasCanonical = String(user?.parentId || '').includes('-');
    const linksQueryCanonical = hasCanonical ? query(
      collection(db, 'parent_student_links'),
      where('parentIdNumber', '==', String(user?.parentId || '')),
      where('status', '==', 'active')
    ) : null;

    const onLinks = (linksSnap) => {
      try {
        const rawLinkData = linksSnap.docs.map(d => d.data());
        const filteredLinks = rawLinkData.filter(l => {
          const s = String(l?.status || '').toLowerCase();
          return s === 'active';
        });
        const studentIds = Array.from(new Set(filteredLinks
          .map(l => l?.studentId || l?.studentIdNumber || l?.studentNumber || l?.id)
          .filter(Boolean)
          .map(String)));
        // Unsubscribe removed and purge their 'schedule_current' entries from parent_alerts
        const removedSids = Object.keys(parentScheduleUnsubsRef.current).filter((sid) => !studentIds.includes(sid));
        Object.keys(parentScheduleUnsubsRef.current).forEach((sid) => {
          if (removedSids.includes(sid)) { try { parentScheduleUnsubsRef.current[sid] && parentScheduleUnsubsRef.current[sid](); } catch {} delete parentScheduleUnsubsRef.current[sid]; }
        });
        Object.keys(parentStudentAlertsUnsubsRef.current).forEach((sid) => {
          if (removedSids.includes(sid)) { try { parentStudentAlertsUnsubsRef.current[sid] && parentStudentAlertsUnsubsRef.current[sid](); } catch {} delete parentStudentAlertsUnsubsRef.current[sid]; }
        });
        // Clear previous schedule cache for removed students
        removedSids.forEach((sid) => {
          try { delete parentPrevSchedulesRef.current[sid]; delete parentPrevSchedulesInitializedRef.current[sid]; } catch {}
        });
        // Purge schedule_current for removed students from parent_alerts doc
        (async () => {
          try {
            if (removedSids.length === 0) return;
            const parentDocId = await resolveParentDocId();
            const parentAlertsRef = doc(db, 'parent_alerts', parentDocId);
            const snap = await getDoc(parentAlertsRef);
            if (snap.exists()) {
              const base = Array.isArray(snap.data()?.items) ? snap.data().items : [];
              const filtered = base.filter(it => !(it?.type === 'schedule_current' && removedSids.includes(String(it?.studentId || ''))));
              if (JSON.stringify(filtered) !== JSON.stringify(base)) {
                await setDoc(parentAlertsRef, { items: filtered }, { merge: true });
              }
            }
          } catch {}
        })();
        // Subscribe added
        studentIds.forEach((sid) => {
          if (parentScheduleUnsubsRef.current[sid]) return;
          // Prefer studentIdNumber schedules if present; else use raw sid
          const schedulesIdCandidates = [String(sid)];
          let linkDocForSid = null;
          try {
            linkDocForSid = rawLinkData.find(l => String(l?.studentId) === String(sid) || String(l?.studentIdNumber) === String(sid) || String(l?.studentNumber) === String(sid) || String(l?.id) === String(sid));
            const num = String(linkDocForSid?.studentIdNumber || '').trim();
            if (num) schedulesIdCandidates.unshift(num);
          } catch {}
          const sRef = doc(db, 'schedules', schedulesIdCandidates[0]);
          parentScheduleUnsubsRef.current[sid] = onSnapshot(sRef, async (ssnap) => {
            try {
              const now = new Date();
              const currentDay = DAYS[now.getDay() === 0 ? 6 : now.getDay() - 1];
              let subjectsAny = ssnap.exists() ? (ssnap.data()?.subjects) : null;
              
              // If schedule document doesn't exist, check if we should clean up notifications
              if (!ssnap.exists()) {
                // Try fallback from users doc first
                let hasFallbackSubjects = false;
                try {
                  let uSnap = await getDoc(doc(db, 'users', String(sid)));
                  if (!uSnap.exists()) {
                    const numId = String(linkDocForSid?.studentIdNumber || '').trim();
                    if (numId) {
                      uSnap = await getDoc(doc(db, 'users', numId));
                    }
                  }
                  if (uSnap.exists()) {
                    const uData = uSnap.data() || {};
                    const fallbackSubjects = uData.subjects || uData.schedule || null;
                    if (fallbackSubjects) {
                      subjectsAny = fallbackSubjects;
                      hasFallbackSubjects = true;
                    }
                  }
                } catch {}
                
                // If no schedule doc exists and no fallback subjects, remove all schedule_current notifications
                if (!hasFallbackSubjects) {
                  const parentDocId2 = await resolveParentDocId();
                  const parentAlertsRef2 = doc(db, 'parent_alerts', parentDocId2);
                  const latestSnap = await getDoc(parentAlertsRef2);
                  if (latestSnap.exists()) {
                    const pItems = Array.isArray(latestSnap.data()?.items) ? latestSnap.data().items : [];
                    const updated = pItems.filter(it => !(it?.type === 'schedule_current' && String(it?.studentId) === String(sid)));
                    if (updated.length !== pItems.length) {
                      await setDoc(parentAlertsRef2, { items: updated }, { merge: true });
                      console.log('🧹 AuthContext: Removed schedule_current notifications - schedule document does not exist for student:', sid);
                    }
                  }
                  return; // Exit early if schedule doesn't exist and no fallback
                }
              }
              
              // Fallback: if schedules doc lacks subjects, try users doc fields (subjects or schedule)
              if (!subjectsAny) {
                try {
                  // Try user doc by both sid and studentIdNumber
                  let uSnap = await getDoc(doc(db, 'users', String(sid)));
                  if (!uSnap.exists()) {
                    const numId = String(linkDocForSid?.studentIdNumber || '').trim();
                    if (numId) {
                      uSnap = await getDoc(doc(db, 'users', numId));
                    }
                  }
                  if (uSnap.exists()) {
                    const uData = uSnap.data() || {};
                    subjectsAny = uData.subjects || uData.schedule || null;
                  }
                } catch {}
              }
              // Fetch student name for notifications
              let studentName = 'Student';
              try {
                // Try to get from parent_student_links first
                const linksQ = query(
                  collection(db, 'parent_student_links'),
                  where('parentId', '==', user?.parentId || user?.uid),
                  where('studentId', '==', sid),
                  where('status', '==', 'active')
                );
                const linksSnap = await getDocs(linksQ);
                if (!linksSnap.empty) {
                  studentName = linksSnap.docs[0].data()?.studentName || 'Student';
                }
                
                // Fallback: If still 'Student', fetch from users collection
                if (studentName === 'Student' || !studentName || studentName.trim() === '') {
                  const userRef = doc(db, 'users', String(sid));
                  const userSnap = await getDoc(userRef);
                  if (userSnap.exists()) {
                    const userData = userSnap.data() || {};
                    const firstName = userData.firstName || '';
                    const lastName = userData.lastName || '';
                    const fullName = `${firstName} ${lastName}`.trim();
                    if (fullName) {
                      studentName = fullName;
                    } else {
                      // Try other name fields as fallback
                      const altName = userData.fullName || userData.displayName || userData.studentName || userData.name;
                      if (altName && String(altName).trim()) {
                        studentName = String(altName).trim();
                      }
                    }
                  }
                }
              } catch (error) {
                console.warn('Error fetching student name for parent notification:', error);
              }

              const activeList = [];
              if (subjectsAny && !Array.isArray(subjectsAny) && typeof subjectsAny === 'object') {
                Object.keys(subjectsAny).forEach(subj => {
                  const entries = Array.isArray(subjectsAny[subj]) ? subjectsAny[subj] : [];
                  for (const e of entries) {
                    const t = e?.time || e?.Time; const d = e?.day || e?.Day || e?.dayOfWeek;
                    if ((String(d || '').toLowerCase() === String(currentDay).toLowerCase()) && isNowWithin(t)) {
                      const todayKey = `${currentDay}_${subj}_${t}_${now.getFullYear()}-${now.getMonth()+1}-${now.getDate()}`;
                      activeList.push({ subject: subj, time: t, currentKey: todayKey, studentName });
                    }
                  }
                });
              } else if (Array.isArray(subjectsAny)) {
                for (const e of subjectsAny) {
                  const t = e?.time || e?.Time; const d = e?.day || e?.Day || e?.dayOfWeek; const subj = e?.subject || e?.Subject;
                  if ((String(d || '').toLowerCase() === String(currentDay).toLowerCase()) && isNowWithin(t)) {
                    const todayKey = `${currentDay}_${subj}_${t}_${now.getFullYear()}-${now.getMonth()+1}-${now.getDate()}`;
                    activeList.push({ subject: subj, time: t, currentKey: todayKey, studentName });
                  }
                }
              }

              // ============= Track schedule changes for reference (notifications handled by Schedule.js) =============
              // Note: Schedule notifications are created manually in Schedule.js with correct types:
              // - schedule_added: when student uses add schedule modal
              // - schedule_updated: when student uses edit schedule modal (even if adding/removing days)
              // - schedule_deleted: when student uses delete schedule modal
              // We only track here for reference, but don't create notifications automatically
              try {
                const prevRaw = parentPrevSchedulesRef.current[sid] || new Map();
                const nextMap = new Map(); // key: subject|day -> time

                const normalizeDay = (d) => String(d || '').trim();
                const addEntry = (subj, day, time) => {
                  const key = `${String(subj)}|${normalizeDay(day)}`;
                  nextMap.set(key, String(time || ''));
                };

                if (subjectsAny && !Array.isArray(subjectsAny) && typeof subjectsAny === 'object') {
                  Object.keys(subjectsAny).forEach((subj) => {
                    const entries = Array.isArray(subjectsAny[subj]) ? subjectsAny[subj] : [];
                    for (const e of entries) {
                      addEntry(subj, e?.day || e?.Day || e?.dayOfWeek, e?.time || e?.Time);
                    }
                  });
                } else if (Array.isArray(subjectsAny)) {
                  for (const e of subjectsAny) {
                    addEntry(e?.subject || e?.Subject, e?.day || e?.Day || e?.dayOfWeek, e?.time || e?.Time);
                  }
                }

                // Update tracking reference (but don't create notifications - handled by Schedule.js)
                parentPrevSchedulesRef.current[sid] = nextMap;
              } catch {}

              const parentDocId2 = await resolveParentDocId();
              const parentAlertsRef2 = doc(db, 'parent_alerts', parentDocId2);
              const latestSnap = await getDoc(parentAlertsRef2);
              const pItems = latestSnap.exists() ? (Array.isArray(latestSnap.data()?.items) ? latestSnap.data().items : []) : [];
              const currentKeys = new Set(activeList.map(a => a.currentKey));
              // Remove stale or unmatched schedule_current alerts strictly
              let nextItems = pItems.filter((it) => {
                if (!(it?.type === 'schedule_current' && String(it?.studentId) === String(sid))) return true;
                const timeNow = isNowWithin(it.time);
                const stillActiveKey = currentKeys.has(String(it.currentKey));
                // Keep only if it's still within time AND key is still active; if there are no active keys, drop all
                return timeNow && stillActiveKey;
              });
              for (const a of activeList) {
                const exists = nextItems.some(it => it?.type === 'schedule_current' && String(it?.studentId) === String(sid) && it?.currentKey === a.currentKey);
                if (!exists) {
                  nextItems.push({
                    id: `sched_current_${sid}_${a.currentKey}`,
                    type: 'schedule_current',
                    title: 'Class Happening Now',
                    message: `${a.studentName || 'Student'}'s ${a.subject} is happening now (${a.time}).`,
                    createdAt: new Date().toISOString(),
                    status: 'unread',
                    parentId: parentDocId2,
                    studentId: String(sid),
                    studentName: a.studentName || 'Student',
                    subject: a.subject,
                    time: a.time,
                    currentKey: a.currentKey,
                  });
                }
              }
              // De-duplicate by (studentId,currentKey) keeping the latest createdAt
              const byKey = new Map();
              for (const it of nextItems) {
                if (it?.type !== 'schedule_current') continue;
                const k = `${String(it.studentId)}|${String(it.currentKey)}`;
                const prev = byKey.get(k);
                if (!prev) { byKey.set(k, it); continue; }
                const tPrev = new Date(prev.createdAt || 0).getTime();
                const tNow = new Date(it.createdAt || 0).getTime();
                if (tNow > tPrev) byKey.set(k, it);
              }
              if (byKey.size > 0) {
                const keepKeys = new Set(Array.from(byKey.values()).map(x => x.id));
                nextItems = nextItems.filter(it => it?.type !== 'schedule_current' || keepKeys.has(it.id));
              }
              // If there are no active classes for this student, ensure no schedule_current remains for this sid
              if (activeList.length === 0) {
                nextItems = nextItems.filter(it => !(it?.type === 'schedule_current' && String(it?.studentId) === String(sid)));
              }

              if (JSON.stringify(nextItems) !== JSON.stringify(pItems)) {
                await setDoc(parentAlertsRef2, { items: nextItems }, { merge: true });
              }
            } catch {}
          });
        });
      } catch {}
    };
    const unsub1 = onSnapshot(linksQuery, onLinks);
    let unsub2 = null;
    if (linksQueryCanonical) {
      try { unsub2 = onSnapshot(linksQueryCanonical, onLinks); } catch {}
    }
    parentLinksUnsubRef.current = () => { try { unsub1 && unsub1(); } catch {} try { unsub2 && unsub2(); } catch {} };

    return () => {
      try { parentLinksUnsubRef.current && parentLinksUnsubRef.current(); } catch {}
      parentLinksUnsubRef.current = null;
      Object.values(parentScheduleUnsubsRef.current || {}).forEach((u) => { try { u && u(); } catch {} });
      parentScheduleUnsubsRef.current = {};
    };
  }, [user?.uid, role, user?.parentId]);

  // Global: For logged-in admins, watch admin_alerts for qr_request notifications
  useEffect(() => {
    try { if (!user?.uid) return; } catch { return; }
    const roleLower = String(user?.role || '').toLowerCase();
    if (roleLower !== 'admin') return;

    const notifiedIdsRef = { current: new Set() };
    
    const ref = doc(db, 'admin_alerts', 'inbox');
    const unsub = onSnapshot(ref, async (snap) => {
      try {
        const items = snap.exists() ? (Array.isArray(snap.data()?.items) ? snap.data().items : []) : [];
        const mapped = items.map(it => ({ 
          id: it.id, 
          type: it.type || 'general', 
          title: it.title || 'Alert', 
          message: it.message || '', 
          createdAt: it.createdAt || new Date().toISOString(), 
          status: it.status || 'unread', 
          studentId: it.studentId, 
          studentName: it.studentName, 
          yearLevel: it.yearLevel 
        })).sort((a,b)=> new Date(b.createdAt) - new Date(a.createdAt));

        // Only track for qr_request as requested and unread items
        // Local notifications removed - using real-time FCM push notifications instead
        const newOnes = mapped.filter(it => it && it.id && it.type === 'qr_request' && it.status !== 'read' && !notifiedIdsRef.current.has(String(it.id)));
        for (const it of newOnes) {
          try {
            // Local notification removed - real-time FCM push notifications handle this now
            // Just track that we've seen this alert to prevent duplicate processing
          } catch {}
          notifiedIdsRef.current.add(String(it.id));
        }
      } catch (error) {
        console.warn('Admin alerts listener error:', error);
      }
    });

    return () => { 
      try { unsub(); } catch {} 
    };
  }, [user?.uid, user?.role]);

  // Global: For logged-in admins, watch admin_activity_logs for activity notifications
  useEffect(() => {
    try { if (!user?.uid) return; } catch { return; }
    const roleLower = String(user?.role || '').toLowerCase();
    if (roleLower !== 'admin') return;

    const notifiedIdsRef = { current: new Set() };
    
    const ref = doc(db, 'admin_activity_logs', 'global');
    const unsub = onSnapshot(ref, { includeMetadataChanges: true }, async (snap) => {
      try {
        // Only skip if it's from cache AND there are no pending writes (meaning it's stale data)
        if (snap.metadata?.fromCache && !snap.metadata?.hasPendingWrites) {
          return;
        }
        
        const items = snap.exists() ? (Array.isArray(snap.data()?.items) ? snap.data().items : []) : [];
        const mapped = items.map(item => ({
          alertId: item.id,
          alertType: item.type || 'general',
          title: item.title || 'Activity',
          message: item.message || '',
          createdAt: item.createdAt || new Date().toISOString(),
          status: item.status || 'read',
          students: Array.isArray(item.students) ? item.students : [],
          parent: item.parent || null,
          student: item.student || null,
        })).sort((a,b)=> new Date(b.createdAt) - new Date(a.createdAt));

        // Check for new notifications to push
        const newNotifications = mapped.filter(item => {
          if (!item || !item.alertId) return false;
          if (notifiedIdsRef.current.has(String(item.alertId))) return false;
          if (item.status === 'read') return false; // Don't notify for read items
          
          // Check alertType
          if (item.alertType === 'qr_generated') return true;
          if (item.alertType === 'student_deleted') return true;
          if (item.alertType === 'parent_deleted') return true;
          
          // Check title for special cases
          if (item.title === 'QR Code Changed') return true;
          if (item.title === 'QR Codes Changed') return true;
          if (item.title === 'Student Account Deleted') return true;
          if (item.title === 'Parent Account Deleted') return true;
          
          return false;
        });

        // Track new items (local notifications removed - using real-time FCM push notifications instead)
        for (const notification of newNotifications) {
          try {
            // Local notification removed - real-time FCM push notifications handle this now
            // Just track that we've seen this notification to prevent duplicate processing
            notifiedIdsRef.current.add(String(notification.alertId));
          } catch (error) {
            console.warn('Failed to track activity log notification:', error);
          }
        }
      } catch (error) {
        console.warn('Activity log listener error:', error);
      }
    });

    return () => { 
      try { unsub(); } catch {} 
    };
  }, [user?.uid, user?.role]);

  // Don't block rendering during initialization - let AppNavigator show SplashScreen
  // The SplashScreen with spinning logo will be shown instead of LoadingScreen

  return (
    <AuthContext.Provider
      value={{
        user,
        role,
        loading,
        initializing,
        sessionRestored,
        register,
        login,
        logout,
        resetPassword,
        updateUserData,
        refreshUserData,
        refreshSession,
        validateSession,
        isAuthenticated: !!user,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

// Custom hook to use auth context
export const useAuth = () => {
  const context = React.useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
