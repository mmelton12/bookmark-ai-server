const mongoose = require('mongoose');

const folderSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Please provide a folder name'],
        trim: true
    },
    description: {
        type: String,
        trim: true,
        default: ''
    },
    parent: {
        type: mongoose.Schema.ObjectId,
        ref: 'Folder',
        default: null
    },
    user: {
        type: mongoose.Schema.ObjectId,
        ref: 'User',
        required: true
    },
    color: {
        type: String,
        default: '#808080' // Default gray color
    },
    icon: {
        type: String,
        default: 'folder' // Default icon name
    }
}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// Virtual populate for getting subfolders
folderSchema.virtual('subfolders', {
    ref: 'Folder',
    localField: '_id',
    foreignField: 'parent'
});

// Virtual populate for getting bookmarks in this folder
folderSchema.virtual('bookmarks', {
    ref: 'Bookmark',
    localField: '_id',
    foreignField: 'folder'
});

// Compound indexes for efficient querying
folderSchema.index({ user: 1, parent: 1 });
folderSchema.index({ user: 1, name: 1 });

module.exports = mongoose.model('Folder', folderSchema);
