import re

with open("landing/index.html", "r", encoding="utf-8") as f:
    content = f.read()

# Add CSS for the overlay
css = """
  .pricing-card {
    position: relative;
    overflow: hidden;
  }
  .coming-soon-overlay {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    backdrop-filter: blur(4px);
    -webkit-backdrop-filter: blur(4px);
    background: rgba(10, 10, 20, 0.3);
    z-index: 10;
    display: flex;
    align-items: center;
    justify-content: center;
    pointer-events: auto;
  }
  .coming-soon-band {
    position: absolute;
    background: linear-gradient(135deg, #7c6af7 0%, #9b87f5 100%);
    color: #fff;
    font-weight: 800;
    font-size: 16px;
    letter-spacing: 3px;
    padding: 12px 150%;
    transform: rotate(-35deg);
    text-align: center;
    box-shadow: 0 4px 20px rgba(0,0,0,0.4);
    white-space: nowrap;
    text-transform: uppercase;
  }
"""

if ".coming-soon-overlay" not in content:
    style_end = content.find("</style>")
    if style_end != -1:
        content = content[:style_end] + css + content[style_end:]

# Inject the overlay into each pricing card
# We find '<div class="pricing-card">' and '<div class="pricing-card highlighted">'
overlay_html = '\n                    <div class="coming-soon-overlay">\n                        <div class="coming-soon-band">PRÓXIMAMENTE</div>\n                    </div>'

content = content.replace('<div class="pricing-card">', f'<div class="pricing-card">{overlay_html}')
content = content.replace('<div class="pricing-card highlighted">', f'<div class="pricing-card highlighted">{overlay_html}')

with open("landing/index.html", "w", encoding="utf-8") as f:
    f.write(content)
print("Updated landing/index.html")
