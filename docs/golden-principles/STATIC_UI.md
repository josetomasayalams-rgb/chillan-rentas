# UI estática con versión coherente

## Regla

La PWA se sirve sin build y mantiene una versión visible coherente con los recursos cargados.

## Sí

```js
const VERSION = "23"; // actualizar junto al ?v=23 de index.html
```

## No

```html
<!-- Cambiar app.js sin actualizar la versión deja caché inconsistente. -->
<script src="app.js?v=22"></script>
```

## Excepción

Los cambios que no afectan recursos cacheables no requieren un incremento, pero si hay duda increméntalo y conserva la sincronía.

## Artefacto desplegable

No existe una carpeta de build: el artefacto es la raíz del repositorio. Debe incluir:

- `index.html`, `styles.css` y `app.js`;
- `manifest.webmanifest`;
- todos los recursos referenciados dentro de `assets/`.

## Verificación

`scripts/lint.mjs` compara automáticamente `VERSION`, `app.js?v=` y `styles.css?v=`. Ejecuta `make ci` antes de desplegar y abre la aplicación por HTTP; `file://` no representa el entorno soportado.

Prueba al menos un viewport móvil porque el calendario, los controles de administrador y los fondos cambian según el ancho.
