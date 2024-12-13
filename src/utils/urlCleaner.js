// URL cleaning utility for consistent bookmark URL handling

/**
 * Extracts YouTube video ID from various YouTube URL formats
 * @param {string} url - The YouTube URL
 * @returns {string|null} - The video ID or null if not found
 */
function extractYouTubeVideoId(url) {
    try {
        const urlObj = new URL(url);
        const hostname = urlObj.hostname.toLowerCase();
        
        // Handle youtu.be format
        if (hostname === 'youtu.be') {
            return urlObj.pathname.slice(1).split('?')[0]; // Remove leading '/' and any query params
        }
        
        // Handle youtube.com format
        if (hostname === 'youtube.com' || hostname === 'www.youtube.com') {
            const videoId = urlObj.searchParams.get('v');
            if (videoId) {
                return videoId;
            }
        }
        
        return null;
    } catch (error) {
        console.error('Error extracting YouTube video ID:', error);
        return null;
    }
}

/**
 * Determines if a URL is a YouTube URL
 * @param {string} url - The URL to check
 * @returns {boolean} - True if it's a YouTube URL
 */
function isYouTubeUrl(url) {
    try {
        const urlObj = new URL(url);
        const hostname = urlObj.hostname.toLowerCase();
        return hostname === 'youtube.com' || 
               hostname === 'www.youtube.com' || 
               hostname === 'youtu.be';
    } catch (error) {
        return false;
    }
}

/**
 * Cleans and normalizes a URL by:
 * - Converting YouTube URLs to youtu.be format
 * - Ensuring it has a protocol (http:// or https://)
 * - Removing trailing slashes
 * - Removing unnecessary 'www.' prefix
 * - Removing URL fragments (#) unless they're part of a route
 * - Removing tracking parameters
 * 
 * @param {string} url - The URL to clean
 * @returns {string} - The cleaned URL
 */
function cleanUrl(url) {
    if (!url) return '';

    try {
        // Add protocol if missing
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
            url = 'https://' + url;
        }

        // Special handling for YouTube URLs
        if (isYouTubeUrl(url)) {
            const videoId = extractYouTubeVideoId(url);
            if (videoId) {
                return `https://youtu.be/${videoId}`;
            }
        }

        const urlObj = new URL(url);

        // Remove 'www.' if present
        let hostname = urlObj.hostname.startsWith('www.') 
            ? urlObj.hostname.slice(4) 
            : urlObj.hostname;

        // Reconstruct the URL without tracking parameters
        const cleanUrl = `${urlObj.protocol}//${hostname}${urlObj.pathname}`;

        // Remove trailing slash unless the path is just '/'
        return cleanUrl.endsWith('/') && cleanUrl.length > 1 
            ? cleanUrl.slice(0, -1) 
            : cleanUrl;
    } catch (error) {
        console.error('Error cleaning URL:', error);
        return url; // Return original URL if cleaning fails
    }
}

module.exports = {
    cleanUrl,
    extractYouTubeVideoId,
    isYouTubeUrl
};
