import re

with open("landing/index.html", "r", encoding="utf-8") as f:
    content = f.read()

# 1. Restore "How it works" and remove "Video Tutorial" instead.
# To do this safely, we can just get the previous version from git for the "How it works" part,
# but it's simpler to just grab it from git show HEAD~1:landing/index.html
import subprocess
old_content = subprocess.check_output(["git", "show", "HEAD~1:landing/index.html"]).decode('utf-8')
how_it_works_match = re.search(r'<!-- How It Works -->.*?<section class="how-it-works" id="how-it-works">.*?</section>', old_content, re.IGNORECASE | re.DOTALL)
how_it_works_html = how_it_works_match.group(0) if how_it_works_match else ""

# Insert "How It Works" back where it was (before "Modes Section")
if how_it_works_html and "<!-- How It Works -->" not in content:
    content = content.replace('<!-- Modes Section -->', how_it_works_html + '\n\n    <!-- Modes Section -->')

# Now remove the Video Tutorial section
video_pattern = r'<!-- Video Tutorial Section -->.*?<section class="video-tutorial" id="tutorial">.*?</section>'
content = re.sub(video_pattern, '', content, flags=re.IGNORECASE | re.DOTALL)

# Also remove the tutorial link from the navigation menu if it exists
content = re.sub(r'<a href="#tutorial" class="nav-link">Tutorial</a>', '', content, flags=re.IGNORECASE)

# 2. Redesign the "Lo sé, hemos pasado por esto." section
old_pain_points = r'<section class="pain-points".*?</section>'

new_pain_points = '''<section class="pain-points" style="padding: 100px 0; background: radial-gradient(circle at top, rgba(124, 106, 247, 0.08) 0%, transparent 60%); position: relative;">
        <style>
            .pain-card {
                background: rgba(255,255,255,0.02);
                border: 1px solid rgba(255,255,255,0.06);
                border-radius: 24px;
                padding: 32px;
                transition: transform 0.3s ease, background 0.3s ease, border-color 0.3s ease;
                position: relative;
                overflow: hidden;
            }
            .pain-card:hover {
                transform: translateY(-5px);
                background: rgba(255,255,255,0.04);
                border-color: rgba(124, 106, 247, 0.3);
            }
            .pain-card::before {
                content: '';
                position: absolute;
                top: 0;
                left: 0;
                width: 4px;
                height: 100%;
                background: linear-gradient(to bottom, #7c6af7, #9b87f5);
                opacity: 0.5;
                transition: opacity 0.3s ease;
            }
            .pain-card:hover::before {
                opacity: 1;
            }
            .pain-icon {
                font-size: 28px;
                margin-bottom: 16px;
                display: inline-block;
            }
        </style>
        <div class="container">
            <div class="section-header">
                <span class="section-badge">El Origen</span>
                <h2 class="section-title">Lo sé, hemos pasado <span class="gradient-text">por esto</span></h2>
            </div>
            
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 24px; margin: 50px 0;">
                
                <div class="pain-card">
                    <div class="pain-icon">🤷🏽‍♀️</div>
                    <p style="font-size: 16px; color: #d0d0d0; line-height: 1.6; margin: 0; font-weight: 500;">No encontrar a nadie que te dé la réplica en el momento que lo necesitas.</p>
                </div>

                <div class="pain-card">
                    <div class="pain-icon">📖</div>
                    <p style="font-size: 16px; color: #d0d0d0; line-height: 1.6; margin: 0; font-weight: 500;">Ensayar leyendo tú las respuestas del otro personaje.</p>
                </div>

                <div class="pain-card">
                    <div class="pain-icon">😓</div>
                    <p style="font-size: 16px; color: #d0d0d0; line-height: 1.6; margin: 0; font-weight: 500;">Llegar al casting sin haber podido probar la escena en condiciones.</p>
                </div>

                <div class="pain-card">
                    <div class="pain-icon">🦜</div>
                    <p style="font-size: 16px; color: #d0d0d0; line-height: 1.6; margin: 0; font-weight: 500;">Memorizarte el texto a fuerza de repetirlo, sin ningún método.</p>
                </div>

            </div>

            <div style="text-align: center; margin-top: 60px; padding: 40px 20px; background: rgba(124, 106, 247, 0.08); border-radius: 24px; border: 1px solid rgba(124, 106, 247, 0.15);">
                <p style="font-size: 22px; color: #fff; font-weight: 700; margin: 0; letter-spacing: -0.5px;">
                    ScriptCue nace de ahí: <br class="mobile-break"><span style="color: #a78bfa;">de vivir esto en primera persona</span> y decidir hacer algo con ello.
                </p>
            </div>
        </div>
    </section>'''

content = re.sub(old_pain_points, new_pain_points, content, flags=re.IGNORECASE | re.DOTALL)

with open("landing/index.html", "w", encoding="utf-8") as f:
    f.write(content)

print("Landing page designed and tutorial removed.")
