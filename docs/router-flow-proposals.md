# Propuestas de Router Flow

## Propuesta 1: "Message Router Flow"

Un flujo simple que actúa como router central:

```javascript
// Router Flow
const routerFlow = addKeyword([])
.addAction(async (ctx, { flowDynamic, endFlow }) => {
    // 1. Check Welcome
    const isFirstMessage = await checkWelcome()
    if (isFirstMessage) {
        return handleWelcome()
    }

    // 2. Check Dynamic Keywords
    const matchingFlow = await checkKeywords(message)
    if (matchingFlow) {
        return handleDynamic(matchingFlow)
    }

    // 3. Process with AI
    return handleAI(message)
})
```

### Ventajas
- Simple y directo
- Sin carga inicial de keywords
- Consultas en tiempo real
- Mantiene flujos existentes

### Desventajas
- Todo en un solo flujo
- Manejo de errores más complejo

## Propuesta 2: "Event Based Router"

Sistema basado en eventos para procesar mensajes:

```javascript
// Event Router
const eventRouter = addKeyword([])
.addAction(async (ctx) => {
    const messageEvent = new MessageEvent(ctx)
    
    // 1. Welcome Check Event
    await messageEvent.emit('welcome_check')
    if (messageEvent.handled) return
    
    // 2. Dynamic Check Event
    await messageEvent.emit('keyword_check')
    if (messageEvent.handled) return
    
    // 3. AI Process Event
    await messageEvent.emit('ai_process')
})
```

### Ventajas
- Desacoplado
- Fácil de extender
- Manejo de errores por evento
- Sin conflictos entre flujos

### Desventajas
- Más complejo de implementar
- Overhead de eventos

## Propuesta 3: "Command Router Flow"

Sistema basado en comandos para dirigir mensajes:

```javascript
// Command Router
const commandRouter = addKeyword([])
.addAction(async (ctx) => {
    // 1. Determine Command
    const command = await determineCommand(ctx)
    
    // 2. Execute Handler
    switch (command) {
        case 'WELCOME':
            return executeWelcome()
        case 'DYNAMIC':
            return executeDynamic()
        case 'AI':
            return executeAI()
    }
})
```

### Ventajas
- Control explícito
- Fácil de debuggear
- Flujo claro
- Sin carga inicial

### Desventajas
- Más código boilerplate
- Lógica de comandos adicional

## Características Comunes

1. **Sin Carga Inicial**
   - Ninguna propuesta carga keywords al inicio
   - Todas consultan en tiempo real

2. **Flujos Existentes**
   - Mantienen welcome, dynamic y AI
   - No interfieren con la funcionalidad actual

3. **Proceso Secuencial**
   - Welcome → Dynamic → AI
   - Orden claro de ejecución

4. **Consultas en Tiempo Real**
   - Keywords consultadas por demanda
   - Sin caché de respuestas

## Recomendación

La **Propuesta 1** parece la más adecuada porque:
- Es la más simple de implementar
- Mantiene la funcionalidad existente
- Resuelve el problema de keywords
- Menor complejidad de mantenimiento

¿Procedemos con la implementación de alguna de estas propuestas?