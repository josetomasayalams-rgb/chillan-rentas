# Verificación

Ejecuta `make ci` para comprobar sintaxis, contrato estático, límites de importación y artefactos de la PWA. Ejecuta `make gc` para detectar documentación obsoleta.

Resultados esperados:

- `make ci`: linter estático aprobado, `app.js` sintácticamente válido y las pruebas de arquitectura aprobadas;
- `make gc`: arquitectura, patrones y documentación vigentes;
- ningún comando modifica archivos.

En un navegador, verifica el bloqueo, el desbloqueo, el modo administrador, creación/edición/cancelación de un arriendo y la transición de la limpieza generada. Repite en modo local y, si está autorizado, en modo remoto.

Comprueba además que Airbnb, Booking y particulares usen el mismo tipo “Reserva”,
que las estadías consecutivas alternen tonos sin cambiar de color durante su
duración, que cada reserva sincronizada tenga un botón de aseo en checkout y que una
estadía finalizada permanezca visible hasta confirmar la limpieza.

Confirma que la grilla exponga exactamente 30 fechas consecutivas desde hoy,
incluya una franja con nombre y cantidad de días por mes, resalte el día 1,
muestre el rango correcto y no inserte huecos. Las flechas deben mover 30 días;
`Desde hoy` debe restaurar el rango vigente y el seguimiento diario.

Para las bandejas independientes de Beatriz y Rodrigo, sin enviar un mensaje real, verifica:

1. actualización al entrar, al volver al foco y mediante “Actualizar”;
2. selección de una y varias reservas pendientes;
3. preparación agrupada y cola de mensajes separados;
4. transición de “WhatsApp abierto” a “Envío confirmado” o “Pendiente”;
5. corrección de una confirmación y reenvío explícito;
6. persistencia separada después de recargar y ausencia de fuente, huésped, UID o notas;
7. diseño sin desborde en un viewport móvil.

En un viewport de 390 px confirma además que los extremos muestren completos
`Check-in 15:00` y `Check-out 12:00`. Sin modo administrador, la bandeja de
Cada destinatario debe conservar su botón y conteo de pendientes, pero no debe mostrar
checkboxes, mensajes ya abiertos/confirmados ni controles para preparar o corregir.

Si falla una frontera, sigue la ruta de remediación incluida en el mensaje y no extiendas `known-violations.json`. Una violación heredada solo podría entrar en la línea base durante una inicialización explícita del arnés.
