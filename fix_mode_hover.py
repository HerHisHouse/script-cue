with open("landing/styles.css", "r", encoding="utf-8") as f:
    content = f.read()

content = content.replace(
    ".mode-card:hover {\n    transform: translateY(-12px);",
    ".mode-card:hover {\n    transform: translateY(-12px) !important;"
)

with open("landing/styles.css", "w", encoding="utf-8") as f:
    f.write(content)

