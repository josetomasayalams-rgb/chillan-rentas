# Seguridad

## Acceso

El acceso vigente usa el PIN de entrada `0000` y el modo administrador mantiene
el PIN `2407`. Por ahora la aplicación no exige Google Auth ni una allowlist de
correos. Ambos PINes son controles de interacción del cliente, pensados para
impedir acciones accidentales en un dispositivo de confianza; no sustituyen una
autorización robusta en el backend.

Cuando estén confirmados los correos de José, Sofi, Beatriz, Rodrigo y Francisco,
Cloudflare Access reemplazará solamente el PIN de entrada. El PIN administrador
`2407` permanece como segundo control de las acciones administrativas. Esa etapa
también debe retirar el acceso anónimo directo a Supabase o enrutar las escrituras
por un backend autenticado; proteger solo la página dejaría abierta la API pública.

## Secretos

- La aplicación no debe guardar secretos operativos en documentación, fixtures o registros.
- Los valores sensibles de infraestructura se configuran fuera del repositorio.
- Cualquier cambio a las políticas de datos requiere revisar el flujo completo de acceso y recuperación.

La URL de proyecto y la clave publicable del cliente son configuración pública por diseño: identifican el backend, pero no autorizan por sí mismas. No deben confundirse con credenciales privadas ni usarse como única defensa.

Las políticas actuales permiten temporalmente el uso compartido desde el cliente
público, tanto para el rol anónimo como para el autenticado. Antes de hacerlas
más estrictas hay que desplegar y validar la barrera externa elegida; de otro modo
se rompería la operación de Beatriz, Rodrigo y Francisco.

## Amenazas y controles

| Riesgo | Control actual | Estado |
| --- | --- | --- |
| Acciones accidentales | PIN de entrada `0000`, PIN administrador `2407` y confirmaciones | En uso |
| Escritura no autorizada en el backend | no existe identidad de usuario; las políticas son abiertas | Riesgo aceptado, pendiente de diseño |
| Datos inconsistentes | restricciones SQL, claves foráneas, identidad opaca única y transiciones de estado | En uso; la unicidad manual sigue protegida por el cliente |
| Fallo del backend remoto configurado | bloqueo de la operación remota y aviso visible; no se crea una copia local divergente | En uso |
| Fuga de proveedor o huésped desde calendarios | `/availability` entrega Airbnb, Booking y particulares como fechas e identidad HMAC opaca; la UI muestra sólo “Reserva” | En uso |
| Confundir apertura con entrega de WhatsApp | estados separados y confirmación humana posterior | En uso |
| Aviso enviado antes de usar la memoria | registro administrativo explícito, confirmación humana y evento auditable sin lote ni apertura de WhatsApp | En uso |
| Texto no confiable | escape antes de insertarlo en la interfaz | En uso |

## Dependencias y despliegue

El único código de terceros cargado por la aplicación es el cliente Supabase remoto aprobado. Los workflows nuevos fijan las Actions a SHA; al actualizar una Action hay que verificar la versión y conservar el pin.

El despliegue actual conserva el acceso por PIN sin barrera Google o de correo.
Cloudflare Access es el control externo planificado, pero no se activa hasta
contar con la lista completa de correos y probar el acceso del equipo.

Los mensajes preparados para Beatriz contienen únicamente llegada, salida,
cantidad de personas, insumos de café calculados y la solicitud de limpieza. Los de Rodrigo contienen llegada, salida y la
solicitud de coordinación de acceso. Ninguno incluye origen de la reserva,
grupo, huésped, UID ni notas privadas.

**Registrar aviso previo** no envía ni abre WhatsApp. Solo un administrador puede
confirmar esa operación; la memoria guarda un evento sin `batch_id` y no vuelve
a ofrecer la reserva mientras su identidad y fechas permanezcan iguales. Si las
fechas cambian, el aviso vuelve a ser accionable como `needs_update`; si una
coordinación ya confirmada se cancela, aparece el aviso de cancelación. La RPC
remota registra esta transición atómicamente y rechaza destinatarios distintos
de Beatriz o Rodrigo.

La ventana móvil de 30 días se calcula exclusivamente con fechas ya disponibles
en el cliente. Cruzar al mes siguiente no amplía el contrato `/availability`,
no solicita campos adicionales y no altera los permisos de escritura. Marcar el
día 1 en dorado, sin tintes por mes, es únicamente una decisión de presentación.

Comunica incidentes a los administradores de la propiedad sin compartir datos de huéspedes por canales públicos.
