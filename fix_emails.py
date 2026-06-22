import os
import glob

replacements = [
    ("scriptcue@gmail.com", "info@scriptcue.es"),
    ("hola@scriptcue.es", "info@scriptcue.es")
]

files_to_check = []
for ext in ["**/*.html", "**/*.tsx", "**/*.ts", "**/*.js"]:
    files_to_check.extend(glob.glob(ext, recursive=True))

# Filter out node_modules, .expo, .git etc just in case, though glob without those starting with '.' might be fine.
files_to_check = [f for f in files_to_check if "node_modules" not in f and ".expo" not in f and ".next" not in f]

for fpath in files_to_check:
    try:
        with open(fpath, "r", encoding="utf-8") as f:
            content = f.read()
        
        new_content = content
        for old, new in replacements:
            new_content = new_content.replace(old, new)
        
        if fpath == "app/(tabs)/settings.tsx":
            new_content = new_content.replace("const appName = 'Script Cue';", "const appName = 'ScriptCue';")
            
        if new_content != content:
            with open(fpath, "w", encoding="utf-8") as f:
                f.write(new_content)
            print(f"Updated {fpath}")
    except Exception as e:
        print(f"Error reading {fpath}: {e}")

