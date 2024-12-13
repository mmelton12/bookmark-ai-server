const { Configuration, OpenAIApi } = require('openai');

const createOpenAIClient = (apiKey) => {
    if (!apiKey) {
        throw new Error('OpenAI API key is required. Please add it in your account settings.');
    }
    const configuration = new Configuration({
        apiKey: apiKey
    });
    return new OpenAIApi(configuration);
};

exports.analyzeContent = async (url, content, userApiKey) => {
    try {
        console.log('Starting content analysis...');
        const openai = createOpenAIClient(userApiKey);
        
        // Run all analysis in parallel for better performance
        const [summaryResult, tagsResult, categoryResult] = await Promise.all([
            this.generateSummary(content, openai).catch(error => {
                console.error('Summary generation failed:', error);
                return 'Summary generation failed. Please try again later.';
            }),
            this.generateTags(content, url, openai).catch(error => {
                console.error('Tag generation failed:', error);
                return [];
            }),
            this.determineCategory(content, url, openai).catch(error => {
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
        // Return default values instead of throwing
        return {
            summary: 'Summary generation failed. Please try again later.',
            tags: [],
            category: 'Article' // Default to Article if analysis fails
        };
    }
};

exports.determineCategory = async (content, url, openaiClient) => {
    try {
        console.log('Determining category for URL:', url);
        
        // Quick URL-based category detection
        const urlLower = url.toLowerCase();
        if (urlLower.includes('youtube.com') || 
            urlLower.includes('vimeo.com') || 
            urlLower.includes('dailymotion.com') ||
            urlLower.includes('video')) {
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

        // If no quick match, use AI to determine category
        const response = await openaiClient.createChatCompletion({
            model: "gpt-4",
            messages: [
                {
                    role: "system",
                    content: "You are a content classifier that categorizes web content into one of three categories: 'Article', 'Video', or 'Research'. Return ONLY the category name as a single word, no explanation or additional text. Use these guidelines:\n- 'Video': For video content, video sharing sites, or video-focused pages\n- 'Research': For academic papers, scientific articles, research publications, or technical documentation\n- 'Article': For general articles, blog posts, news, and other text-based content"
                },
                {
                    role: "user",
                    content: `URL: ${url}\n\nContent: ${content.substring(0, 1000)}` // Only send first 1000 chars to avoid token limits
                }
            ],
            temperature: 0.1,
            max_tokens: 10
        });

        const category = response.data.choices[0].message.content.trim();
        console.log('AI determined category:', category);
        
        // Ensure the category is one of our valid options
        if (['Article', 'Video', 'Research'].includes(category)) {
            return category;
        }
        
        console.log('Invalid category returned, defaulting to Article');
        return 'Article';
    } catch (error) {
        console.error('Error determining category:', error);
        return 'Article'; // Default to Article if there's an error
    }
};

exports.generateTags = async (content, url, openaiClient) => {
    try {
        console.log('Generating tags for URL:', url);
        const response = await openaiClient.createChatCompletion({
            model: "gpt-4",
            messages: [
                {
                    role: "system",
                    content: `You are a tag generator for web content. Your task is to generate 3-5 simple, focused tags that best categorize the content.

Rules:
1. Return ONLY a JSON array of lowercase strings, no other text
2. Keep tags as simple as possible:
   - For names, use only the person's name (e.g., "elon musk" not "elon musk twitter")
   - For concepts, use the core term (e.g., "immigration" not "immigration policy")
   - For companies, use the company name (e.g., "apple" not "apple earnings")
3. Each tag should be 1-2 words maximum, rarely 3 if absolutely necessary
4. Never use generic terms like 'other', 'miscellaneous', 'general'
5. Focus on the main topics, people, or organizations mentioned
6. Avoid combining multiple concepts into one tag

Example good response: ["artificial intelligence", "microsoft", "sam altman"]
Example bad response: ["sam altman openai departure", "technology news", "ai ethics debate"]

The response must be valid JSON and contain only the array of tags.`
                },
                {
                    role: "user",
                    content: `URL: ${url}\n\nContent: ${content.substring(0, 1000)}` // Only send first 1000 chars to avoid token limits
                }
            ],
            temperature: 0.3,
            max_tokens: 100
        });

        let tags = [];
        try {
            const tagContent = response.data.choices[0].message.content;
            console.log('Raw tag response:', tagContent);
            tags = JSON.parse(tagContent);
            // Filter and clean tags
            tags = tags
                .map(tag => tag.toLowerCase().trim())
                .filter(tag => {
                    // Remove empty tags, 'other', and generic terms
                    const genericTerms = ['other', 'miscellaneous', 'general', 'misc', 'various', 'article', 'content'];
                    return tag && 
                           tag.length > 0 && 
                           !genericTerms.includes(tag.toLowerCase()) &&
                           tag.length <= 50; // Reasonable length limit
                });
            console.log('Generated tags:', tags);
        } catch (parseError) {
            console.error('Error parsing tags:', parseError);
            return [];
        }

        return tags;
    } catch (error) {
        console.error('Error generating tags:', error);
        return []; // Return empty array instead of throwing
    }
};

exports.generateSummary = async (content, openaiClient) => {
    try {
        console.log('Generating summary...');
        const response = await openaiClient.createChatCompletion({
            model: "gpt-4",
            messages: [
                {
                    role: "system",
                    content: "You are a helpful assistant that generates concise summaries of web content. Generate a brief, informative summary in 2-3 sentences."
                },
                {
                    role: "user",
                    content: content.substring(0, 1000) // Only send first 1000 chars to avoid token limits
                }
            ],
            temperature: 0.3,
            max_tokens: 150
        });

        const summary = response.data.choices[0].message.content.trim();
        console.log('Generated summary length:', summary.length);
        return summary || 'No summary available.';
    } catch (error) {
        console.error('Error generating summary:', error);
        return 'Summary generation failed. Please try again later.';
    }
};
