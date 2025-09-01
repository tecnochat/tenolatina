# 🚀 INSTRUCCIONES DE CONFIGURACIÓN - TECNOBOT SAAS

## ⚠️ CONFIGURACIÓN REQUERIDA DE SUPABASE

Antes de ejecutar el proyecto, **DEBES** configurar la base de datos en Supabase siguiendo estos pasos:

### 📋 PASO 1: Acceder a Supabase

1. Ve a [https://supabase.com](https://supabase.com)
2. Inicia sesión en tu cuenta
3. Selecciona tu proyecto de TecnoBot
4. Ve a **SQL Editor** en el menú lateral

### 🗄️ PASO 2: Configurar Base de Datos

### SOLUCIÓN RECOMENDADA: Script Seguro Universal
```bash
# Ejecutar script seguro (funciona para cualquier estado de BD)
psql -h [HOST] -p [PORT] -U [USER] -d [DATABASE] -f database/safe-basic-setup.sql
```

**✅ VENTAJAS del script seguro:**
- Funciona con bases de datos vacías o con tablas existentes
- Verifica existencia de tablas y columnas antes de crearlas
- Agrega columnas faltantes sin errores
- Configura RLS y políticas correctamente
- Es seguro ejecutarlo múltiples veces
- Maneja todos los errores comunes automáticamente

### SCRIPTS ALTERNATIVOS (solo si el seguro falla)

#### Para bases de datos completamente vacías:
```bash
psql -h [HOST] -p [PORT] -U [USER] -d [DATABASE] -f database/basic-tables-setup.sql
```

#### Para bases de datos con tablas existentes:
```bash
# Primero corregir columnas faltantes
psql -h [HOST] -p [PORT] -U [USER] -d [DATABASE] -f database/fix-tenant-id-error.sql
# Luego configuración completa
psql -h [HOST] -p [PORT] -U [USER] -d [DATABASE] -f database/complete-setup.sql
```

### ⚠️ SOLUCIÓN A ERRORES COMUNES

#### Error: "relation does not exist" O problemas con funciones no encontradas

Si encuentras errores como `relation "conversations" does not exist` o problemas con funciones no encontradas:

**PASO 2: Configuración básica (RECOMENDADO)**
1. Ve a tu proyecto de Supabase
2. Abre el **SQL Editor**
3. Copia y pega el contenido de `database/basic-tables-setup.sql`
4. Ejecuta el script
5. Verifica que veas mensajes de confirmación

Este script:
- ✅ Crea solo las tablas básicas necesarias
- ✅ No depende de funciones complejas
- ✅ Incluye todas las columnas tenant_id desde el inicio
- ✅ Configura RLS y políticas básicas
- ✅ Es completamente seguro ejecutar múltiples veces
- ✅ Perfecto para bases de datos completamente vacías

> ⚠️ **IMPORTANTE**: Este script es ideal cuando tu base de datos está vacía o tienes errores de "relation does not exist".

### 📋 PASO 3: Verificar Configuración Exitosa

Deberías ver un mensaje de éxito similar a:
```
🎉 CONFIGURACIÓN SEGURA COMPLETADA
✅ Todas las tablas y columnas verificadas/creadas
🏢 Se creó un tenant por defecto: "Mi Empresa"
🔐 Políticas RLS configuradas para seguridad
🚀 ¡Tu sistema está listo para SAAS multi-tenant!
```

**Verifica que se crearon estas 7 tablas básicas:**
- ✅ `migrations`
- ✅ `tenants` 
- ✅ `tenant_users`
- ✅ `chatbots` (con tenant_id)
- ✅ `conversations` (con tenant_id y chatbot_id)
- ✅ `messages` (con tenant_id, conversation_id y chatbot_id)
- ✅ `flows` (con tenant_id y chatbot_id)

**Consulta de verificación rápida:**
```sql
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN (
    'migrations', 'tenants', 'tenant_users', 'chatbots', 
    'conversations', 'messages', 'flows'
)
ORDER BY table_name;
```

**Deberías ver exactamente 7 tablas básicas** con todas las columnas tenant_id necesarias.

### 📋 PASO 4: Configurar Variables de Entorno

Asegúrate de que tu archivo `.env` tenga las siguientes variables configuradas:

```env
# Supabase Configuration
SUPABASE_URL=tu_supabase_url
SUPABASE_ANON_KEY=tu_anon_key
SUPABASE_SERVICE_ROLE_KEY=tu_service_role_key

# JWT Configuration
JWT_SECRET=tu_jwt_secret_muy_seguro
JWT_EXPIRES_IN=24h
JWT_REFRESH_EXPIRES_IN=7d
```

### 📋 PASO 5: Ejecutar Inicialización del Proyecto

Una vez completados los pasos anteriores, ejecuta:

```bash
npm run init
```

## 🔧 COMANDOS DISPONIBLES

```bash
# Inicializar proyecto (después de configurar Supabase)
npm run init

# Ejecutar en modo desarrollo
npm run dev

# Ejecutar servidor SAAS
npm run saas

# Limpiar datos y sesiones
npm run clean
```

## ❌ SOLUCIÓN DE PROBLEMAS

### Error: "relation 'public.migrations' does not exist" - SOLUCIONADO ✅

**El error de sintaxis SQL ha sido corregido.** Si ves el error "relation does not exist" al ejecutar `npm run init`, significa que las tablas no han sido creadas en Supabase.

**Solución:**
1. Ve al SQL Editor de Supabase
2. **IMPORTANTE:** Ejecuta el contenido completo de `database/init-supabase.sql` de una sola vez
3. El script ahora tiene la sintaxis correcta (se eliminó `IF NOT EXISTS` de las políticas RLS)
4. Verifica que todas las tablas se hayan creado correctamente
5. Vuelve a ejecutar `npm run init`

**Tablas que deben crearse:**
- ✅ migrations
- ✅ tenants  
- ✅ tenant_users
- ✅ chatbots
- ✅ conversations
- ✅ messages
- ✅ flows
- ✅ analytics_events
- ✅ webhooks
- ✅ webhook_logs

### Error: "Variables de entorno faltantes"

**Causa:** Faltan variables en el archivo `.env`.

**Solución:** Verifica que todas las variables del paso 4 estén configuradas.

### Error de conexión a Supabase

**Causa:** URLs o keys incorrectas en `.env`.

**Solución:** 
1. Ve a tu proyecto en Supabase
2. Ve a **Settings > API**
3. Copia las URLs y keys correctas
4. Actualiza tu archivo `.env`

## 📞 SOPORTE

Si tienes problemas con la configuración:

1. Verifica que hayas seguido todos los pasos
2. Revisa los logs de error para más detalles
3. Asegúrate de que tu proyecto de Supabase esté activo
4. Verifica que tengas permisos de administrador en el proyecto

---

**⚠️ IMPORTANTE:** Este proceso de configuración solo se debe hacer **UNA VEZ** por proyecto. Una vez configurado, el sistema funcionará automáticamente.