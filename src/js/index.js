/**
 * Entry point for webpack bundle.
 * Imports the plugin (which auto-registers with VideoJS) and the styles.
 */
import './videojs.wavesurfer.multitrack.js';
import '../css/videojs.wavesurfer.multitrack.scss';

export { WavesurferMultitrack } from './videojs.wavesurfer.multitrack.js';
export { parsePeaksJson } from './utils/fetch-peaks';
