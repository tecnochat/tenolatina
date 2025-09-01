import { Router } from 'express'
import { body, param, query, validationResult } from 'express-validator'
import { requirePermission } from '../middleware/rbac.js'
import { createSupabaseClient } from '../config/supabase.js'
import { AppConfig } from '../config/app-config.js'
import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'

const router = Router()

/**
 * GET /api/team/members
 * Obtener todos los miembros del equipo
 */
router.get('/members',
    requirePermission('team', 'read'),
    [
        query('page')
            .optional()
            .isInt({ min: 1 })
            .withMessage('La página debe ser un número entero mayor a 0'),
        query('limit')
            .optional()
            .isInt({ min: 1, max: 100 })
            .withMessage('El límite debe ser entre 1 y 100'),
        query('role')
            .optional()
            .isIn(['owner', 'admin', 'manager', 'operator', 'viewer'])
            .withMessage('Rol inválido'),
        query('status')
            .optional()
            .isIn(['active', 'inactive', 'pending'])
            .withMessage('Estado inválido')
    ],
    async (req, res) => {
        try {
            const errors = validationResult(req)
            if (!errors.isEmpty()) {
                return res.status(400).json({
                    error: 'Datos de entrada inválidos',
                    details: errors.array()
                })
            }

            const supabase = createSupabaseClient(req.tenant.id)
            const { 
                page = 1, 
                limit = 20, 
                role, 
                status 
            } = req.query

            const offset = (page - 1) * limit

            // Construir query
            let query = supabase
                .from('team_members')
                .select(`
                    id,
                    user_id,
                    role,
                    status,
                    permissions,
                    invited_by,
                    invited_at,
                    joined_at,
                    last_active_at,
                    users!inner(
                        id,
                        email,
                        full_name,
                        avatar_url,
                        created_at
                    )
                `, { count: 'exact' })
                .eq('tenant_id', req.tenant.id)
                .order('joined_at', { ascending: false })
                .range(offset, offset + limit - 1)

            // Aplicar filtros
            if (role) {
                query = query.eq('role', role)
            }
            if (status) {
                query = query.eq('status', status)
            }

            const { data: members, error, count } = await query

            if (error) {
                console.error('Error obteniendo miembros del equipo:', error)
                return res.status(500).json({
                    error: 'Error obteniendo miembros del equipo',
                    message: error.message
                })
            }

            // Formatear respuesta
            const formattedMembers = members.map(member => ({
                id: member.id,
                user: {
                    id: member.users.id,
                    email: member.users.email,
                    full_name: member.users.full_name,
                    avatar_url: member.users.avatar_url,
                    created_at: member.users.created_at
                },
                role: member.role,
                status: member.status,
                permissions: member.permissions,
                invited_by: member.invited_by,
                invited_at: member.invited_at,
                joined_at: member.joined_at,
                last_active_at: member.last_active_at
            }))

            res.json({
                members: formattedMembers,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total: count,
                    pages: Math.ceil(count / limit)
                },
                filters: {
                    role: role || null,
                    status: status || null
                }
            })

        } catch (error) {
            console.error('Error en GET /api/team/members:', error)
            res.status(500).json({
                error: 'Error interno del servidor',
                message: AppConfig.server.environment === 'development' ? error.message : 'Error procesando solicitud'
            })
        }
    }
)

/**
 * GET /api/team/members/:memberId
 * Obtener detalles de un miembro específico
 */
router.get('/members/:memberId',
    requirePermission('team', 'read'),
    [
        param('memberId')
            .isUUID()
            .withMessage('memberId debe ser un UUID válido')
    ],
    async (req, res) => {
        try {
            const errors = validationResult(req)
            if (!errors.isEmpty()) {
                return res.status(400).json({
                    error: 'Datos de entrada inválidos',
                    details: errors.array()
                })
            }

            const supabase = createSupabaseClient(req.tenant.id)
            const { memberId } = req.params

            const { data: member, error } = await supabase
                .from('team_members')
                .select(`
                    id,
                    user_id,
                    role,
                    status,
                    permissions,
                    invited_by,
                    invited_at,
                    joined_at,
                    last_active_at,
                    users!inner(
                        id,
                        email,
                        full_name,
                        avatar_url,
                        phone,
                        created_at,
                        updated_at
                    )
                `)
                .eq('id', memberId)
                .eq('tenant_id', req.tenant.id)
                .single()

            if (error || !member) {
                return res.status(404).json({
                    error: 'Miembro no encontrado',
                    message: 'El miembro especificado no existe o no tienes acceso'
                })
            }

            // Obtener información adicional del usuario que invitó
            let invitedByUser = null
            if (member.invited_by) {
                const { data: inviter } = await supabase
                    .from('users')
                    .select('id, email, full_name')
                    .eq('id', member.invited_by)
                    .single()
                invitedByUser = inviter
            }

            const formattedMember = {
                id: member.id,
                user: {
                    id: member.users.id,
                    email: member.users.email,
                    full_name: member.users.full_name,
                    avatar_url: member.users.avatar_url,
                    phone: member.users.phone,
                    created_at: member.users.created_at,
                    updated_at: member.users.updated_at
                },
                role: member.role,
                status: member.status,
                permissions: member.permissions,
                invited_by: invitedByUser,
                invited_at: member.invited_at,
                joined_at: member.joined_at,
                last_active_at: member.last_active_at
            }

            res.json(formattedMember)

        } catch (error) {
            console.error('Error en GET /api/team/members/:memberId:', error)
            res.status(500).json({
                error: 'Error interno del servidor',
                message: AppConfig.server.environment === 'development' ? error.message : 'Error procesando solicitud'
            })
        }
    }
)

/**
 * POST /api/team/invite
 * Invitar nuevo miembro al equipo
 */
router.post('/invite',
    requirePermission('team', 'create'),
    [
        body('email')
            .isEmail()
            .normalizeEmail()
            .withMessage('Email inválido'),
        body('role')
            .isIn(['admin', 'manager', 'operator', 'viewer'])
            .withMessage('Rol inválido'),
        body('permissions')
            .optional()
            .isArray()
            .withMessage('Permisos deben ser un array'),
        body('message')
            .optional()
            .isLength({ max: 500 })
            .withMessage('Mensaje no puede exceder 500 caracteres')
    ],
    async (req, res) => {
        try {
            const errors = validationResult(req)
            if (!errors.isEmpty()) {
                return res.status(400).json({
                    error: 'Datos de entrada inválidos',
                    details: errors.array()
                })
            }

            const supabase = createSupabaseClient(req.tenant.id)
            const { email, role, permissions = [], message } = req.body

            // Verificar límites del plan
            const planLimits = AppConfig.plans[req.tenant.plan] || AppConfig.plans.free
            
            // Contar miembros actuales
            const { count: currentMembers } = await supabase
                .from('team_members')
                .select('id', { count: 'exact' })
                .eq('tenant_id', req.tenant.id)
                .neq('status', 'inactive')

            if (currentMembers >= planLimits.teamMembers) {
                return res.status(403).json({
                    error: 'Límite de miembros alcanzado',
                    message: `Tu plan permite máximo ${planLimits.teamMembers} miembros del equipo`
                })
            }

            // Verificar si el usuario ya existe
            const { data: existingUser } = await supabase
                .from('users')
                .select('id')
                .eq('email', email)
                .single()

            // Verificar si ya es miembro del equipo
            if (existingUser) {
                const { data: existingMember } = await supabase
                    .from('team_members')
                    .select('id, status')
                    .eq('user_id', existingUser.id)
                    .eq('tenant_id', req.tenant.id)
                    .single()

                if (existingMember) {
                    return res.status(409).json({
                        error: 'Usuario ya es miembro',
                        message: existingMember.status === 'pending' ? 
                            'El usuario ya tiene una invitación pendiente' :
                            'El usuario ya es miembro del equipo'
                    })
                }
            }

            // Crear invitación
            const invitationData = {
                tenant_id: req.tenant.id,
                email,
                role,
                permissions,
                invited_by: req.user.id,
                invited_at: new Date().toISOString(),
                status: 'pending',
                invitation_token: jwt.sign(
                    { 
                        email, 
                        tenant_id: req.tenant.id, 
                        role,
                        type: 'team_invitation'
                    },
                    AppConfig.jwt.secret,
                    { expiresIn: '7d' }
                )
            }

            // Si el usuario existe, asociar directamente
            if (existingUser) {
                invitationData.user_id = existingUser.id
            }

            const { data: invitation, error: inviteError } = await supabase
                .from('team_members')
                .insert(invitationData)
                .select(`
                    id,
                    email,
                    role,
                    status,
                    invited_at,
                    invitation_token
                `)
                .single()

            if (inviteError) {
                console.error('Error creando invitación:', inviteError)
                return res.status(500).json({
                    error: 'Error creando invitación',
                    message: inviteError.message
                })
            }

            // TODO: Enviar email de invitación
            // await sendInvitationEmail(email, invitation.invitation_token, req.tenant.name, message)

            res.status(201).json({
                message: 'Invitación enviada exitosamente',
                invitation: {
                    id: invitation.id,
                    email: invitation.email,
                    role: invitation.role,
                    status: invitation.status,
                    invited_at: invitation.invited_at,
                    expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
                }
            })

        } catch (error) {
            console.error('Error en POST /api/team/invite:', error)
            res.status(500).json({
                error: 'Error interno del servidor',
                message: AppConfig.server.environment === 'development' ? error.message : 'Error procesando solicitud'
            })
        }
    }
)

/**
 * POST /api/team/accept-invitation
 * Aceptar invitación al equipo
 */
router.post('/accept-invitation',
    [
        body('token')
            .notEmpty()
            .withMessage('Token de invitación requerido'),
        body('password')
            .optional()
            .isLength({ min: 8 })
            .withMessage('Contraseña debe tener al menos 8 caracteres')
    ],
    async (req, res) => {
        try {
            const errors = validationResult(req)
            if (!errors.isEmpty()) {
                return res.status(400).json({
                    error: 'Datos de entrada inválidos',
                    details: errors.array()
                })
            }

            const { token, password } = req.body

            // Verificar token
            let decoded
            try {
                decoded = jwt.verify(token, AppConfig.jwt.secret)
            } catch (jwtError) {
                return res.status(400).json({
                    error: 'Token inválido o expirado',
                    message: 'La invitación no es válida o ha expirado'
                })
            }

            if (decoded.type !== 'team_invitation') {
                return res.status(400).json({
                    error: 'Token inválido',
                    message: 'El token no corresponde a una invitación de equipo'
                })
            }

            const supabase = createSupabaseClient(decoded.tenant_id)

            // Buscar invitación
            const { data: invitation, error: inviteError } = await supabase
                .from('team_members')
                .select('*')
                .eq('invitation_token', token)
                .eq('status', 'pending')
                .single()

            if (inviteError || !invitation) {
                return res.status(404).json({
                    error: 'Invitación no encontrada',
                    message: 'La invitación no existe o ya fue procesada'
                })
            }

            // Verificar si el usuario existe
            let userId = invitation.user_id
            
            if (!userId) {
                // Crear nuevo usuario si no existe
                if (!password) {
                    return res.status(400).json({
                        error: 'Contraseña requerida',
                        message: 'Debes proporcionar una contraseña para crear tu cuenta'
                    })
                }

                const hashedPassword = await bcrypt.hash(password, AppConfig.auth.bcryptRounds)
                
                const { data: newUser, error: userError } = await supabase
                    .from('users')
                    .insert({
                        email: decoded.email,
                        password_hash: hashedPassword,
                        full_name: decoded.email.split('@')[0],
                        email_verified: true,
                        created_at: new Date().toISOString()
                    })
                    .select('id')
                    .single()

                if (userError) {
                    console.error('Error creando usuario:', userError)
                    return res.status(500).json({
                        error: 'Error creando usuario',
                        message: userError.message
                    })
                }

                userId = newUser.id
            }

            // Actualizar invitación
            const { error: updateError } = await supabase
                .from('team_members')
                .update({
                    user_id: userId,
                    status: 'active',
                    joined_at: new Date().toISOString(),
                    invitation_token: null
                })
                .eq('id', invitation.id)

            if (updateError) {
                console.error('Error actualizando invitación:', updateError)
                return res.status(500).json({
                    error: 'Error procesando invitación',
                    message: updateError.message
                })
            }

            // Generar JWT para el usuario
            const userToken = jwt.sign(
                { 
                    userId,
                    email: decoded.email,
                    tenantId: decoded.tenant_id,
                    role: invitation.role
                },
                AppConfig.jwt.secret,
                { expiresIn: AppConfig.jwt.expiresIn }
            )

            res.json({
                message: 'Invitación aceptada exitosamente',
                token: userToken,
                user: {
                    id: userId,
                    email: decoded.email,
                    role: invitation.role,
                    tenant_id: decoded.tenant_id
                }
            })

        } catch (error) {
            console.error('Error en POST /api/team/accept-invitation:', error)
            res.status(500).json({
                error: 'Error interno del servidor',
                message: AppConfig.server.environment === 'development' ? error.message : 'Error procesando solicitud'
            })
        }
    }
)

/**
 * PUT /api/team/members/:memberId
 * Actualizar miembro del equipo
 */
router.put('/members/:memberId',
    requirePermission('team', 'update'),
    [
        param('memberId')
            .isUUID()
            .withMessage('memberId debe ser un UUID válido'),
        body('role')
            .optional()
            .isIn(['admin', 'manager', 'operator', 'viewer'])
            .withMessage('Rol inválido'),
        body('permissions')
            .optional()
            .isArray()
            .withMessage('Permisos deben ser un array'),
        body('status')
            .optional()
            .isIn(['active', 'inactive'])
            .withMessage('Estado inválido')
    ],
    async (req, res) => {
        try {
            const errors = validationResult(req)
            if (!errors.isEmpty()) {
                return res.status(400).json({
                    error: 'Datos de entrada inválidos',
                    details: errors.array()
                })
            }

            const supabase = createSupabaseClient(req.tenant.id)
            const { memberId } = req.params
            const { role, permissions, status } = req.body

            // Verificar que el miembro existe
            const { data: member, error: memberError } = await supabase
                .from('team_members')
                .select('id, user_id, role, status')
                .eq('id', memberId)
                .eq('tenant_id', req.tenant.id)
                .single()

            if (memberError || !member) {
                return res.status(404).json({
                    error: 'Miembro no encontrado',
                    message: 'El miembro especificado no existe o no tienes acceso'
                })
            }

            // Prevenir que el owner se modifique a sí mismo
            if (member.user_id === req.user.id && req.user.role === 'owner') {
                return res.status(403).json({
                    error: 'Acción no permitida',
                    message: 'No puedes modificar tu propio rol como propietario'
                })
            }

            // Construir datos de actualización
            const updateData = {
                updated_at: new Date().toISOString()
            }

            if (role !== undefined) updateData.role = role
            if (permissions !== undefined) updateData.permissions = permissions
            if (status !== undefined) updateData.status = status

            // Actualizar miembro
            const { data: updatedMember, error: updateError } = await supabase
                .from('team_members')
                .update(updateData)
                .eq('id', memberId)
                .select(`
                    id,
                    user_id,
                    role,
                    status,
                    permissions,
                    updated_at,
                    users!inner(
                        id,
                        email,
                        full_name,
                        avatar_url
                    )
                `)
                .single()

            if (updateError) {
                console.error('Error actualizando miembro:', updateError)
                return res.status(500).json({
                    error: 'Error actualizando miembro',
                    message: updateError.message
                })
            }

            const formattedMember = {
                id: updatedMember.id,
                user: {
                    id: updatedMember.users.id,
                    email: updatedMember.users.email,
                    full_name: updatedMember.users.full_name,
                    avatar_url: updatedMember.users.avatar_url
                },
                role: updatedMember.role,
                status: updatedMember.status,
                permissions: updatedMember.permissions,
                updated_at: updatedMember.updated_at
            }

            res.json({
                message: 'Miembro actualizado exitosamente',
                member: formattedMember
            })

        } catch (error) {
            console.error('Error en PUT /api/team/members/:memberId:', error)
            res.status(500).json({
                error: 'Error interno del servidor',
                message: AppConfig.server.environment === 'development' ? error.message : 'Error procesando solicitud'
            })
        }
    }
)

/**
 * DELETE /api/team/members/:memberId
 * Remover miembro del equipo
 */
router.delete('/members/:memberId',
    requirePermission('team', 'delete'),
    [
        param('memberId')
            .isUUID()
            .withMessage('memberId debe ser un UUID válido')
    ],
    async (req, res) => {
        try {
            const errors = validationResult(req)
            if (!errors.isEmpty()) {
                return res.status(400).json({
                    error: 'Datos de entrada inválidos',
                    details: errors.array()
                })
            }

            const supabase = createSupabaseClient(req.tenant.id)
            const { memberId } = req.params

            // Verificar que el miembro existe
            const { data: member, error: memberError } = await supabase
                .from('team_members')
                .select('id, user_id, role')
                .eq('id', memberId)
                .eq('tenant_id', req.tenant.id)
                .single()

            if (memberError || !member) {
                return res.status(404).json({
                    error: 'Miembro no encontrado',
                    message: 'El miembro especificado no existe o no tienes acceso'
                })
            }

            // Prevenir que el owner se elimine a sí mismo
            if (member.user_id === req.user.id && req.user.role === 'owner') {
                return res.status(403).json({
                    error: 'Acción no permitida',
                    message: 'No puedes eliminarte a ti mismo como propietario'
                })
            }

            // Eliminar miembro
            const { error: deleteError } = await supabase
                .from('team_members')
                .delete()
                .eq('id', memberId)

            if (deleteError) {
                console.error('Error eliminando miembro:', deleteError)
                return res.status(500).json({
                    error: 'Error eliminando miembro',
                    message: deleteError.message
                })
            }

            res.json({
                message: 'Miembro eliminado exitosamente'
            })

        } catch (error) {
            console.error('Error en DELETE /api/team/members/:memberId:', error)
            res.status(500).json({
                error: 'Error interno del servidor',
                message: AppConfig.server.environment === 'development' ? error.message : 'Error procesando solicitud'
            })
        }
    }
)

/**
 * GET /api/team/invitations
 * Obtener invitaciones pendientes
 */
router.get('/invitations',
    requirePermission('team', 'read'),
    async (req, res) => {
        try {
            const supabase = createSupabaseClient(req.tenant.id)

            const { data: invitations, error } = await supabase
                .from('team_members')
                .select(`
                    id,
                    email,
                    role,
                    status,
                    invited_at,
                    invited_by,
                    users!team_members_invited_by_fkey(
                        id,
                        email,
                        full_name
                    )
                `)
                .eq('tenant_id', req.tenant.id)
                .eq('status', 'pending')
                .order('invited_at', { ascending: false })

            if (error) {
                console.error('Error obteniendo invitaciones:', error)
                return res.status(500).json({
                    error: 'Error obteniendo invitaciones',
                    message: error.message
                })
            }

            const formattedInvitations = invitations.map(inv => ({
                id: inv.id,
                email: inv.email,
                role: inv.role,
                status: inv.status,
                invited_at: inv.invited_at,
                invited_by: inv.users ? {
                    id: inv.users.id,
                    email: inv.users.email,
                    full_name: inv.users.full_name
                } : null,
                expires_at: new Date(new Date(inv.invited_at).getTime() + 7 * 24 * 60 * 60 * 1000).toISOString()
            }))

            res.json({
                invitations: formattedInvitations,
                total: formattedInvitations.length
            })

        } catch (error) {
            console.error('Error en GET /api/team/invitations:', error)
            res.status(500).json({
                error: 'Error interno del servidor',
                message: AppConfig.server.environment === 'development' ? error.message : 'Error procesando solicitud'
            })
        }
    }
)

/**
 * DELETE /api/team/invitations/:invitationId
 * Cancelar invitación
 */
router.delete('/invitations/:invitationId',
    requirePermission('team', 'delete'),
    [
        param('invitationId')
            .isUUID()
            .withMessage('invitationId debe ser un UUID válido')
    ],
    async (req, res) => {
        try {
            const errors = validationResult(req)
            if (!errors.isEmpty()) {
                return res.status(400).json({
                    error: 'Datos de entrada inválidos',
                    details: errors.array()
                })
            }

            const supabase = createSupabaseClient(req.tenant.id)
            const { invitationId } = req.params

            // Verificar que la invitación existe y está pendiente
            const { data: invitation, error: inviteError } = await supabase
                .from('team_members')
                .select('id, status')
                .eq('id', invitationId)
                .eq('tenant_id', req.tenant.id)
                .eq('status', 'pending')
                .single()

            if (inviteError || !invitation) {
                return res.status(404).json({
                    error: 'Invitación no encontrada',
                    message: 'La invitación especificada no existe o ya fue procesada'
                })
            }

            // Eliminar invitación
            const { error: deleteError } = await supabase
                .from('team_members')
                .delete()
                .eq('id', invitationId)

            if (deleteError) {
                console.error('Error cancelando invitación:', deleteError)
                return res.status(500).json({
                    error: 'Error cancelando invitación',
                    message: deleteError.message
                })
            }

            res.json({
                message: 'Invitación cancelada exitosamente'
            })

        } catch (error) {
            console.error('Error en DELETE /api/team/invitations/:invitationId:', error)
            res.status(500).json({
                error: 'Error interno del servidor',
                message: AppConfig.server.environment === 'development' ? error.message : 'Error procesando solicitud'
            })
        }
    }
)

export default router