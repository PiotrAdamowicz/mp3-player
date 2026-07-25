import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const MUSIC_DIR = process.env.MUSIC_DIR || "/home/piotrek/mp3-player/music";
export const LOG_DIR = process.env.LOG_DIR || "/home/piotrek/mp3-player/logs";
export const WEB_UI_DIR =
    process.env.WEB_UI_DIR || path.join(__dirname, "../web-ui");


export const HTTP_HOST = "0.0.0.0";
export const HTTP_PORT = 8080;

export const PLAYER_BIN = process.env.PLAYER_BIN || "mpg123";
export const AUDIO_OUTPUT = "alsa";
export const BLUEALSA_DEVICE = "bluealsa";

export const PLAY_BUTTON_PIN = 18;
export const NEXT_BUTTON_PIN = 23;
export const PREV_BUTTON_PIN = 24;
export const STOP_BUTTON_PIN = 25;
export const LED_PIN = 12;