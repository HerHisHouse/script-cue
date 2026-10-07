import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, Modal, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { X, Info, Delete, Save } from 'lucide-react-native';
import { ModalGlassFill } from '@/components/ModalGlassFill';
import { rf, rp } from '@/utils/responsive';
import {
  EXPRESSIVE_TAG_CATEGORIES, EXPRESSIVE_TAGS_EXAMPLE, insertTag, removeTagNear, stripTags,
} from '@/utils/tts/expressiveTags';

export interface ExpressiveTagsSheetColors {
  onBg: string;
  onBg2: string;
  fieldBg: string;
  fieldBorder: string;
  cardBorder: string;
  primary: string;
  accent: string;
}

interface Props {
  visible: boolean;
  characterName: string;
  initialText: string;
  onCancel: () => void;
  /** Texto con etiquetas; si no quedó ninguna etiqueta, el texto tal cual. */
  onSave: (markup: string) => void;
  isDark: boolean;
  colors: ExpressiveTagsSheetColors;
}

/**
 * Voces Expresiva (ElevenLabs v4): poner etiquetas de interpretación dentro de la réplica.
 * El texto no abre el teclado: se toca solo para colocar el cursor y las etiquetas se insertan
 * ahí (para cambiar las palabras está "Editar línea"). Ver utils/tts/expressiveTags.ts.
 */
export function ExpressiveTagsSheet({ visible, characterName, initialText, onCancel, onSave, isDark, colors }: Props) {
  const [text, setText] = useState(initialText);
  const [selection, setSelection] = useState({ start: initialText.length, end: initialText.length });
  const [showInfo, setShowInfo] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setText(initialText);
    setSelection({ start: initialText.length, end: initialText.length });
    setShowInfo(false);
  }, [visible, initialText]);

  const hasTags = stripTags(text) !== text.replace(/\s+/g, ' ').trim();

  const addTag = (label: string) => {
    const next = insertTag(text, selection.start, label);
    setText(next.text);
    setSelection({ start: next.cursor, end: next.cursor });
  };
  const removeTag = () => {
    const next = removeTagNear(text, selection.start);
    setText(next.text);
    setSelection({ start: next.cursor, end: next.cursor });
  };
  const removeAll = () => {
    const clean = stripTags(text);
    setText(clean);
    setSelection({ start: clean.length, end: clean.length });
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}
      supportedOrientations={['portrait', 'landscape', 'landscape-left', 'landscape-right']}>
      <Pressable style={styles.overlay} onPress={onCancel}>
        <Pressable onPress={(e) => e.stopPropagation()} style={styles.sheet}>
          <ModalGlassFill isDark={isDark} intensity={isDark ? 55 : 75} />
          <View style={[StyleSheet.absoluteFill, { backgroundColor: isDark ? 'rgba(124,106,247,0.40)' : 'rgba(235,230,245,0.40)' }]} />
          <SafeAreaView edges={{ bottom: 'additive' }} style={styles.inner}>
            <View style={styles.headerRow}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.title, { color: colors.onBg }]}>Emociones de la réplica</Text>
                <Text style={[styles.subtitle, { color: colors.onBg2 }]} numberOfLines={1}>{characterName} · voz Expresiva</Text>
              </View>
              <TouchableOpacity onPress={() => setShowInfo(true)} style={styles.iconBtn} accessibilityLabel="Cómo funciona">
                <Info size={20} color={colors.accent} />
              </TouchableOpacity>
              <TouchableOpacity onPress={onCancel} style={styles.iconBtn} accessibilityLabel="Cerrar">
                <X size={20} color={colors.onBg2} />
              </TouchableOpacity>
            </View>

            <TextInput
              style={[styles.input, { color: colors.onBg, borderColor: colors.fieldBorder, backgroundColor: colors.fieldBg }]}
              value={text}
              onChangeText={setText}
              selection={selection}
              onSelectionChange={(e) => setSelection(e.nativeEvent.selection)}
              showSoftInputOnFocus={false}
              multiline
              textAlignVertical="top"
              scrollEnabled
            />
            <View style={styles.editRow}>
              <Text style={[styles.hint, { color: colors.onBg2 }]}>Toca el texto para colocar el cursor</Text>
              <TouchableOpacity onPress={removeTag} disabled={!hasTags} style={[styles.smallBtn, { opacity: hasTags ? 1 : 0.4 }]}>
                <Delete size={15} color={colors.onBg} />
                <Text style={[styles.smallBtnText, { color: colors.onBg }]}>Borrar etiqueta</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={removeAll} disabled={!hasTags} style={[styles.smallBtn, { opacity: hasTags ? 1 : 0.4 }]}>
                <Text style={[styles.smallBtnText, { color: colors.onBg }]}>Quitar todas</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.tagsScroll} contentContainerStyle={{ paddingBottom: rp(8) }}>
              {EXPRESSIVE_TAG_CATEGORIES.map((category) => (
                <View key={category.key} style={{ marginBottom: rp(14) }}>
                  <Text style={[styles.categoryTitle, { color: colors.onBg2 }]}>{category.title}</Text>
                  <View style={styles.chipsWrap}>
                    {category.tags.map((t) => (
                      <TouchableOpacity key={t.label} onPress={() => addTag(t.label)}
                        style={[styles.chip, { borderColor: colors.cardBorder, backgroundColor: colors.fieldBg }]}>
                        <Text style={[styles.chipText, { color: colors.onBg }]}>{t.label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              ))}
            </ScrollView>

            <View style={styles.buttonsRow}>
              <TouchableOpacity onPress={onCancel}
                style={[styles.actionBtn, { backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(124,106,247,0.12)' }]}>
                <Text style={{ color: colors.onBg }}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => onSave(text.replace(/[ \t]+/g, ' ').trim())}
                style={[styles.actionBtn, { backgroundColor: '#10B981' }]}>
                <Save size={14} color="#fff" />
                <Text style={{ color: '#fff' }}> Guardar</Text>
              </TouchableOpacity>
            </View>
          </SafeAreaView>

          {showInfo && (
            <Pressable style={styles.infoOverlay} onPress={() => setShowInfo(false)}>
              <Pressable onPress={(e) => e.stopPropagation()}
                style={[styles.infoCard, { backgroundColor: isDark ? '#2a2447' : '#FFFFFF', borderColor: colors.cardBorder }]}>
                <Text style={[styles.infoTitle, { color: colors.onBg }]}>Cómo funcionan las emociones</Text>
                <ScrollView style={{ maxHeight: rp(360) }}>
                  <Text style={[styles.infoText, { color: colors.onBg }]}>
                    Coloca el cursor donde quieras que cambie la interpretación y toca una etiqueta: se añade entre paréntesis en ese punto.
                  </Text>
                  <Text style={[styles.infoText, { color: colors.onBg }]}>
                    Cada etiqueta afecta a todo lo que viene después, hasta la siguiente etiqueta. Puedes poner tantas como quieras en una misma réplica.
                  </Text>
                  <Text style={[styles.infoLabel, { color: colors.onBg2 }]}>Ejemplo</Text>
                  <Text style={[styles.infoExample, { color: colors.onBg, borderColor: colors.cardBorder }]}>{EXPRESSIVE_TAGS_EXAMPLE}</Text>
                  <Text style={[styles.infoText, { color: colors.onBg }]}>
                    Aquí se ríe en la primera frase, baja la voz en la segunda y se pone triste en la última.
                  </Text>
                  <Text style={[styles.infoText, { color: colors.onBg2 }]}>
                    Emoción cambia el estado de ánimo, Vocalizaciones añade sonidos (risas, suspiros, tos…), Entrega cambia cómo se dice (susurrar, gritar, pausas) y Carácter cambia la voz del personaje. Las etiquetas no se leen en voz alta y no aparecen en el teleprompter.
                  </Text>
                </ScrollView>
                <TouchableOpacity onPress={() => setShowInfo(false)} style={[styles.infoBtn, { backgroundColor: colors.primary }]}>
                  <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>Entendido</Text>
                </TouchableOpacity>
              </Pressable>
            </Pressable>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: { maxHeight: '88%', borderTopLeftRadius: 24, borderTopRightRadius: 24, overflow: 'hidden' },
  inner: { padding: rp(20) },
  headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: rp(12), gap: 4 },
  title: { fontSize: rf(20), fontWeight: '700' },
  subtitle: { fontSize: rf(13), marginTop: 2 },
  iconBtn: { padding: 6 },
  input: { borderWidth: 1, borderRadius: 12, padding: rp(12), fontSize: rf(16), lineHeight: 22, minHeight: rp(110), maxHeight: rp(170) },
  editRow: { flexDirection: 'row', alignItems: 'center', gap: rp(8), marginTop: rp(8), marginBottom: rp(12) },
  hint: { flex: 1, fontSize: rf(12) },
  smallBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 6, paddingHorizontal: 8 },
  smallBtnText: { fontSize: rf(13), fontWeight: '600' },
  tagsScroll: { maxHeight: rp(300) },
  categoryTitle: { fontSize: rf(13), fontWeight: '600', marginBottom: rp(8) },
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: rp(8) },
  chip: { borderWidth: 1, borderRadius: 10, paddingVertical: rp(7), paddingHorizontal: rp(10) },
  chipText: { fontSize: rf(14) },
  buttonsRow: { flexDirection: 'row', gap: 12, marginTop: rp(12) },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: rp(14), borderRadius: 12 },
  infoOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: rp(20) },
  infoCard: { borderRadius: 18, borderWidth: 1, padding: rp(20) },
  infoTitle: { fontSize: rf(17), fontWeight: '700', marginBottom: rp(10) },
  infoText: { fontSize: rf(14), lineHeight: 20, marginBottom: rp(10) },
  infoLabel: { fontSize: rf(12), fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: rp(6) },
  infoExample: { fontSize: rf(14), lineHeight: 20, fontStyle: 'italic', borderWidth: 1, borderRadius: 10, padding: rp(10), marginBottom: rp(10) },
  infoBtn: { marginTop: rp(8), paddingVertical: rp(12), borderRadius: 12, alignItems: 'center' },
});
