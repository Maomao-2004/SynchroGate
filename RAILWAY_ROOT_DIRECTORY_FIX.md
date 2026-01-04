# Fix: Railway Root Directory Error

## The Error
```
Root Directory `/backend/service/` does not exist
```

## The Problem
Railway is looking for a root directory that doesn't exist. This happens when:
1. Railway.json is in the wrong location
2. Root Directory is set incorrectly in Railway dashboard

## ✅ SOLUTION

### Option 1: Fix Root Directory in Railway Dashboard (RECOMMENDED)

1. Go to Railway Dashboard
2. Click your **PROJECT**
3. Click your **SERVICE** (backend service)
4. Go to **Settings** tab
5. Scroll down to **"Root Directory"**
6. **Clear the Root Directory field** (make it empty/blank)
7. Click **"Save"**
8. Go to **Deployments** tab
9. Click **"Redeploy"**

### Option 2: Set Root Directory to Empty String

If the field can't be cleared:
1. Set Root Directory to: `.` (just a dot)
2. Or leave it completely empty
3. Save and redeploy

### Why This Happens

Railway uses the root directory to determine where to run commands. If it's set incorrectly, it looks for folders that don't exist.

Since we're using a Dockerfile at the root level, the root directory should be:
- **Empty** (defaults to repository root)
- Or **`.`** (current directory)

**NOT** `/backend/service/` or any other path.

## After Fixing

After clearing the root directory and redeploying, Railway should:
1. Find the Dockerfile at the root
2. Build the container correctly
3. Pass environment variables properly

Check the deployment logs to confirm it's working!

