import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, Lightbulb, Shuffle } from 'lucide-react-native';
import { useTheme } from '@/contexts/ThemeContext';

const TIPS = [
  'Respira pausado antes de empezar cada línea.',
  'Proyecta la voz sin forzar la garganta.',
  'Marca cambios emocionales con el ritmo y pausas.',
  'Visualiza la relación con tu interlocutor antes de responder.',
];

export default function CoachModeScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const { colors } = useTheme();
  const [tipsEnabled, setTipsEnabled] = useState(true);
  const [tipIndex, setTipIndex] = useState(0);

  const nextTip = () => setTipIndex((prev) => (prev + 1) % TIPS.length);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton} accessibilityRole="button" accessibilityLabel="Volver" accessibilityHint="Regresa a la pantalla anterior">
          <ArrowLeft size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Modo Coach</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>Consejos activos</Text>
          <Text style={[styles.cardSubtitle, { color: colors.textSecondary }]}>Recibe sugerencias mientras practicas</Text>

          <View style={[styles.tipBox, { backgroundColor: colors.input }]} accessibilityRole="text">
            {tipsEnabled ? (
              <Text style={[styles.tipText, { color: colors.text }]}>
                {TIPS[tipIndex]}
              </Text>
            ) : (
              <Text style={[styles.tipText, { color: colors.textSecondary }]}>Consejos desactivados</Text>
            )}
          </View>

          <View style={styles.row}>
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={() => setTipsEnabled(!tipsEnabled)}
              accessibilityRole="button"
              accessibilityLabel={tipsEnabled ? 'Desactivar consejos' : 'Activar consejos'}
              accessibilityHint="Alterna la visualización de consejos de coaching"
            >
              <Lightbulb size={20} color="#FFFFFF" />
              <Text style={styles.primaryButtonText}>{tipsEnabled ? 'Consejos: ON' : 'Consejos: OFF'}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={nextTip}
              accessibilityRole="button"
              accessibilityLabel="Siguiente consejo"
              accessibilityHint="Muestra un nuevo consejo de actuación"
            >
              <Shuffle size={20} color="#3B82F6" />
              <Text style={styles.secondaryButtonText}>Siguiente</Text>
            </TouchableOpacity>
          </View>
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
  cardTitle: { fontSize: 18, fontWeight: '700' },
  cardSubtitle: { fontSize: 13 },
  tipBox: { borderRadius: 10, padding: 16 },
  tipText: { fontSize: 16 },
  row: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  primaryButton: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#3B82F6', borderRadius: 10, paddingVertical: 12, paddingHorizontal: 16 },
  primaryButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  secondaryButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderColor: '#3B82F6', borderWidth: 2, borderRadius: 10, paddingVertical: 12, paddingHorizontal: 16 },
  secondaryButtonText: { color: '#3B82F6', fontSize: 16, fontWeight: '600' },
});