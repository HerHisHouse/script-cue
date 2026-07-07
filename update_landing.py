import re

with open("landing/index.html", "r", encoding="utf-8") as f:
    content = f.read()

# 1. Update Subtitle
old_subtitle = """      Estamos construyendo el espacio donde actores y actrices
      de toda España podrán encontrarse, ensayar juntos y grabarse
      los castings con réplica real."""
new_subtitle = """      Estamos creando una comunidad donde actores y actrices podrán encontrarse, preparar castings juntos, crear grupos de ensayo y ayudarse mutuamente a crecer profesionalmente."""
content = content.replace(old_subtitle, new_subtitle)

# 2. Update Informative Card "Colaboraciones" -> "Oportunidades"
# We need to replace the card title and description and icon.
old_colab = """<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
                        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
                    </svg>
                </div>
                <h3 class="mode-title" style="margin:0; font-size: 18px;">Colaboraciones</h3>
            </div>
            <p class="mode-description">Conecta con profesionales para crear proyectos, cortometrajes, talleres o lecturas de guion.</p>"""

new_colab = """<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="2" y="6" width="20" height="12" rx="2" ry="2"></rect>
                        <path d="M2 12h20"></path>
                        <path d="M6 6v12"></path>
                        <path d="M10 6v12"></path>
                        <path d="M14 6v12"></path>
                        <path d="M18 6v12"></path>
                    </svg>
                </div>
                <h3 class="mode-title" style="margin:0; font-size: 18px;">Oportunidades</h3>
            </div>
            <p class="mode-description">Descubre proyectos, castings, talleres y colaboraciones compartidas por la comunidad.</p>"""
content = content.replace(old_colab, new_colab)

# 3. Update Survey title and subtitle
content = content.replace("¿Qué te interesaría más?", "¿Qué te interesaría más de la comunidad?")
content = content.replace("Cuéntanos qué necesitas y te avisamos cuando esté listo.\n          Selecciona todas las que quieras.", "Cuéntanos tus intereses. Selecciona todas las que quieras.")
content = content.replace("Cuéntanos qué necesitas y te avisamos cuando esté listo.", "Cuéntanos tus intereses.")

# 4. Replace survey options
# We will use regex to find the community-grid div and replace its contents.
grid_start = '<div class="community-grid">'
grid_end = '<!-- Campo email -->'
start_idx = content.find(grid_start)
end_idx = content.find(grid_end)

new_grid = """<div class="community-grid">
            <label class="community-card-label">
                <input type="checkbox" value="replica" />
                <div class="community-card">
                    <div class="mode-header">
                        <div class="mode-icon">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                                <circle cx="9" cy="7" r="4"></circle>
                                <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                                <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                            </svg>
                        </div>
                        <h3 class="mode-title">Encontrar pareja de escena</h3>
                    </div>
                    <p class="mode-description">Para que te den una réplica real y humana</p>
                </div>
            </label>
            
            <label class="community-card-label">
                <input type="checkbox" value="ciudad" />
                <div class="community-card">
                    <div class="mode-header">
                        <div class="mode-icon">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                                <circle cx="12" cy="10" r="3"></circle>
                            </svg>
                        </div>
                        <h3 class="mode-title">Buscar en mi ciudad</h3>
                    </div>
                    <p class="mode-description">Conectar con gente del gremio cerca de ti</p>
                </div>
            </label>
            
            <label class="community-card-label">
                <input type="checkbox" value="proyectos" />
                <div class="community-card">
                    <div class="mode-header">
                        <div class="mode-icon">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <rect x="2" y="6" width="20" height="12" rx="2" ry="2"></rect>
                                <path d="M2 12h20"></path>
                                <path d="M6 6v12"></path>
                                <path d="M10 6v12"></path>
                                <path d="M14 6v12"></path>
                                <path d="M18 6v12"></path>
                            </svg>
                        </div>
                        <h3 class="mode-title">Proyectos</h3>
                    </div>
                    <p class="mode-description">Descubre proyectos o castings compartidos por la comunidad.</p>
                </div>
            </label>
            
            <label class="community-card-label">
                <input type="checkbox" value="grupos" />
                <div class="community-card">
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
                        <h3 class="mode-title">Grupos de ensayo</h3>
                    </div>
                    <p class="mode-description">Grupos estables para crear o ensayar</p>
                </div>
            </label>
            
            <label class="community-card-label">
                <input type="checkbox" value="feedback_pro" />
                <div class="community-card">
                    <div class="mode-header">
                        <div class="mode-icon">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M22 10v6M2 10l10-5 10 5-10 5z"></path>
                                <path d="M6 12v5c3 3 9 3 12 0v-5"></path>
                            </svg>
                        </div>
                        <h3 class="mode-title">Feedback profesional</h3>
                    </div>
                    <p class="mode-description">Concertar sesiones con coaches profesionales</p>
                </div>
            </label>
            
            <label class="community-card-label">
                <input type="checkbox" value="networking" />
                <div class="community-card">
                    <div class="mode-header">
                        <div class="mode-icon">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <circle cx="12" cy="12" r="10"></circle>
                                <line x1="2" y1="12" x2="22" y2="12"></line>
                                <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
                            </svg>
                        </div>
                        <h3 class="mode-title">Networking</h3>
                    </div>
                    <p class="mode-description">Amplia tu red de contactos</p>
                </div>
            </label>
        </div>
        
        """
if start_idx != -1 and end_idx != -1:
    content = content[:start_idx] + new_grid + content[end_idx:]

# 5. City input
old_city_input = """        <!-- Campo ciudad (opcional) -->
        <div style="margin-bottom: 24px;">
          <input
            type="text"
            id="community-ciudad"
            placeholder="¿En qué ciudad estás? (opcional)"
            style="
              width: 100%;
              background: rgba(255,255,255,0.07);
              border: 1.5px solid rgba(255,255,255,0.12);
              border-radius: 10px;
              padding: 14px 16px;
              color: #ffffff;
              font-size: 15px;
              outline: none;
              box-sizing: border-box;
              transition: border-color 0.2s ease;
            "
          />
        </div>"""

provinces = ["Álava", "Albacete", "Alicante", "Almería", "Ávila", "Badajoz", "Baleares", "Barcelona", "Burgos", "Cáceres", "Cádiz", "Castellón", "Ciudad Real", "Córdoba", "A Coruña", "Cuenca", "Girona", "Granada", "Guadalajara", "Gipuzkoa", "Huelva", "Huesca", "Jaén", "León", "Lleida", "La Rioja", "Lugo", "Madrid", "Málaga", "Murcia", "Navarra", "Ourense", "Asturias", "Palencia", "Las Palmas", "Pontevedra", "Salamanca", "Santa Cruz de Tenerife", "Cantabria", "Segovia", "Sevilla", "Soria", "Tarragona", "Teruel", "Toledo", "Valencia", "Valladolid", "Bizkaia", "Zamora", "Zaragoza", "Ceuta", "Melilla"]
options = "".join([f'<option value="{p}">{p}</option>' for p in provinces])

new_city_input = f"""        <!-- Campo ciudad (multi-select) -->
        <div style="margin-bottom: 24px;">
          <select
            id="community-ciudad"
            multiple
            data-placeholder="¿En qué ciudad(es) estás?"
            style="
              width: 100%;
            "
          >
            {options}
          </select>
        </div>"""

content = content.replace(old_city_input, new_city_input)

# Add TomSelect for nice multi-select searchable dropdown
head_end = content.find('</head>')
if head_end != -1:
    tomselect_tags = """
    <!-- TomSelect for searchable multi-select -->
    <link href="https://cdn.jsdelivr.net/npm/tom-select@2.2.2/dist/css/tom-select.css" rel="stylesheet">
    <script src="https://cdn.jsdelivr.net/npm/tom-select@2.2.2/dist/js/tom-select.complete.min.js"></script>
    <style>
      .ts-control {
        background: rgba(255,255,255,0.07) !important;
        border: 1.5px solid rgba(255,255,255,0.12) !important;
        border-radius: 10px !important;
        padding: 14px 16px !important;
        color: #ffffff !important;
      }
      .ts-control input {
        color: #ffffff !important;
      }
      .ts-wrapper.multi .ts-control > div {
        background: rgba(167,139,250,0.2) !important;
        color: #a78bfa !important;
        border: 1px solid rgba(167,139,250,0.4) !important;
        border-radius: 6px !important;
      }
      .ts-dropdown {
        background: #1a1728 !important;
        border: 1px solid rgba(255,255,255,0.12) !important;
        color: #ffffff !important;
        border-radius: 10px !important;
      }
      .ts-dropdown .option:hover, .ts-dropdown .option.active {
        background: rgba(124,106,247,0.2) !important;
        color: #ffffff !important;
      }
    </style>
"""
    content = content[:head_end] + tomselect_tags + content[head_end:]

# Initialize TomSelect and update JS validation
init_script = """<script>
  document.addEventListener("DOMContentLoaded", function() {
    new TomSelect("#community-ciudad",{
      plugins: ['remove_button'],
      create: false,
      maxItems: null,
    });
  });
</script>
"""
content = content.replace("</body>", init_script + "</body>")

# In JS, change how `ciudad` is collected.
# old: const ciudad = document.getElementById('community-ciudad').value.trim();
# new: for TomSelect or standard multi select, we can get array of values. 
# But wait, TomSelect handles the `<select multiple>` by updating its `.value` as a comma separated string by default (or array depending on how it's called, actually `select.value` returns first element, but TomSelect might override or we can get `instance.getValue()`). 
# Better: get values from the select element options.
js_old = "const ciudad = document.getElementById('community-ciudad').value.trim();"
js_new = """const ciudadSelect = document.getElementById('community-ciudad');
    const ciudad = Array.from(ciudadSelect.selectedOptions).map(opt => opt.value).join(', ');"""
content = content.replace(js_old, js_new)

# Add validation for ciudad
val_old = "if (intereses.length === 0) {"
val_new = """if (!ciudad) {
      errorDiv.textContent = 'Selecciona al menos una ciudad.';
      errorDiv.style.display = 'block';
      return;
    }

    if (intereses.length === 0) {"""
content = content.replace(val_old, val_new)

with open("landing/index.html", "w", encoding="utf-8") as f:
    f.write(content)
print("Landing page updated successfully!")
