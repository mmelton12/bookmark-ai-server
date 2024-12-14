const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const User = require('../models/User');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const SERVER_URL = process.env.SERVER_URL || 'https://api.mattymeltz.com';

// PKCE Code Verifier storage (in production this should be in a session or database)
const codeVerifiers = new Map();

// Generate PKCE code verifier
function generateCodeVerifier() {
    return crypto.randomBytes(32).toString('base64url');
}

// Generate PKCE code challenge
function generateCodeChallenge(verifier) {
    const hash = crypto.createHash('sha256');
    hash.update(verifier);
    return hash.digest('base64url');
}

passport.use(
    new GoogleStrategy(
        {
            clientID: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
            callbackURL: `${SERVER_URL}/auth/google/callback`,
            proxy: true,
            state: true, // Enable state parameter for CSRF protection
            passReqToCallback: true // Pass request object to callback
        },
        async (req, accessToken, refreshToken, profile, done) => {
            try {
                console.log('Processing Google profile:', {
                    id: profile.id,
                    email: profile.emails[0].value,
                    timestamp: new Date().toISOString()
                });

                // Verify state parameter
                if (!req.query.state || req.query.state !== req.session?.oauth2state) {
                    return done(new Error('Invalid state parameter'), null);
                }

                // First try to find by googleId for quick lookup
                let user = await User.findOne({ googleId: profile.id });

                if (!user) {
                    // If not found by googleId, check email
                    user = await User.findOne({ email: profile.emails[0].value });

                    if (user) {
                        // Update existing user with Google info
                        user.googleId = profile.id;
                        if (!user.name) user.name = profile.displayName;
                        if (!user.picture) user.picture = profile.photos[0].value;
                        await user.save();
                    } else {
                        // Create new user
                        user = await User.create({
                            googleId: profile.id,
                            email: profile.emails[0].value,
                            name: profile.displayName,
                            picture: profile.photos[0].value
                        });
                    }
                }

                // Generate JWT token
                const token = jwt.sign(
                    { id: user._id },
                    process.env.JWT_SECRET,
                    { expiresIn: process.env.JWT_EXPIRE || '30d' }
                );

                console.log('Authentication successful:', {
                    userId: user._id,
                    timestamp: new Date().toISOString()
                });

                // Return user object with token
                const userObj = user.toObject();
                userObj.token = token;
                return done(null, userObj);
            } catch (error) {
                console.error('Passport Strategy Error:', {
                    error: error.message,
                    stack: error.stack,
                    timestamp: new Date().toISOString()
                });
                done(error, null);
            }
        }
    )
);

// These are not strictly necessary for JWT-based auth but kept for compatibility
passport.serializeUser((user, done) => {
    done(null, user);
});

passport.deserializeUser((user, done) => {
    done(null, user);
});

module.exports = {
    passport,
    generateCodeVerifier,
    generateCodeChallenge,
    codeVerifiers
};
