@echo off
REM Production Build Script for SyncroGate (Windows)
REM This script helps build the app for production

echo.
echo ========================================
echo   SyncroGate Production Build Script
echo ========================================
echo.

REM Check if EAS CLI is installed
where eas >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] EAS CLI is not installed.
    echo [INFO] Installing EAS CLI...
    call npm install -g eas-cli
)

REM Check if user is logged in
echo [INFO] Checking EAS login status...
eas whoami >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [WARNING] Not logged in to EAS. Please login:
    call eas login
)

echo.
echo Select build platform:
echo 1) Android (APK)
echo 2) iOS
echo 3) Both platforms
echo 4) Preview build (Android)
set /p choice="Enter choice [1-4]: "

if "%choice%"=="1" (
    echo [INFO] Building Android APK for production...
    call eas build --platform android --profile production
) else if "%choice%"=="2" (
    echo [INFO] Building iOS for production...
    call eas build --platform ios --profile production
) else if "%choice%"=="3" (
    echo [INFO] Building for both platforms...
    call eas build --platform all --profile production
) else if "%choice%"=="4" (
    echo [INFO] Building Android preview build...
    call eas build --platform android --profile preview
) else (
    echo [ERROR] Invalid choice
    exit /b 1
)

echo.
echo [SUCCESS] Build process started!
echo [INFO] Monitor your build at: https://expo.dev
echo.
echo [TIPS]
echo    - Builds typically take 10-20 minutes
echo    - You'll receive a download link when complete
echo    - Check build status: eas build:list
echo.

pause









