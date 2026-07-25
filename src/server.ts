// src/server.ts
import express from "express";
import type { Request, Response } from "express";

import {
    MUSIC_DIR,
    WEB_UI_DIR,
    HTTP_HOST,
    HTTP_PORT,
} from "./config.js";
import { PlaylistManager } from "./playlist.js";
import { BluetoothManager } from "./bluetooth.js";
import { MPG321Player } from "./playered.js";
// import { GPIOController } from "./gpio.js";
import dotenv from "dotenv";
import path from "node:path";

console.log({ WEB_UI_DIR })

dotenv.config({ path: ".env" });

if (process.env.NODE_ENV !== "production") {
    dotenv.config({ path: ".env.local", override: true });
}

const app = express();

// --- Singletons / core services --- //
const playlist = new PlaylistManager(MUSIC_DIR);
const bluetooth = new BluetoothManager();
const player = new MPG321Player();
// const gpio = new GPIOController();

// gpio.onButton((button, event) => {
//     // React only on button press, ignore release events
//     if (event !== "press") return;

//     switch (button) {
//         case "play":
//             // old play_pause logic
//             {
//                 const status = player.getStatus();
//                 if (status.state === "PLAYING") {
//                     player.pause();
//                 } else {
//                     const track = playlist.getCurrentTrack();
//                     if (track) player.load(track.path);
//                 }
//             }
//             break;

//         case "next":
//             {
//                 const track = playlist.nextTrack();
//                 if (track) player.load(track.path);
//             }
//             break;

//         case "prev":
//             {
//                 const track = playlist.prevTrack();
//                 if (track) player.load(track.path);
//             }
//             break;

//         case "stop":
//             // you can treat STOP as stop only, or reuse play/pause if you prefer
//             player.stop();
//             break;
//     }
// });

app.get("/", (_req, res) => {
    res.sendFile(path.join(WEB_UI_DIR, "index.html"));
});

// --- Basic app setup --- //
app.use(express.json());

// Serve static web UI
app.use("/", express.static(WEB_UI_DIR));

// --- API routes --- //

// Status
app.get("/api/status", async (_req: Request, res: Response) => {
    const playerStatus = player.getStatus();
    const currentTrack = playlist.getCurrentTrack();
    const btStatus = await bluetooth.getStatus();

    res.json({
        status: "ok",
        player: playerStatus,
        track: currentTrack,
        shuffle: playlist.shuffle,
        repeat: playlist.repeatMode,
        bluetooth: btStatus,
    });
});

// Playlist
app.get("/api/playlist", (_req: Request, res: Response) => {
    const tracks = playlist.getPlaylist();
    res.json({
        status: "ok",
        count: tracks.length,
        current_index: playlist.currentIndex,
        tracks,
    });
});

// Play / pause / stop / next / prev
app.post("/api/play", (req: Request, res: Response) => {
    const { index } = req.body as { index?: number };
    if (typeof index === "number") {
        const t = playlist.setIndex(index);
        if (t) player.load(t.path);
    } else {
        const status = player.getStatus();
        if (status.state === "PAUSED") {
            player.pause();
        } else {
            const t = playlist.getCurrentTrack();
            if (t) player.load(t.path);
        }
    }
    res.json({ status: "ok", state: player.getStatus().state });
});

app.post("/api/pause", (_req: Request, res: Response) => {
    player.pause();
    res.json({ status: "ok", state: player.getStatus().state });
});

app.post("/api/stop", (_req: Request, res: Response) => {
    player.stop();
    res.json({ status: "ok", state: player.getStatus().state });
});

app.post("/api/next", (_req: Request, res: Response) => {
    const track = playlist.nextTrack();
    if (track) player.load(track.path);
    res.json({ status: "ok", track });
});

app.post("/api/prev", (_req: Request, res: Response) => {
    const track = playlist.prevTrack();
    if (track) player.load(track.path);
    res.json({ status: "ok", track });
});

// Volume / shuffle / repeat / rescan
app.post("/api/volume", (req: Request, res: Response) => {
    const { volume = 80 } = req.body as { volume?: number };
    player.setVolume(volume);
    res.json({ status: "ok", volume: player.getStatus().volume });
});

app.post("/api/shuffle", (_req: Request, res: Response) => {
    const s = playlist.toggleShuffle();
    res.json({ status: "ok", shuffle: s });
});

app.post("/api/repeat", (req: Request, res: Response) => {
    const { mode = "off" } = req.body as { mode?: string };
    const r = playlist.setRepeat(mode);
    res.json({ status: "ok", repeat: r });
});

app.post("/api/rescan", (_req: Request, res: Response) => {
    playlist.scanMusicDirectory();
    res.json({ status: "ok", count: playlist.getPlaylist().length });
});

// Bluetooth
app.get("/api/bluetooth", async (_req: Request, res: Response) => {
    const btStatus = await bluetooth.getStatus();
    res.json({ status: "ok", bluetooth: btStatus });
});

app.post("/api/bluetooth/connect", async (req: Request, res: Response) => {
    const { mac } = req.body as { mac?: string };
    if (!mac) {
        return res.status(400).json({ status: "error", message: "Missing MAC address" });
    }
    const [success, msg] = await bluetooth.connect(mac);
    res.json({ status: success ? "ok" : "error", message: msg });
});

app.post("/api/bluetooth/disconnect", async (req: Request, res: Response) => {
    const { mac } = req.body as { mac?: string };
    if (!mac) {
        return res.status(400).json({ status: "error", message: "Missing MAC address" });
    }
    const [success, msg] = await bluetooth.disconnect(mac);
    res.json({ status: success ? "ok" : "error", message: msg });
});

// --- Start server --- //
async function main() {
    // Initial scan and player start
    playlist.scanMusicDirectory();
    player.start();

    // Track-end callback → auto-next
    player.onTrackEnd(() => {
        const t = playlist.nextTrack();
        if (t) player.load(t.path);
    });

    app.listen(HTTP_PORT, HTTP_HOST, () => {
        console.log(`player-node HTTP API on http://${HTTP_HOST}:${HTTP_PORT}`);
    });
}

// process.on("SIGINT", () => {
//     gpio.close();
//     player.quit();
//     process.exit(0);
// });

main().catch((err) => {
    console.error("Fatal error starting server:", err);
    process.exit(1);
});