import AsyncStorage from '@react-native-async-storage/async-storage';

export const setItem = async (key, value) => {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    console.error('AsyncStorage setItem error:', err);
  }
};

export const getItem = async (key) => {
  try {
    const value = await AsyncStorage.getItem(key);
    return value ? JSON.parse(value) : null;
  } catch (err) {
    console.error('AsyncStorage getItem error:', err);
    return null;
  }
};

export const removeItem = async (key) => {
  try {
    await AsyncStorage.removeItem(key);
  } catch (err) {
    console.error('AsyncStorage removeItem error:', err);
  }
};

export const clearStorage = async () => {
  try {
    await AsyncStorage.clear();
  } catch (err) {
    console.error('AsyncStorage clear error:', err);
  }
};

// Offline cache utilities for dashboard data
export const cacheDashboardData = async (userId, role, data) => {
  try {
    const cacheKey = `dashboard_cache_${role}_${userId}`;
    const cacheData = {
      data,
      timestamp: Date.now(),
    };
    await setItem(cacheKey, cacheData);
  } catch (err) {
    console.error('Error caching dashboard data:', err);
  }
};

export const getCachedDashboardData = async (userId, role) => {
  try {
    const cacheKey = `dashboard_cache_${role}_${userId}`;
    const cached = await getItem(cacheKey);
    if (cached && cached.timestamp) {
      // Cache is valid for 24 hours
      const cacheAge = Date.now() - cached.timestamp;
      const maxAge = 24 * 60 * 60 * 1000; // 24 hours
      if (cacheAge < maxAge) {
        return cached.data;
      }
    }
    return null;
  } catch (err) {
    console.error('Error getting cached dashboard data:', err);
    return null;
  }
};

// Cache user session for offline access
export const cacheUserSession = async (userData) => {
  try {
    await setItem('offline_user_session', {
      user: userData,
      timestamp: Date.now(),
    });
  } catch (err) {
    console.error('Error caching user session:', err);
  }
};

export const getCachedUserSession = async () => {
  try {
    const cached = await getItem('offline_user_session');
    if (cached && cached.user && cached.timestamp) {
      // Session cache is valid for 7 days
      const cacheAge = Date.now() - cached.timestamp;
      const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days
      if (cacheAge < maxAge) {
        return cached.user;
      }
    }
    return null;
  } catch (err) {
    console.error('Error getting cached user session:', err);
    return null;
  }
};

// Cache schedules for offline access
export const cacheSchedule = async (studentId, scheduleData) => {
  try {
    const cacheKey = `schedule_cache_${studentId}`;
    const cacheData = {
      data: scheduleData,
      timestamp: Date.now(),
    };
    await setItem(cacheKey, cacheData);
  } catch (err) {
    console.error('Error caching schedule:', err);
  }
};

export const getCachedSchedule = async (studentId) => {
  try {
    const cacheKey = `schedule_cache_${studentId}`;
    const cached = await getItem(cacheKey);
    if (cached && cached.timestamp) {
      // Cache is valid for 7 days
      const cacheAge = Date.now() - cached.timestamp;
      const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days
      if (cacheAge < maxAge) {
        return cached.data;
      }
    }
    return null;
  } catch (err) {
    console.error('Error getting cached schedule:', err);
    return null;
  }
};

// Cache messages for offline access
export const cacheMessages = async (userId, messages) => {
  try {
    const cacheKey = `messages_cache_${userId}`;
    const cacheData = {
      data: messages,
      timestamp: Date.now(),
    };
    await setItem(cacheKey, cacheData);
  } catch (err) {
    console.error('Error caching messages:', err);
  }
};

export const getCachedMessages = async (userId) => {
  try {
    const cacheKey = `messages_cache_${userId}`;
    const cached = await getItem(cacheKey);
    if (cached && cached.timestamp) {
      // Cache is valid for 24 hours
      const cacheAge = Date.now() - cached.timestamp;
      const maxAge = 24 * 60 * 60 * 1000; // 24 hours
      if (cacheAge < maxAge) {
        return cached.data;
      }
    }
    return null;
  } catch (err) {
    console.error('Error getting cached messages:', err);
    return null;
  }
};

// Cache alerts for offline access
export const cacheAlerts = async (studentId, alerts) => {
  try {
    const cacheKey = `alerts_cache_${studentId}`;
    const cacheData = {
      data: alerts,
      timestamp: Date.now(),
    };
    await setItem(cacheKey, cacheData);
  } catch (err) {
    console.error('Error caching alerts:', err);
  }
};

export const getCachedAlerts = async (studentId) => {
  try {
    const cacheKey = `alerts_cache_${studentId}`;
    const cached = await getItem(cacheKey);
    if (cached && cached.timestamp) {
      // Cache is valid for 24 hours
      const cacheAge = Date.now() - cached.timestamp;
      const maxAge = 24 * 60 * 60 * 1000; // 24 hours
      if (cacheAge < maxAge) {
        return cached.data;
      }
    }
    return null;
  } catch (err) {
    console.error('Error getting cached alerts:', err);
    return null;
  }
};

// Cache linked parents for offline access
export const cacheLinkedParents = async (userId, linkedParents) => {
  try {
    const cacheKey = `linked_parents_cache_${userId}`;
    const cacheData = {
      data: linkedParents,
      timestamp: Date.now(),
    };
    await setItem(cacheKey, cacheData);
  } catch (err) {
    console.error('Error caching linked parents:', err);
  }
};

export const getCachedLinkedParents = async (userId) => {
  try {
    const cacheKey = `linked_parents_cache_${userId}`;
    const cached = await getItem(cacheKey);
    if (cached && cached.timestamp) {
      // Cache is valid for 7 days
      const cacheAge = Date.now() - cached.timestamp;
      const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days
      if (cacheAge < maxAge) {
        return cached.data;
      }
    }
    return null;
  } catch (err) {
    console.error('Error getting cached linked parents:', err);
    return null;
  }
};

// Cache linked students for offline access (for parents)
export const cacheLinkedStudents = async (userId, linkedStudents) => {
  try {
    const cacheKey = `linked_students_cache_${userId}`;
    const cacheData = {
      data: linkedStudents,
      timestamp: Date.now(),
    };
    await setItem(cacheKey, cacheData);
  } catch (err) {
    console.error('Error caching linked students:', err);
  }
};

export const getCachedLinkedStudents = async (userId) => {
  try {
    const cacheKey = `linked_students_cache_${userId}`;
    const cached = await getItem(cacheKey);
    if (cached && cached.timestamp) {
      // Cache is valid for 7 days
      const cacheAge = Date.now() - cached.timestamp;
      const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days
      if (cacheAge < maxAge) {
        return cached.data;
      }
    }
    return null;
  } catch (err) {
    console.error('Error getting cached linked students:', err);
    return null;
  }
};

// Cache attendance logs for offline access
export const cacheAttendanceLogs = async (studentId, logs) => {
  try {
    const cacheKey = `attendance_logs_cache_${studentId}`;
    const cacheData = {
      data: logs,
      timestamp: Date.now(),
    };
    await setItem(cacheKey, cacheData);
  } catch (err) {
    console.error('Error caching attendance logs:', err);
  }
};

export const getCachedAttendanceLogs = async (studentId) => {
  try {
    const cacheKey = `attendance_logs_cache_${studentId}`;
    const cached = await getItem(cacheKey);
    if (cached && cached.timestamp) {
      // Cache is valid for 7 days
      const cacheAge = Date.now() - cached.timestamp;
      const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days
      if (cacheAge < maxAge) {
        return cached.data;
      }
    }
    return null;
  } catch (err) {
    console.error('Error getting cached attendance logs:', err);
    return null;
  }
};

// Cache announcements/events for offline access
export const cacheAnnouncements = async (announcements) => {
  try {
    const cacheKey = 'announcements_cache';
    const cacheData = {
      data: announcements,
      timestamp: Date.now(),
    };
    await setItem(cacheKey, cacheData);
  } catch (err) {
    console.error('Error caching announcements:', err);
  }
};

export const getCachedAnnouncements = async () => {
  try {
    const cacheKey = 'announcements_cache';
    const cached = await getItem(cacheKey);
    if (cached && cached.timestamp) {
      // Cache is valid for 24 hours
      const cacheAge = Date.now() - cached.timestamp;
      const maxAge = 24 * 60 * 60 * 1000; // 24 hours
      if (cacheAge < maxAge) {
        return cached.data;
      }
    }
    return null;
  } catch (err) {
    console.error('Error getting cached announcements:', err);
    return null;
  }
};

// Cache conversation messages for offline access
export const cacheConversationMessages = async (conversationId, messages) => {
  try {
    const cacheKey = `conversation_messages_${conversationId}`;
    const cacheData = {
      data: messages,
      timestamp: Date.now(),
    };
    await setItem(cacheKey, cacheData);
  } catch (err) {
    console.error('Error caching conversation messages:', err);
  }
};

export const getCachedConversationMessages = async (conversationId) => {
  try {
    const cacheKey = `conversation_messages_${conversationId}`;
    const cached = await getItem(cacheKey);
    if (cached && cached.timestamp) {
      // Cache is valid for 7 days
      const cacheAge = Date.now() - cached.timestamp;
      const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days
      if (cacheAge < maxAge) {
        return cached.data;
      }
    }
    return null;
  } catch (err) {
    console.error('Error getting cached conversation messages:', err);
    return null;
  }
};

// Queue pending messages for offline sending
export const queuePendingMessage = async (conversationId, message) => {
  try {
    const queueKey = `pending_messages_${conversationId}`;
    const existing = await getItem(queueKey);
    const queue = existing && Array.isArray(existing) ? existing : [];
    queue.push({
      ...message,
      queuedAt: Date.now(),
    });
    await setItem(queueKey, queue);
    return true;
  } catch (err) {
    console.error('Error queueing pending message:', err);
    return false;
  }
};

// Get all pending messages for a conversation
export const getPendingMessages = async (conversationId) => {
  try {
    const queueKey = `pending_messages_${conversationId}`;
    const queue = await getItem(queueKey);
    return queue && Array.isArray(queue) ? queue : [];
  } catch (err) {
    console.error('Error getting pending messages:', err);
    return [];
  }
};

// Remove a pending message from the queue
export const removePendingMessage = async (conversationId, messageId) => {
  try {
    const queueKey = `pending_messages_${conversationId}`;
    const queue = await getItem(queueKey);
    if (queue && Array.isArray(queue)) {
      const filtered = queue.filter(msg => msg.id !== messageId);
      if (filtered.length === 0) {
        await removeItem(queueKey);
      } else {
        await setItem(queueKey, filtered);
      }
      return true;
    }
    return false;
  } catch (err) {
    console.error('Error removing pending message:', err);
    return false;
  }
};

// Clear all pending messages for a conversation
export const clearPendingMessages = async (conversationId) => {
  try {
    const queueKey = `pending_messages_${conversationId}`;
    await removeItem(queueKey);
    return true;
  } catch (err) {
    console.error('Error clearing pending messages:', err);
    return false;
  }
};