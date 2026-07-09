import re

with open("landing/index.html", "r", encoding="utf-8") as f:
    content = f.read()

def print_match(pattern):
    m = re.search(pattern, content, re.IGNORECASE | re.DOTALL)
    if m:
        print(f"FOUND: {pattern}")
        print(m.group(0)[:200] + "...")
    else:
        print(f"NOT FOUND: {pattern}")

print_match(r'<h1 class="hero-title">.*?</h1>')
print_match(r'<section class="features" id="features">.*?<div class="features-grid">')
print_match(r'<div class="feature-card">.*?</div>')
print_match(r'<section class="how-it-works" id="how-it-works">.*?</section>')

