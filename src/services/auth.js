/**
 * Servicio de Autenticación para TecnoBot SAAS
 * Maneja autenticación JWT, registro, login y gestión de usuarios
 */

const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { createSupabaseClient, createSupabaseAnonClient, handleSupabaseError } = require('../utils/supabase');
const logger = require('../utils/logger-saas');

class AuthService {
    constructor() {
        this.supabase = createSupabaseClient();
        this.supabaseAnon = createSupabaseAnonClient();
        this.jwtSecret = process.env.JWT_SECRET;
        this.jwtExpiresIn = process.env.JWT_EXPIRES_IN || '24h';
        this.refreshTokenExpiresIn = process.env.REFRESH_TOKEN_EXPIRES_IN || '7d';
        
        if (!this.jwtSecret) {
            throw new Error('JWT_SECRET no está configurado en las variables de entorno');
        }
    }
    
    /**
     * Registrar nuevo usuario
     */
    async register(email, password, userData = {}) {
        try {
            // Validar entrada
            if (!email || !password) {
                throw new Error('Email y contraseña son requeridos');
            }
            
            if (password.length < 8) {
                throw new Error('La contraseña debe tener al menos 8 caracteres');
            }
            
            // Registrar usuario en Supabase Auth
            const { data, error } = await this.supabaseAnon.auth.signUp({
                email,
                password,
                options: {
                    data: {
                        full_name: userData.fullName || '',
                        company: userData.company || '',
                        phone: userData.phone || ''
                    }
                }
            });
            
            if (error) {
                throw handleSupabaseError(error, { email });
            }
            
            const user = data.user;
            
            logger.info('Usuario registrado exitosamente', {
                userId: user.id,
                email: user.email
            });
            
            return {
                user: {
                    id: user.id,
                    email: user.email,
                    emailConfirmed: user.email_confirmed_at !== null,
                    createdAt: user.created_at
                },
                needsEmailConfirmation: !user.email_confirmed_at
            };
            
        } catch (error) {
            logger.error('Error en registro de usuario:', error, { email });
            throw error;
        }
    }
    
    /**
     * Iniciar sesión
     */
    async login(email, password) {
        try {
            // Validar entrada
            if (!email || !password) {
                throw new Error('Email y contraseña son requeridos');
            }
            
            // Autenticar con Supabase
            const { data, error } = await this.supabaseAnon.auth.signInWithPassword({
                email,
                password
            });
            
            if (error) {
                throw handleSupabaseError(error, { email });
            }
            
            const user = data.user;
            const session = data.session;
            
            // Generar tokens JWT personalizados
            const accessToken = this.generateAccessToken(user);
            const refreshToken = this.generateRefreshToken(user);
            
            // Obtener tenants del usuario
            const userTenants = await this.getUserTenants(user.id);
            
            logger.info('Usuario autenticado exitosamente', {
                userId: user.id,
                email: user.email,
                tenantsCount: userTenants.length
            });
            
            return {
                user: {
                    id: user.id,
                    email: user.email,
                    fullName: user.user_metadata?.full_name || '',
                    company: user.user_metadata?.company || '',
                    phone: user.user_metadata?.phone || '',
                    emailConfirmed: user.email_confirmed_at !== null,
                    lastSignIn: user.last_sign_in_at
                },
                tokens: {
                    accessToken,
                    refreshToken,
                    supabaseToken: session.access_token,
                    expiresIn: this.jwtExpiresIn
                },
                tenants: userTenants
            };
            
        } catch (error) {
            logger.error('Error en login:', error, { email });
            throw error;
        }
    }
    
    /**
     * Cerrar sesión
     */
    async logout(token) {
        try {
            // Verificar token
            const decoded = jwt.verify(token, this.jwtSecret);
            
            // Cerrar sesión en Supabase
            await this.supabase.auth.signOut();
            
            logger.info('Usuario cerró sesión', {
                userId: decoded.sub
            });
            
            return { success: true };
            
        } catch (error) {
            logger.error('Error en logout:', error);
            throw error;
        }
    }
    
    /**
     * Refrescar token
     */
    async refreshToken(refreshToken) {
        try {
            // Verificar refresh token
            const decoded = jwt.verify(refreshToken, this.jwtSecret);
            
            if (decoded.type !== 'refresh') {
                throw new Error('Token de refresh inválido');
            }
            
            // Obtener usuario actualizado
            const { data: user, error } = await this.supabase.auth.getUser();
            
            if (error || !user) {
                throw new Error('Usuario no encontrado');
            }
            
            // Generar nuevos tokens
            const newAccessToken = this.generateAccessToken(user.user);
            const newRefreshToken = this.generateRefreshToken(user.user);
            
            logger.debug('Token refrescado exitosamente', {
                userId: user.user.id
            });
            
            return {
                accessToken: newAccessToken,
                refreshToken: newRefreshToken,
                expiresIn: this.jwtExpiresIn
            };
            
        } catch (error) {
            logger.error('Error refrescando token:', error);
            throw error;
        }
    }
    
    /**
     * Verificar token de acceso
     */
    async verifyAccessToken(token) {
        try {
            const decoded = jwt.verify(token, this.jwtSecret);
            
            if (decoded.type !== 'access') {
                throw new Error('Tipo de token inválido');
            }
            
            // Verificar que el usuario aún existe y está activo
            const { data: user, error } = await this.supabase
                .from('auth.users')
                .select('id, email, email_confirmed_at, banned_until')
                .eq('id', decoded.sub)
                .single();
            
            if (error || !user) {
                throw new Error('Usuario no encontrado');
            }
            
            if (user.banned_until && new Date(user.banned_until) > new Date()) {
                throw new Error('Usuario suspendido');
            }
            
            return {
                valid: true,
                user: {
                    id: user.id,
                    email: user.email,
                    emailConfirmed: user.email_confirmed_at !== null
                },
                decoded
            };
            
        } catch (error) {
            logger.debug('Token inválido:', error.message);
            return {
                valid: false,
                error: error.message
            };
        }
    }
    
    /**
     * Solicitar restablecimiento de contraseña
     */
    async requestPasswordReset(email) {
        try {
            const { error } = await this.supabaseAnon.auth.resetPasswordForEmail(email, {
                redirectTo: `${process.env.FRONTEND_URL}/reset-password`
            });
            
            if (error) {
                throw handleSupabaseError(error, { email });
            }
            
            logger.info('Solicitud de restablecimiento de contraseña enviada', { email });
            
            return { success: true };
            
        } catch (error) {
            logger.error('Error solicitando restablecimiento de contraseña:', error, { email });
            throw error;
        }
    }
    
    /**
     * Restablecer contraseña
     */
    async resetPassword(token, newPassword) {
        try {
            if (!newPassword || newPassword.length < 8) {
                throw new Error('La nueva contraseña debe tener al menos 8 caracteres');
            }
            
            const { error } = await this.supabaseAnon.auth.updateUser({
                password: newPassword
            });
            
            if (error) {
                throw handleSupabaseError(error);
            }
            
            logger.info('Contraseña restablecida exitosamente');
            
            return { success: true };
            
        } catch (error) {
            logger.error('Error restableciendo contraseña:', error);
            throw error;
        }
    }
    
    /**
     * Obtener tenants del usuario
     */
    async getUserTenants(userId) {
        try {
            const { data, error } = await this.supabase
                .from('tenant_users')
                .select(`
                    role,
                    is_active,
                    tenants (
                        id,
                        name,
                        slug,
                        plan_type,
                        subscription_status,
                        is_active
                    )
                `)
                .eq('user_id', userId)
                .eq('is_active', true);
            
            if (error) {
                throw handleSupabaseError(error, { userId });
            }
            
            return data.map(item => ({
                id: item.tenants.id,
                name: item.tenants.name,
                slug: item.tenants.slug,
                role: item.role,
                planType: item.tenants.plan_type,
                subscriptionStatus: item.tenants.subscription_status,
                isActive: item.tenants.is_active
            }));
            
        } catch (error) {
            logger.error('Error obteniendo tenants del usuario:', error, { userId });
            throw error;
        }
    }
    
    /**
     * Generar token de acceso JWT
     */
    generateAccessToken(user) {
        return jwt.sign(
            {
                sub: user.id,
                email: user.email,
                type: 'access',
                iat: Math.floor(Date.now() / 1000)
            },
            this.jwtSecret,
            { expiresIn: this.jwtExpiresIn }
        );
    }
    
    /**
     * Generar token de refresh JWT
     */
    generateRefreshToken(user) {
        return jwt.sign(
            {
                sub: user.id,
                type: 'refresh',
                iat: Math.floor(Date.now() / 1000)
            },
            this.jwtSecret,
            { expiresIn: this.refreshTokenExpiresIn }
        );
    }
    
    /**
     * Middleware de autenticación
     */
    authMiddleware() {
        return async (req, res, next) => {
            try {
                const authHeader = req.headers.authorization;
                
                if (!authHeader || !authHeader.startsWith('Bearer ')) {
                    return res.status(401).json({
                        error: 'Token de autorización requerido',
                        code: 'MISSING_AUTH_TOKEN'
                    });
                }
                
                const token = authHeader.substring(7);
                const verification = await this.verifyAccessToken(token);
                
                if (!verification.valid) {
                    return res.status(401).json({
                        error: 'Token inválido o expirado',
                        code: 'INVALID_TOKEN',
                        details: verification.error
                    });
                }
                
                // Agregar usuario al request
                req.user = verification.user;
                req.tokenData = verification.decoded;
                
                next();
                
            } catch (error) {
                logger.error('Error en middleware de autenticación:', error);
                return res.status(500).json({
                    error: 'Error interno del servidor',
                    code: 'INTERNAL_SERVER_ERROR'
                });
            }
        };
    }
    
    /**
     * Middleware opcional de autenticación (no falla si no hay token)
     */
    optionalAuthMiddleware() {
        return async (req, res, next) => {
            try {
                const authHeader = req.headers.authorization;
                
                if (authHeader && authHeader.startsWith('Bearer ')) {
                    const token = authHeader.substring(7);
                    const verification = await this.verifyAccessToken(token);
                    
                    if (verification.valid) {
                        req.user = verification.user;
                        req.tokenData = verification.decoded;
                    }
                }
                
                next();
                
            } catch (error) {
                logger.debug('Error en middleware de autenticación opcional:', error);
                next(); // Continuar sin autenticación
            }
        };
    }
}

// Instancia singleton
const authService = new AuthService();

module.exports = {
    AuthService,
    authService
};