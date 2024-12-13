const stringSimilarity = require('string-similarity');

// Common word variations to normalize
const COMMON_VARIATIONS = {
    plurals: {
        's': '', // images -> image
        'es': '', // classes -> class
        'ies': 'y', // technologies -> technology
    },
    prefixes: {
        'the ': '',
        'a ': '',
        'an ': '',
    }
};

// Words that should be kept as-is (don't normalize these)
const PRESERVED_TERMS = new Set([
    'aws', // Cloud services
    'apis', // Technical terms
    'dns',
    'ios',
    'css',
    'sass',
    'less',
    'news', // Common terms that look like plurals but aren't
    'devops',
    'kubernetes', // Technology names
    'tensorflow',
]);

/**
 * Normalizes a tag by applying common rules
 * @param {string} tag - The tag to normalize
 * @returns {string} - The normalized tag
 */
const normalizeTag = (tag) => {
    if (!tag) return '';
    
    // Convert to lowercase and trim
    let normalized = tag.toLowerCase().trim();
    
    // Don't normalize preserved terms
    if (PRESERVED_TERMS.has(normalized)) {
        return normalized;
    }

    // Remove prefixes
    for (const [prefix, replacement] of Object.entries(COMMON_VARIATIONS.prefixes)) {
        if (normalized.startsWith(prefix)) {
            normalized = normalized.replace(prefix, replacement);
        }
    }

    // Handle plurals
    for (const [suffix, replacement] of Object.entries(COMMON_VARIATIONS.plurals)) {
        if (normalized.endsWith(suffix) && normalized.length > suffix.length) {
            const singular = normalized.slice(0, -suffix.length) + replacement;
            // Only apply if it makes a valid word (basic check)
            if (singular.length >= 2) {
                normalized = singular;
            }
        }
    }

    return normalized;
};

/**
 * Checks if a tag is similar to any existing tags
 * @param {string} newTag - The new tag to check
 * @param {string[]} existingTags - Array of existing tags
 * @param {number} similarityThreshold - Threshold for similarity (0-1)
 * @returns {string|null} - Returns the most similar existing tag or null if no similar tags found
 */
const findSimilarTag = (newTag, existingTags, similarityThreshold = 0.85) => {
    const normalizedNew = normalizeTag(newTag);
    
    // First check for exact matches after normalization
    const exactMatch = existingTags.find(tag => normalizeTag(tag) === normalizedNew);
    if (exactMatch) {
        return exactMatch;
    }

    // Then check for similar tags
    const matches = stringSimilarity.findBestMatch(normalizedNew, existingTags);
    if (matches.bestMatch.rating >= similarityThreshold) {
        return matches.bestMatch.target;
    }

    return null;
};

/**
 * Processes an array of tags, normalizing them and handling duplicates/similarities
 * @param {string[]} newTags - Array of new tags to process
 * @param {string[]} existingTags - Array of existing tags in the system
 * @returns {string[]} - Array of processed tags
 */
const processTags = (newTags, existingTags) => {
    const processedTags = new Set();

    for (const tag of newTags) {
        const normalizedTag = normalizeTag(tag);
        
        // Skip empty tags
        if (!normalizedTag) continue;

        // Check for similar existing tags
        const similarTag = findSimilarTag(normalizedTag, existingTags);
        
        if (similarTag) {
            // Use the existing similar tag
            processedTags.add(similarTag);
        } else {
            // Use the normalized version of the new tag
            processedTags.add(normalizedTag);
        }
    }

    return Array.from(processedTags);
};

module.exports = {
    normalizeTag,
    findSimilarTag,
    processTags
};
