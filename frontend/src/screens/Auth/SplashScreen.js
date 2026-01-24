import React, { useEffect, useContext, useRef } from "react";
import { View, Text, Animated, StyleSheet } from "react-native";
import { AuthContext } from "../../contexts/AuthContext";

export default function SplashScreen({ navigation }) {
  const { isAuthenticated, role, initializing, sessionRestored } = useContext(AuthContext);
  const spinValue = useRef(new Animated.Value(0)).current;
  const minDisplayTime = useRef(5000); // Minimum 5 seconds display time to prevent SelectRole flash
  const startTime = useRef(Date.now());
  const navigationHandled = useRef(false);

  useEffect(() => {
    // Start spinning animation immediately
    const spinAnimation = Animated.loop(
      Animated.timing(spinValue, {
        toValue: 1,
        duration: 1500, // Slightly faster spin for better visibility
        useNativeDriver: true,
      })
    );
    spinAnimation.start();

    return () => {
      spinAnimation.stop();
    };
  }, [spinValue]);

  useEffect(() => {
    console.log('SplashScreen useEffect:', { isAuthenticated, role, initializing, sessionRestored });
    
    // CRITICAL: Never navigate if user is authenticated - AppNavigator will handle it
    if (isAuthenticated && role) {
      console.log('User is authenticated, AppNavigator will handle navigation. No action needed.');
      return;
    }
    
    if (!initializing && sessionRestored && !navigationHandled.current) {
      const elapsedTime = Date.now() - startTime.current;
      const remainingTime = Math.max(0, minDisplayTime.current - elapsedTime);
      
      // Double-check: Only navigate to SelectRole if NOT authenticated
      if (!isAuthenticated && !role) {
        // User is not authenticated, redirect to role selection after minimum display time
        console.log('User not authenticated, navigating to SelectRole after minimum display time:', remainingTime, 'ms');
        const timer = setTimeout(() => {
          // Final check before navigation
          if (!isAuthenticated && !role) {
            navigationHandled.current = true;
            navigation.replace("SelectRole");
          } else {
            console.log('Authentication state changed, preventing SelectRole navigation');
          }
        }, remainingTime);
        return () => clearTimeout(timer);
      }
    } else {
      console.log('Still initializing or session not restored, waiting...');
    }
  }, [isAuthenticated, role, initializing, sessionRestored, navigation]);

  const spin = spinValue.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <View style={styles.container}>
      <Animated.Image
        source={require('../../assets/SG.png')}
        style={[styles.logo, { transform: [{ rotate: spin }] }]}
        resizeMode="contain"
      />

      <Text style={styles.title}>SynchroGate</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    justifyContent: "center",
    alignItems: "center",
  },
  logo: {
    width: 150,
    height: 150,
    marginBottom: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#fff",
  },
});
