import { StatusBar, Platform } from 'react-native';

export const configureFullScreen = () => {
  if (Platform.OS === 'android') {
    // Ensure status bar is visible, non-translucent, with dark mode (light icons on dark bg)
    StatusBar.setHidden(false, 'fade');
    StatusBar.setTranslucent(false);
    StatusBar.setBackgroundColor('#000000', true);
    StatusBar.setBarStyle('light-content', true);
  }
};

export const getStatusBarHeight = () => {
  if (Platform.OS === 'android') {
    return StatusBar.currentHeight || 0;
  }
  return 0;
};

export const hideStatusBar = () => {
  if (Platform.OS === 'android') {
    StatusBar.setHidden(true, 'fade');
  }
};

export const showStatusBar = () => {
  if (Platform.OS === 'android') {
    StatusBar.setHidden(false, 'fade');
  }
};
