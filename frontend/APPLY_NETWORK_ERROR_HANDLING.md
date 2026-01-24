# Network Error Handling - Batch Application Script

This document lists all files that need network error handling applied and provides a systematic approach.

## Pattern to Apply

For each file, apply these changes:

### 1. Add Import
```javascript
import { withNetworkErrorHandling, getNetworkErrorMessage } from '../../utils/networkErrorHandler';
```

### 2. Add State Variables
```javascript
const [networkErrorVisible, setNetworkErrorVisible] = useState(false);
const [networkErrorTitle, setNetworkErrorTitle] = useState('');
const [networkErrorMessage, setNetworkErrorMessage] = useState('');
const [networkErrorColor, setNetworkErrorColor] = useState('#DC2626');
```

### 3. Wrap Network Operations
Wrap all async functions that perform network operations:
- `getDocs`, `getDoc`, `setDoc`, `updateDoc`, `deleteDoc`
- Any Firebase Firestore operations
- Any API calls

### 4. Add Error Handling in Catch Blocks
```javascript
catch (error) {
  const errorInfo = getNetworkErrorMessage(error);
  if (error.type === 'no_internet' || error.type === 'timeout' || error.type === 'unstable_connection') {
    setNetworkErrorTitle(errorInfo.title);
    setNetworkErrorMessage(errorInfo.message);
    setNetworkErrorColor(errorInfo.color);
    setNetworkErrorVisible(true);
    setTimeout(() => setNetworkErrorVisible(false), 5000);
  } else {
    // Existing error handling
  }
}
```

### 5. Add Network Error Modal
Add before closing `</View>` tag:
```javascript
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
```

## Files Completed ✅

### Admin Screens
- ✅ StudentManagement.js
- ✅ ParentManagement.js
- ✅ StudentProfile.js
- ✅ ParentProfile.js

## Files Remaining ⏳

### Admin Screens
- ⏳ Events.js - Network ops: loadAnnouncements, deleteAnnouncement, updateAnnouncement
- ⏳ Dashboard.js - Network ops: loadDashboardData
- ⏳ Alerts.js - Network ops: loadAlerts, markAllAsRead, onTapAlert, deleteAllAlerts
- ⏳ ActivityLog.js - Network ops: loadActivityLogs, markAsRead, deleteActivityLog, deleteAllLogs
- ⏳ Developer.js - Network ops: testDatabaseConnection, testCollection, etc.
- ⏳ About.js - Usually no network ops (static content)

### Student Screens
- ⏳ Alerts.js - Network ops: loadAlerts, acceptRequest, declineRequest, markAsRead, deleteAll
- ⏳ Dashboard.js - Network ops: loadDashboardData, loadQRCode, loadSchedule, loadAnnouncements
- ⏳ Schedule.js - Network ops: loadSchedule, saveSchedule, deleteSubject, updateSchedule, linkParent operations
- ⏳ LinkParent.js - Network ops: loadRequests, linkParent, unlinkParent, searchParent
- ⏳ Messages.js - Network ops: loadConversations, createConversation
- ⏳ Conversation.js - Network ops: loadMessages, sendMessage, deleteConversation
- ⏳ Profile.js - Network ops: loadProfile, updateProfile
- ⏳ ParentProfile.js - Network ops: loadParent, unlinkParent
- ⏳ QRPreview.js - Network ops: loadQRCode, deleteScan
- ⏳ AttendanceLog.js - Network ops: loadAttendance, loadSchedule, loadAnnouncements
- ⏳ Events.js - Network ops: loadAnnouncements

### Parent Screens
- ⏳ Alerts.js - Network ops: loadAlerts, acceptRequest, declineRequest, markAsRead, deleteAll, triggerClassCheck
- ⏳ Dashboard.js - Network ops: loadDashboardData, loadSchedules, loadAnnouncements
- ⏳ LinkStudents.js - Network ops: loadRequests, linkStudent, unlinkStudent, searchStudent
- ⏳ Messages.js - Network ops: loadConversations, createConversation
- ⏳ Conversation.js - Network ops: loadMessages, sendMessage, deleteConversation
- ⏳ Profile.js - Network ops: loadProfile, updateProfile
- ⏳ StudentProfile.js - Network ops: loadStudent, unlinkStudent
- ⏳ AttendanceLog.js - Network ops: loadAttendance, loadSchedule, loadAnnouncements
- ⏳ Schedule.js - Network ops: loadSchedules
- ⏳ Events.js - Network ops: loadAnnouncements

## Quick Reference: Common Network Operations

Look for these patterns and wrap them:
- `await getDocs(...)`
- `await getDoc(...)`
- `await setDoc(...)`
- `await updateDoc(...)`
- `await deleteDoc(...)`
- `await query(...)`
- Any function that calls Firebase Firestore operations

## Notes

- Real-time listeners (`onSnapshot`) don't need wrapping, but their callbacks might
- Operations in `useEffect` hooks that load data should be wrapped
- User-triggered actions (save, delete, update) should definitely be wrapped
- The timeout is 60 seconds (1 minute) - operations taking longer will show "Unstable Connection"































































































