import re

with open("landing/index.html", "r", encoding="utf-8") as f:
    content = f.read()

# 1. Update subtitle
old_subtitle = """      La IA está bien. Una persona de verdad es otra cosa.<br/>
      Estamos construyendo el espacio donde actores y actrices
      de toda España podrán encontrarse, ensayar juntos y grabarse
      los castings con réplica real."""
new_subtitle = """      Cuando la <span style="color: #a78bfa;">IA</span> no sea suficiente<br/>
      <span style="color: #a78bfa;">estará la Comunidad ScriptCue</span>"""
content = content.replace(old_subtitle, new_subtitle)

# 2. Update Success Title
content = content.replace("¡Apuntado!", "¡Gracias por apuntarte!")

# 3. Replace the community options with new grid and CSS
new_options = """
        <style>
        .community-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
            gap: 20px;
            margin-bottom: 32px;
        }
        .community-card-label {
            cursor: pointer;
            display: block;
            position: relative;
            -webkit-tap-highlight-color: transparent;
        }
        .community-card-label input[type="checkbox"] {
            position: absolute;
            opacity: 0;
            pointer-events: none;
        }
        .community-card {
            background: var(--bg-card);
            border: 1px solid var(--border-color);
            border-radius: 20px;
            padding: 28px;
            transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
            position: relative;
            overflow: hidden;
            transform: translateY(0);
            height: 100%;
            box-sizing: border-box;
        }
        .community-card::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            height: 3px;
            background: var(--gradient-primary);
            opacity: 0;
            transition: opacity 0.4s ease, height 0.4s ease;
        }
        .community-card-label:hover .community-card {
            transform: translateY(-8px);
            border-color: var(--border-color-hover);
            box-shadow: 0 12px 30px rgba(0, 0, 0, 0.2), 0 0 15px rgba(168, 85, 247, 0.08);
            z-index: 2;
        }
        .community-card-label:hover .community-card::before {
            opacity: 1;
        }
        .community-card-label:has(input:checked) .community-card {
            border-color: #a78bfa;
            background: rgba(168, 85, 247, 0.03);
            box-shadow: 0 8px 24px rgba(168, 85, 247, 0.12);
        }
        .community-card-label:has(input:checked) .community-card::before {
            opacity: 1;
            height: 4px;
        }
        /* Fallback for older browsers not supporting :has */
        .community-card-label input[type="checkbox"]:checked ~ .community-card {
            border-color: #a78bfa;
            background: rgba(168, 85, 247, 0.03);
            box-shadow: 0 8px 24px rgba(168, 85, 247, 0.12);
        }
        .community-card-label input[type="checkbox"]:checked ~ .community-card::before {
            opacity: 1;
            height: 4px;
        }
        </style>
        
        <div class="community-grid">
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
                        <h3 class="mode-title">Réplica real</h3>
                    </div>
                    <p class="mode-description">Encuentra actores y actrices con quienes ensayar escenas, preparar castings y grabar selftapes con una réplica humana.</p>
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
                        <h3 class="mode-title">Cerca de ti</h3>
                    </div>
                    <p class="mode-description">¿Tienes una prueba mañana? Filtra por tu ciudad y encuentra alguien disponible para darte la réplica en ese mismo momento.</p>
                </div>
            </label>
            
            <label class="community-card-label">
                <input type="checkbox" value="colaboraciones" />
                <div class="community-card">
                    <div class="mode-header">
                        <div class="mode-icon">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
                                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
                            </svg>
                        </div>
                        <h3 class="mode-title">Colaboraciones</h3>
                    </div>
                    <p class="mode-description">Conecta con profesionales para crear proyectos, cortometrajes, talleres o lecturas de guion.</p>
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
                    <p class="mode-description">Forma parte de un grupo estable con el que preparar escenas, castings y proyectos de forma continuada.</p>
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
                        <h3 class="mode-title">Feedback de profesionales</h3>
                    </div>
                    <p class="mode-description">Coaches y directoras/es podrán revisar tus escenas y ayudarte con observaciones prácticas y constructivas.</p>
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
                    <p class="mode-description">Conoce profesionales del sector. Amplía tu red de contactos mientras practicas.</p>
                </div>
            </label>
        </div>"""

# Replace the existing div with gap: 10px that contains all labels
start_str = '<div style="display: flex; flex-direction: column; gap: 10px; margin-bottom: 24px;">'
# find end of that div (it ends just before <!-- Campo email -->)
end_str = '<!-- Campo email -->'
start_idx = content.find(start_str)
end_idx = content.find(end_str)

if start_idx != -1 and end_idx != -1:
    content = content[:start_idx] + new_options + "\n        " + content[end_idx:]

    # Remove the old style block:
    # <style>
    #   .community-option:hover { ... }
    #   ...
    #   #community-submit:disabled { ... }
    # </style>
    old_style_start = content.find('<style>\n  .community-option:hover {')
    old_style_end = content.find('</style>', old_style_start) + 8
    
    if old_style_start != -1:
        # Keep the submit and focus styles which are needed for other inputs
        kept_styles = """
<style>
  #community-email:focus,
  #community-ciudad:focus {
    border-color: #a78bfa !important;
  }
  #community-submit:hover {
    opacity: 0.9;
    transform: translateY(-1px);
  }
  #community-submit:active {
    transform: translateY(0);
  }
  #community-submit:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    transform: none;
  }
</style>"""
        content = content[:old_style_start] + kept_styles + content[old_style_end:]

    # also make the container wider
    content = content.replace("max-width: 640px;", "max-width: 1000px;")
    
    # Change JS logic for the checkboxes (which used .community-option input[type="checkbox"])
    content = content.replace("'.community-option input[type=\"checkbox\"]:checked'", "'.community-card-label input[type=\"checkbox\"]:checked'")

    with open("landing/index.html", "w", encoding="utf-8") as f:
        f.write(content)
    print("Update successful!")
else:
    print("Could not find the target strings for replacement.")

