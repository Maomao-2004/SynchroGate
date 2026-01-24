import React, { useRef, useState, useEffect } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Image, ImageBackground, Dimensions } from "react-native";
import theme from "../../utils/theme";
import { getPublicRoles, formatRoleLabel, isValidRole } from "../../utils/roles";

export default function SelectRoleScreen({ navigation }) {
  const roles = getPublicRoles();
  
  console.log('SelectRoleScreen mounted with roles:', roles);

  // Store initial window dimensions to prevent background from resizing
  // Get initial dimensions before keyboard affects them
  const [screenDimensions] = useState(() => {
    const dims = Dimensions.get('window');
    return dims;
  });

  const handleSelect = (role) => {
    console.log('Role selected:', { role, type: typeof role });
    
    // Validate the role before navigating
    if (!isValidRole(role)) {
      console.error('Invalid role selected:', role);
      return;
    }
    
    // Additional validation for role consistency
    if (typeof role !== 'string') {
      console.error('Role is not a string:', { role, type: typeof role });
      return;
    }
    
    if (role.trim().length === 0) {
      console.error('Role is empty or whitespace:', role);
      return;
    }
    
    if (role.trim().length > 20) {
      console.error('Role is too long:', role);
      return;
    }
    
    if (role.trim().length < 3) {
      console.error('Role is too short:', role);
      return;
    }
    
    if (!/^[a-zA-Z]+$/.test(role.trim())) {
      console.error('Role contains invalid characters:', role);
      return;
    }
    
    console.log('Navigating to login with role:', role);
    
    // Ensure role is properly formatted before navigation
    const normalizedRole = role.toLowerCase();
    console.log('Normalized role for navigation:', normalizedRole);
    
    // Final validation before navigation
    const validRoles = ['student', 'parent', 'admin'];
    if (!validRoles.includes(normalizedRole)) {
      console.error('Invalid normalized role for navigation:', normalizedRole);
      return;
    }
    
    // CRITICAL SECURITY: Log the role selection for audit purposes
    console.log('Role selection validated and proceeding to login:', {
      originalRole: role,
      normalizedRole: normalizedRole,
      timestamp: new Date().toISOString()
    });
    
    navigation.navigate("Login", { role: normalizedRole });
  };

  // Hidden tap counter for admin access via logo
  const [secretCount, setSecretCount] = useState(0);
  const resetTimerRef = useRef(null);

  useEffect(() => {
    return () => {
      if (resetTimerRef.current) {
        clearTimeout(resetTimerRef.current);
      }
    };
  }, []);

  const handleLogoPress = () => {
    const next = secretCount + 1;
    if (next >= 10) {
      setSecretCount(0);
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
      handleSelect('admin');
      return;
    }
    setSecretCount(next);
    if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    resetTimerRef.current = setTimeout(() => setSecretCount(0), 2000);
  };

  const { height: screenHeight } = screenDimensions;

  return (
    <View style={[styles.screenWrapper, { height: screenHeight }]}>
      <ImageBackground 
        source={require("../../assets/Rolescreen.png")} 
        style={styles.container}
        resizeMode="cover"
      >
      <View style={styles.logoContainer}>
        <TouchableOpacity
          onPress={handleLogoPress}
          activeOpacity={0.85}
          style={styles.logoButton}
        >
          <Image
            source={require("../../assets/SG.png")}
            style={styles.logo}
            resizeMode="contain"
          />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>
          <Text style={styles.headerTitleLarge}>S</Text>
          YNCHRO
          <Text style={styles.headerTitleLarge}>G</Text>
          ATE
        </Text>
      </View>

      <View style={styles.contentContainer}>
        <Text style={styles.title}>Login as</Text>

        <TouchableOpacity
          key="student"
          style={[styles.button, styles.buttonTop]}
          onPress={() => handleSelect('student')}
          activeOpacity={0.85}
        >
          <Text style={styles.buttonText}>Student</Text>
        </TouchableOpacity>

        <Text style={styles.orText}>OR</Text>

        <TouchableOpacity
          key="parent"
          style={[styles.button, styles.buttonBottom]}
          onPress={() => handleSelect('parent')}
          activeOpacity={0.85}
        >
          <Text style={styles.buttonText}>Parent</Text>
        </TouchableOpacity>
      </View>
      </ImageBackground>
    </View>
  );
}

const styles = StyleSheet.create({
  screenWrapper: {
    width: '100%',
    overflow: 'hidden',
  },
  container: {
    flex: 1,
    paddingHorizontal: theme.spacing.xl,
    paddingTop: theme.spacing.xxl,
  },
  logoContainer: {
    position: "absolute",
    top: 80,
    left: theme.spacing.xl,
    right: theme.spacing.xl,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1,
  },
  logoButton: {
    alignSelf: "center",
  },
  logo: {
    width: 50,
    height: 50,
    borderRadius: 8,
    backgroundColor: "#FFFFFF",
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: theme.typography.weights.bold,
    color: "#FFFFFF",
    marginLeft: theme.spacing.md,
    textTransform: "uppercase",
  },
  headerTitleLarge: {
    fontSize: 36,
    fontWeight: theme.typography.weights.bold,
    color: "#FFFFFF",
  },
  contentContainer: {
    position: "absolute",
    top: "50%",
    left: theme.spacing.xl,
    right: theme.spacing.xl,
    transform: [{ translateY: -50 }],
    backgroundColor: "rgba(255, 255, 255, 0.25)",
    borderRadius: 8,
    padding: theme.spacing.xl,
    alignSelf: "center",
    width: "100%",
    maxWidth: 420,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 5,
    overflow: "hidden",
  },
  title: {
    fontSize: theme.typography.sizes.xxl,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.textPrimary,
    textAlign: "center",
    marginBottom: theme.spacing.lg,
  },
  button: {
    backgroundColor: theme.colors.primary,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    marginHorizontal: theme.spacing.xl,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  buttonTop: {
    marginBottom: theme.spacing.md,
  },
  buttonBottom: {
    marginTop: theme.spacing.md,
    marginBottom: theme.spacing.lg,
  },
  buttonText: {
    color: "#FFFFFF",
    fontSize: theme.typography.sizes.lg,
    fontWeight: theme.typography.weights.medium,
  },
  orText: {
    textAlign: "center",
    color: theme.colors.muted,
    marginVertical: theme.spacing.md,
    fontSize: theme.typography.sizes.md,
  },
});
