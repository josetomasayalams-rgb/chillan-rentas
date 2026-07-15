# Desarrollo local

Ejecuta `python3 -m http.server 8000` desde esta carpeta y abre `http://localhost:8000`. No uses `file://`, porque la importación remota del cliente no funcionará.

La aplicación usa almacenamiento local si no puede inicializar el backend. Para conectar datos compartidos, se aplica `schema.sql` en el proyecto Supabase autorizado y se configura el cliente en el punto central de configuración.

Node 20 o posterior se usa únicamente para ejecutar los controles locales del arnés. No hay instalación de dependencias.

Opcionalmente ejecuta `make hooks` una vez para activar el hook versionado de `.githooks/`. El hook corre `make ci` antes de cada commit; CI sigue siendo el control autoritativo.
