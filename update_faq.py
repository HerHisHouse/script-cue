import re

with open("landing/index.html", "r", encoding="utf-8") as f:
    html = f.read()

# Replace <h3 class="faq-category-title">Name</h3> with the new toggle structure
# We also need to wrap the rest of the category in <div class="faq-category-content">
# A good way to do this is to split the html by <div class="faq-category">

parts = html.split('<div class="faq-category">')

new_html = parts[0]

for i in range(1, len(parts)):
    part = parts[i]
    
    # Extract the title
    match = re.search(r'<h3 class="faq-category-title">(.*?)</h3>', part)
    if not match:
        new_html += '<div class="faq-category">' + part
        continue
        
    title = match.group(1)
    
    # Build the toggle button and open the content div
    # Make the first one active by default
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
    
    # Replace the h3 tag with the new HTML
    part = part.replace(match.group(0), toggle_html)
    
    # Now we need to close the faq-category-content div at the very end of this part.
    # The part ends where the next <div class="faq-category"> would begin, EXCEPT for the last part,
    # which ends where the container/section closes.
    # The last part usually ends with </div>\n            </div>\n        </div>\n    </section>
    
    # Let's find the last </div> before the end of the part that belongs to the faq-item
    # Since we are just appending </div> before the closing of faq-category, we need to know where faq-category closes.
    # Well, we split by `<div class="faq-category">`, so `part` is the contents of faq-category AND whatever comes after it in the last part.
    if i == len(parts) - 1:
        # For the last part, we need to insert </div> before `</div>\n        </div>\n    </section>`
        # Or before `</div>\n\n    <!-- Contact CTA -->`
        # Let's just find the closing </div> of the faq-category.
        # It's followed by `</div>\n        </div>\n    </section>` or similar.
        closing_idx = part.rfind('</div>\n        </div>\n    </section>')
        if closing_idx != -1:
            part = part[:closing_idx] + "                </div>\n" + part[closing_idx:]
    else:
        # For non-last parts, the part ends right before the next `<div class="faq-category">`
        # which means it ends with some whitespace and the closing `</div>` of the current category.
        # We need to insert `</div>` right before the last `</div>`.
        last_div_idx = part.rfind('</div>')
        part = part[:last_div_idx] + "                </div>\n" + part[last_div_idx:]
        
    new_html += f'<div class="faq-category{active_class}">' + part

with open("landing/index.html", "w", encoding="utf-8") as f:
    f.write(new_html)
