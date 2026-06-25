const fs = require('fs');
const path = '/Users/alexdiaz/Documents/RS/app/scripts/[id]/car.tsx';
let content = fs.readFileSync(path, 'utf8');

// Update imports
if (!content.includes('Switch,')) {
  content = content.replace('DeviceEventEmitter,\n  Platform,\n', 'DeviceEventEmitter,\n  Platform,\n  Switch,\n  Pressable,\n');
}
if (!content.includes('ChevronRight')) {
  content = content.replace('MoreVertical, Download }', 'MoreVertical, Download, ChevronRight }');
}

// Add viewMode state
if (!content.includes('const [viewMode, setViewMode] = useState')) {
  content = content.replace('const [showMenu, setShowMenu] = useState(false);', "const [showMenu, setShowMenu] = useState(false);\n  const [viewMode, setViewMode] = useState('Guion');");
}

// Replace the entire render block
const renderStartMarker = '  // =============================================\n  // RENDER\n  // =============================================';
const startIndex = content.indexOf(renderStartMarker);
if (startIndex !== -1) {
  // Find where styles start
  const stylesIndex = content.indexOf('const styles = StyleSheet.create({', startIndex);
  if (stylesIndex !== -1) {
    const newRender = `  // =============================================
  // RENDER
  // =============================================

  if (loading) return (
    <View style={[styles.container, { backgroundColor: '#0a0a0a', justifyContent: 'center', alignItems: 'center' }]}>
      <ActivityIndicator size="large" color={colors.primary} />
      <Text style={{ color: 'white', marginTop: rp(20) }}>Cargando Modo Coche...</Text>
    </View>
  );

  // Configuration Screen
  if (showConfig) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#0a0a0a' }}>
        <Stack.Screen options={{ headerShown: false }} />

        {/* Header minimalista estilo iOS */}
        <View style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 16,
          paddingVertical: 12,
        }}>
          {/* Botón salir estilo iOS — pill rojo */}
          <TouchableOpacity
            onPress={() => router.back()}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              backgroundColor: 'rgba(180, 30, 30, 0.85)',
              paddingHorizontal: 14,
              paddingVertical: 8,
              borderRadius: 20,
            }}
          >
            <X size={14} color="white" />
            <Text style={{ color: 'white', fontSize: 13, fontWeight: '600' }}>
              Salir
            </Text>
          </TouchableOpacity>

          {/* Título centrado */}
          <Text style={{
            color: 'white',
            fontSize: 17,
            fontWeight: '600',
            letterSpacing: -0.3,
          }}>
            Modo Coche
          </Text>

          {/* Menú opciones */}
          <View style={{ width: 36, height: 36 }} />
        </View>

        {/* Aviso info — más discreto */}
        <View style={{
          marginHorizontal: 20,
          marginTop: 8,
          marginBottom: 24,
          backgroundColor: 'rgba(255,160,0,0.1)',
          borderLeftWidth: 3,
          borderLeftColor: 'rgba(255,160,0,0.6)',
          borderRadius: 8,
          padding: 14,
        }}>
          <Text style={{
            color: 'rgba(255,160,0,0.9)',
            fontSize: 13,
            lineHeight: 18,
          }}>
            Escucha la escena en bucle interpretada por voces IA.
            Configura las voces según los personajes.
          </Text>
        </View>

        {/* Lista de personajes — más limpia */}
        <Text style={{
          color: 'rgba(255,255,255,0.4)',
          fontSize: 11,
          fontWeight: '700',
          letterSpacing: 1.2,
          textTransform: 'uppercase',
          paddingHorizontal: 20,
          marginBottom: 12,
        }}>
          Configurar voces
        </Text>

        <ScrollView style={{ flex: 1 }}>
          {characterVoiceConfigs.map((config, index) => (
            <View key={config.characterName} style={{
              marginHorizontal: 16,
              marginBottom: 8,
              backgroundColor: 'rgba(255,255,255,0.05)',
              borderRadius: 14,
              padding: 16,
              borderWidth: 1,
              borderColor: 'rgba(255,255,255,0.08)',
            }}>
              {/* Nombre del personaje */}
              <Text style={{
                color: 'white',
                fontSize: 13,
                fontWeight: '700',
                letterSpacing: 0.5,
                textTransform: 'uppercase',
                marginBottom: 12,
                opacity: 0.6,
              }}>
                {config.characterName}
              </Text>

              {/* Selector proveedor */}
              <TouchableOpacity 
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingVertical: 10,
                  borderBottomWidth: 1,
                  borderBottomColor: 'rgba(255,255,255,0.06)',
                }}
                onPress={() => {
                  setExpandedCharacter(expandedCharacter === config.characterName ? null : config.characterName);
                  setShowVoiceDropdown(null);
                }}
              >
                <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 15 }}>
                  {getProviderEmoji(config.provider)} {config.provider === 'system' ? 'Sistema (Gratis)' : config.provider === 'openai' ? 'OpenAI (Premium)' : config.provider === 'azure' ? 'Azure (Premium)' : 'ElevenLabs (Premium)'}
                </Text>
                <ChevronRight size={16} color="rgba(255,255,255,0.3)" />
              </TouchableOpacity>
              
              {expandedCharacter === config.characterName && (
                  <ScrollView style={styles.dropdownList} nestedScrollEnabled={true}>
                    <TouchableOpacity
                      style={[styles.dropdownItem, config.provider === 'system' && styles.dropdownItemSelected]}
                      onPress={() => {
                        const spanishVoice = availableVoices.find(v => v.language.startsWith('es'));
                        updateCharacterVoice(config.characterName, 'system', spanishVoice?.identifier || '');
                        setExpandedCharacter(null);
                      }}
                    >
                      <Text style={styles.dropdownItemText}>📱 Sistema (Gratis)</Text>
                      <Text style={styles.providerDescription}>Voces integradas del dispositivo</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.dropdownItem, config.provider === 'openai' && styles.dropdownItemSelected]}
                      onPress={() => {
                        updateCharacterVoice(config.characterName, 'openai', 'nova');
                        setExpandedCharacter(null);
                      }}
                    >
                      <Text style={styles.dropdownItemText}>🤖 OpenAI (Premium)</Text>
                      <Text style={styles.providerDescription}>Voces de alta calidad</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.dropdownItem, config.provider === 'azure' && styles.dropdownItemSelected]}
                      onPress={() => {
                        updateCharacterVoice(config.characterName, 'azure', 'es-ES-AlvaroNeural');
                        setExpandedCharacter(null);
                      }}
                    >
                      <Text style={styles.dropdownItemText}>🌐 Azure (Premium)</Text>
                      <Text style={styles.providerDescription}>Voces realistas de Microsoft Azure</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.dropdownItem, config.provider === 'elevenlabs' && styles.dropdownItemSelected]}
                      onPress={() => {
                        const defaultEL = elevenLabsVoices[0]?.id || '';
                        updateCharacterVoice(config.characterName, 'elevenlabs', defaultEL);
                        setExpandedCharacter(null);
                      }}
                    >
                      <Text style={styles.dropdownItemText}>🎭 ElevenLabs (Premium)</Text>
                      <Text style={styles.providerDescription}>Voces ultra realistas</Text>
                    </TouchableOpacity>
                  </ScrollView>
                )}

              {/* Selector voz */}
              <TouchableOpacity 
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingVertical: 10,
                }}
                onPress={() => {
                  setShowVoiceDropdown(showVoiceDropdown === config.characterName ? null : config.characterName);
                  setExpandedCharacter(null);
                }}
              >
                <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 15 }}>
                  {getVoiceName(config.provider, config.voiceId)}
                </Text>
                <ChevronRight size={16} color="rgba(255,255,255,0.3)" />
              </TouchableOpacity>

              {showVoiceDropdown === config.characterName && (
                  <View style={styles.dropdownListLarge}>
                    {loadingVoices && config.provider === 'elevenlabs' ? (
                      <View style={styles.loadingContainer}>
                        <ActivityIndicator size="small" color="#3B82F6" />
                        <Text style={styles.loadingText}>Cargando voces...</Text>
                      </View>
                    ) : (
                      <ScrollView style={{ maxHeight: 250 }} nestedScrollEnabled>
                        {getVoicesForProvider(config.provider).map(voice => (
                          <TouchableOpacity
                            key={voice.id}
                            style={[
                              styles.voiceItem,
                              voice.id === config.voiceId && styles.voiceItemSelected
                            ]}
                            onPress={() => {
                              updateCharacterVoice(config.characterName, config.provider, voice.id);
                              setShowVoiceDropdown(null);
                            }}
                          >
                            <Text style={styles.voiceName}>{voice.name}</Text>
                            <TouchableOpacity
                              style={styles.previewBtn}
                              onPress={(e) => {
                                e.stopPropagation();
                                handlePreview(config.provider, voice.id);
                              }}
                            >
                              <Volume2
                                size={18}
                                color={playingVoiceId === voice.id ? '#3B82F6' : '#AAA'}
                              />
                            </TouchableOpacity>
                          </TouchableOpacity>
                        ))}
                      </ScrollView>
                    )}
                  </View>
                )}
            </View>
          ))}
          <View style={{ height: 40 }} />
        </ScrollView>

        {/* Botón Empezar — más discreto que el verde grande actual */}
        <View style={{ paddingHorizontal: 20, paddingBottom: 24, paddingTop: 16 }}>
          {isPreparingAudio ? (
            <View style={styles.preparingContainer}>
              <ActivityIndicator size="large" color="#1a8a5a" />
              <Text style={styles.preparingText}>Preparando audio... {preparingProgress}%</Text>
              <View style={styles.progressBar}>
                <View style={[styles.progressFill, { width: \`\${preparingProgress}%\`, backgroundColor: '#1a8a5a' }]} />
              </View>
            </View>
          ) : (
            <TouchableOpacity
              onPress={handleStartCarMode}
              disabled={characterVoiceConfigs.length === 0}
              style={{
                backgroundColor: characterVoiceConfigs.length === 0 ? 'rgba(26, 138, 90, 0.3)' : '#1a8a5a', 
                borderRadius: 14,
                paddingVertical: 16,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 10,
              }}
            >
              <Play size={18} color="white" fill="white" />
              <Text style={{
                color: 'white',
                fontSize: 16,
                fontWeight: '700',
                letterSpacing: 0.3,
              }}>
                EMPEZAR
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </SafeAreaView>
    );
  }

  // Main Car Mode Screen
  const currentLine = dialogueLines[currentIndex];
  
  // Custom function to render text with stage directions handling
  const renderTextWithStageDirections = (text) => {
    if (!text) return '';
    if (!showStageDirections) return text.replace(/\\(.*?\\)/g, '').trim();
    
    // Si queremos mantener las acotaciones con estilo distinto, podemos hacerlo aquí
    // pero para mantenerlo simple y como el original, simplemente devolvemos el texto
    return text;
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#0a0a0a' }}>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView style={{ flex: 1 }}>

        {/* Header — igual que en configuración */}
        <View style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 16,
          paddingVertical: 12,
        }}>
          <TouchableOpacity
            onPress={() => {
              setIsActive(false);
              setShowConfig(true);
            }}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              backgroundColor: 'rgba(180, 30, 30, 0.85)',
              paddingHorizontal: 14,
              paddingVertical: 8,
              borderRadius: 20,
            }}
          >
            <X size={14} color="white" />
            <Text style={{ color: 'white', fontSize: 13, fontWeight: '600' }}>
              Salir
            </Text>
          </TouchableOpacity>

          {/* Estado de reproducción en el centro */}
          <Text style={{
            color: 'rgba(255,255,255,0.4)',
            fontSize: 13,
            fontWeight: '500',
          }}>
            {!isPaused ? 'Reproduciendo...' : 'En pausa'}
          </Text>

          {/* Botón de ajustes — abre bottom sheet */}
          <TouchableOpacity
            onPress={() => setShowMenu(true)}
            style={{
              backgroundColor: 'rgba(255,255,255,0.1)',
              width: 36,
              height: 36,
              borderRadius: 18,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <MoreVertical size={18} color="rgba(255,255,255,0.7)" />
          </TouchableOpacity>
        </View>

        {/* Zona de contenido — centrada verticalmente */}
        <View style={{
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          paddingHorizontal: 32,
        }}>

          {/* Nombre del personaje — discreto, arriba del texto */}
          <Text style={{
            color: currentLine?.color || 'rgba(100, 180, 255, 0.8)',
            fontSize: 16,
            fontWeight: '600',
            letterSpacing: 1,
            textTransform: 'uppercase',
            marginBottom: 24,
            opacity: 0.8,
          }}>
            {currentLine?.characterName}
            {phase === 'playing_ai' ? '...' : ''}
          </Text>

          {/* Texto del diálogo — grande y centrado como ActOnCue */}
          <ScrollView style={{ flexGrow: 0, maxHeight: '70%' }} contentContainerStyle={{ alignItems: 'center', justifyContent: 'center' }} showsVerticalScrollIndicator={false}>
            <Text style={{
              color: 'white',
              fontSize: 26,
              fontWeight: '500',
              textAlign: 'center',
              lineHeight: 36,
              letterSpacing: -0.3,
            }}>
              {renderTextWithStageDirections(currentLine?.text)}
            </Text>
          </ScrollView>
        </View>

        {/* Controles — discretos, sin fondos llamativos */}
        <View style={{
          paddingBottom: 40,
          alignItems: 'center',
          gap: 20,
        }}>

          {/* Fila principal: anterior / play-pause / siguiente */}
          <View style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 32,
          }}>
            <TouchableOpacity onPress={handleManualPrev}>
              <SkipBack
                size={28}
                color="rgba(255,255,255,0.5)"
                fill="rgba(255,255,255,0.5)"
              />
            </TouchableOpacity>

            {/* Play/Pause — el único control destacado */}
            <TouchableOpacity
              onPress={isPaused ? handleResume : handlePause}
              style={{
                width: 72,
                height: 72,
                borderRadius: 36,
                backgroundColor: 'white',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {!isPaused
                ? <Pause size={28} color="black" fill="black" />
                : <Play size={28} color="black" fill="black" style={{ marginLeft: 4 }} />
              }
            </TouchableOpacity>

            <TouchableOpacity onPress={handleManualNext}>
              <SkipForward
                size={28}
                color="rgba(255,255,255,0.5)"
                fill="rgba(255,255,255,0.5)"
              />
            </TouchableOpacity>
          </View>

          {/* Fila secundaria: reiniciar / loop */}
          <View style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 40,
          }}>
            <TouchableOpacity onPress={handleRestart}>
              <RotateCcw size={22} color="rgba(255,255,255,0.35)" />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setLoopEnabled(!loopEnabled)}
              style={{
                width: 44,
                height: 44,
                borderRadius: 22,
                backgroundColor: loopEnabled
                  ? 'rgba(100, 140, 255, 0.9)'
                  : 'rgba(255,255,255,0.1)',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Repeat size={20} color="white" />
            </TouchableOpacity>
          </View>

        </View>

      </SafeAreaView>

      {/* Bottom Sheet de ajustes */}
      {showMenu && (
        <>
          {/* Backdrop */}
          <Pressable
            style={{
              position: 'absolute',
              inset: 0,
              backgroundColor: 'rgba(0,0,0,0.6)',
            }}
            onPress={() => setShowMenu(false)}
          />

          {/* Panel deslizable desde abajo */}
          <View style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            backgroundColor: '#1c1c1e', // gris oscuro iOS
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            paddingTop: 8,
            paddingBottom: 40,
          }}>
            {/* Handle */}
            <View style={{
              width: 36,
              height: 4,
              borderRadius: 2,
              backgroundColor: 'rgba(255,255,255,0.2)',
              alignSelf: 'center',
              marginBottom: 20,
            }} />

            <Text style={{
              color: 'white',
              fontSize: 17,
              fontWeight: '600',
              paddingHorizontal: 20,
              marginBottom: 20,
            }}>
              Ajustes
            </Text>

            {/* Opción: Vista */}
            <View style={{
              paddingHorizontal: 20,
              marginBottom: 24,
            }}>
              <Text style={{
                color: 'rgba(255,255,255,0.4)',
                fontSize: 11,
                fontWeight: '700',
                letterSpacing: 1,
                textTransform: 'uppercase',
                marginBottom: 12,
              }}>
                Visualización
              </Text>

              {/* Toggle Script / Teleprompter */}
              <View style={{
                flexDirection: 'row',
                backgroundColor: 'rgba(255,255,255,0.08)',
                borderRadius: 10,
                padding: 3,
              }}>
                {['Guion', 'Teleprompter'].map((option) => (
                  <TouchableOpacity
                    key={option}
                    style={{
                      flex: 1,
                      paddingVertical: 8,
                      borderRadius: 8,
                      backgroundColor: viewMode === option
                        ? 'rgba(255,255,255,0.15)'
                        : 'transparent',
                      alignItems: 'center',
                    }}
                    onPress={() => setViewMode(option)}
                  >
                    <Text style={{
                      color: viewMode === option
                        ? 'white'
                        : 'rgba(255,255,255,0.4)',
                      fontSize: 14,
                      fontWeight: '600',
                    }}>
                      {option}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Opción: Mostrar acotaciones */}
            <TouchableOpacity style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingHorizontal: 20,
              paddingVertical: 14,
              borderTopWidth: 1,
              borderTopColor: 'rgba(255,255,255,0.06)',
            }}
            onPress={() => setShowStageDirections(!showStageDirections)}
            >
              <Text style={{ color: 'white', fontSize: 15 }}>
                Mostrar acotaciones
              </Text>
              <Switch
                value={showStageDirections}
                onValueChange={setShowStageDirections}
                trackColor={{ false: 'rgba(255,255,255,0.15)', true: '#34C759' }}
              />
            </TouchableOpacity>

            {/* Opción: Loop */}
            <TouchableOpacity style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingHorizontal: 20,
              paddingVertical: 14,
              borderTopWidth: 1,
              borderTopColor: 'rgba(255,255,255,0.06)',
            }}
            onPress={() => setLoopEnabled(!loopEnabled)}
            >
              <Text style={{ color: 'white', fontSize: 15 }}>
                Repetir en bucle
              </Text>
              <Switch
                value={loopEnabled}
                onValueChange={setLoopEnabled}
                trackColor={{ false: 'rgba(255,255,255,0.15)', true: '#34C759' }}
              />
            </TouchableOpacity>

            {/* Opción: Asignar voces — navega a configuración */}
            <TouchableOpacity style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingHorizontal: 20,
              paddingVertical: 14,
              borderTopWidth: 1,
              borderTopColor: 'rgba(255,255,255,0.06)',
            }}
              onPress={() => {
                setShowMenu(false);
                setIsActive(false);
                setShowConfig(true);
              }}
            >
              <Text style={{ color: 'white', fontSize: 15 }}>
                Asignar voces
              </Text>
              <ChevronRight size={16} color="rgba(255,255,255,0.3)" />
            </TouchableOpacity>

            {/* Opción: Descargar audio */}
            <TouchableOpacity style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingHorizontal: 20,
              paddingVertical: 14,
              borderTopWidth: 1,
              borderTopColor: 'rgba(255,255,255,0.06)',
            }}
              onPress={() => {
                setShowMenu(false);
                generateSceneAudio();
              }}
            >
              <Text style={{ color: 'white', fontSize: 15 }}>
                Descargar audio de escena
              </Text>
              <Download size={16} color="rgba(255,255,255,0.3)" />
            </TouchableOpacity>

          </View>
        </>
      )}
      
      {/* Audio Generation Progress Overlay */}
      {isGeneratingAudio && (
        <View style={styles.generatingOverlay}>
          <View style={styles.generatingContent}>
            <ActivityIndicator size="large" color="#1a8a5a" />
            <Text style={styles.generatingText}>Generando audio... {generatingProgress}%</Text>
            <View style={styles.progressBar}>
              <View style={[styles.progressFill, { width: \`\${generatingProgress}%\`, backgroundColor: '#1a8a5a' }]} />
            </View>
          </View>
        </View>
      )}
    </View>
  );
}
`;
    content = content.substring(0, startIndex) + newRender + '\n\n' + content.substring(stylesIndex);
  }
}

fs.writeFileSync(path, content, 'utf8');
