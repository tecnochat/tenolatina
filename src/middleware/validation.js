/**
 * Middleware de validación para la API
 * Proporciona validaciones comunes y esquemas reutilizables
 */

const { body, param, query, validationResult } = require('express-validator');
const { AppError } = require('../utils/errors');

/**
 * Middleware para manejar errores de validación
 */
const handleValidationErrors = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        const errorMessages = errors.array().map(error => ({
            field: error.path || error.param,
            message: error.msg,
            value: error.value
        }));
        
        return next(new AppError('Validation failed', 400, {
            errors: errorMessages
        }));
    }
    next();
};

/**
 * Validaciones comunes
 */
const commonValidations = {
    // UUID validation
    uuid: (field, optional = false) => {
        const validator = param(field).isUUID().withMessage(`${field} must be a valid UUID`);
        return optional ? validator.optional() : validator;
    },

    // Email validation
    email: (field = 'email', optional = false) => {
        const validator = body(field)
            .isEmail()
            .withMessage('Must be a valid email address')
            .normalizeEmail();
        return optional ? validator.optional() : validator;
    },

    // Password validation
    password: (field = 'password', optional = false) => {
        const validator = body(field)
            .isLength({ min: 8 })
            .withMessage('Password must be at least 8 characters long')
            .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
            .withMessage('Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character');
        return optional ? validator.optional() : validator;
    },

    // String validation
    string: (field, minLength = 1, maxLength = 255, optional = false) => {
        const validator = body(field)
            .isString()
            .withMessage(`${field} must be a string`)
            .trim()
            .isLength({ min: minLength, max: maxLength })
            .withMessage(`${field} must be between ${minLength} and ${maxLength} characters`);
        return optional ? validator.optional() : validator;
    },

    // Integer validation
    integer: (field, min = 0, max = Number.MAX_SAFE_INTEGER, optional = false) => {
        const validator = body(field)
            .isInt({ min, max })
            .withMessage(`${field} must be an integer between ${min} and ${max}`);
        return optional ? validator.optional() : validator;
    },

    // Boolean validation
    boolean: (field, optional = false) => {
        const validator = body(field)
            .isBoolean()
            .withMessage(`${field} must be a boolean`);
        return optional ? validator.optional() : validator;
    },

    // Array validation
    array: (field, minLength = 0, maxLength = 100, optional = false) => {
        const validator = body(field)
            .isArray({ min: minLength, max: maxLength })
            .withMessage(`${field} must be an array with ${minLength} to ${maxLength} items`);
        return optional ? validator.optional() : validator;
    },

    // JSON validation
    json: (field, optional = false) => {
        const validator = body(field)
            .custom((value) => {
                if (typeof value === 'object' && value !== null) {
                    return true;
                }
                if (typeof value === 'string') {
                    try {
                        JSON.parse(value);
                        return true;
                    } catch (e) {
                        throw new Error('Must be valid JSON');
                    }
                }
                throw new Error('Must be a valid JSON object');
            });
        return optional ? validator.optional() : validator;
    },

    // URL validation
    url: (field, optional = false) => {
        const validator = body(field)
            .isURL({
                protocols: ['http', 'https'],
                require_protocol: true
            })
            .withMessage(`${field} must be a valid URL`);
        return optional ? validator.optional() : validator;
    },

    // Phone validation
    phone: (field, optional = false) => {
        const validator = body(field)
            .isMobilePhone('any', { strictMode: false })
            .withMessage(`${field} must be a valid phone number`);
        return optional ? validator.optional() : validator;
    },

    // Pagination validation
    pagination: () => [
        query('page')
            .optional()
            .isInt({ min: 1 })
            .withMessage('Page must be a positive integer')
            .toInt(),
        query('limit')
            .optional()
            .isInt({ min: 1, max: 100 })
            .withMessage('Limit must be between 1 and 100')
            .toInt(),
        query('sort')
            .optional()
            .isString()
            .withMessage('Sort must be a string'),
        query('order')
            .optional()
            .isIn(['asc', 'desc'])
            .withMessage('Order must be asc or desc')
    ]
};

/**
 * Esquemas de validación específicos
 */
const validationSchemas = {
    // Auth schemas
    register: [
        commonValidations.email(),
        commonValidations.password(),
        commonValidations.string('full_name', 2, 100),
        commonValidations.string('company_name', 2, 100, true),
        body('plan')
            .optional()
            .isIn(['free', 'pro', 'enterprise'])
            .withMessage('Plan must be free, pro, or enterprise'),
        handleValidationErrors
    ],

    login: [
        commonValidations.email(),
        body('password')
            .notEmpty()
            .withMessage('Password is required'),
        handleValidationErrors
    ],

    resetPassword: [
        commonValidations.email(),
        handleValidationErrors
    ],

    changePassword: [
        body('current_password')
            .notEmpty()
            .withMessage('Current password is required'),
        commonValidations.password('new_password'),
        handleValidationErrors
    ],

    // Chatbot schemas
    createChatbot: [
        commonValidations.string('name', 2, 100),
        commonValidations.string('description', 0, 500, true),
        commonValidations.phone('phone_number'),
        commonValidations.string('whatsapp_business_account_id', 10, 100, true),
        commonValidations.boolean('is_active', true),
        commonValidations.json('settings', true),
        handleValidationErrors
    ],

    updateChatbot: [
        commonValidations.uuid('id'),
        commonValidations.string('name', 2, 100, true),
        commonValidations.string('description', 0, 500, true),
        commonValidations.phone('phone_number', true),
        commonValidations.string('whatsapp_business_account_id', 10, 100, true),
        commonValidations.boolean('is_active', true),
        commonValidations.json('settings', true),
        handleValidationErrors
    ],

    // Flow schemas
    createFlow: [
        commonValidations.uuid('chatbot_id'),
        commonValidations.string('name', 2, 100),
        commonValidations.string('description', 0, 500, true),
        commonValidations.string('trigger_type', 2, 50),
        commonValidations.array('trigger_keywords', 0, 20, true),
        commonValidations.json('flow_data'),
        commonValidations.boolean('is_active', true),
        commonValidations.integer('priority', 0, 100, true),
        handleValidationErrors
    ],

    updateFlow: [
        commonValidations.uuid('id'),
        commonValidations.string('name', 2, 100, true),
        commonValidations.string('description', 0, 500, true),
        commonValidations.string('trigger_type', 2, 50, true),
        commonValidations.array('trigger_keywords', 0, 20, true),
        commonValidations.json('flow_data', true),
        commonValidations.boolean('is_active', true),
        commonValidations.integer('priority', 0, 100, true),
        handleValidationErrors
    ],

    // Welcome schemas
    createWelcome: [
        commonValidations.uuid('chatbot_id'),
        commonValidations.string('name', 2, 100),
        commonValidations.string('message', 1, 1000),
        commonValidations.string('message_type', 2, 20),
        commonValidations.json('media_data', true),
        commonValidations.boolean('is_active', true),
        commonValidations.integer('priority', 0, 100, true),
        handleValidationErrors
    ],

    updateWelcome: [
        commonValidations.uuid('id'),
        commonValidations.string('name', 2, 100, true),
        commonValidations.string('message', 1, 1000, true),
        commonValidations.string('message_type', 2, 20, true),
        commonValidations.json('media_data', true),
        commonValidations.boolean('is_active', true),
        commonValidations.integer('priority', 0, 100, true),
        handleValidationErrors
    ],

    // AI schemas
    updateAIConfig: [
        commonValidations.uuid('chatbot_id'),
        commonValidations.string('provider', 2, 50, true),
        commonValidations.string('model', 2, 100, true),
        commonValidations.string('api_key', 10, 500, true),
        body('temperature')
            .optional()
            .isFloat({ min: 0, max: 2 })
            .withMessage('Temperature must be between 0 and 2'),
        commonValidations.integer('max_tokens', 1, 8000, true),
        commonValidations.string('system_prompt', 0, 2000, true),
        commonValidations.boolean('is_active', true),
        handleValidationErrors
    ],

    // Team schemas
    inviteTeamMember: [
        commonValidations.email(),
        body('role')
            .isIn(['admin', 'member', 'viewer'])
            .withMessage('Role must be admin, member, or viewer'),
        commonValidations.array('permissions', 0, 50, true),
        commonValidations.string('message', 0, 500, true),
        handleValidationErrors
    ],

    updateTeamMember: [
        commonValidations.uuid('memberId'),
        body('role')
            .optional()
            .isIn(['admin', 'member', 'viewer'])
            .withMessage('Role must be admin, member, or viewer'),
        commonValidations.array('permissions', 0, 50, true),
        body('status')
            .optional()
            .isIn(['active', 'inactive', 'suspended'])
            .withMessage('Status must be active, inactive, or suspended'),
        handleValidationErrors
    ],

    // Webhook schemas
    updateWebhookConfig: [
        commonValidations.boolean('webhooks_enabled', true),
        commonValidations.string('verify_token', 10, 100, true),
        commonValidations.boolean('signature_verification', true),
        commonValidations.array('ip_whitelist', 0, 20, true),
        commonValidations.integer('rate_limit', 1, 1000, true),
        handleValidationErrors
    ],

    // Contact/Newsletter schemas
    contact: [
        commonValidations.string('name', 2, 100),
        commonValidations.email(),
        commonValidations.string('subject', 5, 200),
        commonValidations.string('message', 10, 1000),
        commonValidations.string('company', 2, 100, true),
        handleValidationErrors
    ],

    newsletter: [
        commonValidations.email(),
        commonValidations.string('name', 2, 100, true),
        handleValidationErrors
    ],

    demoRequest: [
        commonValidations.string('name', 2, 100),
        commonValidations.email(),
        commonValidations.string('company', 2, 100),
        commonValidations.phone('phone', true),
        commonValidations.string('use_case', 10, 500),
        body('preferred_date')
            .optional()
            .isISO8601()
            .withMessage('Preferred date must be a valid ISO 8601 date'),
        handleValidationErrors
    ]
};

/**
 * Middleware para validar parámetros de ruta UUID
 */
const validateUUIDParam = (paramName) => [
    commonValidations.uuid(paramName),
    handleValidationErrors
];

/**
 * Middleware para validar query parameters de paginación
 */
const validatePagination = [
    ...commonValidations.pagination(),
    handleValidationErrors
];

/**
 * Middleware para validar filtros de fecha
 */
const validateDateFilters = [
    query('start_date')
        .optional()
        .isISO8601()
        .withMessage('Start date must be a valid ISO 8601 date'),
    query('end_date')
        .optional()
        .isISO8601()
        .withMessage('End date must be a valid ISO 8601 date')
        .custom((value, { req }) => {
            if (req.query.start_date && value && new Date(value) <= new Date(req.query.start_date)) {
                throw new Error('End date must be after start date');
            }
            return true;
        }),
    handleValidationErrors
];

/**
 * Middleware para validar filtros de analytics
 */
const validateAnalyticsFilters = [
    query('period')
        .optional()
        .isIn(['today', 'yesterday', '7days', '30days', '90days', 'custom'])
        .withMessage('Period must be one of: today, yesterday, 7days, 30days, 90days, custom'),
    query('metrics')
        .optional()
        .custom((value) => {
            if (typeof value === 'string') {
                const metrics = value.split(',');
                const validMetrics = ['messages', 'conversations', 'users', 'flows', 'ai_requests'];
                const invalidMetrics = metrics.filter(m => !validMetrics.includes(m.trim()));
                if (invalidMetrics.length > 0) {
                    throw new Error(`Invalid metrics: ${invalidMetrics.join(', ')}`);
                }
            }
            return true;
        }),
    ...validateDateFilters.slice(0, -1), // Exclude handleValidationErrors
    handleValidationErrors
];

/**
 * Middleware para sanitizar entrada
 */
const sanitizeInput = (req, res, next) => {
    // Sanitizar strings para prevenir XSS
    const sanitizeString = (str) => {
        if (typeof str !== 'string') return str;
        return str
            .replace(/<script[^>]*>.*?<\/script>/gi, '')
            .replace(/<[^>]*>/g, '')
            .trim();
    };

    const sanitizeObject = (obj) => {
        if (obj === null || typeof obj !== 'object') return obj;
        
        if (Array.isArray(obj)) {
            return obj.map(sanitizeObject);
        }

        const sanitized = {};
        for (const [key, value] of Object.entries(obj)) {
            if (typeof value === 'string') {
                sanitized[key] = sanitizeString(value);
            } else if (typeof value === 'object') {
                sanitized[key] = sanitizeObject(value);
            } else {
                sanitized[key] = value;
            }
        }
        return sanitized;
    };

    req.body = sanitizeObject(req.body);
    req.query = sanitizeObject(req.query);
    req.params = sanitizeObject(req.params);

    next();
};

module.exports = {
    handleValidationErrors,
    commonValidations,
    validationSchemas,
    validateUUIDParam,
    validatePagination,
    validateDateFilters,
    validateAnalyticsFilters,
    sanitizeInput
};