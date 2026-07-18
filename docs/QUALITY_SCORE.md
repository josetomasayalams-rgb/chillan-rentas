# Calidad

| Área | Estado | Evidencia |
| --- | --- | --- |
| Cliente estático | Controlado | sintaxis y contrato en `make ci` |
| Arquitectura | Controlado | allowlist de imports, acceso Supabase encapsulado y ratchet vacío |
| Persistencia | Parcial | interfaz de almacén y restricciones SQL; las sincronizadas tienen unicidad por `reservation_id`, la manual sigue en el cliente |
| Pruebas de interacción | Manual | guía de verificación del navegador |
| Seguridad | Riesgo aceptado | PIN cliente y RLS abierto documentados en `docs/SECURITY.md` |
| Deriva documental | Controlado | `make gc` y workflow semanal de solo reporte |
