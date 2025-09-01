/**
 * Servicio de IA
 * Maneja la integración con OpenAI y otros proveedores de IA
 */

const { createSupabaseClient } = require('../config/supabase');
const { logger } = require('../utils/logger');
const { AppError, ExternalServiceError, PlanLimitError } = require('../utils/errors');
const EventEmitter = require('events');

class AIService extends EventEmitter {
    constructor() {
        super();
        this.providers = new Map();
        this.requestCounts = new Map(); // tenant_id -> count
        this.rateLimits = new Map(); // tenant_id -> rate limit info
        this.initializeProviders();
    }

    /**
     * Inicializar proveedores de IA
     */
    initializeProviders() {
        // OpenAI Provider (simulado)
        this.providers.set('openai', {
            name: 'OpenAI',
            models: ['gpt-3.5-turbo', 'gpt-4', 'gpt-4-turbo'],
            maxTokens: {
                'gpt-3.5-turbo': 4096,
                'gpt-4': 8192,
                'gpt-4-turbo': 128000
            },
            costPerToken: {
                'gpt-3.5-turbo': { input: 0.0015, output: 0.002 },
                'gpt-4': { input: 0.03, output: 0.06 },
                'gpt-4-turbo': { input: 0.01, output: 0.03 }
            },
            available: true
        });

        // Claude Provider (simulado)
        this.providers.set('anthropic', {
            name: 'Anthropic Claude',
            models: ['claude-3-haiku', 'claude-3-sonnet', 'claude-3-opus'],
            maxTokens: {
                'claude-3-haiku': 200000,
                'claude-3-sonnet': 200000,
                'claude-3-opus': 200000
            },
            costPerToken: {
                'claude-3-haiku': { input: 0.00025, output: 0.00125 },
                'claude-3-sonnet': { input: 0.003, output: 0.015 },
                'claude-3-opus': { input: 0.015, output: 0.075 }
            },
            available: true
        });

        logger.info('AI providers initialized', {
            providers: Array.from(this.providers.keys())
        });
    }

    /**
     * Obtener configuración de IA para un chatbot
     */
    async getAIConfiguration(tenantId, chatbotId) {
        try {
            const supabase = createSupabaseClient();
            
            const { data, error } = await supabase
                .from('ai_configurations')
                .select('*')
                .eq('tenant_id', tenantId)
                .eq('chatbot_id', chatbotId)
                .single();

            if (error && error.code !== 'PGRST116') {
                throw error;
            }

            // Configuración por defecto si no existe
            if (!data) {
                return {
                    provider: 'openai',
                    model: 'gpt-3.5-turbo',
                    temperature: 0.7,
                    max_tokens: 1000,
                    system_prompt: 'Eres un asistente virtual útil y amigable.',
                    context_window: 10,
                    response_format: 'text',
                    safety_settings: {
                        filter_harmful: true,
                        filter_personal_info: true,
                        max_response_length: 2000
                    }
                };
            }

            return data;
        } catch (error) {
            logger.error('Failed to get AI configuration', {
                tenantId,
                chatbotId,
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Generar respuesta de IA
     */
    async generateResponse(tenantId, chatbotId, conversationId, message, context = []) {
        try {
            // Verificar límites del plan
            await this.checkPlanLimits(tenantId);

            // Obtener configuración
            const config = await this.getAIConfiguration(tenantId, chatbotId);
            
            // Verificar disponibilidad del proveedor
            const provider = this.providers.get(config.provider);
            if (!provider || !provider.available) {
                throw new ExternalServiceError(config.provider, 'Provider not available');
            }

            // Preparar contexto de conversación
            const conversationContext = await this.buildConversationContext(
                tenantId, 
                conversationId, 
                context, 
                config.context_window
            );

            // Preparar prompt
            const prompt = this.buildPrompt(config, message, conversationContext);

            // Generar respuesta
            const startTime = Date.now();
            const response = await this.callAIProvider(config, prompt);
            const responseTime = Date.now() - startTime;

            // Procesar y validar respuesta
            const processedResponse = await this.processResponse(response, config);

            // Registrar solicitud
            await this.logAIRequest(tenantId, chatbotId, conversationId, {
                provider: config.provider,
                model: config.model,
                prompt,
                response: processedResponse,
                tokens_used: response.usage,
                response_time: responseTime,
                cost: this.calculateCost(config.provider, config.model, response.usage)
            });

            // Actualizar contadores
            this.updateRequestCount(tenantId);

            // Emitir evento
            this.emit('response_generated', {
                tenantId,
                chatbotId,
                conversationId,
                responseTime,
                tokensUsed: response.usage?.total_tokens || 0
            });

            return processedResponse;
        } catch (error) {
            logger.error('Failed to generate AI response', {
                tenantId,
                chatbotId,
                conversationId,
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Verificar límites del plan
     */
    async checkPlanLimits(tenantId) {
        try {
            const supabase = createSupabaseClient();
            
            // Obtener información del tenant
            const { data: tenant, error } = await supabase
                .from('tenant_profiles')
                .select('subscription_plan, subscription_status')
                .eq('id', tenantId)
                .single();

            if (error) throw error;

            if (tenant.subscription_status !== 'active') {
                throw new PlanLimitError('Subscription not active');
            }

            // Obtener uso actual del mes
            const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
            const { data: usage, error: usageError } = await supabase
                .from('ai_requests')
                .select('id')
                .eq('tenant_id', tenantId)
                .gte('created_at', `${currentMonth}-01`)
                .lt('created_at', `${currentMonth}-32`);

            if (usageError) throw usageError;

            const currentUsage = usage?.length || 0;
            const limits = this.getPlanLimits(tenant.subscription_plan);

            if (currentUsage >= limits.monthly_requests) {
                throw new PlanLimitError(`Monthly AI request limit exceeded (${limits.monthly_requests})`);
            }

            // Verificar rate limit
            if (!this.checkRateLimit(tenantId, limits.requests_per_minute)) {
                throw new PlanLimitError('Rate limit exceeded');
            }

        } catch (error) {
            if (error instanceof PlanLimitError) {
                throw error;
            }
            logger.error('Failed to check plan limits', {
                tenantId,
                error: error.message
            });
            throw new AppError('Failed to verify plan limits', 500);
        }
    }

    /**
     * Obtener límites del plan
     */
    getPlanLimits(plan) {
        const limits = {
            free: {
                monthly_requests: 100,
                requests_per_minute: 5,
                max_tokens: 1000,
                models: ['gpt-3.5-turbo']
            },
            pro: {
                monthly_requests: 5000,
                requests_per_minute: 30,
                max_tokens: 4000,
                models: ['gpt-3.5-turbo', 'gpt-4']
            },
            enterprise: {
                monthly_requests: 50000,
                requests_per_minute: 100,
                max_tokens: 8000,
                models: ['gpt-3.5-turbo', 'gpt-4', 'gpt-4-turbo', 'claude-3-sonnet']
            }
        };

        return limits[plan] || limits.free;
    }

    /**
     * Verificar rate limit
     */
    checkRateLimit(tenantId, limit) {
        const now = Date.now();
        const windowStart = Math.floor(now / 60000) * 60000; // Ventana de 1 minuto

        if (!this.rateLimits.has(tenantId)) {
            this.rateLimits.set(tenantId, {
                windowStart,
                count: 0
            });
        }

        const rateLimit = this.rateLimits.get(tenantId);

        // Reset si cambió la ventana
        if (windowStart > rateLimit.windowStart) {
            rateLimit.windowStart = windowStart;
            rateLimit.count = 0;
        }

        // Verificar límite
        if (rateLimit.count >= limit) {
            return false;
        }

        rateLimit.count++;
        return true;
    }

    /**
     * Construir contexto de conversación
     */
    async buildConversationContext(tenantId, conversationId, additionalContext, contextWindow) {
        try {
            const supabase = createSupabaseClient();
            
            // Obtener mensajes recientes de la conversación
            const { data: messages, error } = await supabase
                .from('messages')
                .select('direction, content, created_at')
                .eq('tenant_id', tenantId)
                .eq('conversation_id', conversationId)
                .order('created_at', { ascending: false })
                .limit(contextWindow);

            if (error) {
                logger.warn('Failed to get conversation context', {
                    tenantId,
                    conversationId,
                    error: error.message
                });
                return additionalContext;
            }

            // Formatear mensajes para el contexto
            const contextMessages = messages
                .reverse()
                .map(msg => ({
                    role: msg.direction === 'inbound' ? 'user' : 'assistant',
                    content: msg.content
                }));

            return [...additionalContext, ...contextMessages];
        } catch (error) {
            logger.error('Failed to build conversation context', {
                tenantId,
                conversationId,
                error: error.message
            });
            return additionalContext;
        }
    }

    /**
     * Construir prompt para IA
     */
    buildPrompt(config, message, context) {
        const messages = [
            {
                role: 'system',
                content: config.system_prompt || 'Eres un asistente virtual útil y amigable.'
            },
            ...context,
            {
                role: 'user',
                content: message
            }
        ];

        return messages;
    }

    /**
     * Llamar al proveedor de IA (simulado)
     */
    async callAIProvider(config, prompt) {
        try {
            // Simular delay de API
            await new Promise(resolve => setTimeout(resolve, 500 + Math.random() * 1500));

            // Simular fallo ocasional
            if (Math.random() < 0.02) { // 2% de fallo
                throw new ExternalServiceError(config.provider, 'API request failed');
            }

            // Generar respuesta simulada
            const responses = [
                'Hola, ¿en qué puedo ayudarte hoy?',
                'Entiendo tu consulta. Déjame ayudarte con eso.',
                'Gracias por contactarnos. Te ayudo con gusto.',
                'Por supuesto, puedo asistirte con esa información.',
                'Perfecto, vamos a resolver tu consulta paso a paso.',
                'Me alegra poder ayudarte. ¿Qué necesitas saber?',
                'Claro, te explico todo lo que necesitas saber.',
                'Excelente pregunta. Te doy todos los detalles.'
            ];

            const randomResponse = responses[Math.floor(Math.random() * responses.length)];
            
            // Simular uso de tokens
            const inputTokens = JSON.stringify(prompt).length / 4; // Aproximación
            const outputTokens = randomResponse.length / 4;

            return {
                content: randomResponse,
                usage: {
                    prompt_tokens: Math.ceil(inputTokens),
                    completion_tokens: Math.ceil(outputTokens),
                    total_tokens: Math.ceil(inputTokens + outputTokens)
                },
                model: config.model,
                provider: config.provider
            };
        } catch (error) {
            if (error instanceof ExternalServiceError) {
                throw error;
            }
            throw new ExternalServiceError(config.provider, 'Failed to generate response', error);
        }
    }

    /**
     * Procesar respuesta de IA
     */
    async processResponse(response, config) {
        try {
            let content = response.content;

            // Aplicar filtros de seguridad
            if (config.safety_settings?.filter_harmful) {
                content = this.filterHarmfulContent(content);
            }

            if (config.safety_settings?.filter_personal_info) {
                content = this.filterPersonalInfo(content);
            }

            // Limitar longitud de respuesta
            const maxLength = config.safety_settings?.max_response_length || 2000;
            if (content.length > maxLength) {
                content = content.substring(0, maxLength - 3) + '...';
            }

            // Formatear según el tipo de respuesta
            if (config.response_format === 'markdown') {
                content = this.formatAsMarkdown(content);
            }

            return {
                content,
                usage: response.usage,
                model: response.model,
                provider: response.provider,
                processed: true
            };
        } catch (error) {
            logger.error('Failed to process AI response', {
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Filtrar contenido dañino (simulado)
     */
    filterHarmfulContent(content) {
        // Lista simple de palabras/frases a filtrar
        const harmfulPatterns = [
            /información personal/gi,
            /datos bancarios/gi,
            /contraseña/gi,
            /password/gi
        ];

        let filtered = content;
        harmfulPatterns.forEach(pattern => {
            filtered = filtered.replace(pattern, '[CONTENIDO FILTRADO]');
        });

        return filtered;
    }

    /**
     * Filtrar información personal (simulado)
     */
    filterPersonalInfo(content) {
        // Patrones para detectar información personal
        const patterns = [
            /\b\d{3}-\d{2}-\d{4}\b/g, // SSN
            /\b\d{16}\b/g, // Números de tarjeta
            /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g // Emails
        ];

        let filtered = content;
        patterns.forEach(pattern => {
            filtered = filtered.replace(pattern, '[INFORMACIÓN PERSONAL FILTRADA]');
        });

        return filtered;
    }

    /**
     * Formatear como Markdown
     */
    formatAsMarkdown(content) {
        // Conversiones básicas a Markdown
        return content
            .replace(/\*\*(.*?)\*\*/g, '**$1**') // Bold
            .replace(/\*(.*?)\*/g, '*$1*') // Italic
            .replace(/```([\s\S]*?)```/g, '```$1```'); // Code blocks
    }

    /**
     * Calcular costo de la solicitud
     */
    calculateCost(provider, model, usage) {
        const providerData = this.providers.get(provider);
        if (!providerData || !usage) return 0;

        const costs = providerData.costPerToken[model];
        if (!costs) return 0;

        const inputCost = (usage.prompt_tokens || 0) * costs.input / 1000;
        const outputCost = (usage.completion_tokens || 0) * costs.output / 1000;

        return inputCost + outputCost;
    }

    /**
     * Registrar solicitud de IA
     */
    async logAIRequest(tenantId, chatbotId, conversationId, requestData) {
        try {
            const supabase = createSupabaseClient();
            
            await supabase.from('ai_requests').insert({
                tenant_id: tenantId,
                chatbot_id: chatbotId,
                conversation_id: conversationId,
                provider: requestData.provider,
                model: requestData.model,
                prompt_tokens: requestData.tokens_used?.prompt_tokens || 0,
                completion_tokens: requestData.tokens_used?.completion_tokens || 0,
                total_tokens: requestData.tokens_used?.total_tokens || 0,
                response_time_ms: requestData.response_time,
                cost_usd: requestData.cost,
                status: 'completed',
                metadata: {
                    prompt: requestData.prompt,
                    response: requestData.response
                }
            });
        } catch (error) {
            logger.error('Failed to log AI request', {
                tenantId,
                chatbotId,
                error: error.message
            });
        }
    }

    /**
     * Actualizar contador de solicitudes
     */
    updateRequestCount(tenantId) {
        const current = this.requestCounts.get(tenantId) || 0;
        this.requestCounts.set(tenantId, current + 1);
    }

    /**
     * Obtener estadísticas de uso
     */
    async getUsageStats(tenantId, period = 'month') {
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
                .from('ai_requests')
                .select('*')
                .eq('tenant_id', tenantId)
                .gte('created_at', dateFilter);

            if (error) throw error;

            const stats = {
                total_requests: data.length,
                total_tokens: data.reduce((sum, req) => sum + (req.total_tokens || 0), 0),
                total_cost: data.reduce((sum, req) => sum + (req.cost_usd || 0), 0),
                avg_response_time: data.length > 0 
                    ? data.reduce((sum, req) => sum + (req.response_time_ms || 0), 0) / data.length 
                    : 0,
                providers: {},
                models: {}
            };

            // Agrupar por proveedor y modelo
            data.forEach(req => {
                if (!stats.providers[req.provider]) {
                    stats.providers[req.provider] = { requests: 0, tokens: 0, cost: 0 };
                }
                if (!stats.models[req.model]) {
                    stats.models[req.model] = { requests: 0, tokens: 0, cost: 0 };
                }

                stats.providers[req.provider].requests++;
                stats.providers[req.provider].tokens += req.total_tokens || 0;
                stats.providers[req.provider].cost += req.cost_usd || 0;

                stats.models[req.model].requests++;
                stats.models[req.model].tokens += req.total_tokens || 0;
                stats.models[req.model].cost += req.cost_usd || 0;
            });

            return stats;
        } catch (error) {
            logger.error('Failed to get usage stats', {
                tenantId,
                period,
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Obtener modelos disponibles para un plan
     */
    getAvailableModels(plan) {
        const limits = this.getPlanLimits(plan);
        const availableModels = [];

        for (const [providerId, provider] of this.providers) {
            if (!provider.available) continue;

            for (const model of provider.models) {
                if (limits.models.includes(model)) {
                    availableModels.push({
                        provider: providerId,
                        model,
                        name: `${provider.name} - ${model}`,
                        maxTokens: provider.maxTokens[model],
                        cost: provider.costPerToken[model]
                    });
                }
            }
        }

        return availableModels;
    }

    /**
     * Validar configuración de IA
     */
    validateConfiguration(config, plan) {
        const limits = this.getPlanLimits(plan);
        const errors = [];

        // Verificar proveedor
        if (!this.providers.has(config.provider)) {
            errors.push('Invalid AI provider');
        }

        // Verificar modelo
        if (!limits.models.includes(config.model)) {
            errors.push(`Model ${config.model} not available in ${plan} plan`);
        }

        // Verificar tokens
        if (config.max_tokens > limits.max_tokens) {
            errors.push(`Max tokens exceeds plan limit (${limits.max_tokens})`);
        }

        // Verificar temperatura
        if (config.temperature < 0 || config.temperature > 2) {
            errors.push('Temperature must be between 0 and 2');
        }

        return errors;
    }

    /**
     * Obtener estado de los proveedores
     */
    getProvidersStatus() {
        const status = {};
        for (const [id, provider] of this.providers) {
            status[id] = {
                name: provider.name,
                available: provider.available,
                models: provider.models.length,
                lastCheck: new Date()
            };
        }
        return status;
    }

    /**
     * Limpiar contadores antiguos
     */
    cleanupOldCounters() {
        const now = Date.now();
        const cleanupThreshold = 60 * 60 * 1000; // 1 hora

        for (const [tenantId, rateLimit] of this.rateLimits) {
            if (now - rateLimit.windowStart > cleanupThreshold) {
                this.rateLimits.delete(tenantId);
            }
        }
    }
}

// Crear instancia singleton
const aiService = new AIService();

// Limpiar contadores antiguos periódicamente
setInterval(() => {
    aiService.cleanupOldCounters();
}, 15 * 60 * 1000); // Cada 15 minutos

module.exports = {
    AIService,
    aiService
};