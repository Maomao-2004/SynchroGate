import React from 'react';
import { View } from 'react-native';
import AdminTopHeader from '../screens/Admin/AdminTopHeader';
import AdminTabNavigator from './AdminTabNavigator';

export default function AdminLayout() {
  return (
    <View style={{ flex: 1, backgroundColor: '#f7f9fc' }}>
      <AdminTopHeader />
      <View style={{ flex: 1 }}>
        <AdminTabNavigator />
      </View>
    </View>
  );
}







