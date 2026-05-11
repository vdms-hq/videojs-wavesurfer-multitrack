/**
 * @file format-time.js
 * Format seconds into a time string.
 */

/**
 * Format time in seconds to "MM:SS" or "MM:SS:mmm".
 *
 * @param {number} seconds
 * @param {number} guide - Duration used for formatting decisions.
 * @param {boolean} displayMilliseconds
 * @returns {string}
 */
function formatTime(seconds, guide, displayMilliseconds) {
    seconds = seconds < 0 ? 0 : seconds;
    let s = Math.floor(seconds % 60);
    let m = Math.floor((seconds / 60) % 60);
    let h = Math.floor(seconds / 3600);
    let ms = Math.floor((seconds - Math.floor(seconds)) * 1000);

    // guide is optional
    guide = guide || seconds;
    let gh = Math.floor(guide / 3600);

    let hStr = (gh > 0) ? (h < 10 ? '0' + h + ':' : h + ':') : '';
    let mStr = (m < 10 ? '0' + m : m) + ':';
    let sStr = s < 10 ? '0' + s : s;
    let msStr = displayMilliseconds ? ':' + (ms < 10 ? '00' + ms : ms < 100 ? '0' + ms : ms) : '';

    return hStr + mStr + sStr + msStr;
}

export default formatTime;
