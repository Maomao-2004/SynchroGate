# Troubleshooting eas.json "hooks" Error

## Current Status
✅ The `eas.json` file is **correct** - it has NO `hooks` field
✅ JSON syntax is valid
✅ Only one `eas.json` file exists in the project

## If You're Still Getting the Error

The error might be from a cached version. Try these steps:

### Step 1: Close and Reopen Terminal
Close your current PowerShell/terminal window completely and open a new one.

### Step 2: Navigate to Frontend Directory
```powershell
cd C:\Users\Johnmel\Downloads\SyncroGate\frontend
```

### Step 3: Verify the File
```powershell
Get-Content eas.json
```

You should see the file WITHOUT any `"hooks"` field.

### Step 4: Try Build Again
```powershell
npm run build:android
```

or

```powershell
eas build --platform android --profile production
```

### Step 5: If Still Failing - Clear EAS Cache
```powershell
# Clear npm cache
npm cache clean --force

# Try building again
eas build --platform android --profile production
```

### Step 6: Check for Hidden Characters
If the error persists, there might be hidden characters. Try recreating the file:

1. Backup current file: `Copy-Item eas.json eas.json.backup`
2. The file should look exactly like this (no hooks field):

```json
{
  "cli": {
    "version": ">= 16.17.4",
    "appVersionSource": "remote"
  },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal"
    },
    "preview": {
      "distribution": "internal",
      "android": {
        "buildType": "apk"
      }
    },
    "production": {
      "autoIncrement": true,
      "env": {
        "EXPO_PUBLIC_ENV": "production"
      },
      "android": {
        "buildType": "apk"
      },
      "ios": {
        "buildConfiguration": "Release"
      }
    },
    "apk": {
      "android": {
        "buildType": "apk"
      }
    }
  },
  "submit": {
    "production": {}
  }
}
```

## Verification

The file should end at line 38 with just the closing brace `}`, and there should be NO `"hooks"` field anywhere in the file.

