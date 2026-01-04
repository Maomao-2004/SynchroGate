import React from 'react';
import { View, Text } from 'react-native';
import { wp, hp, fontSizes } from '../utils/responsive';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    try {
      console.error('ErrorBoundary caught error:', error, info);
    } catch {}
  }

  render() {
    const { hasError, error } = this.state;
    const { fallback } = this.props;
    if (hasError) {
      if (fallback) return fallback;
      return (
        <View style={{ 
          flex: 1, 
          alignItems: 'center', 
          justifyContent: 'center', 
          padding: wp(4), 
          backgroundColor: '#fff' 
        }}>
          <Text style={{ 
            fontSize: fontSizes.xl, 
            fontWeight: '700', 
            color: '#111827', 
            marginBottom: hp(1) 
          }}>Something went wrong</Text>
          <Text style={{ 
            color: '#6B7280', 
            textAlign: 'center',
            fontSize: fontSizes.md
          }}>{String(error?.message || 'Unknown error')}</Text>
        </View>
      );
    }
    return this.props.children;
  }
}


