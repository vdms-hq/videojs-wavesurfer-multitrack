# @vdms-vida/videojs-wavesurfer-multitrack

A [Video.js](https://videojs.com/) plugin that displays multiple stacked waveform channels synced to VideoJS playback, using [wavesurfer.js](https://wavesurfer.xyz/).

Inspired by and modelled after [videojs-wavesurfer](https://github.com/collab-project/videojs-wavesurfer).

## Features

- Multiple stacked waveform channels, one per audio track/channel
- Cursor automatically syncs with VideoJS playback (no manual polling)
- Click-to-seek on any channel waveform
- Scrollable container (fixed height) or expandable (stretch to fit all channels)
- `loadTracks()` — swap waveforms live without reinitializing the VideoJS player
- `changeTrack()` — filter to a single track by ID, playback continues seamlessly
- XHR credentials support for signed/authenticated waveform JSON URLs
- Accepts waveform data directly in the format returned by your backend

## Installation

```bash
npm install @vdms-vida/videojs-wavesurfer-multitrack
```

### Peer dependencies

```bash
npm install video.js wavesurfer.js
```

Compatible with **wavesurfer.js v6.x** (same version used by `videojs-wavesurfer`). Uses `backend: 'MediaElement'` so the cursor syncs automatically to the VideoJS media element — no conflicts with `videojs-wavesurfer` running alongside.

## Usage

```js
import videojs from 'video.js';
import 'wavesurfer.js';
import '@vdms-vida/videojs-wavesurfer-multitrack/dist/videojs.wavesurfer.multitrack.js';
import '@vdms-vida/videojs-wavesurfer-multitrack/dist/css/videojs.wavesurfer.multitrack.css';

const player = videojs('my-player', {
    controls: true,
    plugins: {
        wavesurferMultitrack: {
            tracks: myTracksArray,      // waveform-json items from BE (see below)
            channelHeight: 80,          // height per channel in px
            scrollFrom: 3,              // 0 = expand; N = scroll after N channels
            displayMilliseconds: false,
            debug: true,
            progressColor: '#3573FF',
            waveColor: '#A4A9B7',
            cursorColor: '#fff',
            barWidth: 1,
            normalize: true,
            xhr: {
                credentials: 'include', // for signed/authenticated URLs
            },
        },
    },
});

// Listen for events
player.on('waveReady', () => console.log('All waveforms rendered'));
player.on('tracksLoaded', () => console.log('loadTracks() completed'));
player.on('waveError', (e, err) => console.error('Waveform error', err));
```

### Input track format

Pass the `waveform-json` entries directly as `tracks`. The plugin filters for `type === "waveform-json"` and sorts by `details.track` then `details.channel`:

```json
[
    { "type": "waveform-json", "url": "https://example.com/track1_ch1_waveform.json", "details": { "track": 1, "channel": 1 } },
    { "type": "waveform-json", "url": "https://example.com/track1_ch2_waveform.json", "details": { "track": 1, "channel": 2 } },
    { "type": "waveform-json", "url": "https://example.com/track2_ch1_waveform.json", "details": { "track": 2, "channel": 1 } },
    { "type": "main", "url": "...", "contentType": "image/jpg" },
    { "type": "waveform",  "url": "...", "contentType": "image/jpg" }
]
```

Items with `type` other than `"waveform-json"` are ignored automatically.

The JSON files must be in [audiowaveform](https://github.com/bbc/audiowaveform) format:

```json
{
    "version": 2,
    "channels": 1,
    "sample_rate": 44100,
    "samples_per_pixel": 512,
    "bits": 8,
    "length": 1234,
    "data": [0, 1, -1, 2, "..."]
}
```

## Live track swap

Call `loadTracks()` at any time (e.g. when the user switches to a different video) to replace the waveforms without reinitializing the VideoJS player:

```js
// e.g. on video source change
player.src({ src: newVideoUrl, type: 'video/mp4' });
player.wavesurferMultitrack().loadTracks(newTracksArray);
```

## Filtering by track — `changeTrack()`

When your tracks array contains multiple tracks (e.g. original + dubbed), use `changeTrack()` to switch between them. Playback position and state are preserved across the switch.

```js
const plugin = player.wavesurferMultitrack();

plugin.changeTrack(1);     // show only channels where details.track === 1
plugin.changeTrack(2);     // switch to track 2 — resumes from same position
plugin.changeTrack(null);  // clear filter, show all tracks
```

The `trackId` must match the `details.track` field in your waveform-json items.

## Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `tracks` | `Array` | `[]` | Array of BE thumbnail objects. Items with `type === "waveform-json"` are used. |
| `channelHeight` | `Number` | `100` | Height in px for each waveform channel strip. |
| `scrollFrom` | `Number` | `0` | `0` = stretch container height to fit all channels. `N` = fix container to `N * channelHeight` px and enable vertical scroll. |
| `autoChannelHeight` | `Boolean` | `false` | When `true`, the total waveform area height = `playerWidth × 9/16` (16:9 ratio). Channels divide that height equally and the layout recalculates dynamically on resize. `scrollFrom` is ignored when this is active. |
| `maxHeight` | `Number` | `undefined` | Maximum total waveform area height in px when `autoChannelHeight` is active. Caps the whole wrapper regardless of channel count. Has no effect otherwise. |
| `waveColor` | `String` | `'#999'` | Waveform (unplayed) color. |
| `progressColor` | `String` | `'#555'` | Progress (played) color. |
| `cursorColor` | `String` | `'#fff'` | Playback cursor color. |
| `cursorWidth` | `Number` | `1` | Cursor width in px. |
| `barWidth` | `Number` | `undefined` | Bar width in px. `undefined` = line/wave mode. |
| `barGap` | `Number` | `undefined` | Gap between bars in px. |
| `barRadius` | `Number` | `undefined` | Bar border radius in px. |
| `normalize` | `Boolean` | `false` | Normalize peaks to max amplitude. |
| `xhr` | `Object` | `{}` | Fetch options for waveform JSON requests. Supports `{ credentials: 'include' \| 'same-origin' \| 'omit' }`. |
| `displayMilliseconds` | `Boolean` | `false` | Show milliseconds in time display. |
| `debug` | `Boolean` | `false` | Enable debug console output. |

## Events

Events are triggered on the VideoJS `player` instance:

| Event | Description |
|-------|-------------|
| `waveReady` | All waveform channels have rendered. |
| `waveError` | An error occurred fetching peaks or creating a WaveSurfer instance. |
| `tracksLoaded` | `loadTracks()` has finished initiating the new track set. |
| `playbackFinish` | VideoJS `ended` event forwarded through the plugin. |

## Public API

```js
const plugin = player.wavesurferMultitrack();

plugin.loadTracks(tracksArray);  // Swap waveforms live
plugin.changeTrack(1);           // Filter to track 1 (null = show all)
plugin.getCurrentTime();         // Current time in seconds
plugin.getDuration();            // Duration in seconds
plugin.isReady();                // true when all waveforms are rendered
```

## Build

```bash
npm run build      # build dev + min → dist/
npm run start      # webpack dev server on :9000
```

## License

MIT
