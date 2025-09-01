/**
 * Servicio de Notificaciones
 * Maneja el envío de emails, SMS, push notifications y otras notificaciones
 */

const { createSupabaseClient } = require('../config/supabase');
const { logger } = require('../utils/logger');
const { AppError, ExternalServiceError } = require('../utils/errors');
const EventEmitter = require('events');

class NotificationService extends EventEmitter {
    constructor() {
        super();
        this.providers = new Map();
        this.templates = new Map();
        this.queue = [];
        this.processing = false;
        this.initializeProviders();
        this.loadTemplates();
    }

    /**
     * Inicializar proveedores de notificaciones
     */
    initializeProviders() {
        // Email providers
        this.providers.set('email', {
            smtp: {
                name: 'SMTP',
                available: true,
                config: {
                    host: process.env.SMTP_HOST || 'localhost',
                    port: process.env.SMTP_PORT || 587,
                    secure: false,
                    auth: {
                        user: process.env.SMTP_USER,
                        pass: process.env.SMTP_PASS
                    }
                }
            },
            sendgrid: {
                name: 'SendGrid',
                available: !!process.env.SENDGRID_API_KEY,
                config: {
                    apiKey: process.env.SENDGRID_API_KEY
                }
            }
        });

        // SMS providers
        this.providers.set('sms', {
            twilio: {
                name: 'Twilio',
                available: !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN),
                config: {
                    accountSid: process.env.TWILIO_ACCOUNT_SID,
                    authToken: process.env.TWILIO_AUTH_TOKEN,
                    from: process.env.TWILIO_PHONE_NUMBER
                }
            }
        });

        // Push notification providers
        this.providers.set('push', {
            firebase: {
                name: 'Firebase Cloud Messaging',
                available: !!process.env.FIREBASE_SERVER_KEY,
                config: {
                    serverKey: process.env.FIREBASE_SERVER_KEY
                }
            }
        });

        logger.info('Notification providers initialized', {
            email: Object.keys(this.providers.get('email')).filter(k => this.providers.get('email')[k].available),
            sms: Object.keys(this.providers.get('sms')).filter(k => this.providers.get('sms')[k].available),
            push: Object.keys(this.providers.get('push')).filter(k => this.providers.get('push')[k].available)
        });
    }

    /**
     * Cargar plantillas de notificaciones
     */
    loadTemplates() {
        // Plantillas de email
        this.templates.set('email', {
            welcome: {
                subject: 'Bienvenido a TecnoBot',
                html: `
                    <h1>¡Bienvenido a TecnoBot!</h1>
                    <p>Hola {{name}},</p>
                    <p>Gracias por registrarte en TecnoBot. Tu cuenta ha sido creada exitosamente.</p>
                    <p>Puedes comenzar a crear tu primer chatbot accediendo a tu dashboard:</p>
                    <a href="{{dashboard_url}}" style="background: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Ir al Dashboard</a>
                    <p>Si tienes alguna pregunta, no dudes en contactarnos.</p>
                    <p>¡Saludos!<br>El equipo de TecnoBot</p>
                `,
                text: 'Bienvenido a TecnoBot, {{name}}. Tu cuenta ha sido creada exitosamente. Accede a tu dashboard en {{dashboard_url}}'
            },
            invitation: {
                subject: 'Invitación a unirse al equipo en TecnoBot',
                html: `
                    <h1>Invitación al equipo</h1>
                    <p>Hola,</p>
                    <p>{{inviter_name}} te ha invitado a unirte al equipo "{{team_name}}" en TecnoBot.</p>
                    <p>Rol asignado: {{role}}</p>
                    <p>Para aceptar la invitación, haz clic en el siguiente enlace:</p>
                    <a href="{{invitation_url}}" style="background: #28a745; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Aceptar Invitación</a>
                    <p>Esta invitación expira el {{expiry_date}}.</p>
                    <p>¡Saludos!<br>El equipo de TecnoBot</p>
                `,
                text: '{{inviter_name}} te ha invitado a unirte al equipo "{{team_name}}" en TecnoBot. Acepta la invitación en {{invitation_url}}'
            },
            password_reset: {
                subject: 'Restablecer contraseña - TecnoBot',
                html: `
                    <h1>Restablecer contraseña</h1>
                    <p>Hola {{name}},</p>
                    <p>Recibimos una solicitud para restablecer la contraseña de tu cuenta.</p>
                    <p>Haz clic en el siguiente enlace para crear una nueva contraseña:</p>
                    <a href="{{reset_url}}" style="background: #dc3545; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Restablecer Contraseña</a>
                    <p>Este enlace expira en 1 hora.</p>
                    <p>Si no solicitaste este cambio, puedes ignorar este email.</p>
                    <p>¡Saludos!<br>El equipo de TecnoBot</p>
                `,
                text: 'Solicitud de restablecimiento de contraseña para {{name}}. Usa este enlace: {{reset_url}}'
            },
            plan_limit_warning: {
                subject: 'Límite del plan alcanzado - TecnoBot',
                html: `
                    <h1>Límite del plan alcanzado</h1>
                    <p>Hola {{name}},</p>
                    <p>Tu cuenta ha alcanzado el {{limit_percentage}}% del límite de {{limit_type}} de tu plan {{plan_name}}.</p>
                    <p>Límite actual: {{current_usage}} / {{limit_value}}</p>
                    <p>Para continuar sin interrupciones, considera actualizar tu plan:</p>
                    <a href="{{upgrade_url}}" style="background: #ffc107; color: black; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Actualizar Plan</a>
                    <p>¡Saludos!<br>El equipo de TecnoBot</p>
                `,
                text: 'Límite del plan alcanzado: {{current_usage}}/{{limit_value}} {{limit_type}}. Actualiza en {{upgrade_url}}'
            },
            maintenance_notice: {
                subject: 'Mantenimiento programado - TecnoBot',
                html: `
                    <h1>Mantenimiento programado</h1>
                    <p>Estimado usuario,</p>
                    <p>Te informamos que realizaremos un mantenimiento programado en nuestros sistemas:</p>
                    <ul>
                        <li><strong>Fecha:</strong> {{maintenance_date}}</li>
                        <li><strong>Hora:</strong> {{maintenance_time}}</li>
                        <li><strong>Duración estimada:</strong> {{duration}}</li>
                    </ul>
                    <p>Durante este período, el servicio podría no estar disponible temporalmente.</p>
                    <p>Descripción: {{description}}</p>
                    <p>Disculpa las molestias ocasionadas.</p>
                    <p>¡Saludos!<br>El equipo de TecnoBot</p>
                `,
                text: 'Mantenimiento programado el {{maintenance_date}} a las {{maintenance_time}}. Duración: {{duration}}'
            }
        });

        // Plantillas de SMS
        this.templates.set('sms', {
            verification: {
                text: 'Tu código de verificación para TecnoBot es: {{code}}. Válido por 10 minutos.'
            },
            alert: {
                text: 'TecnoBot Alert: {{message}}'
            }
        });

        // Plantillas de push notifications
        this.templates.set('push', {
            new_message: {
                title: 'Nuevo mensaje',
                body: 'Tienes un nuevo mensaje en {{chatbot_name}}',
                icon: '/icon-192x192.png',
                badge: '/badge-72x72.png'
            },
            system_alert: {
                title: 'TecnoBot',
                body: '{{message}}',
                icon: '/icon-192x192.png'
            }
        });

        logger.info('Notification templates loaded', {
            email: Object.keys(this.templates.get('email')).length,
            sms: Object.keys(this.templates.get('sms')).length,
            push: Object.keys(this.templates.get('push')).length
        });
    }

    /**
     * Enviar notificación
     */
    async sendNotification(type, template, recipient, data, options = {}) {
        try {
            const notification = {
                id: this.generateNotificationId(),
                type,
                template,
                recipient,
                data,
                options,
                status: 'pending',
                attempts: 0,
                createdAt: new Date(),
                tenantId: options.tenantId
            };

            // Agregar a cola si está configurado para usar cola
            if (options.useQueue !== false) {
                this.queue.push(notification);
                this.processQueue();
                return { id: notification.id, status: 'queued' };
            }

            // Enviar inmediatamente
            return await this.deliverNotification(notification);
        } catch (error) {
            logger.error('Failed to send notification', {
                type,
                template,
                recipient,
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Enviar email
     */
    async sendEmail(to, template, data, options = {}) {
        return await this.sendNotification('email', template, to, data, options);
    }

    /**
     * Enviar SMS
     */
    async sendSMS(to, template, data, options = {}) {
        return await this.sendNotification('sms', template, to, data, options);
    }

    /**
     * Enviar push notification
     */
    async sendPushNotification(to, template, data, options = {}) {
        return await this.sendNotification('push', template, to, data, options);
    }

    /**
     * Procesar cola de notificaciones
     */
    async processQueue() {
        if (this.processing || this.queue.length === 0) {
            return;
        }

        this.processing = true;
        logger.info('Processing notification queue', { count: this.queue.length });

        while (this.queue.length > 0) {
            const notification = this.queue.shift();
            try {
                await this.deliverNotification(notification);
                logger.debug('Notification delivered from queue', {
                    id: notification.id,
                    type: notification.type
                });
            } catch (error) {
                logger.error('Failed to deliver queued notification', {
                    id: notification.id,
                    error: error.message
                });

                // Reintentar si no se ha alcanzado el límite
                notification.attempts++;
                if (notification.attempts < 3) {
                    notification.nextRetry = new Date(Date.now() + Math.pow(2, notification.attempts) * 60000);
                    this.queue.push(notification);
                }
            }

            // Pequeña pausa entre notificaciones
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        this.processing = false;
    }

    /**
     * Entregar notificación
     */
    async deliverNotification(notification) {
        try {
            let result;

            switch (notification.type) {
                case 'email':
                    result = await this.deliverEmail(notification);
                    break;
                case 'sms':
                    result = await this.deliverSMS(notification);
                    break;
                case 'push':
                    result = await this.deliverPushNotification(notification);
                    break;
                default:
                    throw new AppError(`Unsupported notification type: ${notification.type}`, 400);
            }

            // Registrar notificación enviada
            await this.logNotification(notification, result);

            // Emitir evento
            this.emit('notification_sent', {
                id: notification.id,
                type: notification.type,
                recipient: notification.recipient,
                result
            });

            return { id: notification.id, status: 'sent', result };
        } catch (error) {
            await this.logNotification(notification, { error: error.message, status: 'failed' });
            throw error;
        }
    }

    /**
     * Entregar email
     */
    async deliverEmail(notification) {
        try {
            const template = this.templates.get('email')[notification.template];
            if (!template) {
                throw new AppError(`Email template not found: ${notification.template}`, 400);
            }

            // Renderizar plantilla
            const subject = this.renderTemplate(template.subject, notification.data);
            const html = this.renderTemplate(template.html, notification.data);
            const text = this.renderTemplate(template.text, notification.data);

            // Simular envío de email
            await new Promise(resolve => setTimeout(resolve, 200 + Math.random() * 300));

            // Simular fallo ocasional
            if (Math.random() < 0.03) { // 3% de fallo
                throw new ExternalServiceError('Email', 'SMTP server error');
            }

            const result = {
                messageId: `email_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                provider: 'smtp',
                subject,
                to: notification.recipient,
                sentAt: new Date()
            };

            logger.info('Email sent successfully', {
                to: notification.recipient,
                subject,
                messageId: result.messageId
            });

            return result;
        } catch (error) {
            logger.error('Failed to deliver email', {
                to: notification.recipient,
                template: notification.template,
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Entregar SMS
     */
    async deliverSMS(notification) {
        try {
            const template = this.templates.get('sms')[notification.template];
            if (!template) {
                throw new AppError(`SMS template not found: ${notification.template}`, 400);
            }

            // Renderizar plantilla
            const text = this.renderTemplate(template.text, notification.data);

            // Simular envío de SMS
            await new Promise(resolve => setTimeout(resolve, 300 + Math.random() * 500));

            // Simular fallo ocasional
            if (Math.random() < 0.05) { // 5% de fallo
                throw new ExternalServiceError('SMS', 'Carrier delivery failed');
            }

            const result = {
                messageId: `sms_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                provider: 'twilio',
                to: notification.recipient,
                text,
                sentAt: new Date()
            };

            logger.info('SMS sent successfully', {
                to: notification.recipient,
                messageId: result.messageId
            });

            return result;
        } catch (error) {
            logger.error('Failed to deliver SMS', {
                to: notification.recipient,
                template: notification.template,
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Entregar push notification
     */
    async deliverPushNotification(notification) {
        try {
            const template = this.templates.get('push')[notification.template];
            if (!template) {
                throw new AppError(`Push template not found: ${notification.template}`, 400);
            }

            // Renderizar plantilla
            const title = this.renderTemplate(template.title, notification.data);
            const body = this.renderTemplate(template.body, notification.data);

            // Simular envío de push notification
            await new Promise(resolve => setTimeout(resolve, 150 + Math.random() * 250));

            // Simular fallo ocasional
            if (Math.random() < 0.02) { // 2% de fallo
                throw new ExternalServiceError('Push', 'FCM delivery failed');
            }

            const result = {
                messageId: `push_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                provider: 'firebase',
                to: notification.recipient,
                title,
                body,
                sentAt: new Date()
            };

            logger.info('Push notification sent successfully', {
                to: notification.recipient,
                title,
                messageId: result.messageId
            });

            return result;
        } catch (error) {
            logger.error('Failed to deliver push notification', {
                to: notification.recipient,
                template: notification.template,
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Renderizar plantilla
     */
    renderTemplate(template, data) {
        if (!template || !data) return template;

        let rendered = template;
        for (const [key, value] of Object.entries(data)) {
            const regex = new RegExp(`{{${key}}}`, 'g');
            rendered = rendered.replace(regex, value || '');
        }

        return rendered;
    }

    /**
     * Registrar notificación en base de datos
     */
    async logNotification(notification, result) {
        try {
            const supabase = createSupabaseClient();
            
            await supabase.from('notification_logs').insert({
                id: notification.id,
                tenant_id: notification.tenantId,
                type: notification.type,
                template: notification.template,
                recipient: notification.recipient,
                status: result.error ? 'failed' : 'sent',
                provider: result.provider || 'unknown',
                external_id: result.messageId,
                attempts: notification.attempts + 1,
                cost_usd: this.calculateNotificationCost(notification.type),
                metadata: {
                    data: notification.data,
                    options: notification.options,
                    result,
                    error: result.error
                }
            });
        } catch (error) {
            logger.error('Failed to log notification', {
                notificationId: notification.id,
                error: error.message
            });
        }
    }

    /**
     * Calcular costo de notificación
     */
    calculateNotificationCost(type) {
        const costs = {
            email: 0.001,  // $0.001 por email
            sms: 0.05,     // $0.05 por SMS
            push: 0.0001   // $0.0001 por push
        };

        return costs[type] || 0;
    }

    /**
     * Generar ID único para notificación
     */
    generateNotificationId() {
        return `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Obtener estadísticas de notificaciones
     */
    async getNotificationStats(tenantId, period = 'month') {
        try {
            const supabase = createSupabaseClient();
            
            let dateFilter;
            const now = new Date();
            
            switch (period) {
                case 'day':
                    dateFilter = now.toISOString().slice(0, 10);
                    break;
                case 'week':
                    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                    dateFilter = weekAgo.toISOString();
                    break;
                case 'month':
                default:
                    dateFilter = now.toISOString().slice(0, 7) + '-01';
                    break;
            }

            const { data, error } = await supabase
                .from('notification_logs')
                .select('*')
                .eq('tenant_id', tenantId)
                .gte('created_at', dateFilter);

            if (error) throw error;

            const stats = {
                total_sent: data.filter(n => n.status === 'sent').length,
                total_failed: data.filter(n => n.status === 'failed').length,
                total_cost: data.reduce((sum, n) => sum + (n.cost_usd || 0), 0),
                by_type: {},
                by_template: {},
                success_rate: 0
            };

            // Calcular tasa de éxito
            const total = stats.total_sent + stats.total_failed;
            if (total > 0) {
                stats.success_rate = (stats.total_sent / total) * 100;
            }

            // Agrupar por tipo y plantilla
            data.forEach(notification => {
                // Por tipo
                if (!stats.by_type[notification.type]) {
                    stats.by_type[notification.type] = { sent: 0, failed: 0, cost: 0 };
                }
                if (notification.status === 'sent') {
                    stats.by_type[notification.type].sent++;
                } else {
                    stats.by_type[notification.type].failed++;
                }
                stats.by_type[notification.type].cost += notification.cost_usd || 0;

                // Por plantilla
                if (!stats.by_template[notification.template]) {
                    stats.by_template[notification.template] = { sent: 0, failed: 0, cost: 0 };
                }
                if (notification.status === 'sent') {
                    stats.by_template[notification.template].sent++;
                } else {
                    stats.by_template[notification.template].failed++;
                }
                stats.by_template[notification.template].cost += notification.cost_usd || 0;
            });

            return stats;
        } catch (error) {
            logger.error('Failed to get notification stats', {
                tenantId,
                period,
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Obtener plantillas disponibles
     */
    getAvailableTemplates() {
        const templates = {};
        for (const [type, typeTemplates] of this.templates) {
            templates[type] = Object.keys(typeTemplates);
        }
        return templates;
    }

    /**
     * Validar configuración de notificación
     */
    validateNotificationConfig(type, template, recipient, data) {
        const errors = [];

        // Verificar tipo
        if (!this.templates.has(type)) {
            errors.push(`Invalid notification type: ${type}`);
        }

        // Verificar plantilla
        if (!this.templates.get(type)?.[template]) {
            errors.push(`Template not found: ${template}`);
        }

        // Verificar destinatario
        if (!recipient) {
            errors.push('Recipient is required');
        } else {
            if (type === 'email' && !this.isValidEmail(recipient)) {
                errors.push('Invalid email address');
            }
            if (type === 'sms' && !this.isValidPhone(recipient)) {
                errors.push('Invalid phone number');
            }
        }

        return errors;
    }

    /**
     * Validar email
     */
    isValidEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }

    /**
     * Validar teléfono
     */
    isValidPhone(phone) {
        const phoneRegex = /^\+?[1-9]\d{1,14}$/;
        return phoneRegex.test(phone.replace(/\s/g, ''));
    }

    /**
     * Obtener estado de proveedores
     */
    getProvidersStatus() {
        const status = {};
        for (const [type, providers] of this.providers) {
            status[type] = {};
            for (const [name, provider] of Object.entries(providers)) {
                status[type][name] = {
                    name: provider.name,
                    available: provider.available,
                    lastCheck: new Date()
                };
            }
        }
        return status;
    }

    /**
     * Limpiar cola de notificaciones antiguas
     */
    cleanupOldQueue() {
        const now = new Date();
        const oldThreshold = 24 * 60 * 60 * 1000; // 24 horas

        this.queue = this.queue.filter(notification => {
            const age = now - notification.createdAt;
            return age < oldThreshold;
        });
    }
}

// Crear instancia singleton
const notificationService = new NotificationService();

// Procesar cola periódicamente
setInterval(() => {
    notificationService.processQueue().catch(error => {
        logger.error('Failed to process notification queue', {
            error: error.message
        });
    });
}, 30000); // Cada 30 segundos

// Limpiar cola antigua periódicamente
setInterval(() => {
    notificationService.cleanupOldQueue();
}, 60 * 60 * 1000); // Cada hora

module.exports = {
    NotificationService,
    notificationService
};