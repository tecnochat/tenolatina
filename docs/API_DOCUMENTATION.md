# TecnoBot SAAS - Documentación de API

## Información General

**Versión:** 1.0.0  
**Base URL:** `http://localhost:3010/api`  
**Autenticación:** JWT Bearer Token  
**Formato de respuesta:** JSON  

## Autenticación

Todos los endpoints (excepto los de autenticación) requieren un token JWT válido en el header:

```
Authorization: Bearer <jwt_token>
```

### Estructura de respuesta estándar

```json
{
  "success": true|false,
  "data": {},
  "message": "Mensaje descriptivo",
  "error": "Mensaje de error (solo si success: false)"
}
```

## Endpoints de Autenticación

### POST /auth/login
Iniciar sesión en el sistema.

**Request Body:**
```json
{
  "email": "usuario@ejemplo.com",
  "password": "contraseña123"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "uuid",
      "email": "usuario@ejemplo.com",
      "full_name": "Nombre Usuario"
    },
    "tenant": {
      "id": "uuid",
      "name": "Mi Empresa",
      "domain": "mi-empresa",
      "plan_type": "pro"
    },
    "tokens": {
      "access_token": "jwt_token",
      "refresh_token": "refresh_token",
      "expires_in": 86400
    }
  }
}
```

### POST /auth/refresh
Renovar token de acceso.

**Request Body:**
```json
{
  "refresh_token": "refresh_token"
}
```

### POST /auth/logout
Cerrar sesión.

**Headers:** `Authorization: Bearer <token>`

---

## Endpoints de Chatbots

### GET /chatbots
Obtener lista de chatbots del tenant.

**Headers:** `Authorization: Bearer <token>`

**Query Parameters:**
- `page` (opcional): Número de página (default: 1)
- `limit` (opcional): Elementos por página (default: 20)
- `search` (opcional): Buscar por nombre
- `status` (opcional): Filtrar por estado (active, inactive)

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "name": "Mi Chatbot",
      "description": "Descripción del chatbot",
      "status": "active",
      "created_at": "2024-01-01T00:00:00Z",
      "stats": {
        "total_conversations": 150,
        "active_conversations": 5,
        "total_messages": 1250
      }
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 5,
    "pages": 1
  }
}
```

### GET /chatbots/:id
Obtener detalles de un chatbot específico.

**Headers:** `Authorization: Bearer <token>`

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "name": "Mi Chatbot",
    "description": "Descripción del chatbot",
    "status": "active",
    "qr_port": 3001,
    "welcome_message": "¡Hola! Soy tu asistente virtual.",
    "created_at": "2024-01-01T00:00:00Z",
    "updated_at": "2024-01-01T00:00:00Z"
  }
}
```

### POST /chatbots
Crear un nuevo chatbot.

**Headers:** `Authorization: Bearer <token>`

**Request Body:**
```json
{
  "name": "Mi Nuevo Chatbot",
  "description": "Descripción del chatbot",
  "welcome_message": "¡Hola! ¿En qué puedo ayudarte?"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "name": "Mi Nuevo Chatbot",
    "description": "Descripción del chatbot",
    "status": "inactive",
    "qr_port": 3002,
    "tenant_id": "uuid",
    "created_at": "2024-01-01T00:00:00Z"
  },
  "message": "Chatbot creado exitosamente"
}
```

### PUT /chatbots/:id
Actualizar un chatbot existente.

**Headers:** `Authorization: Bearer <token>`

**Request Body:**
```json
{
  "name": "Chatbot Actualizado",
  "description": "Nueva descripción",
  "welcome_message": "Mensaje de bienvenida actualizado"
}
```

### DELETE /chatbots/:id
Eliminar un chatbot.

**Headers:** `Authorization: Bearer <token>`

**Response:**
```json
{
  "success": true,
  "message": "Chatbot eliminado exitosamente"
}
```

### POST /chatbots/:id/activate
Activar un chatbot.

**Headers:** `Authorization: Bearer <token>`

### POST /chatbots/:id/deactivate
Desactivar un chatbot.

**Headers:** `Authorization: Bearer <token>`

---

## Endpoints de Configuración de Chatbots

### GET /chatbots/:id/config
Obtener configuración completa de un chatbot.

**Headers:** `Authorization: Bearer <token>`

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "chatbot_id": "uuid",
    "ai_provider": "openai",
    "ai_model": "gpt-3.5-turbo",
    "ai_temperature": 0.7,
    "ai_max_tokens": 150,
    "ai_system_prompt": "Eres un asistente virtual útil...",
    "webhook_url": "https://mi-webhook.com/endpoint",
    "webhook_events": ["message_received", "conversation_started"],
    "auto_response_enabled": true,
    "auto_response_delay": 1000,
    "business_hours": {
      "enabled": true,
      "timezone": "America/Mexico_City",
      "schedule": {
        "monday": {"start": "09:00", "end": "18:00"},
        "tuesday": {"start": "09:00", "end": "18:00"}
      }
    },
    "welcome_message_enabled": true,
    "typing_simulation": true,
    "conversation_timeout": 3600
  }
}
```

### PUT /chatbots/:id/config
Actualizar configuración de un chatbot.

**Headers:** `Authorization: Bearer <token>`

**Request Body:**
```json
{
  "ai_provider": "openai",
  "ai_model": "gpt-4",
  "ai_temperature": 0.8,
  "ai_max_tokens": 200,
  "ai_system_prompt": "Nuevo prompt del sistema...",
  "webhook_url": "https://nuevo-webhook.com/endpoint",
  "webhook_events": ["message_received", "message_sent"],
  "auto_response_enabled": true,
  "auto_response_delay": 2000
}
```

### GET /chatbots/:id/stats
Obtener estadísticas de un chatbot.

**Headers:** `Authorization: Bearer <token>`

**Query Parameters:**
- `period` (opcional): Período de estadísticas (24h, 7d, 30d, 90d) - default: 7d

**Response:**
```json
{
  "success": true,
  "data": {
    "chatbot": {
      "id": "uuid",
      "name": "Mi Chatbot"
    },
    "period": "7d",
    "summary": {
      "total_conversations": 45,
      "active_conversations": 3,
      "total_messages": 320,
      "incoming_messages": 160,
      "outgoing_messages": 160,
      "response_rate": "100.00"
    },
    "timeline": {
      "messages_by_day": {
        "2024-01-01": 25,
        "2024-01-02": 30,
        "2024-01-03": 45
      }
    }
  }
}
```

### POST /chatbots/:id/test-webhook
Probar webhook de un chatbot.

**Headers:** `Authorization: Bearer <token>`

**Response:**
```json
{
  "success": true,
  "data": {
    "webhook_url": "https://mi-webhook.com/endpoint",
    "status_code": 200,
    "response_body": "OK",
    "test_payload": {
      "event": "webhook_test",
      "chatbot_id": "uuid",
      "timestamp": "2024-01-01T00:00:00Z",
      "data": {
        "message": "Este es un mensaje de prueba del webhook",
        "test": true
      }
    }
  },
  "message": "Webhook de prueba enviado exitosamente"
}
```

---

## Endpoints de Gestión de Tenants (Solo Administradores de Plataforma)

### GET /tenants
Obtener lista de tenants.

**Headers:** `Authorization: Bearer <token>`  
**Permisos:** Solo `PLATFORM_ADMIN`

**Query Parameters:**
- `page` (opcional): Número de página
- `limit` (opcional): Elementos por página
- `search` (opcional): Buscar por nombre o dominio
- `status` (opcional): Filtrar por estado
- `plan` (opcional): Filtrar por plan

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "name": "Empresa ABC",
      "domain": "empresa-abc",
      "plan_type": "pro",
      "subscription_status": "active",
      "created_at": "2024-01-01T00:00:00Z",
      "tenant_users": [
        {
          "role": "owner",
          "users": {
            "email": "admin@empresa-abc.com",
            "full_name": "Admin Usuario"
          }
        }
      ],
      "stats": {
        "chatbot_count": 5,
        "user_count": 3
      }
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 10,
    "pages": 1
  }
}
```

### GET /tenants/:id
Obtener detalles de un tenant específico.

**Headers:** `Authorization: Bearer <token>`  
**Permisos:** Solo `PLATFORM_ADMIN`

### POST /tenants
Crear un nuevo tenant.

**Headers:** `Authorization: Bearer <token>`  
**Permisos:** Solo `PLATFORM_ADMIN`

**Request Body:**
```json
{
  "name": "Nueva Empresa",
  "domain": "nueva-empresa",
  "plan_type": "basic",
  "owner_email": "admin@nueva-empresa.com",
  "owner_name": "Administrador",
  "owner_password": "contraseña123",
  "settings": {
    "timezone": "America/Mexico_City",
    "language": "es"
  }
}
```

### PUT /tenants/:id
Actualizar un tenant.

**Headers:** `Authorization: Bearer <token>`  
**Permisos:** Solo `PLATFORM_ADMIN`

### DELETE /tenants/:id
Eliminar un tenant (soft delete por defecto).

**Headers:** `Authorization: Bearer <token>`  
**Permisos:** Solo `PLATFORM_ADMIN`

**Query Parameters:**
- `force` (opcional): `true` para eliminación permanente

### POST /tenants/:id/suspend
Suspender un tenant.

**Headers:** `Authorization: Bearer <token>`  
**Permisos:** Solo `PLATFORM_ADMIN`

**Request Body:**
```json
{
  "reason": "Violación de términos de servicio"
}
```

### POST /tenants/:id/reactivate
Reactivar un tenant suspendido.

**Headers:** `Authorization: Bearer <token>`  
**Permisos:** Solo `PLATFORM_ADMIN`

---

## Códigos de Error

### Códigos HTTP
- `200` - OK
- `201` - Created
- `400` - Bad Request
- `401` - Unauthorized
- `403` - Forbidden
- `404` - Not Found
- `409` - Conflict
- `422` - Unprocessable Entity
- `429` - Too Many Requests
- `500` - Internal Server Error

### Códigos de Error Personalizados

```json
{
  "success": false,
  "error": "Mensaje de error",
  "code": "ERROR_CODE"
}
```

**Códigos comunes:**
- `UNAUTHENTICATED` - Usuario no autenticado
- `INSUFFICIENT_PERMISSIONS` - Permisos insuficientes
- `INSUFFICIENT_ROLE` - Rol insuficiente
- `RESOURCE_ACCESS_DENIED` - Acceso denegado al recurso
- `TENANT_NOT_FOUND` - Tenant no encontrado
- `CHATBOT_NOT_FOUND` - Chatbot no encontrado
- `PLAN_LIMIT_EXCEEDED` - Límite del plan excedido
- `INVALID_CREDENTIALS` - Credenciales inválidas
- `TOKEN_EXPIRED` - Token expirado
- `VALIDATION_ERROR` - Error de validación
- `DUPLICATE_RESOURCE` - Recurso duplicado

---

## Middleware y Seguridad

### Tenant Isolation
Todos los endpoints aplican aislamiento de tenant automáticamente. Los usuarios solo pueden acceder a recursos de su propio tenant.

### Rate Limiting
- Máximo 60 requests por minuto por IP
- Límites específicos por plan para ciertas operaciones

### Validación de Permisos
Cada endpoint valida los permisos requeridos:
- `CHATBOTS_CREATE` - Crear chatbots
- `CHATBOTS_READ` - Leer chatbots
- `CHATBOTS_UPDATE` - Actualizar chatbots
- `CHATBOTS_DELETE` - Eliminar chatbots
- `ANALYTICS_VIEW` - Ver estadísticas
- `PLATFORM_ADMIN` - Administración de plataforma

### Logging y Auditoría
Todas las operaciones son registradas con:
- Usuario que ejecuta la acción
- Tenant afectado
- Timestamp
- IP y User-Agent
- Resultado de la operación

---

## Ejemplos de Uso

### Flujo de Autenticación
```javascript
// 1. Login
const loginResponse = await fetch('/api/auth/login', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    email: 'usuario@ejemplo.com',
    password: 'contraseña123'
  })
})

const { data } = await loginResponse.json()
const accessToken = data.tokens.access_token

// 2. Usar token en requests posteriores
const chatbotsResponse = await fetch('/api/chatbots', {
  headers: {
    'Authorization': `Bearer ${accessToken}`
  }
})
```

### Crear y Configurar Chatbot
```javascript
// 1. Crear chatbot
const createResponse = await fetch('/api/chatbots', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    name: 'Mi Chatbot de Ventas',
    description: 'Chatbot para atención al cliente',
    welcome_message: '¡Hola! ¿En qué puedo ayudarte hoy?'
  })
})

const { data: chatbot } = await createResponse.json()

// 2. Configurar IA
const configResponse = await fetch(`/api/chatbots/${chatbot.id}/config`, {
  method: 'PUT',
  headers: {
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    ai_provider: 'openai',
    ai_model: 'gpt-4',
    ai_temperature: 0.7,
    ai_system_prompt: 'Eres un asistente de ventas amigable y profesional.',
    auto_response_enabled: true,
    webhook_url: 'https://mi-sistema.com/webhook'
  })
})

// 3. Activar chatbot
const activateResponse = await fetch(`/api/chatbots/${chatbot.id}/activate`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${accessToken}`
  }
})
```

---

## Notas Importantes

1. **Versionado**: La API usa versionado semántico. Cambios breaking incluirán incremento de versión mayor.

2. **Paginación**: Todos los endpoints que retornan listas incluyen paginación automática.

3. **Filtrado**: Los endpoints de listado soportan filtros básicos via query parameters.

4. **Validación**: Todos los inputs son validados. Errores de validación retornan código 422.

5. **Caché**: Algunas respuestas pueden ser cacheadas. Usar headers apropiados para control de caché.

6. **Límites**: Cada plan tiene límites específicos que son validados automáticamente.

7. **Webhooks**: Los webhooks son enviados con retry automático en caso de falla.

8. **Logs**: Todas las operaciones son loggeadas para auditoría y debugging.

---

**Última actualización:** Enero 2024  
**Contacto:** soporte@tecnobot.com