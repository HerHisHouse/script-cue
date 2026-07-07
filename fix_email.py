import re

with open("landing/index.html", "r", encoding="utf-8") as f:
    content = f.read()

email_field = """        <!-- Campo email -->
        <div style="margin-bottom: 16px;">
          <input
            type="email"
            id="community-email"
            placeholder="Tu mejor email..."
            style="
              width: 100%;
              background: rgba(255,255,255,0.07);
              border: 1.5px solid rgba(255,255,255,0.12);
              border-radius: 10px;
              padding: 14px 16px;
              color: #ffffff;
              font-size: 15px;
              outline: none;
              box-sizing: border-box;
              transition: border-color 0.2s ease;
            "
          />
        </div>

        <!-- Campo ciudad (multi-select) -->"""

content = content.replace("<!-- Campo ciudad (multi-select) -->", email_field)

with open("landing/index.html", "w", encoding="utf-8") as f:
    f.write(content)
print("Email field restored!")
