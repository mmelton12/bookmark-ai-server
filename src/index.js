require('dotenv').config();
const express = require('express');
const cors = require('cors');
const passport = require('passport');
const connectDB = require('./config/database');

// Import passport config
require('./config/passport');

// Import routes
const authRoutes = require('./routes/auth');
const bookmarkRoutes = require('./routes/bookmarks');
const folderRoutes = require('./routes/folders');
const chatRoutes = require('./routes/chat');

// Initialize express
const app = express();

// Connect to MongoDB
connectDB().catch(err => {
    console.error('MongoDB connection error:', err);
});

// Middleware
const corsOptions = {
    origin: (origin, callback) => {
        const allowedOrigins = [
            process.env.CLIENT_URL,
            'https://mattymeltz.com',
            'https://www.mattymeltz.com',
            'https://client-ogbbdkkkg-samsondigital.vercel.app',
            'https://client-ashy-five-39.vercel.app'
        ];
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    maxAge: 86400 // 24 hours
};

// Apply middleware
app.use(cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Initialize passport without session
app.use(passport.initialize());

// Request logging middleware
app.use((req, res, next) => {
    console.log('Incoming request:', {
        method: req.method,
        path: req.path,
        origin: req.get('origin'),
        timestamp: new Date().toISOString()
    });
    next();
});

// Response time logging middleware
app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
        const duration = Date.now() - start;
        console.log('Request completed:', {
            method: req.method,
            path: req.path,
            status: res.statusCode,
            duration: `${duration}ms`,
            timestamp: new Date().toISOString()
        });
    });
    next();
});

// Mount routes
app.use('/auth', authRoutes);
app.use('/bookmarks', bookmarkRoutes);
app.use('/folders', folderRoutes);
app.use('/chat', chatRoutes);

// Basic route
app.get('/', (req, res) => {
    res.json({ message: 'Welcome to Bookmark AI API' });
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Error details:', {
        message: err.message,
        stack: err.stack,
        path: req.path,
        method: req.method,
        body: req.body,
        query: req.query,
        timestamp: new Date().toISOString()
    });

    res.status(err.status || 500).json({
        message: err.message || 'Something went wrong!',
        error: process.env.NODE_ENV === 'development' ? {
            stack: err.stack,
            details: err
        } : {}
    });
});

// For local development server
if (process.env.NODE_ENV !== 'production') {
    const PORT = process.env.PORT || 5001;
    app.listen(PORT, () => {
        console.log(`Server is running on port ${PORT}`);
        console.log('Environment:', process.env.NODE_ENV);
        console.log('MongoDB URI:', process.env.MONGODB_URI ? 'Set' : 'Not set');
        console.log('JWT Secret:', process.env.JWT_SECRET ? 'Set' : 'Not set');
        console.log('Google OAuth:', process.env.GOOGLE_CLIENT_ID ? 'Set' : 'Not set');
    });
}

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
    console.error('UNHANDLED REJECTION! 💥 Details:', {
        name: err.name,
        message: err.message,
        stack: err.stack,
        timestamp: new Date().toISOString()
    });
    // In production, we might want to gracefully shutdown instead of exiting
    if (process.env.NODE_ENV === 'production') {
        console.error('Production environment - continuing despite error');
    } else {
        process.exit(1);
    }
});

module.exports = app;
