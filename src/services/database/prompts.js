import supabase from '../../config/supabase.js'
import { TABLES } from '../../config/constants.js'
import { OpenAIService } from '../ai/openai.js'

export const PromptsService = {
    async createBehaviorPrompt(userId, chatbotId, promptText) {
        try {
            const embedding = await OpenAIService.generateEmbedding(promptText)
            
            const { data, error } = await supabase
                .from(TABLES.BEHAVIOR_PROMPTS)
                .insert({
                    user_id: userId,
                    chatbot_id: chatbotId,
                    prompt_text: promptText,
                    embedding: embedding,
                    is_active: true
                })
                .select()
                .single()

            if (error) throw new Error(error.message)
            return data
        } catch (error) {
            console.error('Error creating behavior prompt:', error)
            throw error
        }
    },

    async createKnowledgePrompt(userId, chatbotId, promptText, category = 'general') {
        try {
            const embedding = await OpenAIService.generateEmbedding(promptText)
            
            const { data, error } = await supabase
                .from(TABLES.KNOWLEDGE_PROMPTS)
                .insert({
                    user_id: userId,
                    chatbot_id: chatbotId,
                    prompt_text: promptText,
                    category: category,
                    embedding: embedding,
                    is_active: true
                })
                .select()
                .single()

            if (error) throw new Error(error.message)
            return data
        } catch (error) {
            console.error('Error creating knowledge prompt:', error)
            throw error
        }
    },

    async getActiveBehaviorPrompt(chatbotId) {
        const { data, error } = await supabase
            .from(TABLES.BEHAVIOR_PROMPTS)
            .select('*')
            .eq('chatbot_id', chatbotId)
            .eq('is_active', true)
            .single()

        if (error && error.code !== 'PGRST116') throw new Error(error.message)
        return data
    },

    async getActiveKnowledgePrompts(chatbotId) {
        const { data, error } = await supabase
            .from(TABLES.KNOWLEDGE_PROMPTS)
            .select('*')
            .eq('chatbot_id', chatbotId)
            .eq('is_active', true)
            .order('created_at', { ascending: true })

        if (error) throw new Error(error.message)
        return data
    },

    async findRelevantKnowledge(chatbotId, query, threshold = 0.7, limit = 5) {
        try {
            const queryEmbedding = await OpenAIService.generateEmbedding(query)

            const { data, error } = await supabase
                .rpc('match_knowledge_prompts', {
                    query_embedding: queryEmbedding,
                    match_threshold: threshold,
                    match_count: limit,
                    p_chatbot_id: chatbotId
                })

            if (error) throw new Error(error.message)
            return data
        } catch (error) {
            console.error('Error finding relevant knowledge:', error)
            throw error
        }
    }
} 