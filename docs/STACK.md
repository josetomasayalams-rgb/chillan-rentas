# Convenciones del stack

- La aplicación se ejecuta desde archivos estáticos; usa HTTP local y no `file://`.
- Node solo verifica JavaScript y las herramientas del arnés; no ejecuta la PWA.
- La importación del cliente Supabase es remota y condicional, por lo que el modo local no tiene dependencias.
- La disponibilidad sanitizada de Airbnb, Booking y particulares se consulta con `fetch` al contrato público `/availability`.
- `schema.sql` es idempotente y define las garantías que no deben depender solo de JavaScript.
- No incorpores paquetes de build o lint para resolver una comprobación que los scripts nativos ya cubren.
- `scripts/architecture.mjs` es la fuente compartida para la allowlist de imports y el formato de errores de frontera.
- `make ci` valida contrato estático, sintaxis, arquitectura y artefactos; no produce un directorio de build.
- `make gc` es de solo lectura y usa el historial de Git para evitar falsos positivos por mtimes locales.

## Compatibilidad

CI usa Node 20 para los scripts del arnés. La aplicación no depende de Node en producción y se ejecuta en navegadores con módulos dinámicos, `localStorage` y APIs DOM modernas.

La aplicación se sirve completa desde la raíz. No muevas `assets/`, `manifest.webmanifest` o los archivos de entrada sin actualizar referencias y despliegue.

La fuente de calendario usa `fetch`, `AbortController` y una caché de última
copia válida en `localStorage`; no necesita un SDK ni acceso iCal desde el navegador.
La memoria de avisos usa tres tablas Supabase aditivas y los mismos adaptadores
`state.store`; no introduce dependencias nuevas en el cliente.
