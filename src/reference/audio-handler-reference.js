import { addKeyword, EVENTS } from '@builderbot/bot';
import { downloadFileBaileys } from './downloader.js';
import { transcribeAudio, chatAudio, getUserHistory, saveUserHistory } from './openai.js';
import { removeFile } from './remover.js';

/**
 * Código de referencia del proyecto anterior
 * Este archivo sirve como documentación y guía para la implementación
 * del manejo de audio en el proyecto actual
 */

const audioHandlerReference = {
    // Flujo principal de audio
    voiceFlow: addKeyword(EVENTS.VOICE_NOTE)
        .addAction(async (ctx, ctxFn) => {
            try {
                // 1. Descarga del archivo de audio
                const fileInfo = await downloadFileBaileys(ctx);
                if (!fileInfo?.filePath) throw new Error("No se pudo descargar el audio");

                await ctxFn.flowDynamic("Procesando tu mensaje de voz, por favor espera...");

                // 2. Transcripción del mensaje de voz
                const transcript = await transcribeAudio(fileInfo.filePath);
                if (!transcript) throw new Error("No se pudo transcribir el audio");

                // 3. Manejo del historial de conversaciones
                const userId = ctx.from;
                const userHistory = getUserHistory(userId);
                const fullConversation = `${userHistory.map(entry => 
                    `${entry.sender}: ${entry.message}`).join('\n')}\nUsuario: ${transcript}`;

                // 4. Guardar la transcripción en el historial
                await saveUserHistory(userId, [
                    ...userHistory, 
                    { sender: 'user', message: transcript }
                ]);

                // 5. Generar respuesta usando el historial y la transcripción
                const response = await chatAudio(transcript, userId);

                // 6. Limpieza de archivos temporales
                await removeFile(fileInfo.filePath);
                if (fileInfo.fileOldPath) await removeFile(fileInfo.fileOldPath);

                // 7. Enviar respuesta al usuario
                await ctxFn.flowDynamic(response);
            } catch (error) {
                console.error("Error en voiceFlow:", error);
                await ctxFn.flowDynamic(
                    "Lo siento, hubo un error al procesar tu mensaje de voz. " +
                    "Por favor, intenta con un mensaje más corto o envía tu consulta por texto."
                );
            }
            return ctxFn.endFlow();
        }),

    // Funciones auxiliares
    downloadHelper: async (ctx) => {
        const buffer = await downloadMediaMessage(ctx, 'buffer', {});
        const tmpDir = path.join(process.cwd(), 'public');
        if (!fs.existsSync(tmpDir)) {
            fs.mkdirSync(tmpDir, { recursive: true });
        }

        const fileName = `file-${Date.now()}.ogg`;
        const filePath = path.join(tmpDir, fileName);
        await fs.promises.writeFile(filePath, buffer);

        const finalFilePath = await convertAudio(filePath, 'mp3');
        return {
            fileName: path.basename(finalFilePath),
            fileOldPath: filePath,
            filePath: finalFilePath,
            fileBuffer: await fs.promises.readFile(finalFilePath),
            extension: 'mp3',
        };
    },

    // Funciones de OpenAI
    transcribeAudioHelper: async (filePath) => {
        const transcription = await openai.audio.transcriptions.create({
            file: fs.createReadStream(filePath),
            model: "whisper-1",
        });
        return transcription.text;
    }
};

export default audioHandlerReference;
