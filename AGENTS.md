# Operaciones y arriendos — mapa para agentes

PWA en español para gestionar arriendos, tareas de limpieza y notas operativas del departamento familiar en Chillán.

## Stack y límites

| Área | Tecnología |
| --- | --- |
| Cliente | HTML, CSS y JavaScript nativo; sin build ni dependencias locales |
| Persistencia | Supabase o `localStorage`, elegidos al iniciar |
| Datos | SQL de Supabase en `schema.sql` |
| Pruebas | Node para controles estáticos y fronteras |

No añadas framework, bundler, `package.json` ni linter de terceros sin una petición explícita. El despliegue como archivos estáticos es una decisión de producto.

## Arquitectura

`index.html` + `styles.css` → `app.js` → interfaz `state.store` → `localStorage` **o** Supabase.

`app.js` concentra la orquestación de UI; `state.store` protege al resto de la aplicación de los detalles de persistencia. Las reglas están en `docs/architecture/LAYERS.md`.

Aunque las capas conviven en un solo archivo, la frontera es real: eventos y renderizado consumen el puerto; `localStore()` y `makeSupabaseStore()` implementan los adaptadores. El único import remoto aprobado es el cliente Supabase v2 usado por `initStore()`.

## Convenciones que no se negocian

- La UI usa solo `state.store`; no llama al cliente Supabase desde eventos o renderizado.
- Crear o actualizar un arriendo conserva su única tarea de limpieza de salida.
- El valor de almacenamiento para un arriendo nuevo es `source: "direct"`; la interfaz lo presenta como “Arriendo”.
- La interfaz y los nuevos textos permanecen en español.
- Si cambias `app.js` o `styles.css`, incrementa `VERSION` y el query string de `index.html` juntos.
- El PIN en el cliente es una barrera de uso, no un mecanismo de autorización del backend.
- `render()` reconstruye la ventana completa de 31 días: no introduzcas diffs incrementales sin una necesidad medida.

## Comandos

```sh
python3 -m http.server 8000
make ci
make gc
node --check app.js
make hooks # opcional: activa el pre-commit local
```

## Dónde empezar

| Necesidad | Archivo |
| --- | --- |
| Mapa del dominio | `ARCHITECTURE.md` |
| Capas y dependencias | `docs/architecture/LAYERS.md` |
| Datos y tareas | `docs/golden-principles/OPERATIONS_DATA.md` |
| Diseño de UI | `docs/golden-principles/STATIC_UI.md` |
| Persistencia | `docs/golden-principles/PERSISTENCE.md` |
| Esquema y políticas | `schema.sql` |
| Decisiones duraderas | `docs/design-docs/` |
| Cambios complejos | `docs/PLANS.md` y `docs/exec-plans/` |
| Validar cambios | `docs/guides/VERIFY.md` |

## Verificación obligatoria

- Ejecuta `make ci` antes de entregar cambios.
- Ejecuta `make gc` cuando cambien código, esquema o documentación arquitectónica.
- Prueba manualmente el bloqueo, el modo administrador, una creación/edición de arriendo y una limpieza asociada.
- `tests/architecture/known-violations.json` es un ratchet: no agregues entradas.
- CI es el control autoritativo; el hook local es opt-in.
