// src/mpg321-player.ts
import { spawn } from "node:child_process";
import type { ChildProcessWithoutNullStreams } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { LOG_DIR, AUDIO_OUTPUT, BLUEALSA_DEVICE, PLAYER_BIN } from "./config.js";

export type PlayerState = "PLAYING" | "PAUSED" | "STOPPED";

export interface PlayerStatus {
    state: PlayerState;
    elapsed: number;
    duration: number;
    volume: number;
}

export class MPG321Player {
    private proc: ChildProcessWithoutNullStreams | null = null;
    private state: PlayerState = "STOPPED";
    private elapsedSec = 0;
    private durationSec = 0;
    private volume = 80;
    private logStream: fs.WriteStream;
    private onTrackEndCallback: (() => void) | null = null;

    constructor(logFileName = "mpg321.log") {
        const logPath = path.join(LOG_DIR, logFileName);
        fs.mkdirSync(LOG_DIR, { recursive: true });
        this.logStream = fs.createWriteStream(logPath, { flags: "a" });
        this.logStream.write(
            `\n--- mpg321 session started at ${new Date().toISOString()} ---\n`,
        );
    }

    start(): void {
        if (this.proc && !this.proc.killed && this.proc.exitCode === null) {
            return;
        }

        const args: string[] = ["-R"];

        // Use ALSA + bluealsa, matching your tested CLI:
        // mpg321 -o alsa -a bluealsa file.mp3
        args.push("-o", AUDIO_OUTPUT);

        if (BLUEALSA_DEVICE && BLUEALSA_DEVICE.trim().length > 0) {
            // e.g. "bluealsa" or full "bluealsa:DEV=...,PROFILE=a2dp"
            args.push("-a", BLUEALSA_DEVICE);
        }

        this.proc = spawn(PLAYER_BIN, args);

        this.proc.on("error", (err) => {
            console.error("player process error:", err);
            this.proc = null;
            this.state = "STOPPED";
        });

        this.proc.stdin?.on("error", (err) => {
            console.error("player stdin error:", err);
        });

        this.proc.stdout.on("data", (buf) => this.handleStdout(buf));
        this.proc.stderr.on("data", (buf) => this.handleStderr(buf));
        this.proc.on("exit", () => {
            this.state = "STOPPED";
        });

        this.logStream.write(`Started mpg321 with args: ${args.join(" ")}\n`);

        // Set initial volume
        this.setVolume(this.volume);
    }

    private send(cmd: string): void {
        if (!this.proc || this.proc.killed) return;
        if (!this.proc.stdin || this.proc.stdin.destroyed || this.proc.stdin.writableEnded) return;
        if (!this.proc || this.proc.killed || this.proc.exitCode !== null) {
            this.start();
        }
        if (!this.proc) return;

        try {
            this.proc.stdin.write(cmd + "\n",
                (err) => {
                    if (err) {
                        console.error("write to player failed:", err);
                    }
                }
            );
            this.logStream.write(`> ${cmd}\n`);
        } catch (err) {
            this.logStream.write(`Error sending command "${cmd}": ${String(err)}\n`);
        }
    }

    load(filePath: string): boolean {
        if (!filePath || !fs.existsSync(filePath)) {
            this.logStream.write(`Audio file does not exist: ${filePath}\n`);
            this.state = "STOPPED";
            this.elapsedSec = 0;
            this.durationSec = 0;
            return false;
        }

        this.elapsedSec = 0;
        this.durationSec = 0;
        this.state = "PLAYING";
        this.send(`LOAD ${filePath}`);
        return true;
    }

    pause(): void {
        if (this.state === "PLAYING") {
            this.state = "PAUSED";
        } else if (this.state === "PAUSED") {
            this.state = "PLAYING";
        }
        this.send("PAUSE");
    }

    stop(): void {
        this.state = "STOPPED";
        this.elapsedSec = 0;
        this.send("STOP");
    }

    setVolume(val: number): void {
        const v = Math.max(0, Math.min(100, Math.round(val)));
        this.volume = v;
        // mpg321 uses GAIN in remote mode
        this.send(`GAIN ${v}`);
    }

    seek(seconds: number): void {
        const sign = seconds >= 0 ? "+" : "";
        this.send(`JUMP ${sign}${seconds}s`);
    }

    getStatus(): PlayerStatus {
        return {
            state: this.state,
            elapsed: Number(this.elapsedSec.toFixed(1)),
            duration: Number(this.durationSec.toFixed(1)),
            volume: this.volume,
        };
    }

    onTrackEnd(cb: () => void): void {
        this.onTrackEndCallback = cb;
    }

    quit(): void {
        this.send("QUIT");
        if (this.proc) {
            this.proc.kill();
            this.proc = null;
        }
        this.logStream.write("mpg321 quit requested.\n");
        this.logStream.end();
    }

    private handleStdout(buf: Buffer): void {
        const line = buf.toString().trim();
        if (!line) return;

        this.logStream.write(`< ${line}\n`);

        // mpg321 remote mode is designed to be a drop-in replacement for mpg123
        // and emits similar @F/@P status lines for frontends.[web:263]
        if (line.startsWith("@F")) {
            // @F frame frames_left elapsed_sec sec_left
            const parts = line.split(/\s+/);
            if (parts.length >= 5) {
                const curSec = parseFloat(parts[3]!);
                const remSec = parseFloat(parts[4]!);
                if (!Number.isNaN(curSec) && !Number.isNaN(remSec)) {
                    this.elapsedSec = curSec;
                    this.durationSec = curSec + remSec;
                    if (this.state !== "PAUSED") {
                        this.state = "PLAYING";
                    }
                }
            }
        } else if (line.startsWith("@P 1")) {
            // Paused
            this.state = "PAUSED";
        } else if (line.startsWith("@P 2")) {
            // Playing
            this.state = "PLAYING";
        } else if (line.startsWith("@P 0") || line.startsWith("@E")) {
            const wasPlaying = this.state === "PLAYING";
            this.state = "STOPPED";

            if (line.startsWith("@E")) {
                this.logStream.write(`mpg321 error frame: ${line}\n`);
            }

            if (wasPlaying && this.onTrackEndCallback) {
                this.onTrackEndCallback();
            }
        }
    }

    private handleStderr(buf: Buffer): void {
        const line = buf.toString().trim();
        if (!line) return;

        this.logStream.write(`[stderr] ${line}\n`);
    }
}