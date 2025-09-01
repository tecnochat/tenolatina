/**
 * Servicio de WhatsApp
 * Maneja la integración con WhatsApp Business API y Baileys
 */

const { createSupabaseClient } = require('../config/supabase');
const { logger } = require('../utils/logger');
const { AppError, ExternalServiceError } = require('../utils/errors');
const EventEmitter = require('events');

class WhatsAppService extends EventEmitter {
    constructor() {
        super();
        this.connections = new Map(); // tenant_id -> connection
        this.messageQueue = new Map(); // tenant_id -> message queue
        this.rateLimits = new Map(); // tenant_id -> rate limit info
    }

    /**
     * Inicializar conexión de WhatsApp para un tenant
     */
    async initializeConnection(tenantId, chatbotId, config) {
        try {
            logger.info('Initializing WhatsApp connection', { tenantId, chatbotId });

            // Verificar si ya existe una conexión
            if (this.connections.has(tenantId)) {
                logger.warn('WhatsApp connection already exists', { tenantId });
                return this.connections.get(tenantId);
            }

            // Crear nueva conexión (simulada por ahora)
            const connection = {
                tenantId,
                chatbotId,
                phoneNumber: config.phone_number,
                status: 'connecting',
                lastActivity: new Date(),
                messagesSent: 0,
                messagesReceived: 0,
                config
            };

            this.connections.set(tenantId, connection);
            this.messageQueue.set(tenantId, []);
            this.rateLimits.set(tenantId, {
                messagesPerMinute: 60,
                currentMinute: new Date().getMinutes(),
                messageCount: 0
            });

            // Simular conexión exitosa después de un delay
            setTimeout(() => {
                connection.status = 'connected';
                this.emit('connection_established', { tenantId, chatbotId });
                logger.info('WhatsApp connection established', { tenantId, chatbotId });
            }, 2000);

            return connection;
        } catch (error) {
            logger.error('Failed to initialize WhatsApp connection', {
                tenantId,
                chatbotId,
                error: error.message
            });
            throw new ExternalServiceError('WhatsApp', 'Connection initialization failed', error);
        }
    }

    /**
     * Desconectar WhatsApp para un tenant
     */
    async disconnectConnection(tenantId) {
        try {
            const connection = this.connections.get(tenantId);
            if (!connection) {
                logger.warn('No WhatsApp connection found to disconnect', { tenantId });
                return;
            }

            connection.status = 'disconnecting';
            
            // Procesar mensajes pendientes
            await this.processQueuedMessages(tenantId);

            // Limpiar recursos
            this.connections.delete(tenantId);
            this.messageQueue.delete(tenantId);
            this.rateLimits.delete(tenantId);

            this.emit('connection_closed', { tenantId });
            logger.info('WhatsApp connection disconnected', { tenantId });
        } catch (error) {
            logger.error('Failed to disconnect WhatsApp connection', {
                tenantId,
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Enviar mensaje de WhatsApp
     */
    async sendMessage(tenantId, to, message, options = {}) {
        try {
            const connection = this.connections.get(tenantId);
            if (!connection || connection.status !== 'connected') {
                throw new AppError('WhatsApp connection not available', 503);
            }

            // Verificar rate limit
            if (!this.checkRateLimit(tenantId)) {
                throw new AppError('Rate limit exceeded', 429);
            }

            // Preparar mensaje
            const messageData = {
                id: this.generateMessageId(),
                tenantId,
                to: this.formatPhoneNumber(to),
                message,
                type: options.type || 'text',
                timestamp: new Date(),
                status: 'pending',
                ...options
            };

            // Agregar a cola si es necesario
            if (this.shouldQueueMessage(tenantId)) {
                this.messageQueue.get(tenantId).push(messageData);
                logger.info('Message queued', { tenantId, messageId: messageData.id });
                return { id: messageData.id, status: 'queued' };
            }

            // Enviar mensaje inmediatamente
            const result = await this.deliverMessage(messageData);
            
            // Actualizar estadísticas
            connection.messagesSent++;
            connection.lastActivity = new Date();

            // Guardar en base de datos
            await this.saveMessage(messageData, result);

            this.emit('message_sent', { tenantId, messageId: messageData.id, result });
            
            return result;
        } catch (error) {
            logger.error('Failed to send WhatsApp message', {
                tenantId,
                to,
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Procesar mensaje recibido
     */
    async processIncomingMessage(tenantId, messageData) {
        try {
            const connection = this.connections.get(tenantId);
            if (!connection) {
                logger.warn('Received message for inactive connection', { tenantId });
                return;
            }

            // Formatear mensaje
            const formattedMessage = {
                id: messageData.id || this.generateMessageId(),
                tenantId,
                from: this.formatPhoneNumber(messageData.from),
                message: messageData.body || messageData.text,
                type: messageData.type || 'text',
                timestamp: new Date(messageData.timestamp * 1000),
                raw: messageData
            };

            // Actualizar estadísticas
            connection.messagesReceived++;
            connection.lastActivity = new Date();

            // Guardar mensaje
            await this.saveIncomingMessage(formattedMessage);

            // Emitir evento para procesamiento
            this.emit('message_received', formattedMessage);

            logger.info('Processed incoming WhatsApp message', {
                tenantId,
                messageId: formattedMessage.id,
                from: formattedMessage.from
            });

            return formattedMessage;
        } catch (error) {
            logger.error('Failed to process incoming message', {
                tenantId,
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Obtener estado de conexión
     */
    getConnectionStatus(tenantId) {
        const connection = this.connections.get(tenantId);
        if (!connection) {
            return { status: 'disconnected' };
        }

        return {
            status: connection.status,
            phoneNumber: connection.phoneNumber,
            lastActivity: connection.lastActivity,
            messagesSent: connection.messagesSent,
            messagesReceived: connection.messagesReceived,
            queuedMessages: this.messageQueue.get(tenantId)?.length || 0
        };
    }

    /**
     * Obtener estadísticas de todas las conexiones
     */
    getAllConnectionsStatus() {
        const status = {};
        for (const [tenantId, connection] of this.connections) {
            status[tenantId] = this.getConnectionStatus(tenantId);
        }
        return status;
    }

    /**
     * Verificar rate limit
     */
    checkRateLimit(tenantId) {
        const rateLimit = this.rateLimits.get(tenantId);
        if (!rateLimit) return true;

        const currentMinute = new Date().getMinutes();
        
        // Reset contador si cambió el minuto
        if (currentMinute !== rateLimit.currentMinute) {
            rateLimit.currentMinute = currentMinute;
            rateLimit.messageCount = 0;
        }

        // Verificar límite
        if (rateLimit.messageCount >= rateLimit.messagesPerMinute) {
            return false;
        }

        rateLimit.messageCount++;
        return true;
    }

    /**
     * Determinar si el mensaje debe ir a cola
     */
    shouldQueueMessage(tenantId) {
        const connection = this.connections.get(tenantId);
        if (!connection) return true;

        // Encolar si hay muchos mensajes pendientes
        const queueLength = this.messageQueue.get(tenantId)?.length || 0;
        return queueLength > 10 || connection.status !== 'connected';
    }

    /**
     * Procesar mensajes en cola
     */
    async processQueuedMessages(tenantId) {
        const queue = this.messageQueue.get(tenantId);
        if (!queue || queue.length === 0) return;

        logger.info('Processing queued messages', { tenantId, count: queue.length });

        while (queue.length > 0 && this.checkRateLimit(tenantId)) {
            const messageData = queue.shift();
            try {
                await this.deliverMessage(messageData);
                logger.debug('Queued message delivered', { 
                    tenantId, 
                    messageId: messageData.id 
                });
            } catch (error) {
                logger.error('Failed to deliver queued message', {
                    tenantId,
                    messageId: messageData.id,
                    error: error.message
                });
                // Reencolar mensaje con límite de reintentos
                if ((messageData.retries || 0) < 3) {
                    messageData.retries = (messageData.retries || 0) + 1;
                    queue.push(messageData);
                }
            }
        }
    }

    /**
     * Entregar mensaje (simulado)
     */
    async deliverMessage(messageData) {
        // Simular delay de envío
        await new Promise(resolve => setTimeout(resolve, 100 + Math.random() * 200));

        // Simular fallo ocasional
        if (Math.random() < 0.05) { // 5% de fallo
            throw new ExternalServiceError('WhatsApp', 'Message delivery failed');
        }

        const result = {
            id: messageData.id,
            status: 'sent',
            timestamp: new Date(),
            whatsappId: `wamid.${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
        };

        // Simular confirmación de entrega después de un delay
        setTimeout(() => {
            this.emit('message_delivered', {
                tenantId: messageData.tenantId,
                messageId: messageData.id,
                whatsappId: result.whatsappId
            });
        }, 1000 + Math.random() * 2000);

        return result;
    }

    /**
     * Guardar mensaje enviado en base de datos
     */
    async saveMessage(messageData, result) {
        try {
            const supabase = createSupabaseClient();
            
            await supabase.from('messages').insert({
                id: messageData.id,
                tenant_id: messageData.tenantId,
                chatbot_id: messageData.chatbotId,
                conversation_id: messageData.conversationId,
                direction: 'outbound',
                from_number: messageData.from || 'system',
                to_number: messageData.to,
                message_type: messageData.type,
                content: messageData.message,
                media_data: messageData.media || null,
                status: result.status,
                whatsapp_message_id: result.whatsappId,
                metadata: {
                    options: messageData.options || {},
                    result
                }
            });
        } catch (error) {
            logger.error('Failed to save message to database', {
                messageId: messageData.id,
                error: error.message
            });
        }
    }

    /**
     * Guardar mensaje recibido en base de datos
     */
    async saveIncomingMessage(messageData) {
        try {
            const supabase = createSupabaseClient();
            
            await supabase.from('messages').insert({
                id: messageData.id,
                tenant_id: messageData.tenantId,
                direction: 'inbound',
                from_number: messageData.from,
                to_number: messageData.to || 'system',
                message_type: messageData.type,
                content: messageData.message,
                whatsapp_message_id: messageData.raw?.id,
                metadata: {
                    raw: messageData.raw
                }
            });
        } catch (error) {
            logger.error('Failed to save incoming message to database', {
                messageId: messageData.id,
                error: error.message
            });
        }
    }

    /**
     * Generar ID único para mensaje
     */
    generateMessageId() {
        return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Formatear número de teléfono
     */
    formatPhoneNumber(phone) {
        if (!phone) return null;
        
        // Remover caracteres no numéricos
        const cleaned = phone.replace(/\D/g, '');
        
        // Agregar código de país si no existe
        if (cleaned.length === 10) {
            return `1${cleaned}`; // Asumir US/Canada
        }
        
        return cleaned;
    }

    /**
     * Validar webhook de WhatsApp
     */
    validateWebhook(signature, body, secret) {
        const crypto = require('crypto');
        const expectedSignature = crypto
            .createHmac('sha256', secret)
            .update(body)
            .digest('hex');
        
        return signature === `sha256=${expectedSignature}`;
    }

    /**
     * Procesar webhook de WhatsApp
     */
    async processWebhook(tenantId, payload) {
        try {
            if (payload.entry && payload.entry.length > 0) {
                for (const entry of payload.entry) {
                    if (entry.changes && entry.changes.length > 0) {
                        for (const change of entry.changes) {
                            if (change.field === 'messages') {
                                await this.processMessageChange(tenantId, change.value);
                            } else if (change.field === 'message_template_status_update') {
                                await this.processTemplateStatusUpdate(tenantId, change.value);
                            }
                        }
                    }
                }
            }
        } catch (error) {
            logger.error('Failed to process WhatsApp webhook', {
                tenantId,
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Procesar cambio de mensaje
     */
    async processMessageChange(tenantId, value) {
        if (value.messages && value.messages.length > 0) {
            for (const message of value.messages) {
                await this.processIncomingMessage(tenantId, {
                    id: message.id,
                    from: message.from,
                    timestamp: message.timestamp,
                    type: message.type,
                    body: message.text?.body,
                    ...message
                });
            }
        }

        if (value.statuses && value.statuses.length > 0) {
            for (const status of value.statuses) {
                await this.processMessageStatus(tenantId, status);
            }
        }
    }

    /**
     * Procesar estado de mensaje
     */
    async processMessageStatus(tenantId, status) {
        try {
            const supabase = createSupabaseClient();
            
            await supabase
                .from('messages')
                .update({
                    status: status.status,
                    updated_at: new Date().toISOString()
                })
                .eq('whatsapp_message_id', status.id)
                .eq('tenant_id', tenantId);

            this.emit('message_status_updated', {
                tenantId,
                whatsappId: status.id,
                status: status.status
            });
        } catch (error) {
            logger.error('Failed to process message status', {
                tenantId,
                statusId: status.id,
                error: error.message
            });
        }
    }

    /**
     * Procesar actualización de template
     */
    async processTemplateStatusUpdate(tenantId, value) {
        logger.info('Template status update received', {
            tenantId,
            templateName: value.message_template_name,
            status: value.event
        });

        this.emit('template_status_updated', {
            tenantId,
            templateName: value.message_template_name,
            status: value.event,
            reason: value.reason
        });
    }

    /**
     * Limpiar conexiones inactivas
     */
    cleanupInactiveConnections() {
        const now = new Date();
        const inactiveThreshold = 30 * 60 * 1000; // 30 minutos

        for (const [tenantId, connection] of this.connections) {
            if (now - connection.lastActivity > inactiveThreshold) {
                logger.info('Cleaning up inactive WhatsApp connection', { tenantId });
                this.disconnectConnection(tenantId).catch(error => {
                    logger.error('Failed to cleanup inactive connection', {
                        tenantId,
                        error: error.message
                    });
                });
            }
        }
    }
}

// Crear instancia singleton
const whatsappService = new WhatsAppService();

// Procesar mensajes en cola periódicamente
setInterval(() => {
    for (const tenantId of whatsappService.connections.keys()) {
        whatsappService.processQueuedMessages(tenantId).catch(error => {
            logger.error('Failed to process queued messages', {
                tenantId,
                error: error.message
            });
        });
    }
}, 5000); // Cada 5 segundos

// Limpiar conexiones inactivas periódicamente
setInterval(() => {
    whatsappService.cleanupInactiveConnections();
}, 10 * 60 * 1000); // Cada 10 minutos

module.exports = {
    WhatsAppService,
    whatsappService
};