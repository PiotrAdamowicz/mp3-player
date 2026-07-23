### Project Layout
                           
    /home/piotek/Work/mp3-player/                                                                                                                                                                 
    ├── player-core/                                                                                                                                                                              
    │   ├── config.py          # Centralized configuration (paths, audio output, ports, GPIO pins)                                                                                                
    │   ├── playlist.py        # Helpers for recursive folder scanning, track indexing, shuffle & repeat                                                                                          
    │   ├── bluetooth.py       # Bluetooth status & device connection helpers (via bluetoothctl)                                                                                                  
    │   ├── gpio.py            # GPIO button handler module (Raspberry Pi compatible with mock fallback)                                                                                          
    │   └── playerd.py         # Main daemon: manages mpg123 remote mode process, handles HTTP API & web server                                                                                   
    ├── web-ui/                                                                                                                                                                                   
    │   ├── index.html         # Sleek glassmorphism HTML5 player UI                                                                                                                              
    │   ├── styles.css         # Modern dark mode design system & animations                                                                                                                      
    │   └── app.js             # JS controller (REST API integration, polling, player controls)                                                                                                   
    ├── music/                 # Audio files folder (scanned recursively for .mp3, .flac, .wav, etc.)                                                                                             
    │   └── README.md                                                                                                                                                                             
    ├── logs/                                                                                                                                                                                     
    │   ├── player.log         # Daemon runtime logs                                                                                                                                              
    │   └── mpg123.log         # Raw mpg123 process output log                                                                                                                                    

Resume with -c (or command below):
agy --conversation=ead2fb87-a7a7-4153-b7c2-775df512e347

    └── systemd/
        └── playerd.service    # Systemd service unit file for autostart on boot
    ──────
  ### Component Summary
  
  1. **config.py**: Configures environment variables, paths (MUSIC_DIR, LOG_DIR, WEB_UI_DIR), HTTP server host/port (8080), audio output driver (default, alsa, bluealsa), and hardware GPIO pin  
  mappings.
  2. **playlist.py**: Scans audio files, manages playlist order, tracks index position, and supports Shuffle & Repeat (OFF, ALL, ONE) modes.
  3. **bluetooth.py**: Integrates bluetoothctl to list paired Bluetooth audio devices and trigger connection/disconnection.
  4. **gpio.py**: Configures physical button listeners on Raspberry Pi (Play/Pause, Next, Prev, Volume Up/Down) with a safe fallback when running on standard PC hardware.
  5. **playerd.py**: The core daemon process. Spawns mpg123 -R in interactive remote mode, parses output frames for real-time seek position, and exposes a HTTP REST API (/api/status, /api/play, 
  /api/pause, /api/next, /api/prev, /api/volume, /api/playlist, /api/bluetooth). Also serves the static Web UI.
  6. Web UI (index.html, styles.css, app.js): A dark-mode, glassmorphism web dashboard featuring:
      • Rotating vinyl album art animation during playback
      • Real-time animated audio spectrum visualizer
      • Interactive progress bar with scrubbing support
      • Library search and track filter
      • Bluetooth status indicator & device pairing modal
  7. **playerd.service**: Systemd service unit file configured for automatic startup on system boot.
  ──────
  ### How to Run
  
  1. Run directly from terminal:
    python3 /home/piotek/Work/mp3-player/player-core/playerd.py
    Open http://localhost:8080 in your web browser.
  2. Install as a Systemd service (autostart on boot):
    sudo cp /home/piotek/Work/mp3-player/systemd/playerd.service /etc/systemd/system/
    sudo systemctl daemon-reload
    sudo systemctl enable --now playerd