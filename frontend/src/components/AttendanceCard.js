import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { wp, hp, fontSizes, getResponsiveDimensions } from '../utils/responsive';

const AttendanceCard = ({ entry }) => {
  const dimensions = getResponsiveDimensions();
  
  const formatDate = (timestamp) => {
    const date = timestamp?.toDate?.() || new Date(timestamp);
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  };

  const formatTime = (timestamp) => {
    const date = timestamp?.toDate?.() || new Date(timestamp);
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const isToday = new Date(entry.timestamp?.toDate?.() || entry.timestamp).toDateString() === new Date().toDateString();

  return (
    <View style={[styles.card, isToday && styles.todayCard]}>
      <View style={styles.cardHeader}>
        <View style={styles.dateContainer}>
          <Text style={styles.date}>{formatDate(entry.timestamp)}</Text>
          {isToday && <View style={styles.todayBadge}><Text style={styles.todayText}>Today</Text></View>}
        </View>
        <View style={[styles.statusBadge, entry.type === 'IN' ? styles.inBadge : styles.outBadge]}>
          <Ionicons 
            name={entry.type === 'IN' ? 'enter-outline' : 'exit-outline'} 
            size={16} 
            color={entry.type === 'IN' ? '#10B981' : '#EF4444'} 
          />
          <Text style={[styles.statusText, entry.type === 'IN' ? styles.inText : styles.outText]}>
            {entry.type === 'IN' ? 'Check In' : 'Check Out'}
          </Text>
        </View>
      </View>
      
      <View style={styles.cardDetails}>
        <View style={styles.timeContainer}>
          <Ionicons name="time-outline" size={16} color="#6B7280" />
          <Text style={styles.timeText}>{formatTime(entry.timestamp)}</Text>
        </View>
        <View style={styles.locationContainer}>
          <Ionicons name="location-outline" size={16} color="#6B7280" />
          <Text style={styles.locationText}>School Campus</Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: wp(4),
    padding: wp(4),
    marginBottom: hp(1.5),
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 8,
    elevation: 2,
  },
  todayCard: {
    borderWidth: 2,
    borderColor: '#EFF6FF',
    backgroundColor: '#FAFBFF',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: hp(1.5),
  },
  dateContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  date: {
    fontSize: fontSizes.lg,
    fontWeight: '600',
    color: '#111827',
  },
  todayBadge: {
    backgroundColor: '#2563EB',
    paddingHorizontal: wp(2),
    paddingVertical: hp(0.5),
    borderRadius: wp(3),
    marginLeft: wp(2),
  },
  todayText: {
    fontSize: fontSizes.xs,
    color: '#fff',
    fontWeight: '600',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: wp(2.5),
    paddingVertical: hp(1),
    borderRadius: wp(3),
  },
  inBadge: {
    backgroundColor: '#ECFDF5',
  },
  outBadge: {
    backgroundColor: '#FEF2F2',
  },
  statusText: {
    fontSize: fontSizes.sm,
    fontWeight: '600',
    marginLeft: wp(1),
  },
  inText: {
    color: '#10B981',
  },
  outText: {
    color: '#EF4444',
  },
  cardDetails: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  timeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  timeText: {
    fontSize: fontSizes.md,
    color: '#6B7280',
    marginLeft: wp(1.5),
  },
  locationContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  locationText: {
    fontSize: fontSizes.md,
    color: '#6B7280',
    marginLeft: wp(1.5),
  },
});

export default AttendanceCard;
