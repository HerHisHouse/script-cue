const fs = require('fs');
const path = '/Users/alexdiaz/Documents/RS/app/scripts/[id]/car.tsx';
let content = fs.readFileSync(path, 'utf8');

const targetStr = `          {characterVoiceConfigs.map((config, index) => (
            <View key={config.characterName} style={{`;

const replacement = `          {characterVoiceConfigs.map((config, index) => {
            const isAction = config.characterName === 'ACCIÓN';
            const title = isAction ? 'Acciones de escena' : config.characterName;
            
            return (
            <View key={config.characterName} style={{`;

content = content.replace(targetStr, replacement);

const targetTitle = `{config.characterName}
              </Text>`;

const replaceTitle = `{title}
              </Text>
              {isAction && (
                <View style={{ position: 'absolute', top: 12, right: 16 }}>
                  <Switch
                    value={readActions}
                    onValueChange={setReadActions}
                    trackColor={{ false: 'rgba(255,255,255,0.1)', true: 'rgba(100, 140, 255, 0.5)' }}
                    thumbColor={readActions ? '#ffffff' : '#999999'}
                  />
                </View>
              )}`;
              
content = content.replace(targetTitle, replaceTitle);

const targetBodyStart = `{/* Selector proveedor */}`;
const replaceBodyStart = `{/* Selector proveedor */}
              {(!isAction || readActions) && (
                <View>`;
                
content = content.replace(targetBodyStart, replaceBodyStart);

const targetBodyEnd = `                  </View>
                )}
            </View>
          ))}

          {/* Botón Empezar */}`;
          
const replaceBodyEnd = `                  </View>
                )}
                </View>
              )}
            </View>
          )})}

          {/* Botón Empezar */}`;
content = content.replace(targetBodyEnd, replaceBodyEnd);

fs.writeFileSync(path, content);
