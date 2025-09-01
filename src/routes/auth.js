import express from 'express'
import { AuthService } from '../services/auth-service.js'
import { AppConfig } from '../config/app-config.js'
import { SupabaseError } from '../config/supabase.js'
import rateLimit from 'express-rate-limit'

const router = express.Router()
const authService = new AuthService()

// Rate limiting específico para autenticación
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 10, // máximo 10 intentos por IP
    message: {
        error: 'Demasiados intentos de autenticación',
        message: 'Has excedido el límite de intentos. Intenta de nuevo en 15 minutos.'
    },
    standardHeaders: true,
    legacyHeaders: false
})

// Rate limiting más estricto para login
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 5, // máximo 5 intentos de login por IP
    message: {
        error: 'Demasiados intentos de login',
        message: 'Has excedido el límite de intentos de login. Intenta de nuevo en 15 minutos.'
    }
})

/**
 * @route POST /api/auth/register
 * @desc Registrar nuevo usuario/tenant
 * @access Public
 */
router.post('/register', authLimiter, async (req, res) => {
    try {
        const { email, password, firstName, lastName, companyName, plan = 'free' } = req.body

        // Validaciones básicas
        if (!email || !password || !firstName || !lastName) {
            return res.status(400).json({
                error: 'Datos requeridos faltantes',
                message: 'Email, contraseña, nombre y apellido son requeridos'
            })
        }

        // Validar formato de email
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
        if (!emailRegex.test(email)) {
            return res.status(400).json({
                error: 'Email inválido',
                message: 'Por favor ingresa un email válido'
            })
        }

        // Validar fortaleza de contraseña
        if (password.length < 8) {
            return res.status(400).json({
                error: 'Contraseña débil',
                message: 'La contraseña debe tener al menos 8 caracteres'
            })
        }

        // Validar plan
        if (!AppConfig.plans[plan]) {
            return res.status(400).json({
                error: 'Plan inválido',
                message: 'El plan seleccionado no existe'
            })
        }

        const result = await authService.register({
            email,
            password,
            firstName,
            lastName,
            companyName,
            plan
        })

        res.status(201).json({
            success: true,
            message: 'Usuario registrado exitosamente',
            data: {
                user: result.user,
                tenant: result.tenant,
                defaultChatbot: result.defaultChatbot
            }
        })

    } catch (error) {
        console.error('Error en registro:', error)
        
        if (error.message.includes('already registered')) {
            return res.status(409).json({
                error: 'Usuario ya existe',
                message: 'Ya existe una cuenta con este email'
            })
        }

        const formattedError = SupabaseError.formatError(error)
        res.status(500).json({
            error: 'Error en el registro',
            message: formattedError.message,
            details: AppConfig.server.environment === 'development' ? formattedError.details : undefined
        })
    }
})

/**
 * @route POST /api/auth/login
 * @desc Iniciar sesión
 * @access Public
 */
router.post('/login', loginLimiter, async (req, res) => {
    try {
        const { email, password, rememberMe = false } = req.body

        if (!email || !password) {
            return res.status(400).json({
                error: 'Credenciales requeridas',
                message: 'Email y contraseña son requeridos'
            })
        }

        const result = await authService.login(email, password, rememberMe)

        // Configurar cookie segura con el token
        const cookieOptions = {
            httpOnly: true,
            secure: AppConfig.server.environment === 'production',
            sameSite: 'strict',
            maxAge: rememberMe ? 7 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000 // 7 días o 24 horas
        }

        res.cookie('auth_token', result.session.access_token, cookieOptions)

        res.json({
            success: true,
            message: 'Login exitoso',
            data: {
                user: result.user,
                tenant: result.tenant,
                session: {
                    access_token: result.session.access_token,
                    expires_at: result.session.expires_at
                },
                permissions: result.permissions
            }
        })

    } catch (error) {
        console.error('Error en login:', error)
        
        if (error.message.includes('Invalid login credentials')) {
            return res.status(401).json({
                error: 'Credenciales inválidas',
                message: 'Email o contraseña incorrectos'
            })
        }

        if (error.message.includes('too many attempts')) {
            return res.status(429).json({
                error: 'Demasiados intentos',
                message: 'Cuenta bloqueada temporalmente por demasiados intentos fallidos'
            })
        }

        const formattedError = SupabaseError.formatError(error)
        res.status(500).json({
            error: 'Error en el login',
            message: formattedError.message
        })
    }
})

/**
 * @route POST /api/auth/logout
 * @desc Cerrar sesión
 * @access Private
 */
router.post('/logout', async (req, res) => {
    try {
        const token = req.headers.authorization?.replace('Bearer ', '') || req.cookies.auth_token

        if (token) {
            await authService.logout(token)
        }

        // Limpiar cookie
        res.clearCookie('auth_token')

        res.json({
            success: true,
            message: 'Logout exitoso'
        })

    } catch (error) {
        console.error('Error en logout:', error)
        
        // Aunque haya error, limpiar la cookie
        res.clearCookie('auth_token')
        
        res.json({
            success: true,
            message: 'Logout completado'
        })
    }
})

/**
 * @route POST /api/auth/refresh
 * @desc Renovar token de acceso
 * @access Private
 */
router.post('/refresh', async (req, res) => {
    try {
        const { refresh_token } = req.body
        const currentToken = req.headers.authorization?.replace('Bearer ', '') || req.cookies.auth_token

        if (!refresh_token && !currentToken) {
            return res.status(401).json({
                error: 'Token requerido',
                message: 'Se requiere un token de actualización'
            })
        }

        const result = await authService.refreshSession(refresh_token || currentToken)

        // Actualizar cookie
        const cookieOptions = {
            httpOnly: true,
            secure: AppConfig.server.environment === 'production',
            sameSite: 'strict',
            maxAge: 24 * 60 * 60 * 1000 // 24 horas
        }

        res.cookie('auth_token', result.session.access_token, cookieOptions)

        res.json({
            success: true,
            message: 'Token renovado exitosamente',
            data: {
                session: {
                    access_token: result.session.access_token,
                    expires_at: result.session.expires_at
                }
            }
        })

    } catch (error) {
        console.error('Error renovando token:', error)
        
        res.status(401).json({
            error: 'Error renovando token',
            message: 'No se pudo renovar el token de acceso'
        })
    }
})

/**
 * @route GET /api/auth/me
 * @desc Obtener información del usuario actual
 * @access Private
 */
router.get('/me', async (req, res) => {
    try {
        const token = req.headers.authorization?.replace('Bearer ', '') || req.cookies.auth_token

        if (!token) {
            return res.status(401).json({
                error: 'Token requerido',
                message: 'Se requiere autenticación'
            })
        }

        const result = await authService.getCurrentUser(token)

        res.json({
            success: true,
            data: {
                user: result.user,
                tenant: result.tenant,
                permissions: result.permissions,
                usage: result.usage
            }
        })

    } catch (error) {
        console.error('Error obteniendo usuario:', error)
        
        if (SupabaseError.isAuthError(error)) {
            return res.status(401).json({
                error: 'Token inválido',
                message: 'La sesión ha expirado o es inválida'
            })
        }

        res.status(500).json({
            error: 'Error obteniendo usuario',
            message: 'No se pudo obtener la información del usuario'
        })
    }
})

/**
 * @route POST /api/auth/forgot-password
 * @desc Solicitar restablecimiento de contraseña
 * @access Public
 */
router.post('/forgot-password', authLimiter, async (req, res) => {
    try {
        const { email } = req.body

        if (!email) {
            return res.status(400).json({
                error: 'Email requerido',
                message: 'Se requiere un email para restablecer la contraseña'
            })
        }

        await authService.requestPasswordReset(email)

        // Siempre responder exitosamente para evitar enumeración de usuarios
        res.json({
            success: true,
            message: 'Si el email existe, recibirás instrucciones para restablecer tu contraseña'
        })

    } catch (error) {
        console.error('Error en forgot password:', error)
        
        // Siempre responder exitosamente para evitar enumeración de usuarios
        res.json({
            success: true,
            message: 'Si el email existe, recibirás instrucciones para restablecer tu contraseña'
        })
    }
})

/**
 * @route POST /api/auth/reset-password
 * @desc Restablecer contraseña
 * @access Public
 */
router.post('/reset-password', authLimiter, async (req, res) => {
    try {
        const { token, password } = req.body

        if (!token || !password) {
            return res.status(400).json({
                error: 'Datos requeridos',
                message: 'Token y nueva contraseña son requeridos'
            })
        }

        if (password.length < 8) {
            return res.status(400).json({
                error: 'Contraseña débil',
                message: 'La contraseña debe tener al menos 8 caracteres'
            })
        }

        await authService.resetPassword(token, password)

        res.json({
            success: true,
            message: 'Contraseña restablecida exitosamente'
        })

    } catch (error) {
        console.error('Error en reset password:', error)
        
        if (error.message.includes('invalid') || error.message.includes('expired')) {
            return res.status(400).json({
                error: 'Token inválido',
                message: 'El token de restablecimiento es inválido o ha expirado'
            })
        }

        res.status(500).json({
            error: 'Error restableciendo contraseña',
            message: 'No se pudo restablecer la contraseña'
        })
    }
})

/**
 * @route GET /api/auth/verify-email
 * @desc Verificar email de usuario
 * @access Public
 */
router.get('/verify-email', async (req, res) => {
    try {
        const { token } = req.query

        if (!token) {
            return res.status(400).json({
                error: 'Token requerido',
                message: 'Se requiere un token de verificación'
            })
        }

        await authService.verifyEmail(token)

        res.json({
            success: true,
            message: 'Email verificado exitosamente'
        })

    } catch (error) {
        console.error('Error verificando email:', error)
        
        res.status(400).json({
            error: 'Error verificando email',
            message: 'El token de verificación es inválido o ha expirado'
        })
    }
})

export default router