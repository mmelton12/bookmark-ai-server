const express = require('express');
const router = express.Router();
const { Configuration, OpenAIApi } = require('openai');
const { protect } = require('../middleware/auth');
const Bookmark = require('../models/Bookmark');

const createOpenAIClient = (apiKey) => {
    if (!apiKey) {
        throw new Error('OpenAI API key is required');
    }
    const configuration = new Configuration({
        apiKey: apiKey.trim()
    });
    return new OpenAIApi(configuration);
};

// Helper function to get recent bookmarks
async function getRecentBookmarks(userId) {
    return await Bookmark.find({ user: userId })
        .select('title url tags category')
        .sort('-createdAt')
        .limit(10);
}

// Add auth protection to chat route
router.post('/chat', protect, async (req, res) => {
    try {
        const { message } = req.body;
        const apiKey = req.user.openAiKey;
        
        if (!message?.trim()) {
            console.log('Chat error: Message is required');
            return res.status(400).json({ 
                error: 'Message is required',
                details: 'Message is empty or missing'
            });
        }
        
        if (!apiKey?.trim()) {
            console.log('Chat error: OpenAI API key is required');
            return res.status(400).json({ 
                error: 'OpenAI API key is required',
                details: 'Please add your OpenAI API key in account settings'
            });
        }

        // Get recent bookmarks
        const recentBookmarks = await getRecentBookmarks(req.user.id);

        const systemPrompt = `You are a helpful assistant that provides brief information about bookmarks. When responding:

1. Keep responses short and focused
2. Format bookmark links using markdown: [title](url)
3. Include relevant tags as hashtags after the link
4. Limit responses to 1-2 lines plus the bookmark links

Available bookmarks:
${recentBookmarks.map(b => `[${b.title}](${b.url}) ${b.tags.length > 0 ? '#' + b.tags.join(' #') : ''}`).join('\n')}`;

        const openai = createOpenAIClient(apiKey);

        console.log('Sending request to OpenAI...');
        const response = await openai.createChatCompletion({
            model: "gpt-4",
            messages: [
                {
                    role: "system",
                    content: systemPrompt
                },
                {
                    role: "user",
                    content: message.trim()
                }
            ],
            temperature: 0.7,
            max_tokens: 500
        });

        if (!response.data.choices || response.data.choices.length === 0) {
            console.log('Chat error: No response from OpenAI');
            throw new Error('No response from OpenAI');
        }

        console.log('Successfully received response from OpenAI');
        res.json({ 
            reply: response.data.choices[0].message.content 
        });
    } catch (error) {
        console.error('Chat error:', {
            message: error.message,
            status: error.response?.status,
            data: error.response?.data,
            stack: error.stack,
            requestBody: {
                hasMessage: !!req.body.message,
                messageLength: req.body.message?.length
            }
        });
        
        // Handle specific error types
        if (error.response?.status === 401) {
            return res.status(401).json({ 
                error: 'Invalid OpenAI API key',
                details: error.response?.data
            });
        }
        
        if (error.message === 'OpenAI API key is required') {
            return res.status(400).json({ 
                error: error.message,
                details: 'Please add your OpenAI API key in account settings'
            });
        }

        res.status(500).json({ 
            error: 'Failed to get chat response',
            details: error.message
        });
    }
});

module.exports = router;
