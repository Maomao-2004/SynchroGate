import Constants from "expo-constants";

// Read environment from Expo config or fallback to development
const env =
  Constants.manifest?.extra?.env ||
  Constants.expoConfig?.extra?.env ||
  "development";

// Firebase project config is handled separately, no REST URLs needed here
// But you can export environment flag or Firebase config if needed

export const ENV = env;

// Backend API base URL
// Compute mobile-safe BASE_URL:
// 1) Prefer explicit apiBaseUrl from app config
// 2) Derive LAN IP from Expo hostUri (e.g., 192.168.x.x) and assume backend on 8000
// 3) Fallback to localhost (emulator only)
const explicitApi = Constants.manifest?.extra?.apiBaseUrl || Constants.expoConfig?.extra?.apiBaseUrl;
let derivedLan = undefined;
try {
  const hostUri = Constants.manifest?.debuggerHost || Constants.expoConfig?.hostUri || '';
  const host = hostUri.split(':')[0];
  if (host && /^(\d{1,3}\.){3}\d{1,3}$/.test(host)) {
    derivedLan = `http://${host}:8081/api`;
  }
} catch {}
export const BASE_URL = explicitApi || derivedLan || 'http://localhost:8081/api';

// If you want, add Firebase config URLs or just keep as placeholders
export const FIREBASE_CONFIG = {
  apiKey: Constants.manifest?.extra?.firebaseApiKey || "AIzaSyCUoMISHi3xbhdf_ugGd6UYZy_H9Gp7mzs",
  authDomain: Constants.manifest?.extra?.firebaseAuthDomain || "guardientry-database.firebaseapp.com",
  projectId: Constants.manifest?.extra?.firebaseProjectId || "guardientry-database",
  storageBucket: Constants.manifest?.extra?.firebaseStorageBucket || "guardientry-database.firebasestorage.app",
  messagingSenderId: Constants.manifest?.extra?.firebaseMessagingSenderId || "149886535931",
  appId: Constants.manifest?.extra?.firebaseAppId || "1:149886535931:web:ca184f7031591a4869085e",
};

// No REST endpoints required for Firebase SDK usage
// You can keep logical keys for internal use if you want, for example:
export const ACTIONS = {
  AUTH: {
    LOGIN: "login",      // Used internally to identify actions if needed
    REGISTER: "register",
  },
  ATTENDANCE: {
    CHECKIN: "checkin",
    CHECKOUT: "checkout",
  },
  NOTIFICATIONS: {
    SEND: "send_notification",
    LOG: "notification_log",
  },
  STUDENTS: {
    PROFILE: "student_profile",
  },
};
