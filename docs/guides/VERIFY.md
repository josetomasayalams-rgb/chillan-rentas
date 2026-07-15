# Verificación

Ejecuta `make ci` para comprobar sintaxis, contrato estático, límites de importación y artefactos de la PWA. Ejecuta `make gc` para detectar documentación obsoleta.

Resultados esperados:

- `make ci`: linter estático aprobado, `app.js` sintácticamente válido y las pruebas de arquitectura aprobadas;
- `make gc`: arquitectura, patrones y documentación vigentes;
- ningún comando modifica archivos.

En un navegador, verifica el bloqueo, el desbloqueo, el modo administrador, creación/edición/cancelación de un arriendo y la transición de la limpieza generada. Repite en modo local y, si está autorizado, en modo remoto.

Si falla una frontera, sigue la ruta de remediación incluida en el mensaje y no extiendas `known-violations.json`. Una violación heredada solo podría entrar en la línea base durante una inicialización explícita del arnés.
