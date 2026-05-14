        // Splash Screen functionality
        document.addEventListener('DOMContentLoaded', function() {
            const splashScreen = document.getElementById('splashScreen');
            if (!splashScreen) return;

            // Dismiss splash screen on click/tap
            splashScreen.addEventListener('click', dismissSplash);

            // Auto-dismiss after 5 seconds if not clicked
            setTimeout(dismissSplash, 5000);

            function dismissSplash() {
                splashScreen.classList.add('fade-out');
                setTimeout(() => {
                    splashScreen.style.display = 'none';
                }, 500);
                // Proactively unlock audio contexts on the splash interaction
                unlockAudio();
            }
        });

        // Advanced Guitar Tuner functionality
        let referenceAudioContext = null;
        let currentOscillator = null;
        let referenceGainNode = null;
        let referenceStopTimeout = null;
        let activeReferenceButton = null;

        // Microphone tuning functionality
        let audioContext = null;
        let microphone = null;
        let analyser = null;
        let isListening = false;
        let animationId = null;
        let smoothedCents = null;
        let stableInTuneFrames = 0;
        let inTuneHoldUntil = 0;
        let selectedTargetNote = null;

        // Note frequencies (in Hz) for standard tuning
        const noteFrequencies = {
            'C': [16.35, 32.70, 65.41, 130.81, 261.63, 523.25, 1046.50, 2093.00, 4186.01],
            'C#': [17.32, 34.65, 69.30, 138.59, 277.18, 554.37, 1108.73, 2217.46, 4434.92],
            'D': [18.35, 36.71, 73.42, 146.83, 293.66, 587.33, 1174.66, 2349.32, 4698.64],
            'D#': [19.45, 38.89, 77.78, 155.56, 311.13, 622.25, 1244.51, 2489.02, 4978.03],
            'E': [20.60, 41.20, 82.41, 164.81, 329.63, 659.26, 1318.51, 2637.02, 5274.04],
            'F': [21.83, 43.65, 87.31, 174.61, 349.23, 698.46, 1396.91, 2793.83, 5587.65],
            'F#': [23.12, 46.25, 92.50, 185.00, 369.99, 739.99, 1479.98, 2959.96, 5919.91],
            'G': [24.50, 49.00, 98.00, 196.00, 392.00, 783.99, 1567.98, 3135.96, 6271.93],
            'G#': [25.96, 51.91, 103.83, 207.65, 415.30, 830.61, 1661.22, 3322.44, 6644.88],
            'A': [27.50, 55.00, 110.00, 220.00, 440.00, 880.00, 1760.00, 3520.00, 7040.00],
            'A#': [29.14, 58.27, 116.54, 233.08, 466.16, 932.33, 1864.66, 3729.31, 7458.62],
            'B': [30.87, 61.74, 123.47, 246.94, 493.88, 987.77, 1975.53, 3951.07, 7902.13]
        };

        // Initialize reference tone audio
        async function initializeReferenceAudio() {
            if (!referenceAudioContext) {
                referenceAudioContext = new (window.AudioContext || window.webkitAudioContext)();
            }
            if (referenceAudioContext.state === 'suspended') {
                await referenceAudioContext.resume();
            }
            if (!referenceGainNode) {
                referenceGainNode = referenceAudioContext.createGain();
                referenceGainNode.gain.value = 0.7;
                referenceGainNode.connect(referenceAudioContext.destination);
            }
        }

        // Ensure all audio contexts are resumed after a user gesture
        async function unlockAudio() {
            try {
                await initializeReferenceAudio();

                if (!metronomeAudioContext) {
                    // will be created lazily in initMetronomeAudio
                } else if (metronomeAudioContext.state === 'suspended') {
                    await metronomeAudioContext.resume();
                }

                if (audioContext && audioContext.state === 'suspended') {
                    await audioContext.resume();
                }
            } catch (e) {
                // no-op; user can trigger again via button
            }
        }

        window.addEventListener('click', unlockAudio, { once: true, passive: true });
        window.addEventListener('touchstart', unlockAudio, { once: true, passive: true });

        function updateTargetNoteDisplay(noteLabel = 'standard tuning') {
            const targetDisplay = document.getElementById('targetNoteDisplay');
            if (targetDisplay) {
                targetDisplay.textContent = `Target: ${noteLabel}`;
            }
        }

        async function playTone(frequency, button) {
            await initializeReferenceAudio();
            stopTone();

            currentOscillator = referenceAudioContext.createOscillator();
            currentOscillator.type = 'sine';
            currentOscillator.frequency.value = frequency;
            currentOscillator.connect(referenceGainNode);
            currentOscillator.start();

            activeReferenceButton = button;
            selectedTargetNote = button?.dataset.note || null;
            updateTargetNoteDisplay(selectedTargetNote || 'standard tuning');

            if (activeReferenceButton) {
                activeReferenceButton.classList.add('playing');
            }

            referenceStopTimeout = setTimeout(() => stopTone(), 1800);
        }

        function stopTone() {
            if (referenceStopTimeout) {
                clearTimeout(referenceStopTimeout);
                referenceStopTimeout = null;
            }
            if (currentOscillator) {
                try {
                    currentOscillator.stop();
                } catch (e) {
                    // no-op if oscillator is already stopped
                }
                currentOscillator.disconnect();
                currentOscillator = null;
            }
            document.querySelectorAll('.string-button').forEach(btn => btn.classList.remove('playing'));
            activeReferenceButton = null;
        }

        async function startListening() {
            try {
                audioContext = new (window.AudioContext || window.webkitAudioContext)();
                if (audioContext.state === 'suspended') {
                    await audioContext.resume();
                }

                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                microphone = audioContext.createMediaStreamSource(stream);
                analyser = audioContext.createAnalyser();

                analyser.fftSize = 8192;
                analyser.smoothingTimeConstant = 0.8;

                microphone.connect(analyser);

                isListening = true;
                updateMicButton();
                updateTuningStatus('Listening for notes...', 'status-listening');

                detectPitch();

            } catch (error) {
                if (audioContext) {
                    audioContext.close();
                    audioContext = null;
                }
                console.error('Error accessing microphone:', error);
                showError('Could not access microphone. Please check permissions.');
            }
        }

        function stopListening() {
            isListening = false;
            smoothedCents = null;
            stableInTuneFrames = 0;
            inTuneHoldUntil = 0;

            if (animationId) {
                cancelAnimationFrame(animationId);
                animationId = null;
            }

            if (microphone && microphone.mediaStream) {
                microphone.mediaStream.getTracks().forEach(track => track.stop());
            }

            if (audioContext) {
                audioContext.close();
                audioContext = null;
            }

            microphone = null;
            analyser = null;

            updateMicButton();
            updateTuningStatus('Click "Start Listening" to begin', '');
            const detectedNote = document.getElementById('detectedNote');
            const frequencyDisplay = document.getElementById('frequencyDisplay');
            const centsDisplay = document.getElementById('centsDisplay');
            const meterNeedle = document.getElementById('meterNeedle');

            if (detectedNote) {
                detectedNote.textContent = 'Play a note';
                detectedNote.classList.remove('in-tune');
            }
            if (frequencyDisplay) frequencyDisplay.textContent = '-- Hz';
            if (centsDisplay) {
                centsDisplay.textContent = '0 cents';
                centsDisplay.className = 'cents-display';
            }
            if (meterNeedle) meterNeedle.style.left = '50%';
        }

        function updateMicButton() {
            const button = document.getElementById('micButton');
            if (button) {
                if (isListening) {
                    button.textContent = 'Stop Listening';
                    button.classList.add('listening');
                } else {
                    button.textContent = 'Start Listening';
                    button.classList.remove('listening');
                }
            }
        }

        function updateTuningStatus(message, className) {
            const status = document.getElementById('tuningStatus');
            if (status) {
                status.textContent = message;
                status.className = `tuning-status ${className}`;
            }
        }

        function showError(message) {
            const tunerSection = document.getElementById('tunerSection');
            if (!tunerSection) return;

            const existingError = tunerSection.querySelector('.error-message');
            if (existingError) existingError.remove();

            const errorDiv = document.createElement('div');
            errorDiv.className = 'error-message';
            errorDiv.textContent = message;
            tunerSection.insertBefore(errorDiv, tunerSection.children[2]);

            setTimeout(() => errorDiv.remove(), 5000);
        }

        function detectPitch() {
            if (!isListening || !analyser) return;

            const bufferLength = analyser.fftSize;
            const buffer = new Float32Array(bufferLength);
            analyser.getFloatTimeDomainData(buffer);

            const pitch = autoCorrelate(buffer, audioContext.sampleRate);

            if (pitch !== -1) {
                const note = frequencyToNote(pitch);
                updateDisplay(note, pitch);
            }

            animationId = requestAnimationFrame(detectPitch);
        }

        function autoCorrelate(buffer, sampleRate) {
            const SIZE = buffer.length;
            const MAX_SAMPLES = Math.floor(SIZE / 2);
            let bestOffset = -1;
            let bestCorrelation = 0;
            let rms = 0;
            let foundGoodCorrelation = false;
            const correlations = new Array(MAX_SAMPLES);

            for (let i = 0; i < SIZE; i++) {
                const val = buffer[i];
                rms += val * val;
            }
            rms = Math.sqrt(rms / SIZE);
            if (rms < 0.01) return -1;

            let lastCorrelation = 1;
            for (let offset = 1; offset < MAX_SAMPLES; offset++) {
                let correlation = 0;
                for (let i = 0; i < MAX_SAMPLES; i++) {
                    correlation += Math.abs((buffer[i]) - (buffer[i + offset]));
                }
                correlation = 1 - (correlation / MAX_SAMPLES);
                correlations[offset] = correlation;
                if ((correlation > 0.9) && (correlation > lastCorrelation)) {
                    foundGoodCorrelation = true;
                    if (correlation > bestCorrelation) {
                        bestCorrelation = correlation;
                        bestOffset = offset;
                    }
                } else if (foundGoodCorrelation) {
                    const shift = (correlations[bestOffset + 1] - correlations[bestOffset - 1]) / correlations[bestOffset];
                    return sampleRate / (bestOffset + (8 * shift));
                }
                lastCorrelation = correlation;
            }
            if (bestCorrelation > 0.01) {
                return sampleRate / bestOffset;
            }
            return -1;
        }

        function frequencyToNote(frequency) {
            const A4 = 440;
            const C0 = A4 * Math.pow(2, -4.75);

            if (frequency > C0) {
                const h = Math.round(12 * Math.log2(frequency / C0));
                const octave = Math.floor(h / 12);
                const n = h % 12;
                const notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
                return {
                    name: notes[n],
                    octave: octave,
                    frequency: frequency,
                    cents: Math.round(1200 * Math.log2(frequency / (C0 * Math.pow(2, h / 12))))
                };
            }
            return null;
        }

        function updateDisplay(note, frequency) {
            if (!note) return;

            const detectedNote = document.getElementById('detectedNote');
            const frequencyDisplay = document.getElementById('frequencyDisplay');
            const centsDisplay = document.getElementById('centsDisplay');
            const needle = document.getElementById('meterNeedle');

            if (detectedNote) detectedNote.textContent = `${note.name}${note.octave}`;
            if (frequencyDisplay) frequencyDisplay.textContent = `${frequency.toFixed(1)} Hz`;

            const cents = note.cents;
            smoothedCents = smoothedCents === null ? cents : (smoothedCents * 0.72) + (cents * 0.28);
            const displayedCents = Math.round(smoothedCents);
            const now = Date.now();
            const instantInTune = Math.abs(cents) <= 3;
            const smoothedInTune = Math.abs(displayedCents) <= 5;

            stableInTuneFrames = instantInTune ? stableInTuneFrames + 1 : 0;
            if (stableInTuneFrames >= 3) {
                inTuneHoldUntil = now + 700;
            }

            const heldInTune = now < inTuneHoldUntil;
            const isInTune = smoothedInTune && (stableInTuneFrames >= 3 || heldInTune);

            if (centsDisplay) centsDisplay.textContent = `${displayedCents > 0 ? '+' : ''}${displayedCents} cents`;

            if (needle) {
                const needlePosition = 50 + (displayedCents * 0.8);
                needle.style.left = `${Math.max(5, Math.min(95, needlePosition))}%`;
            }

            if (detectedNote) {
                detectedNote.classList.toggle('in-tune', isInTune);
            }

            if (centsDisplay) {
                if (isInTune) {
                    centsDisplay.className = 'cents-display in-tune';
                    updateTuningStatus('Locked in. Hold it there.', 'status-tuned');
                } else if (displayedCents > 5) {
                    centsDisplay.className = 'cents-display sharp';
                    updateTuningStatus('Sharp. Tune down slowly.', 'status-detecting');
                } else if (displayedCents < -5) {
                    centsDisplay.className = 'cents-display flat';
                    updateTuningStatus('Flat. Tune up slowly.', 'status-detecting');
                } else {
                    centsDisplay.className = 'cents-display';
                    updateTuningStatus('Very close. Ease it into the green.', 'status-listening');
                }
            }

            if (selectedTargetNote && detectedNote) {
                const noteNameOnly = selectedTargetNote.replace(/[0-9]/g, '');
                if (note.name !== noteNameOnly) {
                    updateTargetNoteDisplay(`${selectedTargetNote} (hearing ${note.name}${note.octave})`);
                } else {
                    updateTargetNoteDisplay(selectedTargetNote);
                }
            }
        }

        const micButton = document.getElementById('micButton');
        if (micButton) {
            micButton.addEventListener('click', () => {
                if (isListening) {
                    stopListening();
                } else {
                    startListening();
                }
            });
        }

        const volumeSlider = document.getElementById('volumeSlider');
        if (volumeSlider) {
            volumeSlider.addEventListener('input', (e) => {
                if (referenceGainNode) {
                    const volume = e.target.value / 100;
                    referenceGainNode.gain.value = volume;
                }
            });
        }

        document.addEventListener('DOMContentLoaded', function() {
            updateTargetNoteDisplay();
            document.querySelectorAll('.string-button').forEach(button => {
                button.addEventListener('click', async () => {
                    await unlockAudio();
                    const frequency = parseFloat(button.dataset.freq);
                    if (button.classList.contains('playing')) {
                        stopTone();
                    } else {
                        await playTone(frequency, button);
                    }
                });
            });
        });

        // Metronome functionality
        let metronomeBpm = 120;
        let metronomeIsPlaying = false;
        let metronomeCurrentBeat = 0;
        let metronomeBeats = 4;
        let metronomeTapTimes = [];
        let metronomeIntervalId = null;
        let metronomeAudioContext = null;
        let metronomeNextNoteTime = 0;
        const metronomeLookahead = 25.0;
        const metronomeScheduleAheadTime = 0.1;

        function initMetronomeAudio() {
            if (!metronomeAudioContext) {
                metronomeAudioContext = new (window.AudioContext || window.webkitAudioContext)();
            }
            if (metronomeAudioContext.state === 'suspended') {
                metronomeAudioContext.resume();
            }
        }

        function playMetronomeClick(time, isAccent = false) {
            if (!metronomeAudioContext) return;

            const osc = metronomeAudioContext.createOscillator();
            const gain = metronomeAudioContext.createGain();

            osc.connect(gain);
            gain.connect(metronomeAudioContext.destination);

            osc.frequency.value = isAccent ? 800 : 400;
            gain.gain.setValueAtTime(0.1, time);
            gain.gain.exponentialRampToValueAtTime(0.01, time + 0.1);

            osc.start(time);
            osc.stop(time + 0.1);
        }

        function updateBeatIndicator() {
            const beatDots = document.querySelectorAll('.beat-dot');
            beatDots.forEach((dot, index) => {
                dot.classList.remove('active', 'accent');
                if (index < metronomeBeats) {
                    dot.style.display = 'block';
                    if (metronomeIsPlaying && index === metronomeCurrentBeat) {
                        dot.classList.add('active');
                        if (index === 0) {
                            dot.classList.add('accent');
                        }
                    }
                } else {
                    dot.style.display = 'none';
                }
            });
        }

        function scheduleMetronome() {
            if (!metronomeAudioContext) return;

            while (metronomeNextNoteTime < metronomeAudioContext.currentTime + metronomeScheduleAheadTime) {
                const isAccent = metronomeCurrentBeat === 0;
                playMetronomeClick(metronomeNextNoteTime, isAccent);

                const secondsPerBeat = 60.0 / metronomeBpm;
                metronomeNextNoteTime += secondsPerBeat;
                metronomeCurrentBeat = (metronomeCurrentBeat + 1) % metronomeBeats;
            }
        }

        function metronomeStep() {
            if (!metronomeIsPlaying) return;

            const isAccent = metronomeCurrentBeat === 0;
            if (metronomeAudioContext) {
                playMetronomeClick(metronomeAudioContext.currentTime, isAccent);
            }

            updateBeatIndicator();

            metronomeCurrentBeat = (metronomeCurrentBeat + 1) % metronomeBeats;
        }

        function toggleMetronome() {
            if (metronomeIsPlaying) {
                clearInterval(metronomeIntervalId);
                metronomeIsPlaying = false;
                metronomeCurrentBeat = 0;
                document.getElementById('playStopBtn').classList.remove('playing');
                document.getElementById('playStopText').textContent = 'Start';
            } else {
                initMetronomeAudio();
                unlockAudio();
                metronomeIsPlaying = true;
                document.getElementById('playStopBtn').classList.add('playing');
                document.getElementById('playStopText').textContent = 'Stop';

                const intervalMs = (60 / metronomeBpm) * 1000;
                metronomeIntervalId = setInterval(metronomeStep, intervalMs);
            }
            updateBeatIndicator();
        }

        function handleTapTempo() {
            const now = Date.now();
            metronomeTapTimes.push(now);
            metronomeTapTimes = metronomeTapTimes.slice(-4);

            document.getElementById('tapBtn').classList.add('active');
            setTimeout(() => {
                document.getElementById('tapBtn').classList.remove('active');
            }, 100);

            if (metronomeTapTimes.length >= 2) {
                const intervals = [];
                for (let i = 1; i < metronomeTapTimes.length; i++) {
                    intervals.push(metronomeTapTimes[i] - metronomeTapTimes[i - 1]);
                }
                const avgInterval = intervals.reduce((a, b) => a + b) / intervals.length;
                const newBpm = Math.round(60000 / avgInterval);

                if (newBpm >= 40 && newBpm <= 200) {
                    updateMetronomeBpm(newBpm);
                }
            }

            setTimeout(() => {
                metronomeTapTimes = [];
            }, 3000);
        }

        function updateMetronomeBpm(newBpm) {
            metronomeBpm = newBpm;
            document.getElementById('bpmDisplay').textContent = newBpm;
            document.getElementById('bpmSlider').value = newBpm;
            document.getElementById('bpmInput').value = newBpm;

            if (metronomeIsPlaying) {
                clearInterval(metronomeIntervalId);
                const intervalMs = (60 / metronomeBpm) * 1000;
                metronomeIntervalId = setInterval(metronomeStep, intervalMs);
            }
        }

        function updateMetronomeBeats(newBeats) {
            metronomeBeats = newBeats;
            metronomeCurrentBeat = 0;
            updateBeatIndicator();
        }

        function resetMetronome() {
            if (metronomeIsPlaying) {
                toggleMetronome();
            }
            updateMetronomeBpm(120);
            updateMetronomeBeats(4);
            document.getElementById('beatsSelect').value = '4';
            metronomeTapTimes = [];
        }

        document.addEventListener('DOMContentLoaded', function() {
            const bpmSlider = document.getElementById('bpmSlider');
            if (bpmSlider) {
                bpmSlider.addEventListener('input', (e) => {
                    updateMetronomeBpm(parseInt(e.target.value));
                });
            }

            const bpmInput = document.getElementById('bpmInput');
            if (bpmInput) {
                bpmInput.addEventListener('change', (e) => {
                    const val = parseInt(e.target.value);
                    if (val >= 40 && val <= 200) {
                        updateMetronomeBpm(val);
                    } else {
                        e.target.value = metronomeBpm;
                    }
                });
            }

            const beatsSelect = document.getElementById('beatsSelect');
            if (beatsSelect) {
                beatsSelect.addEventListener('change', (e) => {
                    updateMetronomeBeats(parseInt(e.target.value));
                });
            }

            document.querySelectorAll('.preset-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    const bpm = parseInt(btn.dataset.bpm);
                    updateMetronomeBpm(bpm);
                });
            });

            const playStopBtn = document.getElementById('playStopBtn');
            if (playStopBtn) {
                playStopBtn.addEventListener('click', toggleMetronome);
            }

            const tapBtn = document.getElementById('tapBtn');
            if (tapBtn) {
                tapBtn.addEventListener('click', handleTapTempo);
            }

            const resetBtn = document.getElementById('resetBtn');
            if (resetBtn) {
                resetBtn.addEventListener('click', resetMetronome);
            }

            updateBeatIndicator();
        });

        // ===================================================================
        // SONG LIBRARY (samples + user songs via OpenFretLibrary)
        // ===================================================================

        let currentSong = null;
        let currentSongId = null;
        let fontSize = 18;
        let scrollInterval = null;

        function getSongs() {
            if (window.OpenFretLibrary && typeof window.OpenFretLibrary.getAllSongs === 'function') {
                return window.OpenFretLibrary.getAllSongs();
            }
            // Fallback if library script failed to load
            return Array.isArray(window.OPENFRET_SONGS) ? window.OPENFRET_SONGS : [];
        }

        function escapeHtml(s) {
            return String(s == null ? '' : s)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
        }

        function init() {
            renderSongList();
            setupSearch();
            updateSongCount();
            showTab('songs');
            // Re-render whenever the library changes (add/edit/delete/import/etc.)
            if (window.OpenFretLibrary) {
                window.OpenFretLibrary.onChange(function () {
                    renderSongList();
                    updateSongCount();
                    refreshLibraryStats();
                });
            }
        }

        function updateSongCount() {
            const songCount = document.getElementById('songCount');
            if (!songCount) return;
            const total = getSongs().length;
            songCount.textContent = `${total} ${total === 1 ? 'SONG' : 'SONGS'}`;
        }

        function renderSongList() {
            const songListEl = document.getElementById('songList');
            if (!songListEl) return;
            const songs = getSongs();
            if (songs.length === 0) {
                songListEl.innerHTML = `
                    <div class="empty-state">
                        <picture>
                            <source srcset="assets/openfret-wordmark.webp" type="image/webp">
                            <img src="assets/openfret-wordmark.png" alt="OpenFret" class="empty-state-wordmark">
                        </picture>
                        <img src="assets/openfret-icon.png" alt="" class="empty-state-icon">
                        <h3>Your songbook is empty.</h3>
                        <p>Tap <strong>+ Add Song</strong> to drop in your first chord sheet, browse a starter pack to get going fast, or import a library you've exported from another device.</p>
                        <div class="empty-state-actions">
                            <button class="control-btn primary" onclick="showAddSongModal()">+ ADD YOUR FIRST SONG</button>
                            <button class="control-btn" onclick="showLibraryMenu()">BROWSE STARTER PACKS</button>
                        </div>
                        <p class="empty-state-hint">Or <button class="welcome-link" onclick="OpenFretApp.unhideSamplesAndRefresh()">show the 10 sample songs</button> to see what's possible.</p>
                    </div>`;
                return;
            }
            songListEl.innerHTML = songs.map(function (song) {
                const isSample = window.OpenFretLibrary && window.OpenFretLibrary.isSampleSong(song);
                const badge = isSample ? '<span class="song-badge sample">SAMPLE</span>' : '<span class="song-badge mine">MINE</span>';
                return `
                    <div class="song-item" data-song-id="${escapeHtml(song.id)}" onclick="showSongById('${escapeHtml(song.id)}')">
                        <div class="song-title">${escapeHtml(song.title)} ${badge}</div>
                        <div class="song-artist">${escapeHtml(song.artist || '')}</div>
                        <div class="song-chords">${escapeHtml(song.chords || '')}</div>
                    </div>`;
            }).join('');
        }

        function setupSearch() {
            const searchInput = document.getElementById('searchInput');
            if (!searchInput) return;
            searchInput.addEventListener('input', (e) => {
                const query = e.target.value.toLowerCase();
                const songs = getSongs();
                const songItems = document.querySelectorAll('.song-item');

                songItems.forEach((item) => {
                    const id = item.getAttribute('data-song-id');
                    const song = songs.find(s => s.id === id);
                    if (!song) { item.style.display = 'none'; return; }
                    const matches = (song.title || '').toLowerCase().includes(query) ||
                                  (song.artist || '').toLowerCase().includes(query) ||
                                  (song.chords || '').toLowerCase().includes(query) ||
                                  (song.genre || '').toLowerCase().includes(query);
                    item.style.display = matches ? 'block' : 'none';
                });
            });
        }

        function showSongById(id) {
            const songs = getSongs();
            const song = songs.find(s => s.id === id);
            if (!song) return;
            currentSong = song;
            currentSongId = id;

            const songContent = document.getElementById('songContent');
            const formattedLyrics = (song.lyrics || '').replace(/\[([^\]]+)\]/g, '<span class="chord">[$1]</span>');

            songContent.innerHTML = `
                <h2>${escapeHtml(song.title)}</h2>
                <div class="artist">${escapeHtml(song.artist || '')}</div>
                <div class="lyrics" id="lyricsContainer">${formattedLyrics}</div>
                ${song.license ? `<div class="song-license">${escapeHtml(song.license)}</div>` : ''}
            `;

            document.getElementById('songList').style.display = 'none';
            document.getElementById('songView').style.display = 'block';
            document.getElementById('controls').style.display = 'block';

            // Hide header while reading
            document.querySelector('.header').style.display = 'none';

            // Show / hide edit & delete based on whether this is a user song
            const isSample = window.OpenFretLibrary && window.OpenFretLibrary.isSampleSong(song);
            const editBtn = document.getElementById('editSongBtn');
            const deleteBtn = document.getElementById('deleteSongBtn');
            if (editBtn) editBtn.style.display = isSample ? 'none' : 'inline-block';
            if (deleteBtn) deleteBtn.style.display = isSample ? 'none' : 'inline-block';

            window.scrollTo(0, 0);
        }

        // Backwards-compat: legacy callers using showSong(index)
        function showSong(index) {
            const songs = getSongs();
            if (songs[index]) showSongById(songs[index].id);
        }

        function showSongList() {
            const list = document.getElementById('songList');
            const view = document.getElementById('songView');
            const controls = document.getElementById('controls');
            const search = document.getElementById('searchInput');
            if (list) list.style.display = 'block';
            if (view) view.style.display = 'none';
            if (controls) controls.style.display = 'none';
            if (search) search.value = '';

            document.querySelector('.header').style.display = 'block';

            stopAutoScroll();
            renderSongList();
        }

        function changeFontSize(delta) {
            fontSize += delta;
            fontSize = Math.max(12, Math.min(32, fontSize));
            const lyrics = document.getElementById('lyricsContainer');
            if (lyrics) lyrics.style.fontSize = fontSize + 'px';
        }

        function toggleAutoScroll() {
            const autoScrollControl = document.getElementById('autoScrollControl');

            if (scrollInterval) {
                stopAutoScroll();
            } else {
                autoScrollControl.style.display = 'flex';
                startAutoScroll();
            }
        }

        function startAutoScroll() {
            const speedControl = document.getElementById('scrollSpeed');
            const speed = parseInt(speedControl.value) / 50;

            scrollInterval = setInterval(() => {
                window.scrollBy(0, speed);
                if ((window.innerHeight + window.scrollY) >= document.body.offsetHeight) {
                    stopAutoScroll();
                }
            }, 50);
        }

        function stopAutoScroll() {
            if (scrollInterval) {
                clearInterval(scrollInterval);
                scrollInterval = null;
            }
            const ctl = document.getElementById('autoScrollControl');
            if (ctl) ctl.style.display = 'none';
        }

        function openYouTube() {
            if (currentSong && currentSong.youtube) {
                window.open(currentSong.youtube, '_blank');
            } else {
                const q = encodeURIComponent(`${currentSong.title} ${currentSong.artist || ''} guitar`);
                window.open(`https://www.youtube.com/results?search_query=${q}`, '_blank');
            }
        }

        function showDownloadModal() {
            document.getElementById('downloadModal').style.display = 'flex';
        }

        function closeModal() {
            document.getElementById('downloadModal').style.display = 'none';
        }

        function downloadSong() {
            if (!currentSong) return;

            const content = `${currentSong.title}\n${currentSong.artist || ''}\n\nChords: ${currentSong.chords || ''}\n\n${currentSong.lyrics || ''}`;
            const blob = new Blob([content], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${currentSong.title} - ${currentSong.artist || 'Unknown'}.txt`;
            a.click();
            URL.revokeObjectURL(url);
            closeModal();
        }

        function downloadAll() {
            const songs = getSongs();
            let content = "OPENFRET SONGBOOK\n\n";
            songs.forEach(song => {
                content += `${song.title}\n${song.artist || ''}\nChords: ${song.chords || ''}\n\n${song.lyrics || ''}\n\n${'='.repeat(50)}\n\n`;
            });

            const blob = new Blob([content], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'OpenFret_Songbook.txt';
            a.click();
            URL.revokeObjectURL(url);
            closeModal();
        }

        function shareSong() {
            if (!currentSong) return;

            const shareData = {
                title: currentSong.title,
                text: `Check out "${currentSong.title}" by ${currentSong.artist || 'Unknown'} in my OpenFret songbook.`,
                url: window.location.href
            };

            if (navigator.share) {
                navigator.share(shareData).catch(err => console.log('Error sharing:', err));
            } else {
                const text = `${shareData.text}\n\nChords: ${currentSong.chords || ''}\n\n${currentSong.lyrics || ''}`;
                navigator.clipboard.writeText(text).then(() => {
                    alert('Song copied to clipboard.');
                });
            }
        }

        function showChordChart() {
            document.getElementById('chordChartModal').style.display = 'block';
            document.body.style.overflow = 'hidden';
        }

        function closeChordChart() {
            document.getElementById('chordChartModal').style.display = 'none';
            document.body.style.overflow = 'auto';
        }

        // ===================================================================
        // Add / Edit / Delete songs
        // ===================================================================

        function showAddSongModal() {
            document.getElementById('addSongTitle').textContent = 'ADD A SONG';
            document.getElementById('songFormId').value = '';
            document.getElementById('songFormTitle').value = '';
            document.getElementById('songFormArtist').value = '';
            document.getElementById('songFormGenre').value = 'other';
            document.getElementById('songFormChords').value = '';
            document.getElementById('songFormLyrics').value = '';
            document.getElementById('songFormYoutube').value = '';
            document.getElementById('addSongModal').style.display = 'flex';
            setTimeout(() => document.getElementById('songFormTitle').focus(), 50);
        }

        function closeAddSongModal() {
            document.getElementById('addSongModal').style.display = 'none';
        }

        function editCurrentSong() {
            if (!currentSong || (window.OpenFretLibrary && window.OpenFretLibrary.isSampleSong(currentSong))) return;
            document.getElementById('addSongTitle').textContent = 'EDIT SONG';
            document.getElementById('songFormId').value = currentSong.id;
            document.getElementById('songFormTitle').value = currentSong.title || '';
            document.getElementById('songFormArtist').value = currentSong.artist || '';
            document.getElementById('songFormGenre').value = currentSong.genre || 'other';
            document.getElementById('songFormChords').value = currentSong.chords || '';
            document.getElementById('songFormLyrics').value = currentSong.lyrics || '';
            document.getElementById('songFormYoutube').value = currentSong.youtube || '';
            document.getElementById('addSongModal').style.display = 'flex';
        }

        function saveSongFromForm(e) {
            e.preventDefault();
            const id = document.getElementById('songFormId').value.trim();
            const data = {
                title: document.getElementById('songFormTitle').value,
                artist: document.getElementById('songFormArtist').value,
                genre: document.getElementById('songFormGenre').value,
                chords: document.getElementById('songFormChords').value,
                lyrics: document.getElementById('songFormLyrics').value,
                youtube: document.getElementById('songFormYoutube').value
            };
            if (!data.title.trim()) return;
            if (id) {
                const updated = window.OpenFretLibrary.updateSong(id, data);
                if (updated) {
                    currentSong = updated;
                    closeAddSongModal();
                    showSongById(id);
                }
            } else {
                const created = window.OpenFretLibrary.addSong(data);
                closeAddSongModal();
                if (created) showSongById(created.id);
            }
        }

        function deleteCurrentSong() {
            if (!currentSong || !currentSongId) return;
            if (window.OpenFretLibrary && window.OpenFretLibrary.isSampleSong(currentSong)) return;
            OpenFretApp.openConfirm(
                'DELETE SONG?',
                `"${currentSong.title}" will be permanently removed from your library. This cannot be undone.`,
                'DELETE',
                function () {
                    window.OpenFretLibrary.deleteSong(currentSongId);
                    currentSong = null;
                    currentSongId = null;
                    showSongList();
                    showTab('songs');
                }
            );
        }

        // ===================================================================
        // Library menu
        // ===================================================================

        function showLibraryMenu() {
            refreshLibraryStats();
            renderStarterPacks();
            const toggleBtn = document.getElementById('toggleSamplesBtn');
            if (toggleBtn && window.OpenFretLibrary) {
                toggleBtn.textContent = window.OpenFretLibrary.areSamplesHidden() ? 'SHOW SAMPLE SONGS' : 'HIDE SAMPLE SONGS';
            }
            document.getElementById('libraryModal').style.display = 'flex';
        }

        function renderStarterPacks() {
            const list = document.getElementById('packList');
            if (!list || !window.OpenFretLibrary) return;
            const packs = window.OpenFretLibrary.getStarterPacks();
            list.innerHTML = packs.map(function (p) {
                return `
                    <div class="of-pack">
                        <div class="of-pack-info">
                            <div class="of-pack-name">${escapeHtml(p.name)}</div>
                            <div class="of-pack-desc">${escapeHtml(p.description)}</div>
                        </div>
                        <button class="control-btn" onclick="OpenFretApp.importStarterPack('${escapeHtml(p.file)}', this)">IMPORT</button>
                    </div>`;
            }).join('');
        }

        function closeLibraryMenu() {
            document.getElementById('libraryModal').style.display = 'none';
        }

        function refreshLibraryStats() {
            const el = document.getElementById('libraryStats');
            if (!el || !window.OpenFretLibrary) return;
            const user = window.OpenFretLibrary.getUserSongs().length;
            const samples = (window.OPENFRET_SAMPLE_SONGS || []).length;
            const hidden = window.OpenFretLibrary.areSamplesHidden();
            el.innerHTML = `
                <div><strong>${user}</strong> of your songs</div>
                <div>${samples} sample songs ${hidden ? '<em>(hidden)</em>' : ''}</div>
            `;
        }

        // ===================================================================
        // Lightweight confirm dialog (shared)
        // ===================================================================

        const confirmState = { onAccept: null };

        const OpenFretApp = {
            exportLibrary: function () {
                if (window.OpenFretLibrary) window.OpenFretLibrary.exportToFile();
            },
            handleImport: function (event, mode) {
                const file = event.target.files && event.target.files[0];
                if (!file) return;
                window.OpenFretLibrary.importFromFile(file, mode)
                    .then(function (added) {
                        alert(`Imported ${added} song${added === 1 ? '' : 's'}.`);
                        closeLibraryMenu();
                    })
                    .catch(function (err) {
                        alert('Import failed: ' + err.message);
                    })
                    .then(function () { event.target.value = ''; });
            },
            toggleSamples: function () {
                if (!window.OpenFretLibrary) return;
                const next = !window.OpenFretLibrary.areSamplesHidden();
                window.OpenFretLibrary.setSamplesHidden(next);
                const toggleBtn = document.getElementById('toggleSamplesBtn');
                if (toggleBtn) toggleBtn.textContent = next ? 'SHOW SAMPLE SONGS' : 'HIDE SAMPLE SONGS';
            },
            unhideSamplesAndRefresh: function () {
                if (!window.OpenFretLibrary) return;
                window.OpenFretLibrary.setSamplesHidden(false);
            },
            importStarterPack: function (filename, btn) {
                if (!window.OpenFretLibrary) return;
                const original = btn ? btn.textContent : null;
                if (btn) { btn.textContent = 'IMPORTING...'; btn.disabled = true; }
                window.OpenFretLibrary.importPack(filename)
                    .then(function (added) {
                        if (added === 0) {
                            alert('That pack is already in your library.');
                        } else {
                            alert('Imported ' + added + ' song' + (added === 1 ? '' : 's') + ' from the pack.');
                        }
                    })
                    .catch(function (err) {
                        alert('Could not import pack: ' + err.message);
                    })
                    .then(function () {
                        if (btn) { btn.textContent = original; btn.disabled = false; }
                    });
            },
            confirmReset: function () {
                OpenFretApp.openConfirm(
                    'RESET TO SAMPLES?',
                    'This will delete all songs you have added and unhide the sample songs. This cannot be undone.',
                    'RESET',
                    function () {
                        window.OpenFretLibrary.resetToSamples();
                        closeLibraryMenu();
                        showSongList();
                        showTab('songs');
                    }
                );
            },
            openConfirm: function (title, message, okLabel, onAccept) {
                document.getElementById('confirmTitle').textContent = title;
                document.getElementById('confirmMessage').textContent = message;
                document.getElementById('confirmOkBtn').textContent = okLabel || 'CONFIRM';
                confirmState.onAccept = onAccept;
                document.getElementById('confirmModal').style.display = 'flex';
            },
            cancelConfirm: function () {
                document.getElementById('confirmModal').style.display = 'none';
                confirmState.onAccept = null;
            },
            acceptConfirm: function () {
                document.getElementById('confirmModal').style.display = 'none';
                if (typeof confirmState.onAccept === 'function') {
                    try { confirmState.onAccept(); } catch (e) { console.error(e); }
                }
                confirmState.onAccept = null;
            }
        };
        window.OpenFretApp = OpenFretApp;

        // ===================================================================
        // PRACTICE SECTION (unchanged from upstream)
        // ===================================================================

        function switchPracticeMode(mode) {
            document.querySelectorAll('.practice-mode-button').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.practice-panel').forEach(p => p.classList.remove('active'));
            document.getElementById(mode + 'Mode').classList.add('active');
            document.getElementById(mode + 'Panel').classList.add('active');
            if (mode !== 'backing') stopBackingTrack();
        }

        const ALL_NOTES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
        function noteIndex(name) { return ALL_NOTES.indexOf(name); }
        function transposedNote(root, semitones) {
            return ALL_NOTES[(noteIndex(root) + semitones + 12) % 12];
        }
        function majorChord(root) { return transposedNote(root, 0); }
        function minorChord(root) { return transposedNote(root, 0) + 'm'; }
        function dom7Chord(root) { return transposedNote(root, 0) + '7'; }

        const PROGRESSIONS = {
            '12bar': {name:'12-Bar Blues', bars: [
                {s:0,q:'7'},{s:0,q:'7'},{s:0,q:'7'},{s:0,q:'7'},
                {s:5,q:'7'},{s:5,q:'7'},{s:0,q:'7'},{s:0,q:'7'},
                {s:7,q:'7'},{s:5,q:'7'},{s:0,q:'7'},{s:7,q:'7'}
            ]},
            '145': {name:'I-IV-V-I', bars: [
                {s:0,q:''},{s:5,q:''},{s:7,q:''},{s:0,q:''}
            ]},
            '1564': {name:'I-V-vi-IV', bars: [
                {s:0,q:''},{s:7,q:''},{s:9,q:'m'},{s:5,q:''}
            ]},
            '251': {name:'ii-V-I', bars: [
                {s:2,q:'m7'},{s:7,q:'7'},{s:0,q:'maj7'},{s:0,q:'maj7'}
            ]},
            '1645': {name:'I-vi-IV-V', bars: [
                {s:0,q:''},{s:9,q:'m'},{s:5,q:''},{s:7,q:''}
            ]},
            'minor': {name:'i-iv-v-i', bars: [
                {s:0,q:'m'},{s:5,q:'m'},{s:7,q:'m'},{s:0,q:'m'}
            ]}
        };

        function getChordNames(key, progId) {
            const prog = PROGRESSIONS[progId];
            return prog.bars.map(b => transposedNote(key, b.s) + b.q);
        }

        let backingPlaying = false;
        let backingSchedulerId = null;
        let backingCurrentBar = 0;
        let backingAudioCtx = null;
        let backingGain = null;
        let backingNextTime = 0;

        function noteFreq(name, octave) {
            const A4 = 440;
            const semis = noteIndex(name) - noteIndex('A') + (octave - 4) * 12;
            return A4 * Math.pow(2, semis / 12);
        }

        function strumChord(ctx, gain, chordStr, time, duration) {
            let root = chordStr[0];
            let rest = chordStr.slice(1);
            if (rest.startsWith('#')) { root += '#'; rest = rest.slice(1); }
            let intervals;
            if (rest.includes('m7')) intervals = [0,3,7,10];
            else if (rest.includes('maj7')) intervals = [0,4,7,11];
            else if (rest.includes('7')) intervals = [0,4,7,10];
            else if (rest.includes('m')) intervals = [0,3,7];
            else intervals = [0,4,7];

            const baseFreq = noteFreq(root, 3);
            intervals.forEach((semi, i) => {
                const osc = ctx.createOscillator();
                const g = ctx.createGain();
                osc.type = 'triangle';
                osc.frequency.value = baseFreq * Math.pow(2, semi / 12);
                g.gain.setValueAtTime(0, time + i * 0.02);
                g.gain.linearRampToValueAtTime(0.18, time + i * 0.02 + 0.05);
                g.gain.linearRampToValueAtTime(0.10, time + duration * 0.6);
                g.gain.linearRampToValueAtTime(0, time + duration);
                osc.connect(g).connect(gain);
                osc.start(time + i * 0.02);
                osc.stop(time + duration + 0.05);
            });
        }

        function startBackingTrack() {
            const key = document.getElementById('backingKey').value;
            const progId = document.getElementById('backingProgression').value;
            const bpm = parseInt(document.getElementById('backingBpm').value);
            const chords = getChordNames(key, progId);

            const seqEl = document.getElementById('chordSequence');
            seqEl.innerHTML = chords.map((c, i) =>
                `<span class="chord-step" data-idx="${i}">${c}</span>`
            ).join('');

            backingAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
            backingGain = backingAudioCtx.createGain();
            backingGain.gain.value = 0.5;
            backingGain.connect(backingAudioCtx.destination);

            backingPlaying = true;
            backingCurrentBar = 0;
            backingNextTime = backingAudioCtx.currentTime + 0.1;

            const beatsPerBar = 4;
            const barDuration = () => (60 / parseInt(document.getElementById('backingBpm').value)) * beatsPerBar;

            function schedule() {
                if (!backingPlaying) return;
                while (backingNextTime < backingAudioCtx.currentTime + 0.3) {
                    const idx = backingCurrentBar % chords.length;
                    const dur = barDuration();
                    strumChord(backingAudioCtx, backingGain, chords[idx], backingNextTime, dur * 0.9);
                    backingNextTime += dur;
                    backingCurrentBar++;
                }
                const idx = (backingCurrentBar - 1) % chords.length;
                document.getElementById('currentChordDisplay').textContent = chords[idx];
                document.querySelectorAll('#chordSequence .chord-step').forEach((el, i) => {
                    el.classList.toggle('active', i === idx);
                });
                backingSchedulerId = requestAnimationFrame(schedule);
            }
            schedule();

            document.getElementById('backingPlayBtn').textContent = 'Stop';
            document.getElementById('backingPlayBtn').classList.add('playing');
        }

        function stopBackingTrack() {
            backingPlaying = false;
            if (backingSchedulerId) { cancelAnimationFrame(backingSchedulerId); backingSchedulerId = null; }
            if (backingAudioCtx) { backingAudioCtx.close(); backingAudioCtx = null; }
            const btn = document.getElementById('backingPlayBtn');
            if (btn) { btn.textContent = 'Play'; btn.classList.remove('playing'); }
            const cd = document.getElementById('currentChordDisplay');
            if (cd) cd.textContent = '--';
            document.querySelectorAll('#chordSequence .chord-step').forEach(el => el.classList.remove('active'));
        }

        document.addEventListener('DOMContentLoaded', function() {
            const bpmSlider = document.getElementById('backingBpm');
            const bpmVal = document.getElementById('backingBpmValue');
            if (bpmSlider) bpmSlider.addEventListener('input', () => { bpmVal.textContent = bpmSlider.value; });

            const playBtn = document.getElementById('backingPlayBtn');
            if (playBtn) playBtn.addEventListener('click', () => {
                if (backingPlaying) stopBackingTrack();
                else startBackingTrack();
            });
        });

        // --- Fretboard Note Quiz ---
        const GUITAR_TUNING = ['E','A','D','G','B','E'];
        const NUM_FRETS = 12;
        let quizMode = 'find';
        let quizTarget = null;
        let quizCorrect = 0;
        let quizTotal = 0;
        let quizAnswered = false;

        function fretNote(stringIdx, fret) {
            const openNote = GUITAR_TUNING[stringIdx];
            return ALL_NOTES[(noteIndex(openNote) + fret) % 12];
        }

        function drawFretboard() {
            const svg = document.getElementById('fretboardSvg');
            if (!svg) return;
            svg.innerHTML = '';
            const w = 720, h = 180;
            const fretW = w / (NUM_FRETS + 1);
            const stringGap = (h - 40) / 5;
            const topY = 20;

            const nut = document.createElementNS('http://www.w3.org/2000/svg','line');
            nut.setAttribute('x1', fretW); nut.setAttribute('y1', topY - 5);
            nut.setAttribute('x2', fretW); nut.setAttribute('y2', topY + 5 * stringGap + 5);
            nut.setAttribute('stroke','rgba(255,255,255,0.8)'); nut.setAttribute('stroke-width','3');
            svg.appendChild(nut);

            for (let f = 1; f <= NUM_FRETS; f++) {
                const x = fretW * (f + 1);
                const line = document.createElementNS('http://www.w3.org/2000/svg','line');
                line.setAttribute('x1', x); line.setAttribute('y1', topY - 5);
                line.setAttribute('x2', x); line.setAttribute('y2', topY + 5 * stringGap + 5);
                line.setAttribute('stroke','rgba(255,255,255,0.2)'); line.setAttribute('stroke-width','1');
                svg.appendChild(line);
            }

            [3,5,7,9].forEach(f => {
                const cx = fretW * f + fretW / 2 + fretW;
                const dot = document.createElementNS('http://www.w3.org/2000/svg','circle');
                dot.setAttribute('cx', cx); dot.setAttribute('cy', h / 2);
                dot.setAttribute('r', 4); dot.setAttribute('fill','rgba(255,255,255,0.15)');
                svg.appendChild(dot);
            });
            [h/2 - 15, h/2 + 15].forEach(cy => {
                const dot = document.createElementNS('http://www.w3.org/2000/svg','circle');
                dot.setAttribute('cx', fretW * 12 + fretW / 2 + fretW);
                dot.setAttribute('cy', cy); dot.setAttribute('r', 4);
                dot.setAttribute('fill','rgba(255,255,255,0.15)');
                svg.appendChild(dot);
            });

            for (let s = 0; s < 6; s++) {
                const y = topY + s * stringGap;
                const line = document.createElementNS('http://www.w3.org/2000/svg','line');
                line.setAttribute('x1', fretW); line.setAttribute('y1', y);
                line.setAttribute('x2', w); line.setAttribute('y2', y);
                line.setAttribute('stroke','rgba(255,255,255,0.4)');
                line.setAttribute('stroke-width', 2 - s * 0.15);
                svg.appendChild(line);

                const label = document.createElementNS('http://www.w3.org/2000/svg','text');
                label.setAttribute('x', fretW / 2); label.setAttribute('y', y + 5);
                label.setAttribute('text-anchor','middle');
                label.setAttribute('fill','rgba(255,255,255,0.6)');
                label.setAttribute('font-size','12');
                label.textContent = GUITAR_TUNING[s];
                svg.appendChild(label);
            }

            for (let s = 0; s < 6; s++) {
                for (let f = 0; f <= NUM_FRETS; f++) {
                    const y = topY + s * stringGap;
                    const x = f === 0 ? fretW / 2 : fretW * f + fretW / 2 + fretW;
                    const rect = document.createElementNS('http://www.w3.org/2000/svg','rect');
                    rect.setAttribute('x', x - fretW / 2 + 2);
                    rect.setAttribute('y', y - stringGap / 2 + 2);
                    rect.setAttribute('width', fretW - 4);
                    rect.setAttribute('height', stringGap - 4);
                    rect.setAttribute('fill','transparent');
                    rect.setAttribute('class','fret-marker');
                    rect.dataset.string = s;
                    rect.dataset.fret = f;
                    rect.dataset.note = fretNote(s, f);
                    rect.addEventListener('click', onFretClick);
                    svg.appendChild(rect);
                }
            }
        }

        function onFretClick(e) {
            if (quizAnswered) return;
            const clickedNote = e.target.dataset.note;

            if (quizMode === 'find') {
                if (!quizTarget) return;
                quizAnswered = true;
                quizTotal++;
                if (clickedNote === quizTarget) {
                    quizCorrect++;
                    e.target.classList.add('correct');
                    document.getElementById('quizInstruction').textContent = 'Correct!';
                } else {
                    e.target.classList.add('incorrect');
                    document.getElementById('quizInstruction').textContent = `That was ${clickedNote}. The answer was ${quizTarget}.`;
                    document.querySelectorAll('.fret-marker').forEach(el => {
                        if (el.dataset.note === quizTarget) el.classList.add('correct');
                    });
                }
                updateQuizScore();
            } else if (quizMode === 'name') {
                if (quizTarget) return;
                quizTarget = clickedNote;
                e.target.classList.add('correct');
                document.getElementById('quizInstruction').textContent = 'What note is this?';
                showNameChoices(clickedNote);
            }
        }

        function showNameChoices(correctNote) {
            const choices = document.getElementById('nameNoteChoices');
            choices.style.display = 'grid';
            const wrong = ALL_NOTES.filter(n => n !== correctNote);
            const shuffled = wrong.sort(() => Math.random() - 0.5).slice(0, 5);
            const options = [correctNote, ...shuffled].sort(() => Math.random() - 0.5);
            choices.innerHTML = options.map(n =>
                `<button class="interval-btn" onclick="checkNameAnswer('${n}','${correctNote}')">${n}</button>`
            ).join('');
        }

        function checkNameAnswer(chosen, correct) {
            if (quizAnswered) return;
            quizAnswered = true;
            quizTotal++;
            const btns = document.querySelectorAll('#nameNoteChoices .interval-btn');
            btns.forEach(b => {
                if (b.textContent === correct) b.classList.add('correct');
                if (b.textContent === chosen && chosen !== correct) b.classList.add('incorrect');
            });
            if (chosen === correct) {
                quizCorrect++;
                document.getElementById('quizInstruction').textContent = 'Correct!';
            } else {
                document.getElementById('quizInstruction').textContent = `It was ${correct}.`;
            }
            updateQuizScore();
        }

        function setQuizMode(mode) {
            quizMode = mode;
            document.getElementById('findNoteBtn').classList.toggle('active', mode === 'find');
            document.getElementById('nameNoteBtn').classList.toggle('active', mode === 'name');
            newQuestion();
        }

        function newQuestion() {
            quizAnswered = false;
            quizTarget = null;
            document.getElementById('nameNoteChoices').style.display = 'none';
            document.querySelectorAll('.fret-marker').forEach(el => {
                el.classList.remove('correct','incorrect');
            });

            if (quizMode === 'find') {
                quizTarget = ALL_NOTES[Math.floor(Math.random() * ALL_NOTES.length)];
                document.getElementById('targetNote').textContent = quizTarget;
                document.getElementById('quizInstruction').textContent = 'Tap that note on the fretboard';
            } else {
                document.getElementById('targetNote').textContent = '?';
                document.getElementById('quizInstruction').textContent = 'Tap any fret to identify the note';
            }
        }

        function updateQuizScore() {
            document.getElementById('quizScore').textContent = `Score: ${quizCorrect} / ${quizTotal}`;
        }

        document.addEventListener('DOMContentLoaded', drawFretboard);

        // --- Interval Ear Trainer ---
        const INTERVALS = [
            {name:'Unison', semitones:0},
            {name:'Minor 2nd', semitones:1},
            {name:'Major 2nd', semitones:2},
            {name:'Minor 3rd', semitones:3},
            {name:'Major 3rd', semitones:4},
            {name:'Perfect 4th', semitones:5},
            {name:'Tritone', semitones:6},
            {name:'Perfect 5th', semitones:7},
            {name:'Minor 6th', semitones:8},
            {name:'Major 6th', semitones:9},
            {name:'Minor 7th', semitones:10},
            {name:'Major 7th', semitones:11},
            {name:'Octave', semitones:12}
        ];

        let earDirection = 'ascending';
        let earCurrentInterval = null;
        let earBaseFreq = 0;
        let earCorrect = 0;
        let earTotal = 0;
        let earAnswered = false;
        let earAudioCtx = null;

        function setEarDirection(dir) {
            earDirection = dir;
            document.querySelectorAll('.ear-dir-btn').forEach(b => b.classList.remove('active'));
            document.getElementById(dir === 'ascending' ? 'earAsc' : dir === 'descending' ? 'earDesc' : 'earHarm').classList.add('active');
        }

        function playEarInterval() {
            earCurrentInterval = INTERVALS[Math.floor(Math.random() * INTERVALS.length)];
            earAnswered = false;
            document.getElementById('earFeedback').textContent = '';

            const baseNoteIdx = Math.floor(Math.random() * 12);
            const baseOctave = 3 + Math.floor(Math.random() * 2);
            earBaseFreq = 440 * Math.pow(2, (baseNoteIdx - 9 + (baseOctave - 4) * 12) / 12);
            const targetFreq = earBaseFreq * Math.pow(2, earCurrentInterval.semitones / 12);

            if (earAudioCtx) earAudioCtx.close();
            earAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
            const g = earAudioCtx.createGain();
            g.gain.value = 0.3;
            g.connect(earAudioCtx.destination);

            const now = earAudioCtx.currentTime;

            if (earDirection === 'harmonic') {
                [earBaseFreq, targetFreq].forEach(freq => {
                    const osc = earAudioCtx.createOscillator();
                    const og = earAudioCtx.createGain();
                    osc.type = 'sine';
                    osc.frequency.value = freq;
                    og.gain.setValueAtTime(0.25, now);
                    og.gain.linearRampToValueAtTime(0, now + 1.5);
                    osc.connect(og).connect(g);
                    osc.start(now);
                    osc.stop(now + 1.6);
                });
            } else {
                const first = earDirection === 'ascending' ? earBaseFreq : targetFreq;
                const second = earDirection === 'ascending' ? targetFreq : earBaseFreq;
                [first, second].forEach((freq, i) => {
                    const osc = earAudioCtx.createOscillator();
                    const og = earAudioCtx.createGain();
                    osc.type = 'sine';
                    osc.frequency.value = freq;
                    const t = now + i * 0.8;
                    og.gain.setValueAtTime(0, t);
                    og.gain.linearRampToValueAtTime(0.3, t + 0.05);
                    og.gain.linearRampToValueAtTime(0, t + 0.75);
                    osc.connect(og).connect(g);
                    osc.start(t);
                    osc.stop(t + 0.8);
                });
            }

            renderIntervalChoices();
        }

        function renderIntervalChoices() {
            const container = document.getElementById('intervalChoices');
            container.innerHTML = INTERVALS.map(iv =>
                `<button class="interval-btn" onclick="checkEarAnswer(${iv.semitones})">${iv.name}</button>`
            ).join('');
        }

        function checkEarAnswer(semitones) {
            if (earAnswered || !earCurrentInterval) return;
            earAnswered = true;
            earTotal++;

            const btns = document.querySelectorAll('#intervalChoices .interval-btn');
            btns.forEach(b => {
                if (b.textContent === earCurrentInterval.name) b.classList.add('correct');
            });

            if (semitones === earCurrentInterval.semitones) {
                earCorrect++;
                document.getElementById('earFeedback').textContent = 'Correct!';
                document.getElementById('earFeedback').style.color = '#66ff66';
            } else {
                const chosen = INTERVALS.find(i => i.semitones === semitones);
                btns.forEach(b => { if (b.textContent === chosen.name) b.classList.add('incorrect'); });
                document.getElementById('earFeedback').textContent = `It was ${earCurrentInterval.name}`;
                document.getElementById('earFeedback').style.color = '#ff6666';
            }
            document.getElementById('earScore').textContent = `Score: ${earCorrect} / ${earTotal}`;
        }

        document.addEventListener('DOMContentLoaded', renderIntervalChoices);

        function showTab(tab) {
            const songsTab = document.getElementById('songsTab');
            const scalesTab = document.getElementById('scalesTab');
            const tunerTab = document.getElementById('tunerTab');
            const metronomeTab = document.getElementById('metronomeTab');
            const practiceTab = document.getElementById('practiceTab');
            const songList = document.getElementById('songList');
            const songView = document.getElementById('songView');
            const scalesSection = document.getElementById('scalesSection');
            const tunerSection = document.getElementById('tunerSection');
            const metronomeSection = document.getElementById('metronomeSection');
            const practiceSection = document.getElementById('practiceSection');
            const searchContainer = document.getElementById('searchContainer');
            const songCount = document.getElementById('songCount');

            songsTab.classList.remove('active');
            scalesTab.classList.remove('active');
            tunerTab.classList.remove('active');
            metronomeTab.classList.remove('active');
            practiceTab.classList.remove('active');
            songList.style.display = 'none';
            songView.style.display = 'none';
            scalesSection.style.display = 'none';
            tunerSection.style.display = 'none';
            metronomeSection.style.display = 'none';
            practiceSection.style.display = 'none';

            if (tab !== 'practice' && typeof stopBackingTrack === 'function') {
                stopBackingTrack();
            }

            document.querySelector('.header').style.display = 'block';

            if (tab === 'songs') {
                songsTab.classList.add('active');
                songList.style.display = 'block';
                searchContainer.style.display = 'block';
                songCount.style.display = 'block';
                showSongList();
            } else if (tab === 'scales') {
                scalesTab.classList.add('active');
                scalesSection.style.display = 'block';
                searchContainer.style.display = 'none';
                songCount.style.display = 'none';
            } else if (tab === 'tuner') {
                tunerTab.classList.add('active');
                tunerSection.style.display = 'block';
                searchContainer.style.display = 'none';
                songCount.style.display = 'none';
            } else if (tab === 'metronome') {
                metronomeTab.classList.add('active');
                metronomeSection.style.display = 'block';
                searchContainer.style.display = 'none';
                songCount.style.display = 'none';
            } else if (tab === 'practice') {
                practiceTab.classList.add('active');
                practiceSection.style.display = 'block';
                searchContainer.style.display = 'none';
                songCount.style.display = 'none';
            }
        }

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                closeModal();
                closeChordChart();
                closeAddSongModal();
                closeLibraryMenu();
                closeHelpModal();
                OpenFretApp.cancelConfirm();
            }
        });

        window.addEventListener('DOMContentLoaded', init);
