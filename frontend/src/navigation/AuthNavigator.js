import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import SplashScreen from '../screens/Auth/SplashScreen';
import SelectRoleScreen from '../screens/Auth/SelectRoleScreen';
import LoginScreen from '../screens/Auth/LoginScreen';
import RegisterScreen from '../screens/Auth/RegisterScreen';
import MinimalForgotPasswordScreen from '../screens/Auth/MinimalForgotPasswordScreen';

const Stack = createNativeStackNavigator();

const AuthNavigator = () => (
  <Stack.Navigator 
    screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#FFFFFF' } }}
    initialRouteName="Splash"
  >
    {/* Splash screen as first entry */}
    <Stack.Screen name="Splash" component={SplashScreen} />

    {/* Role selection screen */}
    <Stack.Screen name="SelectRole" component={SelectRoleScreen} />

    {/* Login & Register */}
    <Stack.Screen name="Login" component={LoginScreen} />
    <Stack.Screen name="Register" component={RegisterScreen} />
    <Stack.Screen name="ForgotPassword" component={MinimalForgotPasswordScreen} />
  </Stack.Navigator>
);

export default AuthNavigator;
