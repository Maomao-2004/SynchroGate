# Network Error Handling Implementation Guide

This guide shows how to add network error handling with timeout and connection checking to all screens.

## Pattern Overview

1. **Import the network error handler utility**
2. **Add network error state variables**
3. **Wrap network operations with `withNetworkErrorHandling`**
4. **Add network error modal to JSX**
5. **Handle network errors in catch blocks**

## Step-by-Step Implementation

### Step 1: Import the Utility

Add to imports at the top of the file:

```javascript
import { withNetworkErrorHandling, getNetworkErrorMessage } from '../../utils/networkErrorHandler';
```

### Step 2: Add State Variables

Add these state variables (usually near other state declarations):

```javascript
const [networkErrorVisible, setNetworkErrorVisible] = useState(false);
const [networkErrorTitle, setNetworkErrorTitle] = useState('');
const [networkErrorMessage, setNetworkErrorMessage] = useState('');
const [networkErrorColor, setNetworkErrorColor] = useState('#DC2626');
```

### Step 3: Wrap Network Operations

Wrap any async function that performs network operations:

```javascript
// Before:
const loadData = async () => {
  try {
    const snap = await getDocs(query);
    // ... process data
  } catch (e) {
    // ... error handling
  }
};

// After:
const loadData = async () => {
  try {
    await withNetworkErrorHandling(async () => {
      const snap = await getDocs(query);
      // ... process data
    });
  } catch (e) {
    const errorInfo = getNetworkErrorMessage(e);
    if (e.type === 'no_internet' || e.type === 'timeout' || e.type === 'unstable_connection') {
      setNetworkErrorTitle(errorInfo.title);
      setNetworkErrorMessage(errorInfo.message);
      setNetworkErrorColor(errorInfo.color);
      setNetworkErrorVisible(true);
      setTimeout(() => setNetworkErrorVisible(false), 5000);
    } else {
      // Handle other errors normally
    }
  }
};
```

### Step 4: Add Network Error Modal

Add this modal component before the closing `</View>` tag:

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

### Step 5: Ensure Styles Exist

Make sure these styles exist (they should already be in most files from alerts.js):

```javascript
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
```

## Error Types

The network error handler detects three types of errors:

1. **`no_internet`**: No internet connection detected
   - Title: "No Internet Connection"
   - Color: `#DC2626` (red)

2. **`timeout`**: Operation took longer than 1 minute
   - Title: "Unstable Connection"
   - Color: `#F59E0B` (orange)

3. **`unstable_connection`**: Network error detected but connection exists
   - Title: "Unstable Connection"
   - Color: `#F59E0B` (orange)

## Files That Need Updates

### Admin Screens
- ✅ StudentManagement.js (DONE)
- ✅ ParentManagement.js (DONE)
- ⏳ StudentProfile.js
- ⏳ ParentProfile.js
- ⏳ Events.js
- ⏳ Dashboard.js
- ⏳ Alerts.js
- ⏳ ActivityLog.js
- ⏳ Developer.js

### Student Screens
- ⏳ Alerts.js
- ⏳ Dashboard.js
- ⏳ Schedule.js
- ⏳ LinkParent.js
- ⏳ Messages.js
- ⏳ Conversation.js
- ⏳ Profile.js
- ⏳ ParentProfile.js
- ⏳ QRPreview.js
- ⏳ AttendanceLog.js
- ⏳ Events.js

### Parent Screens
- ⏳ Alerts.js
- ⏳ Dashboard.js
- ⏳ LinkStudents.js
- ⏳ Messages.js
- ⏳ Conversation.js
- ⏳ Profile.js
- ⏳ StudentProfile.js
- ⏳ AttendanceLog.js
- ⏳ Schedule.js
- ⏳ Events.js

## Notes

- The timeout is set to 60 seconds (1 minute) by default
- Network errors automatically show a modal that closes after 5 seconds
- The modal uses the same UI style as alerts.js for consistency
- All network operations should be wrapped, especially:
  - Data loading (getDocs, getDoc)
  - Data saving (setDoc, updateDoc)
  - Data deletion (deleteDoc)
  - Real-time listeners (onSnapshot) don't need wrapping, but their callbacks might







