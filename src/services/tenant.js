/**
 * Servicio de Gestión de Tenants para TecnoBot SAAS
 * Maneja la creación, actualización y administración de tenants
 */

const { createSupabaseClient, handleSupabaseError, logAnalyticsEvent } = require('../utils/supabase');
const logger = require('../utils/logger-saas');
const { v4: uuidv4 } = require('uuid');

class TenantService {
    constructor() {
        this.supabase = createSupabaseClient();
    }
    
    /**
     * Crear nuevo tenant
     */
    async createTenant(ownerUserId, tenantData) {
        try {
            const { name, slug, planType = 'free', company, phone, website } = tenantData;
            
            // Validar datos requeridos
            if (!name || !slug) {
                throw new Error('Nombre y slug son requeridos');
            }
            
            // Validar formato del slug
            if (!/^[a-z0-9-]+$/.test(slug)) {
                throw new Error('El slug solo puede contener letras minúsculas, números y guiones');
            }
            
            // Verificar que el slug no esté en uso
            const { data: existingTenant } = await this.supabase
                .from('tenants')
                .select('id')
                .eq('slug', slug)
                .single();
            
            if (existingTenant) {
                throw new Error('El slug ya está en uso');
            }
            
            // Obtener límites del plan
            const planLimits = this.getPlanLimits(planType);
            
            // Crear tenant
            const { data: tenant, error: tenantError } = await this.supabase
                .from('tenants')
                .insert({
                    name,
                    slug,
                    plan_type: planType,
                    plan_limits: planLimits,
                    subscription_status: 'active',
                    settings: {
                        company,
                        phone,
                        website,
                        timezone: 'America/Mexico_City',
                        language: 'es',
                        notifications: {
                            email: true,
                            webhook: false
                        }
                    },
                    is_active: true
                })
                .select()
                .single();
            
            if (tenantError) {
                throw handleSupabaseError(tenantError, { name, slug });
            }
            
            // Agregar usuario como owner del tenant
            const { error: userTenantError } = await this.supabase
                .from('tenant_users')
                .insert({
                    tenant_id: tenant.id,
                    user_id: ownerUserId,
                    role: 'owner',
                    is_active: true
                });
            
            if (userTenantError) {
                // Rollback: eliminar tenant creado
                await this.supabase.from('tenants').delete().eq('id', tenant.id);
                throw handleSupabaseError(userTenantError, { tenantId: tenant.id, ownerUserId });
            }
            
            // Crear chatbot por defecto
            await this.createDefaultChatbot(tenant.id);
            
            // Registrar evento de analytics
            await logAnalyticsEvent(tenant.id, 'tenant_created', {
                planType,
                ownerUserId
            });
            
            logger.info('Tenant creado exitosamente', {
                tenantId: tenant.id,
                name,
                slug,
                ownerUserId,
                planType
            });
            
            return {
                id: tenant.id,
                name: tenant.name,
                slug: tenant.slug,
                planType: tenant.plan_type,
                planLimits: tenant.plan_limits,
                subscriptionStatus: tenant.subscription_status,
                settings: tenant.settings,
                createdAt: tenant.created_at
            };
            
        } catch (error) {
            logger.error('Error creando tenant:', error, { ownerUserId, tenantData });
            throw error;
        }
    }
    
    /**
     * Obtener tenant por ID
     */
    async getTenant(tenantId) {
        try {
            const { data, error } = await this.supabase
                .from('tenants')
                .select(`
                    *,
                    tenant_users!inner (
                        user_id,
                        role,
                        is_active
                    )
                `)
                .eq('id', tenantId)
                .single();
            
            if (error) {
                throw handleSupabaseError(error, { tenantId });
            }
            
            return this.formatTenantResponse(data);
            
        } catch (error) {
            logger.error('Error obteniendo tenant:', error, { tenantId });
            throw error;
        }
    }
    
    /**
     * Obtener tenant por slug
     */
    async getTenantBySlug(slug) {
        try {
            const { data, error } = await this.supabase
                .from('tenants')
                .select('*')
                .eq('slug', slug)
                .single();
            
            if (error) {
                throw handleSupabaseError(error, { slug });
            }
            
            return this.formatTenantResponse(data);
            
        } catch (error) {
            logger.error('Error obteniendo tenant por slug:', error, { slug });
            throw error;
        }
    }
    
    /**
     * Actualizar tenant
     */
    async updateTenant(tenantId, updateData, userId) {
        try {
            // Verificar permisos (solo owner/admin pueden actualizar)
            await this.verifyTenantPermission(tenantId, userId, ['owner', 'admin']);
            
            const allowedFields = ['name', 'settings'];
            const filteredData = {};
            
            Object.keys(updateData).forEach(key => {
                if (allowedFields.includes(key)) {
                    filteredData[key] = updateData[key];
                }
            });
            
            if (Object.keys(filteredData).length === 0) {
                throw new Error('No hay campos válidos para actualizar');
            }
            
            const { data, error } = await this.supabase
                .from('tenants')
                .update(filteredData)
                .eq('id', tenantId)
                .select()
                .single();
            
            if (error) {
                throw handleSupabaseError(error, { tenantId, updateData: filteredData });
            }
            
            // Registrar evento de analytics
            await logAnalyticsEvent(tenantId, 'tenant_updated', {
                updatedFields: Object.keys(filteredData),
                userId
            });
            
            logger.info('Tenant actualizado exitosamente', {
                tenantId,
                updatedFields: Object.keys(filteredData),
                userId
            });
            
            return this.formatTenantResponse(data);
            
        } catch (error) {
            logger.error('Error actualizando tenant:', error, { tenantId, updateData, userId });
            throw error;
        }
    }
    
    /**
     * Cambiar plan del tenant
     */
    async changePlan(tenantId, newPlanType, userId) {
        try {
            // Verificar permisos (solo owner puede cambiar plan)
            await this.verifyTenantPermission(tenantId, userId, ['owner']);
            
            const planLimits = this.getPlanLimits(newPlanType);
            
            const { data, error } = await this.supabase
                .from('tenants')
                .update({
                    plan_type: newPlanType,
                    plan_limits: planLimits
                })
                .eq('id', tenantId)
                .select()
                .single();
            
            if (error) {
                throw handleSupabaseError(error, { tenantId, newPlanType });
            }
            
            // Registrar evento de analytics
            await logAnalyticsEvent(tenantId, 'plan_changed', {
                newPlanType,
                userId
            });
            
            logger.info('Plan del tenant cambiado exitosamente', {
                tenantId,
                newPlanType,
                userId
            });
            
            return this.formatTenantResponse(data);
            
        } catch (error) {
            logger.error('Error cambiando plan del tenant:', error, { tenantId, newPlanType, userId });
            throw error;
        }
    }
    
    /**
     * Suspender/activar tenant
     */
    async toggleTenantStatus(tenantId, isActive, userId) {
        try {
            // Solo super admin puede suspender tenants
            // Por ahora, verificamos que sea owner
            await this.verifyTenantPermission(tenantId, userId, ['owner']);
            
            const { data, error } = await this.supabase
                .from('tenants')
                .update({ is_active: isActive })
                .eq('id', tenantId)
                .select()
                .single();
            
            if (error) {
                throw handleSupabaseError(error, { tenantId, isActive });
            }
            
            // Registrar evento de analytics
            await logAnalyticsEvent(tenantId, isActive ? 'tenant_activated' : 'tenant_suspended', {
                userId
            });
            
            logger.info(`Tenant ${isActive ? 'activado' : 'suspendido'} exitosamente`, {
                tenantId,
                isActive,
                userId
            });
            
            return this.formatTenantResponse(data);
            
        } catch (error) {
            logger.error('Error cambiando estado del tenant:', error, { tenantId, isActive, userId });
            throw error;
        }
    }
    
    /**
     * Obtener usuarios del tenant
     */
    async getTenantUsers(tenantId, userId) {
        try {
            // Verificar permisos
            await this.verifyTenantPermission(tenantId, userId, ['owner', 'admin']);
            
            const { data, error } = await this.supabase
                .from('tenant_users')
                .select(`
                    id,
                    role,
                    is_active,
                    created_at,
                    auth.users (
                        id,
                        email,
                        user_metadata
                    )
                `)
                .eq('tenant_id', tenantId)
                .order('created_at', { ascending: false });
            
            if (error) {
                throw handleSupabaseError(error, { tenantId });
            }
            
            return data.map(item => ({
                id: item.id,
                userId: item.auth.users.id,
                email: item.auth.users.email,
                fullName: item.auth.users.user_metadata?.full_name || '',
                role: item.role,
                isActive: item.is_active,
                joinedAt: item.created_at
            }));
            
        } catch (error) {
            logger.error('Error obteniendo usuarios del tenant:', error, { tenantId, userId });
            throw error;
        }
    }
    
    /**
     * Invitar usuario al tenant
     */
    async inviteUser(tenantId, email, role, invitedByUserId) {
        try {
            // Verificar permisos
            await this.verifyTenantPermission(tenantId, invitedByUserId, ['owner', 'admin']);
            
            // Verificar que el usuario existe
            const { data: user, error: userError } = await this.supabase
                .from('auth.users')
                .select('id, email')
                .eq('email', email)
                .single();
            
            if (userError) {
                throw new Error('Usuario no encontrado');
            }
            
            // Verificar que no esté ya en el tenant
            const { data: existingMember } = await this.supabase
                .from('tenant_users')
                .select('id')
                .eq('tenant_id', tenantId)
                .eq('user_id', user.id)
                .single();
            
            if (existingMember) {
                throw new Error('El usuario ya es miembro de este tenant');
            }
            
            // Agregar usuario al tenant
            const { data, error } = await this.supabase
                .from('tenant_users')
                .insert({
                    tenant_id: tenantId,
                    user_id: user.id,
                    role,
                    is_active: true
                })
                .select()
                .single();
            
            if (error) {
                throw handleSupabaseError(error, { tenantId, email, role });
            }
            
            // Registrar evento de analytics
            await logAnalyticsEvent(tenantId, 'user_invited', {
                invitedUserId: user.id,
                role,
                invitedByUserId
            });
            
            logger.info('Usuario invitado al tenant exitosamente', {
                tenantId,
                invitedUserId: user.id,
                email,
                role,
                invitedByUserId
            });
            
            return {
                id: data.id,
                userId: user.id,
                email: user.email,
                role: data.role,
                isActive: data.is_active
            };
            
        } catch (error) {
            logger.error('Error invitando usuario al tenant:', error, { tenantId, email, role, invitedByUserId });
            throw error;
        }
    }
    
    /**
     * Remover usuario del tenant
     */
    async removeUser(tenantId, userIdToRemove, removedByUserId) {
        try {
            // Verificar permisos
            await this.verifyTenantPermission(tenantId, removedByUserId, ['owner', 'admin']);
            
            // No permitir que el owner se remueva a sí mismo
            const userRole = await this.getUserTenantRole(tenantId, userIdToRemove);
            if (userRole === 'owner' && userIdToRemove === removedByUserId) {
                throw new Error('El propietario no puede removerse a sí mismo');
            }
            
            const { error } = await this.supabase
                .from('tenant_users')
                .delete()
                .eq('tenant_id', tenantId)
                .eq('user_id', userIdToRemove);
            
            if (error) {
                throw handleSupabaseError(error, { tenantId, userIdToRemove });
            }
            
            // Registrar evento de analytics
            await logAnalyticsEvent(tenantId, 'user_removed', {
                removedUserId: userIdToRemove,
                removedByUserId
            });
            
            logger.info('Usuario removido del tenant exitosamente', {
                tenantId,
                removedUserId: userIdToRemove,
                removedByUserId
            });
            
            return { success: true };
            
        } catch (error) {
            logger.error('Error removiendo usuario del tenant:', error, { tenantId, userIdToRemove, removedByUserId });
            throw error;
        }
    }
    
    /**
     * Obtener estadísticas del tenant
     */
    async getTenantStats(tenantId, userId) {
        try {
            // Verificar permisos
            await this.verifyTenantPermission(tenantId, userId, ['owner', 'admin', 'editor', 'viewer']);
            
            // Obtener estadísticas en paralelo
            const [chatbotsResult, conversationsResult, messagesResult, usersResult] = await Promise.all([
                this.supabase.from('chatbots').select('count').eq('tenant_id', tenantId),
                this.supabase.from('conversations').select('count').eq('tenant_id', tenantId),
                this.supabase.from('messages').select('count').eq('tenant_id', tenantId),
                this.supabase.from('tenant_users').select('count').eq('tenant_id', tenantId).eq('is_active', true)
            ]);
            
            return {
                chatbots: chatbotsResult.data?.[0]?.count || 0,
                conversations: conversationsResult.data?.[0]?.count || 0,
                messages: messagesResult.data?.[0]?.count || 0,
                users: usersResult.data?.[0]?.count || 0
            };
            
        } catch (error) {
            logger.error('Error obteniendo estadísticas del tenant:', error, { tenantId, userId });
            throw error;
        }
    }
    
    /**
     * Crear chatbot por defecto
     */
    async createDefaultChatbot(tenantId) {
        try {
            const { error } = await this.supabase
                .from('chatbots')
                .insert({
                    tenant_id: tenantId,
                    name: 'Mi Primer Chatbot',
                    description: 'Chatbot creado automáticamente',
                    phone_number: '',
                    is_active: false,
                    settings: {
                        welcome_message: '¡Hola! Bienvenido a nuestro servicio de atención.',
                        ai_enabled: true,
                        ai_model: 'gpt-3.5-turbo',
                        response_delay: 1000,
                        typing_indicator: true
                    }
                });
            
            if (error) {
                logger.warn('Error creando chatbot por defecto:', error, { tenantId });
            } else {
                logger.debug('Chatbot por defecto creado', { tenantId });
            }
            
        } catch (error) {
            logger.warn('Error creando chatbot por defecto:', error, { tenantId });
        }
    }
    
    /**
     * Verificar permisos del usuario en el tenant
     */
    async verifyTenantPermission(tenantId, userId, allowedRoles) {
        const { data, error } = await this.supabase
            .from('tenant_users')
            .select('role, is_active')
            .eq('tenant_id', tenantId)
            .eq('user_id', userId)
            .eq('is_active', true)
            .single();
        
        if (error || !data) {
            throw new Error('No tienes permisos para acceder a este tenant');
        }
        
        if (!allowedRoles.includes(data.role)) {
            throw new Error('No tienes permisos suficientes para realizar esta acción');
        }
        
        return data.role;
    }
    
    /**
     * Obtener rol del usuario en el tenant
     */
    async getUserTenantRole(tenantId, userId) {
        const { data, error } = await this.supabase
            .from('tenant_users')
            .select('role')
            .eq('tenant_id', tenantId)
            .eq('user_id', userId)
            .eq('is_active', true)
            .single();
        
        if (error || !data) {
            return null;
        }
        
        return data.role;
    }
    
    /**
     * Obtener límites del plan
     */
    getPlanLimits(planType) {
        const limits = {
            free: {
                chatbots: 1,
                conversations_per_month: 100,
                messages_per_month: 1000,
                users: 1,
                ai_requests_per_month: 50,
                webhooks: 1,
                custom_flows: 5
            },
            basic: {
                chatbots: 3,
                conversations_per_month: 1000,
                messages_per_month: 10000,
                users: 3,
                ai_requests_per_month: 500,
                webhooks: 5,
                custom_flows: 25
            },
            pro: {
                chatbots: 10,
                conversations_per_month: 5000,
                messages_per_month: 50000,
                users: 10,
                ai_requests_per_month: 2500,
                webhooks: 20,
                custom_flows: 100
            },
            enterprise: {
                chatbots: -1, // ilimitado
                conversations_per_month: -1,
                messages_per_month: -1,
                users: -1,
                ai_requests_per_month: -1,
                webhooks: -1,
                custom_flows: -1
            }
        };
        
        return limits[planType] || limits.free;
    }
    
    /**
     * Formatear respuesta del tenant
     */
    formatTenantResponse(data) {
        return {
            id: data.id,
            name: data.name,
            slug: data.slug,
            planType: data.plan_type,
            planLimits: data.plan_limits,
            subscriptionStatus: data.subscription_status,
            settings: data.settings,
            isActive: data.is_active,
            createdAt: data.created_at,
            updatedAt: data.updated_at
        };
    }
}

// Instancia singleton
const tenantService = new TenantService();

module.exports = {
    TenantService,
    tenantService
};