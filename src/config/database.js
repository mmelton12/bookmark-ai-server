const mongoose = require('mongoose');

const connectDB = async () => {
    try {
        if (mongoose.connection.readyState === 1) {
            console.log('MongoDB: Reusing existing connection');
            return;
        }

        const options = {
            useNewUrlParser: true,
            useUnifiedTopology: true,
            serverSelectionTimeoutMS: 5000,
            socketTimeoutMS: 45000,
        };

        const conn = await mongoose.connect(process.env.MONGODB_URI, options);
        
        console.log('MongoDB Connection Details:', {
            host: conn.connection.host,
            name: conn.connection.name,
            readyState: conn.connection.readyState,
            serverConfig: conn.connection.serverConfig ? 'Configured' : 'Not Configured'
        });

        mongoose.connection.on('error', (err) => {
            console.error('MongoDB connection error:', err);
        });

        mongoose.connection.on('disconnected', () => {
            console.log('MongoDB disconnected');
        });

        process.on('SIGINT', async () => {
            await mongoose.connection.close();
            console.log('MongoDB connection closed through app termination');
            process.exit(0);
        });

    } catch (error) {
        console.error('MongoDB Connection Error Details:', {
            message: error.message,
            code: error.code,
            stack: error.stack,
            uri: process.env.MONGODB_URI ? 'URI is set' : 'URI is missing'
        });
        
        // In production, we want to keep the serverless function running
        if (process.env.NODE_ENV === 'production') {
            console.error('Production environment - continuing despite MongoDB connection error');
        } else {
            process.exit(1);
        }
    }
};

module.exports = connectDB;
