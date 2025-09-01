/**
 * Utilidades para manipulación de texto
 */

/**
 * Normaliza un texto removiendo acentos, espacios extra y convirtiendo a minúsculas
 * @param {string} text - Texto a normalizar
 * @returns {string} Texto normalizado
 */
export const normalizeText = (text) => {
    if (!text) return '';
    return text.toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
}