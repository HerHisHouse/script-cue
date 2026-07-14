import re
with open("landing/index.html", "r", encoding="utf-8") as f:
    content = f.read()
content = re.sub(r'<li>Sin anuncios\s*</li>\s*', '', content)
with open("landing/index.html", "w", encoding="utf-8") as f:
    f.write(content)
