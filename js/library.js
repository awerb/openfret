/**
 * OpenFret library layer.
 *
 * Responsibilities:
 *   - merge built-in sample songs with user-added songs from localStorage
 *   - CRUD on user songs (add, update, delete)
 *   - export the user library to a single JSON file
 *   - import a JSON file (replace or merge)
 *   - hide / show sample songs
 *
 * Public surface (attached to window.OpenFretLibrary):
 *   getAllSongs()           -> array of song objects (samples + user, respecting hide flag)
 *   getUserSongs()          -> array of user-added song objects
 *   getSongById(id)         -> single song object or null
 *   addSong(song)           -> returns the added song with assigned id
 *   updateSong(id, patch)   -> returns the updated song or null
 *   deleteSong(id)          -> boolean
 *   exportToFile()          -> triggers JSON download
 *   importFromFile(file, mode) -> 'replace' | 'merge', returns count imported
 *   resetToSamples()        -> wipes user songs and unhides samples
 *   areSamplesHidden()      -> boolean
 *   setSamplesHidden(bool)
 *   isSampleSong(songOrId)  -> boolean
 *   onChange(cb)            -> register a change listener; returns unsubscribe fn
 */
(function () {
    'use strict';

    var STORAGE_KEY = 'openfret.userSongs.v1';
    var SAMPLES_HIDDEN_KEY = 'openfret.samplesHidden.v1';

    var listeners = [];

    function readUserSongs() {
        try {
            var raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return [];
            var parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed : [];
        } catch (e) {
            console.warn('OpenFret: could not read user songs from localStorage.', e);
            return [];
        }
    }

    function writeUserSongs(songs) {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(songs));
        } catch (e) {
            console.error('OpenFret: could not save user songs to localStorage.', e);
            alert('Sorry, I could not save your song. Your browser storage may be full or disabled.');
        }
        notifyChange();
    }

    function getSamples() {
        return Array.isArray(window.OPENFRET_SAMPLE_SONGS) ? window.OPENFRET_SAMPLE_SONGS.slice() : [];
    }

    function areSamplesHidden() {
        return localStorage.getItem(SAMPLES_HIDDEN_KEY) === 'true';
    }

    function setSamplesHidden(hidden) {
        localStorage.setItem(SAMPLES_HIDDEN_KEY, hidden ? 'true' : 'false');
        notifyChange();
    }

    function getUserSongs() {
        return readUserSongs();
    }

    function getAllSongs() {
        var samples = areSamplesHidden() ? [] : getSamples();
        var user = readUserSongs();
        // User songs first so they appear at the top of the list.
        return user.concat(samples);
    }

    function getSongById(id) {
        var all = getAllSongs();
        for (var i = 0; i < all.length; i++) {
            if (all[i].id === id) return all[i];
        }
        return null;
    }

    function isSampleSong(songOrId) {
        if (!songOrId) return false;
        if (typeof songOrId === 'string') {
            var samples = getSamples();
            for (var i = 0; i < samples.length; i++) {
                if (samples[i].id === songOrId) return true;
            }
            return false;
        }
        return songOrId.sample === true;
    }

    function generateId() {
        return 'user-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
    }

    function addSong(song) {
        if (!song || !song.title) {
            throw new Error('A song must have at least a title.');
        }
        var newSong = {
            id: song.id || generateId(),
            title: String(song.title).trim(),
            artist: String(song.artist || '').trim() || 'Unknown',
            genre: String(song.genre || '').trim().toLowerCase() || 'other',
            chords: String(song.chords || '').trim(),
            lyrics: String(song.lyrics || ''),
            youtube: String(song.youtube || '').trim(),
            license: String(song.license || '').trim(),
            sample: false,
            createdAt: Date.now()
        };
        var songs = readUserSongs();
        songs.unshift(newSong);
        writeUserSongs(songs);
        return newSong;
    }

    function updateSong(id, patch) {
        var songs = readUserSongs();
        var idx = -1;
        for (var i = 0; i < songs.length; i++) {
            if (songs[i].id === id) { idx = i; break; }
        }
        if (idx === -1) return null;
        var updated = Object.assign({}, songs[idx], patch, {
            id: id,
            sample: false,
            updatedAt: Date.now()
        });
        songs[idx] = updated;
        writeUserSongs(songs);
        return updated;
    }

    function deleteSong(id) {
        var songs = readUserSongs();
        var next = songs.filter(function (s) { return s.id !== id; });
        if (next.length === songs.length) return false;
        writeUserSongs(next);
        return true;
    }

    function exportToFile() {
        var data = {
            app: 'OpenFret',
            version: 1,
            exportedAt: new Date().toISOString(),
            songs: readUserSongs()
        };
        var json = JSON.stringify(data, null, 2);
        var blob = new Blob([json], { type: 'application/json' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        var stamp = new Date().toISOString().slice(0, 10);
        a.href = url;
        a.download = 'openfret-library-' + stamp + '.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    function importFromFile(file, mode) {
        return new Promise(function (resolve, reject) {
            if (!file) return reject(new Error('No file selected.'));
            var reader = new FileReader();
            reader.onload = function () {
                try {
                    var parsed = JSON.parse(reader.result);
                    var incoming = Array.isArray(parsed) ? parsed
                        : Array.isArray(parsed.songs) ? parsed.songs
                        : null;
                    if (!incoming) {
                        return reject(new Error('That file does not look like an OpenFret library.'));
                    }
                    var clean = incoming
                        .filter(function (s) { return s && s.title; })
                        .map(function (s) {
                            return {
                                id: s.id || generateId(),
                                title: String(s.title),
                                artist: String(s.artist || 'Unknown'),
                                genre: String(s.genre || 'other').toLowerCase(),
                                chords: String(s.chords || ''),
                                lyrics: String(s.lyrics || ''),
                                youtube: String(s.youtube || ''),
                                license: String(s.license || ''),
                                sample: false,
                                createdAt: s.createdAt || Date.now()
                            };
                        });
                    var existing = mode === 'replace' ? [] : readUserSongs();
                    var existingIds = {};
                    existing.forEach(function (s) { existingIds[s.id] = true; });
                    var added = 0;
                    clean.forEach(function (s) {
                        if (existingIds[s.id]) {
                            // dedupe by id on merge
                            return;
                        }
                        existing.push(s);
                        added++;
                    });
                    writeUserSongs(existing);
                    resolve(added);
                } catch (e) {
                    reject(new Error('Could not read that file: ' + e.message));
                }
            };
            reader.onerror = function () { reject(new Error('Failed to read file.')); };
            reader.readAsText(file);
        });
    }

    function resetToSamples() {
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem(SAMPLES_HIDDEN_KEY);
        notifyChange();
    }

    /**
     * Fetch a starter pack JSON from the songs/ folder and merge it into the
     * user library. Returns the number of songs added (skipping duplicates by id).
     */
    function importPack(filename) {
        return fetch('songs/' + filename, { cache: 'no-cache' })
            .then(function (res) {
                if (!res.ok) throw new Error('Could not load pack: ' + filename);
                return res.json();
            })
            .then(function (parsed) {
                var incoming = Array.isArray(parsed) ? parsed
                    : Array.isArray(parsed.songs) ? parsed.songs
                    : null;
                if (!incoming) throw new Error('Pack has no songs.');
                var existing = readUserSongs();
                var existingIds = {};
                existing.forEach(function (s) { existingIds[s.id] = true; });
                var added = 0;
                incoming.forEach(function (s) {
                    if (!s || !s.title || existingIds[s.id]) return;
                    existing.push({
                        id: s.id || generateId(),
                        title: String(s.title),
                        artist: String(s.artist || 'Unknown'),
                        genre: String(s.genre || 'other').toLowerCase(),
                        chords: String(s.chords || ''),
                        lyrics: String(s.lyrics || ''),
                        youtube: String(s.youtube || ''),
                        license: String(s.license || ''),
                        sample: false,
                        createdAt: s.createdAt || Date.now()
                    });
                    added++;
                });
                writeUserSongs(existing);
                return added;
            });
    }

    // Built-in catalog of starter packs. Add to this when you ship a new JSON file
    // in the songs/ folder.
    var STARTER_PACKS = [
        { file: 'campfire-classics.json', name: 'Campfire Classics', description: '8 traditional campfire songs everyone knows. Three-chord-friendly.' },
        { file: 'blues-101.json',          name: 'Blues 101',          description: '6 foundational blues and early jazz numbers. 12-bar form practice.' },
        { file: 'holiday-classics.json',   name: 'Holiday Classics',   description: '6 traditional Christmas carols. Great for group singing.' }
    ];

    function getStarterPacks() { return STARTER_PACKS.slice(); }

    function onChange(cb) {
        if (typeof cb !== 'function') return function () {};
        listeners.push(cb);
        return function () {
            listeners = listeners.filter(function (fn) { return fn !== cb; });
        };
    }

    function notifyChange() {
        listeners.forEach(function (fn) {
            try { fn(); } catch (e) { console.error(e); }
        });
    }

    window.OpenFretLibrary = {
        getAllSongs: getAllSongs,
        getUserSongs: getUserSongs,
        getSongById: getSongById,
        addSong: addSong,
        updateSong: updateSong,
        deleteSong: deleteSong,
        exportToFile: exportToFile,
        importFromFile: importFromFile,
        resetToSamples: resetToSamples,
        areSamplesHidden: areSamplesHidden,
        setSamplesHidden: setSamplesHidden,
        isSampleSong: isSampleSong,
        importPack: importPack,
        getStarterPacks: getStarterPacks,
        onChange: onChange
    };
})();
