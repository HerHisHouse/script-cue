import re

html_faqs = """
                    <div class="faq-item">
                        <button class="faq-question" onclick="toggleFAQ(this)">
                            <span>¿Puedo cambiar de plan en cualquier momento?</span>
                            <svg class="faq-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <polyline points="6 9 12 15 18 9"></polyline>
                            </svg>
                        </button>
                        <div class="faq-answer">
                            <p>Sí. Puedes actualizar o reducir tu plan cuando quieras desde los ajustes de tu cuenta en la App Store o Google Play. Si actualizas, el nuevo plan se activa inmediatamente. Si reduces, el cambio se aplica al final del periodo de facturación actual.</p>
                        </div>
                    </div>

                    <div class="faq-item">
                        <button class="faq-question" onclick="toggleFAQ(this)">
                            <span>¿Qué pasa cuando alcanzo el límite de guiones?</span>
                            <svg class="faq-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <polyline points="6 9 12 15 18 9"></polyline>
                            </svg>
                        </button>
                        <div class="faq-answer">
                            <p>Puedes seguir usando los guiones que ya tienes — simplemente no podrás añadir nuevos hasta el siguiente mes o hasta que actualices tu plan. Ningún guion existente desaparece.</p>
                        </div>
                    </div>

                    <div class="faq-item">
                        <button class="faq-question" onclick="toggleFAQ(this)">
                            <span>¿El plan Gratuito tiene límite de tiempo?</span>
                            <svg class="faq-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <polyline points="6 9 12 15 18 9"></polyline>
                            </svg>
                        </button>
                        <div class="faq-answer">
                            <p>No. El plan Gratuito no caduca — puedes usarlo indefinidamente con sus limitaciones.</p>
                        </div>
                    </div>

                    <div class="faq-item">
                        <button class="faq-question" onclick="toggleFAQ(this)">
                            <span>¿Qué son las "voces con emoción y matices interpretativos" del plan Profesional?</span>
                            <svg class="faq-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <polyline points="6 9 12 15 18 9"></polyline>
                            </svg>
                        </button>
                        <div class="faq-answer">
                            <p>Son voces generadas con ElevenLabs, el motor de síntesis de voz más avanzado del mercado. A diferencia de las voces estándar, puedes indicarle a la IA el estado emocional del personaje — alegría, tensión, tristeza, ironía — y la voz lo refleja de forma natural. Es la herramienta más potente para un ensayo realista.</p>
                        </div>
                    </div>

                    <div class="faq-item">
                        <button class="faq-question" onclick="toggleFAQ(this)">
                            <span>¿Qué incluye la "sesión de prueba con voces IA realistas" del plan Gratuito?</span>
                            <svg class="faq-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <polyline points="6 9 12 15 18 9"></polyline>
                            </svg>
                        </button>
                        <div class="faq-answer">
                            <p>Es una sesión única en la que puedes usar las voces de mayor calidad para ver cómo suenan antes de decidir si quieres suscribirte. Solo está disponible una vez por cuenta.</p>
                        </div>
                    </div>

                    <div class="faq-item">
                        <button class="faq-question" onclick="toggleFAQ(this)">
                            <span>¿Puedo usar ScriptCue en iOS y Android con la misma suscripción?</span>
                            <svg class="faq-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <polyline points="6 9 12 15 18 9"></polyline>
                            </svg>
                        </button>
                        <div class="faq-answer">
                            <p>La suscripción está vinculada a la tienda donde la contrataste — App Store o Google Play. Si usas la app en ambas plataformas con la misma cuenta de ScriptCue, solo necesitas suscribirte una vez en una de las dos tiendas y tu plan se aplicará en ambos dispositivos.</p>
                        </div>
                    </div>

                    <div class="faq-item">
                        <button class="faq-question" onclick="toggleFAQ(this)">
                            <span>¿Hay descuento si pago anual?</span>
                            <svg class="faq-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <polyline points="6 9 12 15 18 9"></polyline>
                            </svg>
                        </button>
                        <div class="faq-answer">
                            <p>Sí. El plan Estudiante anual cuesta 39,99€ (equivale a 3,33€/mes, frente a los 4,99€ mensuales). El plan Profesional anual cuesta 84,99€ (equivale a 7,08€/mes, frente a los 9,99€ mensuales). En ambos casos ahorras el equivalente a 2 meses.</p>
                        </div>
                    </div>

                    <div class="faq-item">
                        <button class="faq-question" onclick="toggleFAQ(this)">
                            <span>¿Qué pasa con mis grabaciones si cancelo mi suscripción?</span>
                            <svg class="faq-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <polyline points="6 9 12 15 18 9"></polyline>
                            </svg>
                        </button>
                        <div class="faq-answer">
                            <p>Si cancelas y pasas al plan Gratuito, tus grabaciones guardadas en la nube seguirán siendo accesibles durante 30 días. Pasado ese tiempo, las grabaciones en la nube se eliminan pero las que tengas guardadas localmente en tu dispositivo se mantienen.</p>
                        </div>
                    </div>

                    <div class="faq-item">
                        <button class="faq-question" onclick="toggleFAQ(this)">
                            <span>¿Hay anuncios en la app?</span>
                            <svg class="faq-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <polyline points="6 9 12 15 18 9"></polyline>
                            </svg>
                        </button>
                        <div class="faq-answer">
                            <p>Actualmente no hay anuncios en ningún plan. Si en el futuro se introdujeran, los planes Estudiante y Profesional siempre estarán libres de ellos.</p>
                        </div>
                    </div>

                    <div class="faq-item">
                        <button class="faq-question" onclick="toggleFAQ(this)">
                            <span>¿Puedo cancelar cuando quiera?</span>
                            <svg class="faq-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <polyline points="6 9 12 15 18 9"></polyline>
                            </svg>
                        </button>
                        <div class="faq-answer">
                            <p>Sí. Sin permanencias ni penalizaciones. Puedes cancelar desde los ajustes de tu cuenta en la App Store o Google Play y seguirás teniendo acceso hasta el final del periodo pagado.</p>
                        </div>
                    </div>

                    <div class="faq-item">
                        <button class="faq-question" onclick="toggleFAQ(this)">
                            <span>¿Qué pasa si me suscribo por error?</span>
                            <svg class="faq-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <polyline points="6 9 12 15 18 9"></polyline>
                            </svg>
                        </button>
                        <div class="faq-answer">
                            <p>Las suscripciones se gestionan directamente a través de la App Store (iOS) o Google Play (Android). Si te has suscrito por error, puedes solicitar un reembolso directamente a Apple o Google:</p>
                            <ul>
                                <li><strong>iOS:</strong> ve a reportaproblem.apple.com, inicia sesión y solicita el reembolso de la compra.</li>
                                <li><strong>Android:</strong> ve a play.google.com/store/account, busca la compra y solicita el reembolso (disponible en las primeras 48 horas).</li>
                            </ul>
                            <p>ScriptCue no gestiona directamente los cobros ni los reembolsos — eso corresponde a la tienda donde realizaste la compra. Si tienes cualquier duda puedes escribirnos a info@scriptcue.es y te ayudamos a gestionar tu solicitud.</p>
                        </div>
                    </div>"""

with open("landing/index.html", "r", encoding="utf-8") as f:
    content = f.read()

# We want to replace everything inside <div class="faq-category-content"> of the "Planes" section
# Let's find the start of the Planes section
pattern = r'(<h3 class="faq-category-title">Planes</h3>.*?<div class="faq-category-content">).*?(</div>\s*</div>\s*<!-- Configuración -->)'

match = re.search(pattern, content, re.DOTALL)
if match:
    new_content = content[:match.start()] + match.group(1) + "\n" + html_faqs + "\n                " + match.group(2) + content[match.end():]
    with open("landing/index.html", "w", encoding="utf-8") as f:
        f.write(new_content)
    print("Successfully replaced Planes FAQs.")
else:
    print("Could not find the Planes FAQ section.")
