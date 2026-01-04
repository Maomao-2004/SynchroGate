import React from 'react';
import { TextInput, StyleSheet, View, Text } from 'react-native';
import { wp, hp, fontSizes } from '../utils/responsive';

const InputField = ({ label, value, onChangeText, secureTextEntry = false, placeholder, style, placeholderTextColor, labelStyle, ...props }) => {
  return (
    <View style={styles.container}>
      {label && <Text style={[styles.label, labelStyle]}>{label}</Text>}
      <TextInput
        style={[styles.input, style]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        secureTextEntry={secureTextEntry}
        placeholderTextColor={placeholderTextColor || '#9CA3AF'}
        color="#111827"
        {...props}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: hp(1),
    paddingHorizontal: wp(4),
  },
  label: {
    marginBottom: hp(0.5),
    fontWeight: 'bold',
    fontSize: fontSizes.md,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: wp(2),
    paddingHorizontal: wp(3),
    paddingVertical: hp(1.2),
    fontSize: fontSizes.md,
    backgroundColor: '#fff',
    color: '#111827', // Explicit text color for typed values
    placeholderTextColor: '#9CA3AF', // Explicit placeholder color
  },
});

export default InputField;
