# Diseño

La interfaz es mobile-first y usa Liquid Glass con contraste suficiente para estados y tareas. El calendario se reconstruye completamente al cambiar datos o vista: su tamaño acotado hace esa simplicidad preferible a actualizaciones parciales frágiles.

## Principios

- El estado operativo debe distinguirse por texto y forma, no solo por color.
- Los controles de escritura aparecen dentro del modo administrador; la lectura sigue siendo directa.
- Los flujos frecuentes caben en móvil sin depender de hover.
- Las confirmaciones protegen acciones destructivas o difíciles de deshacer.
- Los textos nuevos permanecen en español y usan vocabulario operativo consistente.

Los tokens visuales viven en `:root` dentro de `styles.css`. Reutiliza las utilidades glass existentes antes de crear variantes aisladas.
