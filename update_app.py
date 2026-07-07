import re

with open("app/(tabs)/community.tsx", "r", encoding="utf-8") as f:
    content = f.read()

# 1. Update OPCIONES and LABEL_MAP
new_opciones = """const OPCIONES: Opcion[] = [
  {
    id: 'replica',
    icon: '🎭',
    texto: 'Encontrar pareja de escena',
    subtexto: 'Para que te den una réplica real y humana',
  },
  {
    id: 'ciudad',
    icon: '📍',
    texto: 'Buscar en mi ciudad',
    subtexto: 'Conectar con gente del gremio cerca de ti',
  },
  {
    id: 'proyectos',
    icon: '🎬',
    texto: 'Proyectos',
    subtexto: 'Descubre proyectos o castings compartidos por la comunidad.',
  },
  {
    id: 'grupos',
    icon: '👥',
    texto: 'Grupos de ensayo',
    subtexto: 'Grupos estables para crear o ensayar',
  },
  {
    id: 'feedback_pro',
    icon: '🎓',
    texto: 'Feedback profesional',
    subtexto: 'Concertar sesiones con coaches profesionales',
  },
  {
    id: 'networking',
    icon: '🌐',
    texto: 'Networking',
    subtexto: 'Amplia tu red de contactos',
  },
];

const LABEL_MAP: Record<string, string> = {
  replica: 'Encontrar pareja de escena',
  ciudad: 'Buscar en mi ciudad',
  proyectos: 'Proyectos',
  grupos: 'Grupos de ensayo',
  feedback_pro: 'Feedback profesional',
  networking: 'Networking',
};"""

old_opciones_pattern = re.compile(r'const OPCIONES: Opcion\[\].*?const LABEL_MAP: Record<string, string> = \{.*?\};\n', re.DOTALL)
content = old_opciones_pattern.sub(new_opciones + "\n", content)


# Add Modal import
content = content.replace("ActivityIndicator,\n  Animated,\n} from 'react-native';", "ActivityIndicator,\n  Animated,\n  Modal,\n  FlatList,\n} from 'react-native';")

# 2. Add PROVINCES list above CommunityScreen
provinces = """
const PROVINCES = [
  "Álava", "Albacete", "Alicante", "Almería", "Ávila", "Badajoz", "Baleares", "Barcelona", "Burgos", "Cáceres", "Cádiz", "Castellón", "Ciudad Real", "Córdoba", "A Coruña", "Cuenca", "Girona", "Granada", "Guadalajara", "Gipuzkoa", "Huelva", "Huesca", "Jaén", "León", "Lleida", "La Rioja", "Lugo", "Madrid", "Málaga", "Murcia", "Navarra", "Ourense", "Asturias", "Palencia", "Las Palmas", "Pontevedra", "Salamanca", "Santa Cruz de Tenerife", "Cantabria", "Segovia", "Sevilla", "Soria", "Tarragona", "Teruel", "Toledo", "Valencia", "Valladolid", "Bizkaia", "Zamora", "Zaragoza", "Ceuta", "Melilla"
];
"""
content = content.replace("export default function CommunityScreen() {", provinces + "\nexport default function CommunityScreen() {")

# 3. Change setCiudad('') to setCiudad([]) and add state for modal
content = content.replace("const [ciudad, setCiudad] = useState('');", "const [ciudad, setCiudad] = useState<string[]>([]);\n  const [cityModalVisible, setCityModalVisible] = useState(false);\n  const [citySearch, setCitySearch] = useState('');")

# 4. Handle initial load of array (from string)
old_initial_ciudad = "setCiudad(data.ciudad || '');"
new_initial_ciudad = "setCiudad(data.ciudad ? data.ciudad.split(', ') : []);"
content = content.replace(old_initial_ciudad, new_initial_ciudad)

# 5. Handle submission (array to string)
old_submit_ciudad = "ciudad: ciudad.trim() || null,"
new_submit_ciudad = "ciudad: ciudad.length > 0 ? ciudad.join(', ') : null,"
content = content.replace(old_submit_ciudad, new_submit_ciudad)

# Handle validation: submit button disabled if no ciudad
old_submit_disabled = "disabled={selectedOptions.length === 0 || loading}"
new_submit_disabled = "disabled={selectedOptions.length === 0 || ciudad.length === 0 || loading}"
content = content.replace(old_submit_disabled, new_submit_disabled)
old_submit_color = "backgroundColor: selectedOptions.length === 0 ? colors.border : PURPLE_DARK,"
new_submit_color = "backgroundColor: (selectedOptions.length === 0 || ciudad.length === 0) ? colors.border : PURPLE_DARK,"
content = content.replace(old_submit_color, new_submit_color)

# 6. Change City input UI
old_city_ui = """          {/* City field */}
          <View style={styles.section}>
            <Text style={[styles.fieldLabel, { color: colors.text }]}>¿En qué ciudad estás?</Text>
            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: colors.input,
                  borderColor: colors.border,
                  color: colors.text,
                },
              ]}
              placeholder="Ej: Madrid, Barcelona, Valencia..."
              placeholderTextColor={colors.placeholder}
              value={ciudad}
              onChangeText={setCiudad}
              returnKeyType="done"
            />
            <Text style={[styles.fieldHint, { color: colors.textSecondary }]}>
              Opcional. Nos ayuda a saber dónde hay más interés.
            </Text>
          </View>"""

new_city_ui = """          {/* City field */}
          <View style={styles.section}>
            <Text style={[styles.fieldLabel, { color: colors.text }]}>¿En qué ciudad(es) estás?</Text>
            <TouchableOpacity
              style={[
                styles.input,
                {
                  backgroundColor: colors.input,
                  borderColor: colors.border,
                  justifyContent: 'center',
                  minHeight: 50,
                },
              ]}
              onPress={() => setCityModalVisible(true)}
            >
              <Text style={{ color: ciudad.length > 0 ? colors.text : colors.placeholder, fontSize: 15 }}>
                {ciudad.length > 0 ? ciudad.join(', ') : 'Seleccionar ciudades'}
              </Text>
            </TouchableOpacity>
            <Text style={[styles.fieldHint, { color: colors.textSecondary }]}>
              Obligatorio. Puedes elegir más de una.
            </Text>
          </View>

          {/* City Selector Modal */}
          <Modal visible={cityModalVisible} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setCityModalVisible(false)}>
            <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
              <View style={{ padding: 16, borderBottomWidth: 1, borderBottomColor: colors.border, flexDirection: 'row', alignItems: 'center' }}>
                <TextInput
                  style={{
                    flex: 1,
                    backgroundColor: colors.input,
                    color: colors.text,
                    paddingHorizontal: 16,
                    paddingVertical: 12,
                    borderRadius: 10,
                    marginRight: 12,
                    fontSize: 16,
                  }}
                  placeholder="Buscar ciudad..."
                  placeholderTextColor={colors.placeholder}
                  value={citySearch}
                  onChangeText={setCitySearch}
                  autoFocus
                />
                <TouchableOpacity onPress={() => setCityModalVisible(false)}>
                  <Text style={{ color: PURPLE, fontWeight: '600', fontSize: 16 }}>Hecho</Text>
                </TouchableOpacity>
              </View>
              <FlatList
                data={PROVINCES.filter(p => p.toLowerCase().includes(citySearch.toLowerCase()))}
                keyExtractor={item => item}
                renderItem={({ item }) => {
                  const isSelected = ciudad.includes(item);
                  return (
                    <TouchableOpacity
                      style={{
                        padding: 16,
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        borderBottomWidth: 1,
                        borderBottomColor: colors.border
                      }}
                      onPress={() => {
                        setCiudad(prev => 
                          prev.includes(item) ? prev.filter(c => c !== item) : [...prev, item]
                        );
                      }}
                    >
                      <Text style={{ color: colors.text, fontSize: 16 }}>{item}</Text>
                      {isSelected && <Check size={20} color={PURPLE} />}
                    </TouchableOpacity>
                  );
                }}
              />
            </SafeAreaView>
          </Modal>"""

content = content.replace(old_city_ui, new_city_ui)

with open("app/(tabs)/community.tsx", "w", encoding="utf-8") as f:
    f.write(content)

print("App updated successfully")

