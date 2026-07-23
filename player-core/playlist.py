import os
import random
import logging
from pathlib import Path
import config

logger = logging.getLogger("playerd.playlist")

SUPPORTED_EXTENSIONS = {".mp3", ".flac", ".wav", ".ogg", ".m4a", ".aac"}

class PlaylistManager:
    def __init__(self, music_dir=None):
        self.music_dir = Path(music_dir or config.MUSIC_DIR)
        self.tracks = []
        self.current_index = -1
        self.shuffle = False
        self.repeat_mode = "off"  # "off", "all", "one"
        self.original_order = []
        self.scan_music_directory()

    def scan_music_directory(self):
        """Scans the configured music directory recursively for supported audio files."""
        found_tracks = []
        if self.music_dir.exists():
            for path in sorted(self.music_dir.glob("**/*")):
                if path.is_file() and path.suffix.lower() in SUPPORTED_EXTENSIONS:
                    rel_path = path.relative_to(self.music_dir)
                    found_tracks.append({
                        "id": str(rel_path),
                        "path": str(path.resolve()),
                        "filename": path.name,
                        "title": path.stem.replace("_", " ").replace("-", " ").title(),
                        "artist": path.parent.name if path.parent != self.music_dir else "Unknown Artist",
                        "album": path.parent.name if path.parent != self.music_dir else "Music Folder",
                    })

        self.tracks = found_tracks
        self.original_order = list(self.tracks)
        if self.tracks and self.current_index == -1:
            self.current_index = 0
        logger.info(f"Scanned {len(self.tracks)} tracks from {self.music_dir}")

    def get_current_track(self):
        """Returns the track dict at current index or None."""
        if 0 <= self.current_index < len(self.tracks):
            return self.tracks[self.current_index]
        return None

    def get_playlist(self):
        """Returns list of tracks with selection state."""
        result = []
        for idx, track in enumerate(self.tracks):
            item = dict(track)
            item["is_current"] = (idx == self.current_index)
            result.append(item)
        return result

    def set_index(self, index):
        """Sets current track by index."""
        if 0 <= index < len(self.tracks):
            self.current_index = index
            return self.get_current_track()
        return None

    def next_track(self):
        """Advances to the next track considering repeat mode and shuffle."""
        if not self.tracks:
            return None

        if self.repeat_mode == "one":
            return self.get_current_track()

        if self.current_index + 1 < len(self.tracks):
            self.current_index += 1
        elif self.repeat_mode == "all":
            self.current_index = 0
        else:
            return None

        return self.get_current_track()

    def prev_track(self):
        """Moves to the previous track."""
        if not self.tracks:
            return None

        if self.current_index > 0:
            self.current_index -= 1
        elif self.repeat_mode == "all":
            self.current_index = len(self.tracks) - 1

        return self.get_current_track()

    def toggle_shuffle(self):
        """Toggles shuffle mode and reorganizes tracks."""
        self.shuffle = not self.shuffle
        current_track = self.get_current_track()

        if self.shuffle:
            random.shuffle(self.tracks)
            if current_track in self.tracks:
                # Keep current playing track at its new shuffled index
                self.current_index = self.tracks.index(current_track)
        else:
            self.tracks = list(self.original_order)
            if current_track in self.tracks:
                self.current_index = self.tracks.index(current_track)

        return self.shuffle

    def set_repeat(self, mode):
        """Sets repeat mode: 'off', 'all', or 'one'."""
        if mode in ("off", "all", "one"):
            self.repeat_mode = mode
        return self.repeat_mode
