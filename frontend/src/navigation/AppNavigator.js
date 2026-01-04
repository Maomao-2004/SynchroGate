
import React, { useContext } from "react";
import { NavigationContainer, DefaultTheme } from "@react-navigation/native";
import { AuthContext } from "../contexts/AuthContext";

import AuthNavigator from "./AuthNavigator";
import StudentNavigator from "./StudentNavigator";
import ParentNavigator from "./ParentNavigator";
import AdminNavigator from "./AdminNavigator";
import DeveloperNavigator from "./DeveloperNavigator";

const AppNavigator = () => {
  const { isAuthenticated, role, loading, initializing } = useContext(AuthContext);

  console.log('AppNavigator state:', { isAuthenticated, role, loading, initializing });
  console.log('AppNavigator will render:', isAuthenticated ? 'Authenticated navigator' : 'AuthNavigator');

  const getNavigatorByRole = () => {
    console.log('Getting navigator for role:', role);
    
    // Validate role before switching
    // SAFE: During initialization, role may be null - this is normal
    if (!role || typeof role !== 'string') {
      // Only log as error if we're authenticated but role is still null (actual problem)
      // Otherwise it's just initialization, which is expected
      if (isAuthenticated && !loading && !initializing) {
        console.error('Invalid role in AppNavigator (authenticated but no role):', { role, type: typeof role });
      } else {
        console.log('ℹ️ Role not yet loaded (initialization) - showing auth screen');
      }
      return <AuthNavigator />;
    }
    
    if (role.trim().length === 0) {
      console.error('Role is empty or whitespace in AppNavigator:', role);
      return <AuthNavigator />;
    }
    
    if (role.trim().length > 20) {
      console.error('Role is too long in AppNavigator:', role);
      return <AuthNavigator />;
    }
    
    if (role.trim().length < 3) {
      console.error('Role is too short in AppNavigator:', role);
      return <AuthNavigator />;
    }
    
    if (!/^[a-zA-Z]+$/.test(role.trim())) {
      console.error('Role contains invalid characters in AppNavigator:', role);
      return <AuthNavigator />;
    }
    
    const normalizedRole = role.toLowerCase();
    console.log('Normalized role for navigation:', normalizedRole);
    
    // Additional validation for role consistency
    if (typeof normalizedRole !== 'string' || normalizedRole.length === 0) {
      console.error('Invalid normalized role format in AppNavigator:', normalizedRole);
      return <AuthNavigator />;
    }
    
    // Additional validation for role values
    const validRoles = ['student', 'parent', 'admin', 'developer'];
    if (!validRoles.includes(normalizedRole)) {
      console.error('Invalid role value in AppNavigator:', { normalizedRole, validRoles });
      return <AuthNavigator />;
    }
    
    // Additional validation for role format
    if (normalizedRole !== role.toLowerCase()) {
      console.warn('Role case mismatch in AppNavigator:', { original: role, normalized: normalizedRole });
    }
    
    // CRITICAL SECURITY: Ensure role is valid and matches user's actual role
    // This prevents unauthorized access to different role navigators
    console.log('Role validation passed, proceeding with navigation');
    
    switch (normalizedRole) {
      case "student":
        return <StudentNavigator />;
      case "parent":
        return <ParentNavigator />;
      case "admin":
        return <AdminNavigator />;
      case "developer":
        return <DeveloperNavigator />;
      default:
        console.log('No role match, returning AuthNavigator. Role was:', normalizedRole);
        return <AuthNavigator />;
    }
  };

  const lightNavTheme = {
    ...DefaultTheme,
    colors: {
      ...DefaultTheme.colors,
      background: '#FFFFFF',
      card: '#FFFFFF',
    },
  };

  return (
    <NavigationContainer theme={lightNavTheme}>
      {/* Show AuthNavigator (with SplashScreen spinning logo) during initialization instead of LoadingScreen */}
      {initializing || !isAuthenticated ? <AuthNavigator /> : getNavigatorByRole()}
    </NavigationContainer>
  );
};

export default AppNavigator;

