const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const Bookmark = require('../models/Bookmark');

async function migrateClickCounts() {
    try {
        const mongoUri = process.env.MONGODB_URI;
        if (!mongoUri) {
            console.error('MONGODB_URI environment variable is not set');
            process.exit(1);
        }

        console.log('Connecting to MongoDB...');
        await mongoose.connect(mongoUri, {
            useNewUrlParser: true,
            useUnifiedTopology: true
        });

        console.log('Connected to MongoDB');

        // Find all bookmarks where clickCount is undefined, null, or not a number
        const bookmarks = await Bookmark.find({
            $or: [
                { clickCount: { $exists: false } },
                { clickCount: null },
                { clickCount: { $not: { $type: "number" } } }
            ]
        });

        console.log(`Found ${bookmarks.length} bookmarks that need migration`);

        // Update each bookmark
        let updatedCount = 0;
        for (const bookmark of bookmarks) {
            bookmark.clickCount = 0;
            await bookmark.save();
            updatedCount++;
            console.log(`Updated bookmark ${bookmark._id} (${updatedCount}/${bookmarks.length})`);
        }

        console.log('Migration completed successfully');
        console.log(`Updated ${updatedCount} bookmarks`);

        await mongoose.connection.close();
        process.exit(0);
    } catch (error) {
        console.error('Migration failed:', error);
        if (mongoose.connection.readyState === 1) {
            await mongoose.connection.close();
        }
        process.exit(1);
    }
}

// Run the migration
console.log('Starting click count migration...');
migrateClickCounts();
