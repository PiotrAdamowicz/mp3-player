Binary & output path

Uses mpg321 instead of mpg123, with the tested -R -o alsa -a bluealsa combination that already plays audio on your Pi Zero W.

AUDIO_OUTPUT and BLUEALSA_DEVICE come from config.ts, so you can tweak drivers/devices without touching this file.

State and status

Tracks state (PLAYING / PAUSED / STOPPED), elapsedSec, durationSec, volume.

getStatus() returns { state, elapsed, duration, volume }, which matches what your HTTP API expects for /api/status.

Remote commands

LOAD path – start playback of a file.

PAUSE – toggle pause/resume.

STOP – stop playback.

GAIN X – set volume percentage (mpg321’s remote command).

JUMP +/-Xs – seek.

QUIT – terminate the remote process.
These are the same remote control semantics you used in Python, adjusted for mpg321’s GAIN instead of mpg123’s VOLUME.

Output parsing

Watches stdin for remote mode status lines:

@F – frame + timing; used to update elapsedSec and durationSec.

@P 1 – paused.

@P 2 – playing.

@P 0 / @E – stopped or error; triggers onTrackEndCallback() when a playing track ends.

This is aligned with the documented behavior of mpg321 as a drop‑in replacement for mpg123’s remote protocol.

Integration points

start() – call once at daemon startup (e.g. in server.ts’s main()), or implicitly from send() on first use.

load(path) / pause() / stop() / setVolume() – used by your HTTP handlers (/api/play, /api/pause, etc.).

onTrackEnd(cb) – wired to playlist auto‑advance in server.ts.

quit() – called from SIGINT handler or systemd stop to cleanly terminate mpg321 and close the log.