# Integración del Flujo DataCollection

Este documento describe la implementación correcta para integrar el flujo DataCollection con consulta en tiempo real.

## 1. Sistema de Consulta en Tiempo Real

### 1.1 Implementación Base

```javascript
// En el flujo Dynamic (referencia de implementación funcional)
const flows = await FlowService.getActiveFlows(chatbot.id)
const matchingFlow = flows?.find(flow => 
    flow.keyword?.some(k => normalizeText(k) === normalizeText(message))
)
```

### 1.2 Caché para Optimización

```javascript
const cacheKey = `active_flows_${chatbot.id}`
const cached = await ResponseCache.get(chatbot.id, cacheKey)
if (cached) return cached

const flows = await FlowService.getActiveFlows(chatbot.id)
if (flows) {
    await ResponseCache.set(chatbot.id, cacheKey, flows)
}
```

## 2. Integración en Router

### 2.1 Helper Integrado

```javascript
// Helper para manejar keywords de ambos flujos
const handleKeywordFlows = async (chatbot, phoneNumber, message, flowDynamic, state) => {
    // 1. Verificar Dynamic primero
    const flows = await FlowService.getActiveFlows(chatbot.id)
    const matchingFlow = flows?.find(flow => 
        flow.keyword?.some(k => normalizeText(k) === normalizeText(message))
    )

    if (matchingFlow) {
        console.log('✨ Coincidencia encontrada en Dynamic')
        // [Código de manejo de Dynamic]
        return { type: 'dynamic' }
    }

    // 2. Verificar DataCollection
    const [formMessages, formFields] = await Promise.all([
        FormMessagesService.getFormMessages(chatbot.id),
        FormFieldsService.getFormFields(chatbot.id)
    ])

    const triggerWords = formMessages?.trigger_words || []
    const isDataCollectionTrigger = triggerWords.some(
        word => normalizeText(word) === normalizeText(message)
    )

    if (isDataCollectionTrigger && formMessages && formFields?.length > 0) {
        console.log('📝 Coincidencia encontrada en DataCollection')
        
        // Inicializar flujo de captura
        const sortedFields = formFields.sort((a, b) => a.order_index - b.order_index)
        await state.update({
            currentField: 0,
            fields: sortedFields,
            answers: {},
            messages: formMessages
        })

        await flowDynamic(formMessages.welcome_message)
        await flowDynamic(sortedFields[0].field_label)
        
        return { type: 'datacollection' }
    }

    return { type: 'none' }
}
```

### 2.2 Implementación en el Router Principal

```javascript
// En createRouterFlow
.addAction(async (ctx, { flowDynamic, endFlow, state }) => {
    // ... código inicial ...

    const result = await handleKeywordFlows(chatbot, phoneNumber, message, flowDynamic, state)
    if (result.type === 'dynamic') {
        return endFlow()
    }
    if (result.type === 'datacollection') {
        return // Mantener flujo activo para captura
    }

    // Si no hay match, proceder con IA
    await handleAI(chatbot, phoneNumber, message, flowDynamic)
})
```

## 3. Manejo de Respuestas

```javascript
.addAnswer('', { capture: true }, async (ctx, { fallBack, state, endFlow, flowDynamic }) => {
    const currentState = state.getMyState()
    if (!currentState?.fields) {
        return // No hay captura activa
    }

    // Proceso de captura
    const currentField = currentState.fields[currentState.currentField]
    const input = ctx.body.trim()

    if (input.toLowerCase() === 'cancelar') {
        await flowDynamic(currentState.messages.cancel_message)
        await state.clear()
        return endFlow()
    }

    // Validar y guardar respuesta
    const isValid = await FormFieldsService.validateField(
        input,
        currentField.validation_type
    )

    if (!isValid) {
        return fallBack('❌ Respuesta no válida. Intenta nuevamente.')
    }

    currentState.answers[currentField.field_name] = input

    // Siguiente campo o finalizar
    if (currentState.currentField < currentState.fields.length - 1) {
        currentState.currentField++
        await state.update(currentState)
        return fallBack(currentState.fields[currentState.currentField].field_label)
    }

    // Guardar datos finales
    await ClientDataService.createClientData(/* ... */)
    await flowDynamic(currentState.messages.success_message)
    await state.clear()
})
```

## 4. Puntos Clave

1. **Orden de Verificación**: Siempre verificar Dynamic antes que DataCollection
2. **Estado del Flujo**: No terminar el flujo cuando se activa DataCollection
3. **Manejo de Estado**: Usar state.update() para mantener el progreso
4. **Validación**: Validar cada respuesta antes de proceder
5. **Finalización**: Limpiar el estado solo después de completar o cancelar

## 5. Consideraciones

- Mantener el código de manejo de respuestas separado del router principal
- Usar el sistema de caché para optimizar consultas frecuentes
- Manejar errores en cada paso del proceso
- No permitir que la IA responda durante la captura de datos