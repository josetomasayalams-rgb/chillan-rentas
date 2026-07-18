# Diseño

La interfaz es mobile-first y usa Liquid Glass con contraste suficiente para estados y tareas. El calendario se reconstruye completamente al cambiar datos o vista: su tamaño acotado hace esa simplicidad preferible a actualizaciones parciales frágiles.

La vista principal es una ventana móvil de 31 días consecutivos desde hoy, no un mes calendario fijo. El rango puede cruzar al mes siguiente, señala el cambio de mes dentro de la grilla y avanza al cambiar la fecha local. La navegación manual conserva su periodo hasta que la persona toca `Desde hoy`.

Las reservas consecutivas alternan dos tonos estables según su orden cronológico. El color no representa Airbnb, Booking ni una fuente concreta y se conserva durante toda la estadía. En móvil, los extremos de cada barra apilan las etiquetas `Check-in 15:00` y `Check-out 12:00`; la altura de la celda crece cuando hay varias reservas para evitar recortes y colisiones con la tarea de aseo.

## Principios

- El estado operativo debe distinguirse por texto y forma, no solo por color.
- Los controles de escritura aparecen dentro del modo administrador; la lectura sigue siendo directa.
- Los flujos frecuentes caben en móvil sin depender de hover.
- Las confirmaciones protegen acciones destructivas o difíciles de deshacer.
- Los textos nuevos permanecen en español y usan vocabulario operativo consistente.

Los tokens visuales viven en `:root` dentro de `styles.css`. Reutiliza las utilidades glass existentes antes de crear variantes aisladas.
