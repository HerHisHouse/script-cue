import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, Contrast, Play, Pause } from 'lucide-react-native';
import { useTheme } from '@/contexts/ThemeContext';

export default function CarModeScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const { colors } = useTheme();
  const [highContrast, setHighContrast] = useState(true);
  const [paused, setPaused] = useState(true);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton} accessibilityRole="button" accessibilityLabel="Volver" accessibilityHint="Regresa a la pantalla anterior">
          <ArrowLeft size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Modo Coche</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>Lectura segura</Text>
          <Text style={[styles.cardSubtitle, { color: colors.textSecondary }]}>Texto grande y alto contraste para uso en movimiento</Text>

          <View style={[styles.readBox, { backgroundColor: highContrast ? '#000000' : colors.input }]}
            accessibilityRole="summary"
            accessibilityLabel="Área de lectura"
            accessibilityHint="Muestra un ejemplo de texto con estilo de alto contraste"
          >
            <Text style={[styles.readText, { color: highContrast ? '#FFFFFF' : colors.text }]}>
              Mantén la atención: respira y proyecta con claridad.
            </Text>
          </View>

          <View style={styles.row}>
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={() => setHighContrast(!highContrast)}
              accessibilityRole="button"
              accessibilityLabel={highContrast ? 'Desactivar alto contraste' : 'Activar alto contraste'}
              accessibilityHint="Alterna el estilo de alto contraste"
            >
              <Contrast size={20} color="#FFFFFF" />
              <Text style={styles.primaryButtonText}>{highContrast ? 'Alto contraste: ON' : 'Alto contraste: OFF'}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.playPauseButton, { backgroundColor: '#3B82F6' }]}
              onPress={() => setPaused(!paused)}
              accessibilityRole="button"
              accessibilityLabel={paused ? 'Reproducir' : 'Pausar'}
              accessibilityHint="Simula control principal de reproducción"
            >
              {paused ? <Play size={28} color="#FFFFFF" /> : <Pause size={28} color="#FFFFFF" />}
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
  readBox: { borderRadius: 10, padding: 16 },
  readText: { fontSize: 22, fontWeight: '700' },
  row: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  primaryButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#3B82F6', borderRadius: 10, paddingVertical: 12, paddingHorizontal: 16, flex: 1 },
  primaryButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  playPauseButton: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
});