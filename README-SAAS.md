# 🤖 TecnoBot SAAS - Plataforma Multi-Tenant de Chatbots WhatsApp

## 📋 Descripción

TecnoBot SAAS es una plataforma multi-tenant que permite a múltiples usuarios crear y gestionar sus propios chatbots de WhatsApp con inteligencia artificial. La plataforma está construida con Node.js, Express, Supabase y Baileys, ofreciendo una solución escalable y segura para empresas de todos los tamaños.

## 🏗️ Arquitectura

### Componentes Principales

- **Backend API**: Node.js + Express con arquitectura multi-tenant
- **Base de Datos**: Supabase con Row Level Security (RLS)
- **WhatsApp Integration**: Baileys con gestión de múltiples sesiones
- **Autenticación**: JWT + Supabase Auth
- **IA**: OpenAI GPT para respuestas inteligentes
- **Frontend**: React + TypeScript (Dashboard administrativo)

### Características SAAS

- ✅ **Multi-tenancy**: Aislamiento completo entre usuarios
- ✅ **Planes de suscripción**: Free, Basic, Pro, Enterprise
- ✅ **Gestión de equipos**: Invitaciones y roles
- ✅ **Múltiples chatbots**: Por tenant según el plan
- ✅ **Sesiones WhatsApp**: Múltiples conexiones simultáneas
- ✅ **Analytics**: Métricas detalladas por tenant
- ✅ **API REST**: Acceso programático completo
- ✅ **Seguridad**: Rate limiting, RBAC, RLS

## 🚀 Instalación Rápida

### Prerrequisitos

- Node.js 18+ 
- npm o yarn
- Cuenta de Supabase
- Cuenta de OpenAI (opcional)
- Cuenta de Google Cloud (opcional)

### 1. Clonar el Repositorio

```bash
git clone https://github.com/tu-usuario/tecnobot-saas.git
cd tecnobot-saas
```

### 2. Instalar Dependencias

```bash
npm install
```

### 3. Configurar Variables de Entorno

```bash
cp .env.example .env
```

Edita el archivo `.env` con tus credenciales:

```env
# Configuración básica
PORT=3000
NODE_ENV=development

# Supabase (REQUERIDO)
SUPABASE_URL=https://tu-proyecto.supabase.co
SUPABASE_ANON_KEY=tu-anon-key
SUPABASE_SERVICE_ROLE_KEY=tu-service-role-key

# JWT (REQUERIDO)
JWT_SECRET=tu-jwt-secret-super-seguro

# OpenAI (Opcional)
OPENAI_API_KEY=sk-tu-api-key

# Google APIs (Opcional)
GOOGLE_API_KEY=tu-google-api-key
```

### 4. Configurar Base de Datos

Ejecuta las migraciones en Supabase:

```bash
# Copia el contenido de las migraciones a tu proyecto Supabase
# src/migrations/20250121000001_create_tenant_profiles.sql
# src/migrations/20250121000002_create_team_members.sql
```

### 5. Iniciar el Servidor

```bash
# Desarrollo
npm run dev

# Producción
npm start
```

## 📚 Estructura del Proyecto

```
src/
├── config/
│   ├── app-config.js      # Configuración centralizada
│   └── supabase.js        # Cliente Supabase multi-tenant
├── middleware/
│   ├── tenant-isolation.js # Aislamiento de tenants
│   └── rbac.js            # Control de acceso basado en roles
├── services/
│   ├── auth-service.js    # Servicio de autenticación
│   └── multi-session-manager.js # Gestor de sesiones WhatsApp
├── routes/
│   ├── auth.js           # Rutas de autenticación
│   ├── chatbots.js       # CRUD de chatbots
│   └── whatsapp.js       # Gestión de WhatsApp
├── migrations/           # Migraciones de base de datos
└── server.js            # Servidor principal
```

## 🔐 Autenticación y Autorización

### Registro de Usuario

```bash
POST /api/auth/register
{
  "email": "usuario@ejemplo.com",
  "password": "password123",
  "firstName": "Juan",
  "lastName": "Pérez",
  "companyName": "Mi Empresa",
  "plan": "free"
}
```

### Login

```bash
POST /api/auth/login
{
  "email": "usuario@ejemplo.com",
  "password": "password123"
}
```

### Roles Disponibles

- **Platform Admin**: Acceso completo a la plataforma
- **Tenant Admin**: Administrador del tenant
- **Chatbot Editor**: Puede crear/editar chatbots
- **Operator**: Puede operar chatbots existentes
- **Viewer**: Solo lectura

## 🤖 Gestión de Chatbots

### Crear Chatbot

```bash
POST /api/chatbots
Authorization: Bearer <token>
{
  "name": "Mi Chatbot",
  "description": "Chatbot para atención al cliente",
  "config": {
    "ai_enabled": true,
    "welcome_enabled": true
  }
}
```

### Listar Chatbots

```bash
GET /api/chatbots?page=1&limit=10&search=cliente
Authorization: Bearer <token>
```

## 📱 Gestión de WhatsApp

### Generar Código QR

```bash
POST /api/whatsapp/sessions/{chatbotId}/generate-qr
Authorization: Bearer <token>
```

### Ver Estado de Sesiones

```bash
GET /api/whatsapp/sessions
Authorization: Bearer <token>
```

### Enviar Mensaje de Prueba

```bash
POST /api/whatsapp/sessions/{chatbotId}/send-message
Authorization: Bearer <token>
{
  "phoneNumber": "+1234567890",
  "message": "Hola, este es un mensaje de prueba"
}
```

## 📊 Planes y Límites

| Característica | Free | Basic | Pro | Enterprise |
|---|---|---|---|---|
| Chatbots | 1 | 3 | 10 | Ilimitado |
| Mensajes/mes | 1,000 | 10,000 | 50,000 | Ilimitado |
| Sesiones WhatsApp | 1 | 3 | 10 | 50 |
| Miembros del equipo | 1 | 3 | 10 | Ilimitado |
| IA Avanzada | ❌ | ✅ | ✅ | ✅ |
| Analytics | Básico | ✅ | ✅ | ✅ |
| API Access | ❌ | ❌ | ✅ | ✅ |
| Soporte Prioritario | ❌ | ❌ | ❌ | ✅ |

## 🔧 Configuración Avanzada

### Rate Limiting

```env
RATE_LIMIT_WINDOW=900000      # 15 minutos
RATE_LIMIT_MAX_REQUESTS=100   # 100 requests por ventana
```

### WhatsApp Sessions

```env
MAX_WHATSAPP_SESSIONS=50      # Máximo global
WHATSAPP_SESSION_TIMEOUT=1800000  # 30 minutos
QR_TIMEOUT=60000              # 1 minuto
```

### OpenAI

```env
OPENAI_MODEL=gpt-3.5-turbo
OPENAI_MAX_TOKENS=1000
OPENAI_TEMPERATURE=0.7
```

## 📈 Monitoreo y Analytics

### Health Check

```bash
GET /health
```

### Métricas de Uso

```bash
GET /api/whatsapp/usage?period=30d
Authorization: Bearer <token>
```

### Analytics de Chatbot

```bash
GET /api/chatbots/{id}/analytics?period=7d
Authorization: Bearer <token>
```

## 🛡️ Seguridad

### Características de Seguridad

- **Row Level Security (RLS)**: Aislamiento a nivel de base de datos
- **JWT Tokens**: Autenticación segura
- **Rate Limiting**: Protección contra ataques
- **CORS**: Configuración de orígenes permitidos
- **Helmet**: Headers de seguridad
- **Input Validation**: Validación de datos de entrada

### Mejores Prácticas

1. Cambia `JWT_SECRET` en producción
2. Usa HTTPS en producción
3. Configura CORS apropiadamente
4. Monitorea logs de seguridad
5. Actualiza dependencias regularmente

## 🚀 Deployment

### Docker

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3000
CMD ["npm", "start"]
```

### Variables de Entorno de Producción

```env
NODE_ENV=production
PORT=3000
JWT_SECRET=tu-jwt-secret-super-seguro-y-largo
SUPABASE_URL=https://tu-proyecto.supabase.co
SUPABASE_ANON_KEY=tu-anon-key
SUPABASE_SERVICE_ROLE_KEY=tu-service-role-key
```

## 🧪 Testing

```bash
# Tests unitarios
npm test

# Tests de integración
npm run test:integration

# Coverage
npm run test:coverage
```

## 📖 API Documentation

La documentación completa de la API está disponible en:

- **Desarrollo**: http://localhost:3000/api/docs
- **Producción**: https://tu-dominio.com/api/docs

## 🤝 Contribución

1. Fork el proyecto
2. Crea una rama para tu feature (`git checkout -b feature/AmazingFeature`)
3. Commit tus cambios (`git commit -m 'Add some AmazingFeature'`)
4. Push a la rama (`git push origin feature/AmazingFeature`)
5. Abre un Pull Request

## 📝 Changelog

### v2.0.0 - SAAS Multi-Tenant

- ✅ Arquitectura multi-tenant completa
- ✅ Sistema de autenticación JWT
- ✅ Gestión de múltiples sesiones WhatsApp
- ✅ Planes de suscripción
- ✅ Sistema de roles y permisos
- ✅ API REST completa
- ✅ Dashboard administrativo
- ✅ Analytics y métricas

### v1.0.0 - Versión Monolítica

- ✅ Chatbot básico con BuilderBot
- ✅ Integración WhatsApp
- ✅ IA con OpenAI
- ✅ Base de datos Supabase

## 📄 Licencia

Este proyecto está bajo la Licencia MIT - ver el archivo [LICENSE](LICENSE) para detalles.

## 🆘 Soporte

- **Email**: soporte@tecnobot.com
- **Discord**: [Servidor de Discord](https://discord.gg/tecnobot)
- **Documentación**: [docs.tecnobot.com](https://docs.tecnobot.com)
- **Issues**: [GitHub Issues](https://github.com/tu-usuario/tecnobot-saas/issues)

## 🙏 Agradecimientos

- [BuilderBot](https://builderbot.app/) - Framework base original
- [Baileys](https://github.com/WhiskeySockets/Baileys) - WhatsApp Web API
- [Supabase](https://supabase.com/) - Backend as a Service
- [OpenAI](https://openai.com/) - Inteligencia Artificial

---

**¿Listo para crear tu plataforma de chatbots SAAS? 🚀**

Sigue las instrucciones de instalación y tendrás tu plataforma funcionando en minutos.