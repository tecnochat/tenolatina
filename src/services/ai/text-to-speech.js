import { TextToSpeechClient } from '@google-cloud/text-to-speech'
import fs from 'fs'
import path from 'path'
import dotenv from 'dotenv'
import { memoryManager } from '../../utils/memory-manager.js'

dotenv.config()

class TextToSpeechService {
    constructor() {
        try {
            // Verificar API habilitada
            if (!process.env.GOOGLE_PROJECT_ID) {
                throw new Error('GOOGLE_PROJECT_ID no configurado')
            }

            // Verificación detallada de credenciales
            console.log('🔍 Verificando credenciales de Google Cloud...')
            console.log('Project ID:', process.env.GOOGLE_PROJECT_ID)
            console.log('Client Email:', process.env.GOOGLE_CLIENT_EMAIL)
            console.log('Private Key present:', !!process.env.GOOGLE_PRIVATE_KEY)

            // Crear cliente con más opciones de configuración
            this.client = new TextToSpeechClient({
                projectId: process.env.GOOGLE_PROJECT_ID,
                credentials: {
                    client_email: process.env.GOOGLE_CLIENT_EMAIL,
                    private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
                },
            })

            // Configuración para optimización de audio
            this.MAX_TEXT_LENGTH = 3000 // Limitar longitud del texto
            this.CHUNK_SIZE = 1000 // Tamaño de chunks para textos largos
            
            console.log('✅ TextToSpeechService inicializado para proyecto:', process.env.GOOGLE_PROJECT_ID)
        } catch (error) {
            console.error('❌ Error inicializando TextToSpeechService:', {
                message: error.message,
                reason: error.reason || 'UNKNOWN',
                project: process.env.GOOGLE_PROJECT_ID
            })
            throw error
        }
    }

    /**
     * Divide el texto en chunks más pequeños si es necesario
     */
    splitTextIntoChunks(text) {
        if (text.length <= this.CHUNK_SIZE) {
            return [text]
        }

        const chunks = []
        let currentChunk = ''
        const sentences = text.split(/[.!?]+\s/g)

        for (const sentence of sentences) {
            if ((currentChunk + sentence).length > this.CHUNK_SIZE) {
                if (currentChunk) {
                    chunks.push(currentChunk.trim())
                    currentChunk = ''
                }
            }
            currentChunk += sentence + '. '
        }

        if (currentChunk) {
            chunks.push(currentChunk.trim())
        }

        return chunks
    }

    async convertToSpeech(text) {
        let audioPath = null
        try {
            // Verificar que el servicio esté listo
            if (!this.client) {
                throw new Error('TextToSpeechClient no inicializado')
            }

            // Limitar longitud del texto
            if (text.length > this.MAX_TEXT_LENGTH) {
                text = text.substring(0, this.MAX_TEXT_LENGTH) + '...'
            }

            console.log('🗣️ Iniciando conversión de texto a voz...')
            console.log('📝 Texto a convertir:', text.substring(0, 100))

            // Dividir texto en chunks si es necesario
            const textChunks = this.splitTextIntoChunks(text)
            
            // Verificar directorio temporal
            const tmpDir = path.join(process.cwd(), 'tmp')
            if (!fs.existsSync(tmpDir)) {
                console.log('📁 Creando directorio temporal:', tmpDir)
                fs.mkdirSync(tmpDir, { recursive: true })
            }

            audioPath = path.join(tmpDir, `response_${Date.now()}.mp3`)
            
            // Registrar archivo temporal
            memoryManager.trackTmpFile(audioPath)
            
            // Procesar cada chunk
            const audioBuffers = []
            for (const chunk of textChunks) {
                const request = {
                    input: { text: chunk },
                    voice: {
                        languageCode: 'es-US',
                        name: 'es-US-Standard-B',
                        ssmlGender: 'MALE'
                    },
                    audioConfig: {
                        audioEncoding: 'MP3',
                        pitch: 0,
                        speakingRate: 1,
                        sampleRateHertz: 16000,
                        effectsProfileId: ['small-bluetooth-speaker-class-device']
                    }
                }

                console.log('🔄 Solicitando síntesis de voz para chunk...')
                const [response] = await this.client.synthesizeSpeech(request)
                audioBuffers.push(response.audioContent)

                // Liberar buffer después de cada chunk
                if (global.gc) {
                    global.gc()
                }
            }

            // Combinar todos los buffers
            const finalBuffer = Buffer.concat(audioBuffers)
            await fs.promises.writeFile(audioPath, finalBuffer)

            // Limpiar buffers individuales
            audioBuffers.length = 0
            if (global.gc) {
                global.gc()
            }

            // Verificar que el archivo existe y tiene contenido
            const stats = await fs.promises.stat(audioPath)
            console.log('📊 Tamaño del archivo:', stats.size, 'bytes')
            
            return audioPath

        } catch (error) {
            console.error('❌ Error en text-to-speech:', error)
            // Si hay error de permisos, dar instrucciones claras
            if (error?.code === 7) {
                console.error('🔐 Error de permisos en Google Cloud:', {
                    project: process.env.GOOGLE_PROJECT_ID,
                    api: 'texttospeech.googleapis.com',
                    solution: 'Habilitar API en: https://console.cloud.google.com/apis/library/texttospeech.googleapis.com'
                })
            }
            // Asegurar limpieza en caso de error
            if (audioPath) {
                await memoryManager.cleanupTmpFile(audioPath)
            }
            throw error
        }
    }
}

export default new TextToSpeechService()
