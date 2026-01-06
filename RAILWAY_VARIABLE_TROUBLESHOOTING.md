# 🔧 Railway Variable Troubleshooting

## The Problem
You added the variables but Railway still says `FIREBASE_SERVICE_ACCOUNT_JSON` is missing.

## Common Issues & Fixes

### 1. Check Variable Name (Case-Sensitive!)
The variable name must be **EXACTLY**:
```
FIREBASE_SERVICE_ACCOUNT_JSON
```
- ✅ Correct: `FIREBASE_SERVICE_ACCOUNT_JSON`
- ❌ Wrong: `firebase_service_account_json`
- ❌ Wrong: `FIREBASE_SERVICE_ACCOUNT_Json`
- ❌ Wrong: `FIREBASE_SERVICE_ACCOUNT_JSON ` (extra space)

### 2. Verify Variables Are Set
1. Go to Railway Dashboard → Your Service
2. Click **"Variables"** tab
3. Check that you see all 3 variables listed:
   - `FIREBASE_SERVICE_ACCOUNT_JSON`
   - `FIREBASE_DATABASE_URL`
   - `JWT_SECRET`

### 3. Check Variable Value
For `FIREBASE_SERVICE_ACCOUNT_JSON`, the value should:
- Start with: `{"type":"service_account"...`
- End with: `..."universe_domain":"googleapis.com"}`
- Be **ONE continuous line** (no line breaks)
- Have **NO extra spaces** at the beginning or end

### 4. Redeploy After Adding Variables
After adding/editing variables:
1. Go to **Deployments** tab
2. Click **"Redeploy"** button
3. OR wait for Railway to auto-redeploy (may take a minute)

### 5. Check Service vs Project Level
Make sure variables are set at the **SERVICE** level, not project level:
- ✅ Correct: Service → Variables
- ❌ Wrong: Project → Variables

### 6. Delete and Re-add Variable
If it's still not working:
1. Delete the `FIREBASE_SERVICE_ACCOUNT_JSON` variable
2. Click **"New Variable"** again
3. Name: `FIREBASE_SERVICE_ACCOUNT_JSON` (copy-paste to avoid typos)
4. Value: (paste the JSON string)
5. Click **"Add"**
6. **Redeploy**

### 7. Verify JSON Format
The JSON value should be valid. Test it:
- It should start with `{` and end with `}`
- No extra quotes around it
- No line breaks inside

## Quick Checklist

- [ ] Variable name is exactly `FIREBASE_SERVICE_ACCOUNT_JSON` (all caps, no typos)
- [ ] Variable is set at SERVICE level (not project level)
- [ ] Value is a single-line JSON string (no line breaks)
- [ ] No extra spaces before/after the value
- [ ] All 3 variables are visible in Variables tab
- [ ] Redeployed after adding variables

## Still Not Working?

1. **Check Railway Logs** - Look for any variable-related errors
2. **Try deleting all 3 variables and re-adding them**
3. **Make sure you're on the correct service** (the backend service, not frontend)
4. **Check if there are multiple services** - variables might be on the wrong one





