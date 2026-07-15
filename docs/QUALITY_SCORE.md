# Calidad

| Área | Estado | Evidencia |
| --- | --- | --- |
| Cliente estático | Controlado | sintaxis y contrato en `make ci` |
| Arquitectura | Controlado | allowlist de imports, acceso Supabase encapsulado y ratchet vacío |
| Persistencia | Parcial | interfaz de almacén y restricciones SQL; falta unicidad de limpieza por arriendo |
| Pruebas de interacción | Manual | guía de verificación del navegador |
| Seguridad | Riesgo aceptado | PIN cliente y RLS abierto documentados en `docs/SECURITY.md` |
| Deriva documental | Controlado | `make gc` y workflow semanal de solo reporte |
