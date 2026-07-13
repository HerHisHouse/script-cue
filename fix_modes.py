import re

with open("landing/index.html", "r", encoding="utf-8") as f:
    content = f.read()

# Subtitle
old_sub = "Un único guion, infinitas formas de trabajar. Cada modo está diseñado para una fase real de tu proceso."
new_sub = "Un mismo guion, mil maneras de trabajarlo. Cada modo está pensado para una fase real del proceso: memorizar, entender, ensayar, grabar."
content = content.replace(old_sub, new_sub)

# Modo Estudio
old_estudio = "Practica o graba tu escena, podrás ocultar tus líneas. La IA da la réplica tú solo tienes que actuar. Como ensayar con alguien, pero disponible a las 3 de la mañana."
new_estudio = "Ensaya o graba la escena, mientras escuchas la réplica, tú solo tienes que actuar. Como tener pareja de ensayo pero las 24h."
content = content.replace(old_estudio, new_estudio)

# Modo Análisis
old_analisis = "Antes de empezar a memorizar, entiende qué estás interpretando. Analiza objetivos, conflictos, emociones y subtexto de la escena o pídele a la IA que lo examine."
new_analisis = "Antes de memorizar, entiende qué estás interpretando de verdad. Analiza objetivos, conflictos, emociones y subtexto de la escena, o pídele a la IA que lo haga por ti."
content = content.replace(old_analisis, new_analisis)

# Modo Memoria
old_memoria = "Memoriza tus líneas a través de juegos y desafíos para potenciar el aprendizaje. El sistema identifica tus puntos débiles y refuerza automáticamente las partes que necesitan más práctica."
new_memoria = "Memoriza tus líneas con juegos y retos, no a fuerza de repetir. El sistema detecta dónde fallas y refuerza automáticamente esas partes hasta que las tengas."
content = content.replace(old_memoria, new_memoria)

# Modo Escena
old_escena = "Explora nuevas posibilidades interpretativas mediante ejercicios, retos y propuestas generadas por IA. Una herramienta de entrenamiento diseñada para estimular el trabajo actoral y la preparación de escenas."
new_escena = "Explora tu personaje desde otro ángulo con ejercicios y propuestas que te lanza la IA. No es para evaluarte: es para jugar con la escena a modo de laboratorio."
content = content.replace(old_escena, new_escena)

# Modo Casting
old_casting = "Graba tus selftapes con la réplica por IA y ya no dependerás de la disponibilidad de alguien. Graba presentaciones largas con Teleprompter. No pierdas una audición por no tener quien te de la réplica."
new_casting = "Graba tu self-tape con la réplica en tiempo real, sin esperar a que alguien tenga un hueco. Usa el Teleprompter para presentaciones largas, reels... Que no se te escape una audición por no tener quien te dé el pie."
content = content.replace(old_casting, new_casting)

# Modo Coche
old_coche = "Este modo está diseñado para que escuches la escena completa en bucle mientras conduces, entrenas o haces la compra. La IA interpretará la escena completa y solo tienes que configurar las voces."
new_coche = "Para escuchar la escena entera en bucle mientras conduces, entrenas o haces la compra. Configura las voces una vez y la IA interpreta todo el reparto."
content = content.replace(old_coche, new_coche)

# Remove Testimonials
# Look for <section class="testimonials"... up to </section>
testi_pattern = r'<section class="testimonials" id="testimonials">.*?</section>'
content = re.sub(testi_pattern, '', content, flags=re.IGNORECASE | re.DOTALL)

with open("landing/index.html", "w", encoding="utf-8") as f:
    f.write(content)

print("Modes text updated and testimonials removed.")
