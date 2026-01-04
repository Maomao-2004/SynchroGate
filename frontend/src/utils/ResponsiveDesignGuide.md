# Responsive Design Guide

This guide explains how to implement responsive design across all screen resolutions in your React Native app.

## Overview

The responsive design system provides:
- **6 Breakpoints**: xs (320px), sm (375px), md (414px), lg (768px), xl (1024px), xxl (1200px)
- **Device Type Detection**: Automatic detection of device type and orientation
- **Responsive Utilities**: Functions for width, height, font sizes, and spacing
- **Breakpoint-Aware Components**: Components that adapt to different screen sizes

## Core Functions

### Basic Responsive Functions
```javascript
import { wp, hp, fontSizes, getResponsiveDimensions } from '../utils/responsive';

// Width percentage (based on screen width)
const width = wp(50); // 50% of screen width

// Height percentage (based on screen height)  
const height = hp(25); // 25% of screen height

// Responsive font sizes
const fontSize = fontSizes.lg; // Automatically scales based on device

// Get all responsive dimensions
const dimensions = getResponsiveDimensions();
```

### Device Detection
```javascript
import { getDeviceType, useBreakpoint, isTablet, isLandscape } from '../utils/responsive';

// Get current device type
const deviceType = getDeviceType(); // 'xs', 'sm', 'md', 'lg', 'xl', 'xxl'

// Use breakpoint hook for conditional rendering
const breakpoint = useBreakpoint();
if (breakpoint.isMobile) {
  // Mobile-specific code
}

// Legacy device detection
const isTabletDevice = isTablet();
const isLandscapeMode = isLandscape();
```

### Responsive Values
```javascript
import { getResponsiveValue } from '../utils/responsive';

// Define different values for different breakpoints
const padding = getResponsiveValue({
  xs: wp(3),    // Small phones
  sm: wp(3.5),  // Medium phones
  md: wp(4),    // Large phones
  lg: wp(4.5),  // Tablets
  xl: wp(5),    // Large tablets
  xxl: wp(5.5)  // Desktop
});
```

## Component Patterns

### Basic Responsive Component
```javascript
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { wp, hp, fontSizes, getResponsiveDimensions } from '../utils/responsive';

const MyComponent = () => {
  const dimensions = getResponsiveDimensions();
  
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Responsive Title</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: wp(4),
    marginVertical: hp(2),
  },
  title: {
    fontSize: fontSizes.xl,
    fontWeight: 'bold',
  },
});
```

### Breakpoint-Aware Component
```javascript
import React from 'react';
import { View, Text } from 'react-native';
import { useBreakpoint, getResponsiveValue } from '../utils/responsive';

const ResponsiveComponent = () => {
  const breakpoint = useBreakpoint();
  
  const containerStyle = {
    flexDirection: breakpoint.isMobile ? 'column' : 'row',
    padding: getResponsiveValue({
      xs: wp(3), sm: wp(3.5), md: wp(4), lg: wp(4.5), xl: wp(5)
    }),
  };
  
  return (
    <View style={containerStyle}>
      <Text>Content adapts to screen size</Text>
    </View>
  );
};
```

### Grid Layout Component
```javascript
import React from 'react';
import { View, FlatList } from 'react-native';
import { getResponsiveGridStyles } from '../utils/responsive';

const GridComponent = ({ data }) => {
  const gridStyles = getResponsiveGridStyles(); // Auto-detects columns
  
  const renderItem = ({ item }) => (
    <View style={gridStyles.item}>
      {/* Grid item content */}
    </View>
  );
  
  return (
    <View style={gridStyles.container}>
      <FlatList
        data={data}
        renderItem={renderItem}
        numColumns={2} // Will be overridden by responsive grid
      />
    </View>
  );
};
```

## Style Patterns

### Responsive Styles Object
```javascript
import { responsiveStyles } from '../utils/responsive';

// Use pre-defined responsive styles
const styles = StyleSheet.create({
  container: responsiveStyles.container,
  card: responsiveStyles.card,
  button: responsiveStyles.button,
});
```

### Custom Responsive Styles
```javascript
const styles = StyleSheet.create({
  customCard: {
    backgroundColor: '#fff',
    borderRadius: wp(4),
    padding: wp(4),
    marginVertical: hp(1),
    // Responsive shadow
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 8,
    elevation: 5,
  },
});
```

## Navigation Responsive Patterns

### Tab Navigator
```javascript
import { getResponsiveNavigationStyles } from '../utils/responsive';

const navigationStyles = getResponsiveNavigationStyles();

const TabNavigator = () => (
  <Tab.Navigator
    screenOptions={{
      tabBarStyle: navigationStyles.tabBar,
      tabBarLabelStyle: navigationStyles.tabBarLabel,
    }}
  >
    {/* Tab screens */}
  </Tab.Navigator>
);
```

## Form Responsive Patterns

### Form Components
```javascript
import { getResponsiveFormStyles } from '../utils/responsive';

const FormComponent = () => {
  const formStyles = getResponsiveFormStyles();
  
  return (
    <View style={formStyles.formContainer}>
      <View style={formStyles.formGroup}>
        <Text style={formStyles.formLabel}>Label</Text>
        <TextInput style={styles.input} />
      </View>
    </View>
  );
};
```

## Best Practices

### 1. Always Use Responsive Units
```javascript
// ❌ Don't use fixed values
const styles = {
  padding: 16,
  fontSize: 14,
  width: 200,
};

// ✅ Use responsive units
const styles = {
  padding: wp(4),
  fontSize: fontSizes.md,
  width: wp(50),
};
```

### 2. Use Breakpoint-Aware Layouts
```javascript
// ❌ Don't assume device type
const isTablet = Dimensions.get('window').width > 768;

// ✅ Use responsive utilities
const breakpoint = useBreakpoint();
if (breakpoint.isTablet) {
  // Tablet-specific code
}
```

### 3. Leverage Responsive Values
```javascript
// ❌ Don't use fixed breakpoints
const padding = width < 375 ? 12 : 16;

// ✅ Use responsive value system
const padding = getResponsiveValue({
  xs: wp(3), sm: wp(3.5), md: wp(4), lg: wp(4.5), xl: wp(5)
});
```

### 4. Test Across All Breakpoints
- **xs (320px)**: iPhone SE, small Android phones
- **sm (375px)**: iPhone 12/13 mini, standard Android phones
- **md (414px)**: iPhone 12/13/14, larger Android phones
- **lg (768px)**: iPad mini, small tablets
- **xl (1024px)**: iPad, large tablets
- **xxl (1200px)**: iPad Pro, desktop

## Migration Guide

### Converting Existing Components

1. **Add responsive imports**:
```javascript
import { wp, hp, fontSizes, getResponsiveDimensions } from '../utils/responsive';
```

2. **Replace fixed values**:
```javascript
// Before
padding: 16,
fontSize: 14,
width: 200,

// After  
padding: wp(4),
fontSize: fontSizes.md,
width: wp(50),
```

3. **Add responsive dimensions**:
```javascript
const dimensions = getResponsiveDimensions();
```

4. **Use breakpoint detection**:
```javascript
const breakpoint = useBreakpoint();
if (breakpoint.isMobile) {
  // Mobile-specific styles
}
```

## Performance Considerations

- **Memoize responsive calculations** in components that re-render frequently
- **Use StyleSheet.create()** for all styles to optimize performance
- **Avoid inline responsive calculations** in render methods
- **Pre-calculate responsive values** when possible

## Troubleshooting

### Common Issues

1. **Styles not updating on orientation change**:
   - Use `useResponsiveDimensions()` hook for dynamic updates
   - Ensure components re-render on dimension changes

2. **Inconsistent sizing across devices**:
   - Always use `wp()` and `hp()` functions
   - Avoid mixing fixed and responsive units

3. **Performance issues**:
   - Memoize expensive responsive calculations
   - Use `StyleSheet.create()` for all styles

This responsive design system ensures your app looks great and functions properly across all screen sizes and orientations.
