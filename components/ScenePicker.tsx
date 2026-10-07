import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import { PickableScene } from '@/utils/sceneSelection';
import { rf, rp } from '@/utils/responsive';

export interface ScenePickerColors {
  fg: string;
  fgSecondary: string;
  cardBg: string;
  cardBorder: string;
  accent: string;
  primary: string;
}

interface Props {
  scenes: PickableScene[];
  selectedIds: Set<string>;
  onChange: (next: Set<string>) => void;
  onContinue: () => void;
  colors: ScenePickerColors;
  intro: string;
  bottomInset: number;
}

/**
 * Elegir una o varias escenas (o todas) de un guion largo antes de practicar.
 * Lo usan Estudio y Coche; Selftape y Revisar guion tienen su propia versión.
 */
export function ScenePicker({ scenes, selectedIds, onChange, onContinue, colors, intro, bottomInset }: Props) {
  const allSelected = selectedIds.size === scenes.length;
  const toggle = (sceneId: string) => {
    const next = new Set(selectedIds);
    if (next.has(sceneId)) next.delete(sceneId); else next.add(sceneId);
    onChange(next);
  };

  const renderCheck = (checked: boolean) => (
    <View style={[styles.check, { borderColor: checked ? colors.primary : colors.fgSecondary, backgroundColor: checked ? colors.primary : 'transparent' }]}>
      {checked && <Text style={styles.checkMark}>✓</Text>}
    </View>
  );

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={styles.list}>
        <Text style={[styles.intro, { color: colors.fgSecondary }]}>{intro}</Text>

        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => onChange(allSelected ? new Set() : new Set(scenes.map((scene) => scene.id)))}
          style={[styles.card, { backgroundColor: colors.cardBg, borderColor: allSelected ? colors.primary : colors.cardBorder }]}
        >
          {renderCheck(allSelected)}
          <View style={{ flex: 1 }}>
            <Text style={[styles.title, { color: colors.fg }]}>Todas las escenas</Text>
            <Text style={[styles.preview, { color: colors.fgSecondary }]}>El guion completo, de principio a fin</Text>
          </View>
        </TouchableOpacity>

        {scenes.map((scene) => {
          const checked = selectedIds.has(scene.id);
          return (
            <TouchableOpacity
              key={scene.id}
              activeOpacity={0.85}
              onPress={() => toggle(scene.id)}
              style={[styles.card, { backgroundColor: colors.cardBg, borderColor: checked ? colors.primary : colors.cardBorder }]}
            >
              {renderCheck(checked)}
              <View style={{ flex: 1 }}>
                <Text style={[styles.title, { color: colors.fg }]} numberOfLines={2}>
                  {`Escena ${scene.sceneNumber}${scene.heading ? ` · ${scene.heading}` : ''}`}
                </Text>
                {scene.speakers.length > 0 && (
                  <Text style={[styles.meta, { color: colors.accent }]} numberOfLines={1}>{scene.speakers.join(' · ')}</Text>
                )}
                {!!scene.preview && (
                  <Text style={[styles.preview, { color: colors.fgSecondary }]} numberOfLines={2}>{scene.preview}</Text>
                )}
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: Math.max(bottomInset, rp(16)) }]}>
        <TouchableOpacity
          onPress={onContinue}
          disabled={selectedIds.size === 0}
          activeOpacity={0.85}
          style={[styles.button, { backgroundColor: colors.primary, opacity: selectedIds.size === 0 ? 0.5 : 1 }]}
        >
          <Text style={styles.buttonText}>
            {selectedIds.size === 0
              ? 'Elige al menos una escena'
              : allSelected ? 'Continuar con todas' : `Continuar con ${selectedIds.size === 1 ? '1 escena' : `${selectedIds.size} escenas`}`}
          </Text>
          {selectedIds.size > 0 && <ChevronRight size={rp(20)} color="#FFFFFF" />}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  list: { paddingHorizontal: rp(16), paddingTop: rp(8), paddingBottom: rp(24) },
  intro: { fontSize: rf(14), lineHeight: 20, textAlign: 'center', marginBottom: rp(16), paddingHorizontal: rp(8) },
  card: { flexDirection: 'row', alignItems: 'flex-start', gap: rp(12), padding: rp(14), borderRadius: 14, borderWidth: 1.5, marginBottom: rp(12) },
  check: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  checkMark: { color: '#FFFFFF', fontSize: rf(13), fontWeight: '800' },
  title: { fontSize: rf(15), fontWeight: '700' },
  meta: { fontSize: rf(12), fontWeight: '600', marginTop: 4, letterSpacing: 0.3 },
  preview: { fontSize: rf(13), marginTop: 6, lineHeight: 18 },
  footer: { paddingHorizontal: rp(16), paddingTop: rp(12) },
  button: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: rp(16), borderRadius: 14 },
  buttonText: { color: '#FFFFFF', fontSize: rf(16), fontWeight: '700' },
});
