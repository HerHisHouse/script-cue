import re

with open("landing/index.html", "r", encoding="utf-8") as f:
    content = f.read()

# 1. Hero Title
hero_old = r'<h1 class="hero-title">.*?Convierte cualquier guion en una experiencia de ensayo <span class="gradient-text">interactiva</span>.*?</h1>'
hero_new = '''<h1 class="hero-title">
                    Nunca más ensayes <span class="gradient-text">sin réplica</span>
                </h1>'''
content = re.sub(hero_old, hero_new, content, flags=re.IGNORECASE | re.DOTALL)

# 2. Add New Section before Features
pain_points_html = '''    <section class="pain-points" style="padding: 80px 0; text-align: center; background: rgba(255,255,255,0.02);">
        <div class="container">
            <h2 class="section-title" style="margin-bottom: 30px;">Lo sé, hemos pasado por esto.</h2>
            <p style="font-size: 18px; color: #9090b0; line-height: 1.8; max-width: 700px; margin: 0 auto 40px; text-align: left; padding: 20px; background: rgba(255,255,255,0.04); border-radius: 12px; border-left: 4px solid #a78bfa;">
                No encontrar a nadie que te dé la réplica.<br><br>
                Ensayar leyendo tú las respuestas del otro personaje.<br><br>
                Llegar al casting sin haber podido probar la escena en condiciones.<br><br>
                Memorizarte el texto a fuerza de repetirlo, sin ningún método.
            </p>
            <p style="font-size: 20px; color: #fff; font-weight: 600;">
                ScriptCue nace de ahí: de vivir esto en primera persona y decidir hacer algo con ello.
            </p>
        </div>
    </section>

    <div class="gradient-divider"></div>

    <!-- Features Section -->
    <section class="features" id="features">'''
content = content.replace('    <!-- Features Section -->\n    <section class="features" id="features">', pain_points_html)

# 3. Features Subtitle
feat_sub_old = "ScriptCue utiliza la tecnología para dar soluciones a las necesidades reales de actrices, actores y estudiantes de interpretación."
feat_sub_new = "Nada de funciones de relleno. Cada cosa que hace ScriptCue responde a un problema real que tenemos actrices, actores y estudiantes de interpretación."
content = content.replace(feat_sub_old, feat_sub_new)

# 4. Features Items
item1_old = "<strong>¿Sin compi para ensayar?</strong> — No hay problema, la IA te dará la réplica de todos los personajes para practicar."
item1_new = "<strong>¿Sin compi para ensayar?</strong> La IA te da la réplica de todos los personajes, las veces que necesites."
content = content.replace(item1_old, item1_new)

item3_old = "<strong>Memoriza sin bloqueos</strong> — Si te atascas con un texto, prueba los juegos de memoria basados en el guion. ¡Memorizar jugando es más divertido!"
item3_new = "<strong>Memoriza sin bloqueos</strong> — ¿Te atascas con un texto? Prueba los juegos de memoria basados en tu guion. Memorizar jugando engancha más que repetir como un loro."
content = content.replace(item3_old, item3_new)

item4_old = "<strong>¿Tienes un casting?</strong> — Graba tu selftape con el texto visible en el teleprompter mientras actúas y escucharás la réplica en tiempo real."
item4_new = "<strong>¿Tienes un casting?</strong> — Graba tu self-tape con el texto en el teleprompter mientras actúas, y escucha la réplica en tiempo real. Sin depender de que alguien tenga un rato libre."
content = content.replace(item4_old, item4_new)

# 5. Remove Tutorial (How it works) section
tut_pattern = r'<!-- How It Works -->.*?<section class="how-it-works" id="how-it-works">.*?</section>'
content = re.sub(tut_pattern, '', content, flags=re.IGNORECASE | re.DOTALL)

with open("landing/index.html", "w", encoding="utf-8") as f:
    f.write(content)

print("Landing page text modifications applied successfully.")
