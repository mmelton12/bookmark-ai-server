const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const User = require('../models/User');
const jwt = require('jsonwebtoken');

passport.use(
    new GoogleStrategy(
        {
            clientID: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
            callbackURL: 'https://api.mattymeltz.com/auth/google/callback/flowName=GeneralOAuthFlow',
            proxy: true
        },
        async (accessToken, refreshToken, profile, done) => {
            try {
                // Check if user already exists
                let user = await User.findOne({ googleId: profile.id });

                if (user) {
                    // Generate JWT token
                    const token = jwt.sign(
                        { id: user._id },
                        process.env.JWT_SECRET,
                        { expiresIn: process.env.JWT_EXPIRE }
                    );
                    user = user.toObject();
                    user.token = token;
                    return done(null, user);
                }

                // If user doesn't exist, check if their email is already registered
                user = await User.findOne({ email: profile.emails[0].value });

                if (user) {
                    // Link Google account to existing user
                    user.googleId = profile.id;
                    if (!user.name) user.name = profile.displayName;
                    if (!user.picture) user.picture = profile.photos[0].value;
                    await user.save();
                    
                    // Generate JWT token
                    const token = jwt.sign(
                        { id: user._id },
                        process.env.JWT_SECRET,
                        { expiresIn: process.env.JWT_EXPIRE }
                    );
                    user = user.toObject();
                    user.token = token;
                    return done(null, user);
                }

                // Create new user
                const newUser = await User.create({
                    googleId: profile.id,
                    email: profile.emails[0].value,
                    name: profile.displayName,
                    picture: profile.photos[0].value
                });

                // Generate JWT token
                const token = jwt.sign(
                    { id: newUser._id },
                    process.env.JWT_SECRET,
                    { expiresIn: process.env.JWT_EXPIRE }
                );
                const userObj = newUser.toObject();
                userObj.token = token;
                done(null, userObj);
            } catch (error) {
                console.error('Passport Strategy Error:', error);
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
