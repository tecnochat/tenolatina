/**
 * Rutas de Gestión de Tenants para TecnoBot SAAS
 * Maneja la creación, actualización y administración de tenants
 */

const express = require('express');
const { body, param, validationResult } = require('express-validator');
const { authService } = require('../services/auth');
const { tenantService } = require('../services/tenant');
const { tenantIsolationMiddleware, userTenantPermissionMiddleware, requireRole, requirePermission } = require('../middleware/tenant-isolation');
const logger = require('../utils/logger-saas');

const router = express.Router();

// Middleware de autenticación para todas las rutas
router.use(authService.authMiddleware());

// Validadores
const createTenantValidation = [
    body('name')
        .trim()
        .isLength({ min: 2, max: 100 })
        .withMessage('El nombre debe tener entre 2 y 100 caracteres'),
    body('slug')
        .trim()
        .isLength({ min: 2, max: 50 })
        .matches(/^[a-z0-9-]+$/)
        .withMessage('El slug solo puede contener letras minúsculas, números y guiones'),
    body('planType')
        .optional()
        .isIn(['free', 'basic', 'pro', 'enterprise'])
        .withMessage('Tipo de plan inválido'),
    body('company')
        .optional()
        .trim()
        .isLength({ max: 100 })
        .withMessage('El nombre de la empresa no puede exceder 100 caracteres'),
    body('phone')
        .optional()
        .isMobilePhone('any')
        .withMessage('Número de teléfono válido es requerido'),
    body('website')
        .optional()
        .isURL()
        .withMessage('URL del sitio web válida es requerida')
];

const updateTenantValidation = [
    body('name')
        .optional()
        .trim()
        .isLength({ min: 2, max: 100 })
        .withMessage('El nombre debe tener entre 2 y 100 caracteres'),
    body('settings')
        .optional()
        .isObject()
        .withMessage('Settings debe ser un objeto válido')
];

const inviteUserValidation = [
    body('email')
        .isEmail()
        .normalizeEmail()
        .withMessage('Email válido es requerido'),
    body('role')
        .isIn(['admin', 'editor', 'viewer'])
        .withMessage('Rol inválido')
];

const tenantIdValidation = [
    param('tenantId')
        .isUUID()
        .withMessage('ID de tenant inválido')
];

const userIdValidation = [
    param('userId')
        .isUUID()
        .withMessage('ID de usuario inválido')
];

// Middleware para manejar errores de validación
const handleValidationErrors = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            error: 'Datos de entrada inválidos',
            code: 'VALIDATION_ERROR',
            details: errors.array()
        });
    }
    next();
};

/**
 * @swagger
 * /api/tenants:
 *   post:
 *     summary: Crear nuevo tenant
 *     tags: [Tenants]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - slug
 *             properties:
 *               name:
 *                 type: string
 *                 minLength: 2
 *                 maxLength: 100
 *               slug:
 *                 type: string
 *                 pattern: '^[a-z0-9-]+$'
 *                 minLength: 2
 *                 maxLength: 50
 *               planType:
 *                 type: string
 *                 enum: [free, basic, pro, enterprise]
 *               company:
 *                 type: string
 *                 maxLength: 100
 *               phone:
 *                 type: string
 *               website:
 *                 type: string
 *                 format: uri
 *     responses:
 *       201:
 *         description: Tenant creado exitosamente
 *       400:
 *         description: Datos inválidos
 *       409:
 *         description: Slug ya existe
 */
router.post('/', createTenantValidation, handleValidationErrors, async (req, res) => {
    try {
        const tenant = await tenantService.createTenant(req.user.id, req.body);
        
        logger.info('Tenant creado exitosamente', {
            tenantId: tenant.id,
            userId: req.user.id,
            tenantName: tenant.name,
            slug: tenant.slug
        });
        
        res.status(201).json({
            success: true,
            message: 'Tenant creado exitosamente',
            data: tenant
        });
        
    } catch (error) {
        logger.error('Error creando tenant:', error, {
            userId: req.user.id,
            requestData: req.body
        });
        
        if (error.message.includes('ya está en uso') || error.message.includes('already exists')) {
            return res.status(409).json({
                error: 'Slug ya existe',
                code: 'SLUG_ALREADY_EXISTS',
                message: 'El slug especificado ya está en uso'
            });
        }
        
        res.status(400).json({
            error: 'Error creando tenant',
            code: 'TENANT_CREATION_ERROR',
            message: error.message
        });
    }
});

/**
 * @swagger
 * /api/tenants/{tenantId}:
 *   get:
 *     summary: Obtener información del tenant
 *     tags: [Tenants]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: tenantId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Información del tenant
 *       403:
 *         description: Sin permisos
 *       404:
 *         description: Tenant no encontrado
 */
router.get('/:tenantId', tenantIdValidation, handleValidationErrors, tenantIsolationMiddleware, userTenantPermissionMiddleware, requirePermission('tenant:read'), async (req, res) => {
    try {
        const tenant = await tenantService.getTenant(req.params.tenantId);
        
        res.json({
            success: true,
            data: tenant
        });
        
    } catch (error) {
        logger.error('Error obteniendo tenant:', error, {
            tenantId: req.params.tenantId,
            userId: req.user.id
        });
        
        if (error.message.includes('no encontrado') || error.message.includes('not found')) {
            return res.status(404).json({
                error: 'Tenant no encontrado',
                code: 'TENANT_NOT_FOUND',
                message: 'El tenant especificado no existe'
            });
        }
        
        res.status(500).json({
            error: 'Error interno del servidor',
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Error obteniendo información del tenant'
        });
    }
});

/**
 * @swagger
 * /api/tenants/{tenantId}:
 *   put:
 *     summary: Actualizar tenant
 *     tags: [Tenants]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: tenantId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 minLength: 2
 *                 maxLength: 100
 *               settings:
 *                 type: object
 *     responses:
 *       200:
 *         description: Tenant actualizado exitosamente
 *       403:
 *         description: Sin permisos
 *       404:
 *         description: Tenant no encontrado
 */
router.put('/:tenantId', tenantIdValidation, updateTenantValidation, handleValidationErrors, tenantIsolationMiddleware, userTenantPermissionMiddleware, requirePermission('tenant:write'), async (req, res) => {
    try {
        const tenant = await tenantService.updateTenant(req.params.tenantId, req.body, req.user.id);
        
        logger.info('Tenant actualizado exitosamente', {
            tenantId: req.params.tenantId,
            userId: req.user.id,
            updatedFields: Object.keys(req.body)
        });
        
        res.json({
            success: true,
            message: 'Tenant actualizado exitosamente',
            data: tenant
        });
        
    } catch (error) {
        logger.error('Error actualizando tenant:', error, {
            tenantId: req.params.tenantId,
            userId: req.user.id,
            requestData: req.body
        });
        
        if (error.message.includes('no encontrado') || error.message.includes('not found')) {
            return res.status(404).json({
                error: 'Tenant no encontrado',
                code: 'TENANT_NOT_FOUND',
                message: 'El tenant especificado no existe'
            });
        }
        
        if (error.message.includes('permisos')) {
            return res.status(403).json({
                error: 'Sin permisos',
                code: 'INSUFFICIENT_PERMISSIONS',
                message: error.message
            });
        }
        
        res.status(400).json({
            error: 'Error actualizando tenant',
            code: 'TENANT_UPDATE_ERROR',
            message: error.message
        });
    }
});

/**
 * @swagger
 * /api/tenants/{tenantId}/plan:
 *   put:
 *     summary: Cambiar plan del tenant
 *     tags: [Tenants]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: tenantId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - planType
 *             properties:
 *               planType:
 *                 type: string
 *                 enum: [free, basic, pro, enterprise]
 *     responses:
 *       200:
 *         description: Plan cambiado exitosamente
 *       403:
 *         description: Sin permisos (solo owner)
 */
router.put('/:tenantId/plan', tenantIdValidation, handleValidationErrors, tenantIsolationMiddleware, userTenantPermissionMiddleware, requireRole('owner'), async (req, res) => {
    try {
        const { planType } = req.body;
        
        if (!planType || !['free', 'basic', 'pro', 'enterprise'].includes(planType)) {
            return res.status(400).json({
                error: 'Tipo de plan inválido',
                code: 'INVALID_PLAN_TYPE',
                message: 'Debe especificar un tipo de plan válido'
            });
        }
        
        const tenant = await tenantService.changePlan(req.params.tenantId, planType, req.user.id);
        
        logger.info('Plan del tenant cambiado exitosamente', {
            tenantId: req.params.tenantId,
            newPlanType: planType,
            userId: req.user.id
        });
        
        res.json({
            success: true,
            message: 'Plan cambiado exitosamente',
            data: tenant
        });
        
    } catch (error) {
        logger.error('Error cambiando plan del tenant:', error, {
            tenantId: req.params.tenantId,
            planType: req.body.planType,
            userId: req.user.id
        });
        
        res.status(400).json({
            error: 'Error cambiando plan',
            code: 'PLAN_CHANGE_ERROR',
            message: error.message
        });
    }
});

/**
 * @swagger
 * /api/tenants/{tenantId}/users:
 *   get:
 *     summary: Obtener usuarios del tenant
 *     tags: [Tenants]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: tenantId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Lista de usuarios del tenant
 *       403:
 *         description: Sin permisos
 */
router.get('/:tenantId/users', tenantIdValidation, handleValidationErrors, tenantIsolationMiddleware, userTenantPermissionMiddleware, requirePermission('users:read'), async (req, res) => {
    try {
        const users = await tenantService.getTenantUsers(req.params.tenantId, req.user.id);
        
        res.json({
            success: true,
            data: users
        });
        
    } catch (error) {
        logger.error('Error obteniendo usuarios del tenant:', error, {
            tenantId: req.params.tenantId,
            userId: req.user.id
        });
        
        res.status(500).json({
            error: 'Error interno del servidor',
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Error obteniendo usuarios del tenant'
        });
    }
});

/**
 * @swagger
 * /api/tenants/{tenantId}/users/invite:
 *   post:
 *     summary: Invitar usuario al tenant
 *     tags: [Tenants]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: tenantId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - role
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               role:
 *                 type: string
 *                 enum: [admin, editor, viewer]
 *     responses:
 *       201:
 *         description: Usuario invitado exitosamente
 *       403:
 *         description: Sin permisos
 *       409:
 *         description: Usuario ya es miembro
 */
router.post('/:tenantId/users/invite', tenantIdValidation, inviteUserValidation, handleValidationErrors, tenantIsolationMiddleware, userTenantPermissionMiddleware, requirePermission('users:write'), async (req, res) => {
    try {
        const { email, role } = req.body;
        
        const invitation = await tenantService.inviteUser(req.params.tenantId, email, role, req.user.id);
        
        logger.info('Usuario invitado al tenant exitosamente', {
            tenantId: req.params.tenantId,
            invitedEmail: email,
            role,
            invitedByUserId: req.user.id
        });
        
        res.status(201).json({
            success: true,
            message: 'Usuario invitado exitosamente',
            data: invitation
        });
        
    } catch (error) {
        logger.error('Error invitando usuario al tenant:', error, {
            tenantId: req.params.tenantId,
            email: req.body.email,
            role: req.body.role,
            userId: req.user.id
        });
        
        if (error.message.includes('no encontrado') || error.message.includes('not found')) {
            return res.status(404).json({
                error: 'Usuario no encontrado',
                code: 'USER_NOT_FOUND',
                message: 'No existe un usuario registrado con ese email'
            });
        }
        
        if (error.message.includes('ya es miembro') || error.message.includes('already member')) {
            return res.status(409).json({
                error: 'Usuario ya es miembro',
                code: 'USER_ALREADY_MEMBER',
                message: 'El usuario ya es miembro de este tenant'
            });
        }
        
        res.status(400).json({
            error: 'Error invitando usuario',
            code: 'USER_INVITATION_ERROR',
            message: error.message
        });
    }
});

/**
 * @swagger
 * /api/tenants/{tenantId}/users/{userId}:
 *   delete:
 *     summary: Remover usuario del tenant
 *     tags: [Tenants]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: tenantId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Usuario removido exitosamente
 *       403:
 *         description: Sin permisos
 *       404:
 *         description: Usuario no encontrado
 */
router.delete('/:tenantId/users/:userId', tenantIdValidation, userIdValidation, handleValidationErrors, tenantIsolationMiddleware, userTenantPermissionMiddleware, requirePermission('users:delete'), async (req, res) => {
    try {
        await tenantService.removeUser(req.params.tenantId, req.params.userId, req.user.id);
        
        logger.info('Usuario removido del tenant exitosamente', {
            tenantId: req.params.tenantId,
            removedUserId: req.params.userId,
            removedByUserId: req.user.id
        });
        
        res.json({
            success: true,
            message: 'Usuario removido exitosamente'
        });
        
    } catch (error) {
        logger.error('Error removiendo usuario del tenant:', error, {
            tenantId: req.params.tenantId,
            userId: req.params.userId,
            removedByUserId: req.user.id
        });
        
        if (error.message.includes('no puede removerse') || error.message.includes('cannot remove')) {
            return res.status(403).json({
                error: 'Operación no permitida',
                code: 'OPERATION_NOT_ALLOWED',
                message: error.message
            });
        }
        
        res.status(400).json({
            error: 'Error removiendo usuario',
            code: 'USER_REMOVAL_ERROR',
            message: error.message
        });
    }
});

/**
 * @swagger
 * /api/tenants/{tenantId}/stats:
 *   get:
 *     summary: Obtener estadísticas del tenant
 *     tags: [Tenants]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: tenantId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Estadísticas del tenant
 *       403:
 *         description: Sin permisos
 */
router.get('/:tenantId/stats', tenantIdValidation, handleValidationErrors, tenantIsolationMiddleware, userTenantPermissionMiddleware, requirePermission('analytics:read'), async (req, res) => {
    try {
        const stats = await tenantService.getTenantStats(req.params.tenantId, req.user.id);
        
        res.json({
            success: true,
            data: stats
        });
        
    } catch (error) {
        logger.error('Error obteniendo estadísticas del tenant:', error, {
            tenantId: req.params.tenantId,
            userId: req.user.id
        });
        
        res.status(500).json({
            error: 'Error interno del servidor',
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Error obteniendo estadísticas del tenant'
        });
    }
});

module.exports = router;