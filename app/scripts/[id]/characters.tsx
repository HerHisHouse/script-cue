import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, Check } from 'lucide-react-native';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { supabase } from '@/utils/supabase';
import { Character, Script } from '@/types/database';

export default function CharactersSetupScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const { colors } = useTheme();

  const [script, setScript] = useState<Script | null>(null);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadData = React.useCallback(async () => {
    try {
      const { data: scriptData, error: scriptError } = await supabase
        .from('scripts')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (scriptError) throw scriptError;
      if (!scriptData) throw new Error('Script not found');

      setScript(scriptData);

      const { data: charactersData, error: charactersError } = await supabase
        .from('characters')
        .select('*')
        .eq('script_id', id)
        .order('name');

      if (charactersError) throw charactersError;

      setCharacters(charactersData || []);

      const userCharacter = charactersData?.find((c) => c.is_user_character);
      if (userCharacter) {
        setSelectedCharacterId(userCharacter.id);
      }
    } catch (error: any) {
      console.error('Error loading data:', error);
      Alert.alert('Error', error.message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (user && id) {
      loadData();
    }
  }, [user, id, loadData]);

  async function handleSelectCharacter(characterId: string) {
    try {
      await supabase
        .from('characters')
        .update({ is_user_character: false })
        .eq('script_id', id);

      await supabase
        .from('characters')
        .update({ is_user_character: true })
        .eq('id', characterId);

      setSelectedCharacterId(characterId);
      setCharacters(
        characters.map((c) => ({
          ...c,
          is_user_character: c.id === characterId,
        }))
      );

      Alert.alert(
        'Personaje seleccionado',
        '¡Tu personaje ha sido actualizado!',
        [{ text: 'OK' }]
      );
    } catch (error: any) {
      console.error('Error updating character:', error);
      Alert.alert('Error', 'No se pudo actualizar el personaje');
    }
  }

  async function handleContinue() {
    if (!selectedCharacterId) {
      Alert.alert('Atención', 'Por favor selecciona tu personaje');
      return;
    }

    try {
      await supabase
        .from('scripts')
        .update({ status: 'ready' })
        .eq('id', id);

      router.replace(`/scripts/${id}`);
    } catch (error: any) {
      console.error('Error updating script:', error);
      Alert.alert('Error', 'No se pudo continuar');
    }
  }

  if (loading) {
    return (
      <View style={[styles.centerContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <ArrowLeft size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Configurar Personajes</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.content}>
        {script && (
          <View style={[styles.scriptInfo, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.scriptTitle, { color: colors.text }]}>{script.title}</Text>
            <Text style={[styles.scriptStats, { color: colors.textSecondary }]}>
              ✓ {characters.length} personajes detectados
            </Text>
          </View>
        )}

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Selecciona Tu Personaje</Text>
          <Text style={[styles.sectionHint, { color: colors.textSecondary }]}>
            Elige el personaje que vas a interpretar
          </Text>

          <FlatList
            data={characters}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[
                  styles.characterCard,
                  { backgroundColor: colors.surface, borderColor: colors.border },
                  item.id === selectedCharacterId && { borderColor: colors.primary, borderWidth: 2 },
                ]}
                onPress={() => handleSelectCharacter(item.id)}
              >
                <View style={[styles.colorIndicator, { backgroundColor: item.color }]} />
                <View style={styles.characterInfo}>
                  <Text style={[styles.characterName, { color: colors.text }]}>{item.name}</Text>
                  <Text style={[styles.characterMeta, { color: colors.textSecondary }]}>
                    {item.line_count} líneas
                  </Text>
                </View>
                {item.id === selectedCharacterId && (
                  <View style={[styles.checkIcon, { backgroundColor: colors.primary }]}>
                    <Check size={16} color="#FFFFFF" />
                  </View>
                )}
              </TouchableOpacity>
            )}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.list}
          />
        </View>

        <TouchableOpacity
          style={[styles.continueButton, { opacity: selectedCharacterId ? 1 : 0.5 }]}
          onPress={handleContinue}
          disabled={!selectedCharacterId}
        >
          <Text style={styles.continueText}>Continuar</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  content: {
    flex: 1,
    padding: 20,
  },
  scriptInfo: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    borderWidth: 1,
  },
  scriptTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 4,
  },
  scriptStats: {
    fontSize: 14,
  },
  section: {
    flex: 1,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 8,
  },
  sectionHint: {
    fontSize: 14,
    marginBottom: 16,
  },
  list: {
    paddingBottom: 20,
  },
  characterCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  colorIndicator: {
    width: 4,
    height: 40,
    borderRadius: 2,
    marginRight: 12,
  },
  characterInfo: {
    flex: 1,
  },
  characterName: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  characterMeta: {
    fontSize: 13,
  },
  checkIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  continueButton: {
    backgroundColor: '#3B82F6',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 16,
  },
  continueText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
