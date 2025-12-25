import React from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import { rf, rp } from '@/utils/responsive';

/**
 * Componente de prueba para verificar que responsive funciona
 * Añade esto temporalmente a cualquier pantalla para ver los valores
 */
export function ResponsiveDebug() {
    const { width, height } = Dimensions.get('window');

    return (
        <View style={styles.container}>
            <Text style={styles.title}>📱 Debug Responsive</Text>
            <Text style={styles.text}>Ancho pantalla: {width}px</Text>
            <Text style={styles.text}>Alto pantalla: {height}px</Text>
            <Text style={styles.text}>rf(16) = {rf(16).toFixed(1)}px</Text>
            <Text style={styles.text}>rp(20) = {rp(20).toFixed(1)}px</Text>
            <View style={[styles.box, { padding: rp(20) }]}>
                <Text style={[styles.boxText, { fontSize: rf(16) }]}>
                    Texto con rf(16)
                </Text>
                <Text style={styles.small}>Padding: rp(20)</Text>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        position: 'absolute',
        top: 100,
        right: 10,
        backgroundColor: 'rgba(255,0,0,0.9)',
        padding: 10,
        borderRadius: 8,
        zIndex: 9999,
    },
    title: {
        color: '#FFF',
        fontSize: 14,
        fontWeight: 'bold',
        marginBottom: 8,
    },
    text: {
        color: '#FFF',
        fontSize: 12,
        marginBottom: 4,
    },
    box: {
        backgroundColor: 'rgba(255,255,255,0.2)',
        marginTop: 8,
        borderRadius: 4,
    },
    boxText: {
        color: '#FFF',
        fontWeight: 'bold',
    },
    small: {
        color: '#FFF',
        fontSize: 10,
        marginTop: 4,
    },
});
