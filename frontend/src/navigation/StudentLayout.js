import React from 'react';
import { View } from 'react-native';
import StudentTopHeader from '../screens/Student/StudentTopHeader';
import StudentTabNavigator from './StudentTabNavigator';

export default function StudentLayout() {
  return (
    <View style={{ flex: 1, backgroundColor: '#f7f9fc' }}>
      <StudentTopHeader />
      <View style={{ flex: 1 }}>
        <StudentTabNavigator />
      </View>
    </View>
  );
}


