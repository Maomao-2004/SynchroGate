// src/navigation/StudentNavigator.js
import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import StudentLayout from './StudentLayout';

const Stack = createNativeStackNavigator();

export default function StudentNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen 
        name="StudentMain" 
        component={StudentLayout} 
      />
    </Stack.Navigator>
  );
}
