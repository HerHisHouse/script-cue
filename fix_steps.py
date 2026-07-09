import re

with open("landing/index.html", "r", encoding="utf-8") as f:
    content = f.read()

# Step 1
content = content.replace('<h3 class="step-title">Sube tu guión</h3>', '<h3 class="step-title">Sube tu guion</h3>')
old_step1_desc = "Importa tu guión en PDF, DOCX o escanéalo directamente con la cámara de tu móvil. También podrás subir imágenes y la app extraerá el texto automáticamente."
new_step1_desc = "ScriptCue reconoce automáticamente personajes, acciones y diálogos. Puedes subirlo en .PDF o .DOCX o desde la cámara del móvil."
content = content.replace(old_step1_desc, new_step1_desc)

# Step 2
old_step2_desc = "Configura los personajes que aparecen en tu guion. Asígnale las voces IA. Después podrás revisa el guion, editar diálogos o crear nuevos."
new_step2_desc = "Selecciona tu personaje, asígnales una voz a los demás. Después puedes repasar el guion, tocar diálogos o añadir los que falten."
content = content.replace(old_step2_desc, new_step2_desc)

# Step 3
old_step3_desc = "Elige el modo que prefieras y comienza a practicar. La IA siempre te dará la réplica."
new_step3_desc = "Elige el modo que necesites y ponte a trabajar. La réplica te la da siempre la IA."
content = content.replace(old_step3_desc, new_step3_desc)

with open("landing/index.html", "w", encoding="utf-8") as f:
    f.write(content)

print("Steps text updated.")
