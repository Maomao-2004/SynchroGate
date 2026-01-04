// src/navigation/AdminNavigator.js
import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import AdminLayout from './AdminLayout';
import StudentManagement from '../screens/Admin/StudentManagement';
import StudentAttendance from '../screens/Admin/StudentAttendance';
import ParentManagement from '../screens/Admin/ParentManagement';
import StudentProfile from '../screens/Admin/StudentProfile';
import ParentProfile from '../screens/Admin/ParentProfile';
import AttendanceLog from '../screens/Student/AttendanceLog';

const Stack = createNativeStackNavigator();

export default function AdminNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="AdminTabs" component={AdminLayout} />
      <Stack.Screen name="StudentsTab" component={StudentManagement} />
      <Stack.Screen name="StudentAttendance" component={StudentAttendance} />
      <Stack.Screen name="ParentsTab" component={ParentManagement} />
      <Stack.Screen name="StudentProfile" component={StudentProfile} />
      <Stack.Screen name="ParentProfile" component={ParentProfile} />
      <Stack.Screen name="AttendanceLog" component={AttendanceLog} />
    </Stack.Navigator>
  );
}
