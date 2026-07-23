# Convenciones del stack

- La aplicación se ejecuta desde archivos estáticos; usa HTTP local y no `file://`.
- Node solo verifica JavaScript y las herramientas del arnés; no ejecuta la PWA.
- La importación del cliente Supabase es remota y condicional, por lo que el modo local no tiene dependencias.
- La etapa de acceso vigente usa PINes del cliente (`0000` y `2407`) y no carga
  un SDK Google ni implementa una allowlist de correos. Cloudflare Access será
  una capa externa futura, no una dependencia de la PWA.
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
La misma normalización colapsa fechas duplicadas o superpuestas antes de crear
la proyección operativa y mantiene un contador visible de cruces.
La memoria de avisos usa tres tablas Supabase aditivas por destinatario y los
mismos adaptadores `state.store`; no introduce dependencias nuevas en el cliente.
Registrar un aviso previo usa una operación del puerto: el adaptador Supabase
invoca una RPC transaccional y el adaptador local aplica la misma transición.
Actualiza la notificación y agrega un evento sin abrir WhatsApp ni insertar un
lote ficticio. La reconciliación transforma cambios posteriores en
`needs_update` y retiros ya coordinados en cancelaciones accionables.

La planificación continua se implementa con aritmética de fechas nativa y un
temporizador del navegador que reconcilia el inicio una vez por minuto. No usa
una librería de calendario ni agrega persistencia: la ventana contiene 30 fechas
derivadas y la navegación manual sólo modifica estado de presentación. El cruce
de mes se representa con una clase visual en el día 1, sin capa ni dependencia nueva.

El cálculo de café de Beatriz usa la misma aritmética de fechas nativa. No agrega
dependencias ni datos al contrato de calendario: la cantidad de personas vive
sólo durante la preparación del mensaje de WhatsApp.
