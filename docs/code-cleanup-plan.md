# Plan de Limpieza de Código

## 1. Eliminar Código Redundante

### 1.1 Función normalizeText
- Actualmente duplicada en router.js y data-collection/index.js
- Sugerencia: Mover a utils/text-utils.js y usar la importación existente

### 1.2 Manejo de Respuestas de Formulario
- Código duplicado entre router.js y data-collection/index.js
- Sugerencia: Mantener solo la implementación en router.js ya que ahora maneja todo el flujo

### 1.3 Funciones No Utilizadas
- Remover handleDataCollection de data-collection/index.js
- La funcionalidad ya está integrada en el router

## 2. Optimización de Router

### 2.1 Manejo de Estado
```javascript
// Antes
const currentState = state.getMyState()
if (currentState?.fields) {
    return
}

// Después - más claro y directo
if (state.getMyState()?.fields) {
    return // Captura de datos en progreso
}
```

### 2.2 Validación de Respuestas
```javascript
// Antes
const isValid = await FormFieldsService.validateField(
    input,
    currentField.validation_type
)
if (!isValid) {
    await flowDynamic('❌ Respuesta no válida.')
    return fallBack(currentField.field_label)
}

// Después - manejo más robusto
try {
    if (!await FormFieldsService.validateField(input, currentField.validation_type)) {
        await flowDynamic('❌ Respuesta no válida.')
        return fallBack(currentField.field_label)
    }
} catch (error) {
    console.error('Error de validación:', error)
    return fallBack(currentField.field_label)
}
```

### 2.3 Manejo de Errores
```javascript
// Antes - errores dispersos
} catch (validationError) {
    console.error('Error en validación:', validationError)
    await flowDynamic('❌ Error validando respuesta')
    return fallBack(currentField.field_label)
}

// Después - centralizado
const handleError = async (error, state, flowDynamic, fallBack) => {
    console.error('Error:', error)
    await flowDynamic('❌ ' + (error.userMessage || 'Ocurrió un error'))
    return fallBack?.(state?.fields?.[state?.currentField]?.field_label)
}
```

## 3. Optimización de DataCollection

### 3.1 Limpieza de data-collection/index.js
- Remover código duplicado de manejo de formularios
- Mantener solo la configuración inicial del flujo
- Eliminar funciones no utilizadas

### 3.2 Estructura Propuesta
```javascript
// data-collection/index.js
export const createDataCollectionFlow = async () => {
    try {
        const chatbot = await ChatbotService.getActiveChatbotForPort()
        if (!chatbot) {
            console.log('❌ No se encontró chatbot activo')
            return null
        }

        const [formMessages, formFields] = await Promise.all([
            FormMessagesService.getFormMessages(chatbot.id),
            FormFieldsService.getFormFields(chatbot.id)
        ])

        if (!formMessages?.trigger_words?.length || !formFields?.length) {
            console.log('❌ Configuración incompleta')
            return null
        }

        return {
            messages: formMessages,
            fields: formFields.sort((a, b) => a.order_index - b.order_index)
        }
    } catch (error) {
        console.error('Error:', error)
        return null
    }
}
```

## 4. Beneficios de la Optimización

1. **Mantenibilidad Mejorada**
   - Código más limpio y centralizado
   - Menos duplicación
   - Mejor organización de responsabilidades

2. **Mejor Manejo de Errores**
   - Errores centralizados y consistentes
   - Mejor experiencia de usuario
   - Logs más claros

3. **Rendimiento**
   - Menos código duplicado en memoria
   - Menos procesamiento redundante
   - Mejor gestión de recursos

4. **Escalabilidad**
   - Más fácil de mantener y extender
   - Estructura más clara para nuevas funcionalidades
   - Mejor separación de responsabilidades

## 5. Pasos de Implementación

1. Crear utilidades compartidas (normalizeText, handleError)
2. Limpiar data-collection/index.js
3. Actualizar router.js con optimizaciones
4. Probar cada cambio individualmente
5. Verificar funcionalidad completa