// Enhanced utility to help convert existing screens to responsive design
// This file contains common patterns for updating screens

export const responsiveImports = `
import { 
  wp, 
  hp, 
  fontSizes, 
  responsiveStyles, 
  getResponsiveDimensions,
  getResponsiveValue,
  getResponsiveGridStyles,
  getResponsiveNavigationStyles,
  getResponsiveFormStyles,
  getResponsiveLayout,
  useBreakpoint,
  BREAKPOINTS
} from '../../utils/responsive';

const dimensions = getResponsiveDimensions();
const breakpoint = useBreakpoint();
const layout = getResponsiveLayout();
`;

export const commonResponsivePatterns = {
  // Enhanced responsive dimension replacements
  replaceFixedDimensions: {
    'width: 50': `width: dimensions.avatarMedium`,
    'height: 50': `height: dimensions.avatarMedium`,
    'borderRadius: 25': `borderRadius: dimensions.avatarMedium / 2`,
    'padding: 16': `padding: wp(4)`,
    'paddingHorizontal: 16': `paddingHorizontal: wp(4)`,
    'paddingVertical: 20': `paddingVertical: hp(2.5)`,
    'marginTop: 20': `marginTop: hp(2.5)`,
    'marginBottom: 20': `marginBottom: hp(2.5)`,
    'fontSize: 16': `fontSize: fontSizes.md`,
    'fontSize: 18': `fontSize: fontSizes.lg`,
    'fontSize: 20': `fontSize: fontSizes.xl`,
    'fontSize: 24': `fontSize: fontSizes.xxl`,
    'borderRadius: 16': `borderRadius: wp(4)`,
    'borderRadius: 8': `borderRadius: wp(2)`,
  },
  
  // Breakpoint-aware responsive patterns
  breakpointPatterns: {
    // Grid layouts
    'flexDirection: \'row\'': `flexDirection: breakpoint.isMobile ? 'column' : 'row'`,
    'width: \'100%\'': `width: breakpoint.isMobile ? '100%' : '48%'`,
    
    // Font sizes based on device type
    'fontSize: 14': `fontSize: getResponsiveValue({ xs: fontSizes.sm, sm: fontSizes.md, md: fontSizes.lg, lg: fontSizes.xl, xl: fontSizes.xxl })`,
    
    // Spacing based on device type
    'padding: 16': `padding: getResponsiveValue({ xs: wp(3), sm: wp(3.5), md: wp(4), lg: wp(4.5), xl: wp(5) })`,
  },
  
  // Sidebar responsive patterns
  sidebarPatterns: {
    sidebarWidth: `Math.min(wp(75), 300)`, // 75% of screen width, max 300px
    sidebarAnimation: `useState(new Animated.Value(-sidebarWidth))[0]`,
    toggleSidebar: `
    const toggleSidebar = (open) => {
      setSidebarOpen(open);
      Animated.timing(sidebarAnimRight, {
        toValue: open ? 0 : -sidebarWidth,
        duration: 300,
        useNativeDriver: false,
      }).start();
    };`,
  },
  
  // Modal responsive patterns
  modalPatterns: {
    modalOverlay: `...responsiveStyles.modalOverlay`,
    modalCard: `...responsiveStyles.modalCard`,
  },
  
  // Header responsive patterns
  headerPatterns: {
    header: `...responsiveStyles.header`,
    headerTitle: `...responsiveStyles.headerTitle`,
  },
};

// Function to get responsive sidebar styles
export const getResponsiveSidebarStyles = (sidebarWidth) => ({
  sidebar: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: sidebarWidth,
    backgroundColor: '#fff',
    padding: wp(5),
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowOffset: { width: -5, height: 0 },
    shadowRadius: 10,
    zIndex: 10,
    borderTopStartRadius: wp(4),
  },
  sidebarTitle: {
    fontSize: fontSizes.xxl,
    fontWeight: 'bold',
    marginTop: hp(4),
    marginBottom: hp(2.5),
  },
  sidebarItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: hp(1.5),
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  sidebarText: {
    fontSize: fontSizes.md,
    marginLeft: wp(3),
  },
});

// Function to get responsive modal styles
export const getResponsiveModalStyles = () => ({
  modalOverlay: responsiveStyles.modalOverlay,
  modalCard: responsiveStyles.modalCard,
  modalIconWrap: {
    width: wp(16),
    height: wp(16),
    borderRadius: wp(8),
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: hp(2),
  },
  modalTitle: {
    fontSize: fontSizes.xl,
    fontWeight: '700',
    color: '#111827',
    marginBottom: hp(1),
  },
  modalText: {
    fontSize: fontSizes.md,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: hp(3),
  },
  modalActions: {
    flexDirection: 'row',
    gap: wp(3),
  },
  modalButton: {
    flex: 1,
    paddingVertical: hp(1.5),
    paddingHorizontal: wp(4),
    borderRadius: wp(2),
    alignItems: 'center',
  },
  modalButtonText: {
    fontSize: fontSizes.md,
    fontWeight: '600',
    color: '#6B7280',
  },
});

export default {
  responsiveImports,
  commonResponsivePatterns,
  getResponsiveSidebarStyles,
  getResponsiveModalStyles,
};
