const mongoose = require('mongoose');

const connectDB = async () => {
    try {
        if (mongoose.connection.readyState === 1) {
            console.log('MongoDB: Reusing existing connection');
            return mongoose.connection;
        }

        const options = {
            useNewUrlParser: true,
            useUnifiedTopology: true,
            serverSelectionTimeoutMS: 10000, // Increased from 5000
            socketTimeoutMS: 60000, // Increased from 45000
            maxPoolSize: 10,
            minPoolSize: 5,
            maxIdleTimeMS: 30000,
            connectTimeoutMS: 10000,
            // Ensure we don't keep retrying in serverless environment
            retryWrites: false,
            retryReads: false
        };

        console.log('Initiating MongoDB connection...');
        const conn = await mongoose.connect(process.env.MONGODB_URI, options);
        
        console.log('MongoDB Connection Details:', {
            host: conn.connection.host,
            name: conn.connection.name,
            readyState: conn.connection.readyState,
            serverConfig: conn.connection.serverConfig ? 'Configured' : 'Not Configured',
            timestamp: new Date().toISOString()
        });

        // Handle connection events
        mongoose.connection.on('error', (err) => {
            console.error('MongoDB connection error:', {
                error: err.message,
                timestamp: new Date().toISOString()
            });
        });

        mongoose.connection.on('disconnected', () => {
            console.log('MongoDB disconnected:', {
                timestamp: new Date().toISOString()
            });
        });

        mongoose.connection.on('connected', () => {
            console.log('MongoDB connected:', {
                timestamp: new Date().toISOString()
            });
        });

        // Graceful shutdown
        process.on('SIGINT', async () => {
            try {
                await mongoose.connection.close();
                console.log('MongoDB connection closed through app termination');
                process.exit(0);
            } catch (err) {
                console.error('Error during MongoDB shutdown:', err);
                process.exit(1);
            }
        });

        return conn.connection;

    } catch (error) {
        console.error('MongoDB Connection Error Details:', {
            message: error.message,
            code: error.code,
            stack: error.stack,
            uri: process.env.MONGODB_URI ? 'URI is set' : 'URI is missing',
            timestamp: new Date().toISOString()
        });
        
        // In production, we want to keep the serverless function running
        if (process.env.NODE_ENV === 'production') {
            console.error('Production environment - continuing despite MongoDB connection error');
            return null;
        } else {
            process.exit(1);
        }
    }
};

module.exports = connectDB;
