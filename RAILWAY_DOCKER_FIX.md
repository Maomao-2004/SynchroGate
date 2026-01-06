# Fix: Railway Using Docker Instead of Nixpacks

## Problem
Railway is trying to use Docker but npm is not found. This happens when Railway doesn't detect Node.js properly.

## Solution

### Step 1: Set Root Directory in Railway
**CRITICAL**: In Railway dashboard:
1. Go to your service → **Settings**
2. Find **"Root Directory"**
3. Set it to: `backend`
4. **Save**

This tells Railway to use the `backend/` folder as the project root.

### Step 2: Force Nixpacks Builder
In Railway service settings:
1. Go to **Settings** → **Build & Deploy**
2. Under **"Builder"**, select **"Nixpacks"** (not Docker)
3. Save

### Step 3: Verify Configuration
After setting root directory to `backend`, Railway should:
- Detect `backend/package.json`
- Automatically use Nixpacks
- Run `npm install`
- Run `npm start`

## Alternative: If Root Directory Setting Doesn't Work

If you can't set root directory, Railway will use the root `railway.json` which points to backend. But the **best solution is always to set Root Directory to `backend`**.

## Files Created
- `backend/nixpacks.toml` - Explicit Nixpacks configuration
- Updated `railway.json` - Simplified config
- `.railwayignore` - Ignore unnecessary files

## After Fixing
1. Redeploy in Railway
2. Check logs - you should see:
   - `npm install` running
   - `npm start` running
   - `🚀 Server running on port XXXX`



