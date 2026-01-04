// src/navigation/ParentNavigator.js
import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import ParentLayout from './ParentLayout';

const Stack = createNativeStackNavigator();

export default function ParentNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen 
        name="ParentMain" 
        component={ParentLayout} 
      />
    </Stack.Navigator>
  );
}