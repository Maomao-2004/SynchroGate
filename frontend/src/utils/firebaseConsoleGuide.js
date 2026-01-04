// Firebase Console Configuration Guide
export const firebaseConsoleGuide = () => {
  console.log('🔧 FIREBASE CONSOLE CONFIGURATION GUIDE');
  console.log('=======================================');
  
  const steps = [
    {
      title: '1. CHECK EMAIL TEMPLATES',
      url: 'https://console.firebase.google.com/project/guardientry-database/authentication/templates',
      instructions: [
        'Go to Authentication → Templates',
        'Click "Password reset" template',
        'Verify template is ENABLED',
        'Check sender: noreply@guardientry-database.firebaseapp.com',
        'Verify subject: Reset your password for %APP_NAME%',
        'Check message contains: %LINK% (not hardcoded URL)',
        'Save changes if modified'
      ]
    },
    {
      title: '2. CHECK AUTHORIZED DOMAINS',
      url: 'https://console.firebase.google.com/project/guardientry-database/authentication/settings',
      instructions: [
        'Go to Authentication → Settings',
        'Scroll to "Authorized domains"',
        'Ensure guardientry-database.firebaseapp.com is listed',
        'Add localhost for development',
        'Add your production domain if you have one'
      ]
    },
    {
      title: '3. CHECK EMAIL QUOTAS',
      url: 'https://console.firebase.google.com/project/guardientry-database/usage',
      instructions: [
        'Go to Usage → Authentication',
        'Check "Email" section',
        'Free tier: 100 emails/day',
        'If quota exceeded, upgrade plan',
        'Wait for daily reset if needed'
      ]
    },
    {
      title: '4. CHECK USERS',
      url: 'https://console.firebase.google.com/project/guardientry-database/authentication/users',
      instructions: [
        'Go to Authentication → Users',
        'Check if your email exists',
        'If not, add user manually',
        'Verify user is not disabled'
      ]
    },
    {
      title: '5. TEST WITH DIFFERENT EMAIL',
      instructions: [
        'Try with a different email address',
        'Use Gmail, Yahoo, or Outlook',
        'Check if issue is email-specific',
        'Test with a newly created email'
      ]
    }
  ];
  
  steps.forEach((step, index) => {
    console.log(`\n${step.title}`);
    console.log('='.repeat(step.title.length));
    if (step.url) {
      console.log(`URL: ${step.url}`);
    }
    step.instructions.forEach((instruction, i) => {
      console.log(`${i + 1}. ${instruction}`);
    });
  });
  
  console.log('\n🔍 TROUBLESHOOTING CHECKLIST:');
  console.log('• Check spam/junk folder in Gmail');
  console.log('• Look for sender: noreply@guardientry-database.firebaseapp.com');
  console.log('• Try with different email provider');
  console.log('• Check Firebase Console for any error messages');
  console.log('• Verify internet connection');
  console.log('• Try from different network');
  
  return {
    steps,
    troubleshooting: [
      'Check spam/junk folder',
      'Verify sender email',
      'Try different email provider',
      'Check Firebase Console errors',
      'Verify internet connection'
    ]
  };
};

export const createTestUser = async (email, password = 'testpassword123') => {
  console.log('👤 CREATING TEST USER');
  console.log('=====================');
  console.log('📧 Email:', email);
  console.log('🔑 Password:', password);
  
  try {
    const { createUserWithEmailAndPassword } = await import('firebase/auth');
    const { auth } = await import('./firebaseConfig');
    
    console.log('Creating user in Firebase Auth...');
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;
    
    console.log('✅ User created successfully!');
    console.log('UID:', user.uid);
    console.log('Email:', user.email);
    console.log('Email verified:', user.emailVerified);
    
    return {
      success: true,
      uid: user.uid,
      email: user.email,
      message: 'User created successfully'
    };
    
  } catch (error) {
    console.error('❌ User creation failed:', error);
    
    let errorMessage = 'Failed to create user';
    if (error.code === 'auth/email-already-in-use') {
      errorMessage = 'Email already exists - this is good!';
    } else if (error.code === 'auth/invalid-email') {
      errorMessage = 'Invalid email format';
    } else if (error.code === 'auth/weak-password') {
      errorMessage = 'Password too weak';
    }
    
    return {
      success: false,
      error: errorMessage,
      code: error.code
    };
  }
};

// Make functions available globally for testing
if (typeof window !== 'undefined') {
  window.firebaseConsoleGuide = firebaseConsoleGuide;
  window.createTestUser = createTestUser;
}
