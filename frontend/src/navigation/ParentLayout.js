import React from 'react';
import { View } from 'react-native';
import ParentTopHeader from '../screens/Parent/ParentTopHeader';
import ParentTabNavigator from './ParentTabNavigator';

export default function ParentLayout() {
  return (
    <View style={{ flex: 1, backgroundColor: '#f7f9fc' }}>
      <ParentTopHeader />
      <View style={{ flex: 1 }}>
        <ParentTabNavigator />
      </View>
    </View>
  );
}


