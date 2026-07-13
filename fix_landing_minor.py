import re

with open("landing/index.html", "r", encoding="utf-8") as f:
    content = f.read()

# Fix text in Modo Estudio
old_text = "Ensaya o graba la escena, mientras escuchas la réplica, tú solo tienes que actuar. Como tener pareja de ensayo pero las 24h."
new_text = "Ensaya o graba la escena, mientras escuchas la réplica, tú solo tienes que actuar. Como tener pareja de ensayo pero disponible las 24h."
content = content.replace(old_text, new_text)

# Remove the Reviews / Testimonials section
# Find <!-- Reviews Section --> up to </section> and the following gradient divider if we want, or just the section
reviews_pattern = r'<!-- Reviews Section -->.*?<section class="reviews" id="reviews">.*?</section>\s*(<div class="gradient-divider"></div>)?\s*'
content = re.sub(reviews_pattern, '', content, flags=re.IGNORECASE | re.DOTALL)

with open("landing/index.html", "w", encoding="utf-8") as f:
    f.write(content)

print("Fixed Modo Estudio text and removed Reviews section.")
