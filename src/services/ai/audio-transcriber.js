import OpenAI from 'openai'
import fs from 'fs'
import path from 'path'
import { downloadMediaMessage, downloadContentFromMessage } from '@whiskeysockets/baileys'
import { memoryManager } from '../../utils/memory-manager.js'

class AudioTranscriber {
    constructor() {
        this.openai = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY
        })
        this.MAX_AUDIO_SIZE = 25 * 1024 * 1024 // 25MB máximo
    }

    async transcribeAudio(ctx, provider) {
        let audioPath = null
        try {
            console.log('🎤 Iniciando transcripción de audio')
            
            // Crear directorio temporal si no existe
            const tmpDir = path.join(process.cwd(), 'tmp')
            if (!fs.existsSync(tmpDir)) {
                fs.mkdirSync(tmpDir, { recursive: true })
            }

            // Obtener el mensaje de audio
            const audioMessage = ctx.message?.audioMessage || ctx.message?.pttMessage
            if (!audioMessage) {
                throw new Error('No audio message found')
            }

            console.log('📥 Descargando audio...', {
                mimetype: audioMessage.mimetype,
                seconds: audioMessage.seconds,
                ptt: audioMessage.ptt
            })

            let buffer = Buffer.from([])
            try {
                // Descargar el contenido del audio usando downloadContentFromMessage
                const stream = await downloadContentFromMessage(audioMessage, 'audio')
                for await (const chunk of stream) {
                    buffer = Buffer.concat([buffer, chunk])
                    
                    // Verificar tamaño durante la descarga
                    if (buffer.length > this.MAX_AUDIO_SIZE) {
                        throw new Error('Audio file too large')
                    }
                }
            } catch (downloadError) {
                console.error('Error downloading audio:', downloadError)
                throw new Error('Failed to download audio content')
            }

            // Liberar memoria del buffer anterior si existe
            if (global.gc) {
                global.gc()
            }

            // Generar nombre único para el archivo
            audioPath = path.join(tmpDir, `audio_${Date.now()}.ogg`)
            
            // Registrar archivo temporal
            memoryManager.trackTmpFile(audioPath)

            try {
                // Guardar el buffer como archivo
                await fs.promises.writeFile(audioPath, buffer)
                console.log('📥 Audio guardado temporalmente:', audioPath)

                // Limpiar buffer para liberar memoria
                buffer = null
                if (global.gc) {
                    global.gc()
                }

                // Transcribir el audio
                const transcription = await this.openai.audio.transcriptions.create({
                    file: fs.createReadStream(audioPath),
                    model: "whisper-1",
                    language: "es"
                })

                console.log('✅ Audio transcrito exitosamente')
                return transcription.text

            } finally {
                // Limpiar archivo temporal
                await memoryManager.cleanupTmpFile(audioPath)
            }
        } catch (error) {
            console.error('❌ Error en transcripción:', error)
            // Asegurar limpieza en caso de error
            if (audioPath) {
                await memoryManager.cleanupTmpFile(audioPath)
            }
            throw error
        }
    }
}

export default new AudioTranscriber()
