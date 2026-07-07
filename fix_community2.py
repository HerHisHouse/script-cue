import re

with open("landing/index.html", "r", encoding="utf-8") as f:
    content = f.read()

# 1. Update Title
old_title = """      La comunidad de actores<br/>
      <span style="color: #a78bfa;">que siempre quisiste tener</span>"""
new_title = """      Cuando la <span style="color: #a78bfa;">IA</span> no sea suficiente<br/>
      <span style="color: #a78bfa;">estará la Comunidad ScriptCue</span>"""
content = content.replace(old_title, new_title)

# 2. Update Success Title
content = content.replace("¡Apuntado!", "¡Gracias por apuntarte!")

# 3. Replace the 4 informative cards
start_str = """    <!-- Cards de features de la comunidad -->
    <div style="
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
      gap: 16px;
      margin-bottom: 56px;
    ">"""

end_str = """    <!-- Formulario de lista de espera + encuesta -->"""

start_idx = content.find(start_str)
end_idx = content.find(end_str)

new_cards = """    <!-- Cards de features de la comunidad -->
    <div style="
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 24px;
      margin-bottom: 56px;
    ">
        <div class="mode-card">
            <div class="mode-header">
                <div class="mode-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                        <circle cx="9" cy="7" r="4"></circle>
                        <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                        <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                    </svg>
                </div>
                <h3 class="mode-title" style="margin:0; font-size: 18px;">Réplica real</h3>
            </div>
            <p class="mode-description">Encuentra actores y actrices con quienes ensayar escenas, preparar castings y grabar selftapes con una réplica humana.</p>
        </div>
        
        <div class="mode-card">
            <div class="mode-header">
                <div class="mode-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                        <circle cx="12" cy="10" r="3"></circle>
                    </svg>
                </div>
                <h3 class="mode-title" style="margin:0; font-size: 18px;">Cerca de ti</h3>
            </div>
            <p class="mode-description">¿Tienes una prueba mañana? Filtra por tu ciudad y encuentra alguien disponible para darte la réplica en ese mismo momento.</p>
        </div>
        
        <div class="mode-card">
            <div class="mode-header">
                <div class="mode-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
                        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
                    </svg>
                </div>
                <h3 class="mode-title" style="margin:0; font-size: 18px;">Colaboraciones</h3>
            </div>
            <p class="mode-description">Conecta con profesionales para crear proyectos, cortometrajes, talleres o lecturas de guion.</p>
        </div>
        
        <div class="mode-card">
            <div class="mode-header">
                <div class="mode-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"></rect>
                        <line x1="7" y1="2" x2="7" y2="22"></line>
                        <line x1="17" y1="2" x2="17" y2="22"></line>
                        <line x1="2" y1="12" x2="22" y2="12"></line>
                        <line x1="2" y1="7" x2="7" y2="7"></line>
                        <line x1="2" y1="17" x2="7" y2="17"></line>
                        <line x1="17" y1="17" x2="22" y2="17"></line>
                        <line x1="17" y1="7" x2="22" y2="7"></line>
                    </svg>
                </div>
                <h3 class="mode-title" style="margin:0; font-size: 18px;">Grupos de ensayo</h3>
            </div>
            <p class="mode-description">Forma parte de un grupo estable con el que preparar escenas, castings y proyectos de forma continuada.</p>
        </div>
        
        <div class="mode-card">
            <div class="mode-header">
                <div class="mode-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M22 10v6M2 10l10-5 10 5-10 5z"></path>
                        <path d="M6 12v5c3 3 9 3 12 0v-5"></path>
                    </svg>
                </div>
                <h3 class="mode-title" style="margin:0; font-size: 18px;">Feedback de profesionales</h3>
            </div>
            <p class="mode-description">Coaches y directoras/es podrán revisar tus escenas y ayudarte con observaciones prácticas y constructivas.</p>
        </div>
        
        <div class="mode-card">
            <div class="mode-header">
                <div class="mode-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="10"></circle>
                        <line x1="2" y1="12" x2="22" y2="12"></line>
                        <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
                    </svg>
                </div>
                <h3 class="mode-title" style="margin:0; font-size: 18px;">Networking</h3>
            </div>
            <p class="mode-description">Conoce profesionales del sector. Amplía tu red de contactos mientras practicas.</p>
        </div>
    </div>
    
"""

if start_idx != -1 and end_idx != -1:
    content = content[:start_idx] + new_cards + content[end_idx:]
    with open("landing/index.html", "w", encoding="utf-8") as f:
        f.write(content)
    print("Update successful!")
else:
    print("Could not find target strings.")

