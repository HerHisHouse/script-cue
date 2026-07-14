import re

with open("landing/index.html", "r", encoding="utf-8") as f:
    content = f.read()

# CTA Title
content = content.replace("¿Te animas a unirte a ScriptCue?", "¿Le damos réplica a tu próximo papel?")

# CTA Subtitle
content = content.replace("Practica, memoriza, analiza y explora cada escena.", "Practica cuando quieras, memoriza sin volverte loco y llega al próximo casting habiéndolo probado ya todo.")

# Meta Title
content = content.replace("<title>ScriptCue - Tu compañero de escena con IA</title>", "<title>ScriptCue - Tu réplica en escena con IA</title>")
# In case it has a different format, we can use regex
content = re.sub(
    r'<title>.*?</title>',
    '<title>ScriptCue - Tu réplica en escena con IA</title>',
    content,
    flags=re.IGNORECASE
)

# Meta Description
content = re.sub(
    r'<meta name="description" content=".*?"',
    '<meta name="description" content="Practica cualquier guion con voces de inteligencia artificial, memoriza sin agobios y graba tu self-tape cuando lo necesites. Disponible en App Store y Google Play."',
    content,
    flags=re.IGNORECASE
)

# Replace Open Graph properties as well if they exist
content = re.sub(
    r'<meta property="og:title" content=".*?"',
    '<meta property="og:title" content="ScriptCue - Tu réplica en escena con IA"',
    content,
    flags=re.IGNORECASE
)
content = re.sub(
    r'<meta property="og:description" content=".*?"',
    '<meta property="og:description" content="Practica cualquier guion con voces de inteligencia artificial, memoriza sin agobios y graba tu self-tape cuando lo necesites. Disponible en App Store y Google Play."',
    content,
    flags=re.IGNORECASE
)
content = re.sub(
    r'<meta name="twitter:title" content=".*?"',
    '<meta name="twitter:title" content="ScriptCue - Tu réplica en escena con IA"',
    content,
    flags=re.IGNORECASE
)
content = re.sub(
    r'<meta name="twitter:description" content=".*?"',
    '<meta name="twitter:description" content="Practica cualquier guion con voces de inteligencia artificial, memoriza sin agobios y graba tu self-tape cuando lo necesites. Disponible en App Store y Google Play."',
    content,
    flags=re.IGNORECASE
)

with open("landing/index.html", "w", encoding="utf-8") as f:
    f.write(content)

print("SEO and CTA text updated.")
