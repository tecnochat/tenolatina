# Implementación del Message Router

## Problema Original
El sistema tenía varios desafíos:
1. Keywords cargadas al inicio no se actualizaban
2. Welcome y AI no funcionaban en secuencia
3. Flujos con conflictos de prioridad

## Solución Implementada

### 1. Message Router Flow
Se implementó un router central que maneja todos los mensajes:

```javascript
const routerFlow = addKeyword([])
.addAction(async (ctx, { flowDynamic, endFlow }) => {
    // Procesar mensaje en secuencia
    await handleWelcome()    // Sin return
    await handleDynamic()    // Con return si hay match
    await handleAI()         // Si no hubo match
})
```

### 2. Procesamiento Secuencial

#### Welcome Handler
```javascript
const handleWelcome = async (chatbot, phoneNumber, flowDynamic) => {
    // Verificar si es primer contacto
    const shouldSendWelcome = await WelcomeService.trackWelcomeMessage()
    if (shouldSendWelcome) {
        await flowDynamic(welcomeMessage)
        // No hay return - continúa el flujo
    }
}
```

#### Dynamic Handler
```javascript
const handleDynamic = async (chatbot, phoneNumber, message, flowDynamic) => {
    // Buscar coincidencia en tiempo real
    const flows = await FlowService.getActiveFlows()
    const matchingFlow = flows?.find(flow => 
        flow.keyword?.some(k => normalizeText(k) === message)
    )

    if (matchingFlow) {
        await flowDynamic(response)
        return true // Termina el flujo si hay match
    }
    return false
}
```

#### AI Handler
```javascript
const handleAI = async (chatbot, phoneNumber, message, flowDynamic) => {
    // Procesar con IA si no hubo match
    const aiResponse = await OpenAIService.generateChatResponse()
    await flowDynamic(aiResponse)
}
```

### 3. Mejoras Implementadas

#### Sin Carga Inicial
- No se cargan keywords al inicio
- Cada mensaje consulta keywords en tiempo real
- Siempre datos actualizados de la DB

#### Secuencia Welcome + Respuesta
- Welcome se envía sin terminar el flujo
- El mensaje original se procesa inmediatamente
- Usuario recibe contexto + respuesta específica

#### Sin Conflictos
- Un solo flujo maneja todo
- Prioridades claras y secuenciales
- Sin competencia entre flujos

### 4. Casos de Uso

#### Primer Contacto con Keyword
```
Usuario: "precios"
Bot: [Mensaje de bienvenida con info general]
Bot: [Respuesta específica sobre precios]
```

#### Primer Contacto sin Keyword
```
Usuario: "quiero información"
Bot: [Mensaje de bienvenida con info general]
Bot: [Respuesta de IA sobre información]
```

#### Contacto Existente
```
Usuario: "horarios"
Bot: [Respuesta específica sobre horarios]
```

### 5. Ventajas

1. **Mantenibilidad**
   - Código más limpio y organizado
   - Funciones separadas por responsabilidad
   - Fácil de extender

2. **Performance**
   - Sin carga inicial de datos
   - Consultas optimizadas
   - Mejor uso de memoria

3. **Experiencia de Usuario**
   - Respuestas más naturales
   - Contexto + información específica
   - Sin duplicación de mensajes

4. **Actualizaciones en Tiempo Real**
   - Keywords siempre actualizadas
   - No requiere reinicio
   - Cambios inmediatos

### 6. Mantenimiento

#### Agregar Nuevas Keywords
1. Insertar en la base de datos
2. Disponible inmediatamente
3. No requiere cambios en código

#### Modificar Welcome
1. Actualizar mensaje en DB
2. Se aplica en siguiente mensaje
3. No requiere reinicio

#### Ajustar IA
1. Modificar prompts
2. Cambios inmediatos
3. Mantiene contexto

### 7. Logging y Debugging

```javascript
console.log('📩 Mensaje recibido de:', phoneNumber)
console.log('👋 Enviando welcome a:', phoneNumber)
console.log('✨ Coincidencia encontrada:', matchingFlow.id)
console.log('🤖 Procesando con IA:', message)
```

Facilita el seguimiento del flujo de mensajes y la detección de problemas.