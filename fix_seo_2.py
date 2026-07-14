import re

with open("landing/index.html", "r", encoding="utf-8") as f:
    content = f.read()

new_desc = "Practica cualquier guion con voces de inteligencia artificial, memoriza sin agobios y graba tu self-tape cuando lo necesites. Disponible en App Store y Google Play."

# <meta name="description"
content = re.sub(
    r'<meta\s+name="description"\s+content="[^"]*"',
    f'<meta name="description"\n        content="{new_desc}"',
    content,
    flags=re.IGNORECASE | re.DOTALL
)

# <meta property="og:description"
content = re.sub(
    r'<meta\s+property="og:description"\s+content="[^"]*"',
    f'<meta property="og:description"\n        content="{new_desc}"',
    content,
    flags=re.IGNORECASE | re.DOTALL
)

with open("landing/index.html", "w", encoding="utf-8") as f:
    f.write(content)

print("Meta tags fully updated.")
