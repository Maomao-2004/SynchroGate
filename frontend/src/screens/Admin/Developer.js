import React, { useState, useEffect, useContext } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Modal, TextInput, Share } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useIsFocused, useFocusEffect, CommonActions } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { AuthContext } from '../../contexts/AuthContext';
import { BASE_URL } from '../../utils/apiConfig';
import { collection, query, where, getDocs, doc, collectionGroup, getDoc } from 'firebase/firestore';
import { db } from '../../utils/firebaseConfig';
import { withNetworkErrorHandling, getNetworkErrorMessage } from '../../utils/networkErrorHandler';
import { sendAlertPushNotification } from '../../utils/pushNotificationHelper';

const Developer = () => {
  const navigation = useNavigation();
  const isFocused = useIsFocused();
  const { user, logout } = useContext(AuthContext);

  const [loading, setLoading] = useState(false);
  const [logoutVisible, setLogoutVisible] = useState(false);

  // Dashboard state
  const [systemHealth, setSystemHealth] = useState('healthy');
  const [activeUsers, setActiveUsers] = useState(0);
  const [errorCount, setErrorCount] = useState(0);
  const [apiResponseTime, setApiResponseTime] = useState(0);

  // API Testing state
  const [selectedEndpoint, setSelectedEndpoint] = useState('');
  const [requestMethod, setRequestMethod] = useState('GET');
  const [requestBody, setRequestBody] = useState('');
  const [response, setResponse] = useState(null);
  const [responseModalVisible, setResponseModalVisible] = useState(false);

  // Data Management state
  const [dataStats, setDataStats] = useState({ users: 0, students: 0, parents: 0, attendance: 0 });
  const [operationLoading, setOperationLoading] = useState(false);

  // Feedback modal state
  const [feedbackVisible, setFeedbackVisible] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState('');
  const [feedbackSuccess, setFeedbackSuccess] = useState(false);
  const [networkErrorVisible, setNetworkErrorVisible] = useState(false);
  const [networkErrorTitle, setNetworkErrorTitle] = useState('');
  const [networkErrorMessage, setNetworkErrorMessage] = useState('');
  const [networkErrorColor, setNetworkErrorColor] = useState('#DC2626');

  const apiEndpoints = [
    { name: 'Health Check', endpoint: '/', method: 'GET', requiresAuth: false },
    { name: 'Students', endpoint: '/api/students', method: 'GET', requiresAuth: true },
    { name: 'Parents', endpoint: '/api/parents', method: 'GET', requiresAuth: true },
    { name: 'Logs', endpoint: '/api/logs', method: 'GET', requiresAuth: true },
  ];

  // Test push notification function
  const testPushNotification = async () => {
    try {
      setLoading(true);
      console.log('🧪 Testing push notification...');
      
      // Get current user's document to find their ID
      const userDocId = user?.uid || user?.studentId || user?.parentId || 'Admin';
      const userRole = user?.role || 'admin';
      
      // Get FCM token from Firestore
      let fcmToken = null;
      try {
        const userRef = doc(db, 'users', userDocId);
        const userSnap = await getDoc(userRef);
        if (userSnap.exists()) {
          fcmToken = userSnap.data()?.fcmToken;
          console.log('🔑 FCM Token found:', fcmToken ? fcmToken.substring(0, 20) + '...' : 'NOT FOUND');
        }
      } catch (err) {
        console.error('Error fetching user doc:', err);
      }

      const testAlert = {
        id: `test-${Date.now()}`,
        type: 'test',
        alertType: 'test',
        title: 'Test Push Notification',
        message: 'This is a test notification. If you see this, push notifications are working!',
        status: 'unread',
        studentId: user?.studentId || '',
        parentId: user?.parentId || '',
      };

      console.log('📤 Calling sendAlertPushNotification with:', {
        userId: userDocId,
        role: userRole,
        hasFcmToken: !!fcmToken
      });

      await sendAlertPushNotification(testAlert, userDocId, userRole);
      
      setFeedbackMessage(fcmToken 
        ? '✅ Push notification sent! Check your device (close the app first). Check Railway logs for confirmation.'
        : '⚠️ No FCM token found. Please log out and log back in to generate a token.');
      setFeedbackSuccess(!!fcmToken);
      setFeedbackVisible(true);
    } catch (error) {
      console.error('❌ Test push notification failed:', error);
      setFeedbackMessage(`❌ Error: ${error.message}. Check console for details.`);
      setFeedbackSuccess(false);
      setFeedbackVisible(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isFocused) {
      fetchDashboardData();
      fetchDataStats();
    }
  }, [isFocused]);

  // Reset HomeStack to AdminDashboard when screen loses focus (user navigates away)
  useFocusEffect(
    React.useCallback(() => {
      return () => {
        // When screen loses focus, ensure HomeStack is reset to AdminDashboard
        // This prevents the stack from retaining Developer when navigating back
        try {
          const parentNav = navigation.getParent?.();
          if (parentNav) {
            const navState = parentNav.getState();
            const homeRoute = navState?.routes?.find(r => r.name === 'Home');
            if (homeRoute?.state?.routes?.length > 1) {
              // Reset HomeStack to only AdminDashboard
              parentNav.dispatch(
                CommonActions.reset({
                  index: navState.index,
                  routes: navState.routes.map(route => {
                    if (route.name === 'Home') {
                      return {
                        ...route,
                        state: {
                          routes: [{ name: 'AdminDashboard' }],
                          index: 0,
                        },
                      };
                    }
                    return route;
                  }),
                })
              );
            }
          }
        } catch (err) {
          console.log('Error resetting stack on blur:', err);
        }
      };
    }, [navigation])
  );

  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      const [usersSnap, errorSnap] = await Promise.all([
        getDocs(collection(db, 'users')),
        getDocs(query(collection(db, 'systemLogs'), where('level', '==', 'error')))
      ]);
      
      setActiveUsers(usersSnap.size);
      setErrorCount(errorSnap.size);
      
      const startTime = Date.now();
      await getDocs(collection(db, 'users'));
      const responseTime = Date.now() - startTime;
      setApiResponseTime(responseTime);
      
      if (errorSnap.size > 10 || responseTime > 2000) {
        setSystemHealth('warning');
      } else if (errorSnap.size > 20 || responseTime > 5000) {
        setSystemHealth('critical');
      } else {
        setSystemHealth('healthy');
      }
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
      // Only show network error modal for actual network errors
      if (error?.code?.includes('unavailable') || error?.code?.includes('network') || error?.message?.toLowerCase().includes('network')) {
        const errorInfo = getNetworkErrorMessage({ type: 'unstable_connection', message: error.message });
        setNetworkErrorTitle(errorInfo.title);
        setNetworkErrorMessage(errorInfo.message);
        setNetworkErrorColor(errorInfo.color);
        setNetworkErrorVisible(true);
        setTimeout(() => setNetworkErrorVisible(false), 5000);
      }
      setSystemHealth('critical');
    } finally {
      setLoading(false);
    }
  };

  const fetchDataStats = async () => {
    setLoading(true);
    try {
      const usersSnapshot = await getDocs(collection(db, 'users'));
      let students = 0, parents = 0;
      usersSnapshot.docs.forEach(doc => {
        const data = doc.data();
        if (data.role === 'student') students++;
        if (data.role === 'parent') parents++;
      });
      
      setDataStats({
        users: usersSnapshot.size,
        students,
        parents,
        attendance: 0,
      });
    } catch (error) {
      console.error('Error fetching data stats:', error);
      // Only show network error modal for actual network errors
      if (error?.code?.includes('unavailable') || error?.code?.includes('network') || error?.message?.toLowerCase().includes('network')) {
        const errorInfo = getNetworkErrorMessage({ type: 'unstable_connection', message: error.message });
        setNetworkErrorTitle(errorInfo.title);
        setNetworkErrorMessage(errorInfo.message);
        setNetworkErrorColor(errorInfo.color);
        setNetworkErrorVisible(true);
        setTimeout(() => setNetworkErrorVisible(false), 5000);
      }
    } finally {
      setLoading(false);
    }
  };

  const testAPI = async () => {
    if (!selectedEndpoint) {
      setFeedbackMessage('Please select an endpoint');
      setFeedbackSuccess(false);
      setFeedbackVisible(true);
      return;
    }

    setLoading(true);
    setResponse(null);

    try {
      const endpoint = apiEndpoints.find(ep => ep.name === selectedEndpoint);
      const url = `${BASE_URL}${endpoint.endpoint}`;
      
      const options = {
        method: requestMethod,
        headers: { 'Content-Type': 'application/json' },
      };

      if (endpoint.requiresAuth && user?.token) {
        options.headers['Authorization'] = `Bearer ${user.token}`;
      }

      if (requestMethod !== 'GET' && requestBody) {
        options.body = requestBody;
      }

      const startTime = Date.now();
      const res = await fetch(url, options);
      const responseTime = Date.now() - startTime;

      const responseData = await res.text();
      let parsedData;
      try {
        parsedData = JSON.parse(responseData);
      } catch {
        parsedData = responseData;
      }

      setResponse({
        status: res.status,
        statusText: res.statusText,
        responseTime,
        data: parsedData,
        timestamp: new Date().toISOString(),
      });
      setResponseModalVisible(true);
    } catch (error) {
      setResponse({
        status: 0,
        statusText: 'Network Error',
        responseTime: 0,
        data: { error: error.message },
        timestamp: new Date().toISOString(),
      });
      setResponseModalVisible(true);
    } finally {
      setLoading(false);
    }
  };

  const exportData = async (collectionName) => {
    setOperationLoading(true);
    try {
      let snapshot;
      let data = [];

        if (collectionName === 'student_attendances') {
          // For attendance, we need to query the subcollections
          // Use collectionGroup to get all scans from all students
          try {
            const scansQuery = collectionGroup(db, 'scans');
            snapshot = await getDocs(scansQuery);
          
          if (snapshot.empty) {
            setFeedbackMessage(`No ${collectionName} data found.`);
            setFeedbackSuccess(false);
            setFeedbackVisible(true);
            return;
          }

          data = snapshot.docs.map(doc => {
            const docData = doc.data();
            // Extract studentId from the document path
            const pathParts = doc.ref.path.split('/');
            const studentId = pathParts[1]; // student_attendances/{studentId}/scans/{scanId}
            
            return {
              id: doc.id,
              studentId: studentId,
              ...docData
            };
          });
        } catch (error) {
          // Fallback: try to get all student documents and their scans
          const studentsSnapshot = await getDocs(collection(db, 'student_attendances'));
          if (studentsSnapshot.empty) {
            setFeedbackMessage(`No ${collectionName} data found.`);
            setFeedbackSuccess(false);
            setFeedbackVisible(true);
            return;
          }

          const allScans = [];
          for (const studentDoc of studentsSnapshot.docs) {
            const scansRef = collection(db, 'student_attendances', studentDoc.id, 'scans');
            const scansSnapshot = await getDocs(scansRef);
            scansSnapshot.docs.forEach(scanDoc => {
              allScans.push({
                id: scanDoc.id,
                studentId: studentDoc.id,
                ...scanDoc.data()
              });
            });
          }
          data = allScans;

          if (data.length === 0) {
            setFeedbackMessage(`No ${collectionName} data found.`);
            setFeedbackSuccess(false);
            setFeedbackVisible(true);
            return;
          }
        }
      } else {
        // For other collections, use standard query
        snapshot = await getDocs(collection(db, collectionName));
        if (snapshot.empty) {
          setFeedbackMessage(`No ${collectionName} data found.`);
          setFeedbackSuccess(false);
          setFeedbackVisible(true);
          return;
        }

        data = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
      }

      const csvContent = JSON.stringify(data, null, 2);
      await Share.share({
        message: csvContent,
        title: `Export ${collectionName}`,
      });

      setFeedbackMessage(`Exported ${data.length} records`);
      setFeedbackSuccess(true);
      setFeedbackVisible(true);
    } catch (error) {
      console.error('Export error:', error);
      // Only show network error modal for actual network errors
      if (error?.code?.includes('unavailable') || error?.code?.includes('network') || error?.message?.toLowerCase().includes('network')) {
        const errorInfo = getNetworkErrorMessage({ type: 'unstable_connection', message: error.message });
        setNetworkErrorTitle(errorInfo.title);
        setNetworkErrorMessage(errorInfo.message);
        setNetworkErrorColor(errorInfo.color);
        setNetworkErrorVisible(true);
        setTimeout(() => setNetworkErrorVisible(false), 5000);
      } else {
        setFeedbackMessage(`Export failed: ${error.message}`);
        setFeedbackSuccess(false);
        setFeedbackVisible(true);
      }
    } finally {
      setOperationLoading(false);
    }
  };

  const getHealthColor = (health) => {
    switch (health) {
      case 'healthy': return '#10B981';
      case 'warning': return '#D97706';
      case 'critical': return '#DC2626';
      default: return '#6B7280';
    }
  };

  const getStatusColor = (status) => {
    if (status >= 200 && status < 300) return '#10B981';
    if (status >= 300 && status < 400) return '#D97706';
    if (status >= 400) return '#DC2626';
    return '#6B7280';
  };

  const confirmLogout = async () => {
    setLogoutVisible(false);
    try { await logout(); } catch {}
  };

  // Card visual palette (matches admin dashboard card styling)
  const adminCardPalette = {
    cardBg: '#FFFFFF',
    borderColor: '#E5E7EB',
    iconBg: 'rgba(0,79,137,0.12)',
    accentColor: '#004f89',
    badgeBg: '#004f89',
    badgeTextColor: '#FFFFFF',
    textColor: '#004f89',
    labelColor: '#004f89',
  };

  return (
    <SafeAreaView style={styles.wrapper} edges={['left', 'right']}>
      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Dashboard Section */}
        <View style={styles.section}>
          <View style={styles.statsGrid}>
            {(() => {
              const dashboardCards = [
                {
                  key: 'systemHealth',
                  title: 'System Health',
                  subtitle: systemHealth === 'healthy' ? 'All systems operational' : systemHealth === 'warning' ? 'Minor issues detected' : 'Critical issues require attention',
                  value: systemHealth.charAt(0).toUpperCase() + systemHealth.slice(1),
                  badgeText: systemHealth === 'healthy' ? 'Operational' : systemHealth === 'warning' ? 'Warning' : 'Critical',
                  renderIcon: () => <Ionicons 
                    name={systemHealth === 'healthy' ? 'checkmark-circle' : systemHealth === 'warning' ? 'warning' : 'alert-circle'} 
                    size={22} 
                    color={adminCardPalette.accentColor} 
                  />,
                },
                {
                  key: 'activeUsers',
                  title: 'Active Users',
                  subtitle: 'Total registered',
                  value: activeUsers,
                  badgeText: `${activeUsers} in system`,
                  renderIcon: () => <Ionicons name="people-outline" size={22} color={adminCardPalette.accentColor} />,
                },
                {
                  key: 'apiResponse',
                  title: 'API Response',
                  subtitle: 'Response time',
                  value: `${apiResponseTime}ms`,
                  badgeText: apiResponseTime < 1000 ? 'Fast' : apiResponseTime < 2000 ? 'Normal' : 'Slow',
                  renderIcon: () => <Ionicons name="speedometer-outline" size={22} color={adminCardPalette.accentColor} />,
                },
                {
                  key: 'errors',
                  title: 'Errors',
                  subtitle: 'System errors',
                  value: errorCount,
                  badgeText: errorCount === 0 ? 'No errors' : `${errorCount} detected`,
                  renderIcon: () => <Ionicons name="alert-circle-outline" size={22} color={adminCardPalette.accentColor} />,
                },
              ];

              return dashboardCards.map((card) => (
                <View
                  key={card.key}
                  style={[
                    styles.overviewCard,
                    {
                      backgroundColor: adminCardPalette.cardBg,
                      borderColor: adminCardPalette.borderColor,
                    },
                  ]}
                >
                  <View style={styles.overviewHeader}>
                    <View
                      style={[
                        styles.overviewIconWrap,
                        { backgroundColor: adminCardPalette.iconBg },
                      ]}
                    >
                      {card.renderIcon()}
                    </View>
                    <Text
                      style={[
                        styles.overviewSubtitle,
                        { color: adminCardPalette.accentColor },
                      ]}
                    >
                      {card.subtitle}
                    </Text>
                  </View>
                  <Text
                    style={[
                      styles.overviewValue,
                      { color: adminCardPalette.textColor },
                    ]}
                    numberOfLines={1}
                    ellipsizeMode="tail"
                  >
                    {card.value}
                  </Text>
                  <Text
                    style={[
                      styles.overviewLabel,
                      { color: adminCardPalette.labelColor },
                    ]}
                  >
                    {card.title}
                  </Text>
                  {card.badgeText ? (
                    <View
                      style={[
                        styles.overviewBadge,
                        { backgroundColor: adminCardPalette.badgeBg },
                      ]}
                    >
                      <Text
                        style={[
                          styles.overviewBadgeText,
                          { color: adminCardPalette.badgeTextColor },
                        ]}
                      >
                        {card.badgeText}
                      </Text>
                    </View>
                  ) : null}
                </View>
              ));
            })()}
          </View>
        </View>

        {/* Push Notification Test Section */}
        <View style={styles.apiTestingSection}>
          <Text style={styles.mainSectionTitle}>🧪 Push Notification Test</Text>
          <TouchableOpacity
            style={[styles.testButton, { backgroundColor: '#004f89' }]}
            onPress={testPushNotification}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.testButtonText}>Test Push Notification</Text>
            )}
          </TouchableOpacity>
          <Text style={styles.testHint}>
            Sends a test notification to your device.{'\n'}
            Close the app first, then tap this button.
          </Text>
        </View>

        {/* API Testing Section */}
        <View style={styles.apiTestingSection}>
          <Text style={styles.mainSectionTitle}>API Testing</Text>
          <View style={styles.endpointGrid}>
            {apiEndpoints.map((endpoint, index) => (
              <TouchableOpacity
                key={index}
                style={[styles.endpointCard, selectedEndpoint === endpoint.name && styles.endpointCardActive]}
                onPress={() => {
                  setSelectedEndpoint(endpoint.name);
                  setRequestMethod(endpoint.method);
                }}
              >
                <Text style={[styles.endpointCardName, selectedEndpoint === endpoint.name && styles.endpointCardNameActive]}>
                  {endpoint.name}
                </Text>
                <Text style={styles.endpointCardUrl}>{endpoint.endpoint}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.methodButtonContainer}>
            {['GET', 'POST', 'PUT', 'DELETE'].map((method) => (
              <TouchableOpacity
                key={method}
                style={[styles.methodChip, requestMethod === method && styles.methodChipActive]}
                onPress={() => setRequestMethod(method)}
              >
                <Text style={[styles.methodChipText, requestMethod === method && styles.methodChipTextActive]}>
                  {method}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {requestMethod !== 'GET' && (
            <View style={styles.inputGroup}>
              <Text style={styles.requestBodyLabel}>Request Body (JSON)</Text>
              <TextInput
                style={styles.textArea}
                value={requestBody}
                onChangeText={setRequestBody}
                placeholder="Enter JSON request body..."
                placeholderTextColor="#9CA3AF"
                multiline
                numberOfLines={4}
              />
            </View>
          )}

          <TouchableOpacity
            style={[styles.testButton, loading && styles.testButtonDisabled]}
            onPress={testAPI}
            disabled={loading}
            activeOpacity={0.8}
          >
            {loading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Ionicons name="play-outline" size={20} color="#fff" />
            )}
            <Text style={styles.testButtonText}>
              {loading ? 'Testing...' : 'Test API'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Data Operations */}
        <View style={styles.section}>
          <View style={styles.operationsGrid}>
            <TouchableOpacity
              style={styles.operationCard}
              onPress={() => exportData('users')}
              disabled={operationLoading}
              activeOpacity={0.8}
            >
              <View style={[styles.overviewIconWrap, { backgroundColor: adminCardPalette.iconBg }]}>
                <Ionicons name="download-outline" size={22} color={adminCardPalette.accentColor} />
              </View>
              <View style={styles.operationContent}>
                <Text style={styles.operationTitle}>Export Users</Text>
                <Text style={styles.operationDescription}>Export all user data</Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.operationCard, styles.exportAttendanceCard]}
              onPress={() => exportData('student_attendances')}
              disabled={operationLoading}
              activeOpacity={0.8}
            >
              <View style={[styles.overviewIconWrap, { backgroundColor: adminCardPalette.iconBg }]}>
                <Ionicons name="calendar-outline" size={22} color={adminCardPalette.accentColor} />
              </View>
              <View style={styles.operationContent}>
                <Text style={styles.operationTitle}>Export Attendance</Text>
                <Text style={styles.operationDescription}>Export attendance records</Text>
              </View>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>

      {/* Response Modal */}
      <Modal
        transparent
        animationType="fade"
        visible={responseModalVisible}
        onRequestClose={() => setResponseModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>API Response</Text>
              <TouchableOpacity onPress={() => setResponseModalVisible(false)}>
                <Ionicons name="close" size={24} color="#111827" />
              </TouchableOpacity>
            </View>
            {response && (
              <ScrollView style={styles.responseContainer}>
                <View style={styles.responseHeader}>
                  <View style={[styles.statusIndicator, { backgroundColor: getStatusColor(response.status) }]} />
                  <Text style={styles.statusText}>
                    {response.status} {response.statusText}
                  </Text>
                  <Text style={styles.responseTime}>{response.responseTime}ms</Text>
                </View>
                <Text style={styles.responseLabel}>Response Data</Text>
                <Text style={styles.responseText}>
                  {typeof response.data === 'string' ? response.data : JSON.stringify(response.data, null, 2)}
                </Text>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* Feedback Modal (mirrored from Admin Alerts) */}
      <Modal transparent animationType="fade" visible={feedbackVisible} onRequestClose={() => setFeedbackVisible(false)}>
        <View style={styles.modalOverlayCenter}>
          <View style={styles.fbModalCard}>
            <View style={styles.fbModalContent}>
              <Text style={[styles.fbModalTitle, { color: feedbackSuccess ? '#10B981' : '#DC2626' }]}>
                {feedbackSuccess ? 'Success' : 'Error'}
              </Text>
              <Text style={styles.fbModalMessage}>{feedbackMessage}</Text>
            </View>
            <View style={styles.fbModalButtonContainer}>
              <TouchableOpacity
                style={styles.fbModalConfirmButton}
                onPress={() => setFeedbackVisible(false)}
              >
                <Text style={styles.fbModalConfirmText}>Confirm</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Logout Modal */}
      <Modal transparent animationType="fade" visible={logoutVisible} onRequestClose={() => setLogoutVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Logout</Text>
            <Text style={styles.modalText}>Are you sure you want to logout?</Text>
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalButton} onPress={() => setLogoutVisible(false)}>
                <Text style={styles.modalButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalButton, styles.modalButtonDanger]} onPress={confirmLogout}>
                <Text style={[styles.modalButtonText, styles.modalButtonDangerText]}>Logout</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Network Error Modal */}
      <Modal transparent animationType="fade" visible={networkErrorVisible} onRequestClose={() => setNetworkErrorVisible(false)}>
        <View style={styles.modalOverlayCenter}>
          <View style={styles.fbModalCard}>
            <View style={styles.fbModalContent}>
              <Text style={[styles.fbModalTitle, { color: networkErrorColor }]}>{networkErrorTitle}</Text>
              {networkErrorMessage ? <Text style={styles.fbModalMessage}>{networkErrorMessage}</Text> : null}
              <View style={styles.fbModalButtonContainer}>
                <TouchableOpacity
                  style={[styles.fbModalConfirmButton, { backgroundColor: networkErrorColor }]}
                  onPress={() => setNetworkErrorVisible(false)}
                >
                  <Text style={styles.fbModalConfirmText}>OK</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  wrapper: { flex: 1, backgroundColor: '#F9FAFB' },
  content: { flex: 1, padding: 16, paddingTop: 20, paddingBottom: 120 },
  mainSectionTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#0078cf',
    marginRight: 8,
    marginBottom: 12,
    marginTop: -20,
  },
  section: { marginBottom: 24, marginTop: 0 },
  apiTestingSection: { marginBottom: 10, marginTop: 0 },
  sectionTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#0078cf',
    marginRight: 8,
    marginBottom: 5,
    marginTop: 10,
  },
  // Grid + overview card styles (matches admin dashboard cards)
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginTop: -10,
    marginBottom: 4,
  },
  overviewCard: {
    width: '48%',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'flex-start',
    justifyContent: 'flex-start',
    overflow: 'hidden',
    marginVertical: 4,
    minHeight: 96,
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 4,
    elevation: 2,
  },
  overviewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    width: '100%',
    marginBottom: 10,
    flexWrap: 'wrap',
  },
  overviewIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  overviewSubtitle: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.2,
    flexShrink: 1,
    flexGrow: 1,
    minWidth: 0,
  },
  overviewValue: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 4,
    letterSpacing: -0.5,
  },
  overviewLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1F2937',
  },
  overviewBadge: {
    marginTop: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  overviewBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  listContainer: { 
    backgroundColor: '#fff', 
    borderRadius: 8, 
    borderWidth: 1, 
    borderColor: '#E5E7EB', 
    paddingHorizontal: 8, 
    paddingVertical: 4, 
    paddingBottom: 16, 
    marginTop: 12,
  },
  inputGroup: { marginBottom: 16 },
  inputLabel: { fontSize: 14, fontWeight: '600', color: '#111827', marginBottom: 8 },
  requestBodyLabel: { fontSize: 14, fontWeight: '600', color: '#0078cf', marginBottom: 8 },
  endpointGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 0 },
  endpointCard: {
    flex: 1,
    minWidth: '45%',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FAFBFC',
    margin: 4,
    marginTop: 0,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 3,
  },
  endpointCardActive: { borderColor: '#004f89', backgroundColor: '#EFF6FF' },
  endpointCardName: { fontSize: 12, fontWeight: '600', color: '#111827', marginBottom: 4 },
  endpointCardNameActive: { color: '#004f89' },
  endpointCardUrl: { fontSize: 10, color: '#6B7280', fontFamily: 'monospace' },
  methodContainer: { flexDirection: 'row', gap: 8 },
  methodButtonContainer: {
    flexDirection: 'row',
    gap: 10,
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    marginTop: 12,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 3,
    justifyContent: 'center',
  },
  methodChip: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  methodChipActive: { backgroundColor: '#004f89', borderColor: '#004f89' },
  methodChipText: { fontSize: 12, fontWeight: '600', color: '#111827' },
  methodChipTextActive: { color: '#fff' },
  textArea: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    color: '#111827',
    backgroundColor: '#FAFBFC',
    textAlignVertical: 'top',
    minHeight: 100,
  },
  testButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#004f89',
    paddingVertical: 12,
    borderRadius: 8,
    gap: 8,
    marginTop: 0,
    marginBottom: 0,
  },
  testButtonDisabled: { backgroundColor: '#9CA3AF' },
  testButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  operationsGrid: { gap: 12, marginTop: 0 },
  operationCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#FAFBFC',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    gap: 12,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 3,
  },
  exportAttendanceCard: {
    marginBottom: 12,
  },
  operationContent: { flex: 1 },
  operationTitle: { fontSize: 14, fontWeight: '600', color: '#111827', marginBottom: 2 },
  operationDescription: { fontSize: 12, color: '#6B7280' },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  modalCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    width: '90%',
    maxWidth: 500,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: { fontSize: 20, fontWeight: '700', color: '#111827' },
  modalText: { fontSize: 16, color: '#6B7280', marginBottom: 24 },
  modalActions: { flexDirection: 'row', gap: 12 },
  modalButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
  },
  modalButtonText: { fontSize: 16, fontWeight: '600', color: '#111827' },
  modalButtonDanger: { backgroundColor: '#FEE2E2' },
  modalButtonDangerText: { color: '#DC2626' },
  responseContainer: { maxHeight: 400 },
  responseHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    gap: 8,
  },
  statusIndicator: { width: 12, height: 12, borderRadius: 6 },
  statusText: { fontSize: 16, fontWeight: '600', color: '#111827', flex: 1 },
  responseTime: { fontSize: 14, color: '#6B7280' },
  responseLabel: { fontSize: 14, fontWeight: '600', color: '#6B7280', marginBottom: 8 },
  responseText: {
    fontSize: 12,
    color: '#111827',
    fontFamily: 'monospace',
    backgroundColor: '#FAFBFC',
    padding: 12,
    borderRadius: 8,
  },
  // Feedback modal styles (mirrored from Admin Alerts)
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
  fbModalButtonContainer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 20,
    gap: 8,
  },
  fbModalConfirmButton: {
    backgroundColor: '#004f89',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fbModalConfirmText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});

export default Developer;

