# Seguridad

## Acceso

El bloqueo y el modo administrador son controles de interacción del cliente, pensados para impedir acciones accidentales en un dispositivo de confianza. No sustituyen una autorización robusta en el backend.

## Secretos

- La aplicación no debe guardar secretos operativos en documentación, fixtures o registros.
- Los valores sensibles de infraestructura se configuran fuera del repositorio.
- Cualquier cambio a las políticas de datos requiere revisar el flujo completo de acceso y recuperación.

La URL de proyecto y la clave publicable del cliente son configuración pública por diseño: identifican el backend, pero no autorizan por sí mismas. No deben confundirse con credenciales privadas ni usarse como única defensa.

Las políticas actuales permiten el uso compartido previsto desde el cliente público. Antes de hacerlas más estrictas hay que diseñar una identidad de usuario; de otro modo se rompería la operación familiar sin aportar una barrera completa.

## Amenazas y controles

| Riesgo | Control actual | Estado |
| --- | --- | --- |
| Acciones accidentales | bloqueo inicial, modo administrador y confirmaciones | En uso |
| Escritura no autorizada en el backend | no existe identidad de usuario; las políticas son abiertas | Riesgo aceptado, pendiente de diseño |
| Datos inconsistentes | restricciones SQL, claves foráneas, identidad opaca única y transiciones de estado | En uso; la unicidad manual sigue protegida por el cliente |
| Fallo del backend | degradación a almacenamiento local y aviso visible | En uso |
| Fuga de proveedor o huésped desde calendarios | `/availability` entrega Airbnb, Booking y particulares como fechas e identidad HMAC opaca; la UI muestra sólo “Reserva” | En uso |
| Confundir apertura con entrega de WhatsApp | estados separados y confirmación humana posterior | En uso |
| Texto no confiable | escape antes de insertarlo en la interfaz | En uso |

## Dependencias y despliegue

El único código de terceros cargado por la aplicación es el cliente Supabase remoto aprobado. Los workflows nuevos fijan las Actions a SHA; al actualizar una Action hay que verificar la versión y conservar el pin.

El despliegue público debe acompañarse con un control de acceso externo si la privacidad requerida supera el modelo familiar actual.

Los mensajes preparados para Beatriz contienen únicamente llegada, salida,
cantidad de personas, insumos de café calculados y la solicitud de limpieza. Los de Rodrigo contienen llegada, salida y la
solicitud de coordinación de acceso. Ninguno incluye origen de la reserva,
grupo, huésped, UID ni notas privadas.

La ventana móvil de 30 días se calcula exclusivamente con fechas ya disponibles
en el cliente. Cruzar al mes siguiente no amplía el contrato `/availability`,
no solicita campos adicionales y no altera los permisos de escritura. Marcar el
día 1 en dorado, sin tintes por mes, es únicamente una decisión de presentación.

Comunica incidentes a los administradores de la propiedad sin compartir datos de huéspedes por canales públicos.
