import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, Clapperboard, Info } from 'lucide-react-native';
import { useTheme } from '@/contexts/ThemeContext';

export default function CastingModeScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const { colors } = useTheme();

  const handlePrepare = () => {
    Alert.alert('Casting', 'Preparación de grabación en camino. Esta es una vista preliminar.');
  };

  const handleGuide = () => {
    Alert.alert('Guía', 'Consejos: fondo neutro, buena luz, plano medio, audio claro.');
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton} accessibilityRole="button" accessibilityLabel="Volver" accessibilityHint="Regresa a la pantalla anterior">
          <ArrowLeft size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Modo Casting</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.cardHeader}>
            <Clapperboard size={24} color={colors.text} />
            <Text style={[styles.cardTitle, { color: colors.text }]}>Preparación de self-tape</Text>
          </View>
          <Text style={[styles.cardSubtitle, { color: colors.textSecondary }]}>Configura tu entorno para una prueba limpia</Text>

          <TouchableOpacity
            style={styles.primaryButton}
            onPress={handlePrepare}
            accessibilityRole="button"
            accessibilityLabel="Preparar grabación"
            accessibilityHint="Inicia el proceso de preparación de self-tape"
          >
            <Text style={styles.primaryButtonText}>Preparar grabación</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={handleGuide}
            accessibilityRole="button"
            accessibilityLabel="Ver guía de requisitos"
            accessibilityHint="Muestra recomendaciones para tu self-tape"
          >
            <Info size={20} color="#3B82F6" />
            <Text style={styles.secondaryButtonText}>Guía de requisitos</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  backButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, fontSize: 18, fontWeight: '600', textAlign: 'center', marginHorizontal: 8 },
  content: { flex: 1 },
  contentContainer: { padding: 20 },
  card: { borderWidth: 1, borderRadius: 12, padding: 16, gap: 12 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardTitle: { fontSize: 18, fontWeight: '700' },
  cardSubtitle: { fontSize: 13 },
  primaryButton: { backgroundColor: '#3B82F6', borderRadius: 10, paddingVertical: 12, alignItems: 'center', justifyContent: 'center' },
  primaryButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  secondaryButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderColor: '#3B82F6', borderWidth: 2, borderRadius: 10, paddingVertical: 12 },
  secondaryButtonText: { color: '#3B82F6', fontSize: 16, fontWeight: '600' },
});