import React, { useEffect } from 'react';
import { StatusBar, Platform } from 'react-native';
import { configureFullScreen } from '../utils/fullScreenUtils';

const FullScreenWrapper = ({ children, statusBarStyle = 'dark-content' }) => {
  useEffect(() => {
    if (Platform.OS === 'android') {
      configureFullScreen();
    }
  }, []);

  return (
    <>
      <StatusBar 
        barStyle="light-content"
        backgroundColor="#000000"
        translucent={false}
        hidden={false}
      />
      {children}
    </>
  );
};

export default FullScreenWrapper;
