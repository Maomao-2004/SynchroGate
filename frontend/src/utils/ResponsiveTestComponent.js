import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { 
  wp, 
  hp, 
  fontSizes, 
  getResponsiveDimensions,
  getResponsiveValue,
  getResponsiveGridStyles,
  getResponsiveNavigationStyles,
  getResponsiveFormStyles,
  useBreakpoint,
  BREAKPOINTS
} from './responsive';

// Test component to demonstrate responsive design across all screen sizes
const ResponsiveTestComponent = () => {
  const dimensions = getResponsiveDimensions();
  const breakpoint = useBreakpoint();
  const gridStyles = getResponsiveGridStyles();
  const navigationStyles = getResponsiveNavigationStyles();
  const formStyles = getResponsiveFormStyles();

  const testData = [
    { id: 1, title: 'Card 1', color: '#FF6B6B' },
    { id: 2, title: 'Card 2', color: '#4ECDC4' },
    { id: 3, title: 'Card 3', color: '#45B7D1' },
    { id: 4, title: 'Card 4', color: '#96CEB4' },
    { id: 5, title: 'Card 5', color: '#FFEAA7' },
    { id: 6, title: 'Card 6', color: '#DDA0DD' },
  ];

  return (
    <ScrollView style={styles.container}>
      {/* Device Information */}
      <View style={styles.infoSection}>
        <Text style={styles.sectionTitle}>Device Information</Text>
        <Text style={styles.infoText}>Screen Width: {dimensions.screenWidth}px</Text>
        <Text style={styles.infoText}>Screen Height: {dimensions.screenHeight}px</Text>
        <Text style={styles.infoText}>Device Type: {breakpoint.deviceType}</Text>
        <Text style={styles.infoText}>Is Mobile: {breakpoint.isMobile ? 'Yes' : 'No'}</Text>
        <Text style={styles.infoText}>Is Tablet: {breakpoint.isTablet ? 'Yes' : 'No'}</Text>
        <Text style={styles.infoText}>Is Landscape: {dimensions.isLandscape ? 'Yes' : 'No'}</Text>
      </View>

      {/* Responsive Typography */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Responsive Typography</Text>
        <Text style={[styles.text, { fontSize: fontSizes.xs }]}>Extra Small Text (xs)</Text>
        <Text style={[styles.text, { fontSize: fontSizes.sm }]}>Small Text (sm)</Text>
        <Text style={[styles.text, { fontSize: fontSizes.md }]}>Medium Text (md)</Text>
        <Text style={[styles.text, { fontSize: fontSizes.lg }]}>Large Text (lg)</Text>
        <Text style={[styles.text, { fontSize: fontSizes.xl }]}>Extra Large Text (xl)</Text>
        <Text style={[styles.text, { fontSize: fontSizes.xxl }]}>XX Large Text (xxl)</Text>
      </View>

      {/* Responsive Spacing */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Responsive Spacing</Text>
        <View style={styles.spacingDemo}>
          <View style={[styles.spacingBox, { margin: wp(1) }]}>
            <Text style={styles.spacingText}>XS</Text>
          </View>
          <View style={[styles.spacingBox, { margin: wp(2) }]}>
            <Text style={styles.spacingText}>SM</Text>
          </View>
          <View style={[styles.spacingBox, { margin: wp(3) }]}>
            <Text style={styles.spacingText}>MD</Text>
          </View>
          <View style={[styles.spacingBox, { margin: wp(4) }]}>
            <Text style={styles.spacingText}>LG</Text>
          </View>
        </View>
      </View>

      {/* Responsive Grid */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Responsive Grid Layout</Text>
        <View style={gridStyles.container}>
          {testData.map((item) => (
            <View key={item.id} style={[styles.gridItem, { backgroundColor: item.color }]}>
              <Text style={styles.gridItemText}>{item.title}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* Responsive Cards */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Responsive Cards</Text>
        <View style={styles.cardsContainer}>
          {testData.slice(0, 3).map((item) => (
            <View key={item.id} style={[styles.card, { backgroundColor: item.color }]}>
              <Text style={styles.cardTitle}>{item.title}</Text>
              <Text style={styles.cardText}>
                This card adapts to different screen sizes with responsive padding and margins.
              </Text>
            </View>
          ))}
        </View>
      </View>

      {/* Responsive Buttons */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Responsive Buttons</Text>
        <View style={styles.buttonsContainer}>
          <TouchableOpacity style={[styles.button, { backgroundColor: '#2563EB' }]}>
            <Text style={styles.buttonText}>Primary Button</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.button, { backgroundColor: '#6B7280' }]}>
            <Text style={styles.buttonText}>Secondary Button</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Responsive Form Elements */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Responsive Form Elements</Text>
        <View style={formStyles.formContainer}>
          <View style={formStyles.formGroup}>
            <Text style={formStyles.formLabel}>Sample Input</Text>
            <View style={styles.input}>
              <Text style={styles.inputText}>Responsive input field</Text>
            </View>
          </View>
        </View>
      </View>

      {/* Breakpoint Indicators */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Current Breakpoint</Text>
        <View style={styles.breakpointContainer}>
          {Object.entries(BREAKPOINTS).map(([key, value]) => (
            <View 
              key={key} 
              style={[
                styles.breakpointItem, 
                { 
                  backgroundColor: breakpoint[`is${key.charAt(0).toUpperCase() + key.slice(1)}`] ? '#10B981' : '#E5E7EB' 
                }
              ]}
            >
              <Text style={[
                styles.breakpointText,
                { color: breakpoint[`is${key.charAt(0).toUpperCase() + key.slice(1)}`] ? '#fff' : '#6B7280' }
              ]}>
                {key.toUpperCase()}
              </Text>
              <Text style={[
                styles.breakpointValue,
                { color: breakpoint[`is${key.charAt(0).toUpperCase() + key.slice(1)}`] ? '#fff' : '#6B7280' }
              ]}>
                {value}px
              </Text>
            </View>
          ))}
        </View>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  section: {
    margin: wp(4),
    padding: wp(4),
    backgroundColor: '#fff',
    borderRadius: wp(3),
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 8,
    elevation: 3,
  },
  infoSection: {
    margin: wp(4),
    padding: wp(4),
    backgroundColor: '#EFF6FF',
    borderRadius: wp(3),
    borderLeftWidth: 4,
    borderLeftColor: '#2563EB',
  },
  sectionTitle: {
    fontSize: fontSizes.xl,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: hp(2),
  },
  infoText: {
    fontSize: fontSizes.md,
    color: '#374151',
    marginBottom: hp(0.5),
  },
  text: {
    color: '#6B7280',
    marginBottom: hp(0.5),
  },
  spacingDemo: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-around',
  },
  spacingBox: {
    width: wp(15),
    height: wp(15),
    backgroundColor: '#2563EB',
    borderRadius: wp(2),
    justifyContent: 'center',
    alignItems: 'center',
  },
  spacingText: {
    color: '#fff',
    fontSize: fontSizes.sm,
    fontWeight: 'bold',
  },
  gridItem: {
    width: '48%',
    height: hp(8),
    borderRadius: wp(3),
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: hp(1),
  },
  gridItemText: {
    color: '#fff',
    fontSize: fontSizes.md,
    fontWeight: 'bold',
  },
  cardsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  card: {
    width: '48%',
    padding: wp(3),
    borderRadius: wp(3),
    marginBottom: hp(1),
  },
  cardTitle: {
    fontSize: fontSizes.lg,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: hp(0.5),
  },
  cardText: {
    fontSize: fontSizes.sm,
    color: '#fff',
    opacity: 0.9,
  },
  buttonsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  button: {
    paddingHorizontal: wp(6),
    paddingVertical: hp(1.5),
    borderRadius: wp(2),
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
    borderRadius: wp(2),
    paddingHorizontal: wp(3),
    paddingVertical: hp(1.2),
    backgroundColor: '#fff',
  },
  inputText: {
    fontSize: fontSizes.md,
    color: '#6B7280',
  },
  breakpointContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  breakpointItem: {
    width: '18%',
    padding: wp(2),
    borderRadius: wp(2),
    alignItems: 'center',
    marginBottom: hp(1),
  },
  breakpointText: {
    fontSize: fontSizes.sm,
    fontWeight: 'bold',
  },
  breakpointValue: {
    fontSize: fontSizes.xs,
    marginTop: hp(0.2),
  },
});

export default ResponsiveTestComponent;
