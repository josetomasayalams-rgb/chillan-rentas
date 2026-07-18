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
| Datos inconsistentes | restricciones SQL, claves foráneas y transiciones de estado | Parcial; falta unicidad de limpieza por arriendo |
| Fallo del backend | degradación a almacenamiento local y aviso visible | En uso |
| Fuga de proveedor o huésped desde calendarios | `/availability` entrega fechas e identidad HMAC opaca; la UI muestra “Reservado” | En uso |
| Confundir apertura con entrega de WhatsApp | estados separados y confirmación humana posterior | En uso |
| Texto no confiable | escape antes de insertarlo en la interfaz | En uso |

## Dependencias y despliegue

El único código de terceros cargado por la aplicación es el cliente Supabase remoto aprobado. Los workflows nuevos fijan las Actions a SHA; al actualizar una Action hay que verificar la versión y conservar el pin.

El despliegue público debe acompañarse con un control de acceso externo si la privacidad requerida supera el modelo familiar actual.

Los mensajes preparados para Beatriz contienen únicamente llegada, salida y
la solicitud de limpieza. La plataforma no recibe el origen de la reserva,
familia, huésped, UID ni notas privadas.

Comunica incidentes a los administradores de la propiedad sin compartir datos de huéspedes por canales públicos.
