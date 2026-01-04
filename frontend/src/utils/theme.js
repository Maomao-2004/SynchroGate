// Centralized design tokens for consistent styling across the app
// Keep this file dependency-free and RN-only (no platform APIs)

const palette = {
  // Primary brand
  primary: "#004f89", // match tab bar color
  primaryDark: "#003a66",
  primaryLight: "#0078cf",

  // Neutrals (Light theme)
  background: "#F8FAFC", // slate-50
  surface: "#FFFFFF",
  surfaceElevated: "#F1F5F9", // slate-100
  border: "#E5E7EB", // gray-200
  textPrimary: "#111827", // gray-900 - Dark text for visibility
  textSecondary: "#374151", // gray-700 - Dark secondary text
  muted: "#6B7280", // gray-500 - Dark muted text

  // Semantic
  success: "#10B981",
  warning: "#F59E0B",
  error: "#EF4444",
  info: "#3B82F6",
};

const spacing = {
  xs: 6,
  sm: 10,
  md: 14,
  lg: 18,
  xl: 24,
  xxl: 32,
};

const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  pill: 999,
};

const shadows = {
  // Android elevation and iOS shadow approximations
  sm: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.12,
    shadowRadius: 2,
    elevation: 2,
  },
  md: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.18,
    shadowRadius: 6,
    elevation: 4,
  },
  lg: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.22,
    shadowRadius: 12,
    elevation: 8,
  },
};

const typography = {
  fontFamily: undefined, // inherit platform defaults; customize if you add fonts
  sizes: {
    xs: 12,
    sm: 14,
    md: 16,
    lg: 18,
    xl: 22,
    xxl: 28,
  },
  weights: {
    regular: "400",
    medium: "600",
    bold: "700",
  },
};

const theme = {
  colors: palette,
  spacing,
  radius,
  shadows,
  typography,
  components: {
    button: {
      height: 52,
      radius: radius.lg,
      paddingX: spacing.lg,
    },
    card: {
      radius: radius.lg,
      padding: spacing.lg,
    },
    input: {
      height: 50,
      radius: radius.md,
      paddingX: spacing.md,
    },
  },
};

export default theme;
export { palette, spacing, radius, shadows, typography };


