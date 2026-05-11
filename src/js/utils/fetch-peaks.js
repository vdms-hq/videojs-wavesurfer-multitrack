/**
 * @file fetch-peaks.js
 * Fetches an audiowaveform-compatible JSON file and converts it to the
 * peaks format expected by wavesurfer.js v7: number[][]
 *
 * Audiowaveform JSON structure:
 * {
 *   version: 2,
 *   channels: 1,
 *   sample_rate: 44100,
 *   samples_per_pixel: 512,
 *   bits: 8 | 16,
 *   length: N,
 *   data: [min0, max0, min1, max1, ...]   // interleaved min/max per channel
 * }
 *
 * wavesurfer.js peaks format: [[ch0_sample0, ch0_sample1, ...], [ch1_sample0, ...]]
 * where values are typically in range -1 to 1 (normalized) or raw int depending on bits.
 */

/**
 * Fetch peaks data from a URL.
 *
 * @param {string} url - URL of the audiowaveform JSON file.
 * @param {Object} [xhrOptions={}] - Fetch options (e.g. { credentials: 'include' }).
 * @returns {Promise<number[][]>} Peaks data as array of channels.
 */
async function fetchPeaks(url, xhrOptions = {}) {
    const fetchOptions = {};
    if (xhrOptions.credentials) {
        fetchOptions.credentials = xhrOptions.credentials;
    }

    const response = await fetch(url, fetchOptions);
    if (!response.ok) {
        throw new Error(`Failed to fetch peaks from ${url}: ${response.status} ${response.statusText}`);
    }

    const json = await response.json();

    return parsePeaksJson(json);
}

/**
 * Parse an audiowaveform JSON object into wavesurfer.js peaks format.
 *
 * @param {Object} json - Parsed audiowaveform JSON.
 * @returns {number[][]} Peaks per channel.
 */
function parsePeaksJson(json) {
    const data = json.data;
    if (!data || !Array.isArray(data) || data.length === 0) {
        return [new Float32Array(0)];
    }

    const channels = json.channels || 1;
    const bits = json.bits || 8;
    // Normalize to -1..1 range
    const scale = bits === 16 ? 32768 : 128;

    // data layout: [ch0_min0, ch0_max0, ch1_min0, ch1_max0, ch0_min1, ch0_max1, ...]
    // i.e. for each sample pair: channels * 2 values interleaved
    const samplesPerChannel = Math.floor(data.length / (channels * 2));
    const channelPeaks = [];

    for (let c = 0; c < channels; c++) {
        const peaks = new Float32Array(samplesPerChannel * 2);
        for (let i = 0; i < samplesPerChannel; i++) {
            const offset = i * channels * 2 + c * 2;
            peaks[i * 2] = data[offset] / scale;       // min
            peaks[i * 2 + 1] = data[offset + 1] / scale; // max
        }
        channelPeaks.push(peaks);
    }

    return channelPeaks;
}

export { fetchPeaks, parsePeaksJson };
