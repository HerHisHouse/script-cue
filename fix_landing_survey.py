import re

with open("landing/index.html", "r", encoding="utf-8") as f:
    content = f.read()

# We need to replace the old survey options div.
# Let's find the old start: "<!-- Opciones de encuesta -->"
# And the end: "<!-- Campo ciudad"

start_str = "<!-- Opciones de encuesta -->"
end_str = "<!-- Campo ciudad"

start_idx = content.find(start_str)
end_idx = content.find(end_str)

if start_idx != -1 and end_idx != -1:
    new_survey = """<!-- Opciones de encuesta -->
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px; margin-bottom: 32px;">
            <label class="community-card-label">
                <input type="checkbox" value="replica" />
                <div class="mode-card community-card" style="height: 100%; margin-bottom: 0;">
                    <div class="mode-header">
                        <div class="mode-icon">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                                <circle cx="9" cy="7" r="4"></circle>
                                <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                                <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                            </svg>
                        </div>
                        <h3 class="mode-title" style="margin:0; font-size: 16px;">Encontrar pareja de escena</h3>
                    </div>
                    <p class="mode-description">Para que te den una réplica real y humana</p>
                </div>
            </label>
            
            <label class="community-card-label">
                <input type="checkbox" value="ciudad" />
                <div class="mode-card community-card" style="height: 100%; margin-bottom: 0;">
                    <div class="mode-header">
                        <div class="mode-icon">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                                <circle cx="12" cy="10" r="3"></circle>
                            </svg>
                        </div>
                        <h3 class="mode-title" style="margin:0; font-size: 16px;">Buscar en mi ciudad</h3>
                    </div>
                    <p class="mode-description">Conectar con gente del gremio cerca de ti</p>
                </div>
            </label>
            
            <label class="community-card-label">
                <input type="checkbox" value="proyectos" />
                <div class="mode-card community-card" style="height: 100%; margin-bottom: 0;">
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
                        <h3 class="mode-title" style="margin:0; font-size: 16px;">Proyectos</h3>
                    </div>
                    <p class="mode-description">Descubre proyectos o castings compartidos por la comunidad.</p>
                </div>
            </label>
            
            <label class="community-card-label">
                <input type="checkbox" value="grupos" />
                <div class="mode-card community-card" style="height: 100%; margin-bottom: 0;">
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
                        <h3 class="mode-title" style="margin:0; font-size: 16px;">Grupos de ensayo</h3>
                    </div>
                    <p class="mode-description">Grupos estables para crear o ensayar</p>
                </div>
            </label>
            
            <label class="community-card-label">
                <input type="checkbox" value="feedback_pro" />
                <div class="mode-card community-card" style="height: 100%; margin-bottom: 0;">
                    <div class="mode-header">
                        <div class="mode-icon">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M22 10v6M2 10l10-5 10 5-10 5z"></path>
                                <path d="M6 12v5c3 3 9 3 12 0v-5"></path>
                            </svg>
                        </div>
                        <h3 class="mode-title" style="margin:0; font-size: 16px;">Feedback profesional</h3>
                    </div>
                    <p class="mode-description">Concertar sesiones con coaches profesionales</p>
                </div>
            </label>
            
            <label class="community-card-label">
                <input type="checkbox" value="networking" />
                <div class="mode-card community-card" style="height: 100%; margin-bottom: 0;">
                    <div class="mode-header">
                        <div class="mode-icon">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <circle cx="12" cy="12" r="10"></circle>
                                <line x1="2" y1="12" x2="22" y2="12"></line>
                                <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
                            </svg>
                        </div>
                        <h3 class="mode-title" style="margin:0; font-size: 16px;">Networking</h3>
                    </div>
                    <p class="mode-description">Amplia tu red de contactos</p>
                </div>
            </label>
        </div>

        """
    content = content[:start_idx] + new_survey + content[end_idx:]

    # Also add styles for community-card-label and community-card 
    # to mimic the hover effects if they aren't fully there yet, 
    # but they use 'mode-card' which handles the border and hover!
    # Wait, input:checked needs to style the community-card inside.
    style_idx = content.find("</style>")
    if style_idx != -1:
        new_style = """
  .community-card-label {
    cursor: pointer;
    display: block;
  }
  .community-card-label input {
    display: none;
  }
  .community-card-label input:checked + .community-card {
    border-color: #a78bfa !important;
    background: rgba(124, 106, 247, 0.12) !important;
    border-top: 2px solid #a78bfa !important;
  }
"""
        content = content[:style_idx] + new_style + content[style_idx:]

with open("landing/index.html", "w", encoding="utf-8") as f:
    f.write(content)
print("Landing survey fixed!")
