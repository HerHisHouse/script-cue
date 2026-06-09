import re

with open("landing/index.html", "r") as f:
    content = f.read()

# 1. Hero title & subtitle
content = re.sub(
    r'<h1 class="hero-title">.*?</h1>',
    '<h1 class="hero-title">\n                    Convierte cualquier guion en una experiencia de ensayo <span class="gradient-text">interactiva</span>\n                </h1>',
    content,
    flags=re.DOTALL
)

content = re.sub(
    r'<p class="hero-subtitle">.*?</p>',
    '<p class="hero-subtitle">\n                    Practica escenas con voces IA, memoriza diálogos mediante juegos, graba self-tapes y descubre nuevas formas de abordar tu personaje. La réplica que siempre necesitaste, disponible 24/7\n                </p>',
    content,
    flags=re.DOTALL
)

# 2. Replace Cascade with Video Tutorial
video_html = """    <!-- Video Tutorial Section -->
    <section class="video-tutorial" id="tutorial">
        <div class="container">
            <div class="section-header">
                <span class="section-badge">Tutorial</span>
                <h2 class="section-title">Aprende a usar <span class="gradient-text">ScriptCue</span></h2>
                <p class="section-subtitle">Descubre en este breve vídeo cómo importar tus guiones y empezar a ensayar con la IA.</p>
            </div>
            <div class="video-placeholder">
                <div class="play-button">
                    <svg viewBox="0 0 24 24" fill="currentColor">
                        <path d="M8 5v14l11-7z" />
                    </svg>
                </div>
            </div>
        </div>
    </section>"""
content = re.sub(
    r'<!-- Mockups Cascade Section -->.*?</section>',
    video_html,
    content,
    flags=re.DOTALL
)

# 3. Update Casting text
old_casting = r'<p class="mode-description">Graba tus selftapes con la réplica por IA y ya no tendrás que pedírselo a tu pareja. Graba presentaciones largas con Telepormpter. No pierdas una audición por no tener quien te de la réplica.</p>'
new_casting = '<p class="mode-description">Graba tus selftapes con la réplica por IA y ya no dependerás de la disponibilidad de alguien. Graba presentaciones largas con Teleprompter. No pierdas una audición por no tener quien te de la réplica.</p>'
content = content.replace(old_casting, new_casting)

# 4 & 5. Add Pricing and Reviews sections before FAQs
pricing_and_reviews_html = """
    <!-- Reviews Section -->
    <section class="reviews" id="reviews">
        <div class="container">
            <div class="section-header">
                <span class="section-badge">Testimonios</span>
                <h2 class="section-title">Lo que dicen <span class="gradient-text">nuestros usuarios</span></h2>
                <p class="section-subtitle">Descubre cómo ScriptCue está ayudando a otros actores y actrices.</p>
            </div>
            <div class="reviews-grid">
                <div class="review-card">
                    <div class="review-stars">★★★★★</div>
                    <p class="review-text">"Increíble herramienta. Me ha salvado la vida para preparar selftapes de última hora."</p>
                    <div class="review-author">- Usuario de ejemplo</div>
                </div>
                <div class="review-card">
                    <div class="review-stars">★★★★★</div>
                    <p class="review-text">"La mejor app para memorizar textos. Muy recomendable."</p>
                    <div class="review-author">- Usuario de ejemplo</div>
                </div>
                <div class="review-card">
                    <div class="review-stars">★★★★★</div>
                    <p class="review-text">"Las voces de IA suenan muy naturales, parece que ensayo con alguien real."</p>
                    <div class="review-author">- Usuario de ejemplo</div>
                </div>
            </div>
        </div>
    </section>

    <div class="gradient-divider"></div>

    <!-- Pricing Section -->
    <section class="pricing" id="pricing">
        <div class="container">
            <div class="section-header">
                <span class="section-badge">Planes</span>
                <h2 class="section-title">Elige el plan ideal <span class="gradient-text">para ti</span></h2>
                <p class="section-subtitle">Tenemos opciones adaptadas a cada necesidad, desde estudiantes hasta profesionales.</p>
            </div>
            <div class="pricing-grid">
                <!-- Free Plan -->
                <div class="pricing-card">
                    <h3 class="pricing-title">Gratuito</h3>
                    <div class="pricing-price">0€<span>/mes</span></div>
                    <ul class="pricing-features">
                        <li>Funciones básicas de lectura</li>
                        <li>Límites en importación</li>
                        <li>Voces del sistema</li>
                    </ul>
                    <a href="#download" class="btn btn-secondary pricing-btn">Probar gratis</a>
                </div>
                <!-- Basic Plan -->
                <div class="pricing-card highlighted">
                    <div class="pricing-badge">Más popular</div>
                    <h3 class="pricing-title">Básico</h3>
                    <div class="pricing-price">--€<span>/mes</span></div>
                    <ul class="pricing-features">
                        <li>Importación ilimitada</li>
                        <li>Acceso a modos de estudio</li>
                        <li>Voces IA estándar</li>
                    </ul>
                    <a href="#download" class="btn btn-primary pricing-btn">Elegir Básico</a>
                </div>
                <!-- Premium Plan -->
                <div class="pricing-card">
                    <h3 class="pricing-title">Premium</h3>
                    <div class="pricing-price">--€<span>/mes</span></div>
                    <ul class="pricing-features">
                        <li>Todas las características</li>
                        <li>Voces IA de máxima calidad</li>
                        <li>Soporte prioritario</li>
                    </ul>
                    <a href="#download" class="btn btn-secondary pricing-btn">Elegir Premium</a>
                </div>
            </div>
        </div>
    </section>

    <div class="gradient-divider"></div>
"""

content = content.replace('    <!-- FAQs Section -->', pricing_and_reviews_html + '\n    <!-- FAQs Section -->')

# 6. Update Copyright
content = content.replace('&copy; 2025 ScriptCue', '&copy; 2026 ScriptCue')

with open("landing/index.html", "w") as f:
    f.write(content)

# Now update styles.css
with open("landing/styles.css", "r") as f:
    css = f.read()

new_css = """
/* =============================================
   Video Tutorial
   ============================================= */
.video-tutorial {
    background: transparent;
}

.video-placeholder {
    max-width: 800px;
    margin: 0 auto;
    height: 450px;
    background: var(--bg-card);
    border: 1px solid var(--border-color);
    border-radius: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
    cursor: pointer;
    box-shadow: var(--shadow-glow);
    transition: var(--transition-normal);
}

.video-placeholder:hover {
    border-color: var(--accent-primary);
    transform: translateY(-5px);
}

.play-button {
    width: 80px;
    height: 80px;
    background: var(--gradient-primary);
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    box-shadow: 0 10px 20px rgba(168, 85, 247, 0.4);
    transition: var(--transition-normal);
}

.play-button svg {
    width: 32px;
    height: 32px;
    margin-left: 6px;
}

.video-placeholder:hover .play-button {
    transform: scale(1.1);
}

/* =============================================
   Reviews
   ============================================= */
.reviews {
    background: transparent;
}

.reviews-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    gap: 30px;
    margin-top: 40px;
}

.review-card {
    background: var(--bg-card);
    border: 1px solid var(--border-color);
    border-radius: 20px;
    padding: 30px;
    transition: var(--transition-normal);
}

.review-card:hover {
    border-color: var(--border-color-hover);
    transform: translateY(-5px);
}

.review-stars {
    color: #F59E0B;
    font-size: 1.5rem;
    margin-bottom: 16px;
    letter-spacing: 2px;
}

.review-text {
    font-size: 1.05rem;
    color: var(--text-primary);
    line-height: 1.6;
    margin-bottom: 20px;
    font-style: italic;
}

.review-author {
    font-size: 0.9rem;
    color: var(--text-secondary);
    font-weight: 500;
}

/* =============================================
   Pricing
   ============================================= */
.pricing {
    background: transparent;
}

.pricing-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    gap: 30px;
    margin-top: 40px;
    align-items: center;
}

.pricing-card {
    background: var(--bg-card);
    border: 1px solid var(--border-color);
    border-radius: 24px;
    padding: 40px;
    display: flex;
    flex-direction: column;
    position: relative;
    transition: var(--transition-normal);
}

.pricing-card:hover {
    border-color: var(--border-color-hover);
    transform: translateY(-5px);
}

.pricing-card.highlighted {
    border-color: var(--accent-primary);
    background: linear-gradient(180deg, rgba(168, 85, 247, 0.05) 0%, rgba(15, 23, 42, 0) 100%);
    box-shadow: var(--shadow-glow);
    padding: 50px 40px;
}

.pricing-badge {
    position: absolute;
    top: -14px;
    left: 50%;
    transform: translateX(-50%);
    background: var(--gradient-primary);
    color: white;
    padding: 6px 16px;
    border-radius: 20px;
    font-size: 0.85rem;
    font-weight: 600;
    box-shadow: 0 4px 10px rgba(168, 85, 247, 0.4);
}

.pricing-title {
    font-size: 1.5rem;
    font-weight: 600;
    margin-bottom: 16px;
    color: var(--text-primary);
}

.pricing-price {
    font-size: 3rem;
    font-weight: 700;
    margin-bottom: 30px;
    color: var(--text-primary);
}

.pricing-price span {
    font-size: 1rem;
    color: var(--text-secondary);
    font-weight: 400;
}

.pricing-features {
    list-style: none;
    padding: 0;
    margin: 0 0 40px 0;
    flex-grow: 1;
}

.pricing-features li {
    padding: 12px 0;
    border-bottom: 1px solid var(--border-color);
    color: var(--text-secondary);
    font-size: 0.95rem;
    display: flex;
    align-items: center;
}

.pricing-features li::before {
    content: "✓";
    color: var(--accent-primary);
    font-weight: bold;
    margin-right: 12px;
}

.pricing-btn {
    width: 100%;
    justify-content: center;
}
"""

if "/* =============================================\n   Video Tutorial" not in css:
    css += "\n" + new_css

# Also remove cascade css if we want, or just leave it since it's not hurting. Let's leave it to avoid breaking anything.

with open("landing/styles.css", "w") as f:
    f.write(css)

print("Done updating index.html and styles.css")
