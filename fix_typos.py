import os
import re

# We will recursively search and replace in specific directories
directories_to_check = ['landing', 'app', 'components', 'utils', 'constants', 'hooks']

def fix_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    original_content = content
    # Replace guión -> guion, Guión -> Guion
    content = re.sub(r'guión', 'guion', content)
    content = re.sub(r'Guión', 'Guion', content)
    content = re.sub(r'guiónes', 'guiones', content)
    content = re.sub(r'Guiónes', 'Guiones', content)
    
    # Specific fix for Azure FAQ
    if 'landing/index.html' in filepath:
        content = content.replace(" (Actualmente no son muy buenas en castellano)", "")
        content = content.replace("Actualmente no son muy buenas en castellano", "")

    if content != original_content:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"Updated: {filepath}")

for root, dirs, files in os.walk('.'):
    # skip node_modules and .git
    if 'node_modules' in root or '.git' in root or '.expo' in root or 'ios' in root or 'android' in root:
        continue
    for file in files:
        if file.endswith(('.html', '.js', '.jsx', '.ts', '.tsx', '.json', '.md')):
            filepath = os.path.join(root, file)
            try:
                fix_file(filepath)
            except Exception as e:
                pass

print("Finished fixing typos.")
