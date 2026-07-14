import re

with open("landing/index.html", "r", encoding="utf-8") as f:
    content = f.read()

# I will target the exact SVG string I added, with and without the style attribute
svg_1 = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>'
svg_2 = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color: #a78bfa;"><polyline points="20 6 9 17 4 12"></polyline></svg>'

# Remove the SVGs
content = content.replace(svg_1, "")
content = content.replace(svg_2, "")

# Some extra spaces/newlines might have been left over, let's clean up
# \n\s+ inside <li> right before text
content = re.sub(r'(<li>)\s+', r'\1', content)

# But we only want to fix spacing if it's annoying, it's HTML so it's probably fine.
# Let's write the file back
with open("landing/index.html", "w", encoding="utf-8") as f:
    f.write(content)

print("Checkmark SVGs removed.")
