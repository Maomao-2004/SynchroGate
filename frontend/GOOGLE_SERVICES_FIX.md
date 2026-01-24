# Fixing google-services.json for EAS Builds

The build is failing because `google-services.json` is not being found during the EAS build process. Here are two solutions:

## Solution 1: Use EAS Secrets (Recommended for Production)

This is the recommended approach for sensitive files like `google-services.json`.

### Step 1: Create EAS Secret for google-services.json

1. **Get the content of your google-services.json file:**
   ```bash
   cat google-services.json
   ```

2. **Create the secret in EAS:**
   ```bash
   eas secret:create --scope project --name GOOGLE_SERVICES_JSON --type string --value "$(cat google-services.json)"
   ```

   Or if you prefer to paste it manually:
   ```bash
   eas secret:create --scope project --name GOOGLE_SERVICES_JSON --type string
   ```
   Then paste the entire JSON content when prompted.

### Step 2: Update eas.json to use the secret

Update your `eas.json` to write the secret to a file during build:

```json
{
  "build": {
    "production": {
      "env": {
        "EXPO_PUBLIC_ENV": "production"
      },
      "android": {
        "buildType": "apk"
      }
    }
  }
}
```

### Step 3: Create a build hook script

Create `eas-hooks/pre-build.sh`:

```bash
#!/bin/bash
set -e

# Write google-services.json from secret
if [ -n "$GOOGLE_SERVICES_JSON" ]; then
  echo "$GOOGLE_SERVICES_JSON" > google-services.json
  echo "✅ Created google-services.json from secret"
else
  echo "⚠️  Warning: GOOGLE_SERVICES_JSON secret not found"
fi
```

Make it executable:
```bash
chmod +x eas-hooks/pre-build.sh
```

### Step 4: Update eas.json to reference the hook

```json
{
  "build": {
    "production": {
      "env": {
        "EXPO_PUBLIC_ENV": "production",
        "GOOGLE_SERVICES_JSON": "@GOOGLE_SERVICES_JSON"
      },
      "android": {
        "buildType": "apk"
      }
    }
  },
  "hooks": {
    "preBuild": "./eas-hooks/pre-build.sh"
  }
}
```

## Solution 2: Ensure File is Committed to Git (Simpler)

If you're using git-based builds, make sure `google-services.json` is committed:

1. **Check if file is tracked:**
   ```bash
   git ls-files | grep google-services.json
   ```

2. **If not tracked, add it:**
   ```bash
   git add google-services.json
   git commit -m "Add google-services.json for EAS builds"
   git push
   ```

3. **Verify it's not in .gitignore:**
   The file should NOT be in `.gitignore`. Check your `.gitignore` file.

## Solution 3: Use Build Hook to Copy File (Current Implementation)

A build hook script has been created at `eas-hooks/copy-google-services.sh`. However, EAS doesn't automatically run scripts in that directory. You need to:

1. **Make the script executable:**
   ```bash
   chmod +x eas-hooks/copy-google-services.sh
   ```

2. **Update eas.json to reference it:**
   ```json
   {
     "hooks": {
       "preBuild": "./eas-hooks/copy-google-services.sh"
     }
   }
   ```

## Quick Fix: Commit the File

The simplest immediate fix is to ensure `google-services.json` is committed to your git repository:

```bash
cd frontend
git add google-services.json
git commit -m "Add google-services.json for EAS builds"
git push
```

Then rebuild:
```bash
eas build --platform android --profile production
```

## Verification

After applying any solution, verify the build works:

```bash
eas build --platform android --profile production
```

The build should now find `google-services.json` in the expected location.

## Important Notes

- **Security**: If `google-services.json` contains sensitive information, use Solution 1 (EAS Secrets)
- **Git**: For git-based builds, the file must be committed to your repository
- **Path**: The file should be in the `frontend/` directory root (where `app.json` is located)
- **Package Name**: Ensure the `package_name` in `google-services.json` matches your `app.json` Android package name (`com.palabay.synchrogate`)





























































































