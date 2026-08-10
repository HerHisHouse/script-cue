import re

# 1. Update styles.css for .section-badge color
with open('landing/styles.css', 'r', encoding='utf-8') as f:
    css_content = f.read()

css_content = css_content.replace('color: var(--accent-primary);', 'color: #ffffff;')

with open('landing/styles.css', 'w', encoding='utf-8') as f:
    f.write(css_content)

# 2. Update index.html
with open('landing/index.html', 'r', encoding='utf-8') as f:
    html = f.read()

# Make <strong> tags purple in Características list
features_list_matches = [
    '<strong>¿Sin compi para ensayar?</strong>',
    '<strong>Grábate en cualquier momento</strong>',
    '<strong>Memoriza sin bloqueos</strong>',
    '<strong>¿Tienes un casting?</strong>'
]
for match in features_list_matches:
    html = html.replace(match, match.replace('<strong>', '<strong style="color: var(--accent-primary);">'))

# Change "tocar diálogos" to "retocar diálogos"
html = html.replace('tocar diálogos', 'retocar diálogos')

# Unify PRÓXIMAMENTE badge
old_badge = '''<span style="
        background: rgba(124,106,247,0.15);
        border: 1px solid rgba(124,106,247,0.4);
        color: #a78bfa;
        padding: 6px 16px;
        border-radius: 20px;
        font-size: 12px;
        font-weight: 600;
        letter-spacing: 1.5px;
        text-transform: uppercase;
      ">Próximamente</span>'''
new_badge = '<span class="section-badge" style="letter-spacing: 1.5px; text-transform: uppercase; font-size: 12px;">Próximamente</span>'
html = html.replace(old_badge, new_badge)

# Unify "PRÓXIMAMENTE" title glow (gradient-text instead of solid color)
html = html.replace(
    'Cuando la <span style="color: #a78bfa;">IA</span> se quede corta,<br/>\n      <span style="color: #a78bfa;">estará la Comunidad ScriptCue</span>',
    'Cuando la <span class="gradient-text">IA</span> se quede corta,<br/>\n      <span class="gradient-text">estará la Comunidad ScriptCue</span>'
)

with open('landing/index.html', 'w', encoding='utf-8') as f:
    f.write(html)

print("Updates to styles and index applied.")
