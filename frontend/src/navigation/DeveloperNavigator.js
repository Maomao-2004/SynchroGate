// src/navigation/DeveloperNavigator.js
import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import DeveloperTabNavigator from './DeveloperTabNavigator';

const Stack = createNativeStackNavigator();

export default function DeveloperNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="DeveloperTabs" component={DeveloperTabNavigator} />
    </Stack.Navigator>
  );
}
