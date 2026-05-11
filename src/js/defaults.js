/**
 * @file defaults.js
 * Default plugin options for videojs-wavesurfer-multitrack.
 */

const pluginDefaultOptions = {
    // Array of waveform-json items from BE. Each item: { type, url, details: { track, channel } }
    tracks: [],
    // Height in pixels for each waveform channel strip.
    channelHeight: 100,
    // 0 = stretch the player container to fit all channels.
    // N = fix container height to N * channelHeight and enable vertical scroll.
    scrollFrom: 0,
    // When true, the total waveform area is sized to playerWidth * 9/16 (16:9 ratio)
    // and channels divide that height equally. Recalculates on resize.
    // scrollFrom is ignored when autoChannelHeight is true.
    autoChannelHeight: false,
    // Wavesurfer visual options (applied to every channel instance).
    waveColor: '#999',
    progressColor: '#555',
    cursorColor: '#fff',
    cursorWidth: 1,
    barWidth: undefined,
    barGap: undefined,
    barRadius: undefined,
    normalize: false,
    // Color of the label text. Defaults to cursorColor when not set.
    labelColor: undefined,
    // Color of the divider line between channels. Accepts any CSS color string.
    dividerColor: 'rgba(255,255,255,0.15)',
    // Fetch options used when loading waveform JSON files.
    // Supports: { credentials: 'include' | 'same-origin' | 'omit' }
    xhr: {},
    // Maximum total waveform area height in px when autoChannelHeight is true.
    // Caps the entire wrapper (all channels combined), not a single channel.
    maxHeight: undefined,
    displayMilliseconds: false,
    // Enable debug console output.
    debug: false
};

export default pluginDefaultOptions;
