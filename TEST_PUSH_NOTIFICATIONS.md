# 🧪 Testing Push Notifications When App is Closed

## The Real Issue

When the app is **closed**, push notifications work like this:
1. Backend (Railway) sends notification to **FCM (Firebase Cloud Messaging)**
2. FCM delivers notification directly to the **device** (not through your app)
3. Android shows the notification in the system tray

**The frontend API URL doesn't matter** - notifications go: Backend → FCM → Device

## How to Test

### Step 1: Verify FCM Token is Valid

1. **Open the app** (must be open to check)
2. **Log in** - this generates an FCM token
3. **Check Firestore** - go to `users` collection, find your user document
4. **Verify** `fcmToken` field exists and has a value

### Step 2: Test from Backend Directly

You can test by calling the Railway backend API directly:

```bash
# Replace with your actual values
curl -X POST https://synchrogate-production.up.railway.app/api/notifications/alert-push \
  -H "Content-Type: application/json" \
  -d '{
    "alert": {
      "id": "test-123",
      "type": "test",
      "title": "Test Notification",
      "message": "This is a test when app is closed",
      "status": "unread"
    },
    "userId": "YOUR_USER_ID_HERE",
    "role": "student"
  }'
```

### Step 3: Check Railway Logs

After sending the test notification, check Railway logs for:
- `📥 POST /api/notifications/alert-push received`
- `📨 Received alert push notification request`
- `🔍 Looking up FCM token for user:`
- `📤 Sending push notification:`
- `✅ FCM push notification sent successfully`

### Step 4: Check Device

1. **Close the app completely** (swipe away from recent apps)
2. **Wait 10-30 seconds** for notification to arrive
3. **Check notification tray** - should see the notification

## Common Issues

### Issue 1: "FCM token not found"
- **Solution**: User needs to log in again to generate token
- **Check**: Firestore `users` collection for `fcmToken` field

### Issue 2: "Invalid or unregistered token"
- **Solution**: User needs to rebuild app and log in again
- **Reason**: Token is from old build without proper FCM setup

### Issue 3: No notification appears
- **Check**: Device notification permissions (Settings → Apps → Your App → Notifications)
- **Check**: Do Not Disturb mode is off
- **Check**: Battery optimization isn't killing the app

### Issue 4: Notification appears but app doesn't open
- **This is normal** - notification is delivered, but app needs to handle tap
- **Check**: `fcmBackgroundHandler.js` is properly registered

## Debugging Steps

1. **Check if token exists in Firestore**
   ```javascript
   // In Firestore console
   users/{userId}/fcmToken
   ```

2. **Check Railway logs** for errors:
   - `❌ FCM push notification failed`
   - `⚠️ No FCM token found`
   - `⚠️ User document not found`

3. **Check app logs** (when app is open):
   - `✅ FCM token obtained`
   - `✅ FCM token saved to Firestore`
   - `✅ Android notification channel "default" created`

4. **Test with app open first**:
   - If notifications work when app is open, FCM is working
   - If they don't work when closed, it's an Android/notification channel issue

## Quick Test Script

Save this as `test-push.js` and run with Node.js:

```javascript
const fetch = require('node-fetch');

const RAILWAY_URL = 'https://synchrogate-production.up.railway.app/api';
const USER_ID = 'YOUR_USER_ID'; // Get from Firestore

async function testPush() {
  try {
    const response = await fetch(`${RAILWAY_URL}/notifications/alert-push`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        alert: {
          id: `test-${Date.now()}`,
          type: 'test',
          title: 'Test Notification',
          message: 'Testing push notification when app is closed',
          status: 'unread'
        },
        userId: USER_ID,
        role: 'student' // or 'parent', 'admin'
      })
    });

    const data = await response.json();
    console.log('Response:', data);
    
    if (response.ok) {
      console.log('✅ Notification sent successfully!');
      console.log('📱 Check your device (app should be closed)');
    } else {
      console.error('❌ Failed to send notification:', data);
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

testPush();
```

Run: `node test-push.js`

## Important Notes

- **Port doesn't matter** - notifications go through FCM, not your API
- **App must be closed** - completely swiped away, not just in background
- **Token must be valid** - from a build with proper FCM setup
- **Notification channel must exist** - created when user logs in

















































