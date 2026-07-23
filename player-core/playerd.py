#!/usr/bin/env python3
import sys
import os
import time
import json
import logging
import subprocess
import threading
import shutil
from pathlib import Path
from http.server import HTTPServer, BaseHTTPRequestHandler
from socketserver import ThreadingMixIn

# Local imports
import config
from playlist import PlaylistManager
from bluetooth import BluetoothManager
from gpio import GPIOHandler

# Setup Logging
logger = logging.getLogger("playerd")
logger.setLevel(logging.INFO)

file_handler = logging.FileHandler(config.PLAYER_LOG_FILE)
file_handler.setFormatter(logging.Formatter("[%(asctime)s] [%(levelname)s] %(name)s: %(message)s"))
logger.addHandler(file_handler)

stream_handler = logging.StreamHandler(sys.stdout)
stream_handler.setFormatter(logging.Formatter("[%(asctime)s] [%(levelname)s]: %(message)s"))
logger.addHandler(stream_handler)


class MPG123Player:
    """Manages the mpg123 process in remote mode (-R)."""
    def __init__(self, log_path=config.MPG123_LOG_FILE):
        self.log_path = log_path
        self.process = None
        self.state = "STOPPED"  # "PLAYING", "PAUSED", "STOPPED"
        self.current_frame = 0
        self.frames_left = 0
        self.elapsed_sec = 0.0
        self.duration_sec = 0.0
        self.volume = 80
        self.lock = threading.Lock()
        self.reader_thread = None
        self.stderr_thread = None
        self.on_track_end_callback = None
        self.mpg123_bin = shutil.which("mpg123") or "mpg123"

        # Initialize log file
        with open(self.log_path, "a") as f:
            f.write(f"\n--- mpg123 session started at {time.ctime()} ---\n")

    def start(self):
        """Starts the mpg123 background process in remote mode."""
        if self.process and self.process.poll() is None:
            return

        cmd = [self.mpg123_bin, "-R"]
        if config.AUDIO_OUTPUT and config.AUDIO_OUTPUT != "default":
            cmd.extend(["-o", config.AUDIO_OUTPUT])
        else:
            # Explicitly request pulse or alsa to prevent mpg123 from attempting JACK connection and crashing
            cmd.extend(["-o", "pulse,alsa"])

        try:
            self.process = subprocess.Popen(
                cmd,
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                bufsize=1
            )

            time.sleep(0.1)
            # If specified driver failed immediately, retry without -o flag
            if self.process.poll() is not None:
                logger.warning("mpg123 failed to start with configured driver. Retrying with basic remote mode...")
                cmd = [self.mpg123_bin, "-R"]
                self.process = subprocess.Popen(
                    cmd,
                    stdin=subprocess.PIPE,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    text=True,
                    bufsize=1
                )

            self.reader_thread = threading.Thread(target=self._read_output, daemon=True)
            self.reader_thread.start()
            self.stderr_thread = threading.Thread(target=self._read_stderr, daemon=True)
            self.stderr_thread.start()
            logger.info("mpg123 process started in Remote mode.")

            # Set initial volume
            self.set_volume(self.volume)
        except Exception as e:
            logger.error(f"Failed to start mpg123 process: {e}")

    def _send_command(self, cmd_str):
        """Sends a raw string command to mpg123 stdin."""
        if not self.process or self.process.poll() is not None:
            self.start()

        if self.process and self.process.stdin:
            try:
                self.process.stdin.write(cmd_str + "\n")
                self.process.stdin.flush()
                with open(self.log_path, "a") as f:
                    f.write(f"> {cmd_str}\n")
            except Exception as e:
                logger.error(f"Error sending command '{cmd_str}' to mpg123: {e}")

    def load(self, filepath):
        """Loads and plays an MP3 / audio file."""
        if not filepath or not os.path.exists(filepath):
            logger.error(f"Audio file does not exist: {filepath}")
            with self.lock:
                self.state = "STOPPED"
            return False

        with self.lock:
            self.elapsed_sec = 0.0
            self.duration_sec = 0.0
            self.state = "PLAYING"
        self._send_command(f"LOAD {filepath}")
        return True

    def pause(self):
        """Toggles pause / resume."""
        with self.lock:
            if self.state == "PLAYING":
                self.state = "PAUSED"
            elif self.state == "PAUSED":
                self.state = "PLAYING"
        self._send_command("PAUSE")

    def stop(self):
        """Stops playback."""
        with self.lock:
            self.state = "STOPPED"
            self.elapsed_sec = 0.0
        self._send_command("STOP")

    def set_volume(self, val):
        """Sets volume percentage (0-100)."""
        val = max(0, min(100, int(val)))
        with self.lock:
            self.volume = val
        self._send_command(f"VOLUME {val}")

    def seek(self, seconds):
        """Seeks forward/backward by seconds or absolute position."""
        self._send_command(f"JUMP +{seconds}s" if seconds >= 0 else f"JUMP {seconds}s")

    def _read_output(self):
        """Reads and interprets lines output by mpg123 remote mode."""
        if not self.process or not self.process.stdout:
            return

        with open(self.log_path, "a") as log_file:
            for line in self.process.stdout:
                line_str = line.strip()
                log_file.write(f"< {line_str}\n")

                if line_str.startswith("@F"):
                    # @F frame frames_left elapsed_sec sec_left
                    parts = line_str.split()
                    if len(parts) >= 5:
                        try:
                            cur_sec = float(parts[3])
                            rem_sec = float(parts[4])
                            with self.lock:
                                self.elapsed_sec = cur_sec
                                self.duration_sec = cur_sec + rem_sec
                                if self.state != "PAUSED":
                                    self.state = "PLAYING"
                        except ValueError:
                            pass
                elif line_str.startswith("@P 1"):
                    # Paused
                    with self.lock:
                        self.state = "PAUSED"
                elif line_str.startswith("@P 2"):
                    # Playing
                    with self.lock:
                        self.state = "PLAYING"
                elif line_str.startswith("@P 0") or line_str.startswith("@E"):
                    # Stopped / Finished track / Error
                    was_playing = False
                    with self.lock:
                        was_playing = (self.state == "PLAYING")
                        self.state = "STOPPED"
                    if line_str.startswith("@E"):
                        logger.error(f"mpg123 error frame: {line_str}")
                    elif was_playing and self.on_track_end_callback:
                        self.on_track_end_callback()

    def _read_stderr(self):
        """Reads stderr output from mpg123 and logs warnings/errors."""
        if not self.process or not self.process.stderr:
            return

        with open(self.log_path, "a") as log_file:
            for line in self.process.stderr:
                line_str = line.strip()
                if line_str:
                    log_file.write(f"[stderr] {line_str}\n")
                    logger.warning(f"mpg123 stderr: {line_str}")

    def get_status(self):
        with self.lock:
            return {
                "state": self.state,
                "elapsed": round(self.elapsed_sec, 1),
                "duration": round(self.duration_sec, 1),
                "volume": self.volume
            }

    def quit(self):
        if self.process:
            self._send_command("QUIT")
            try:
                self.process.wait(timeout=2)
            except Exception:
                self.process.kill()


# Threaded HTTP Server
class ThreadedHTTPServer(ThreadingMixIn, HTTPServer):
    daemon_threads = True


class RequestHandler(BaseHTTPRequestHandler):
    player = None
    playlist_mgr = None
    bt_mgr = None

    def log_message(self, format, *args):
        # Redirect standard HTTP access logs to player logger
        logger.info(f"{self.address_string()} - {format % args}")

    def _send_json(self, data, status=200):
        body = json.dumps(data).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _send_file(self, file_path, content_type):
        try:
            with open(file_path, "rb") as f:
                content = f.read()
            self.send_response(200)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(content)))
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(content)
        except Exception as e:
            self.send_error(404, f"File not found: {e}")

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self):
        url_path = self.path.split("?")[0]

        if url_path == "/api/status":
            player_status = self.player.get_status()
            current_track = self.playlist_mgr.get_current_track()
            bt_status = self.bt_mgr.get_status()
            self._send_json({
                "status": "ok",
                "player": player_status,
                "track": current_track,
                "shuffle": self.playlist_mgr.shuffle,
                "repeat": self.playlist_mgr.repeat_mode,
                "bluetooth": bt_status
            })

        elif url_path == "/api/playlist":
            tracks = self.playlist_mgr.get_playlist()
            self._send_json({
                "status": "ok",
                "count": len(tracks),
                "current_index": self.playlist_mgr.current_index,
                "tracks": tracks
            })

        elif url_path == "/api/bluetooth":
            self._send_json({
                "status": "ok",
                "bluetooth": self.bt_mgr.get_status()
            })

        else:
            # Serve Static Web UI Files
            rel_path = url_path.lstrip("/")
            if not rel_path:
                rel_path = "index.html"

            target_file = Path(config.WEB_UI_DIR) / rel_path
            if target_file.is_file():
                ext = target_file.suffix.lower()
                content_types = {
                    ".html": "text/html",
                    ".css": "text/css",
                    ".js": "application/javascript",
                    ".png": "image/png",
                    ".jpg": "image/jpeg",
                    ".svg": "image/svg+xml",
                    ".json": "application/json"
                }
                ctype = content_types.get(ext, "application/octet-stream")
                self._send_file(target_file, ctype)
            else:
                self.send_error(404, "Page Not Found")

    def do_POST(self):
        content_length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(content_length).decode("utf-8") if content_length > 0 else "{}"
        try:
            req_data = json.loads(body) if body else {}
        except Exception:
            req_data = {}

        url_path = self.path.split("?")[0]

        if url_path == "/api/play":
            if "index" in req_data:
                track = self.playlist_mgr.set_index(int(req_data["index"]))
                if track:
                    self.player.load(track["path"])
            else:
                if self.player.state == "PAUSED":
                    self.player.pause()
                else:
                    track = self.playlist_mgr.get_current_track()
                    if track:
                        self.player.load(track["path"])
            self._send_json({"status": "ok", "state": self.player.state})

        elif url_path == "/api/pause":
            self.player.pause()
            self._send_json({"status": "ok", "state": self.player.state})

        elif url_path == "/api/stop":
            self.player.stop()
            self._send_json({"status": "ok", "state": self.player.state})

        elif url_path == "/api/next":
            track = self.playlist_mgr.next_track()
            if track:
                self.player.load(track["path"])
            else:
                self.player.stop()
            self._send_json({"status": "ok", "track": track})

        elif url_path == "/api/prev":
            track = self.playlist_mgr.prev_track()
            if track:
                self.player.load(track["path"])
            self._send_json({"status": "ok", "track": track})

        elif url_path == "/api/volume":
            val = req_data.get("volume", 80)
            self.player.set_volume(val)
            self._send_json({"status": "ok", "volume": self.player.volume})

        elif url_path == "/api/shuffle":
            is_shuffled = self.playlist_mgr.toggle_shuffle()
            self._send_json({"status": "ok", "shuffle": is_shuffled})

        elif url_path == "/api/repeat":
            mode = req_data.get("mode", "off")
            rep_mode = self.playlist_mgr.set_repeat(mode)
            self._send_json({"status": "ok", "repeat": rep_mode})

        elif url_path == "/api/rescan":
            self.playlist_mgr.scan_music_directory()
            self._send_json({"status": "ok", "count": len(self.playlist_mgr.tracks)})

        elif url_path == "/api/bluetooth/connect":
            mac = req_data.get("mac")
            if mac:
                success, msg = self.bt_mgr.connect(mac)
                self._send_json({"status": "ok" if success else "error", "message": msg})
            else:
                self._send_json({"status": "error", "message": "Missing MAC address"}, status=400)

        elif url_path == "/api/bluetooth/disconnect":
            mac = req_data.get("mac")
            if mac:
                success, msg = self.bt_mgr.disconnect(mac)
                self._send_json({"status": "ok" if success else "error", "message": msg})
            else:
                self._send_json({"status": "error", "message": "Missing MAC address"}, status=400)

        else:
            self.send_error(404, "API Endpoint Not Found")


def main():
    logger.info("Starting playerd MP3 daemon...")

    player = MPG123Player()
    playlist_mgr = PlaylistManager()
    bt_mgr = BluetoothManager()

    # Callback when a track ends automatically
    def on_track_end():
        logger.info("Track ended. Playing next track...")
        next_t = playlist_mgr.next_track()
        if next_t:
            player.load(next_t["path"])

    player.on_track_end_callback = on_track_end
    player.start()

    # Hardware GPIO buttons map
    gpio_handler = GPIOHandler({
        'play_pause': lambda: player.pause() if player.state == "PLAYING" else (
            player.load(playlist_mgr.get_current_track()["path"]) if playlist_mgr.get_current_track() else None
        ),
        'next': lambda: player.load(playlist_mgr.next_track()["path"]) if playlist_mgr.next_track() else None,
        'prev': lambda: player.load(playlist_mgr.prev_track()["path"]) if playlist_mgr.prev_track() else None,
        'vol_up': lambda: player.set_volume(player.volume + 5),
        'vol_down': lambda: player.set_volume(player.volume - 5),
    })

    # Pass dependencies to HTTP request handler class
    RequestHandler.player = player
    RequestHandler.playlist_mgr = playlist_mgr
    RequestHandler.bt_mgr = bt_mgr

    server = ThreadedHTTPServer((config.HTTP_HOST, config.HTTP_PORT), RequestHandler)
    logger.info(f"playerd HTTP API server running on http://{config.HTTP_HOST}:{config.HTTP_PORT}")

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        logger.info("Shutting down playerd daemon...")
    finally:
        gpio_handler.cleanup()
        player.quit()
        server.server_close()


if __name__ == "__main__":
    main()
