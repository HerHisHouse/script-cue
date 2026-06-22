import glob

files_to_check = [
    "landing/legal/terms.html",
    "landing/legal/privacy.html",
    "landing/legal/ai.html"
]

nav_old = """                <a href="/#modes" class="nav-link">Modos</a>
                <a href="/#faqs" class="nav-link">FAQs</a>"""
nav_new = """                <a href="/#modes" class="nav-link">Modos</a>
                <a href="/#pricing" class="nav-link">Planes</a>
                <a href="/#faqs" class="nav-link">FAQs</a>"""

footer_old = """                        <a href="/#modes">Modos</a>
                        <a href="/#faqs">FAQs</a>"""
footer_new = """                        <a href="/#modes">Modos</a>
                        <a href="/#pricing">Planes</a>
                        <a href="/#faqs">FAQs</a>"""

for fpath in files_to_check:
    with open(fpath, "r", encoding="utf-8") as f:
        content = f.read()
    
    content = content.replace(nav_old, nav_new)
    content = content.replace(footer_old, footer_new)
    content = content.replace("&copy; 2025", "&copy; 2026")
    
    with open(fpath, "w", encoding="utf-8") as f:
        f.write(content)
    print(f"Updated {fpath}")

