const openaiService = require('./openai');
const claudeService = require('./claude');

exports.analyzeContent = async (url, content, user) => {
    try {
        if (!user.aiProvider) {
            throw new Error('AI provider not specified');
        }

        if (!user.openAiKey && !user.claudeKey) {
            throw new Error('No API key found. Please add an API key in your account settings.');
        }

        switch (user.aiProvider) {
            case 'openai':
                if (!user.openAiKey) {
                    throw new Error('OpenAI API key is required. Please add it in your account settings.');
                }
                return await openaiService.analyzeContent(url, content, user.openAiKey);

            case 'claude':
                if (!user.claudeKey) {
                    throw new Error('Claude API key is required. Please add it in your account settings.');
                }
                return await claudeService.analyzeContent(url, content, user.claudeKey);

            default:
                throw new Error('Invalid AI provider specified');
        }
    } catch (error) {
        console.error('Error in AI service:', error);
        return {
            summary: `AI analysis failed: ${error.message}. Please try again later.`,
            tags: [],
            category: 'Article' // Default to Article if analysis fails
        };
    }
};
