// Email Delivery Test Utility
import { auth } from './firebaseConfig';
import { sendPasswordResetEmail } from 'firebase/auth';

export const testEmailDelivery = async (email) => {
  console.log('📧 EMAIL DELIVERY TEST');
  console.log('======================');
  console.log('📧 Testing email:', email);
  
  try {
    console.log('1️⃣ Checking Firebase Auth configuration...');
    console.log('Auth instance:', !!auth);
    console.log('Project ID:', auth.app.options.projectId);
    console.log('Auth domain:', auth.app.options.authDomain);
    console.log('API key present:', !!auth.app.options.apiKey);
    
    console.log('2️⃣ Sending password reset email...');
    await sendPasswordResetEmail(auth, email);
    
    console.log('✅ Firebase accepted the request');
    console.log('📧 Email should be sent from: noreply@guardientry-database.firebaseapp.com');
    console.log('📧 Subject: Reset your password for Guardientry');
    console.log('🔗 Reset link format: https://guardientry-database.firebaseapp.com/__/auth/action?mode=resetPassword&oobCode=...');
    
    console.log('\n3️⃣ EMAIL DELIVERY CHECKLIST:');
    console.log('✅ Firebase request successful');
    console.log('📬 Check your email inbox');
    console.log('📬 Check spam/junk folder');
    console.log('📬 Look for sender: noreply@guardientry-database.firebaseapp.com');
    console.log('📬 Subject: Reset your password for Guardientry');
    
    console.log('\n4️⃣ COMMON DELIVERY ISSUES:');
    console.log('• Email might be in spam folder');
    console.log('• Gmail might be blocking Firebase emails');
    console.log('• Firebase email quotas might be exceeded');
    console.log('• Email templates might not be configured');
    console.log('• Custom action URL might be missing');
    
    console.log('\n5️⃣ FIREBASE CONSOLE CHECKS:');
    console.log('• Go to: https://console.firebase.google.com/project/guardientry-database/authentication/templates');
    console.log('• Check if "Password reset" template is enabled');
    console.log('• Verify email template configuration');
    console.log('• Check: https://console.firebase.google.com/project/guardientry-database/usage');
    console.log('• Verify email quotas (free tier: 100 emails/day)');
    
    return {
      success: true,
      message: 'Firebase request successful - check email delivery',
      firebaseAccepted: true,
      emailSent: true,
      deliveryChecklist: [
        'Check inbox',
        'Check spam folder',
        'Look for noreply@guardientry-database.firebaseapp.com',
        'Verify Firebase Console settings',
        'Check email quotas'
      ]
    };
    
  } catch (error) {
    console.error('❌ Firebase request failed:', error);
    
    return {
      success: false,
      message: 'Firebase request failed',
      firebaseAccepted: false,
      emailSent: false,
      error: error.message,
      code: error.code
    };
  }
};

export const checkFirebaseEmailSettings = () => {
  console.log('🔧 FIREBASE EMAIL SETTINGS CHECK');
  console.log('=================================');
  
  const settings = {
    projectId: 'guardientry-database',
    consoleUrl: 'https://console.firebase.google.com/project/guardientry-database',
    authUrl: 'https://console.firebase.google.com/project/guardientry-database/authentication',
    templatesUrl: 'https://console.firebase.google.com/project/guardientry-database/authentication/templates',
    settingsUrl: 'https://console.firebase.google.com/project/guardientry-database/authentication/settings',
    usageUrl: 'https://console.firebase.google.com/project/guardientry-database/usage'
  };
  
  console.log('📋 Firebase Console Links:', settings);
  
  console.log('\n🔍 EMAIL TEMPLATE CONFIGURATION:');
  console.log('1. Go to Authentication → Templates');
  console.log('2. Click "Password reset" template');
  console.log('3. Verify template is enabled');
  console.log('4. Check sender email: noreply@guardientry-database.firebaseapp.com');
  console.log('5. Verify subject: Reset your password for %APP_NAME%');
  console.log('6. Check message contains: %LINK%');
  
  console.log('\n🔍 AUTHORIZED DOMAINS:');
  console.log('1. Go to Authentication → Settings');
  console.log('2. Check "Authorized domains" section');
  console.log('3. Ensure guardientry-database.firebaseapp.com is listed');
  console.log('4. Add localhost for development');
  
  console.log('\n🔍 EMAIL QUOTAS:');
  console.log('1. Go to Usage → Authentication');
  console.log('2. Check email usage');
  console.log('3. Free tier: 100 emails/day');
  console.log('4. Upgrade if quota exceeded');
  
  return settings;
};

// Make functions available globally for testing
if (typeof window !== 'undefined') {
  window.testEmailDelivery = testEmailDelivery;
  window.checkFirebaseEmailSettings = checkFirebaseEmailSettings;
}
