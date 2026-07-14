import re

with open("landing/index.html", "r", encoding="utf-8") as f:
    content = f.read()

# 1. Gratuito
# "<strong>Modo Estudio</strong> — practica escenas con réplica por IA" -> "Modo Estudio — practica escenas con réplica por IA"
content = content.replace(
    "<strong>Modo Estudio</strong> — practica escenas con réplica por IA",
    "Modo Estudio — practica escenas con réplica por IA"
)
# "<strong>Modo Casting</strong> — graba tu selftape (hasta 2 min, con marca de agua)" -> "Modo Casting — selftapes de 2 min con marca de agua"
content = content.replace(
    "<strong>Modo Casting</strong> — graba tu selftape (hasta 2 min, con marca de agua)",
    "Modo Casting — selftapes de 2 min con marca de agua"
)
# "1 sesión de prueba con voces de IA realistas" -> "1 sesión con voces IA realistas"
content = content.replace(
    "1 sesión de prueba con voces de IA realistas",
    "1 sesión con voces IA realistas"
)
# "Escucha previews de todas las voces disponibles" -> "Preescuchas de todas las voces"
content = content.replace(
    "Escucha previews de todas las voces disponibles",
    "Preescuchas de todas las voces"
)
# "Almacenamiento local en tu dispositivo" -> "Almacenamiento local"
content = content.replace(
    "Almacenamiento local en tu dispositivo",
    "Almacenamiento local"
)

# 2. Estudiante
# "Acceso a los 6 modos: Estudio, Casting, Memoria, Escena, Análisis y Coche" -> "Acceso a los 6 modos"
content = content.replace(
    "Acceso a los 6 modos: Estudio, Casting, Memoria, Escena, Análisis y Coche",
    "Acceso a los 6 modos"
)
# "Voces del sistema + Azure + OpenAI" -> "Voces Azure y OpenAI"
content = content.replace(
    "Voces del sistema + Azure + OpenAI",
    "Voces Azure y OpenAI"
)
# "Grabaciones de Casting sin marca de agua ni límite de tiempo" -> "Casting sin marca de agua ni límite"
content = content.replace(
    "Grabaciones de Casting sin marca de agua ni límite de tiempo",
    "Casting sin marca de agua ni límite"
)
# "Modo Escena con hasta 10 análisis al mes" -> "Modo Escena 10 análisis/mes"
content = content.replace(
    "Modo Escena con hasta 10 análisis al mes",
    "Modo Escena 10 análisis/mes"
)
# Elimina "<li>Sin anuncios</li>" in the Estudiante section
# There might be spacing/newlines around it. Let's use regex
content = re.sub(r'<li>Sin anuncios</li>\s*', '', content)

# 3. Profesional
# "Voces ElevenLabs — las más realistas del mercado" -> "Voces ElevenLabs con emociones"
content = content.replace(
    "Voces ElevenLabs — las más realistas del mercado",
    "Voces ElevenLabs con emociones"
)
# "OpenAI TTS HD — máxima calidad de síntesis de voz" -> "Voces OpenAI HD"
content = content.replace(
    "OpenAI TTS HD — máxima calidad de síntesis de voz",
    "Voces OpenAI HD"
)
# "Modo Escena con hasta 30 análisis al mes" -> "Modo Escena 30 análisis/mes"
content = content.replace(
    "Modo Escena con hasta 30 análisis al mes",
    "Modo Escena 30 análisis/mes"
)

# 4. Profesional button
# Change the specific button for "Profesional" plan
profesional_btn_old = '<a href="#download" class="btn btn-secondary pricing-btn">Empieza ahora</a>'
# Let's make sure we only replace the one in the Profesional card. Since the Gratuito card says "Descargar Gratis", this replace will only hit the Profesional card anyway!
# Oh wait, earlier we wrote `Empieza ahora` for BOTH Estudiante and Profesional. But Estudiante has `btn-primary`. So this works!
profesional_btn_new = '<a href="#download" class="btn btn-secondary pricing-btn" style="border-color: #a78bfa; color: #a78bfa;">Empieza ahora</a>'
content = content.replace(profesional_btn_old, profesional_btn_new)


with open("landing/index.html", "w", encoding="utf-8") as f:
    f.write(content)

print("Pricing text adjustments applied.")
