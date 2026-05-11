/**
 * @file event.js
 * Event name constants for videojs-wavesurfer-multitrack.
 */

class Event {}

// video.js events
Event.READY = 'ready';
Event.ERROR = 'error';
Event.VOLUMECHANGE = 'volumechange';
Event.FULLSCREENCHANGE = 'fullscreenchange';
Event.TIMEUPDATE = 'timeupdate';
Event.ENDED = 'ended';
Event.PAUSE = 'pause';
Event.PLAY = 'play';
Event.SEEKING = 'seeking';
Event.SEEKED = 'seeked';
Event.LOADEDMETADATA = 'loadedmetadata';

// videojs-wavesurfer-multitrack plugin events
Event.WAVE_READY = 'waveReady';
Event.WAVE_ERROR = 'waveError';
Event.TRACKS_LOADED = 'tracksLoaded';
Event.PLAYBACK_FINISH = 'playbackFinish';

// dom
Event.RESIZE = 'resize';

Object.freeze(Event);

export default Event;
