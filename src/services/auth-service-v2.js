/**
 * Servicio de Autenticación Multi-Tenant v2.0
 * 
 * Versión mejorada que maneja la autenticación y gestión de tenants
 * con soporte completo para planes, límites y roles
 */

import supabase, { supabaseAdmin, createTenantClient } from '../config/supabase.js'
import { AppConfig } from '../config/app-config.js'
import { logger } from '../utils/logger.js'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { v4 as uuidv4 } from 'uuid'

export class AuthServiceV2 {
    constructor() {
        this.supabase = supabaseAdmin
    }

    /**
     * Registro de nuevo usuario con tenant
     */
    async register(userData) {
        try {
            const {
                email,
                password,
                fullName,
                tenantName,
                tenantSlug,
                plan = 'free'
            } = userData

            // Validar datos requeridos
            if (!email || !password || !fullName || !tenantName) {
                throw new Error('Datos requeridos faltantes')
            }

            // Validar formato de email
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
            if (!emailRegex.test(email)) {
                throw new Error('Formato de email inválido')
            }

            // Validar fortaleza de contraseña
            if (password.length < 8) {
                throw new Error('La contraseña debe tener al menos 8 caracteres')
            }

            // Generar slug único si no se proporciona
            const finalSlug = tenantSlug || await this.generateUniqueSlug(tenantName)

            // Verificar que el slug no exista
            const { data: existingTenant } = await this.supabase
                .from('tenants')
                .select('id')
                .eq('slug', finalSlug)
                .single()

            if (existingTenant) {
                throw new Error('El nombre del tenant ya está en uso')
            }

            // Crear usuario en Supabase Auth
            const { data: authData, error: authError } = await this.supabase.auth.admin.createUser({
                email,
                password,
                email_confirm: true,
                user_metadata: {
                    full_name: fullName,
                    tenant_name: tenantName,
                    tenant_slug: finalSlug
                }
            })

            if (authError) {
                logger.error('Error creando usuario en Supabase Auth:', authError)
                throw new Error(`Error de autenticación: ${authError.message}`)
            }

            const userId = authData.user.id

            // Crear tenant
            const tenantId = uuidv4()
            const { data: tenant, error: tenantError } = await this.supabase
                .from('tenants')
                .insert({
                    id: tenantId,
                    name: tenantName,
                    slug: finalSlug,
                    plan,
                    subscription_status: 'active',
                    settings: {
                        timezone: 'UTC',
                        language: 'es',
                        notifications: {
                            email: true,
                            webhook: false
                        }
                    }
                })
                .select()
                .single()

            if (tenantError) {
                logger.error('Error creando tenant:', tenantError)
                // Limpiar usuario creado
                await this.supabase.auth.admin.deleteUser(userId)
                throw new Error(`Error creando tenant: ${tenantError.message}`)
            }

            // Crear relación tenant_users (owner)
            const { error: tenantUserError } = await this.supabase
                .from('tenant_users')
                .insert({
                    tenant_id: tenantId,
                    user_id: userId,
                    role: 'owner'
                })

            if (tenantUserError) {
                logger.error('Error creando relación tenant_users:', tenantUserError)
                // Limpiar datos creados
                await this.supabase.from('tenants').delete().eq('id', tenantId)
                await this.supabase.auth.admin.deleteUser(userId)
                throw new Error(`Error configurando usuario: ${tenantUserError.message}`)
            }

            // Crear chatbot por defecto
            await this.createDefaultChatbot(tenantId, userId)

            // Generar tokens
            const tokens = await this.generateTokens(userId, tenantId)

            logger.info(`✅ Usuario registrado exitosamente: ${email} - Tenant: ${tenantName}`, {
                userId,
                tenantId,
                email,
                tenantName
            })

            return {
                success: true,
                userId,
                email,
                fullName,
                tenantId,
                tenantName,
                tenantSlug: finalSlug,
                plan,
                role: 'owner',
                tokens
            }

        } catch (error) {
            logger.error('Error en registro:', error)
            throw error
        }
    }

    /**
     * Login de usuario
     */
    async login(email, password) {
        try {
            // Autenticar con Supabase
            const { data: authData, error: authError } = await this.supabase.auth.signInWithPassword({
                email,
                password
            })

            if (authError) {
                logger.warn(`Intento de login fallido: ${email}`, authError)
                throw new Error('Credenciales inválidas')
            }

            const userId = authData.user.id

            // Obtener información del tenant
            const { data: tenantUser, error: tenantError } = await this.supabase
                .from('tenant_users')
                .select(`
                    tenant_id,
                    role,
                    tenants (
                        id,
                        name,
                        slug,
                        plan,
                        subscription_status
                    )
                `)
                .eq('user_id', userId)
                .single()

            if (tenantError || !tenantUser) {
                logger.warn(`Tenant no encontrado para usuario: ${email}`, tenantError)
                throw new Error('Usuario no asociado a ningún tenant activo')
            }

            const tenant = tenantUser.tenants

            if (tenant.subscription_status !== 'active') {
                throw new Error('Tenant con suscripción inactiva')
            }

            if (tenant.subscription_status === 'suspended') {
                throw new Error('Suscripción suspendida')
            }

            // Generar tokens
            const tokens = await this.generateTokens(userId, tenant.id)

            // Actualizar último login
            await this.supabase
                .from('tenant_users')
                .update({ last_login: new Date().toISOString() })
                .eq('user_id', userId)
                .eq('tenant_id', tenant.id)

            logger.info(`✅ Login exitoso: ${email} - Tenant: ${tenant.name}`, {
                userId,
                tenantId: tenant.id,
                email,
                role: tenantUser.role
            })

            return {
                success: true,
                user: {
                    id: userId,
                    email: authData.user.email,
                    fullName: authData.user.user_metadata?.full_name,
                    tenant: {
                        id: tenant.id,
                        name: tenant.name,
                        slug: tenant.slug,
                        plan: tenant.plan,
                        subscriptionStatus: tenant.subscription_status,
                        role: tenantUser.role
                    }
                },
                tokens
            }

        } catch (error) {
            logger.error('Error en login:', error)
            throw error
        }
    }

    /**
     * Logout de usuario
     */
    async logout(token) {
        try {
            const { error } = await this.supabase.auth.admin.signOut(token)
            
            if (error) {
                logger.warn('Error en logout:', error)
            }

            return { success: true }

        } catch (error) {
            logger.error('Error en logout:', error)
            return { success: false, error: error.message }
        }
    }

    /**
     * Refrescar tokens
     */
    async refreshTokens(refreshToken) {
        try {
            const { data, error } = await this.supabase.auth.refreshSession({
                refresh_token: refreshToken
            })

            if (error) {
                throw new Error('Token de refresco inválido')
            }

            return {
                success: true,
                tokens: {
                    accessToken: data.session.access_token,
                    refreshToken: data.session.refresh_token,
                    expiresAt: data.session.expires_at
                }
            }

        } catch (error) {
            logger.error('Error refrescando tokens:', error)
            throw error
        }
    }

    /**
     * Obtener perfil de usuario
     */
    async getUserProfile(userId) {
        try {
            const { data: user, error: userError } = await this.supabase.auth.admin.getUserById(userId)
            
            if (userError) {
                throw new Error('Usuario no encontrado')
            }

            const { data: tenantUser, error: tenantError } = await this.supabase
                .from('tenant_users')
                .select(`
                    tenant_id,
                    role,
                    is_active,
                    joined_at,
                    last_login,
                    tenants (
                        id,
                        name,
                        slug,
                        plan,
                        subscription_status
                    )
                `)
                .eq('user_id', userId)
                .eq('is_active', true)
                .single()

            if (tenantError) {
                throw new Error('Información de tenant no encontrada')
            }

            return {
                id: userId,
                email: user.user.email,
                fullName: user.user.user_metadata?.full_name,
                createdAt: user.user.created_at,
                tenant: {
                    ...tenantUser.tenants,
                    role: tenantUser.role,
                    joinedAt: tenantUser.joined_at,
                    lastLogin: tenantUser.last_login
                }
            }

        } catch (error) {
            logger.error('Error obteniendo perfil:', error)
            throw error
        }
    }

    /**
     * Cambiar contraseña
     */
    async changePassword(userId, currentPassword, newPassword) {
        try {
            // Validar nueva contraseña
            if (newPassword.length < 8) {
                throw new Error('La nueva contraseña debe tener al menos 8 caracteres')
            }

            const { error } = await this.supabase.auth.admin.updateUserById(userId, {
                password: newPassword
            })

            if (error) {
                throw new Error(`Error cambiando contraseña: ${error.message}`)
            }

            logger.info(`✅ Contraseña cambiada para usuario: ${userId}`)

            return { success: true }

        } catch (error) {
            logger.error('Error cambiando contraseña:', error)
            throw error
        }
    }

    /**
     * Generar slug único para tenant
     */
    async generateUniqueSlug(tenantName) {
        let baseSlug = tenantName
            .toLowerCase()
            .replace(/[^a-z0-9]/g, '-')
            .replace(/-+/g, '-')
            .replace(/^-|-$/g, '')

        let slug = baseSlug
        let counter = 1

        while (true) {
            const { data } = await this.supabase
                .from('tenants')
                .select('id')
                .eq('slug', slug)
                .single()

            if (!data) {
                break
            }

            slug = `${baseSlug}-${counter}`
            counter++
        }

        return slug
    }

    /**
     * Crear chatbot por defecto
     */
    async createDefaultChatbot(tenantId, userId) {
        try {
            const { error } = await this.supabase
                .from('chatbots')
                .insert({
                    tenant_id: tenantId,
                    user_id: userId,
                    name_chatbot: 'Mi Primer Chatbot',
                    description: 'Chatbot creado automáticamente',
                    is_active: true
                })

            if (error) {
                logger.warn('Error creando chatbot por defecto:', error)
            } else {
                logger.info(`✅ Chatbot por defecto creado para tenant: ${tenantId}`)
            }

        } catch (error) {
            logger.error('Error creando chatbot por defecto:', error)
        }
    }

    /**
     * Generar tokens JWT
     */
    async generateTokens(userId, tenantId) {
        const payload = {
            sub: userId,
            tenant_id: tenantId,
            iat: Math.floor(Date.now() / 1000)
        }

        const accessToken = jwt.sign(payload, AppConfig.auth.jwtSecret, {
            expiresIn: AppConfig.auth.jwtExpiration
        })

        const refreshToken = jwt.sign(payload, AppConfig.auth.jwtSecret, {
            expiresIn: AppConfig.auth.refreshTokenExpiration
        })

        return {
            accessToken,
            refreshToken,
            expiresIn: AppConfig.auth.jwtExpiration
        }
    }

    /**
     * Validar token JWT
     */
    async validateToken(token) {
        try {
            const decoded = jwt.verify(token, AppConfig.jwt.secret)
            return {
                valid: true,
                userId: decoded.sub,
                tenantId: decoded.tenant_id
            }
        } catch (error) {
            return {
                valid: false,
                error: error.message
            }
        }
    }

    /**
     * Invitar usuario a tenant
     */
    async inviteUser(tenantId, inviterUserId, email, role = 'member') {
        try {
            // Verificar que el invitador tenga permisos
            const { data: inviter } = await this.supabase
                .from('tenant_users')
                .select('role')
                .eq('tenant_id', tenantId)
                .eq('user_id', inviterUserId)
                .single()

            if (!inviter || !['owner', 'admin'].includes(inviter.role)) {
                throw new Error('Sin permisos para invitar usuarios')
            }

            // Verificar límites del plan
            const planLimits = await this.getTenantPlanLimits(tenantId)
            const currentMembers = await this.getTenantMemberCount(tenantId)

            if (planLimits.maxTeamMembers !== -1 && currentMembers >= planLimits.maxTeamMembers) {
                throw new Error('Límite de miembros del equipo excedido')
            }

            // Verificar si el usuario ya existe
            let userId
            const { data: existingUser } = await this.supabase.auth.admin.getUserByEmail(email)

            if (existingUser.user) {
                userId = existingUser.user.id
                
                // Verificar si ya es miembro del tenant
                const { data: existingMember } = await this.supabase
                    .from('tenant_users')
                    .select('id')
                    .eq('tenant_id', tenantId)
                    .eq('user_id', userId)
                    .single()

                if (existingMember) {
                    throw new Error('El usuario ya es miembro de este tenant')
                }
            } else {
                // Crear usuario temporal (será activado cuando acepte la invitación)
                const { data: newUser, error } = await this.supabase.auth.admin.createUser({
                    email,
                    email_confirm: false,
                    user_metadata: {
                        invited_to_tenant: tenantId,
                        invited_by: inviterUserId
                    }
                })

                if (error) {
                    throw new Error(`Error creando usuario: ${error.message}`)
                }

                userId = newUser.user.id
            }

            // Crear invitación
            const { error: inviteError } = await this.supabase
                .from('tenant_users')
                .insert({
                    tenant_id: tenantId,
                    user_id: userId,
                    role,
                    is_active: false, // Se activará cuando acepte
                    invited_by: inviterUserId,
                    invited_at: new Date().toISOString()
                })

            if (inviteError) {
                throw new Error(`Error creando invitación: ${inviteError.message}`)
            }

            logger.info(`✅ Usuario invitado: ${email} al tenant: ${tenantId}`, {
                tenantId,
                inviterUserId,
                email,
                role
            })

            return { success: true, userId }

        } catch (error) {
            logger.error('Error invitando usuario:', error)
            throw error
        }
    }

    /**
     * Obtener límites del plan del tenant
     */
    async getTenantPlanLimits(tenantId) {
        const { data: tenant } = await this.supabase
            .from('tenants')
            .select('plan')
            .eq('id', tenantId)
            .single()

        return AppConfig.plans[tenant?.plan] || AppConfig.plans.free
    }

    /**
     * Obtener conteo de miembros del tenant
     */
    async getTenantMemberCount(tenantId) {
        const { count } = await this.supabase
            .from('tenant_users')
            .select('*', { count: 'exact', head: true })
            .eq('tenant_id', tenantId)
            .eq('is_active', true)

        return count || 0
    }
}

export default new AuthServiceV2()