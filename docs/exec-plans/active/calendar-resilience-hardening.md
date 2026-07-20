# Blindaje integral del calendario operacional

## Propósito

Proteger arriendos, limpiezas, comentarios y memorias de coordinación con Google Auth y RLS; añadir borrado lógico, auditoría e invariantes recuperables.

## Progreso

- [x] 2026-07-20: Se respaldaron esquema y datos productivos.
- [x] 2026-07-20: Se añadió interfaz Google Auth, allowlist de dos administradores y modo remoto fail-closed.
- [x] 2026-07-20: Se añadieron borrado lógico, auditoría, fechas estrictas y unicidad de limpieza activa.
- [x] 2026-07-20: La migración pasó sobre una restauración local productiva junto a la migración de Reservas.
- [ ] Desplegar cliente autenticado, validar José y Sofía y después revocar escrituras anónimas.
- [ ] Probar arriendo, limpieza, comentario y memoria de avisos en producción.

## Orden y rollback

El cliente autenticado se publica antes del cierre RLS. La revocación solo ocurre con ambas cuentas verificadas. El rollback usa el deployment anterior y el dump Supabase previo; nunca se borra físicamente una fila durante la operación normal.

## Validación

```sh
make ci
make gc
```
