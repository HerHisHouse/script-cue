import re

with open("landing/index.html", "r", encoding="utf-8") as f:
    content = f.read()

# 1. Planes Title
# Note: Old might have inline style, so we use regex
content = re.sub(
    r'<h2 class="section-title">Elige el plan ideal.*?</h2>', 
    '<h2 class="section-title">Un plan para cada momento <span class="gradient-text">de tu carrera</span></h2>',
    content,
    flags=re.IGNORECASE | re.DOTALL
)

# 2. Planes Subtitle
content = content.replace(
    "Tenemos opciones adaptadas a cada necesidad, desde estudiantes hasta profesionales.",
    "Desde si estás en un curso de interpretación hasta si vives de esto. Elige lo que necesites ahora y cambia cuando quieras."
)

# 3. Comunidad Title
# Need to match exactly what is there. It could be something like "Cuando la IA no sea suficiente <span ...>..."
# I'll just replace the inner HTML of the h2 in the community section. Let's find it.
# Usually it's something like <h2 class="section-title">Cuando la IA no sea suficiente...
content = re.sub(
    r'<h2 class="section-title">.*?Cuando la IA.*?Comunidad.*?</h2>',
    '<h2 class="section-title">Cuando la IA se quede corta,<br>estará la <span class="gradient-text">Comunidad ScriptCue</span></h2>',
    content,
    flags=re.IGNORECASE | re.DOTALL
)

# 4. Comunidad Subtitle
old_com_sub = "La IA está bien. Una persona de verdad es otra cosa. Estamos creando una comunidad donde actores y actrices podrán encontrarse, preparar castings juntos, crear grupos de ensayo y ayudarse mutuamente a crecer profesionalmente."
# Maybe there's a variation with 'y ayudarse a crecer profesionalmente' without 'mutuamente' or something. Let's use regex for safety.
content = re.sub(
    r'<p class="section-subtitle">La IA está bien.*?crecer profesionalmente\.</p>',
    '<p class="section-subtitle">La IA está bien. Pero una persona de verdad dándote la réplica es otra cosa. Estamos montando una comunidad para encontrarnos, preparar castings juntos, montar grupos de ensayo y ayudarnos a crecer.</p>',
    content,
    flags=re.IGNORECASE | re.DOTALL
)
# Just in case it's slightly different:
content = content.replace("Estamos creando una comunidad donde actores y actrices podrán encontrarse, preparar castings juntos y ayudarse a crecer profesionalmente.", "Estamos montando una comunidad para encontrarnos, preparar castings juntos, montar grupos de ensayo y ayudarnos a crecer.")

# 5. Oportunidades Card
content = content.replace(
    "Descubre proyectos, castings, talleres y colaboraciones compartidas por la comunidad.",
    "Descubre proyectos, castings, talleres y colaboraciones que comparte la comunidad."
)

# 6. Grupos de ensayo Card
content = content.replace(
    "Forma parte de un grupo estable con el que preparar escenas, castings y proyectos de forma continuada.",
    "Únete a un grupo estable para preparar escenas, castings y proyectos con continuidad."
)

# 7. Networking Card
content = content.replace(
    "Conoce profesionales del sector. Amplía tu red de contactos mientras practicas.",
    "Conoce a otros profesionales del sector y amplía tu red mientras practicas."
)
# Check for lowercase 'amplía' or no accent 'amplia'
content = content.replace(
    "Conoce profesionales del sector. Amplia tu red de contactos mientras practicas.",
    "Conoce a otros profesionales del sector y amplía tu red mientras practicas."
)

# 8. Networking Checkbox
content = content.replace(
    "Amplia tu red de contactos",
    "Amplía tu red de contactos"
)

with open("landing/index.html", "w", encoding="utf-8") as f:
    f.write(content)

print("Updates applied.")
