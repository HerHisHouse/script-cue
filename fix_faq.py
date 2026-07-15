import re

with open("landing/index.html", "r", encoding="utf-8") as f:
    content = f.read()

# 1. Update the JS at the end
js_to_add = """
        function toggleFAQCategory(button) {
            const category = button.parentElement;
            const wasActive = category.classList.contains('active');
            
            // Optional: Close other categories
            /*
            document.querySelectorAll('.faq-category').forEach(cat => {
                cat.classList.remove('active');
            });
            */
            
            if (wasActive) {
                category.classList.remove('active');
            } else {
                category.classList.add('active');
            }
        }
"""
content = content.replace("function toggleFAQ(button) {", js_to_add + "\n        function toggleFAQ(button) {")

# 2. Refactor HTML structure
parts_main = content.split('<!-- Contact Card -->')
faq_section = parts_main[0]
contact_section = parts_main[1]

faq_parts = faq_section.split('<div class="faq-category">')
new_faq_section = faq_parts[0]

for i in range(1, len(faq_parts)):
    part = faq_parts[i]
    
    match = re.search(r'<h3 class="faq-category-title">(.*?)</h3>', part)
    if not match:
        new_faq_section += '<div class="faq-category">' + part
        continue
        
    title = match.group(1)
    
    active_class = " active" if i == 1 else ""
    
    toggle_html = f'''
                <button class="faq-category-toggle" onclick="toggleFAQCategory(this)">
                    <h3 class="faq-category-title">{title}</h3>
                    <svg class="faq-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="6 9 12 15 18 9"></polyline>
                    </svg>
                </button>
                <div class="faq-category-content">
'''
    part = part.replace(match.group(0), toggle_html)
    
    last_div_idx = part.rfind('</div>')
    part = part[:last_div_idx] + "                </div>\n            </div>" + part[last_div_idx+6:]
    
    new_faq_section += f'<div class="faq-category{active_class}">' + part

content = new_faq_section + '<!-- Contact Card -->' + contact_section

# 3. Add the new "Planes" category
planes_html = '''
            <!-- Planes -->
            <div class="faq-category">
                <button class="faq-category-toggle" onclick="toggleFAQCategory(this)">
                    <h3 class="faq-category-title">Planes</h3>
                    <svg class="faq-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="6 9 12 15 18 9"></polyline>
                    </svg>
                </button>
                <div class="faq-category-content">
                    <div class="faq-item">
                        <button class="faq-question" onclick="toggleFAQ(this)">
                            <span>¿Qué diferencias hay entre los planes?</span>
                            <svg class="faq-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <polyline points="6 9 12 15 18 9"></polyline>
                            </svg>
                        </button>
                        <div class="faq-answer">
                            <p>El Plan Gratuito incluye hasta 3 guiones, el Estudiante hasta 20 y voces con calidad de estudio, y el Profesional hasta 50 guiones y voces con emociones y matices.</p>
                        </div>
                    </div>
                </div>
            </div>
'''
content = content.replace("<!-- Configuración -->", planes_html + "\n            <!-- Configuración -->")

with open("landing/index.html", "w", encoding="utf-8") as f:
    f.write(content)

# Update CSS
css_to_add = """
/* FAQ Category Toggle */
.faq-category {
    background: rgba(168, 85, 247, 0.02);
    border: 1px solid var(--border-color);
    border-radius: 20px;
    margin-bottom: 24px;
    overflow: hidden;
    transition: var(--transition-normal);
}

.faq-category:hover {
    border-color: var(--border-color-hover);
}

.faq-category-toggle {
    width: 100%;
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: none;
    border: none;
    cursor: pointer;
    padding: 24px 32px;
    color: var(--text-primary);
    text-align: left;
}

.faq-category-title {
    font-size: 1.3rem;
    font-weight: 600;
    margin: 0 !important;
}

.faq-category-toggle .faq-icon {
    width: 24px;
    height: 24px;
    transition: transform 0.3s ease;
    color: var(--text-secondary);
}

.faq-category.active .faq-category-toggle .faq-icon {
    transform: rotate(180deg);
}

.faq-category-content {
    display: none;
    padding: 0 32px 24px;
}

.faq-category.active .faq-category-content {
    display: block;
    animation: fadeIn 0.4s ease forwards;
}

.faq-category-content .faq-item {
    margin-bottom: 12px;
}
.faq-category-content .faq-item:last-child {
    margin-bottom: 0;
}
"""

with open("landing/styles.css", "r", encoding="utf-8") as f:
    css = f.read()

if "/* FAQ Category Toggle */" not in css:
    css = css.replace("/* =============================================\n   FAQs Section\n   ============================================= */", "/* =============================================\n   FAQs Section\n   ============================================= */\n" + css_to_add)
    
    # Remove old .faq-category-title margin-bottom
    css = re.sub(r'\.faq-category-title\s*{[^}]*}', '', css)

with open("landing/styles.css", "w", encoding="utf-8") as f:
    f.write(css)

print("FAQ categories updated successfully.")
