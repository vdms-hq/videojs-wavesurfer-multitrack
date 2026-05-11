/**
 * @file videojs.wavesurfer.multitrack.js
 *
 * VideoJS plugin that displays multiple stacked waveform channels
 * using wavesurfer.js instances synced to the VideoJS media element.
 *
 * Each channel is a peaks-only WaveSurfer instance (no separate audio).
 * The VideoJS media element is passed as `media` to each WaveSurfer so
 * that the cursor automatically follows playback — no manual polling needed.
 */

import videojs from 'video.js';
import WaveSurfer from 'wavesurfer.js';

import Event from './event';
import pluginDefaultOptions from './defaults';
import { fetchPeaks } from './utils/fetch-peaks';
import formatTime from './utils/format-time';

const Plugin = videojs.getPlugin('plugin');

const PLUGIN_NAME = 'wavesurferMultitrack';
const PLUGIN_CLASS = 'vjs-wavesurfer-multitrack';
const WRAPPER_CLASS = 'vjs-multitrack-wrapper';
const CHANNEL_CLASS = 'vjs-multitrack-channel';

/**
 * VideoJS plugin that renders multiple stacked waveform channels.
 *
 * @class
 * @augments videojs.Plugin
 */
class WavesurferMultitrack extends Plugin {
    /**
     * @param {videojs.Player} player
     * @param {Object} options
     */
    constructor(player, options) {
         super(player, options);

        // Merge defaults + user options
        if (videojs.obj !== undefined) {
            this.opts = videojs.obj.merge(pluginDefaultOptions, options);
        } else {
            this.opts = videojs.mergeOptions(pluginDefaultOptions, options);
        }

        this.debug = this.opts.debug === true || String(this.opts.debug) === 'true';
        this.displayMilliseconds = this.opts.displayMilliseconds;

        /** @type {WaveSurfer[]} */
        this._wavesurfers = [];
        /** @type {HTMLElement|null} */
        this._wrapper = null;
        /** @type {boolean} */
        this._waveReady = false;
        /** @type {number} */
        this._readyCount = 0;
        /** @type {Array} Full raw tracks array as last passed to loadTracks(). */
        this._allTracks = [];
        /** @type {string|null} Active track filter — null means show all tracks. */
        this._activeTrack = null;

        // Add plugin CSS class to player
        player.addClass(PLUGIN_CLASS);

        // Wait for player UI to be ready before initializing.
        // player.ready() fires immediately if the player is already ready (unlike player.one).
        this.player.ready(this._initialize.bind(this));
    }

    /**
     * Called once the VideoJS player UI is ready.
     * Sets up the waveform container and loads initial tracks.
     * @private
     */
    _initialize() {

        // Hide big play button (wavesurfer click-to-seek will handle interaction)
        if (this.player.bigPlayButton) {
            this.player.bigPlayButton.hide();
        }

        // Ensure control bar is visible
        if (this.player.options_.controls === true) {
            this.player.controlBar.show();
            this.player.controlBar.el_.style.display = 'flex';

            if (this.player.controlBar.pictureInPictureToggle) {
                this.player.controlBar.pictureInPictureToggle.hide();
            }

            const uiElements = ['currentTimeDisplay', 'timeDivider', 'durationDisplay'];
            uiElements.forEach((name) => {
                const el = this.player.controlBar[name];
                if (el) {
                    el.el_.style.display = 'block';
                    el.show();
                }
            });

            if (this.player.controlBar.remainingTimeDisplay) {
                this.player.controlBar.remainingTimeDisplay.hide();
            }
        }

        // Create the multitrack wrapper div inside the player
        this._createWrapper();

        // Redraw wavesurfers when the player is resized (handles browser zoom too).
        // Debounced to avoid thrashing during continuous resize.
        this._resizeObserver = null;
        if (typeof ResizeObserver !== 'undefined') {
            let resizeTimer = null;
            this._resizeObserver = new ResizeObserver(() => {
                clearTimeout(resizeTimer);
                resizeTimer = setTimeout(() => {
                    this._onResize();
                }, 100);
            });
            this._resizeObserver.observe(this.player.el_);
        }

        // Listen for VideoJS events to keep time display in sync
        this.player.on(Event.TIMEUPDATE, this._onTimeUpdate.bind(this));
        this.player.on(Event.VOLUMECHANGE, this._onVolumeChange.bind(this));
        this.player.on(Event.FULLSCREENCHANGE, this._onScreenChange.bind(this));
        this.player.on(Event.ENDED, this._onEnded.bind(this));

        // Load initial tracks if provided
        if (this.opts.tracks && this.opts.tracks.length > 0) {
            this.loadTracks(this.opts.tracks);
        }
    }

    /**
     * Create the wrapper div inside the VideoJS player element.
     * Positioned absolutely (like other vjs UI elements) so it has a real
     * clientWidth equal to the player width — the same technique videojs-wavesurfer uses.
     * @private
     */
    _createWrapper() {
        // Remove existing wrapper if any
        this._removeWrapper();

        const wrapper = document.createElement('div');
        wrapper.className = WRAPPER_CLASS;

        // Position absolutely so it overlays the video tech and inherits the
        // player's real rendered width. z-index 2 puts it above vjs-tech (z:0).
        wrapper.style.position = 'absolute';
        wrapper.style.top = '0';
        wrapper.style.left = '0';
        wrapper.style.width = '100%';
        wrapper.style.zIndex = '2';
        wrapper.style.overflow = 'hidden';
        wrapper.style.boxSizing = 'border-box';
        wrapper.style.background = 'transparent';

        // Insert before the control bar so controls stay on top
        const controlBar = this.player.el_.querySelector('.vjs-control-bar');
        if (controlBar) {
            this.player.el_.insertBefore(wrapper, controlBar);
        } else {
            this.player.el_.appendChild(wrapper);
        }

        this._wrapper = wrapper;
    }

    /**
     * Apply height / overflow styles to the wrapper AND resize the VideoJS player
     * to fit all channels + control bar.
     * @param {HTMLElement} wrapper
     * @param {number} channelCount
     * @param {number} effectiveChannelHeight - Actual per-channel height after auto-fit.
     * @private
     */
    _applyWrapperStyles(wrapper, channelCount, effectiveChannelHeight) {
        const { channelHeight, scrollFrom } = this.opts;

        if (!this.opts.autoChannelHeight && scrollFrom > 0 && channelCount > 0) {
            const maxWrapperHeight = scrollFrom * channelHeight;
            const contentHeight = channelCount * effectiveChannelHeight;
            const wrapperHeight = Math.min(contentHeight, maxWrapperHeight);
            wrapper.style.height = wrapperHeight + 'px';
            wrapper.style.overflowY = channelCount > scrollFrom ? 'auto' : 'hidden';
            this._resizePlayer(wrapperHeight);
        } else {
            // Expand: stretch player to fit all channels at their effective height
            const totalHeight = channelCount > 0 ? channelCount * effectiveChannelHeight : 0;
            wrapper.style.height = totalHeight + 'px';
            wrapper.style.overflowY = 'hidden';
            if (channelCount > 0) {
                this._resizePlayer(totalHeight);
            }
        }
    }

    /**
     * Resize the VideoJS player element to accommodate the waveform area + control bar.
     * @param {number} waveformHeight
     * @private
     */
    _resizePlayer(waveformHeight) {
        const controlBarEl = this.player.el_.querySelector('.vjs-control-bar');
        const controlBarHeight = controlBarEl ? controlBarEl.offsetHeight || 30 : 30;
        const totalHeight = waveformHeight + controlBarHeight;
        this.player.el_.style.height = totalHeight + 'px';
        try {
            this.player.height(totalHeight);
        } catch (e) {
            // ignore — direct DOM style above is enough
        }
    }

    /**
     * Remove wrapper and destroy all WaveSurfer instances.
     * @private
     */
    _removeWrapper() {
        this._destroyWaveSurfers();

        if (this._wrapper && this._wrapper.parentNode) {
            this._wrapper.parentNode.removeChild(this._wrapper);
        }
        this._wrapper = null;
    }

    /**
     * Destroy all WaveSurfer instances without touching the DOM wrapper.
     * @private
     */
    _destroyWaveSurfers() {
        this._wavesurfers.forEach((ws) => {
            try {
                ws.destroy();
            } catch (e) {
                // ignore
            }
        });
        this._wavesurfers = [];
        this._waveReady = false;
        this._readyCount = 0;
    }

    /**
     * Load (or reload) waveform tracks. Filters for type=waveform-json, fetches peaks,
     * and creates one WaveSurfer instance per channel. Safe to call multiple times — the
     * previous waveforms are destroyed and the wrapper is cleared before creating new ones.
     *
     * @param {Array} tracks - Array of BE thumbnail objects. Only items with
     *   `type === "waveform-json"` are used. Each item must have `url` and
     *   `details: { track: number, channel: number }`.
     */
    loadTracks(tracks) {
        if (!tracks || !Array.isArray(tracks)) {
        this._log('loadTracks: invalid tracks argument', 'warn');
            return;
        }

        // Persist the full raw array so changeTrack() can re-filter without a new loadTracks() call
        this._allTracks = tracks;

        // Filter: waveform-json only, then by active track (if set)
        const items = tracks
            .filter((t) => {
                if (!t || t.type !== 'waveform-json' || !t.url) return false;
                if (this._activeTrack !== null && this._activeTrack !== undefined) {
                    return (t.details && t.details.track) === this._activeTrack;
                }
                return true;
            })
            .sort((a, b) => {
                const ta = (a.details && a.details.track) || 0;
                const tb = (b.details && b.details.track) || 0;
                if (ta !== tb) return ta - tb;
                const ca = (a.details && a.details.channel) || 0;
                const cb = (b.details && b.details.channel) || 0;
                return ca - cb;
            });

        if (items.length === 0) {
            const filterNote = this._activeTrack ? ' for track "' + this._activeTrack + '"' : '';
            this._log('loadTracks: no waveform-json items found' + filterNote, 'warn');
            this._destroyWaveSurfers();
            if (this._wrapper) {
                this._wrapper.innerHTML = '';
            }
            return;
        }

        // Destroy previous wavesurfers and clear wrapper content
        this._destroyWaveSurfers();

        if (!this._wrapper) {
            this._createWrapper();
        } else {
            this._wrapper.innerHTML = '';
        }

        // For non-auto mode: calculate effective channel height and apply wrapper styles now.
        // For auto 16:9 mode: height depends on measured playerWidth, calculated inside doCreate().
        const { channelHeight, scrollFrom } = this.opts;
        let effectiveChannelHeight = channelHeight;
        if (!this.opts.autoChannelHeight) {
            const isScrollAutoMode = scrollFrom > 0 && items.length > 0 && items.length <= scrollFrom;
            if (isScrollAutoMode) {
                const viewportHeight = scrollFrom * channelHeight;
                const cappedHeight = this.opts.maxHeight ? Math.min(viewportHeight, this.opts.maxHeight) : viewportHeight;
                effectiveChannelHeight = Math.floor(cappedHeight / items.length);
            }
            this._applyWrapperStyles(this._wrapper, items.length, effectiveChannelHeight);
        }

        // Fetch all peaks then create WaveSurfer instances
        const fetchPromises = items.map((item) =>
            fetchPeaks(item.url, this.opts.xhr || {}).catch((err) => {
                this._log('Failed to fetch peaks for ' + item.url + ': ' + err.message, 'error');
                return null;
            })
        );

        Promise.all(fetchPromises).then((peaksArray) => {
            // Get the VideoJS media element for cursor sync
            const mediaEl = this._getMediaElement();
            const totalChannels = peaksArray.length;

            const doCreate = (retryCount = 0) => {
                const duration = this.player.duration() || (mediaEl ? mediaEl.duration : 0) || 0;

                // Step 1: measure player width FIRST.
                // WaveSurfer reads container.clientWidth synchronously in drawBuffer(), so
                // we must confirm a non-zero width before creating any instance.
                const playerRect = this.player.el_.getBoundingClientRect();
                const playerWidth = playerRect.width || this.player.el_.offsetWidth || 0;

                if (playerWidth === 0) {
                    if (retryCount >= 20) {
                        this._log('Player width still 0 after 20 retries — aborting. Ensure the player element has CSS width.', 'error');
                        return;
                    }
                    window.requestAnimationFrame(() => doCreate(retryCount + 1));
                    return;
                }

                // Step 2: for auto 16:9 mode, calculate channel height from actual width,
                // then apply wrapper styles. For non-auto, both were done before the fetch.
                let channelH = effectiveChannelHeight;
                if (this.opts.autoChannelHeight) {
                    const totalHeight = Math.round(playerWidth * 9 / 16);
                    const cappedHeight = this.opts.maxHeight ? Math.min(totalHeight, this.opts.maxHeight) : totalHeight;
                    channelH = Math.max(1, Math.floor(cappedHeight / peaksArray.length));
                    this._applyWrapperStyles(this._wrapper, peaksArray.length, channelH);
                }

                // Step 3: append ALL channel divs to the DOM
                const waveDivs = peaksArray.map((peaks, index) => {
                    const item = items[index];
                    const channelDiv = this._createChannelDiv(item, channelH);
                    this._wrapper.appendChild(channelDiv);
                    return channelDiv.querySelector('.' + CHANNEL_CLASS + '__wave');
                });

                // Remove divider from the last channel strip
                const lastChannel = this._wrapper.querySelector('.' + CHANNEL_CLASS + ':last-child');
                if (lastChannel) {
                    lastChannel.style.borderBottom = 'none';
                }

                // Step 4: temporarily set mediaEl.preload='none' before creating any
                // WaveSurfer instance. wavesurfer's loadElt() passes elt.preload to _load(),
                // and _load() calls media.load() unless preload==='none'. Calling media.load()
                // would reset VideoJS's video element, breaking playback for every instance.
                const origPreload = mediaEl ? mediaEl.preload : null;
                if (mediaEl) {
                    mediaEl.preload = 'none';
                }

                // Step 5: create WaveSurfer instances now that dimensions are known
                waveDivs.forEach((waveDiv, index) => {
                    const item = items[index];
                    const peaks = peaksArray[index];

                    const wsOptions = this._buildWaveSurferOptions(waveDiv, playerWidth);
                    let ws;
                    try {
                        ws = WaveSurfer.create(wsOptions);
                    } catch (err) {
                        this._log('WaveSurfer.create failed: ' + err.message, 'error');
                        this.player.trigger(Event.WAVE_ERROR, err);
                        return;
                    }

                    ws.on('waveform-ready', () => {
                        this._checkAllReady(totalChannels);
                    });

                    ws.on('error', (err) => {
                        this._log('WaveSurfer error: ' + err, 'error');
                        this.player.trigger(Event.WAVE_ERROR, err);
                    });

                    // Load: pass the existing VideoJS media element so wavesurfer
                    // subscribes to its events (play/pause/seeked) for cursor sync.
                    // mediaEl.preload is already 'none' so _load() won't call media.load().
                    if (mediaEl && peaks) {
                        ws.load(mediaEl, this._peaksToArray(peaks), 'none', duration > 0 ? duration : undefined);
                    } else if (mediaEl) {
                        ws.load(mediaEl, null, 'none', duration > 0 ? duration : undefined);
                    }

                    // For already-loaded media, 'canplay' won't re-fire naturally.
                    // Manually fire it on the backend so isReady=true and seekTo() works
                    // (wavesurfer.seekTo() defers if isReady===false).
                    if (mediaEl && mediaEl.readyState >= 3 && ws.backend) {
                        ws.backend.fireEvent('canplay');
                    }

                    this._wavesurfers.push(ws);
                });

                // Restore original preload attribute
                if (mediaEl && origPreload !== null) {
                    mediaEl.preload = origPreload;
                }

                this.player.trigger(Event.TRACKS_LOADED);
                this._log('Tracks loaded (' + totalChannels + ' channels)');
            };

            // Wait for video metadata so we have a valid duration before drawing peaks.
            // Without duration wavesurfer v6 can't calculate canvas width and draws nothing.
            const duration = this.player.duration() || (mediaEl ? mediaEl.duration : 0) || 0;
            if (duration > 0) {
                doCreate();
            } else {
                this.player.one(Event.LOADEDMETADATA, () => doCreate());
            }
        });
    }

    /**
     * Create the DOM element for a single channel strip.
     * @param {Object} item - Waveform-json item from BE.
     * @param {number} [channelHeight] - Override height for this channel strip.
     * @returns {HTMLElement}
     * @private
     */
    _createChannelDiv(item, channelHeight) {
        const height = channelHeight || this.opts.channelHeight;
        const track = (item.details && item.details.track) || '';
        const channel = (item.details && item.details.channel) || '';

        const outer = document.createElement('div');
        outer.className = CHANNEL_CLASS;
        outer.style.position = 'relative';
        outer.style.display = 'block';
        outer.style.width = '100%';
        outer.style.height = height + 'px';
        outer.style.boxSizing = 'border-box';
        outer.style.borderBottom = '1px solid ' + (this.opts.dividerColor || 'rgba(255,255,255,0.15)');
        outer.setAttribute('data-track', track);
        outer.setAttribute('data-channel', channel);

        const waveDiv = document.createElement('div');
        waveDiv.className = CHANNEL_CLASS + '__wave';
        waveDiv.style.display = 'block';
        waveDiv.style.width = '100%';
        waveDiv.style.height = height + 'px';
        waveDiv.style.boxSizing = 'border-box';
        waveDiv.dataset.waveHeight = height;

        outer.appendChild(waveDiv);

        if (item.label) {
            const label = document.createElement('span');
            label.className = CHANNEL_CLASS + '__label';
            label.textContent = item.label;
            label.style.position = 'absolute';
            label.style.top = '6px';
            label.style.left = '8px';
            label.style.zIndex = '10';
            label.style.fontSize = '10px';
            label.style.fontWeight = '600';
            label.style.letterSpacing = '0.03em';
            label.style.pointerEvents = 'none';
            label.style.userSelect = 'none';
            label.style.color = this.opts.labelColor || this.opts.cursorColor || '#fff';
            outer.appendChild(label);
        }

        return outer;
    }

    /**
     * Build WaveSurfer constructor options for a channel (wavesurfer.js v6 compatible).
     * Note: peaks and media element are NOT passed here — they go to ws.load() after creation.
     * @param {HTMLElement} container
     * @param {number} containerWidth - Actual measured pixel width (from getBoundingClientRect).
     * @returns {Object}
     * @private
     */
    _buildWaveSurferOptions(container, containerWidth) {
        // Use the effective wave height stored in the data attribute
        const height = parseInt(container.dataset.waveHeight) || this.opts.channelHeight;
        const opts = {
            container,
            backend: 'MediaElement',
            height,
            waveColor: this.opts.waveColor,
            progressColor: this.opts.progressColor,
            cursorColor: this.opts.cursorColor,
            cursorWidth: this.opts.cursorWidth,
            normalize: this.opts.normalize,
            interact: true,
            hideScrollbar: true,
            // fillParent + scrollParent:false = stretch wave to container width.
            // These are the correct wavesurfer v6 options (not 'responsive').
            fillParent: true,
            scrollParent: false,
        };

        if (this.opts.barWidth !== undefined) {
            opts.barWidth = this.opts.barWidth;
        }
        if (this.opts.barGap !== undefined) {
            opts.barGap = this.opts.barGap;
        }
        if (this.opts.barRadius !== undefined) {
            opts.barRadius = this.opts.barRadius;
        }

        return opts;
    }

    /**
     * Convert Float32Array peaks to regular number[][] that wavesurfer.js v6 expects.
     * @param {Float32Array[]|number[][]} peaks
     * @returns {number[][]}
     * @private
     */
    _peaksToArray(peaks) {
        if (!peaks) return peaks;
        return peaks.map((ch) => (ch instanceof Float32Array ? Array.from(ch) : ch));
    }

    /**
     * Get the HTML5 media element from the VideoJS player tech.
     * @returns {HTMLMediaElement|null}
     * @private
     */
    _getMediaElement() {
        try {
            if (this.player.tech_ && this.player.tech_.el_) {
                return this.player.tech_.el_;
            }
            // Fallback for older video.js versions
            const tech = this.player.tech({ IWillNotUseThisInPlugins: true });
            return tech && tech.el_ ? tech.el_ : null;
        } catch (e) {
            this._log('Could not get media element: ' + e.message, 'warn');
            return null;
        }
    }

    /**
     * Check if all WaveSurfer instances have fired 'ready'. When all are ready,
     * emit the 'waveReady' event on the player.
     * @param {number} total
     * @private
     */
    _checkAllReady(total) {
        this._readyCount = (this._readyCount || 0) + 1;

        if (this._readyCount >= total && !this._waveReady) {
            this._waveReady = true;
            this._readyCount = 0;
            this._log('All waveforms ready');

            if (this.player.controlBar && this.player.controlBar.playToggle) {
                this.player.controlBar.playToggle.show();
            }

            this.player.trigger(Event.WAVE_READY);
        }
    }

    // -------------------------------------------------------------------------
    // VideoJS event handlers
    // -------------------------------------------------------------------------

    /** @private */
    _onTimeUpdate() {
        this._updateTimeDisplay();
        const duration = this.player.duration();
        if (duration > 0) {
            const progress = Math.min(1, Math.max(0, this.player.currentTime() / duration));
            this._wavesurfers.forEach((ws) => {
                try {
                    if (ws.drawer) {
                        ws.drawer.progress(progress);
                    }
                } catch (e) { /* ignore */ }
            });
        }
    }

    /** @private */
    _onVolumeChange() {
        // no-op: VideoJS manages volume natively
    }

    /** @private */
    _onScreenChange() {
        const duration = this.player.duration();
        const progress = duration > 0
            ? Math.min(1, Math.max(0, this.player.currentTime() / duration))
            : 0;

        this._wavesurfers.forEach((ws) => {
            try {
                ws.drawBuffer && ws.drawBuffer();
            } catch (e) {
                // ignore
            }

            window.requestAnimationFrame(() => {
                try {
                    if (ws.drawer) {
                        ws.drawer.progress(progress);
                    }
                } catch (e) {
                    // ignore
                }
            });
        });
    }

    /** @private */
    _onResize() {
        if (this.opts.autoChannelHeight) {
            this._recalculateAutoHeight();
            return;
        }

        const playerRect = this.player.el_.getBoundingClientRect();
        const newWidth = playerRect.width || this.player.el_.offsetWidth || 0;
        if (newWidth === 0) return;

        // Snapshot the current progress before drawBuffer() — capture here
        // so the rAF closure has the correct value even if player state changes.
        const duration = this.player.duration();
        const progress = duration > 0
            ? Math.min(1, Math.max(0, this.player.currentTime() / duration))
            : 0;

        this._wavesurfers.forEach((ws) => {
            try {
                ws.drawBuffer && ws.drawBuffer();
            } catch (e) {
                // ignore
            }

            // Restore progress in the next animation frame — drawBuffer() resets the
            // progress overlay canvas synchronously at the end, so we must apply it
            // after that paint cycle completes.
            window.requestAnimationFrame(() => {
                try {
                    if (ws.drawer) {
                        ws.drawer.progress(progress);
                    }
                } catch (e) {
                    // ignore
                }
            });
        });
    }

    /**
     * Recalculate channel heights for 16:9 auto mode and redraw all waveforms.
     * Called on resize when autoChannelHeight is true.
     * @private
     */
    _recalculateAutoHeight() {
        if (!this._wrapper || this._wavesurfers.length === 0) return;

        const playerRect = this.player.el_.getBoundingClientRect();
        const playerWidth = playerRect.width || this.player.el_.offsetWidth || 0;
        if (playerWidth === 0) return;

        const channelDivs = Array.from(this._wrapper.querySelectorAll('.' + CHANNEL_CLASS));
        const channelCount = channelDivs.length;
        if (channelCount === 0) return;

        const totalHeight = Math.round(playerWidth * 9 / 16);
        const cappedHeight = this.opts.maxHeight ? Math.min(totalHeight, this.opts.maxHeight) : totalHeight;
        const newChannelHeight = Math.max(1, Math.floor(cappedHeight / channelCount));

        const progress = this.player.duration() > 0
            ? Math.min(1, Math.max(0, this.player.currentTime() / this.player.duration()))
            : 0;

        channelDivs.forEach((div, i) => {
            div.style.height = newChannelHeight + 'px';
            const waveDiv = div.querySelector('.' + CHANNEL_CLASS + '__wave');
            if (waveDiv) {
                waveDiv.style.height = newChannelHeight + 'px';
                waveDiv.dataset.waveHeight = newChannelHeight;
            }

            const ws = this._wavesurfers[i];
            if (!ws) return;
            try {
                if (typeof ws.setHeight === 'function') {
                    ws.setHeight(newChannelHeight);
                }
                ws.drawBuffer && ws.drawBuffer();
            } catch (e) { /* ignore */ }

            window.requestAnimationFrame(() => {
                try {
                    if (ws.drawer) ws.drawer.progress(progress);
                } catch (e) { /* ignore */ }
            });
        });

        const wrapperHeight = channelCount * newChannelHeight;
        this._wrapper.style.height = wrapperHeight + 'px';
        this._resizePlayer(wrapperHeight);
    }

    /** @private */
    _onEnded() {
        this.player.trigger(Event.PLAYBACK_FINISH);
    }

    // -------------------------------------------------------------------------
    // Public API
    // -------------------------------------------------------------------------

    /**
     * Update the VideoJS current time and duration displays.
     */
    _updateTimeDisplay() {
        const currentTime = this.player.currentTime() || 0;
        const duration = this.player.duration() || 0;

        const cb = this.player.controlBar;
        if (cb && cb.currentTimeDisplay && cb.currentTimeDisplay.contentEl() &&
            cb.currentTimeDisplay.contentEl().lastChild) {
            cb.currentTimeDisplay.formattedTime_ =
                cb.currentTimeDisplay.contentEl().lastChild.textContent =
                    formatTime(currentTime, duration, this.displayMilliseconds);
        }
    }

    /**
     * Filter displayed channels to a single track by its numeric identifier.
     * Passing null (or calling with no argument) clears the filter and shows all tracks.
     * The number must match `details.track` in the items passed to loadTracks().
     *
     * @param {number|null} [trackId] - e.g. 1. Pass null to show all.
     *
     * @example
     * plugin.changeTrack(1);     // show only track 1 channels
     * plugin.changeTrack(null);  // back to all tracks
     */
    changeTrack(trackId) {
        const wasPlaying = !this.player.paused();
        const savedTime = this.player.currentTime();

        this._activeTrack = (trackId !== undefined && trackId !== null)
            ? Number(trackId)
            : null;

        // Restore playback position (and resume if playing) once new waveforms are ready
        this.player.one(Event.WAVE_READY, () => {
            this.player.currentTime(savedTime);
            if (wasPlaying) {
                this.player.play();
            }
        });

        this.loadTracks(this._allTracks);
    }

    /**
     * Get current playback time in seconds.
     * @returns {number}
     */
    getCurrentTime() {
        return this.player.currentTime() || 0;
    }

    /**
     * Get waveform duration in seconds.
     * @returns {number}
     */
    getDuration() {
        return this.player.duration() || 0;
    }

    /**
     * Returns true when all waveforms have been rendered.
     * @returns {boolean}
     */
    isReady() {
        return this._waveReady;
    }

    /**
     * Remove the plugin, destroy all WaveSurfer instances and clean up the DOM.
     * Called automatically by VideoJS when the player is disposed.
     */
    dispose() {
        if (this._resizeObserver) {
            this._resizeObserver.disconnect();
            this._resizeObserver = null;
        }
        this._removeWrapper();
        super.dispose();
    }

    // -------------------------------------------------------------------------
    // Logging
    // -------------------------------------------------------------------------

    /**
     * @param {string} msg
     * @param {'log'|'warn'|'error'} [level='log']
     * @private
     */
    _log(msg, level = 'log') {
        if (this.debug || level === 'error') {
            const prefix = '[videojs-wavesurfer-multitrack] ';
            if (level === 'error') {
                console.error(prefix + msg);
            } else if (level === 'warn') {
                console.warn(prefix + msg);
            } else {
                console.log(prefix + msg);
            }
        }
    }
}

// Register the plugin with VideoJS
if (videojs && typeof videojs.registerPlugin === 'function') {
    videojs.registerPlugin(PLUGIN_NAME, WavesurferMultitrack);
}

export { WavesurferMultitrack };
export default WavesurferMultitrack;
