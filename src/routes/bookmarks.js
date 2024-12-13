const express = require('express');
const { body, validationResult } = require('express-validator');
const { protect } = require('../middleware/auth');
const Bookmark = require('../models/Bookmark');
const User = require('../models/User');
const { analyzeContent } = require('../services/ai');
const { fetchContent } = require('../utils/contentFetcher');
const { processTags } = require('../utils/tagNormalizer');
const { cleanUrl } = require('../utils/urlCleaner');
const router = express.Router();

const DEFAULT_PAGE_SIZE = 24;

// @route   POST /api/bookmarks
// @desc    Create a new bookmark
// @access  Private
router.post('/', [
    protect,
    body('url').isURL().withMessage('Please provide a valid URL')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        // Clean the URL first
        const cleanedUrl = cleanUrl(req.body.url);

        // Check for existing bookmark
        const existingBookmark = await Bookmark.findOne({ 
            url: cleanedUrl,
            user: req.user.id 
        });

        if (existingBookmark) {
            return res.status(400).json({
                message: 'This URL has already been bookmarked'
            });
        }

        // Get user with API keys
        const user = await User.findById(req.user.id).select('+openAiKey +claudeKey');
        if (!user.openAiKey && !user.claudeKey) {
            return res.status(400).json({
                message: 'API key is required. Please add it in your account settings.'
            });
        }

        // Fetch content from URL
        let fetchedContent;
        try {
            fetchedContent = await fetchContent(cleanedUrl);
            if (!fetchedContent || !fetchedContent.content) {
                throw new Error('No content could be fetched from URL');
            }
        } catch (error) {
            return res.status(400).json({
                message: `Failed to fetch content: ${error.message}`
            });
        }

        // Generate AI summary, tags, and category
        let analysisResult;
        try {
            analysisResult = await analyzeContent(cleanedUrl, fetchedContent.content, user);
            if (!analysisResult) {
                throw new Error('Failed to analyze content');
            }
        } catch (error) {
            return res.status(500).json({
                message: `Failed to analyze content: ${error.message}`
            });
        }

        // Get existing tags and process new ones
        const existingBookmarks = await Bookmark.find({ user: req.user.id });
        const existingTags = Array.from(new Set(
            existingBookmarks.flatMap(bookmark => bookmark.tags || [])
        ));
        const normalizedTags = processTags(analysisResult.tags, existingTags);

        // Create bookmark
        try {
            const bookmark = await Bookmark.create({
                url: cleanedUrl,
                title: fetchedContent.title,
                description: fetchedContent.description,
                aiSummary: analysisResult.summary,
                tags: normalizedTags,
                category: analysisResult.category,
                user: req.user.id
            });

            res.status(201).json(bookmark);
        } catch (error) {
            return res.status(500).json({
                message: `Failed to save bookmark: ${error.message}`
            });
        }
    } catch (error) {
        console.error('Bookmark creation error:', error);
        res.status(500).json({
            message: `Server error: ${error.message}`
        });
    }
});

// Get bookmarks route with pagination
router.get('/', protect, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || DEFAULT_PAGE_SIZE;
        const skip = (page - 1) * limit;

        const query = { user: req.user.id };

        if ('folderId' in req.query) {
            query.folder = req.query.folderId || null;
        }

        if (req.query.favorite === 'true') {
            query.isFavorite = true;
        }

        if (req.query.category) {
            query.category = req.query.category;
        }

        const [total, bookmarks] = await Promise.all([
            Bookmark.countDocuments(query),
            Bookmark.find(query)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
        ]);

        res.json({
            data: bookmarks,
            total,
            page,
            limit,
            hasMore: total > skip + bookmarks.length
        });
    } catch (error) {
        console.error('Get bookmarks error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Search route with pagination
router.get('/search', protect, async (req, res) => {
    try {
        const { tags, query, folderId, favorite, category } = req.query;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || DEFAULT_PAGE_SIZE;
        const skip = (page - 1) * limit;

        const searchQuery = { user: req.user.id };

        if ('folderId' in req.query) {
            searchQuery.folder = folderId || null;
        }

        if (favorite === 'true') {
            searchQuery.isFavorite = true;
        }

        if (category) {
            searchQuery.category = category;
        }

        if (tags && typeof tags === 'string') {
            const searchTags = tags.split(',').map(tag => tag.trim()).filter(Boolean);
            if (searchTags.length > 0) {
                searchQuery.tags = { $in: searchTags };
            }
        }

        if (query && typeof query === 'string' && query.trim()) {
            searchQuery.$text = { $search: query.trim() };
        }

        const [total, bookmarks] = await Promise.all([
            Bookmark.countDocuments(searchQuery),
            Bookmark.find(searchQuery)
                .sort(query ? { score: { $meta: 'textScore' } } : { createdAt: -1 })
                .skip(skip)
                .limit(limit)
        ]);

        res.json({
            data: bookmarks,
            total,
            page,
            limit,
            hasMore: total > skip + bookmarks.length
        });
    } catch (error) {
        console.error('Search error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Bulk operations route
router.post('/bulk', protect, async (req, res) => {
    try {
        const { action, bookmarkIds, data } = req.body;

        if (!bookmarkIds || !Array.isArray(bookmarkIds) || bookmarkIds.length === 0) {
            return res.status(400).json({ message: 'No bookmarks selected' });
        }

        // Get all existing tags for the user before bulk operations
        const existingBookmarks = await Bookmark.find({ user: req.user.id });
        const existingTags = Array.from(new Set(
            existingBookmarks.flatMap(bookmark => bookmark.tags || [])
        ));

        switch (action) {
            case 'move':
                if (data.folderId === undefined) {
                    return res.status(400).json({ message: 'Folder ID is required' });
                }
                await Bookmark.updateMany(
                    { _id: { $in: bookmarkIds }, user: req.user.id },
                    { $set: { folder: data.folderId || null } }
                );
                break;

            case 'tag':
                if (!data.tags || !Array.isArray(data.tags)) {
                    return res.status(400).json({ message: 'Tags array is required' });
                }
                const normalizedNewTags = processTags(data.tags, existingTags);
                await Bookmark.updateMany(
                    { _id: { $in: bookmarkIds }, user: req.user.id },
                    { $set: { tags: normalizedNewTags } }
                );
                break;

            case 'untag':
                if (!data.tags || !Array.isArray(data.tags)) {
                    return res.status(400).json({ message: 'Tags array is required' });
                }
                await Bookmark.updateMany(
                    { _id: { $in: bookmarkIds }, user: req.user.id },
                    { $pullAll: { tags: data.tags } }
                );
                break;

            case 'delete':
                await Bookmark.deleteMany({
                    _id: { $in: bookmarkIds },
                    user: req.user.id
                });
                break;

            case 'favorite':
                if (typeof data.isFavorite !== 'boolean') {
                    return res.status(400).json({ message: 'Favorite status is required' });
                }
                await Bookmark.updateMany(
                    { _id: { $in: bookmarkIds }, user: req.user.id },
                    { $set: { isFavorite: data.isFavorite } }
                );
                break;

            case 'category':
                if (!data.category) {
                    return res.status(400).json({ message: 'Category is required' });
                }
                await Bookmark.updateMany(
                    { _id: { $in: bookmarkIds }, user: req.user.id },
                    { $set: { category: data.category } }
                );
                break;

            default:
                return res.status(400).json({ message: 'Invalid bulk action' });
        }

        res.json({ message: 'Bulk operation completed successfully' });
    } catch (error) {
        console.error('Bulk operation failed:', error);
        res.status(500).json({ message: 'Failed to perform bulk operation' });
    }
});

// Update bookmark route
router.put('/:id', protect, async (req, res) => {
    try {
        const bookmark = await Bookmark.findOne({
            _id: req.params.id,
            user: req.user.id
        });

        if (!bookmark) {
            return res.status(404).json({ message: 'Bookmark not found' });
        }

        const { folder, tags, isFavorite, category } = req.body;

        if (folder !== undefined) bookmark.folder = folder;
        if (tags !== undefined) {
            const existingBookmarks = await Bookmark.find({ user: req.user.id });
            const existingTags = Array.from(new Set(
                existingBookmarks.flatMap(b => b.tags || [])
            ));
            bookmark.tags = processTags(tags, existingTags);
        }
        if (isFavorite !== undefined) bookmark.isFavorite = isFavorite;
        if (category !== undefined) bookmark.category = category;

        await bookmark.save();
        res.json(bookmark);
    } catch (error) {
        console.error('Update bookmark error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Delete bookmark route
router.delete('/:id', protect, async (req, res) => {
    try {
        const bookmark = await Bookmark.findOneAndDelete({
            _id: req.params.id,
            user: req.user.id
        });

        if (!bookmark) {
            return res.status(404).json({ message: 'Bookmark not found' });
        }

        res.json({ message: 'Bookmark removed' });
    } catch (error) {
        console.error('Delete bookmark error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Stats route
router.get('/stats', protect, async (req, res) => {
    try {
        const totalBookmarks = await Bookmark.countDocuments({ user: req.user.id });
        const bookmarks = await Bookmark.find({ user: req.user.id });
        const uniqueTags = new Set();
        bookmarks.forEach(bookmark => {
            if (bookmark.tags) {
                bookmark.tags.forEach(tag => uniqueTags.add(tag));
            }
        });
        const tagsCount = uniqueTags.size;

        res.json({
            totalBookmarks,
            tagsCount
        });
    } catch (error) {
        console.error('Stats error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Tags route
router.get('/tags', protect, async (req, res) => {
    try {
        const bookmarks = await Bookmark.find({ user: req.user.id });
        const tagCounts = {};
        
        bookmarks.forEach(bookmark => {
            if (bookmark.tags) {
                bookmark.tags.forEach(tag => {
                    tagCounts[tag] = (tagCounts[tag] || 0) + 1;
                });
            }
        });

        const tags = Object.entries(tagCounts).map(([name, count]) => ({
            name,
            count
        })).sort((a, b) => b.count - a.count);

        res.json(tags);
    } catch (error) {
        console.error('Failed to fetch tags:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;
