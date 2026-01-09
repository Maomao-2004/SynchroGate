# Railway Deployment Guide for SyncroGate Backend

## Prerequisites
1. Railway account (sign up at https://railway.app)
2. GitHub repository connected to Railway
3. All environment variables configured

## Deployment Steps

### 1. Connect Repository to Railway
1. Go to https://railway.app
2. Click "New Project"
3. Select "Deploy from GitHub repo"
4. Choose your `SyncroGate` repository
5. Select the `backend` directory as the root directory

### 2. Configure Environment Variables
In Railway dashboard, go to your service → Variables tab and add:

#### Required Variables:
```
PORT=8000
NODE_ENV=production

# Firebase Configuration
FIREBASE_SERVICE_ACCOUNT_JSON=<your-firebase-service-account-json-as-string>
FIREBASE_DATABASE_URL=<your-firebase-database-url>

# JWT Configuration
JWT_SECRET=<your-jwt-secret-key>
JWT_EXPIRES_IN=7d
BCRYPT_SALT_ROUNDS=10

# Push Notifications (Expo)
EXPO_PUSH_KEY=<your-expo-push-key-if-needed>

# Twilio (Optional - for SMS)
TWILIO_SID=<your-twilio-sid>
TWILIO_TOKEN=<your-twilio-token>
TWILIO_FROM=<your-twilio-phone-number>

# Application URLs
APP_BASE_URL=https://your-railway-app.railway.app
FRONTEND_URL=<your-frontend-url>
```

#### Important Notes:
- `FIREBASE_SERVICE_ACCOUNT_JSON` should be the entire JSON object as a string (minified)
- Railway automatically provides `PORT` - your app should use `process.env.PORT`
- `APP_BASE_URL` should be your Railway app URL after deployment

### 3. Deploy
1. Railway will automatically detect the `package.json` and run `npm install`
2. Then it will run `npm start` (which executes `node ./src/index.js`)
3. Your app will be available at the Railway-provided URL

### 4. Verify Deployment
1. Check the Railway logs to ensure the server started successfully
2. Visit `https://your-app.railway.app/` - you should see:
   ```json
   {"message": "GuardianEntry API is running 🚀"}
   ```
3. Test push notifications endpoint: `POST /api/notifications/send`

## Push Notifications Setup

The backend uses Expo Push Notification service. Make sure:
1. Your frontend app is configured with Expo
2. Push tokens are properly stored in your database
3. The notification routes are accessible

## Troubleshooting

### Server won't start
- Check Railway logs for errors
- Verify all required environment variables are set
- Ensure `FIREBASE_SERVICE_ACCOUNT_JSON` is valid JSON string

### Push notifications not working
- Verify `EXPO_PUSH_KEY` is set (if required)
- Check that push tokens are valid Expo tokens
- Review notification controller logs

### Port issues
- Railway automatically sets `PORT` - don't hardcode it
- Your code already uses `process.env.PORT || 8000` which is correct

## Monitoring
- View logs in Railway dashboard
- Set up alerts for deployment failures
- Monitor API response times

## Custom Domain (Optional)
1. Go to your service → Settings → Domains
2. Add your custom domain
3. Configure DNS as instructed by Railway

















































