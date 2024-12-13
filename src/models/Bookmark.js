const mongoose = require('mongoose');

const bookmarkSchema = new mongoose.Schema({
    url: {
        type: String,
        required: [true, 'Please provide a URL'],
        match: [
            /^(https?:\/\/)?([\da-z\.-]+)\.([a-z\.]{2,6})([\/\w \.-]*)*\/?$/,
            'Please provide a valid URL'
        ]
    },
    title: {
        type: String,
        trim: true,
        default: ''
    },
    description: {
        type: String,
        trim: true,
        default: ''
    },
    aiSummary: {
        type: String,
        required: [true, 'Summary is required'],
        trim: true
    },
    tags: [{
        type: String,
        trim: true
    }],
    folder: {
        type: mongoose.Schema.ObjectId,
        ref: 'Folder',
        default: null
    },
    category: {
        type: String,
        enum: ['Article', 'Video', 'Research'],
        default: 'Article'
    },
    isFavorite: {
        type: Boolean,
        default: false
    },
    user: {
        type: mongoose.Schema.ObjectId,
        ref: 'User',
        required: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    warning: {
        type: String,
        trim: true
    }
}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// Create compound indexes for efficient searching
bookmarkSchema.index({ tags: 1, user: 1 });
bookmarkSchema.index({ user: 1, createdAt: -1 });
bookmarkSchema.index({ title: 'text', description: 'text', aiSummary: 'text' });
bookmarkSchema.index({ folder: 1, user: 1 });
bookmarkSchema.index({ category: 1, user: 1 });
bookmarkSchema.index({ isFavorite: 1, user: 1 });

// Pre-save middleware to ensure tags array exists
bookmarkSchema.pre('save', function(next) {
    if (!this.tags) {
        this.tags = [];
    }
    // Ensure tags are unique and trimmed
    this.tags = [...new Set(this.tags.map(tag => tag.trim()))];
    next();
});

module.exports = mongoose.model('Bookmark', bookmarkSchema);
