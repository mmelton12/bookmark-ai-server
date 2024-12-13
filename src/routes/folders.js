const express = require('express');
const { body, validationResult } = require('express-validator');
const { protect } = require('../middleware/auth');
const Folder = require('../models/Folder');
const Bookmark = require('../models/Bookmark');
const mongoose = require('mongoose');
const router = express.Router();

// @route   POST /api/folders
// @desc    Create a new folder
// @access  Private
router.post('/', [
    protect,
    body('name').trim().notEmpty().withMessage('Folder name is required')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { name, description, parent, color, icon } = req.body;

        const folder = await Folder.create({
            name,
            description,
            parent,
            color,
            icon,
            user: req.user.id
        });

        res.status(201).json(folder);
    } catch (error) {
        console.error('Folder creation failed:', error);
        res.status(500).json({ message: 'Failed to create folder' });
    }
});

// @route   GET /api/folders
// @desc    Get all folders for a user
// @access  Private
router.get('/', protect, async (req, res) => {
    try {
        const folders = await Folder.find({ user: req.user.id })
            .populate('subfolders');

        console.log('User ID:', req.user.id);

        // Get bookmark counts for all folders
        const bookmarkCounts = await Bookmark.aggregate([
            { 
                $match: { 
                    user: new mongoose.Types.ObjectId(req.user.id) 
                } 
            },
            { 
                $group: { 
                    _id: '$folder', 
                    count: { $sum: 1 } 
                } 
            }
        ]);

        console.log('Bookmark counts:', JSON.stringify(bookmarkCounts, null, 2));

        // Create a map of folder IDs to bookmark counts
        const countMap = new Map(
            bookmarkCounts.map(item => [
                item._id ? item._id.toString() : 'null',
                item.count
            ])
        );

        console.log('Count map:', Object.fromEntries(countMap));

        // Organize folders into a tree structure
        const rootFolders = folders.filter(folder => !folder.parent);
        
        const buildTree = (folder) => {
            const folderObj = folder.toObject();
            const folderId = folder._id.toString();
            folderObj.bookmarkCount = countMap.get(folderId) || 0;
            
            console.log(`Folder "${folder.name}" (${folderId}) count:`, folderObj.bookmarkCount);
            
            folderObj.subfolders = folders
                .filter(f => f.parent?.toString() === folderId)
                .map(buildTree);
            return folderObj;
        };

        const folderTree = rootFolders.map(buildTree);

        console.log('Final folder tree:', JSON.stringify(folderTree, null, 2));

        res.json(folderTree);
    } catch (error) {
        console.error('Error fetching folders:', error);
        res.status(500).json({ message: 'Failed to fetch folders' });
    }
});

// @route   PUT /api/folders/:id
// @desc    Update a folder
// @access  Private
router.put('/:id', [
    protect,
    body('name').trim().notEmpty().withMessage('Folder name is required')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const folder = await Folder.findOne({
            _id: req.params.id,
            user: req.user.id
        });

        if (!folder) {
            return res.status(404).json({ message: 'Folder not found' });
        }

        const { name, description, parent, color, icon } = req.body;

        // Prevent circular reference
        if (parent && parent.toString() === folder._id.toString()) {
            return res.status(400).json({ message: 'Folder cannot be its own parent' });
        }

        folder.name = name;
        folder.description = description;
        folder.parent = parent;
        folder.color = color;
        folder.icon = icon;

        await folder.save();

        res.json(folder);
    } catch (error) {
        console.error('Folder update failed:', error);
        res.status(500).json({ message: 'Failed to update folder' });
    }
});

// @route   DELETE /api/folders/:id
// @desc    Delete a folder
// @access  Private
router.delete('/:id', protect, async (req, res) => {
    try {
        const folder = await Folder.findOne({
            _id: req.params.id,
            user: req.user.id
        });

        if (!folder) {
            return res.status(404).json({ message: 'Folder not found' });
        }

        // Move all bookmarks in this folder to root (null folder)
        await Bookmark.updateMany(
            { folder: folder._id },
            { $set: { folder: null } }
        );

        // Move all subfolders to root
        await Folder.updateMany(
            { parent: folder._id },
            { $set: { parent: null } }
        );

        await folder.deleteOne();

        res.json({ message: 'Folder removed' });
    } catch (error) {
        console.error('Folder deletion failed:', error);
        res.status(500).json({ message: 'Failed to delete folder' });
    }
});

module.exports = router;
