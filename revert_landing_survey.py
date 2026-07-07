import re

with open("landing/index.html", "r", encoding="utf-8") as f:
    content = f.read()

# Replace the grid with the flex column
start_str = "<!-- Opciones de encuesta -->"
end_str = "<!-- Campo ciudad"

start_idx = content.find(start_str)
end_idx = content.find(end_str)

if start_idx != -1 and end_idx != -1:
    new_survey = """<!-- Opciones de encuesta -->
        <div style="display: flex; flex-direction: column; gap: 10px; margin-bottom: 24px;">
          
          <label class="community-option" style="
            display: flex;
            align-items: flex-start;
            gap: 14px;
            background: rgba(255,255,255,0.04);
            border: 1.5px solid rgba(255,255,255,0.1);
            border-radius: 12px;
            padding: 14px 16px;
            cursor: pointer;
            transition: all 0.2s ease;
          ">
            <input type="checkbox" value="replica" style="
              width: 18px; height: 18px; margin-top: 2px;
              accent-color: #a78bfa; cursor: pointer; flex-shrink: 0;
            "/>
            <div>
              <div style="color: #ffffff; font-size: 14px; font-weight: 600;">
                🎭 Encontrar pareja de escena
              </div>
              <div style="color: #9090b0; font-size: 13px; margin-top: 2px;">
                Para que te den una réplica real y humana
              </div>
            </div>
          </label>

          <label class="community-option" style="
            display: flex;
            align-items: flex-start;
            gap: 14px;
            background: rgba(255,255,255,0.04);
            border: 1.5px solid rgba(255,255,255,0.1);
            border-radius: 12px;
            padding: 14px 16px;
            cursor: pointer;
            transition: all 0.2s ease;
          ">
            <input type="checkbox" value="ciudad" style="
              width: 18px; height: 18px; margin-top: 2px;
              accent-color: #a78bfa; cursor: pointer; flex-shrink: 0;
            "/>
            <div>
              <div style="color: #ffffff; font-size: 14px; font-weight: 600;">
                📍 Buscar en mi ciudad
              </div>
              <div style="color: #9090b0; font-size: 13px; margin-top: 2px;">
                Conectar con gente del gremio cerca de ti
              </div>
            </div>
          </label>

          <label class="community-option" style="
            display: flex;
            align-items: flex-start;
            gap: 14px;
            background: rgba(255,255,255,0.04);
            border: 1.5px solid rgba(255,255,255,0.1);
            border-radius: 12px;
            padding: 14px 16px;
            cursor: pointer;
            transition: all 0.2s ease;
          ">
            <input type="checkbox" value="proyectos" style="
              width: 18px; height: 18px; margin-top: 2px;
              accent-color: #a78bfa; cursor: pointer; flex-shrink: 0;
            "/>
            <div>
              <div style="color: #ffffff; font-size: 14px; font-weight: 600;">
                🎬 Proyectos
              </div>
              <div style="color: #9090b0; font-size: 13px; margin-top: 2px;">
                Descubre proyectos o castings compartidos por la comunidad.
              </div>
            </div>
          </label>

          <label class="community-option" style="
            display: flex;
            align-items: flex-start;
            gap: 14px;
            background: rgba(255,255,255,0.04);
            border: 1.5px solid rgba(255,255,255,0.1);
            border-radius: 12px;
            padding: 14px 16px;
            cursor: pointer;
            transition: all 0.2s ease;
          ">
            <input type="checkbox" value="grupos" style="
              width: 18px; height: 18px; margin-top: 2px;
              accent-color: #a78bfa; cursor: pointer; flex-shrink: 0;
            "/>
            <div>
              <div style="color: #ffffff; font-size: 14px; font-weight: 600;">
                👥 Grupos de ensayo
              </div>
              <div style="color: #9090b0; font-size: 13px; margin-top: 2px;">
                Grupos estables para crear o ensayar
              </div>
            </div>
          </label>

          <label class="community-option" style="
            display: flex;
            align-items: flex-start;
            gap: 14px;
            background: rgba(255,255,255,0.04);
            border: 1.5px solid rgba(255,255,255,0.1);
            border-radius: 12px;
            padding: 14px 16px;
            cursor: pointer;
            transition: all 0.2s ease;
          ">
            <input type="checkbox" value="feedback_pro" style="
              width: 18px; height: 18px; margin-top: 2px;
              accent-color: #a78bfa; cursor: pointer; flex-shrink: 0;
            "/>
            <div>
              <div style="color: #ffffff; font-size: 14px; font-weight: 600;">
                🎓 Feedback profesional
              </div>
              <div style="color: #9090b0; font-size: 13px; margin-top: 2px;">
                Concertar sesiones con coaches profesionales
              </div>
            </div>
          </label>

          <label class="community-option" style="
            display: flex;
            align-items: flex-start;
            gap: 14px;
            background: rgba(255,255,255,0.04);
            border: 1.5px solid rgba(255,255,255,0.1);
            border-radius: 12px;
            padding: 14px 16px;
            cursor: pointer;
            transition: all 0.2s ease;
          ">
            <input type="checkbox" value="networking" style="
              width: 18px; height: 18px; margin-top: 2px;
              accent-color: #a78bfa; cursor: pointer; flex-shrink: 0;
            "/>
            <div>
              <div style="color: #ffffff; font-size: 14px; font-weight: 600;">
                🌐 Networking
              </div>
              <div style="color: #9090b0; font-size: 13px; margin-top: 2px;">
                Amplia tu red de contactos
              </div>
            </div>
          </label>
        </div>

        """
    content = content[:start_idx] + new_survey + content[end_idx:]

with open("landing/index.html", "w", encoding="utf-8") as f:
    f.write(content)
print("Landing format reverted!")
