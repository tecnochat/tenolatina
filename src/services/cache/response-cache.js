import { createClient } from '@supabase/supabase-js'
import { CONFIG } from '../../config/constants.js'
import { normalizeText } from '../../flows/dynamic/index.js'

class ResponseCacheService {
    constructor() {
        // No inicializar Supabase en el constructor
        // this.TTL = 3 * 60 // 3 minutos // 24 * 60 * 60 // 24 horas en segundos // this.TTL = 30 // 30 segundos directamente
        this.SIMILARITY_THRESHOLD = 0.85 // Umbral de similitud para considerar cache hit
        this.cache = new Map() // Usar un cache en memoria mientras no haya conexión a Supabase
    }

    /**
     * Inicializa la conexión con Supabase
     */
    async init() {
        if (!this.supabase && process.env.SUPABASE_URL && process.env.SUPABASE_KEY) {
            this.supabase = createClient(
                process.env.SUPABASE_URL,
                process.env.SUPABASE_KEY
            )
        }
    }

    /**
     * Genera una clave única para el caché
     */
    _generateCacheKey(chatbotId, message) {
        return `${chatbotId}-${normalizeText(message)}`
    }

    /**
     * Obtiene una respuesta cacheada si existe
     */
    async get(chatbotId, message) {
        try {
            await this.init()
            const cacheKey = this._generateCacheKey(chatbotId, message)

            // Intentar obtener de cache en memoria primero
            const memoryCache = this.cache.get(cacheKey)
            if (memoryCache) {
                const { response, timestamp } = memoryCache
                if ((Date.now() - timestamp) / 1000 < this.TTL) {
                    return response
                }
                this.cache.delete(cacheKey)
            }
            
            // Si tenemos Supabase configurado, intentar obtener de ahí
            if (this.supabase) {
                const { data, error } = await this.supabase
                    .from('response_cache')
                    .select('response, created_at')
                    .eq('cache_key', cacheKey)
                    .single()

                if (error) {
                    console.error('Error al obtener caché:', error)
                    return null
                }

                if (!data) return null

                // Verificar TTL
                const now = new Date()
                const created = new Date(data.created_at)
                if ((now - created) / 1000 > this.TTL) {
                    // Caché expirado, eliminar entrada
                    await this.delete(cacheKey)
                    return null
                }

                // Guardar en cache de memoria también
                this.cache.set(cacheKey, {
                    response: data.response,
                    timestamp: Date.now()
                })

                return data.response
            }

            return null
        } catch (error) {
            console.error('Error en caché get:', error)
            return null
        }
    }

    /**
     * Guarda una respuesta en caché
     */
    async set(chatbotId, message, response) {
        try {
            await this.init()
            const cacheKey = this._generateCacheKey(chatbotId, message)
            
            // Guardar en cache de memoria
            this.cache.set(cacheKey, {
                response,
                timestamp: Date.now()
            })

            // Si tenemos Supabase configurado, guardar ahí también
            if (this.supabase) {
                const { error } = await this.supabase
                    .from('response_cache')
                    .upsert({
                        cache_key: cacheKey,
                        chatbot_id: chatbotId,
                        original_message: message,
                        response: response,
                        created_at: new Date().toISOString()
                    })

                if (error) {
                    console.error('Error al guardar caché:', error)
                }
            }
        } catch (error) {
            console.error('Error en caché set:', error)
        }
    }

    /**
     * Elimina una entrada específica del caché
     */
    async delete(cacheKey) {
        try {
            // Eliminar de cache en memoria
            this.cache.delete(cacheKey)

            // Si tenemos Supabase configurado, eliminar de ahí también
            if (this.supabase) {
                await this.supabase
                    .from('response_cache')
                    .delete()
                    .eq('cache_key', cacheKey)
            }
        } catch (error) {
            console.error('Error eliminando caché:', error)
        }
    }

    /**
     * Limpia entradas expiradas del caché
     */
    async cleanup() {
        try {
            const now = Date.now()

            // Limpiar cache en memoria
            for (const [key, value] of this.cache.entries()) {
                if ((now - value.timestamp) / 1000 > this.TTL) {
                    this.cache.delete(key)
                }
            }

            // Si tenemos Supabase configurado, limpiar ahí también
            if (this.supabase) {
                const expirationDate = new Date()
                expirationDate.setSeconds(expirationDate.getSeconds() - this.TTL)

                await this.supabase
                    .from('response_cache')
                    .delete()
                    .lt('created_at', expirationDate.toISOString())
            }
        } catch (error) {
            console.error('Error en limpieza de caché:', error)
        }
    }
}

// Exportar instancia única
export const ResponseCache = new ResponseCacheService()