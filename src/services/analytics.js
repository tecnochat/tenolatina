/**
 * Servicio de Analytics
 * Maneja la recolección, procesamiento y generación de métricas y reportes
 */

const { createSupabaseClient } = require('../config/supabase');
const { logger } = require('../utils/logger');
const { AppError } = require('../utils/errors');
const EventEmitter = require('events');

class AnalyticsService extends EventEmitter {
    constructor() {
        super();
        this.eventBuffer = new Map(); // tenant_id -> events array
        this.metricsCache = new Map(); // cache key -> cached data
        this.processing = false;
        this.initializeMetrics();
    }

    /**
     * Inicializar métricas base
     */
    initializeMetrics() {
        this.metrics = {
            // Métricas de conversaciones
            conversations: {
                total: 'Total de conversaciones',
                active: 'Conversaciones activas',
                completed: 'Conversaciones completadas',
                abandoned: 'Conversaciones abandonadas',
                avg_duration: 'Duración promedio',
                avg_messages: 'Mensajes promedio por conversación'
            },
            // Métricas de mensajes
            messages: {
                total: 'Total de mensajes',
                inbound: 'Mensajes recibidos',
                outbound: 'Mensajes enviados',
                avg_response_time: 'Tiempo de respuesta promedio',
                success_rate: 'Tasa de entrega exitosa'
            },
            // Métricas de usuarios
            users: {
                total: 'Total de usuarios únicos',
                new: 'Usuarios nuevos',
                returning: 'Usuarios recurrentes',
                engagement_rate: 'Tasa de engagement'
            },
            // Métricas de IA
            ai: {
                requests: 'Solicitudes de IA',
                tokens_used: 'Tokens utilizados',
                avg_response_time: 'Tiempo de respuesta IA',
                cost: 'Costo total de IA',
                success_rate: 'Tasa de éxito IA'
            },
            // Métricas de flujos
            flows: {
                executions: 'Ejecuciones de flujos',
                completions: 'Flujos completados',
                success_rate: 'Tasa de éxito de flujos',
                avg_completion_time: 'Tiempo promedio de completación'
            }
        };

        logger.info('Analytics metrics initialized', {
            categories: Object.keys(this.metrics).length,
            total_metrics: Object.values(this.metrics).reduce((sum, cat) => sum + Object.keys(cat).length, 0)
        });
    }

    /**
     * Registrar evento de analytics
     */
    async trackEvent(tenantId, event, properties = {}) {
        try {
            const eventData = {
                id: this.generateEventId(),
                tenant_id: tenantId,
                event_type: event,
                properties,
                timestamp: new Date(),
                session_id: properties.session_id || null,
                user_id: properties.user_id || null,
                chatbot_id: properties.chatbot_id || null,
                conversation_id: properties.conversation_id || null
            };

            // Agregar al buffer para procesamiento en lote
            if (!this.eventBuffer.has(tenantId)) {
                this.eventBuffer.set(tenantId, []);
            }
            this.eventBuffer.get(tenantId).push(eventData);

            // Procesar buffer si está lleno
            if (this.eventBuffer.get(tenantId).length >= 50) {
                await this.flushEventBuffer(tenantId);
            }

            // Emitir evento para procesamiento en tiempo real
            this.emit('event_tracked', eventData);

            return eventData.id;
        } catch (error) {
            logger.error('Failed to track event', {
                tenantId,
                event,
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Vaciar buffer de eventos
     */
    async flushEventBuffer(tenantId) {
        try {
            const events = this.eventBuffer.get(tenantId);
            if (!events || events.length === 0) return;

            const supabase = createSupabaseClient();
            
            // Insertar eventos en lote
            const { error } = await supabase
                .from('analytics_events')
                .insert(events);

            if (error) throw error;

            // Limpiar buffer
            this.eventBuffer.set(tenantId, []);

            logger.debug('Event buffer flushed', {
                tenantId,
                eventCount: events.length
            });
        } catch (error) {
            logger.error('Failed to flush event buffer', {
                tenantId,
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Obtener métricas de dashboard
     */
    async getDashboardMetrics(tenantId, period = 'month', chatbotId = null) {
        try {
            const cacheKey = `dashboard_${tenantId}_${period}_${chatbotId || 'all'}`;
            
            // Verificar cache
            const cached = this.metricsCache.get(cacheKey);
            if (cached && (Date.now() - cached.timestamp) < 5 * 60 * 1000) { // 5 minutos
                return cached.data;
            }

            const dateRange = this.getDateRange(period);
            const supabase = createSupabaseClient();

            // Métricas de conversaciones
            const conversationMetrics = await this.getConversationMetrics(
                supabase, tenantId, dateRange, chatbotId
            );

            // Métricas de mensajes
            const messageMetrics = await this.getMessageMetrics(
                supabase, tenantId, dateRange, chatbotId
            );

            // Métricas de usuarios
            const userMetrics = await this.getUserMetrics(
                supabase, tenantId, dateRange, chatbotId
            );

            // Métricas de IA
            const aiMetrics = await this.getAIMetrics(
                supabase, tenantId, dateRange, chatbotId
            );

            // Métricas de flujos
            const flowMetrics = await this.getFlowMetrics(
                supabase, tenantId, dateRange, chatbotId
            );

            const metrics = {
                period,
                date_range: dateRange,
                conversations: conversationMetrics,
                messages: messageMetrics,
                users: userMetrics,
                ai: aiMetrics,
                flows: flowMetrics,
                generated_at: new Date()
            };

            // Guardar en cache
            this.metricsCache.set(cacheKey, {
                data: metrics,
                timestamp: Date.now()
            });

            return metrics;
        } catch (error) {
            logger.error('Failed to get dashboard metrics', {
                tenantId,
                period,
                chatbotId,
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Obtener métricas de conversaciones
     */
    async getConversationMetrics(supabase, tenantId, dateRange, chatbotId) {
        try {
            let query = supabase
                .from('conversations')
                .select('*')
                .eq('tenant_id', tenantId)
                .gte('created_at', dateRange.start)
                .lte('created_at', dateRange.end);

            if (chatbotId) {
                query = query.eq('chatbot_id', chatbotId);
            }

            const { data: conversations, error } = await query;
            if (error) throw error;

            const total = conversations.length;
            const active = conversations.filter(c => c.status === 'active').length;
            const completed = conversations.filter(c => c.status === 'completed').length;
            const abandoned = conversations.filter(c => c.status === 'abandoned').length;

            // Calcular duración promedio
            const completedConversations = conversations.filter(c => c.ended_at);
            const avgDuration = completedConversations.length > 0
                ? completedConversations.reduce((sum, c) => {
                    const duration = new Date(c.ended_at) - new Date(c.created_at);
                    return sum + duration;
                }, 0) / completedConversations.length
                : 0;

            // Calcular mensajes promedio
            const avgMessages = total > 0
                ? conversations.reduce((sum, c) => sum + (c.message_count || 0), 0) / total
                : 0;

            return {
                total,
                active,
                completed,
                abandoned,
                completion_rate: total > 0 ? (completed / total) * 100 : 0,
                abandonment_rate: total > 0 ? (abandoned / total) * 100 : 0,
                avg_duration_minutes: Math.round(avgDuration / (1000 * 60)),
                avg_messages: Math.round(avgMessages * 10) / 10
            };
        } catch (error) {
            logger.error('Failed to get conversation metrics', { error: error.message });
            return this.getEmptyMetrics('conversations');
        }
    }

    /**
     * Obtener métricas de mensajes
     */
    async getMessageMetrics(supabase, tenantId, dateRange, chatbotId) {
        try {
            let query = supabase
                .from('messages')
                .select('*')
                .eq('tenant_id', tenantId)
                .gte('created_at', dateRange.start)
                .lte('created_at', dateRange.end);

            if (chatbotId) {
                query = query.eq('chatbot_id', chatbotId);
            }

            const { data: messages, error } = await query;
            if (error) throw error;

            const total = messages.length;
            const inbound = messages.filter(m => m.direction === 'inbound').length;
            const outbound = messages.filter(m => m.direction === 'outbound').length;
            const successful = messages.filter(m => m.status === 'delivered' || m.status === 'read').length;

            // Calcular tiempo de respuesta promedio (simulado)
            const avgResponseTime = outbound > 0 ? 2.5 : 0; // 2.5 segundos promedio

            return {
                total,
                inbound,
                outbound,
                success_rate: total > 0 ? (successful / total) * 100 : 0,
                avg_response_time_seconds: avgResponseTime,
                messages_per_hour: this.calculateMessagesPerHour(messages, dateRange)
            };
        } catch (error) {
            logger.error('Failed to get message metrics', { error: error.message });
            return this.getEmptyMetrics('messages');
        }
    }

    /**
     * Obtener métricas de usuarios
     */
    async getUserMetrics(supabase, tenantId, dateRange, chatbotId) {
        try {
            let query = supabase
                .from('conversations')
                .select('user_phone, created_at')
                .eq('tenant_id', tenantId)
                .gte('created_at', dateRange.start)
                .lte('created_at', dateRange.end);

            if (chatbotId) {
                query = query.eq('chatbot_id', chatbotId);
            }

            const { data: conversations, error } = await query;
            if (error) throw error;

            // Usuarios únicos
            const uniqueUsers = new Set(conversations.map(c => c.user_phone)).size;

            // Usuarios nuevos vs recurrentes (simulado)
            const newUsers = Math.round(uniqueUsers * 0.7); // 70% nuevos
            const returningUsers = uniqueUsers - newUsers;

            // Tasa de engagement (simulado)
            const engagementRate = uniqueUsers > 0 ? 85 : 0; // 85% engagement

            return {
                total: uniqueUsers,
                new: newUsers,
                returning: returningUsers,
                engagement_rate: engagementRate,
                avg_conversations_per_user: uniqueUsers > 0 
                    ? Math.round((conversations.length / uniqueUsers) * 10) / 10 
                    : 0
            };
        } catch (error) {
            logger.error('Failed to get user metrics', { error: error.message });
            return this.getEmptyMetrics('users');
        }
    }

    /**
     * Obtener métricas de IA
     */
    async getAIMetrics(supabase, tenantId, dateRange, chatbotId) {
        try {
            let query = supabase
                .from('ai_requests')
                .select('*')
                .eq('tenant_id', tenantId)
                .gte('created_at', dateRange.start)
                .lte('created_at', dateRange.end);

            if (chatbotId) {
                query = query.eq('chatbot_id', chatbotId);
            }

            const { data: requests, error } = await query;
            if (error) throw error;

            const total = requests.length;
            const successful = requests.filter(r => r.status === 'completed').length;
            const totalTokens = requests.reduce((sum, r) => sum + (r.total_tokens || 0), 0);
            const totalCost = requests.reduce((sum, r) => sum + (r.cost_usd || 0), 0);
            const avgResponseTime = total > 0
                ? requests.reduce((sum, r) => sum + (r.response_time_ms || 0), 0) / total
                : 0;

            return {
                requests: total,
                tokens_used: totalTokens,
                success_rate: total > 0 ? (successful / total) * 100 : 0,
                avg_response_time_ms: Math.round(avgResponseTime),
                total_cost_usd: Math.round(totalCost * 10000) / 10000, // 4 decimales
                avg_tokens_per_request: total > 0 ? Math.round(totalTokens / total) : 0
            };
        } catch (error) {
            logger.error('Failed to get AI metrics', { error: error.message });
            return this.getEmptyMetrics('ai');
        }
    }

    /**
     * Obtener métricas de flujos
     */
    async getFlowMetrics(supabase, tenantId, dateRange, chatbotId) {
        try {
            let query = supabase
                .from('flow_executions')
                .select('*')
                .eq('tenant_id', tenantId)
                .gte('created_at', dateRange.start)
                .lte('created_at', dateRange.end);

            if (chatbotId) {
                query = query.eq('chatbot_id', chatbotId);
            }

            const { data: executions, error } = await query;
            if (error) throw error;

            const total = executions.length;
            const completed = executions.filter(e => e.status === 'completed').length;
            const successful = executions.filter(e => e.success === true).length;

            // Tiempo promedio de completación
            const completedExecutions = executions.filter(e => e.completed_at);
            const avgCompletionTime = completedExecutions.length > 0
                ? completedExecutions.reduce((sum, e) => {
                    const duration = new Date(e.completed_at) - new Date(e.created_at);
                    return sum + duration;
                }, 0) / completedExecutions.length
                : 0;

            return {
                executions: total,
                completions: completed,
                success_rate: total > 0 ? (successful / total) * 100 : 0,
                completion_rate: total > 0 ? (completed / total) * 100 : 0,
                avg_completion_time_seconds: Math.round(avgCompletionTime / 1000)
            };
        } catch (error) {
            logger.error('Failed to get flow metrics', { error: error.message });
            return this.getEmptyMetrics('flows');
        }
    }

    /**
     * Obtener datos para gráficos
     */
    async getChartData(tenantId, metric, period = 'week', chatbotId = null) {
        try {
            const dateRange = this.getDateRange(period);
            const intervals = this.generateTimeIntervals(dateRange, period);
            const supabase = createSupabaseClient();

            const chartData = {
                labels: intervals.map(i => i.label),
                datasets: []
            };

            switch (metric) {
                case 'conversations':
                    chartData.datasets = await this.getConversationChartData(
                        supabase, tenantId, intervals, chatbotId
                    );
                    break;
                case 'messages':
                    chartData.datasets = await this.getMessageChartData(
                        supabase, tenantId, intervals, chatbotId
                    );
                    break;
                case 'users':
                    chartData.datasets = await this.getUserChartData(
                        supabase, tenantId, intervals, chatbotId
                    );
                    break;
                case 'ai_usage':
                    chartData.datasets = await this.getAIChartData(
                        supabase, tenantId, intervals, chatbotId
                    );
                    break;
                default:
                    throw new AppError(`Unsupported chart metric: ${metric}`, 400);
            }

            return chartData;
        } catch (error) {
            logger.error('Failed to get chart data', {
                tenantId,
                metric,
                period,
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Obtener datos de gráfico de conversaciones
     */
    async getConversationChartData(supabase, tenantId, intervals, chatbotId) {
        const datasets = [
            {
                label: 'Conversaciones Iniciadas',
                data: [],
                borderColor: '#007bff',
                backgroundColor: 'rgba(0, 123, 255, 0.1)'
            },
            {
                label: 'Conversaciones Completadas',
                data: [],
                borderColor: '#28a745',
                backgroundColor: 'rgba(40, 167, 69, 0.1)'
            }
        ];

        for (const interval of intervals) {
            let query = supabase
                .from('conversations')
                .select('status')
                .eq('tenant_id', tenantId)
                .gte('created_at', interval.start)
                .lt('created_at', interval.end);

            if (chatbotId) {
                query = query.eq('chatbot_id', chatbotId);
            }

            const { data, error } = await query;
            if (error) throw error;

            const initiated = data.length;
            const completed = data.filter(c => c.status === 'completed').length;

            datasets[0].data.push(initiated);
            datasets[1].data.push(completed);
        }

        return datasets;
    }

    /**
     * Obtener datos de gráfico de mensajes
     */
    async getMessageChartData(supabase, tenantId, intervals, chatbotId) {
        const datasets = [
            {
                label: 'Mensajes Recibidos',
                data: [],
                borderColor: '#17a2b8',
                backgroundColor: 'rgba(23, 162, 184, 0.1)'
            },
            {
                label: 'Mensajes Enviados',
                data: [],
                borderColor: '#ffc107',
                backgroundColor: 'rgba(255, 193, 7, 0.1)'
            }
        ];

        for (const interval of intervals) {
            let query = supabase
                .from('messages')
                .select('direction')
                .eq('tenant_id', tenantId)
                .gte('created_at', interval.start)
                .lt('created_at', interval.end);

            if (chatbotId) {
                query = query.eq('chatbot_id', chatbotId);
            }

            const { data, error } = await query;
            if (error) throw error;

            const inbound = data.filter(m => m.direction === 'inbound').length;
            const outbound = data.filter(m => m.direction === 'outbound').length;

            datasets[0].data.push(inbound);
            datasets[1].data.push(outbound);
        }

        return datasets;
    }

    /**
     * Obtener datos de gráfico de usuarios
     */
    async getUserChartData(supabase, tenantId, intervals, chatbotId) {
        const datasets = [
            {
                label: 'Usuarios Únicos',
                data: [],
                borderColor: '#6f42c1',
                backgroundColor: 'rgba(111, 66, 193, 0.1)'
            }
        ];

        for (const interval of intervals) {
            let query = supabase
                .from('conversations')
                .select('user_phone')
                .eq('tenant_id', tenantId)
                .gte('created_at', interval.start)
                .lt('created_at', interval.end);

            if (chatbotId) {
                query = query.eq('chatbot_id', chatbotId);
            }

            const { data, error } = await query;
            if (error) throw error;

            const uniqueUsers = new Set(data.map(c => c.user_phone)).size;
            datasets[0].data.push(uniqueUsers);
        }

        return datasets;
    }

    /**
     * Obtener datos de gráfico de IA
     */
    async getAIChartData(supabase, tenantId, intervals, chatbotId) {
        const datasets = [
            {
                label: 'Solicitudes de IA',
                data: [],
                borderColor: '#e83e8c',
                backgroundColor: 'rgba(232, 62, 140, 0.1)'
            },
            {
                label: 'Tokens Utilizados (miles)',
                data: [],
                borderColor: '#fd7e14',
                backgroundColor: 'rgba(253, 126, 20, 0.1)'
            }
        ];

        for (const interval of intervals) {
            let query = supabase
                .from('ai_requests')
                .select('total_tokens')
                .eq('tenant_id', tenantId)
                .gte('created_at', interval.start)
                .lt('created_at', interval.end);

            if (chatbotId) {
                query = query.eq('chatbot_id', chatbotId);
            }

            const { data, error } = await query;
            if (error) throw error;

            const requests = data.length;
            const tokens = data.reduce((sum, r) => sum + (r.total_tokens || 0), 0);

            datasets[0].data.push(requests);
            datasets[1].data.push(Math.round(tokens / 1000)); // En miles
        }

        return datasets;
    }

    /**
     * Generar reporte personalizado
     */
    async generateCustomReport(tenantId, config) {
        try {
            const {
                metrics = ['conversations', 'messages', 'users'],
                period = 'month',
                chatbotId = null,
                format = 'json',
                includeCharts = false
            } = config;

            const report = {
                tenant_id: tenantId,
                generated_at: new Date(),
                period,
                chatbot_id: chatbotId,
                metrics: {},
                charts: {}
            };

            // Obtener métricas solicitadas
            const dashboardMetrics = await this.getDashboardMetrics(tenantId, period, chatbotId);
            
            for (const metric of metrics) {
                if (dashboardMetrics[metric]) {
                    report.metrics[metric] = dashboardMetrics[metric];
                }
            }

            // Incluir gráficos si se solicita
            if (includeCharts) {
                for (const metric of metrics) {
                    if (['conversations', 'messages', 'users', 'ai'].includes(metric)) {
                        const chartMetric = metric === 'ai' ? 'ai_usage' : metric;
                        report.charts[metric] = await this.getChartData(
                            tenantId, chartMetric, period, chatbotId
                        );
                    }
                }
            }

            return report;
        } catch (error) {
            logger.error('Failed to generate custom report', {
                tenantId,
                config,
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Obtener rango de fechas
     */
    getDateRange(period) {
        const now = new Date();
        let start;

        switch (period) {
            case 'day':
                start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                break;
            case 'week':
                start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                break;
            case 'month':
                start = new Date(now.getFullYear(), now.getMonth(), 1);
                break;
            case 'quarter':
                const quarter = Math.floor(now.getMonth() / 3);
                start = new Date(now.getFullYear(), quarter * 3, 1);
                break;
            case 'year':
                start = new Date(now.getFullYear(), 0, 1);
                break;
            default:
                start = new Date(now.getFullYear(), now.getMonth(), 1);
        }

        return {
            start: start.toISOString(),
            end: now.toISOString()
        };
    }

    /**
     * Generar intervalos de tiempo
     */
    generateTimeIntervals(dateRange, period) {
        const intervals = [];
        const start = new Date(dateRange.start);
        const end = new Date(dateRange.end);

        let current = new Date(start);
        let intervalSize;
        let labelFormat;

        switch (period) {
            case 'day':
                intervalSize = 60 * 60 * 1000; // 1 hora
                labelFormat = (date) => date.getHours() + ':00';
                break;
            case 'week':
                intervalSize = 24 * 60 * 60 * 1000; // 1 día
                labelFormat = (date) => date.toLocaleDateString('es-ES', { weekday: 'short' });
                break;
            case 'month':
                intervalSize = 24 * 60 * 60 * 1000; // 1 día
                labelFormat = (date) => date.getDate().toString();
                break;
            case 'quarter':
            case 'year':
                intervalSize = 7 * 24 * 60 * 60 * 1000; // 1 semana
                labelFormat = (date) => `${date.getDate()}/${date.getMonth() + 1}`;
                break;
            default:
                intervalSize = 24 * 60 * 60 * 1000;
                labelFormat = (date) => date.getDate().toString();
        }

        while (current < end) {
            const intervalEnd = new Date(Math.min(current.getTime() + intervalSize, end.getTime()));
            
            intervals.push({
                start: current.toISOString(),
                end: intervalEnd.toISOString(),
                label: labelFormat(current)
            });

            current = new Date(intervalEnd);
        }

        return intervals;
    }

    /**
     * Calcular mensajes por hora
     */
    calculateMessagesPerHour(messages, dateRange) {
        if (messages.length === 0) return 0;

        const start = new Date(dateRange.start);
        const end = new Date(dateRange.end);
        const hours = (end - start) / (1000 * 60 * 60);

        return Math.round((messages.length / hours) * 10) / 10;
    }

    /**
     * Obtener métricas vacías
     */
    getEmptyMetrics(category) {
        const empty = {};
        const categoryMetrics = this.metrics[category] || {};
        
        for (const key of Object.keys(categoryMetrics)) {
            empty[key] = 0;
        }

        return empty;
    }

    /**
     * Generar ID único para evento
     */
    generateEventId() {
        return `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Limpiar cache de métricas
     */
    clearMetricsCache(tenantId = null) {
        if (tenantId) {
            // Limpiar cache específico del tenant
            for (const [key, value] of this.metricsCache) {
                if (key.includes(tenantId)) {
                    this.metricsCache.delete(key);
                }
            }
        } else {
            // Limpiar todo el cache
            this.metricsCache.clear();
        }
    }

    /**
     * Procesar eventos en lote
     */
    async processEventBatch() {
        if (this.processing) return;

        this.processing = true;
        
        try {
            for (const [tenantId, events] of this.eventBuffer) {
                if (events.length > 0) {
                    await this.flushEventBuffer(tenantId);
                }
            }
        } catch (error) {
            logger.error('Failed to process event batch', {
                error: error.message
            });
        } finally {
            this.processing = false;
        }
    }

    /**
     * Limpiar cache antiguo
     */
    cleanupOldCache() {
        const now = Date.now();
        const maxAge = 15 * 60 * 1000; // 15 minutos

        for (const [key, value] of this.metricsCache) {
            if (now - value.timestamp > maxAge) {
                this.metricsCache.delete(key);
            }
        }
    }
}

// Crear instancia singleton
const analyticsService = new AnalyticsService();

// Procesar eventos en lote periódicamente
setInterval(() => {
    analyticsService.processEventBatch().catch(error => {
        logger.error('Failed to process analytics batch', {
            error: error.message
        });
    });
}, 30000); // Cada 30 segundos

// Limpiar cache antiguo periódicamente
setInterval(() => {
    analyticsService.cleanupOldCache();
}, 5 * 60 * 1000); // Cada 5 minutos

module.exports = {
    AnalyticsService,
    analyticsService
};