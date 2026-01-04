import React, { useEffect, useState, useContext, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AuthContext } from '../../contexts/AuthContext';
import { NetworkContext } from '../../contexts/NetworkContext';
import { doc, getDoc, collection, query, orderBy, limit, onSnapshot, deleteDoc, getDocs, where, setDoc } from 'firebase/firestore';
import { db } from '../../utils/firebaseConfig';
import { withNetworkErrorHandling, getNetworkErrorMessage } from '../../utils/networkErrorHandler';
import AsyncStorage from '@react-native-async-storage/async-storage';
import QRCodeDisplay from '../../components/QRCodeDisplay';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import * as ScreenCapture from 'expo-screen-capture';
import { enqueue } from '../../offline/syncQueue';

const QRPreview = () => {
  const navigation = useNavigation();
  const { user } = useContext(AuthContext);
  const networkContext = useContext(NetworkContext);
  const isConnected = networkContext?.isConnected ?? true;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [qrValue, setQrValue] = useState('');
  const [recentScan, setRecentScan] = useState(null); // { scanId, timestamp, direction }
  const [timeRemaining, setTimeRemaining] = useState(0); // seconds remaining
  const [undoing, setUndoing] = useState(false);
  const [networkErrorVisible, setNetworkErrorVisible] = useState(false);
  const [networkErrorTitle, setNetworkErrorTitle] = useState('');
  const [networkErrorMessage, setNetworkErrorMessage] = useState('');
  const [networkErrorColor, setNetworkErrorColor] = useState('#DC2626');
  const timerRef = useRef(null);
  const scanListenerRef = useRef(null);

  // Prevent screenshots and screen recordings while this screen is visible
  ScreenCapture.usePreventScreenCapture();

  // Hide tab bar when this screen is focused
  useFocusEffect(
    useCallback(() => {
      // Hide tab bar when screen is focused
      const parent = navigation.getParent();
      if (parent) {
        parent.setOptions({
          tabBarStyle: { display: 'none' }
        });
      }
      
      // Cleanup function to restore tab bar when screen loses focus
      return () => {
        const parent = navigation.getParent();
        if (parent) {
          parent.setOptions({
            tabBarStyle: undefined // This will restore the default tab bar style
          });
        }
      };
    }, [navigation])
  );

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        if (!user?.studentId) { setQrValue(''); setError('Missing student ID'); return; }
        // Try cached value first for instant load
        try {
          const cached = await AsyncStorage.getItem(`qrCodeUrl_${user.studentId}`);
          if (cached) setQrValue(cached);
        } catch {}
        const ref = doc(db, 'student_QRcodes', String(user.studentId));
        const snap = await getDoc(ref);
        if (snap.exists() && snap.data()?.qrCodeUrl) {
          const value = String(snap.data().qrCodeUrl);
          setQrValue(value);
          try { await AsyncStorage.setItem(`qrCodeUrl_${user.studentId}`, value); } catch {}
        } else {
          setError('QR code not available');
          try { await AsyncStorage.removeItem(`qrCodeUrl_${user.studentId}`); } catch {}
        }
      } catch (e) {
        console.error('Error loading QR code:', e);
        // Only show network error modal for actual network errors
        if (e?.code?.includes('unavailable') || e?.code?.includes('network') || e?.message?.toLowerCase().includes('network')) {
          const errorInfo = getNetworkErrorMessage({ type: 'unstable_connection', message: e.message });
          setNetworkErrorTitle(errorInfo.title);
          setNetworkErrorMessage(errorInfo.message);
          setNetworkErrorColor(errorInfo.color);
          setNetworkErrorVisible(true);
          setTimeout(() => setNetworkErrorVisible(false), 5000);
        } else {
          setError('Failed to load QR code');
        }
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [user?.studentId]);

  // Listen for recent scans to show undo button
  useEffect(() => {
    if (!user?.studentId) return;

    const scansRef = collection(db, 'student_attendances', String(user.studentId), 'scans');
    const scansQuery = query(scansRef, orderBy('timeOfScanned', 'desc'), limit(1));

    scanListenerRef.current = onSnapshot(
      scansQuery,
      (snapshot) => {
        if (!snapshot.empty) {
          const latestScan = snapshot.docs[0];
          const scanData = latestScan.data();
          const scanTime = scanData?.timeOfScanned;
          
          if (scanTime) {
            const scanTimestamp = scanTime?.toDate ? scanTime.toDate().getTime() : new Date(scanTime).getTime();
            const now = Date.now();
            const timeSinceScan = now - scanTimestamp;
            const fiveMinutes = 5 * 60 * 1000; // 5 minutes in milliseconds

            // Always show button, but disable if scan was more than 5 minutes ago
            setRecentScan({
              scanId: latestScan.id,
              timestamp: scanTimestamp,
              direction: scanData?.direction || scanData?.type || 'in',
              entry: scanData
            });
            if (timeSinceScan < fiveMinutes) {
              setTimeRemaining(Math.floor((fiveMinutes - timeSinceScan) / 1000));
            } else {
              setTimeRemaining(0); // Button visible but disabled
            }
          }
        } else {
          setRecentScan(null);
          setTimeRemaining(0);
        }
      },
      (error) => {
        console.error('Error listening to scans:', error);
      }
    );

    return () => {
      if (scanListenerRef.current) {
        scanListenerRef.current();
      }
    };
  }, [user?.studentId]);

  // Timer to update remaining time (button stays visible but disabled after 5 minutes)
  useEffect(() => {
    if (recentScan && timeRemaining > 0) {
      timerRef.current = setInterval(() => {
        setTimeRemaining((prev) => {
          if (prev <= 1) {
            return 0; // Keep button visible but disabled
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [recentScan, timeRemaining]);

  // Undo entry function
  const undoEntry = async () => {
    if (!recentScan || !user?.studentId) return;

    try {
      setUndoing(true);

      const undoOperation = async () => {
        const { scanId, direction, entry } = recentScan;
        const studentId = String(user.studentId);

        // 1. Delete scan entry from student_attendances/{studentId}/scans/{scanId}
        const scanRef = doc(db, 'student_attendances', studentId, 'scans', scanId);
        await deleteDoc(scanRef);

        // 2. Remove notification from parent_alerts for all linked parents
        try {
          // Get all linked parents - query by both uid and studentId
          const queries = [];
          if (user?.uid) {
            queries.push(query(
              collection(db, 'parent_student_links'),
              where('studentId', '==', user.uid),
              where('status', '==', 'active')
            ));
          }
          if (studentId) {
            queries.push(query(
              collection(db, 'parent_student_links'),
              where('studentIdNumber', '==', studentId),
              where('status', '==', 'active')
            ));
          }

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
          const studentAlertsRef = doc(db, 'student_alerts', studentId);
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

        // Clear recent scan state
        setRecentScan(null);
        setTimeRemaining(0);
      };

      if (isConnected) {
        // Execute immediately if online
        await undoOperation();
        Alert.alert('Success', 'Entry has been removed successfully.');
      } else {
        // Queue for offline execution
        await enqueue({
          type: 'undo_attendance_scan',
          payload: {
            scanId: recentScan.scanId,
            studentId: user.studentId,
            uid: user.uid,
            timestamp: Date.now()
          }
        });
        Alert.alert('Queued', 'Entry removal has been queued and will be processed when connection is restored.');
        setRecentScan(null);
        setTimeRemaining(0);
      }
    } catch (error) {
      console.error('Error undoing entry:', error);
      const errorInfo = getNetworkErrorMessage(error);
      if (error.type === 'no_internet' || error.type === 'timeout' || error.type === 'unstable_connection') {
        setNetworkErrorTitle(errorInfo.title);
        setNetworkErrorMessage(errorInfo.message);
        setNetworkErrorColor(errorInfo.color);
        setNetworkErrorVisible(true);
        setTimeout(() => setNetworkErrorVisible(false), 5000);
      } else {
        Alert.alert('Error', 'Failed to remove entry. Please try again.');
      }
    } finally {
      setUndoing(false);
    }
  };

  

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: '#FFFFFF' }} />
    );
  }

  if (!qrValue) {
    return (
      <View style={styles.wrapper}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error || 'QR code not available'}</Text>
        </View>
      </View>
    );
  }

  return (
    <>
      <View style={styles.wrapper}>
        <View style={styles.container}>
          {/* Warning Message */}
          <View style={styles.warningContainer}>
            <View style={styles.warningIconContainer}>
              <Ionicons name="warning" size={24} color="#DC2626" />
            </View>
            <Text style={styles.warningTitle}>Security Notice</Text>
            <Text style={styles.warningText}>
              Duplication of this QR code using screenshots, cameras, or any other means is strictly prohibited. This QR code is for your personal use only.
            </Text>
          </View>

          {/* QR Code Container */}
          <View style={styles.qrContainer}>
            <QRCodeDisplay value={qrValue} size={260} />
          </View>

          {/* Undo Entry Button - always visible, disabled after 5 minutes */}
          {recentScan && (
            <View style={styles.undoContainer}>
              <TouchableOpacity
                style={[
                  styles.undoButton, 
                  (undoing || timeRemaining <= 0) && styles.undoButtonDisabled
                ]}
                onPress={undoEntry}
                disabled={undoing || timeRemaining <= 0}
              >
                <Ionicons 
                  name="arrow-undo-outline" 
                  size={20} 
                  color={timeRemaining <= 0 ? '#9CA3AF' : '#FFFFFF'} 
                />
                <Text style={[
                  styles.undoButtonText,
                  timeRemaining <= 0 && styles.undoButtonTextDisabled
                ]}>
                  {undoing 
                    ? 'Removing...' 
                    : timeRemaining <= 0 
                      ? 'Undo Unavailable' 
                      : `Undo Entry (${Math.floor(timeRemaining / 60)}:${String(timeRemaining % 60).padStart(2, '0')})`
                  }
                </Text>
              </TouchableOpacity>
            </View>
        )}
      </View>
    </View>

      {/* Network Error Modal */}
      <Modal transparent animationType="fade" visible={networkErrorVisible} onRequestClose={() => setNetworkErrorVisible(false)}>
        <View style={styles.modalOverlayCenter}>
          <View style={styles.fbModalCard}>
            <View style={styles.fbModalContent}>
              <Text style={[styles.fbModalTitle, { color: networkErrorColor }]}>{networkErrorTitle}</Text>
              {networkErrorMessage ? <Text style={styles.fbModalMessage}>{networkErrorMessage}</Text> : null}
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  wrapper: { 
    flex: 1, 
    backgroundColor: '#F9FAFB',
  },
  container: {
    padding: 16,
    paddingTop: 0,
    paddingBottom: 120,
    flexGrow: 1,
  },
  loadingContainer: {
    flex: 1,
    padding: 16,
    paddingTop: 50,
    paddingBottom: 120,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorContainer: {
    flex: 1,
    padding: 16,
    paddingTop: 50,
    paddingBottom: 120,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: { marginTop: 12, color: '#6B7280', fontSize: 16 },
  errorText: { color: '#DC2626', fontSize: 16 },
  warningContainer: {
    width: '100%',
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 8,
    padding: 16,
    marginTop: 12, // 4 (statsGrid) + 8 (card marginTop) = 12 to match card position
    marginBottom: 8,
    alignItems: 'center',
  },
  warningIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 8,
    backgroundColor: '#FEE2E2',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  warningTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#991B1B',
    marginBottom: 8,
    textAlign: 'center',
  },
  warningText: {
    fontSize: 14,
    color: '#7F1D1D',
    textAlign: 'center',
    lineHeight: 20,
  },
  qrContainer: { 
    backgroundColor: '#FFFFFF', 
    padding: 16, 
    borderRadius: 8, 
    borderWidth: 1, 
    borderColor: '#E5E7EB', 
    shadowColor: '#000', 
    shadowOpacity: 0.05, 
    shadowOffset: { width: 0, height: 2 }, 
    shadowRadius: 4, 
    alignItems: 'center', 
    justifyContent: 'center',
    width: '100%',
    marginTop: 0, // No extra margin, follows warning container
  },
  undoContainer: {
    width: '100%',
    marginTop: 16,
    alignItems: 'center',
  },
  undoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#DC2626',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    gap: 8,
    minWidth: 200,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 3,
  },
  undoButtonDisabled: {
    backgroundColor: '#E5E7EB',
    opacity: 1,
  },
  undoButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  undoButtonTextDisabled: {
    color: '#9CA3AF',
  },
  // Facebook-style modal styles (matching alerts.js)
  modalOverlayCenter: { 
    flex: 1, 
    backgroundColor: 'rgba(0,0,0,0.5)', 
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20
  },
  fbModalCard: {
    width: '85%',
    maxWidth: 400,
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 20,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 8,
    elevation: 5,
    minHeight: 120,
    justifyContent: 'space-between',
  },
  fbModalContent: {
    flex: 1,
  },
  fbModalTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#050505',
    marginBottom: 12,
    textAlign: 'left',
  },
  fbModalMessage: {
    fontSize: 15,
    color: '#65676B',
    textAlign: 'left',
    lineHeight: 20,
  },
});

export default QRPreview;


