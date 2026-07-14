import re

with open("landing/index.html", "r", encoding="utf-8") as f:
    content = f.read()

# Add overflow: visible and z-index to the highlighted card to prevent clipping
content = content.replace(
    '<div class="pricing-card highlighted">',
    '<div class="pricing-card highlighted" style="overflow: visible !important; z-index: 2;">'
)

# Add z-index to the badge just in case
content = content.replace(
    '<div class="pricing-badge" style="text-transform: uppercase; letter-spacing: 1px; font-size: 11px;">MÁS POPULAR</div>',
    '<div class="pricing-badge" style="text-transform: uppercase; letter-spacing: 1px; font-size: 11px; z-index: 10; top: -16px;">MÁS POPULAR</div>'
)

with open("landing/index.html", "w", encoding="utf-8") as f:
    f.write(content)

print("Clipping fix applied.")
