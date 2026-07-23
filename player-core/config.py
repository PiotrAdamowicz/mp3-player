import os
from pathlib import Path

# Base project paths
BASE_DIR = Path(__file__).resolve().parent.parent
MUSIC_DIR = os.environ.get("MUSIC_DIR", str(BASE_DIR / "music"))
LOG_DIR = os.environ.get("LOG_DIR", str(BASE_DIR / "logs"))
WEB_UI_DIR = os.environ.get("WEB_UI_DIR", str(BASE_DIR / "web-ui"))

PLAYER_LOG_FILE = os.path.join(LOG_DIR, "player.log")
MPG123_LOG_FILE = os.path.join(LOG_DIR, "mpg123.log")

# HTTP Server configuration
HTTP_HOST = os.environ.get("HTTP_HOST", "0.0.0.0")
HTTP_PORT = int(os.environ.get("HTTP_PORT", 8080))

# Audio Device Settings
AUDIO_OUTPUT = os.environ.get("AUDIO_OUTPUT", "default")  # 'alsa', 'bluealsa', 'pulse', or 'default'
BLUEALSA_DEVICE = os.environ.get("BLUEALSA_DEVICE", "")   # e.g., '00:11:22:33:44:55'

# GPIO Settings (Raspberry Pi optional pins)
GPIO_ENABLED = os.environ.get("GPIO_ENABLED", "false").lower() in ("true", "1", "yes")
GPIO_PIN_PLAY_PAUSE = int(os.environ.get("GPIO_PIN_PLAY_PAUSE", 17))
GPIO_PIN_NEXT = int(os.environ.get("GPIO_PIN_NEXT", 22))
GPIO_PIN_PREV = int(os.environ.get("GPIO_PIN_PREV", 27))
GPIO_PIN_VOL_UP = int(os.environ.get("GPIO_PIN_VOL_UP", 23))
GPIO_PIN_VOL_DOWN = int(os.environ.get("GPIO_PIN_VOL_DOWN", 24))

# Ensure required directories exist
os.makedirs(MUSIC_DIR, exist_ok=True)
os.makedirs(LOG_DIR, exist_ok=True)
