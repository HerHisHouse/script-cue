import re

with open("landing/index.html", "r", encoding="utf-8") as f:
    content = f.read()

# Plan Gratuito
content = content.replace(
    "<li>Hasta 2 guiones",
    "<li>Hasta 3 guiones"
)

# Plan Estudiante
content = content.replace(
    "<li>Hasta 15 guiones/mes",
    "<li>Hasta 20 guiones/mes"
)
content = content.replace(
    "<li>Voces Azure y OpenAI",
    "<li>Voces con calidad de estudio"
)

# Plan Profesional
content = content.replace(
    "<li>Hasta 40 guiones/mes",
    "<li>Hasta 50 guiones/mes"
)
content = content.replace(
    "<li>Voces ElevenLabs con emociones",
    "<li>Voces con emoción y matices interpretativos"
)
content = re.sub(r'<li>Voces OpenAI HD\s*</li>\s*', '', content)

# Badge Replacement
content = content.replace(
    '<div class="popular-badge">Popular</div>',
    '<div class="pricing-badge" style="text-transform: uppercase; letter-spacing: 1px; font-size: 11px;">MÁS POPULAR</div>'
)

with open("landing/index.html", "w", encoding="utf-8") as f:
    f.write(content)

print("Pricing text and badge updated.")
