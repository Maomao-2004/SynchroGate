// Firebase error handling utilities

export const isFirestoreConnectionError = (error) => {
  if (!error) return false;
  
  const message = error.message || error.toString();
  const code = error.code || '';
  
  // Check for common connection error patterns
  const connectionErrors = [
    'network-request-failed',
    'unavailable',
    'deadline-exceeded',
    'connection',
    'timeout',
    'offline',
    'no internet',
    'network error'
  ];
  
  return connectionErrors.some(pattern => 
    message.toLowerCase().includes(pattern) || 
    code.toLowerCase().includes(pattern)
  );
};

export const getFirestoreErrorMessage = (error) => {
  if (!error) return 'An unknown error occurred';
  
  const message = error.message || error.toString();
  
  if (isFirestoreConnectionError(error)) {
    return 'Unable to connect to the server. Please check your internet connection and try again.';
  }
  
  // Handle specific Firebase Auth errors
  if (message.includes('auth/user-not-found')) {
    return 'No account found with this email address.';
  }
  
  if (message.includes('auth/wrong-password')) {
    return 'Incorrect password. Please try again.';
  }
  
  if (message.includes('auth/invalid-email')) {
    return 'Invalid email address format.';
  }
  
  if (message.includes('auth/user-disabled')) {
    return 'This account has been disabled. Please contact support.';
  }
  
  if (message.includes('auth/too-many-requests')) {
    return 'Too many failed attempts. Please try again later.';
  }
  
  if (message.includes('auth/invalid-credential')) {
    return 'Invalid credentials. Please check your email and password.';
  }
  
  // Default error message
  return message || 'An error occurred. Please try again.';
};

export const getFirestoreErrorTitle = (error) => {
  if (!error) return 'Error';
  
  if (isFirestoreConnectionError(error)) {
    return 'Connection Error';
  }
  
  const message = error.message || error.toString();
  
  if (message.includes('auth/')) {
    return 'Authentication Error';
  }
  
  return 'Error';
};





