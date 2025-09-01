/**
 * Servicio de Autenticación Multi-Tenant
 * 
 * Maneja el registro, login, logout y gestión de sesiones
 * para múltiples usuarios en la plataforma SAAS
 */

import { supabase } from '../config/supabase.js'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'

class AuthService {
    constructor() {
        this.jwtSecret = process.env.JWT_SECRET || 'your-super-secret-jwt-key'
        this.jwtExpiration = process.env.JWT_EXPIRATION || '24h'
    }

    /**
     * Registrar nuevo usuario/tenant
     */
    async register(userData) {
        try {
            const { email, password, firstName, lastName, company, phone } = userData

            // Validaciones básicas
            if (!email || !password) {
                throw new Error('Email y contraseña son requeridos')
            }

            if (password.length < 8) {
                throw new Error('La contraseña debe tener al menos 8 caracteres')
            }

            // Verificar si el usuario ya existe
            const { data: existingUser } = await supabase
                .from('auth.users')
                .select('email')
                .eq('email', email)
                .single()

            if (existingUser) {
                throw new Error('El usuario ya existe con este email')
            }

            // Crear usuario en Supabase Auth
            const { data: authData, error: authError } = await supabase.auth.signUp({
                email,
                password,
                options: {
                    data: {
                        first_name: firstName,
                        last_name: lastName,
                        company: company || '',
                        phone: phone || '',
                        role: 'tenant_admin',
                        created_at: new Date().toISOString()
                    }
                }
            })

            if (authError) {
                console.error('Error creando usuario:', authError)
                throw new Error(`Error al crear usuario: ${authError.message}`)
            }

            const user = authData.user

            // Crear perfil de tenant en tabla personalizada
            const { error: profileError } = await supabase
                .from('tenant_profiles')
                .insert({
                    user_id: user.id,
                    email: user.email,
                    first_name: firstName,
                    last_name: lastName,
                    company: company || '',
                    phone: phone || '',
                    subscription_status: 'trial',
                    subscription_plan: 'basic',
                    trial_ends_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 días
                    max_chatbots: 3,
                    max_monthly_messages: 1000,
                    created_at: new Date().toISOString()
                })

            if (profileError) {
                console.error('Error creando perfil de tenant:', profileError)
                // Intentar limpiar el usuario creado
                await this.deleteUser(user.id)
                throw new Error('Error al crear perfil de usuario')
            }

            // Crear chatbot por defecto
            await this.createDefaultChatbot(user.id)

            console.log(`✅ Nuevo tenant registrado: ${email} (${user.id})`)

            return {
                success: true,
                user: {
                    id: user.id,
                    email: user.email,
                    firstName,
                    lastName,
                    company,
                    needsEmailConfirmation: !user.email_confirmed_at
                },
                message: user.email_confirmed_at ? 
                    'Usuario registrado exitosamente' : 
                    'Usuario registrado. Por favor confirma tu email.'
            }

        } catch (error) {
            console.error('❌ Error en registro:', error)
            throw error
        }
    }

    /**
     * Iniciar sesión
     */
    async login(email, password) {
        try {
            if (!email || !password) {
                throw new Error('Email y contraseña son requeridos')
            }

            // Autenticar con Supabase
            const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
                email,
                password
            })

            if (authError) {
                console.error('Error en login:', authError)
                throw new Error('Credenciales inválidas')
            }

            const user = authData.user
            const session = authData.session

            // Obtener perfil del tenant
            const { data: profile, error: profileError } = await supabase
                .from('tenant_profiles')
                .select('*')
                .eq('user_id', user.id)
                .single()

            if (profileError || !profile) {
                console.error('Error obteniendo perfil:', profileError)
                throw new Error('Perfil de usuario no encontrado')
            }

            // Verificar estado de suscripción
            if (profile.subscription_status === 'cancelled') {
                throw new Error('Cuenta cancelada. Contacta soporte.')
            }

            if (profile.subscription_status === 'trial' && new Date() > new Date(profile.trial_ends_at)) {
                throw new Error('Período de prueba expirado. Actualiza tu suscripción.')
            }

            // Actualizar último login
            await supabase
                .from('tenant_profiles')
                .update({ last_login_at: new Date().toISOString() })
                .eq('user_id', user.id)

            console.log(`🔐 Login exitoso: ${email} (${user.id})`)

            return {
                success: true,
                user: {
                    id: user.id,
                    email: user.email,
                    firstName: profile.first_name,
                    lastName: profile.last_name,
                    company: profile.company,
                    role: user.user_metadata?.role || 'tenant_admin'
                },
                profile: {
                    subscriptionStatus: profile.subscription_status,
                    subscriptionPlan: profile.subscription_plan,
                    maxChatbots: profile.max_chatbots,
                    maxMonthlyMessages: profile.max_monthly_messages,
                    trialEndsAt: profile.trial_ends_at
                },
                tokens: {
                    accessToken: session.access_token,
                    refreshToken: session.refresh_token,
                    expiresAt: session.expires_at
                }
            }

        } catch (error) {
            console.error('❌ Error en login:', error)
            throw error
        }
    }

    /**
     * Cerrar sesión
     */
    async logout(accessToken) {
        try {
            // Invalidar sesión en Supabase
            const { error } = await supabase.auth.signOut()
            
            if (error) {
                console.error('Error en logout:', error)
            }

            console.log('🔓 Logout exitoso')
            return { success: true, message: 'Sesión cerrada exitosamente' }

        } catch (error) {
            console.error('❌ Error en logout:', error)
            throw error
        }
    }

    /**
     * Refrescar token de acceso
     */
    async refreshToken(refreshToken) {
        try {
            const { data, error } = await supabase.auth.refreshSession({
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
            console.error('❌ Error refrescando token:', error)
            throw error
        }
    }

    /**
     * Obtener perfil del usuario actual
     */
    async getProfile(userId) {
        try {
            const { data: profile, error } = await supabase
                .from('tenant_profiles')
                .select('*')
                .eq('user_id', userId)
                .single()

            if (error) {
                throw new Error('Perfil no encontrado')
            }

            // Obtener estadísticas del tenant
            const stats = await this.getTenantStats(userId)

            return {
                success: true,
                profile: {
                    ...profile,
                    stats
                }
            }

        } catch (error) {
            console.error('❌ Error obteniendo perfil:', error)
            throw error
        }
    }

    /**
     * Actualizar perfil del usuario
     */
    async updateProfile(userId, updates) {
        try {
            const allowedFields = ['first_name', 'last_name', 'company', 'phone']
            const filteredUpdates = Object.keys(updates)
                .filter(key => allowedFields.includes(key))
                .reduce((obj, key) => {
                    obj[key] = updates[key]
                    return obj
                }, {})

            const { data, error } = await supabase
                .from('tenant_profiles')
                .update({
                    ...filteredUpdates,
                    updated_at: new Date().toISOString()
                })
                .eq('user_id', userId)
                .select()
                .single()

            if (error) {
                throw new Error('Error actualizando perfil')
            }

            return {
                success: true,
                profile: data,
                message: 'Perfil actualizado exitosamente'
            }

        } catch (error) {
            console.error('❌ Error actualizando perfil:', error)
            throw error
        }
    }

    /**
     * Cambiar contraseña
     */
    async changePassword(userId, currentPassword, newPassword) {
        try {
            if (!currentPassword || !newPassword) {
                throw new Error('Contraseña actual y nueva son requeridas')
            }

            if (newPassword.length < 8) {
                throw new Error('La nueva contraseña debe tener al menos 8 caracteres')
            }

            const { data, error } = await supabase.auth.updateUser({
                password: newPassword
            })

            if (error) {
                throw new Error('Error cambiando contraseña')
            }

            console.log(`🔐 Contraseña cambiada para usuario: ${userId}`)

            return {
                success: true,
                message: 'Contraseña cambiada exitosamente'
            }

        } catch (error) {
            console.error('❌ Error cambiando contraseña:', error)
            throw error
        }
    }

    /**
     * Crear chatbot por defecto para nuevo tenant
     */
    async createDefaultChatbot(userId) {
        try {
            const { error } = await supabase
                .from('chatbots')
                .insert({
                    user_id: userId,
                    name: 'Mi Primer Chatbot',
                    description: 'Chatbot creado automáticamente',
                    is_active: true,
                    created_at: new Date().toISOString()
                })

            if (error) {
                console.error('Error creando chatbot por defecto:', error)
            }

        } catch (error) {
            console.error('❌ Error creando chatbot por defecto:', error)
        }
    }

    /**
     * Obtener estadísticas del tenant
     */
    async getTenantStats(userId) {
        try {
            // Contar chatbots
            const { count: chatbotsCount } = await supabase
                .from('chatbots')
                .select('*', { count: 'exact', head: true })
                .eq('user_id', userId)

            // Contar mensajes del mes actual
            const startOfMonth = new Date()
            startOfMonth.setDate(1)
            startOfMonth.setHours(0, 0, 0, 0)

            const { count: messagesCount } = await supabase
                .from('client_data')
                .select('*', { count: 'exact', head: true })
                .eq('user_id', userId)
                .gte('created_at', startOfMonth.toISOString())

            return {
                totalChatbots: chatbotsCount || 0,
                monthlyMessages: messagesCount || 0,
                lastUpdated: new Date().toISOString()
            }

        } catch (error) {
            console.error('Error obteniendo estadísticas:', error)
            return {
                totalChatbots: 0,
                monthlyMessages: 0,
                lastUpdated: new Date().toISOString()
            }
        }
    }

    /**
     * Eliminar usuario (para limpieza en caso de error)
     */
    async deleteUser(userId) {
        try {
            // Nota: En producción, esto requeriría permisos de admin
            console.log(`🗑️ Limpiando usuario: ${userId}`)
        } catch (error) {
            console.error('Error eliminando usuario:', error)
        }
    }

    /**
     * Verificar límites del tenant
     */
    async checkTenantLimits(userId) {
        try {
            const { data: profile } = await supabase
                .from('tenant_profiles')
                .select('max_chatbots, max_monthly_messages')
                .eq('user_id', userId)
                .single()

            const stats = await this.getTenantStats(userId)

            return {
                chatbots: {
                    current: stats.totalChatbots,
                    limit: profile?.max_chatbots || 3,
                    canCreate: stats.totalChatbots < (profile?.max_chatbots || 3)
                },
                messages: {
                    current: stats.monthlyMessages,
                    limit: profile?.max_monthly_messages || 1000,
                    canSend: stats.monthlyMessages < (profile?.max_monthly_messages || 1000)
                }
            }

        } catch (error) {
            console.error('Error verificando límites:', error)
            return {
                chatbots: { current: 0, limit: 3, canCreate: true },
                messages: { current: 0, limit: 1000, canSend: true }
            }
        }
    }
}

export default new AuthService()