import React from 'react';
import { View, StyleSheet, Platform, Text } from 'react-native';

interface PdfViewerProps {
  url: string;
  height?: number;
}

export function PdfViewer({ url, height = 400 }: PdfViewerProps) {
  if (Platform.OS === 'web') {
    return (
      <View style={[styles.container, { height }]}>
        <iframe
          src={url}
          style={{ border: 'none', width: '100%', height: '100%' }}
          title="PDF Viewer"
          frameBorder="0"
          allowFullScreen
        />
      </View>
    );
  }
  
  // For mobile, we could use a WebView or show a placeholder
  return (
    <View style={[styles.container, styles.mobileContainer, { height }]}>
      <View style={styles.placeholder}>
        <Text style={styles.placeholderText}>PDF no disponible en dispositivos móviles</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    overflow: 'hidden',
  },
  mobileContainer: {
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  
  placeholder: {
    padding: 20,
    alignItems: 'center',
  },
  placeholderText: {
    color: '#666',
    fontSize: 14,
    textAlign: 'center',
  },
});
