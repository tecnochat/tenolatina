/**
 * Servicio JWT para Multi-Tenant
 * 
 * Maneja la generación y validación de tokens JWT con información de tenant
 */

import jwt from 'jsonwebtoken'
import { logger } from '../utils/logger.js'

class JWTService {
    constructor() {
        this.secret = process.env.JWT_SECRET || 'your-super-secret-jwt-key'
        this.accessTokenExpiry = '24h'
        this.refreshTokenExpiry = '7d'
    }

    /**
     * Generar tokens de acceso y refresh
     */
    generateTokens(payload) {
        try {
            const accessToken = jwt.sign(
                {
                    sub: payload.userId,
                    tenant_id: payload.tenantId,
                    email: payload.email,
                    role: payload.role,
                    type: 'access'
                },
                this.secret,
                { expiresIn: this.accessTokenExpiry }
            )

            const refreshToken = jwt.sign(
                {
                    sub: payload.userId,
                    tenant_id: payload.tenantId,
                    type: 'refresh'
                },
                this.secret,
                { expiresIn: this.refreshTokenExpiry }
            )

            return {
                accessToken,
                refreshToken,
                expiresIn: this.accessTokenExpiry
            }
        } catch (error) {
            logger.error('Error generando tokens JWT:', error)
            throw new Error('Error generando tokens')
        }
    }

    /**
     * Verificar y decodificar token
     */
    verifyToken(token) {
        try {
            const decoded = jwt.verify(token, this.secret)
            return {
                valid: true,
                payload: decoded
            }
        } catch (error) {
            logger.warn('Token JWT inválido:', error.message)
            return {
                valid: false,
                error: error.message
            }
        }
    }

    /**
     * Refrescar token de acceso
     */
    refreshAccessToken(refreshToken) {
        try {
            const decoded = jwt.verify(refreshToken, this.secret)
            
            if (decoded.type !== 'refresh') {
                throw new Error('Token de refresh inválido')
            }

            const newAccessToken = jwt.sign(
                {
                    sub: decoded.sub,
                    tenant_id: decoded.tenant_id,
                    type: 'access'
                },
                this.secret,
                { expiresIn: this.accessTokenExpiry }
            )

            return {
                accessToken: newAccessToken,
                expiresIn: this.accessTokenExpiry
            }
        } catch (error) {
            logger.error('Error refrescando token:', error)
            throw new Error('Token de refresh inválido')
        }
    }

    /**
     * Extraer información del token sin verificar (para debugging)
     */
    decodeToken(token) {
        try {
            return jwt.decode(token)
        } catch (error) {
            logger.error('Error decodificando token:', error)
            return null
        }
    }
}

export default new JWTService()