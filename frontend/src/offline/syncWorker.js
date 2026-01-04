// src/offline/syncWorker.js
import { getQueue, clearQueue } from './syncQueue';
import api from '../utils/apiConfig';
import { doc, deleteDoc, getDoc, setDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../utils/firebaseConfig';

/**
 * Processes the offline queue and syncs data to the server
 */
export const processQueue = async () => {
  try {
    const queue = await getQueue();

    if (!queue || queue.length === 0) {
      console.log('[Offline Sync] No tasks to process.');
      return { status: 'empty' };
    }

    console.log(`[Offline Sync] Processing ${queue.length} task(s)...`);

    let processedCount = 0;
    let failedCount = 0;
    const remainingTasks = [];

    for (const task of queue) {
      try {
        switch (task.type) {
          case 'attendance':
            await api.post('/attendance', task.payload);
            console.log('[Offline Sync] Attendance synced:', task.payload);
            break;

          case 'notification':
            await api.post('/notifications', task.payload);
            console.log('[Offline Sync] Notification synced:', task.payload);
            break;

          case 'undo_attendance_scan':
            await processUndoAttendanceScan(task.payload);
            console.log('[Offline Sync] Undo attendance scan processed:', task.payload);
            break;

          // Future task types can be added here
          default:
            console.warn(`[Offline Sync] Unknown task type: ${task.type}`);
            remainingTasks.push(task); // Keep unknown tasks
            continue;
        }
        processedCount++;
      } catch (err) {
        failedCount++;
        console.error(
          `[Offline Sync] Failed to sync task (type: ${task.type}):`,
          err.message
        );
        // Keep failed task in queue for retry later
        remainingTasks.push(task);
      }
    }

    // Update queue with remaining tasks
    if (remainingTasks.length > 0) {
      const { setItem } = await import('./storage');
      await setItem('offline_sync_queue', remainingTasks);
      console.log(
        `[Offline Sync] ${processedCount} task(s) synced, ${failedCount} failed. ${remainingTasks.length} task(s) remaining.`
      );
    } else {
      await clearQueue();
      console.log('[Offline Sync] All tasks synced successfully.');
    }

    return { processedCount, failedCount };
  } catch (error) {
    console.error('[Offline Sync] Critical error:', error.message);
    return { error: error.message };
  }
};

/**
 * Process undo attendance scan operation
 */
const processUndoAttendanceScan = async (payload) => {
  const { scanId, studentId, uid } = payload;
  if (!scanId || !studentId) {
    throw new Error('Missing scanId or studentId in undo payload');
  }

  // 1. Delete scan entry from student_attendances/{studentId}/scans/{scanId}
  const scanRef = doc(db, 'student_attendances', String(studentId), 'scans', String(scanId));
  await deleteDoc(scanRef);

  // 2. Remove notification from parent_alerts for all linked parents
  try {
    // Get all linked parents - try both uid and studentId
    const queries = [];
    // Query by studentId (uid) if available
    if (uid) {
      queries.push(query(
        collection(db, 'parent_student_links'),
        where('studentId', '==', String(uid)),
        where('status', '==', 'active')
      ));
    }
    // Query by studentIdNumber
    queries.push(query(
      collection(db, 'parent_student_links'),
      where('studentIdNumber', '==', String(studentId)),
      where('status', '==', 'active')
    ));

    const results = await Promise.all(queries.map(q => getDocs(q).catch(() => ({ docs: [], empty: true }))));
    const parentIds = new Set();

    results.forEach(snap => {
      snap.docs?.forEach(doc => {
        const data = doc.data();
        if (data?.parentId) {
          const pid = String(data.parentId);
          // Only include canonical parent IDs (with hyphen)
          if (pid.includes('-')) {
            parentIds.add(pid);
          }
        }
      });
    });

    // Remove attendance_scan notifications from each parent's alerts
    for (const parentId of parentIds) {
      try {
        const parentAlertsRef = doc(db, 'parent_alerts', parentId);
        const parentSnap = await getDoc(parentAlertsRef);
        if (parentSnap.exists()) {
          const items = Array.isArray(parentSnap.data()?.items) ? parentSnap.data().items : [];
          const filtered = items.filter(item => {
            // Remove notifications matching this scan
            return !(item.type === 'attendance_scan' && 
                    String(item.scanId) === String(scanId) &&
                    String(item.studentId) === String(studentId));
          });
          await setDoc(parentAlertsRef, { items: filtered }, { merge: true });
        }
      } catch (error) {
        console.error('Error removing notification from parent alerts:', error);
      }
    }
  } catch (error) {
    console.error('Error processing parent alerts:', error);
  }

  // 3. Remove notification from student_alerts
  try {
    const studentAlertsRef = doc(db, 'student_alerts', String(studentId));
    const studentSnap = await getDoc(studentAlertsRef);
    if (studentSnap.exists()) {
      const items = Array.isArray(studentSnap.data()?.items) ? studentSnap.data().items : [];
      const filtered = items.filter(item => {
        return !(item.type === 'attendance_scan' && 
                String(item.scanId) === String(scanId) &&
                String(item.studentId) === String(studentId));
      });
      await setDoc(studentAlertsRef, { items: filtered }, { merge: true });
    }
  } catch (error) {
    console.error('Error removing notification from student alerts:', error);
  }
};

/**
 * Triggers offline sync manually or when network is restored
 */
export const triggerOfflineSync = async () => {
  console.log('[Offline Sync] Triggering sync...');
  return await processQueue();
};
