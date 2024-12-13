const express = require('express');
const { body, validationResult } = require('express-validator');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const passport = require('passport');
const User = require('../models/User');
const { protect } = require('../middleware/auth');
const router = express.Router();

// Google OAuth Routes
router.get('/google',
    passport.authenticate('google', { scope: ['profile', 'email'] })
);

router.get('/google/callback',
    passport.authenticate('google', { session: false }),
    async (req, res) => {
        try {
            // Token is now generated in passport strategy
            const token = req.user.token;
            
            if (!token) {
                throw new Error('Authentication failed - no token generated');
            }

            // Redirect to frontend with token
            res.redirect(`${process.env.CLIENT_URL}/auth/callback?token=${token}`);
        } catch (error) {
            console.error('Error in Google callback:', error);
            res.redirect(`${process.env.CLIENT_URL}/login?error=auth_failed`);
        }
    }
);

// @route   POST /auth/signup
// @desc    Register a new user
// @access  Public
router.post('/signup', [
    body('email').isEmail().withMessage('Please provide a valid email'),
    body('password')
        .isLength({ min: 6 })
        .withMessage('Password must be at least 6 characters long')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { email, password } = req.body;

        // Check if user exists
        let user = await User.findOne({ email });
        if (user) {
            return res.status(400).json({
                message: 'User already exists'
            });
        }

        // Create user
        user = new User({
            email,
            password,
            aiProvider: 'openai',
            hasCompletedTour: false
        });

        // Save user
        await user.save();

        // Get full user data including API keys
        user = await User.findById(user.id).select('+openAiKey +claudeKey');

        // Create token
        const token = jwt.sign(
            { id: user.id },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRE || '30d' }
        );

        res.status(201).json({
            token,
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                picture: user.picture,
                openAiKey: user.openAiKey,
                claudeKey: user.claudeKey,
                aiProvider: user.aiProvider,
                hasCompletedTour: user.hasCompletedTour,
                createdAt: user.createdAt
            }
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            message: 'Server error'
        });
    }
});

// @route   POST /auth/login
// @desc    Authenticate user & get token
// @access  Public
router.post('/login', [
    body('email').isEmail().withMessage('Please provide a valid email'),
    body('password').exists().withMessage('Password is required')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { email, password } = req.body;

        // Check if user exists
        const user = await User.findOne({ email }).select('+password +openAiKey +claudeKey');
        if (!user) {
            return res.status(400).json({
                message: 'Invalid credentials'
            });
        }

        // Check password
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({
                message: 'Invalid credentials'
            });
        }

        // Create token
        const token = jwt.sign(
            { id: user.id },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRE || '30d' }
        );

        res.json({
            token,
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                picture: user.picture,
                openAiKey: user.openAiKey,
                claudeKey: user.claudeKey,
                aiProvider: user.aiProvider,
                hasCompletedTour: user.hasCompletedTour,
                createdAt: user.createdAt
            }
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            message: 'Server error'
        });
    }
});

// @route   POST /auth/logout
// @desc    Logout user / Clear credentials
// @access  Public
router.post('/logout', (req, res) => {
    res.set('Clear-Site-Data', '"cookies", "storage"');
    res.status(200).json({ message: 'Logged out successfully' });
});

// @route   GET /auth/user
// @desc    Get user data
// @access  Private
router.get('/user', protect, async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('-password +openAiKey +claudeKey');
        if (!user) {
            return res.status(404).json({
                message: 'User not found'
            });
        }
        res.json(user);
    } catch (error) {
        console.error(error);
        res.status(500).json({
            message: 'Server error'
        });
    }
});

// @route   PUT /auth/profile
// @desc    Update user profile
// @access  Private
router.put('/profile', protect, [
    body('name').optional().trim().notEmpty().withMessage('Name cannot be empty if provided'),
    body('email').optional().isEmail().withMessage('Please provide a valid email'),
    body('openAiKey').optional().trim().notEmpty().withMessage('OpenAI API key cannot be empty if provided'),
    body('claudeKey').optional().trim().notEmpty().withMessage('Claude API key cannot be empty if provided'),
    body('aiProvider').optional().isIn(['openai', 'claude']).withMessage('Invalid AI provider'),
    body('hasCompletedTour').optional().isBoolean().withMessage('hasCompletedTour must be a boolean')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { name, email, openAiKey, claudeKey, aiProvider, hasCompletedTour } = req.body;
        const updateFields = {};

        if (name) updateFields.name = name;
        if (openAiKey !== undefined) updateFields.openAiKey = openAiKey;
        if (claudeKey !== undefined) updateFields.claudeKey = claudeKey;
        if (hasCompletedTour !== undefined) updateFields.hasCompletedTour = hasCompletedTour;
        if (aiProvider) {
            if (aiProvider === 'openai' && !openAiKey && !req.user.openAiKey) {
                return res.status(400).json({
                    message: 'OpenAI API key is required when selecting OpenAI as provider'
                });
            }
            if (aiProvider === 'claude' && !claudeKey && !req.user.claudeKey) {
                return res.status(400).json({
                    message: 'Claude API key is required when selecting Claude as provider'
                });
            }
            updateFields.aiProvider = aiProvider;
        }

        if (email) {
            const existingUser = await User.findOne({ email });
            if (existingUser && existingUser._id.toString() !== req.user.id) {
                return res.status(400).json({
                    message: 'Email is already in use'
                });
            }
            updateFields.email = email;
        }

        const user = await User.findByIdAndUpdate(
            req.user.id,
            { $set: updateFields },
            { new: true }
        ).select('-password +openAiKey +claudeKey');

        if (!user) {
            return res.status(404).json({
                message: 'User not found'
            });
        }

        res.json(user);
    } catch (error) {
        console.error(error);
        res.status(500).json({
            message: 'Server error'
        });
    }
});

// @route   PUT /auth/password
// @desc    Update user password
// @access  Private
router.put('/password', protect, [
    body('currentPassword').exists().withMessage('Current password is required'),
    body('newPassword')
        .isLength({ min: 6 })
        .withMessage('New password must be at least 6 characters long')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { currentPassword, newPassword } = req.body;

        const user = await User.findById(req.user.id).select('+password');
        if (!user) {
            return res.status(404).json({
                message: 'User not found'
            });
        }

        const isMatch = await bcrypt.compare(currentPassword, user.password);
        if (!isMatch) {
            return res.status(400).json({
                message: 'Current password is incorrect'
            });
        }

        user.password = newPassword;
        await user.save();

        res.json({
            message: 'Password updated successfully'
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            message: 'Server error'
        });
    }
});

module.exports = router;
