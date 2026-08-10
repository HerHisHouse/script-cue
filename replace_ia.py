import os
import re

directories = ['app', 'components', 'utils', 'landing', 'supabase', 'assets']
extensions = ['.tsx', '.ts', '.html', '.json', '.js', '.jsx']

def replace_ia_in_text(text):
    # First, apply the specific replacement requested for coach.tsx
    text = text.replace(
        "La IA analizará la grabación para darte propuestas de actuación.",
        "ScriptCue analizará la escena para darte propuestas de actuación diferentes."
    )
    
    # Then generic replacements (case sensitive mostly, but 'la IA' vs 'La IA')
    replacements = [
        (r'\bla IA\b', 'ScriptCue'),
        (r'\bLa IA\b', 'ScriptCue'),
        (r'\bpor la IA\b', 'por ScriptCue'),
        (r'\bpor IA\b', 'por ScriptCue'),
        (r'\bde la IA\b', 'de ScriptCue'),
        (r'\bde IA\b', 'de ScriptCue'),
        (r'\bcon la IA\b', 'con ScriptCue'),
        (r'\bcon IA\b', 'con ScriptCue'),
        (r'\bmediante la IA\b', 'mediante ScriptCue'),
        (r'\bmediante IA\b', 'mediante ScriptCue'),
        (r'\bIA\b', 'ScriptCue')
    ]
    
    for pattern, replacement in replacements:
        text = re.sub(pattern, replacement, text)
        
    return text

for d in directories:
    if not os.path.exists(d):
        continue
    for root, dirs, files in os.walk(d):
        for file in files:
            if any(file.endswith(ext) for ext in extensions):
                file_path = os.path.join(root, file)
                try:
                    with open(file_path, 'r', encoding='utf-8') as f:
                        content = f.read()
                    
                    new_content = replace_ia_in_text(content)
                    
                    if new_content != content:
                        with open(file_path, 'w', encoding='utf-8') as f:
                            f.write(new_content)
                        print(f"Updated {file_path}")
                except Exception as e:
                    print(f"Error processing {file_path}: {e}")
