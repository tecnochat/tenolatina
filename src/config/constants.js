export const CONFIG = {
    WELCOME_MESSAGE_EXPIRY: 24 * 60 * 60 * 1000, // 24 hours in milliseconds
    DEFAULT_FLOW_PRIORITY: 0,
    MAX_CHAT_HISTORY: 50, // Maximum number of messages to keep in chat history
    AI_CONFIG: {
        MODEL: 'gpt-3.5-turbo',
        MAX_TOKENS: 200,
        TEMPERATURE: 0.5,
        EMBEDDING_MODEL: 'text-embedding-ada-002'
    },
    RATE_LIMITS: {
        MAX_MESSAGES_PER_MINUTE: 60,
        COOLDOWN_PERIOD: 60 * 1000 // 1 minute in milliseconds
    }
}

export const VALIDATION_PATTERNS = {
    PHONE: /^\+?[1-9]\d{1,14}$/, // International phone number format
    EMAIL: /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
    IDENTIFICATION: /^\d+$/ // Solo números
}

export const TABLES = {
    CHATBOTS: 'chatbots',
    WELCOMES: 'welcomes',
    WELCOME_TRACKING: 'welcome_tracking',
    BOT_FLOWS: 'bot_flows',
    CLIENT_DATA: 'client_data',
    BEHAVIOR_PROMPTS: 'behavior_prompts',
    KNOWLEDGE_PROMPTS: 'knowledge_prompts',
    CHAT_HISTORY: 'chat_history'
}

export const ERROR_MESSAGES = {
    INVALID_PHONE: 'Invalid phone number format',
    INVALID_EMAIL: 'Invalid email format',
    DUPLICATE_ENTRY: 'Record already exists',
    UNAUTHORIZED: 'Unauthorized access',
    RATE_LIMITED: 'Too many requests. Please try again later',
    MISSING_DATA: 'Required data is missing',
    INVALID_FLOW: 'Invalid flow configuration'
} 