# 🚨 MUST DO IN RAILWAY DASHBOARD

## The Problem
Railway is still using cached builds and NOT installing dependencies. You MUST change settings in Railway website.

## ✅ SOLUTION: Set Root Directory (DO THIS NOW)

### Step 1: Go to Railway Dashboard
1. Open https://railway.app
2. Click on your **project**
3. Click on your **service** (the backend service)

### Step 2: Open Settings
1. Click the **Settings** tab (gear icon on the left sidebar)
2. Scroll down to find **"Root Directory"** section

### Step 3: Set Root Directory
1. In the **"Root Directory"** field, type: `backend`
2. Click **Save** or **Update**

### Step 4: Clear Build Cache
1. Go to **Deployments** tab
2. Find the latest deployment
3. Click the **three dots (⋯)** menu
4. Select **"Clear Build Cache"**

### Step 5: Redeploy
1. Click **"Redeploy"** button
2. OR push a new commit to trigger redeploy

## What This Does

Setting Root Directory to `backend` tells Railway:
- ✅ Use `backend/package.json` directly
- ✅ Run `npm install` in `backend/` automatically
- ✅ Install ALL dependencies including `firebase-admin`
- ✅ Start from `backend/` directory

## Verify It's Working

After redeploy, check **Build Logs**. You should see:
```
> npm install
...
added 234 packages in 15s
```

Then check **Runtime Logs**. You should see:
```
🚀 Server running on port XXXX
```

## If Root Directory Option Doesn't Exist

If you don't see "Root Directory" in Settings:
1. Make sure you're on the **service** level (not project level)
2. Try creating a new service:
   - Click **"New"** → **"GitHub Repo"**
   - Select your repo
   - During setup, set Root Directory to `backend`
   - Delete the old service

---

**THIS IS THE ONLY WAY TO FIX IT** - You MUST set Root Directory in Railway Dashboard.



