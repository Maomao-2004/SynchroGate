// Comprehensive Firebase Diagnostic Tool
import { auth, db } from './firebaseConfig';

export const runCompleteDiagnostic = async (email) => {
  console.log('🔍 COMPLETE FIREBASE DIAGNOSTIC');
  console.log('===============================');
  console.log('📧 Testing email:', email);
  
  const results = {
    timestamp: new Date().toISOString(),
    email: email,
    tests: {}
  };
  
  try {
    // 1. Firebase App Configuration
    console.log('\n1️⃣ FIREBASE APP CONFIGURATION:');
    results.tests.appConfig = {
      appName: auth.app.name,
      projectId: auth.app.options.projectId,
      authDomain: auth.app.options.authDomain,
      apiKey: auth.app.options.apiKey ? 'Present' : 'Missing',
      storageBucket: auth.app.options.storageBucket,
      messagingSenderId: auth.app.options.messagingSenderId,
      appId: auth.app.options.appId
    };
    
    console.log('✅ App Configuration:', results.tests.appConfig);
    
    // 2. Network Connectivity
    console.log('\n2️⃣ NETWORK CONNECTIVITY:');
    try {
      const response = await fetch('https://www.google.com', { method: 'HEAD' });
      results.tests.network = { status: 'Connected', statusCode: response.status };
      console.log('✅ Network: Connected');
    } catch (error) {
      results.tests.network = { status: 'Failed', error: error.message };
      console.error('❌ Network: Failed', error.message);
    }
    
    // 3. Firebase Auth Service
    console.log('\n3️⃣ FIREBASE AUTH SERVICE:');
    results.tests.authService = {
      authInstance: !!auth,
      authConfig: !!auth.config,
      currentUser: auth.currentUser ? 'Authenticated' : 'Not authenticated',
      authApp: !!auth.app
    };
    console.log('✅ Auth Service:', results.tests.authService);
    
    // 4. Test Auth Functions Import
    console.log('\n4️⃣ AUTH FUNCTIONS IMPORT:');
    try {
      const { sendPasswordResetEmail } = await import('firebase/auth');
      results.tests.authFunctions = { status: 'Available', function: 'sendPasswordResetEmail' };
      console.log('✅ Auth Functions: Available');
    } catch (error) {
      results.tests.authFunctions = { status: 'Failed', error: error.message };
      console.error('❌ Auth Functions: Failed', error.message);
    }
    
    // 5. Direct Email Send Test
    console.log('\n5️⃣ DIRECT EMAIL SEND TEST:');
    try {
      const { sendPasswordResetEmail } = await import('firebase/auth');
      
      console.log('📧 Attempting to send password reset email...');
      await sendPasswordResetEmail(auth, email);
      
      results.tests.emailSend = { status: 'Success', message: 'Email sent successfully' };
      console.log('✅ Email Send: SUCCESS!');
      console.log('📬 Check your email inbox and spam folder');
      
    } catch (error) {
      results.tests.emailSend = { 
        status: 'Failed', 
        error: error.message, 
        code: error.code,
        stack: error.stack
      };
      console.error('❌ Email Send: FAILED');
      console.error('Error Code:', error.code);
      console.error('Error Message:', error.message);
      
      // Detailed error analysis
      let analysis = '';
      switch (error.code) {
        case 'auth/user-not-found':
          analysis = 'User does not exist in Firebase Auth. Register the user first.';
          break;
        case 'auth/invalid-email':
          analysis = 'Email format is invalid.';
          break;
        case 'auth/too-many-requests':
          analysis = 'Too many requests. Wait before trying again.';
          break;
        case 'auth/network-request-failed':
          analysis = 'Network error. Check internet connection.';
          break;
        case 'auth/quota-exceeded':
          analysis = 'Email quota exceeded. Check Firebase Console → Usage.';
          break;
        case 'auth/invalid-api-key':
          analysis = 'Invalid API key. Check Firebase configuration.';
          break;
        case 'auth/missing-android-pkg-name':
          analysis = 'Missing Android package name in Firebase config.';
          break;
        case 'auth/missing-ios-bundle-id':
          analysis = 'Missing iOS bundle ID in Firebase config.';
          break;
        default:
          analysis = 'Unknown error. Check Firebase Console for details.';
      }
      
      results.tests.emailSend.analysis = analysis;
      console.error('🔍 Analysis:', analysis);
    }
    
    // 6. Firebase Console Links
    console.log('\n6️⃣ FIREBASE CONSOLE LINKS:');
    const consoleLinks = {
      project: 'https://console.firebase.google.com/project/guardientry-database',
      auth: 'https://console.firebase.google.com/project/guardientry-database/authentication',
      users: 'https://console.firebase.google.com/project/guardientry-database/authentication/users',
      templates: 'https://console.firebase.google.com/project/guardientry-database/authentication/templates',
      settings: 'https://console.firebase.google.com/project/guardientry-database/authentication/settings',
      usage: 'https://console.firebase.google.com/project/guardientry-database/usage'
    };
    
    results.tests.consoleLinks = consoleLinks;
    console.log('📋 Console Links:', consoleLinks);
    
    // 7. Recommendations
    console.log('\n7️⃣ RECOMMENDATIONS:');
    const recommendations = [];
    
    if (results.tests.emailSend.status === 'Failed') {
      if (results.tests.emailSend.code === 'auth/user-not-found') {
        recommendations.push('1. Register the user in Firebase Console → Authentication → Users');
        recommendations.push('2. Or use a different email that is already registered');
      } else if (results.tests.emailSend.code === 'auth/quota-exceeded') {
        recommendations.push('1. Check Firebase Console → Usage for email quotas');
        recommendations.push('2. Upgrade Firebase plan if needed');
        recommendations.push('3. Wait for quota reset (daily for free tier)');
      } else if (results.tests.emailSend.code === 'auth/network-request-failed') {
        recommendations.push('1. Check internet connection');
        recommendations.push('2. Check firewall settings');
        recommendations.push('3. Try from different network');
      } else {
        recommendations.push('1. Check Firebase Console → Authentication → Settings');
        recommendations.push('2. Verify email templates are enabled');
        recommendations.push('3. Check authorized domains');
        recommendations.push('4. Contact Firebase support if issue persists');
      }
    } else {
      recommendations.push('1. Check email inbox and spam folder');
      recommendations.push('2. Wait a few minutes for email delivery');
      recommendations.push('3. Check email provider (Gmail) settings');
    }
    
    results.recommendations = recommendations;
    console.log('💡 Recommendations:');
    recommendations.forEach((rec, index) => console.log(`   ${rec}`));
    
    // 8. Summary
    console.log('\n8️⃣ DIAGNOSTIC SUMMARY:');
    const summary = {
      overall: results.tests.emailSend.status === 'Success' ? 'SUCCESS' : 'FAILED',
      email: email,
      timestamp: results.timestamp,
      nextSteps: recommendations
    };
    
    results.summary = summary;
    console.log('📊 Summary:', summary);
    
    return results;
    
  } catch (error) {
    console.error('❌ Diagnostic failed:', error);
    results.error = error.message;
    return results;
  }
};

export const checkFirebaseProjectStatus = () => {
  console.log('🏗️ FIREBASE PROJECT STATUS CHECK');
  console.log('=================================');
  
  const projectInfo = {
    projectId: 'guardientry-database',
    consoleUrl: 'https://console.firebase.google.com/project/guardientry-database',
    authUrl: 'https://console.firebase.google.com/project/guardientry-database/authentication',
    usersUrl: 'https://console.firebase.google.com/project/guardientry-database/authentication/users',
    templatesUrl: 'https://console.firebase.google.com/project/guardientry-database/authentication/templates',
    settingsUrl: 'https://console.firebase.google.com/project/guardientry-database/authentication/settings',
    usageUrl: 'https://console.firebase.google.com/project/guardientry-database/usage',
    billingUrl: 'https://console.firebase.google.com/project/guardientry-database/usage/billing'
  };
  
  console.log('📋 Project Information:', projectInfo);
  
  const checkList = [
    '1. Go to Firebase Console and verify project is active',
    '2. Check Authentication → Settings → Email templates are enabled',
    '3. Verify Authentication → Settings → Authorized domains',
    '4. Check Usage → Authentication for email quotas',
    '5. Verify Billing → Overview for account status',
    '6. Check Authentication → Users for registered users',
    '7. Test email templates in Authentication → Templates'
  ];
  
  console.log('✅ Checklist:');
  checkList.forEach(item => console.log(`   ${item}`));
  
  return {
    projectInfo,
    checkList
  };
};

// Make functions available globally for testing
if (typeof window !== 'undefined') {
  window.runCompleteDiagnostic = runCompleteDiagnostic;
  window.checkFirebaseProjectStatus = checkFirebaseProjectStatus;
}
