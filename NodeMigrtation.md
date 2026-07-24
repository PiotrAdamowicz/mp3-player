## Folder Layout

/home/piotrek/player-node/
├── src/
│   ├── config.ts           // central config (paths, ports, audio devices)
│   ├── playlist.ts         // recursive scan, index, shuffle/repeat
│   ├── bluetooth.ts        // bluetoothctl integration helpers
│   ├── gpio.ts             // GPIO wrapper (real + mock)
│   └── server.ts           // main daemon: mpg321 process, HTTP API, static UI
├── web-ui/
│   ├── index.html
│   ├── styles.css
│   └── app.js
├── logs/
│   ├── player.log
│   └── mpg321.log
└── systemd/
    └── player-node.service // systemd unit for Node daemon

## 
4. Implement Node equivalents of your Python modules
config.ts
Export constants: MUSIC_DIR, LOG_DIR, WEB_UI_DIR, HTTP_HOST, HTTP_PORT, AUDIO_OUTPUT, BLUEALSA_DEVICE (if you want to bake in -o alsa -a bluealsa), plus GPIO pin map.

On Pi Zero, keep paths identical to current Python setup (/home/piotrek/player/music, etc.) to avoid churn.

playlist.ts
Use fs and path to recursively scan MUSIC_DIR for .mp3/.flac/.wav.

Maintain an in‑memory array of track objects { id, path, filename, title, artist, album }, plus currentIndex, shuffle, repeatMode.

Expose methods paralleling the Python PlaylistManager:

scanMusicDirectory()

getPlaylist()

getCurrentTrack()

setIndex(i)

nextTrack()

prevTrack()

toggleShuffle()

setRepeat(mode)

This stays pure JS/TS; no Pi‑specific bits here.

bluetooth.ts
Use child_process.spawn or execFile to talk to bluetoothctl, similar to how you do it now in Python.

Implement:

getStatus(): Promise<{available, connectedDevice, pairedDevices}>

connect(mac): Promise<[success, message]>

disconnect(mac): Promise<[success, message]>

Under the hood, run small bluetoothctl scripts (scan off; info MAC; connect MAC; etc.), parse output lines, resolve promises.

Node is perfectly happy running CLI tools like bluetoothctl on Pi; multiple tutorials use this pattern for Pi IoT projects.

gpio.ts
On Pi Zero, you can use lightweight libraries like onoff or rpi-gpio to attach interrupts to pins. On your dev laptop, you’ll use a mock implementation.

Design GPIOHandler with a similar interface to your Python class:

constructor(buttonMap: { play_pause, next, prev, vol_up, vol_down })

Internally set up on('change') handlers that call the passed callbacks.

cleanup() to unexport pins.

You can gate actual GPIO usage on process.arch === 'arm' && process.platform === 'linux' so dev machine doesn’t try to open Pi pins.

5. Node audio player wrapper (MPG321Player)
Instead of Python’s subprocess.Popen, use Node’s child_process.spawn:

Responsibility:

Start mpg321 -R -o alsa -a bluealsa.

Send commands via stdin (LOAD, PAUSE, STOP, QUIT, GAIN).

Read stdout/stderr lines, update in‑memory state (PLAYING/PAUSED, elapsed, duration).

Call onTrackEnd() when track finishes.

Outline:

ts
import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import fs from 'fs';

class MPG321Player {
  private proc: ChildProcessWithoutNullStreams | null = null;
  private state = 'STOPPED';
  private elapsed = 0;
  private duration = 0;
  private volume = 80;
  private logStream = fs.createWriteStream(LOG_PATH, { flags: 'a' });
  private onTrackEnd?: () => void;

  start() {
    if (this.proc && !this.proc.killed) return;

    const cmd = 'mpg321';
    const args = ['-R', '-o', 'alsa', '-a', 'bluealsa'];

    this.proc = spawn(cmd, args);
    this.proc.stdout.on('data', this.handleStdout);
    this.proc.stderr.on('data', this.handleStderr);
    this.proc.on('exit', () => { this.state = 'STOPPED'; });
    this.setVolume(this.volume);
  }

  private send(cmd: string) {
    if (!this.proc) this.start();
    this.proc?.stdin.write(cmd + '\n');
    this.logStream.write(`> ${cmd}\n`);
  }

  load(path: string) { /* validate path, set state, send("LOAD " + path) */ }
  pause() { /* toggle state, send("PAUSE") */ }
  stop() { /* send("STOP") */ }
  setVolume(v: number) { /* clamp 0–100, send("GAIN " + v) */ }

  private handleStdout = (buf: Buffer) => {
    const line = buf.toString().trim();
    this.logStream.write(`< ${line}\n`);
    // parse play/pause/frames similar to Python version
  };

  private handleStderr = (buf: Buffer) => {
    const line = buf.toString().trim();
    if (!line) return;
    this.logStream.write(`[stderr] ${line}\n`);
    // log warning
  };

  getStatus() { return { state: this.state, elapsed: this.elapsed, duration: this.duration, volume: this.volume }; }
  quit() { this.send('QUIT'); /* handle proc exit */ }
}
The logic mirrors your current MPG123Player, just rewritten in JS/TS; the remote protocol and output parsing stay conceptually the same.

6. HTTP API and static web serving in Node
You already have a stable API shape and web UI; keep them:

Use either:

http module + fs.createReadStream for static files and JSON responses, or

a minimal Express server if you want nicer routing but still lightweight.

Mirror your existing endpoints:

GET /api/status → return {status, player, track, shuffle, repeat, bluetooth}.

GET /api/playlist → return playlist and current index.

GET /api/bluetooth → return BT status.

POST /api/play / pause / stop / next / prev / volume / shuffle / repeat / rescan / bluetooth/connect / bluetooth/disconnect.

Static serving:

Map GET / → web-ui/index.html.

Serve JS/CSS/images from web-ui as you already do in Python.

This preserves the current web UI unchanged; only the backend implementation and runtime move to Node.

7. systemd unit for Node 20 daemon
Create systemd/player-node.service analogous to playerd.service:

ExecStart=/usr/local/bin/node /home/piotrek/player-node/dist/server.js (or directly src/server.js if you run plain JS).

WorkingDirectory=/home/piotrek/player-node.

Restart=on-failure.

Enable on boot:

sudo cp systemd/player-node.service /etc/systemd/system/

sudo systemctl daemon-reload

sudo systemctl enable --now player-node

This matches your current boot behavior; only the binary changes from python3 to node.

8. Development workflow
On your dev machine:

Mirror the player-node repo.

Use Node 20.19.x as well for consistency (via nvm on your dev box).

For GPIO/Bluetooth, run in “mock mode” (skip real bluetoothctl/GPIO on non‑Pi).

Deployment:

Push to Git.

git pull on Pi Zero.

Restart player-node systemd service.

So the overall answer to “is there a lot to replace?”:

The architecture stays the same: one daemon, modular core, same API+UI, same systemd story.

You mainly:

Install Node 20 armv6l from unofficial builds.

Re‑implement the Python player-core modules in Node using child processes.

Keep your existing web UI and HTTP API shape.