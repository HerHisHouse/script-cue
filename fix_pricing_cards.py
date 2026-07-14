import re

with open("landing/index.html", "r", encoding="utf-8") as f:
    content = f.read()

# CSS for toggle
css_toggle = """
<style>
.billing-toggle-container {
    display: flex;
    justify-content: center;
    align-items: center;
    margin-bottom: 50px;
    gap: 16px;
}
.switch {
    position: relative;
    display: inline-block;
    width: 56px;
    height: 30px;
}
.switch input {
    opacity: 0;
    width: 0;
    height: 0;
}
.slider {
    position: absolute;
    cursor: pointer;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: rgba(255, 255, 255, 0.1);
    border: 1px solid rgba(255, 255, 255, 0.2);
    transition: .4s;
}
.slider:before {
    position: absolute;
    content: "";
    height: 22px;
    width: 22px;
    left: 3px;
    bottom: 3px;
    background-color: #a78bfa;
    transition: .4s;
    box-shadow: 0 2px 5px rgba(0,0,0,0.3);
}
input:checked + .slider {
    background-color: rgba(167, 139, 250, 0.2);
    border-color: rgba(167, 139, 250, 0.5);
}
input:checked + .slider:before {
    transform: translateX(26px);
    background-color: #a78bfa;
}
.slider.round {
    border-radius: 34px;
}
.slider.round:before {
    border-radius: 50%;
}
.billing-label {
    font-size: 16px;
    transition: color 0.3s ease;
}
.billing-label.active {
    color: #fff;
    font-weight: 600;
}
.billing-label.inactive {
    color: #9090b0;
}
.save-badge {
    background: rgba(167, 139, 250, 0.15);
    color: #a78bfa;
    padding: 3px 8px;
    border-radius: 12px;
    font-size: 12px;
    font-weight: 600;
    margin-left: 8px;
    border: 1px solid rgba(167, 139, 250, 0.3);
}
.price-display {
    transition: opacity 0.3s ease;
}
</style>
"""

js_toggle = """
<script>
function toggleBilling() {
    const toggle = document.getElementById('billing-toggle');
    const isYearly = toggle.checked;
    
    // Update labels
    document.getElementById('label-monthly').className = isYearly ? 'billing-label inactive' : 'billing-label active';
    document.getElementById('label-yearly').className = isYearly ? 'billing-label active' : 'billing-label inactive';
    
    // Update prices
    const estPrice = document.getElementById('price-estudiante');
    const profPrice = document.getElementById('price-profesional');
    
    // Add small fade effect
    estPrice.style.opacity = 0;
    profPrice.style.opacity = 0;
    
    setTimeout(() => {
        if (isYearly) {
            estPrice.innerHTML = '39,99€<span class="price-period">/año</span>';
            profPrice.innerHTML = '84,99€<span class="price-period">/año</span>';
        } else {
            estPrice.innerHTML = '4,99€<span class="price-period">/mes</span>';
            profPrice.innerHTML = '9,99€<span class="price-period">/mes</span>';
        }
        estPrice.style.opacity = 1;
        profPrice.style.opacity = 1;
    }, 150);
}
</script>
</body>
"""

new_pricing_grid = """
            <div class="billing-toggle-container">
                <span id="label-monthly" class="billing-label active">Mensual</span>
                <label class="switch">
                    <input type="checkbox" id="billing-toggle" onchange="toggleBilling()">
                    <span class="slider round"></span>
                </label>
                <span id="label-yearly" class="billing-label inactive">Anual <span class="save-badge">Ahorra 2 meses</span></span>
            </div>

            <div class="pricing-grid">
                <!-- Plan Gratuito -->
                <div class="pricing-card">
                    <div class="pricing-header">
                        <h3 class="pricing-title">Gratuito</h3>
                        <div class="pricing-price">0€</div>
                        <p class="pricing-desc">Para descubrir ScriptCue y explorar cómo la IA puede transformar tu forma de ensayar.</p>
                    </div>
                    <ul class="pricing-features">
                        <li>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>
                            Hasta 2 guiones
                        </li>
                        <li>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>
                            <strong>Modo Estudio</strong> — practica escenas con réplica por IA
                        </li>
                        <li>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>
                            <strong>Modo Casting</strong> — graba tu selftape (hasta 2 min, con marca de agua)
                        </li>
                        <li>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>
                            Voces del sistema iOS y Android
                        </li>
                        <li>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>
                            1 sesión de prueba con voces de IA realistas
                        </li>
                        <li>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>
                            Escucha previews de todas las voces disponibles
                        </li>
                        <li>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>
                            Almacenamiento local en tu dispositivo
                        </li>
                    </ul>
                    <a href="#download" class="btn btn-secondary pricing-btn">Descargar Gratis</a>
                </div>

                <!-- Plan Estudiante -->
                <div class="pricing-card highlighted">
                    <div class="popular-badge">Popular</div>
                    <div class="pricing-header">
                        <h3 class="pricing-title">Estudiante</h3>
                        <div class="pricing-price price-display" id="price-estudiante">4,99€<span class="price-period">/mes</span></div>
                        <p class="pricing-desc">Para actores y actrices en formación que necesitan una herramienta de ensayo completa y asequible.</p>
                    </div>
                    <ul class="pricing-features">
                        <li style="color: #a78bfa; font-weight: 500; margin-bottom: 15px;">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color: #a78bfa;"><polyline points="20 6 9 17 4 12"></polyline></svg>
                            Todo lo del plan Gratuito, más:
                        </li>
                        <li>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>
                            Hasta 15 guiones/mes
                        </li>
                        <li>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>
                            Acceso a los 6 modos: Estudio, Casting, Memoria, Escena, Análisis y Coche
                        </li>
                        <li>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>
                            Voces del sistema + Azure + OpenAI
                        </li>
                        <li>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>
                            Grabaciones de Casting sin marca de agua ni límite de tiempo
                        </li>
                        <li>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>
                            Vídeos de hasta 500MB
                        </li>
                        <li>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>
                            Almacenamiento en la nube
                        </li>
                        <li>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>
                            Modo Escena con hasta 10 análisis al mes
                        </li>
                        <li>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>
                            Sin anuncios
                        </li>
                    </ul>
                    <a href="#download" class="btn btn-primary pricing-btn">Empieza ahora</a>
                </div>

                <!-- Plan Profesional -->
                <div class="pricing-card">
                    <div class="pricing-header">
                        <h3 class="pricing-title">Profesional</h3>
                        <div class="pricing-price price-display" id="price-profesional">9,99€<span class="price-period">/mes</span></div>
                        <p class="pricing-desc">Para actores y actrices que trabajan continuamente y necesitan lo mejor.</p>
                    </div>
                    <ul class="pricing-features">
                        <li style="color: #a78bfa; font-weight: 500; margin-bottom: 15px;">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color: #a78bfa;"><polyline points="20 6 9 17 4 12"></polyline></svg>
                            Todo lo del plan Estudiante, más:
                        </li>
                        <li>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>
                            Hasta 40 guiones/mes
                        </li>
                        <li>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>
                            Voces ElevenLabs — las más realistas del mercado
                        </li>
                        <li>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>
                            OpenAI TTS HD — máxima calidad de síntesis de voz
                        </li>
                        <li>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>
                            Vídeos de Casting de hasta 2GB
                        </li>
                        <li>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>
                            Modo Escena con hasta 30 análisis al mes
                        </li>
                        <li>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>
                            Acceso anticipado a nuevas funciones
                        </li>
                        <li>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>
                            Soporte prioritario
                        </li>
                    </ul>
                    <a href="#download" class="btn btn-secondary pricing-btn">Empieza ahora</a>
                </div>
            </div>"""

# Replace the pricing grid
content = re.sub(
    r'<div class="pricing-grid">.*?</div>\s*</div>\s*</section>',
    new_pricing_grid + '\n        </div>\n    </section>',
    content,
    flags=re.IGNORECASE | re.DOTALL
)

# Insert CSS into head
content = content.replace("</head>", css_toggle + "\n</head>")

# Insert JS at end of body
content = content.replace("</body>", js_toggle)

with open("landing/index.html", "w", encoding="utf-8") as f:
    f.write(content)

print("Pricing section updated with toggle and new plans.")
