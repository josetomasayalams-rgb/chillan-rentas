# Verificación

Ejecuta `make ci` para comprobar sintaxis, contrato estático, límites de importación y artefactos de la PWA. Ejecuta `make gc` para detectar documentación obsoleta.

Resultados esperados:

- `make ci`: linter estático aprobado, `app.js` sintácticamente válido y las pruebas de arquitectura aprobadas;
- `make gc`: arquitectura, patrones y documentación vigentes;
- ningún comando modifica archivos.

En un navegador, verifica que el PIN `0000` desbloquee la aplicación sin mostrar
una barrera Google o de correo y que `2407` active el modo administrador. Luego
prueba creación/edición/cancelación de un arriendo y la transición de la limpieza
generada. Repite en modo local y, si está autorizado, en modo remoto. Cloudflare
Access todavía no forma parte de este recorrido.

Comprueba además que Airbnb, Booking y particulares usen el mismo tipo “Reserva”,
que las estadías consecutivas alternen tonos sin cambiar de color durante su
duración, que cada reserva sincronizada tenga un botón de aseo en checkout y que una
estadía finalizada permanezca visible hasta confirmar la limpieza.

Confirma que la grilla exponga exactamente 30 fechas consecutivas desde hoy,
resalte únicamente el día 1 en dorado, sin franjas ni tintes de fondo por mes,
muestre el rango correcto y no inserte huecos. Las flechas deben mover 30 días;
`Desde hoy` debe restaurar el rango vigente y el seguimiento diario.

Para las bandejas independientes de Beatriz y Rodrigo, sin enviar un mensaje real, verifica:

1. actualización al entrar, al volver al foco y mediante “Actualizar”;
2. selección de una y varias reservas pendientes;
3. preparación agrupada y cola de mensajes separados;
4. transición de “WhatsApp abierto” a “Envío confirmado” o “Pendiente”;
5. corrección de una confirmación y reenvío explícito;
6. persistencia separada después de recargar y ausencia de fuente, huésped, UID o notas;
7. diseño sin desborde en un viewport móvil;
8. registro de avisos previos sin abrir WhatsApp ni crear un lote.

Para probar la memoria histórica, selecciona como administrador cuatro reservas
`pending` o `needs_update` y usa **Registrar aviso previo**. Confirma que:

1. el diálogo explique que no se abrirá WhatsApp;
2. las cuatro queden `confirmed`, con evento auditable y sin `batch_id`;
3. después de recargar no vuelvan a ofrecerse como pendientes;
4. al incorporar una quinta reserva nueva, solo esa quinta quede accionable;
5. al cambiar las fechas de una confirmada, solamente esa reserva reaparezca como
   `needs_update` y el texto diga que reemplaza la coordinación anterior;
6. al retirar antes de tiempo una reserva confirmada, aparezca una cancelación
   pendiente y el mensaje deje sin efecto la limpieza o el acceso;
7. una reserva retirada que nunca fue avisada no genere una cancelación;
8. registrar en Beatriz no confirme ni oculte el aviso equivalente de Rodrigo;
9. repetir el registro no duplique eventos y un lote abierto anterior quede
   resuelto, sin volver a mostrar su confirmación.

En modo administrador, al preparar cualquier aviso para Beatriz, verifica que aparezca
antes el resumen de café. Cada reserva seleccionada debe pedir la cantidad de personas,
mostrar sus noches y calcular `personas × noches × 2` sachets, más 2 cápsulas Dolce
Gusto fijas. El texto resultante debe incluir ese recordatorio; el flujo de Rodrigo no
debe mostrarlo ni mencionar café.

En un viewport de 390 px confirma además que los extremos muestren completos
`Check-in 15:00` y `Check-out 12:00`. Sin modo administrador, la bandeja de
cada destinatario debe conservar su botón y conteo de pendientes, pero no debe
mostrar checkboxes, mensajes ya abiertos/confirmados ni controles para preparar,
registrar, corregir o reenviar. En modo administrador, los botones de la bandeja
deben ocupar el ancho disponible y conservar al menos 44 px de alto.

Si falla una frontera, sigue la ruta de remediación incluida en el mensaje y no extiendas `known-violations.json`. Una violación heredada solo podría entrar en la línea base durante una inicialización explícita del arnés.
