// src/playlist.ts
import fs from "node:fs";
import path from "node:path";

export type RepeatMode = "off" | "all" | "one";

export interface Track {
    id: string;
    path: string;
    filename: string;
    title: string;
    artist: string;
    album: string;
}

export class PlaylistManager {
    private musicDir: string;
    tracks: Track[] = [];
    currentIndex = 0;
    shuffle = false;
    repeatMode: RepeatMode = "off";

    constructor(musicDir: string) {
        this.musicDir = musicDir;
    }

    // Scan music directory and rebuild playlist
    scanMusicDirectory() {
        this.tracks = [];
        this.currentIndex = 0;

        const exts = new Set([".mp3", ".flac", ".wav", ".ogg"]);

        const walk = (dir: string) => {
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            for (const entry of entries) {
                const full = path.join(dir, entry.name);
                if (entry.isDirectory()) {
                    walk(full);
                } else {
                    const ext = path.extname(entry.name).toLowerCase();
                    if (ext && exts.has(ext)) {
                        this.tracks.push(this.buildTrack(full));
                    }
                }
            }
        };

        try {
            walk(this.musicDir);
        } catch (err) {
            console.error("Error scanning music directory:", err);
            this.tracks = [];
            this.currentIndex = 0;
        }
    }

    private buildTrack(fullPath: string): Track {
        const filename = path.basename(fullPath);
        const id = filename;
        // Very simple metadata for now; you can hook real tags later
        const title = filename.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ");
        const artist = "Unknown Artist";
        const album = "Music Folder";

        return { id, path: fullPath, filename, title, artist, album };
    }

    getPlaylist(): Track[] {
        return this.tracks;
    }

    getCurrentTrack(): Track | null {
        if (this.tracks.length === 0) return null;
        if (this.currentIndex < 0 || this.currentIndex >= this.tracks.length) {
            this.currentIndex = 0;
        }
        return this.tracks[this.currentIndex] ?? null;
    }

    setIndex(index: number): Track | null {
        if (index < 0 || index >= this.tracks.length) return null;
        this.currentIndex = index;
        return this.tracks[this.currentIndex]!;
    }

    nextTrack(): Track | null {
        const n = this.tracks.length;
        if (n === 0) return null;

        if (this.shuffle) {
            this.currentIndex = Math.floor(Math.random() * n);
            return this.tracks[this.currentIndex]!;
        }

        if (this.repeatMode === "one") {
            return this.getCurrentTrack();
        }

        this.currentIndex += 1;

        if (this.currentIndex >= n) {
            if (this.repeatMode === "all") {
                this.currentIndex = 0;
                return this.tracks[this.currentIndex]!;
            } else {
                this.currentIndex = n - 1;
                return null; // end of playlist, no auto-wrap
            }
        }

        return this.tracks[this.currentIndex]!;
    }

    prevTrack(): Track | null {
        const n = this.tracks.length;
        if (n === 0) return null;

        if (this.shuffle) {
            this.currentIndex = Math.floor(Math.random() * n);
            return this.tracks[this.currentIndex]!;
        }

        if (this.repeatMode === "one") {
            return this.getCurrentTrack();
        }

        this.currentIndex -= 1;

        if (this.currentIndex < 0) {
            if (this.repeatMode === "all") {
                this.currentIndex = n - 1;
                return this.tracks[this.currentIndex]!;
            } else {
                this.currentIndex = 0;
                return null; // start of playlist, no auto-wrap
            }
        }

        return this.tracks[this.currentIndex]!;
    }

    toggleShuffle(): boolean {
        this.shuffle = !this.shuffle;
        return this.shuffle;
    }

    setRepeat(mode: string): RepeatMode {
        if (mode === "all" || mode === "one") {
            this.repeatMode = mode;
        } else {
            this.repeatMode = "off";
        }
        return this.repeatMode;
    }
}