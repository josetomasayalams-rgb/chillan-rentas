# Blindaje y acceso vigente del calendario operacional

## Propósito

Conservar el borrado lógico, la auditoría y los invariantes recuperables, mientras
la operación usa temporalmente el PIN de entrada `0000`, el PIN administrador
`2407` y políticas compatibles con el cliente público. La barrera de correo se
traslada a una futura configuración de Cloudflare Access.

## Progreso

- [x] 2026-07-20: Se respaldaron esquema y datos productivos.
- [x] 2026-07-20: Se añadió interfaz Google Auth y allowlist; esta decisión fue
  posteriormente reemplazada por el acceso temporal descrito abajo.
- [x] 2026-07-20: Se añadieron borrado lógico, auditoría, fechas estrictas y unicidad de limpieza activa.
- [x] 2026-07-20: La migración pasó sobre una restauración local productiva junto a la migración de Reservas.
- [x] 2026-07-21: Se decidió retirar por ahora la barrera Google/email, conservar
  `0000` y `2407` y restaurar el acceso necesario para Beatriz, Rodrigo y Francisco.
- [x] 2026-07-21: Se preparó el registro administrativo de avisos previos sin
  abrir WhatsApp ni crear lotes ficticios, mediante una RPC transaccional.
- [x] 2026-07-21: Los cambios de fechas generan coordinaciones de reemplazo y las
  reservas ya avisadas que se retiran generan un aviso de cancelación.
- [ ] Publicar el cliente y la política de acceso temporal; probar arriendo,
  limpieza, comentario y memoria de avisos en producción.
- [x] 2026-07-21: Se registraron las cuatro reservas vigentes como ya avisadas
  para Beatriz y Rodrigo; la base quedó sin pendientes ni lotes abiertos y la
  prueba de regresión confirma que una quinta nueva es la única ofrecida.
- [ ] Cuando se reciban los cinco correos, configurar y validar Cloudflare Access
  antes de retirar únicamente el PIN de entrada.

## Orden y rollback

Primero se publica y verifica el acceso temporal con `0000`/`2407` y las políticas
compatibles con el cliente público. El rollback usa el deployment anterior y el
dump Supabase previo; nunca se borra físicamente una fila durante la operación
normal. Cloudflare Access se incorpora en una etapa separada, después de probar
los correos de José, Sofi, Beatriz, Rodrigo y Francisco. Esa etapa reemplaza solo
el PIN de entrada y conserva `2407` para el modo administrador.

## Validación

```sh
make ci
make gc
```
