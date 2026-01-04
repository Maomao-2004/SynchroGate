import NetInfo from '@react-native-community/netinfo';

/**
 * Check if device has internet connection
 */
export const checkInternetConnection = async () => {
  try {
    const state = await NetInfo.fetch();
    // More lenient check: if isConnected is true, allow the request
    // Only block if explicitly disconnected
    if (state.isConnected === true) {
      return true;
    }
    // If isConnected is null/undefined, check isInternetReachable
    // Allow if isInternetReachable is not explicitly false
    return state.isInternetReachable !== false;
  } catch (error) {
    console.error('Error checking internet connection:', error);
    // On error, assume connection exists (let Firebase handle the actual error)
    return true;
  }
};

/**
 * Wraps a network operation with timeout and connection checking
 * @param {Promise} operation - The network operation to execute
 * @param {number} timeoutMs - Timeout in milliseconds (default: 60000 = 1 minute)
 * @returns {Promise} - Resolves with operation result or rejects with error info
 */
export const withNetworkErrorHandling = async (operation, timeoutMs = 120000) => {
  // Don't pre-check connection - let Firebase operations proceed normally
  // Only handle errors after they occur
  // Increased timeout to 2 minutes to avoid false positives

  // Create timeout promise (only for very long operations)
  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => {
      reject({
        type: 'timeout',
        message: 'Connection timeout. The request took too long to complete. Please check your internet connection and try again.',
      });
    }, timeoutMs);
  });

  // Try operation first, only use timeout for very long operations
  try {
    // For most operations, just execute directly without timeout race
    // Only use timeout for operations that are expected to take a long time
    if (timeoutMs < 120000) {
      // Short timeout operations - use race
      const result = await Promise.race([operation, timeoutPromise]);
      return result;
    } else {
      // Long timeout or no timeout - execute directly
      return await operation;
    }
  } catch (error) {
    // If it's already our custom error, re-throw it
    if (error.type === 'no_internet' || error.type === 'timeout') {
      throw error;
    }

    // Check if it's a Firebase network error (be more specific)
    const errorMessage = error?.message || error?.toString() || '';
    const errorCode = String(error?.code || '');

    // Only treat as network error if it's clearly a network issue
    const isNetworkError = 
      errorCode === 'unavailable' ||
      errorCode === 'deadline-exceeded' ||
      errorCode === 'network-request-failed' ||
      errorCode.includes('unavailable') ||
      errorCode.includes('deadline-exceeded') ||
      errorCode.includes('network-request-failed') ||
      (errorMessage.toLowerCase().includes('network') && errorMessage.toLowerCase().includes('error')) ||
      (errorMessage.toLowerCase().includes('connection') && errorMessage.toLowerCase().includes('failed')) ||
      errorMessage.toLowerCase().includes('offline');

    if (isNetworkError) {
      // Check connection to determine if it's no internet or unstable
      const stillConnected = await checkInternetConnection();
      if (!stillConnected) {
        throw {
          type: 'no_internet',
          message: 'No internet connection. Please check your network settings and try again.',
        };
      } else {
        throw {
          type: 'unstable_connection',
          message: 'Unstable internet connection. The request failed due to poor network quality. Please try again.',
        };
      }
    }

    // Re-throw original error if it's not a network error
    throw error;
  }
};

/**
 * Get error message for display in feedback modal
 */
export const getNetworkErrorMessage = (error) => {
  if (error?.type === 'no_internet') {
    return {
      title: 'No Internet Connection',
      message: error.message || 'No internet connection. Please check your network settings and try again.',
      color: '#DC2626',
    };
  }
  
  if (error?.type === 'timeout' || error?.type === 'unstable_connection') {
    return {
      title: 'Unstable Connection',
      message: error.message || 'Connection timeout. The request took too long to complete. Please check your internet connection and try again.',
      color: '#F59E0B',
    };
  }

  return {
    title: 'Error',
    message: error?.message || 'An error occurred. Please try again.',
    color: '#DC2626',
  };
};

