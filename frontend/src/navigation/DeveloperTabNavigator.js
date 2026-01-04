// src/navigation/DeveloperTabNavigator.js
import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import Developer from '../screens/Admin/Developer';

const Stack = createNativeStackNavigator();

export default function DeveloperTabNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Developer" component={Developer} />
    </Stack.Navigator>
  );
}




