# ✅ How to Verify Variables Are Set Correctly in Railway

## Step-by-Step Verification

### 1. Check You're on the RIGHT Service
1. Go to Railway Dashboard
2. Click your **PROJECT** (top level)
3. You should see a list of **SERVICES**
4. Click on the **backend service** (the one that runs your Node.js app)
5. Make sure you're INSIDE the service, not at project level

### 2. Verify Variables Are at SERVICE Level
1. While INSIDE the service (not project)
2. Click **"Variables"** tab in left sidebar
3. You should see a list of variables
4. Check if you see:
   - `FIREBASE_SERVICE_ACCOUNT_JSON`
   - `FIREBASE_DATABASE_URL`
   - `JWT_SECRET`

### 3. If Variables Are NOT There
- They might be at **Project** level
- Go back to **Project** level → Variables
- If you see them there, **DELETE them**
- Then go to **Service** level → Variables
- **ADD them again at Service level**

### 4. Check Variable Names (Case-Sensitive!)
The names must be EXACTLY:
- `FIREBASE_SERVICE_ACCOUNT_JSON` (all caps, underscores)
- `FIREBASE_DATABASE_URL` (all caps, underscores)
- `JWT_SECRET` (all caps, underscore)

### 5. After Setting Variables
1. Click **"Save"** or **"Add"**
2. Go to **"Deployments"** tab
3. Click **"Redeploy"** button
4. Wait for deployment to complete

### 6. Check Deployment Logs
After redeploy, check **Runtime Logs**. You should see:
```
🔍 Available env vars: FIREBASE_SERVICE_ACCOUNT_JSON, FIREBASE_DATABASE_URL, JWT_SECRET
🔍 FIREBASE_SERVICE_ACCOUNT_JSON exists: true
```

## Common Issues

### Issue 1: Variables at Project Level
- **Symptom:** Variables show in project but not in service
- **Fix:** Delete from project, add to service

### Issue 2: Wrong Service
- **Symptom:** Multiple services, variables on wrong one
- **Fix:** Make sure you're on the backend service

### Issue 3: Not Redeployed
- **Symptom:** Variables set but logs still show empty
- **Fix:** Click "Redeploy" after setting variables

### Issue 4: Variable Name Typo
- **Symptom:** Variable exists but with wrong name
- **Fix:** Check exact spelling (case-sensitive)

## Quick Test

1. In Railway → Service → Variables
2. Add a test variable: `TEST_VAR` = `test123`
3. Redeploy
4. Check logs - you should see it in debug output

If test variable doesn't appear, Railway isn't passing variables to the container at all.

























