
import React, { useState, useContext } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  Image,
  Modal,
  ScrollView,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { AuthContext } from '../../contexts/AuthContext';
import { STUDENT_TAB_BAR_STYLE } from '../../navigation/tabStyles';

const AboutLogo = require('../../assets/logo.png');

const { width } = Dimensions.get('window');

const About = () => {
  const navigation = useNavigation();
  const { logout } = useContext(AuthContext);
  const [logoutVisible, setLogoutVisible] = useState(false);

  const handleLogout = () => setLogoutVisible(true);
  const confirmLogout = async () => {
    setLogoutVisible(false);
    try { await logout(); } catch {}
  };
  const cancelLogout = () => setLogoutVisible(false);

  // Hide student tab while focused and restore on blur
  useFocusEffect(
    React.useCallback(() => {
      const parent = navigation.getParent?.();
      if (parent) parent.setOptions({ tabBarStyle: { display: 'none' } });
      return () => {};
    }, [navigation])
  );

  return (
    <View style={styles.wrapper}>
      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.heroSection}>
          <View style={styles.logoContainer}>
            <Image source={AboutLogo} style={styles.logo} />
          </View>
          <Text style={styles.heroTitle}>SynchroGate</Text>
          <Text style={styles.heroSubtitle}>A Mobile-Based Real-Time Parental Alert and Notification System for PMFTCI Student Entry and Exit Monitoring</Text>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="flag-outline" size={20} color="#004f89" />
            <Text style={styles.sectionTitle}>Our Mission</Text>
          </View>
          <Text style={styles.sectionContent}>
            To revolutionize school management by providing a comprehensive, secure, and user-friendly platform that connects students, parents, and administrators in real-time, ensuring safety, transparency, and efficient communication.
          </Text>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="star-outline" size={20} color="#004f89" />
            <Text style={styles.sectionTitle}>Key Features</Text>
          </View>
          <View style={styles.featuresGrid}>
            <View style={styles.featureCard}>
              <Ionicons name="qr-code-outline" size={20} color="#004f89" />
              <Text style={styles.featureTitle}>QR Code Attendance</Text>
              <Text style={styles.featureDescription}>Real-time attendance tracking using secure QR codes for instant check-ins and check-outs.</Text>
            </View>
            <View style={styles.featureCard}>
              <Ionicons name="notifications-outline" size={20} color="#004f89" />
              <Text style={styles.featureTitle}>Smart Notifications</Text>
              <Text style={styles.featureDescription}>Instant alerts and notifications to keep parents informed about their child's school activities.</Text>
            </View>
            <View style={styles.featureCard}>
              <Ionicons name="people-outline" size={20} color="#004f89" />
              <Text style={styles.featureTitle}>User Management</Text>
              <Text style={styles.featureDescription}>Comprehensive management of students, parents, and staff with role-based access control.</Text>
            </View>
            <View style={styles.featureCard}>
              <Ionicons name="analytics-outline" size={20} color="#004f89" />
              <Text style={styles.featureTitle}>Analytics & Reports</Text>
              <Text style={styles.featureDescription}>Detailed insights and reports on attendance patterns and school activities.</Text>
            </View>
            <View style={styles.featureCard}>
              <Ionicons name="shield-checkmark-outline" size={20} color="#004f89" />
              <Text style={styles.featureTitle}>Security First</Text>
              <Text style={styles.featureDescription}>Enterprise-grade security with encrypted data transmission and secure authentication.</Text>
            </View>
            <View style={styles.featureCard}>
              <Ionicons name="calendar-outline" size={20} color="#004f89" />
              <Text style={styles.featureTitle}>Event Management</Text>
              <Text style={styles.featureDescription}>Create and manage school events, announcements, and important notifications.</Text>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="hardware-chip-outline" size={20} color="#004f89" />
            <Text style={styles.sectionTitle}>Technology Stack</Text>
          </View>
          <Text style={styles.sectionContent}>
            Built with modern technologies including React Native for cross-platform mobile development, Firebase for real-time database and authentication, and cloud-based infrastructure for scalability and reliability.
          </Text>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="mail-outline" size={20} color="#004f89" />
            <Text style={styles.sectionTitle}>Get in Touch</Text>
          </View>
          <Text style={styles.sectionContent}>
            For support, feature requests, or general inquiries, please contact our development team. We're committed to providing the best school management experience.
          </Text>
        </View>

        <View style={styles.versionSection}>
          <Text style={styles.versionText}>Version 1.0.0</Text>
          <Text style={styles.copyrightText}>© 2025 SynchroGate. All rights reserved.</Text>
        </View>
      </ScrollView>
      
      {/* Logout Modal */}
      <Modal transparent animationType="fade" visible={logoutVisible} onRequestClose={cancelLogout}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={[styles.modalIconWrap, { backgroundColor: '#FEE2E2' }]}>
              <Ionicons name="log-out-outline" size={28} color="#b91c1c" />
            </View>
            <Text style={styles.modalTitle}>Logout</Text>
            <Text style={styles.modalText}>Are you sure you want to logout?</Text>
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalButton} onPress={cancelLogout}>
                <Text style={styles.modalButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalButton, styles.modalButtonDanger]} onPress={confirmLogout}>
                <Text style={[styles.modalButtonText, styles.modalButtonDangerText]}>Logout</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: { flex: 1, backgroundColor: '#F9FAFB' },
  content: {
    flex: 1,
    padding: 12,
    paddingTop: 20,
    paddingBottom: 16,
  },
  heroSection: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 20,
    marginTop: -8,
    marginBottom: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 8,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#F3F4F6',
  },
  logoContainer: {
    width: 70,
    height: 70,
    borderRadius: 8,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#DBEAFE',
  },
  logo: {
    width: 50,
    height: 50,
    resizeMode: 'contain',
  },
  heroTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 6,
    textAlign: 'center',
  },
  heroSubtitle: {
    fontSize: 13,
    color: '#6B7280',
    textAlign: 'center',
    fontWeight: '400',
  },
  section: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 4,
    elevation: 1,
    borderWidth: 1,
    borderColor: '#F3F4F6',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    marginLeft: 8,
  },
  sectionContent: {
    fontSize: 14,
    color: '#4B5563',
    lineHeight: 20,
  },
  featuresGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  featureCard: {
    width: '48%',
    backgroundColor: '#F9FAFB',
    borderRadius: 6,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  featureTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
    marginTop: 8,
    marginBottom: 4,
  },
  featureDescription: {
    fontSize: 12,
    color: '#6B7280',
    lineHeight: 16,
  },
  versionSection: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 16,
    marginBottom: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 4,
    elevation: 1,
    borderWidth: 1,
    borderColor: '#F3F4F6',
  },
  versionText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#004f89',
    marginBottom: 4,
  },
  copyrightText: {
    fontSize: 12,
    color: '#9CA3AF',
    textAlign: 'center',
  },
  
  
  // Modal styles
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  modalCard: { backgroundColor: '#fff', borderRadius: 8, padding: 24, width: '85%', maxWidth: 400, alignItems: 'center' },
  modalIconWrap: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  modalTitle: { fontSize: 20, fontWeight: '700', color: '#111827', marginBottom: 8 },
  modalText: { fontSize: 16, color: '#6B7280', textAlign: 'center', marginBottom: 24 },
  modalActions: { flexDirection: 'row', gap: 12 },
  modalButton: { flex: 1, paddingVertical: 12, paddingHorizontal: 16, borderRadius: 8, alignItems: 'center' },
  modalButtonText: { fontSize: 16, fontWeight: '600', color: '#6B7280' },
  modalButtonDanger: { backgroundColor: '#FEE2E2' },
  modalButtonDangerText: { color: '#b91c1c' },
});

export default About;





