# Purpose
    Implements playlist discovery and navigation in TypeScript for your Node.js 20.19.2 MP3 player running on Raspberry Pi Zero W.

    Mirrors the behavior of the original Python PlaylistManager while exposing a clean API to the HTTP server and audio player.

# Responsibilities
    Recursively scan a configured music directory for audio files.

    Build an in‑memory list of tracks with normalized metadata.

    Maintain the current track index and playback modes (shuffle and repeat).

    Provide navigation helpers (current, next, previous) for the rest of the system.

# Public Types
    RepeatMode

    Represents repeat behavior:

    "off" – no repeat.

    "all" – repeat entire playlist.

    "one" – repeat the current track.

    Track

    Represents a single audio track:

    id – unique identifier (derived from filename).

    path – absolute filesystem path to the audio file.

    filename – original filename.

    title – human‑friendly title inferred from filename.

    artist – placeholder artist (currently "Unknown Artist").

    album – placeholder album (currently "Music Folder").

# PlaylistManager Class
## Construction
    - constructor(musicDir: string)

        - Stores the root directory to scan for audio files.

        - Typically wired to config.MUSIC_DIR, e.g. /home/piotrek/player/music.

## Core State
tracks: Track[]

The full in‑memory playlist.

currentIndex: number

Index of the currently selected track.

shuffle: boolean

Whether shuffle mode is active.

repeatMode: RepeatMode

Current repeat mode ("off", "all", or "one").

Scanning and Track Building
scanMusicDirectory()
Recursively walks musicDir using Node’s filesystem APIs.

Filters files by extension:

Supported extensions: .mp3, .flac, .wav, .ogg.

Builds a Track instance for each audio file by calling buildTrack().

Resets tracks to the new list and currentIndex to 0.

Catches and logs filesystem errors, ensuring the playlist state is valid even on failures.

buildTrack(fullPath: string)
Derives metadata from filesystem properties:

filename – basename of fullPath.

id – set to filename for uniqueness within the directory tree.

title – derived from filename by:

Stripping the extension.

Replacing separators like - and _ with spaces.

artist – default "Unknown Artist" (ready for future ID3 tag parsing).

album – default "Music Folder".

# Read Operations
getPlaylist()
Returns the full tracks array.

Used by API endpoints like GET /api/playlist to expose the library to the web UI.

getCurrentTrack()
Returns the current Track or null if the playlist is empty.

Performs bounds checking:

If currentIndex is out of range, it is reset to 0.

Ensures the daemon always sees a valid track or explicit null.

Navigation Operations
setIndex(index: number)
Sets currentIndex to index if it is within [0, tracks.length).

Returns the track at the new index, or null if the index is invalid.

Used when the UI selects a specific track by index (e.g., clicking in the playlist).

nextTrack()
Applies navigation rules in this order:

If playlist is empty:

Returns null.

If shuffle is true:

Picks a random index in [0, tracks.length) and returns that track.

If repeatMode is "one":

Returns getCurrentTrack() without changing currentIndex.

Otherwise:

Increments currentIndex by 1.

If currentIndex exceeds the last index:

If repeatMode is "all":

Wraps to 0 and returns the first track.

If repeatMode is "off":

Sets currentIndex to the last index and returns null to signal end of playlist.

If currentIndex is within range:

Returns the track at the new index.

prevTrack()
Mirrors nextTrack() logic for backward navigation:

If playlist is empty:

Returns null.

If shuffle is true:

Picks a random track and returns it.

If repeatMode is "one":

Returns getCurrentTrack() without changing currentIndex.

Otherwise:

Decrements currentIndex by 1.

If currentIndex drops below 0:

If repeatMode is "all":

Wraps to the last track and returns it.

If repeatMode is "off":

Resets to 0 and returns null to signal start of playlist.

If currentIndex is within range:

Returns the track at the new index.

Mode Toggles
toggleShuffle()
Flips shuffle from true to false or vice versa.

Returns the new value.

Used by POST /api/shuffle to change shuffle state and send it back to the UI.

setRepeat(mode: string)
Normalizes string inputs into a RepeatMode:

"all" → repeat entire playlist.

"one" → repeat single track.

Anything else → "off".

Sets repeatMode and returns the effective RepeatMode.

Used by POST /api/repeat to update repeat state.