# Correcciones aplicadas para errores de timeout (408) en Railway

Este documento detalla los cambios implementados para resolver el error `Request Time-out (408) / Timed Out` observado al enviar mensajes con Baileys en Railway.

## Contexto del problema
- Railway usa almacenamiento efímero y puede reiniciar contenedores con frecuencia, afectando conexiones WebSocket persistentes.
- Baileys requiere una conexión WebSocket estable y credenciales persistentes para mantener la sesión.
- El error se originaba en llamadas de sincronización de WhatsApp (USync) cuando la conexión estaba débil o el socket se había cerrado sin detección.

## Objetivos de la solución
1. Aumentar la resiliencia de la conexión y reconexión.
2. Reducir timeouts y mantener la conexión viva (keep-alive) de forma más agresiva para entornos cloud.
3. Asegurar la creación del directorio de credenciales/sesión.
4. Usar Node LTS para mayor estabilidad.

## Cambios realizados

### 1) app.js
Archivo: src/app.js
- Se asegura la existencia del directorio de sesión `auth_info_baileys` en el arranque:
  - Se crea la carpeta si no existe, para evitar fallos al guardar credenciales en disco.
- Se inicializa el provider de Baileys con opciones optimizadas para entornos cloud (Railway):
  - `connectTimeoutMs: 60000`: más tiempo para establecer la conexión inicial.
  - `defaultQueryTimeoutMs: 30000`: timeout moderado para queries a WhatsApp.
  - `keepAliveIntervalMs: 15000`: keep-alive más frecuente para evitar cierres ociosos.
  - `retryRequestDelayMs: 2000` y `maxMsgRetryCount: 5`: reintentos controlados.
  - `generateHighQualityLinkPreview: false` y `syncFullHistory: false`: reducir operaciones costosas.
  - `browser` identificado como "TecnoBot Railway".

Código clave agregado:
- Creación de `auth_info_baileys` y configuración de provider con los parámetros anteriores.

### 2) ConnectionManager
Archivo: src/services/connection-manager.js
- Reconexión más robusta y ping/keepalive más agresivo:
  - `maxReconnectAttempts` incrementado a 15.
  - `reconnectDelay` reducido a 3s con backoff hasta `maxReconnectDelay` de 3 min.
  - Health check/ping cada 15s (`healthCheckInterval = 15000`).
  - Verificación del estado del WebSocket (`provider?.sock?.ws?.readyState === 1`). Si no está listo, se marca como desconectado y se emite `disconnected` para forzar recuperación.
- Manejo de credenciales:
  - Implementado `saveSession()` que invoca `provider.saveCreds()` cuando está disponible, capturando errores y registrando logs.

### 3) Dockerfile
Archivo: Dockerfile
- Migración a Node LTS estable:
  - De `node:21-alpine3.18` a `node:20-alpine3.19`.
  - Esto mejora la compatibilidad con dependencias como Baileys y reduce riesgos de runtime.
- Se mantiene PNPM y dependencias necesarias para `sharp` y build.

## Recomendaciones de variables de entorno (Railway)
- NODE_ENV=production
- MEMORY_LIMIT=1024
- (Opcional) Ajustar timeouts si lo requiere la infraestructura:
  - KEEPALIVE_INTERVAL_MS=15000
  - CONNECT_TIMEOUT_MS=60000
  - DEFAULT_QUERY_TIMEOUT_MS=30000

## Consideraciones
- Railway no persiste el sistema de archivos entre despliegues. Si necesitas persistencia real de sesión Baileys entre reinicios, evalúa almacenar las credenciales en un servicio de almacenamiento persistente (p.ej., Supabase Storage o base de datos) y restaurarlas al iniciar.
- Si el contenedor entra en estado de suspensión por inactividad, el socket se perderá igualmente; los pings ayudan a mantenerlo activo, pero existe el costo asociado.

## Próximos pasos sugeridos
- Persistencia de credenciales en Supabase o almacenamiento externo.
- Métricas y alertas para reconexiones y latencias.
- Implementar endpoints de health-check integrados a Railway para reinicios controlados cuando sea necesario.