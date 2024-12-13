const Anthropic = require('@anthropic-ai/sdk');

const createClaudeClient = (apiKey) => {
    if (!apiKey) {
        throw new Error('Claude API key is required. Please add it in your account settings.');
    }
    return new Anthropic({
        apiKey: apiKey
    });
};

exports.analyzeContent = async (url, content, userApiKey) => {
    try {
        console.log('Starting content analysis with Claude...');
        const claude = createClaudeClient(userApiKey);
        
        // Run all analysis in parallel for better performance
        const [summaryResult, tagsResult, categoryResult] = await Promise.all([
            this.generateSummary(content, url, claude).catch(error => {
                console.error('Summary generation failed:', error);
                return 'Summary generation failed. Please try again later.';
            }),
            this.generateTags(content, url, claude).catch(error => {
                console.error('Tag generation failed:', error);
                return [];
            }),
            this.determineCategory(content, url, claude).catch(error => {
                console.error('Category determination failed:', error);
                return 'Article';
            })
        ]);

        console.log('Analysis complete:', {
            summaryLength: summaryResult.length,
            tagsCount: tagsResult.length,
            category: categoryResult,
            tags: tagsResult
        });

        return {
            summary: summaryResult,
            tags: tagsResult,
            category: categoryResult
        };
    } catch (error) {
        console.error('Error in analyzeContent:', error);
        return {
            summary: 'Summary generation failed. Please try again later.',
            tags: [],
            category: 'Article'
        };
    }
};

exports.determineCategory = async (content, url, claudeClient) => {
    try {
        console.log('Determining category for URL:', url);
        
        // Quick URL-based category detection
        const urlLower = url.toLowerCase();
        if (urlLower.includes('youtube.com') || 
            urlLower.includes('youtu.be') || 
            urlLower.includes('vimeo.com') || 
            urlLower.includes('dailymotion.com')) {
            console.log('Category determined from URL: Video');
            return 'Video';
        }
        
        if (urlLower.includes('arxiv.org') || 
            urlLower.includes('research') || 
            urlLower.includes('paper') ||
            urlLower.includes('doi.org')) {
            console.log('Category determined from URL: Research');
            return 'Research';
        }

        // If no quick match, use Claude to determine category
        const response = await claudeClient.messages.create({
            model: "claude-3-opus-20240229",
            max_tokens: 10,
            temperature: 0.1,
            system: "You are a content classifier that categorizes web content into one of three categories: 'Article', 'Video', or 'Research'. Return ONLY the category name as a single word, no explanation or additional text.",
            messages: [{
                role: "user",
                content: `URL: ${url}\n\nContent: ${content.substring(0, 2000)}` // Increased context
            }]
        });

        const category = response.content[0].text.trim();
        console.log('Claude determined category:', category);
        
        // Ensure the category is one of our valid options
        if (['Article', 'Video', 'Research'].includes(category)) {
            return category;
        }
        
        console.log('Invalid category returned, defaulting to Article');
        return 'Article';
    } catch (error) {
        console.error('Error determining category:', error);
        return 'Article';
    }
};

exports.generateTags = async (content, url, claudeClient) => {
    try {
        console.log('Generating tags for URL:', url);
        
        // Determine if this is YouTube content
        const isYouTube = url.toLowerCase().includes('youtube.com') || url.toLowerCase().includes('youtu.be');
        
        const systemPrompt = isYouTube 
            ? `You are analyzing a YouTube video. Generate 3-5 accurate tags that represent the main topics, people, and organizations discussed in the video. Rules:
               1. Return ONLY a JSON array of lowercase strings, no other text
               2. Focus on the actual video content and discussion topics
               3. Include relevant people, companies, or organizations mentioned
               4. Keep tags simple and focused (1-2 words, rarely 3 if needed)
               5. Avoid generic terms like 'youtube', 'video', 'interview'
               Example good response: ["artificial intelligence", "microsoft", "sam altman"]`
            : `You are a tag generator for web content. Generate 3-5 simple, focused tags that best categorize the content.
               Rules:
               1. Return ONLY a JSON array of lowercase strings, no other text
               2. Keep tags simple and focused (1-2 words, rarely 3 if needed)
               3. Focus on main topics, people, or organizations
               4. Avoid generic terms like 'article', 'other', 'miscellaneous'
               Example good response: ["climate change", "united nations", "paris agreement"]`;

        const response = await claudeClient.messages.create({
            model: "claude-3-opus-20240229",
            max_tokens: 100,
            temperature: 0.3,
            system: systemPrompt,
            messages: [{
                role: "user",
                content: `URL: ${url}\n\nContent: ${content}` // Use full content for better context
            }]
        });

        let tags = [];
        try {
            const tagContent = response.content[0].text;
            console.log('Raw tag response:', tagContent);
            tags = JSON.parse(tagContent);
            // Filter and clean tags
            tags = tags
                .map(tag => tag.toLowerCase().trim())
                .filter(tag => {
                    // Remove empty tags and generic terms
                    const genericTerms = ['other', 'miscellaneous', 'general', 'misc', 'various', 'article', 'content', 'video', 'youtube'];
                    return tag && 
                           tag.length > 0 && 
                           !genericTerms.includes(tag.toLowerCase()) &&
                           tag.length <= 50;
                });
            console.log('Generated tags:', tags);
        } catch (parseError) {
            console.error('Error parsing tags:', parseError);
            return [];
        }

        return tags;
    } catch (error) {
        console.error('Error generating tags:', error);
        return [];
    }
};

exports.generateSummary = async (content, url, claudeClient) => {
    try {
        console.log('Generating summary...');
        
        // Determine if this is YouTube content
        const isYouTube = url.toLowerCase().includes('youtube.com') || url.toLowerCase().includes('youtu.be');
        
        const systemPrompt = isYouTube
            ? "You are analyzing a YouTube video. Generate a concise 2-3 sentence summary that accurately captures the main points discussed in the video. Focus on the key topics, insights, and any significant conclusions or takeaways. Be specific and avoid generic descriptions."
            : "You are a helpful assistant that generates concise summaries of web content. Generate a brief, informative summary in 2-3 sentences that captures the main points and key takeaways.";

        const response = await claudeClient.messages.create({
            model: "claude-3-opus-20240229",
            max_tokens: 150,
            temperature: 0.3,
            system: systemPrompt,
            messages: [{
                role: "user",
                content: content // Use full content for better context
            }]
        });

        const summary = response.content[0].text.trim();
        console.log('Generated summary length:', summary.length);
        return summary || 'No summary available.';
    } catch (error) {
        console.error('Error generating summary:', error);
        return 'Summary generation failed. Please try again later.';
    }
};
