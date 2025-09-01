import supabase from '../../config/supabase.js'

export const PortAssignmentService = {
    async getUserIdByPort(port) {
        try {
            const { data, error } = await supabase
                .from('assign_qr')
                .select('user_id')
                .eq('port', port)
                .eq('is_assigned', true)
                .single()

            if (error) throw error
            return data?.user_id || null
        } catch (error) {
            console.error('Error getting user_id by port:', error)
            return null
        }
    }
}
