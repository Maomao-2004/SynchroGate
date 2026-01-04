import React from 'react';
import { Dimensions, PixelRatio, Platform } from 'react-native';

// Get screen dimensions
const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// Screen breakpoints for comprehensive responsive design
export const BREAKPOINTS = {
  xs: 320,    // Extra small phones
  sm: 375,    // Small phones
  md: 414,    // Medium phones
  lg: 768,    // Tablets
  xl: 1024,   // Large tablets
  xxl: 1200,  // Desktop
};

// Device orientation
export const isLandscape = () => SCREEN_WIDTH > SCREEN_HEIGHT;
export const isPortrait = () => SCREEN_HEIGHT > SCREEN_WIDTH;

// Enhanced device type detection
export const getDeviceType = () => {
  if (SCREEN_WIDTH < BREAKPOINTS.sm) return 'xs';
  if (SCREEN_WIDTH < BREAKPOINTS.md) return 'sm';
  if (SCREEN_WIDTH < BREAKPOINTS.lg) return 'md';
  if (SCREEN_WIDTH < BREAKPOINTS.xl) return 'lg';
  if (SCREEN_WIDTH < BREAKPOINTS.xxl) return 'xl';
  return 'xxl';
};

// Legacy device type detection (for backward compatibility)
export const isTablet = () => SCREEN_WIDTH >= BREAKPOINTS.lg;
export const isSmallDevice = () => SCREEN_WIDTH < BREAKPOINTS.sm;
export const isLargeDevice = () => SCREEN_WIDTH >= BREAKPOINTS.md;

// Responsive width and height functions
export const wp = (percentage) => {
  const value = (percentage * SCREEN_WIDTH) / 100;
  return Math.round(PixelRatio.roundToNearestPixel(value));
};

export const hp = (percentage) => {
  const value = (percentage * SCREEN_HEIGHT) / 100;
  return Math.round(PixelRatio.roundToNearestPixel(value));
};

// Responsive font size
export const RFPercentage = (percent) => {
  const heightPercent = (percent * SCREEN_HEIGHT) / 100;
  return PixelRatio.roundToNearestPixel(heightPercent);
};

// Enhanced responsive font size with breakpoint scaling
export const RFValue = (fontSize, standardScreenHeight = 812) => {
  const deviceType = getDeviceType();
  const scaleFactors = {
    xs: 0.8,
    sm: 0.9,
    md: 1.0,
    lg: 1.1,
    xl: 1.2,
    xxl: 1.3,
  };
  
  const scaleFactor = scaleFactors[deviceType] || 1.0;
  const heightPercent = (fontSize * SCREEN_HEIGHT * scaleFactor) / standardScreenHeight;
  return Math.round(PixelRatio.roundToNearestPixel(heightPercent));
};

// Responsive value based on breakpoints
export const getResponsiveValue = (values) => {
  const deviceType = getDeviceType();
  return values[deviceType] || values.md || values.lg || Object.values(values)[0];
};

// Responsive dimensions with breakpoint awareness
export const getResponsiveDimensions = () => {
  const deviceType = getDeviceType();
  const isLandscapeMode = isLandscape();
  
  return {
    screenWidth: SCREEN_WIDTH,
    screenHeight: SCREEN_HEIGHT,
    deviceType,
    isLandscape: isLandscapeMode,
    isPortrait: !isLandscapeMode,
    isTablet: isTablet(),
    isSmallDevice: isSmallDevice(),
    isLargeDevice: isLargeDevice(),
    
    // Responsive avatar sizes
    avatarSmall: getResponsiveValue({
      xs: wp(6), sm: wp(7), md: wp(8), lg: wp(10), xl: wp(12), xxl: wp(14)
    }),
    avatarMedium: getResponsiveValue({
      xs: wp(8), sm: wp(10), md: wp(12), lg: wp(14), xl: wp(16), xxl: wp(18)
    }),
    avatarLarge: getResponsiveValue({
      xs: wp(12), sm: wp(14), md: wp(16), lg: wp(18), xl: wp(20), xxl: wp(22)
    }),
    
    // Responsive icon sizes
    iconSmall: getResponsiveValue({
      xs: wp(3), sm: wp(3.5), md: wp(4), lg: wp(5), xl: wp(6), xxl: wp(7)
    }),
    iconMedium: getResponsiveValue({
      xs: wp(4), sm: wp(5), md: wp(6), lg: wp(7), xl: wp(8), xxl: wp(9)
    }),
    iconLarge: getResponsiveValue({
      xs: wp(6), sm: wp(7), md: wp(8), lg: wp(9), xl: wp(10), xxl: wp(12)
    }),
    
    // Responsive card dimensions
    cardMinHeight: getResponsiveValue({
      xs: hp(10), sm: hp(11), md: hp(12), lg: hp(13), xl: hp(14), xxl: hp(15)
    }),
    cardMaxWidth: getResponsiveValue({
      xs: wp(95), sm: wp(92), md: wp(90), lg: wp(85), xl: wp(80), xxl: wp(75)
    }),
    
    // Responsive input dimensions
    inputHeight: getResponsiveValue({
      xs: hp(5), sm: hp(5.5), md: hp(6), lg: hp(6.5), xl: hp(7), xxl: hp(7.5)
    }),
    inputMinHeight: getResponsiveValue({
      xs: hp(4), sm: hp(4.5), md: hp(5), lg: hp(5.5), xl: hp(6), xxl: hp(6.5)
    }),
    
    // Grid columns based on device type
    gridColumns: getResponsiveValue({
      xs: 1, sm: 1, md: 2, lg: 3, xl: 4, xxl: 5
    }),
    
    // Sidebar width
    sidebarWidth: getResponsiveValue({
      xs: wp(85), sm: wp(80), md: wp(75), lg: wp(70), xl: wp(65), xxl: wp(60)
    }),
  };
};

// Enhanced responsive spacing with breakpoint awareness
export const spacing = {
  xs: getResponsiveValue({
    xs: wp(1), sm: wp(1.5), md: wp(2), lg: wp(2.5), xl: wp(3), xxl: wp(3.5)
  }),
  sm: getResponsiveValue({
    xs: wp(2), sm: wp(2.5), md: wp(3), lg: wp(3.5), xl: wp(4), xxl: wp(4.5)
  }),
  md: getResponsiveValue({
    xs: wp(3), sm: wp(3.5), md: wp(4), lg: wp(4.5), xl: wp(5), xxl: wp(5.5)
  }),
  lg: getResponsiveValue({
    xs: wp(4), sm: wp(5), md: wp(6), lg: wp(7), xl: wp(8), xxl: wp(9)
  }),
  xl: getResponsiveValue({
    xs: wp(6), sm: wp(7), md: wp(8), lg: wp(9), xl: wp(10), xxl: wp(11)
  }),
  xxl: getResponsiveValue({
    xs: wp(8), sm: wp(9), md: wp(10), lg: wp(11), xl: wp(12), xxl: wp(13)
  }),
};

// Enhanced responsive font sizes with breakpoint scaling
export const fontSizes = {
  xs: getResponsiveValue({
    xs: RFValue(8), sm: RFValue(9), md: RFValue(10), lg: RFValue(11), xl: RFValue(12), xxl: RFValue(13)
  }),
  sm: getResponsiveValue({
    xs: RFValue(10), sm: RFValue(11), md: RFValue(12), lg: RFValue(13), xl: RFValue(14), xxl: RFValue(15)
  }),
  md: getResponsiveValue({
    xs: RFValue(12), sm: RFValue(13), md: RFValue(14), lg: RFValue(15), xl: RFValue(16), xxl: RFValue(17)
  }),
  lg: getResponsiveValue({
    xs: RFValue(14), sm: RFValue(15), md: RFValue(16), lg: RFValue(17), xl: RFValue(18), xxl: RFValue(19)
  }),
  xl: getResponsiveValue({
    xs: RFValue(16), sm: RFValue(17), md: RFValue(18), lg: RFValue(19), xl: RFValue(20), xxl: RFValue(21)
  }),
  xxl: getResponsiveValue({
    xs: RFValue(18), sm: RFValue(19), md: RFValue(20), lg: RFValue(21), xl: RFValue(22), xxl: RFValue(23)
  }),
  xxxl: getResponsiveValue({
    xs: RFValue(20), sm: RFValue(22), md: RFValue(24), lg: RFValue(26), xl: RFValue(28), xxl: RFValue(30)
  }),
};

// Enhanced responsive styles with breakpoint awareness
export const responsiveStyles = {
  container: {
    flex: 1,
    paddingHorizontal: getResponsiveValue({
      xs: wp(3), sm: wp(3.5), md: wp(4), lg: wp(4.5), xl: wp(5), xxl: wp(5.5)
    }),
    paddingVertical: getResponsiveValue({
      xs: hp(1.5), sm: hp(1.8), md: hp(2), lg: hp(2.2), xl: hp(2.5), xxl: hp(2.8)
    }),
  },
  
  card: {
    backgroundColor: '#fff',
    borderRadius: getResponsiveValue({
      xs: wp(2.5), sm: wp(3), md: wp(3.5), lg: wp(4), xl: wp(4.5), xxl: wp(5)
    }),
    padding: getResponsiveValue({
      xs: wp(3), sm: wp(3.5), md: wp(4), lg: wp(4.5), xl: wp(5), xxl: wp(5.5)
    }),
    marginVertical: getResponsiveValue({
      xs: hp(0.8), sm: hp(0.9), md: hp(1), lg: hp(1.1), xl: hp(1.2), xxl: hp(1.3)
    }),
    // Web-compatible shadow
    ...(Platform.OS === 'web' ? {
      boxShadow: '0px 2px 3.84px rgba(0, 0, 0, 0.1)',
    } : {
      shadowColor: '#000',
      shadowOffset: {
        width: 0,
        height: 2,
      },
      shadowOpacity: 0.1,
      shadowRadius: 3.84,
      elevation: 5,
    }),
  },
  
  button: {
    backgroundColor: '#2563EB',
    paddingVertical: getResponsiveValue({
      xs: hp(1.2), sm: hp(1.3), md: hp(1.5), lg: hp(1.7), xl: hp(1.9), xxl: hp(2.1)
    }),
    paddingHorizontal: getResponsiveValue({
      xs: wp(5), sm: wp(5.5), md: wp(6), lg: wp(6.5), xl: wp(7), xxl: wp(7.5)
    }),
    borderRadius: getResponsiveValue({
      xs: wp(1.5), sm: wp(1.8), md: wp(2), lg: wp(2.2), xl: wp(2.5), xxl: wp(2.8)
    }),
    alignItems: 'center',
    justifyContent: 'center',
  },
  
  buttonText: {
    color: '#fff',
    fontSize: fontSizes.md,
    fontWeight: '600',
  },
  
  input: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: getResponsiveValue({
      xs: wp(1.5), sm: wp(1.8), md: wp(2), lg: wp(2.2), xl: wp(2.5), xxl: wp(2.8)
    }),
    paddingHorizontal: getResponsiveValue({
      xs: wp(2.5), sm: wp(2.8), md: wp(3), lg: wp(3.2), xl: wp(3.5), xxl: wp(3.8)
    }),
    paddingVertical: getResponsiveValue({
      xs: hp(1.2), sm: hp(1.3), md: hp(1.5), lg: hp(1.7), xl: hp(1.9), xxl: hp(2.1)
    }),
    fontSize: fontSizes.md,
    backgroundColor: '#fff',
  },
  
  title: {
    fontSize: fontSizes.xl,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: getResponsiveValue({
      xs: hp(0.8), sm: hp(0.9), md: hp(1), lg: hp(1.1), xl: hp(1.2), xxl: hp(1.3)
    }),
  },
  
  subtitle: {
    fontSize: fontSizes.md,
    color: '#6B7280',
    marginBottom: getResponsiveValue({
      xs: hp(1.5), sm: hp(1.7), md: hp(2), lg: hp(2.2), xl: hp(2.5), xxl: hp(2.8)
    }),
  },
  
  // Enhanced modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: getResponsiveValue({
      xs: wp(4), sm: wp(4.5), md: wp(5), lg: wp(5.5), xl: wp(6), xxl: wp(6.5)
    }),
  },
  
  modalCard: {
    backgroundColor: '#fff',
    borderRadius: getResponsiveValue({
      xs: wp(3), sm: wp(3.5), md: wp(4), lg: wp(4.5), xl: wp(5), xxl: wp(5.5)
    }),
    padding: getResponsiveValue({
      xs: wp(4), sm: wp(5), md: wp(6), lg: wp(7), xl: wp(8), xxl: wp(9)
    }),
    width: '100%',
    maxWidth: getResponsiveValue({
      xs: wp(95), sm: wp(92), md: wp(90), lg: wp(85), xl: wp(80), xxl: wp(75)
    }),
    alignItems: 'center',
  },
  
  // Enhanced header styles
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: getResponsiveValue({
      xs: wp(3), sm: wp(3.5), md: wp(4), lg: wp(4.5), xl: wp(5), xxl: wp(5.5)
    }),
    paddingVertical: getResponsiveValue({
      xs: hp(1.5), sm: hp(1.8), md: hp(2), lg: hp(2.2), xl: hp(2.5), xxl: hp(2.8)
    }),
    backgroundColor: '#004f89',
    paddingTop: getResponsiveValue({
      xs: hp(5), sm: hp(5.5), md: hp(6), lg: hp(6.5), xl: hp(7), xxl: hp(7.5)
    }), // Account for status bar
  },
  
  headerTitle: {
    fontSize: fontSizes.lg,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  
  // Enhanced sidebar styles
  sidebar: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    right: 0,
    width: getResponsiveValue({
      xs: wp(85), sm: wp(80), md: wp(75), lg: wp(70), xl: wp(65), xxl: wp(60)
    }),
    maxWidth: getResponsiveValue({
      xs: 350, sm: 400, md: 450, lg: 500, xl: 550, xxl: 600
    }),
    backgroundColor: '#fff',
    padding: getResponsiveValue({
      xs: wp(4), sm: wp(4.5), md: wp(5), lg: wp(5.5), xl: wp(6), xxl: wp(6.5)
    }),
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowOffset: { width: 5, height: 0 },
    shadowRadius: 10,
    elevation: 10,
    borderTopLeftRadius: getResponsiveValue({
      xs: wp(3), sm: wp(3.5), md: wp(4), lg: wp(4.5), xl: wp(5), xxl: wp(5.5)
    }),
  },
  
  // Enhanced grid styles for responsive layouts
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  
  gridItem: {
    width: getResponsiveValue({
      xs: '100%', sm: '100%', md: '48%', lg: '31%', xl: '23%', xxl: '19%'
    }),
    marginBottom: getResponsiveValue({
      xs: hp(1.5), sm: hp(1.7), md: hp(2), lg: hp(2.2), xl: hp(2.5), xxl: hp(2.8)
    }),
  },
  
  gridItemSmall: {
    width: getResponsiveValue({
      xs: '100%', sm: '100%', md: '48%', lg: '31%', xl: '23%', xxl: '19%'
    }),
    marginBottom: getResponsiveValue({
      xs: hp(1.5), sm: hp(1.7), md: hp(2), lg: hp(2.2), xl: hp(2.5), xxl: hp(2.8)
    }),
  },
};

// New comprehensive responsive utilities
export const getResponsiveGridStyles = (columns = null) => {
  const deviceType = getDeviceType();
  const defaultColumns = getResponsiveValue({
    xs: 1, sm: 1, md: 2, lg: 3, xl: 4, xxl: 5
  });
  
  const gridColumns = columns || defaultColumns;
  const itemWidth = `${100 / gridColumns}%`;
  
  return {
    container: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'space-between',
    },
    item: {
      width: itemWidth,
      marginBottom: getResponsiveValue({
        xs: hp(1.5), sm: hp(1.7), md: hp(2), lg: hp(2.2), xl: hp(2.5), xxl: hp(2.8)
      }),
    },
  };
};

// Responsive navigation styles
export const getResponsiveNavigationStyles = () => {
  return {
    tabBar: {
      height: getResponsiveValue({
        xs: hp(7), sm: hp(7.5), md: hp(8), lg: hp(8.5), xl: hp(9), xxl: hp(9.5)
      }),
      paddingHorizontal: getResponsiveValue({
        xs: wp(2), sm: wp(2.5), md: wp(3), lg: wp(3.5), xl: wp(4), xxl: wp(4.5)
      }),
    },
    tabBarLabel: {
      fontSize: getResponsiveValue({
        xs: fontSizes.xs, sm: fontSizes.sm, md: fontSizes.md, lg: fontSizes.lg, xl: fontSizes.xl, xxl: fontSizes.xxl
      }),
    },
  };
};

// Responsive form styles
export const getResponsiveFormStyles = () => {
  return {
    formContainer: {
      padding: getResponsiveValue({
        xs: wp(3), sm: wp(3.5), md: wp(4), lg: wp(4.5), xl: wp(5), xxl: wp(5.5)
      }),
    },
    formGroup: {
      marginBottom: getResponsiveValue({
        xs: hp(1.5), sm: hp(1.7), md: hp(2), lg: hp(2.2), xl: hp(2.5), xxl: hp(2.8)
      }),
    },
    formLabel: {
      fontSize: fontSizes.md,
      fontWeight: '600',
      marginBottom: getResponsiveValue({
        xs: hp(0.5), sm: hp(0.6), md: hp(0.7), lg: hp(0.8), xl: hp(0.9), xxl: hp(1)
      }),
    },
  };
};

// Enhanced responsive hook for dynamic updates
export const useResponsiveDimensions = () => {
  const [dimensions, setDimensions] = React.useState(() => getResponsiveDimensions());
  
  React.useEffect(() => {
    const subscription = Dimensions.addEventListener('change', ({ window }) => {
      setDimensions(getResponsiveDimensions());
    });
    
    return () => subscription?.remove();
  }, []);
  
  return dimensions;
};

// Responsive breakpoint utilities
export const useBreakpoint = () => {
  const deviceType = getDeviceType();
  
  return {
    isXs: deviceType === 'xs',
    isSm: deviceType === 'sm',
    isMd: deviceType === 'md',
    isLg: deviceType === 'lg',
    isXl: deviceType === 'xl',
    isXxl: deviceType === 'xxl',
    isMobile: ['xs', 'sm', 'md'].includes(deviceType),
    isTablet: ['lg', 'xl'].includes(deviceType),
    isDesktop: deviceType === 'xxl',
  };
};

// Responsive layout utilities
export const getResponsiveLayout = () => {
  const deviceType = getDeviceType();
  const isLandscapeMode = isLandscape();
  
  return {
    columns: getResponsiveValue({
      xs: 1, sm: 1, md: 2, lg: 3, xl: 4, xxl: 5
    }),
    sidebarWidth: getResponsiveValue({
      xs: wp(85), sm: wp(80), md: wp(75), lg: wp(70), xl: wp(65), xxl: wp(60)
    }),
    isLandscape: isLandscapeMode,
    isPortrait: !isLandscapeMode,
    deviceType,
  };
};

export default {
  // Core responsive functions
  wp,
  hp,
  RFPercentage,
  RFValue,
  
  // Device detection
  isTablet,
  isSmallDevice,
  isLargeDevice,
  isLandscape,
  isPortrait,
  getDeviceType,
  
  // Breakpoints
  BREAKPOINTS,
  
  // Responsive utilities
  getResponsiveValue,
  getResponsiveDimensions,
  getResponsiveGridStyles,
  getResponsiveNavigationStyles,
  getResponsiveFormStyles,
  getResponsiveLayout,
  useResponsiveDimensions,
  useBreakpoint,
  
  // Design tokens
  spacing,
  fontSizes,
  responsiveStyles,
};
