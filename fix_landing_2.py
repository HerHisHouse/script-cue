import re

with open("landing/index.html", "r", encoding="utf-8") as f:
    content = f.read()

# 3. Comunidad Title
old_com_title = 'Cuando la <span style="color: #a78bfa;">IA</span> no sea suficiente<br/>\n      <span style="color: #a78bfa;">estará la Comunidad ScriptCue</span>'
new_com_title = 'Cuando la <span style="color: #a78bfa;">IA</span> se quede corta,<br/>\n      <span style="color: #a78bfa;">estará la Comunidad ScriptCue</span>'
content = content.replace(old_com_title, new_com_title)

# 4. Comunidad Subtitle
old_com_sub = 'La IA está bien. Una persona de verdad es otra cosa.<br/>\n      Estamos creando una comunidad donde actores y actrices podrán encontrarse, preparar castings juntos, crear grupos de ensayo y ayudarse mutuamente a crecer profesionalmente.'
new_com_sub = 'La IA está bien. Pero una persona de verdad dándote la réplica es otra cosa.<br/>\n      Estamos montando una comunidad para encontrarnos, preparar castings juntos, montar grupos de ensayo y ayudarnos a crecer.'
content = content.replace(old_com_sub, new_com_sub)

with open("landing/index.html", "w", encoding="utf-8") as f:
    f.write(content)

print("Second batch of updates applied.")
