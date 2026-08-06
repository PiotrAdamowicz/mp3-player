/**
 * AudioPulse MP3 Player - Frontend Application Script
 */

const API_BASE = ""; // Same origin

// DOM Elements
const playBtn = document.getElementById("play-btn");
const playIcon = document.getElementById("play-icon");
const pauseIcon = document.getElementById("pause-icon");
const prevBtn = document.getElementById("prev-btn");
const nextBtn = document.getElementById("next-btn");
const shuffleBtn = document.getElementById("shuffle-btn");
const repeatBtn = document.getElementById("repeat-btn");
const repeatBadge = document.getElementById("repeat-badge");

const trackTitle = document.getElementById("track-title");
const trackArtist = document.getElementById("track-artist");
const trackAlbum = document.getElementById("track-album");
const playerCard = document.querySelector(".player-card");

const timeCurrent = document.getElementById("time-current");
const timeDuration = document.getElementById("time-duration");
const progressBar = document.getElementById("progress-bar");
const progressFill = document.getElementById("progress-fill");

const volumeSlider = document.getElementById("volume-slider");
const volumeLabel = document.getElementById("volume-label");

const playlistItems = document.getElementById("playlist-items");
const playlistSearch = document.getElementById("playlist-search");
const trackCountBadge = document.getElementById("track-count-badge");
const rescanBtn = document.getElementById("rescan-btn");

const btModalBtn = document.getElementById("bt-modal-btn");
const btStatusBadge = document.getElementById("bt-status-badge");
const btModal = document.getElementById("bt-modal");
const btModalClose = document.getElementById("bt-modal-close");
const btConnectedText = document.getElementById("bt-connected-text");
const btDeviceList = document.getElementById("bt-device-list");

// State
let isPlaying = false;
let currentPlaylist = [];
let isUserScrubbing = false;

// Format seconds into M:SS
function formatTime(seconds) {
  if (isNaN(seconds) || seconds === null) return "0:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

// API Helper
async function apiCall(endpoint, method = "GET", body = null) {
  try {
    const options = {
      method,
      headers: { "Content-Type": "application/json" }
    };
    if (body) options.body = JSON.stringify(body);
    const res = await fetch(`${API_BASE}${endpoint}`, options);
    return await res.json();
  } catch (err) {
    console.error(`API Error (${endpoint}):`, err);
    return null;
  }
}

// Poll status from playerd daemon
async function updateStatus() {
  const data = await apiCall("/api/status");
  if (!data) return;

  const player = data.player || {};
  const track = data.track;
  const state = player.state || "STOPPED";
  isPlaying = (state === "PLAYING");

  // Update Player Card state
  if (isPlaying) {
    playerCard.classList.add("playing");
    playIcon.classList.add("hidden");
    pauseIcon.classList.remove("hidden");
  } else {
    playerCard.classList.remove("playing");
    playIcon.classList.remove("hidden");
    pauseIcon.classList.add("hidden");
  }

  // Update Track details
  if (track) {
    trackTitle.textContent = track.title || track.filename;
    trackArtist.textContent = track.artist || "Unknown Artist";
    trackAlbum.textContent = track.album || "Music Folder";
  } else {
    trackTitle.textContent = "No Track Loaded";
    trackArtist.textContent = "Select a track from playlist";
    trackAlbum.textContent = "MP3 Player";
  }

  // Update Time Progress
  if (!isUserScrubbing && player.duration > 0) {
    const elapsed = player.elapsed || 0;
    const duration = player.duration || 1;
    const percent = Math.min(100, (elapsed / duration) * 100);

    timeCurrent.textContent = formatTime(elapsed);
    timeDuration.textContent = formatTime(duration);
    progressBar.value = percent;
    progressFill.style.width = `${percent}%`;
  }

  // Update Volume slider if not active
  if (document.activeElement !== volumeSlider && player.volume !== undefined) {
    volumeSlider.value = player.volume;
    volumeLabel.textContent = `${player.volume}%`;
  }

  // Update Shuffle & Repeat Buttons
  if (data.shuffle) {
    shuffleBtn.classList.add("active");
  } else {
    shuffleBtn.classList.remove("active");
  }

  const repMode = data.repeat || "off";
  if (repMode !== "off") {
    repeatBtn.classList.add("active");
    repeatBadge.textContent = repMode.toUpperCase();
  } else {
    repeatBtn.classList.remove("active");
    repeatBadge.textContent = "OFF";
  }

  // Update Bluetooth Badge
  const bt = data.bluetooth || {};
  if (bt.connected_device) {
    btStatusBadge.textContent = bt.connected_device.name || "Connected";
    btStatusBadge.className = "badge badge-connected";
  } else {
    btStatusBadge.textContent = bt.available ? "BT Ready" : "BT Off";
    btStatusBadge.className = "badge badge-disconnected";
  }
}

// Fetch & Render Playlist
async function loadPlaylist() {
  const data = await apiCall("/api/playlist");
  if (!data || !data.tracks) return;

  currentPlaylist = data.tracks;
  trackCountBadge.textContent = `${currentPlaylist.length} songs`;
  renderPlaylistItems(currentPlaylist);
}

function renderPlaylistItems(tracks) {
  playlistItems.innerHTML = "";
  const searchTerm = playlistSearch.value.toLowerCase().trim();

  tracks.forEach((track, index) => {
    if (searchTerm) {
      const matchTitle = track.title.toLowerCase().includes(searchTerm);
      const matchArtist = track.artist.toLowerCase().includes(searchTerm);
      const matchFilename = track.filename.toLowerCase().includes(searchTerm);
      if (!matchTitle && !matchArtist && !matchFilename) return;
    }

    const li = document.createElement("li");
    li.className = `playlist-item ${track.is_current ? 'active' : ''}`;
    li.innerHTML = `
      <span class="track-num">${index + 1}</span>
      <div class="track-meta">
        <div class="track-meta-title">${escapeHtml(track.title || track.filename)}</div>
        <div class="track-meta-artist">${escapeHtml(track.artist)}</div>
      </div>
      ${track.is_current ? `
        <svg class="playing-icon" viewBox="0 0 24 24" fill="currentColor">
          <polygon points="5 3 19 12 5 21 5 3" />
        </svg>
      ` : ''}
    `;

    li.addEventListener("click", () => {
      apiCall("/api/play", "POST", { index });
      setTimeout(updateStatus, 300);
      setTimeout(loadPlaylist, 300);
    });

    playlistItems.appendChild(li);
  });
}

function escapeHtml(text) {
  if (!text) return "";
  return text.replace(/[&<>"']/g, function(m) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m];
  });
}

// Event Listeners
playBtn.addEventListener("click", () => {
  if (isPlaying) {
    apiCall("/api/pause", "POST");
  } else {
    apiCall("/api/play", "POST");
  }
  setTimeout(updateStatus, 200);
});

prevBtn.addEventListener("click", async () => {
  await apiCall("/api/prev", "POST");
  setTimeout(updateStatus, 200);
  setTimeout(loadPlaylist, 200);
});

nextBtn.addEventListener("click", async () => {
  await apiCall("/api/next", "POST");
  setTimeout(updateStatus, 200);
  setTimeout(loadPlaylist, 200);
});

shuffleBtn.addEventListener("click", async () => {
  await apiCall("/api/shuffle", "POST");
  setTimeout(updateStatus, 200);
});

repeatBtn.addEventListener("click", async () => {
  const currentText = repeatBadge.textContent.toLowerCase();
  const nextMode = currentText === "off" ? "all" : (currentText === "all" ? "one" : "off");
  await apiCall("/api/repeat", "POST", { mode: nextMode });
  setTimeout(updateStatus, 200);
});

volumeSlider.addEventListener("input", (e) => {
  const val = e.target.value;
  volumeLabel.textContent = `${val}%`;
  apiCall("/api/volume", "POST", { volume: parseInt(val) });
});

progressBar.addEventListener("mousedown", () => { isUserScrubbing = true; });
progressBar.addEventListener("touchstart", () => { isUserScrubbing = true; });
progressBar.addEventListener("mouseup", () => { isUserScrubbing = false; });
progressBar.addEventListener("touchend", () => { isUserScrubbing = false; });

playlistSearch.addEventListener("input", () => {
  renderPlaylistItems(currentPlaylist);
});

rescanBtn.addEventListener("click", async () => {
  rescanBtn.classList.add("spinning");
  await apiCall("/api/rescan", "POST");
  await loadPlaylist();
  await updateStatus();
  rescanBtn.classList.remove("spinning");
});

// Bluetooth Modal logic
btModalBtn.addEventListener("click", async () => {
  btModal.classList.remove("hidden");
  const data = await apiCall("/api/bluetooth");
  if (data && data.bluetooth) {
    const bt = data.bluetooth;
    btConnectedText.textContent = bt.connected_device 
      ? `Connected to ${bt.connected_device.name}` 
      : "No device connected";
    
    btDeviceList.innerHTML = "";
    (bt.paired_devices || []).forEach(dev => {
      const li = document.createElement("li");
      li.className = "bt-device-item";
      li.innerHTML = `
        <span>${escapeHtml(dev.name)} (${dev.mac})</span>
        <button class="connect-bt-btn">Connect</button>
      `;
      li.querySelector("button").addEventListener("click", async () => {
        const res = await apiCall("/api/bluetooth/connect", "POST", { mac: dev.mac });
        alert(res.message || "Connecting...");
        btModal.classList.add("hidden");
      });
      btDeviceList.appendChild(li);
    });
  }
});

btModalClose.addEventListener("click", () => {
  btModal.classList.add("hidden");
});

// Initialization
document.addEventListener("DOMContentLoaded", () => {
  updateStatus();
  loadPlaylist();
  // Poll daemon every 1 second
  setInterval(updateStatus, 1000);
});
