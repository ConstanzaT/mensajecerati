const ARTIST = "Gustavo Cerati";
const CERATI_DEEZER_ARTIST_ID = 1374;
const DEEZER_SEARCH_URL =
  "https://api.deezer.com/search/track?q=artist:%22Gustavo%20Cerati%22&limit=100&output=jsonp";

const els = {
  audio: document.querySelector("#audio"),
  audioB: document.querySelector("#audioB"),
  album: document.querySelector("#album"),
  circularTimeline: document.querySelector("#circularTimeline"),
  cover: document.querySelector("#cover"),
  currentTime: document.querySelector("#currentTime"),
  disc: document.querySelector("#disc"),
  copyLyric: document.querySelector("#copyLyric"),
  deezerLink: document.querySelector("#deezerLink"),
  duration: document.querySelector("#duration"),
  lyricLine: document.querySelector("#lyricLine"),
  next: document.querySelector("#next"),
  play: document.querySelector("#play"),
  playIcon: document.querySelector("#playIcon"),
  prev: document.querySelector("#prev"),
  progress: document.querySelector("#progress"),
  rainDrops: document.querySelector("#rainDrops"),
  rainSplashes: document.querySelector("#rainSplashes"),
  ambientMessageTitle: document.querySelector("#ambientMessageTitle"),
  ambientMessageSubtitle: document.querySelector("#ambientMessageSubtitle"),
  ambientToggles: [...document.querySelectorAll(".ambient-toggle")],
  rainToggle: document.querySelector("#rainToggle"),
  rainToggleText: document.querySelector("#rainToggleText"),
  waterToggle: document.querySelector("#waterToggle"),
  waterToggleText: document.querySelector("#waterToggleText"),
  windToggle: document.querySelector("#windToggle"),
  windToggleText: document.querySelector("#windToggleText"),
  fireToggle: document.querySelector("#fireToggle"),
  fireToggleText: document.querySelector("#fireToggleText"),
  shootingStarLayer: document.querySelector("#shootingStarLayer"),
  statusDot: document.querySelector("#statusDot"),
  statusText: document.querySelector("#statusText"),
  timelineProgress: document.querySelector("#timelineProgress"),
  title: document.querySelector("#title"),
  visualizer: document.querySelector("#visualizer"),
  visualPanel: document.querySelector(".visual-panel"),
  electricBackdrop: document.querySelector("#electricBackdrop"),
};

let tracks = [];
let currentTrack = null;
let trackHistory = [];
let trackHistoryIndex = -1;
let activeAudio = els.audio;
let standbyAudio = els.audioB;
let shouldKeepPlaying = false;
let ambientMode = null;
let ambientAudioContext = null;
let ambientGain = null;
let ambientNodes = [];
let lyricRequestId = 0;
let visualRaf = null;
let lastPeakAt = 0;
let autoTransitioning = false;
let autoTransitionTimer = null;
let audioContext = null;
let analyser = null;
let analyserData = null;
const analyserSources = new WeakMap();
let smoothedElectric = { bass: 0, mid: 0, treble: 0, energy: 0 };

const playPath = '<path d="m8 5 11 7-11 7V5Z"></path>';
const pausePath = '<path d="M7 5h4v14H7z"></path><path d="M13 5h4v14h-4z"></path>';
const lyricFallback = "\u00a1Gracias por venir! Aunque todav\u00eda estamos afinando esta frase.";
const timelineLength = 320.44;
const crossfadeDurationMs = 3200;
const autoCrossfadeLeadSeconds = crossfadeDurationMs / 1000 + 0.45;

const ambientConfigs = {
  rain: {
    bodyClass: "rain-mode",
    label: "Noche / Lluvia",
    activeLabel: "Volver al reproductor",
    status: "Modo lluvia activo",
    title: "Cerati se fue a dormir.",
    subtitle: "Te desea buenas noches",
  },
  water: {
    bodyClass: "water-mode",
    label: "Modo Agua / Mar",
    activeLabel: "Volver al reproductor",
    status: "Modo agua activo",
    title: "Agua en movimiento.",
    subtitle: "Cerati queda flotando de fondo",
  },
  wind: {
    bodyClass: "wind-mode",
    label: "Modo Viento",
    activeLabel: "Volver al reproductor",
    status: "Modo viento activo",
    title: "Viento y llamadores.",
    subtitle: "La canción respira detrás",
  },
  fire: {
    bodyClass: "fire-mode",
    label: "Fuego",
    activeLabel: "Volver al reproductor",
    status: "Modo fuego activo",
    title: "Madera encendida.",
    subtitle: "El reproductor arde suave de fondo",
  },
};

const moods = {
  introspectivo: {
    color: "#2fd6b5",
    color2: "#7dd3fc",
    words: ["bocanada", "puente", "medium", "vivo", "raiz", "lago", "universo", "magia"],
  },
  energetico: {
    color: "#ef476f",
    color2: "#00e5ff",
    words: ["crimen", "deja vu", "fuerza", "pulsar", "magia", "numeral", "artefacto"],
  },
  melancolico: {
    color: "#ffd166",
    color2: "#ef476f",
    words: ["adios", "cactus", "lago", "perdonar", "amor", "karaoke", "te para tres"],
  },
};

function isAmbientMode() {
  return Boolean(ambientMode);
}

function setLoading(isLoading) {
  [els.prev, els.play, els.next, els.progress, els.circularTimeline].forEach((control) => {
    control.disabled = isLoading;
  });
}

function setStatus(message, kind = "loading") {
  els.statusText.textContent = message;
  els.statusDot.className = `status-dot ${kind === "ready" ? "ready" : ""} ${
    kind === "error" ? "error" : ""
  }`;
}

function formatTime(seconds) {
  if (!Number.isFinite(seconds)) return "0:00";
  const minutes = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0");
  return `${minutes}:${secs}`;
}

function normalizeText(value) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getTrackMood(track) {
  const text = normalizeText(`${track.title} ${track.album}`);
  const match = Object.entries(moods).find(([, mood]) =>
    mood.words.some((word) => text.includes(normalizeText(word))),
  );
  return match?.[0] || (track.id % 3 === 0 ? "melancolico" : track.id % 2 === 0 ? "energetico" : "introspectivo");
}

function applyMood(track) {
  const moodName = track?.mood || "introspectivo";
  const mood = moods[moodName] || moods.introspectivo;
  document.documentElement.style.setProperty("--mood", mood.color);
  document.documentElement.style.setProperty("--mood-2", mood.color2);
}

function getPool() {
  return tracks;
}

function isCeratiPreview(track) {
  const artistName = normalizeText(track?.artist?.name ?? "");
  return (
    track?.artist?.id === CERATI_DEEZER_ARTIST_ID &&
    artistName === normalizeText(ARTIST) &&
    Boolean(track.title) &&
    Boolean(track.link) &&
    Boolean(track.preview) &&
    Boolean(track.album?.cover_medium)
  );
}

function normalizeTrack(track) {
  const normalized = {
    id: track.id,
    title: track.title,
    album: track.album?.title || "Preview de Deezer",
    cover: track.album.cover_big || track.album.cover_medium,
    link: track.link,
    preview: track.preview,
  };
  return { ...normalized, mood: getTrackMood(normalized) };
}

function chooseRandomTrack() {
  const pool = getPool();
  if (pool.length === 0) return null;
  if (pool.length === 1) return pool[0];

  let selected = currentTrack;
  while (selected?.id === currentTrack?.id) {
    selected = pool[Math.floor(Math.random() * pool.length)];
  }
  return selected;
}

function rememberTrack(track) {
  if (!track) return;
  if (trackHistory[trackHistoryIndex]?.id === track.id) return;

  trackHistory = trackHistory.slice(0, trackHistoryIndex + 1);
  trackHistory.push(track);
  trackHistoryIndex = trackHistory.length - 1;
}

function getPreviousTrack() {
  if (trackHistoryIndex <= 0) return null;
  trackHistoryIndex -= 1;
  return trackHistory[trackHistoryIndex];
}

function getNextTrack() {
  if (trackHistoryIndex < trackHistory.length - 1) {
    trackHistoryIndex += 1;
    return trackHistory[trackHistoryIndex];
  }

  return chooseRandomTrack();
}

function updateMediaSession(track) {
  if (!("mediaSession" in navigator) || typeof MediaMetadata === "undefined" || !track) return;

  navigator.mediaSession.metadata = new MediaMetadata({
    title: track.title,
    artist: ARTIST,
    album: track.album,
    artwork: [
      { src: track.cover, sizes: "512x512", type: "image/jpeg" },
    ],
  });
}

function configureAudio(audio, track) {
  audio.src = `/audio-preview?url=${encodeURIComponent(track.preview)}`;
  audio.loop = false;
  audio.volume = isAmbientMode() ? 0.14 : 1;
  audio.playbackRate = 1;
  audio.load();
}

function clearAutoTransitionTimer() {
  window.clearTimeout(autoTransitionTimer);
  autoTransitionTimer = null;
}

function getPreviewDuration(audio) {
  return Math.min(audio.duration || 30, 30);
}

function scheduleAutoTransition() {
  clearAutoTransitionTimer();

  if (!shouldKeepPlaying || activeAudio.paused || autoTransitioning) return;

  const duration = getPreviewDuration(activeAudio);
  const remainingMs = Math.max((duration - activeAudio.currentTime - autoCrossfadeLeadSeconds) * 1000, 0);

  autoTransitionTimer = window.setTimeout(() => {
    if (!activeAudio.paused) autoNavigateBeforeEnd();
  }, remainingMs);
}

function swapAudioRoles() {
  const previous = activeAudio;
  activeAudio = standbyAudio;
  standbyAudio = previous;
  scheduleAutoTransition();
}

async function crossfadeTo(track) {
  const fromAudio = activeAudio;
  const toAudio = standbyAudio;
  configureAudio(toAudio, track);
  toAudio.volume = 0;

  try {
    await toAudio.play();
  } catch (error) {
    configureAudio(fromAudio, track);
    return;
  }

  const duration = crossfadeDurationMs;
  const startedAt = performance.now();
  const targetVolume = isAmbientMode() ? 0.14 : 1;

  await new Promise((resolve) => {
    function fade(now) {
      const progress = Math.min((now - startedAt) / duration, 1);
      const eased = progress * progress * (3 - 2 * progress);
      toAudio.volume = eased * targetVolume;
      fromAudio.volume = Math.max(0, (1 - eased) * targetVolume);

      if (progress < 1) {
        requestAnimationFrame(fade);
      } else {
        fromAudio.pause();
        fromAudio.currentTime = 0;
        toAudio.volume = targetVolume;
        resolve();
      }
    }
    requestAnimationFrame(fade);
  });

  swapAudioRoles();
}

async function loadTrack(track, keepPlaybackState = shouldKeepPlaying) {
  if (!track) return;

  clearAutoTransitionTimer();
  const hadTrack = Boolean(currentTrack);
  currentTrack = track;
  applyMood(track);
  loadLyricFragment(track);
  updateMediaSession(track);

  els.title.textContent = track.title;
  els.album.textContent = track.album;
  els.cover.src = track.cover;
  els.deezerLink.href = track.link;
  els.progress.value = 0;
  els.currentTime.textContent = "0:00";
  updateTimeline(0, 30);

  if (keepPlaybackState && hadTrack) {
    await crossfadeTo(track);
  } else {
    configureAudio(activeAudio, track);
  }

  setStatus(
    isAmbientMode() ? "Modo ambiente: Cerati suena lejano y avanza solo" : "Preview lista",
    "ready",
  );

  if (keepPlaybackState) {
    await playCurrent();
  }
}

async function playCurrent() {
  try {
    ensureAnalyser();
    await activeAudio.play();
    shouldKeepPlaying = true;
    els.visualizer.classList.add("is-playing");
    els.play.setAttribute("aria-label", "Pausar");
    els.play.title = "Pausar";
    els.playIcon.innerHTML = pausePath;
    setStatus(isAmbientMode() ? "Ambiente al frente, Cerati de fondo" : "Reproduciendo preview", "ready");
    scheduleAutoTransition();
  } catch (error) {
    shouldKeepPlaying = false;
    els.visualizer.classList.remove("is-playing");
    setStatus("Toca reproducir para iniciar el audio", "ready");
  }
}

function pauseCurrent() {
  activeAudio.pause();
  standbyAudio.pause();
  shouldKeepPlaying = false;
  clearAutoTransitionTimer();
  els.visualizer.classList.remove("is-playing");
  els.play.setAttribute("aria-label", "Reproducir");
  els.play.title = "Reproducir";
  els.playIcon.innerHTML = playPath;
  setStatus("Pausado, la proxima pista conserva este estado", "ready");
}

async function randomNavigate() {
  autoTransitioning = false;
  const randomTrack = chooseRandomTrack();
  rememberTrack(randomTrack);
  await loadTrack(randomTrack, shouldKeepPlaying);
}

async function previousNavigate() {
  autoTransitioning = false;
  const previousTrack = getPreviousTrack();
  if (!previousTrack) {
    setStatus("No hay un tema anterior en el historial", "ready");
    return;
  }

  await loadTrack(previousTrack, shouldKeepPlaying);
}

async function nextNavigate() {
  autoTransitioning = false;
  const nextTrack = getNextTrack();
  rememberTrack(nextTrack);
  await loadTrack(nextTrack, shouldKeepPlaying);
}

async function autoNavigateBeforeEnd() {
  if (autoTransitioning) return;

  autoTransitioning = true;
  shouldKeepPlaying = true;
  setStatus("Fundiendo hacia el siguiente tema", "ready");
  emitVisualParticles(5);

  try {
    const nextTrack = chooseRandomTrack();
    rememberTrack(nextTrack);
    await loadTrack(nextTrack, true);
  } finally {
    autoTransitioning = false;
    scheduleAutoTransition();
  }
}

function updateTimeline(current, duration) {
  const safeDuration = duration || 30;
  const ratio = Math.min(current / safeDuration, 1);
  els.progress.value = current || 0;
  els.progress.max = safeDuration;
  els.timelineProgress.style.strokeDashoffset = `${timelineLength * (1 - ratio)}`;
  els.currentTime.textContent = formatTime(current);
  els.duration.textContent = formatTime(safeDuration);
}

async function loadLyricFragment(track) {
  const requestId = ++lyricRequestId;
  els.lyricLine.textContent = "Buscando una frase de esta canción...";

  try {
    const response = await fetch(
      `/lyric-fragment?title=${encodeURIComponent(track.title)}&album=${encodeURIComponent(track.album)}`,
    );
    const data = await response.json();
    if (requestId !== lyricRequestId) return;

    els.lyricLine.textContent = data.fragment || lyricFallback;
  } catch (error) {
    if (requestId === lyricRequestId) {
      els.lyricLine.textContent = lyricFallback;
    }
  }
}

function burstGoldSparks(source) {
  const rect = source.getBoundingClientRect();
  const originX = rect.left + rect.width / 2;
  const originY = rect.top + rect.height / 2;

  Array.from({ length: 14 }).forEach((_, index) => {
    const spark = document.createElement("span");
    const angle = (Math.PI * 2 * index) / 14 + Math.random() * 0.45;
    const distance = 34 + Math.random() * 44;

    spark.className = "gold-spark";
    spark.style.left = `${originX}px`;
    spark.style.top = `${originY}px`;
    spark.style.setProperty("--spark-x", `${Math.cos(angle) * distance}px`);
    spark.style.setProperty("--spark-y", `${Math.sin(angle) * distance}px`);
    document.body.appendChild(spark);
    spark.addEventListener("animationend", () => spark.remove(), { once: true });
  });
}

function flashDiscGold() {
  els.disc.classList.remove("disc-gold-flash");
  void els.disc.offsetWidth;
  els.disc.classList.add("disc-gold-flash");
}

function launchShootingStar() {
  const star = document.createElement("span");
  star.className = "shooting-star";
  star.style.top = `${18 + Math.random() * 38}%`;
  star.style.left = "0";
  els.shootingStarLayer.appendChild(star);
  star.addEventListener("animationend", () => star.remove(), { once: true });
}

function emitVisualParticles(amount = 8) {
  const rect = els.disc.getBoundingClientRect();
  const originX = rect.left + rect.width / 2;
  const originY = rect.top + rect.height / 2;

  Array.from({ length: amount }).forEach((_, index) => {
    const particle = document.createElement("span");
    const angle = (Math.PI * 2 * index) / amount + Math.random() * 0.4;
    const distance = 46 + Math.random() * 82;
    particle.className = "visual-particle";
    particle.style.left = `${originX}px`;
    particle.style.top = `${originY}px`;
    particle.style.setProperty("--particle-x", `${Math.cos(angle) * distance}px`);
    particle.style.setProperty("--particle-y", `${Math.sin(angle) * distance}px`);
    document.body.appendChild(particle);
    particle.addEventListener("animationend", () => particle.remove(), { once: true });
  });
}

async function navigateWithEffects(source, direction) {
  flashDiscGold();
  burstGoldSparks(source);
  launchShootingStar();

  if (direction === "previous") {
    await previousNavigate();
  } else {
    await nextNavigate();
  }
}

function createRainDrops() {
  const drops = document.createDocumentFragment();
  const splashes = document.createDocumentFragment();

  Array.from({ length: 125 }).forEach(() => {
    const drop = document.createElement("span");
    drop.className = "rain-drop";
    drop.style.left = `${Math.random() * 100}%`;
    drop.style.setProperty("--drop-length", `${26 + Math.random() * 34}px`);
    drop.style.setProperty("--drop-speed", `${0.72 + Math.random() * 0.7}s`);
    drop.style.setProperty("--drop-delay", `${Math.random() * -2.8}s`);
    drop.style.setProperty("--drop-opacity", `${0.18 + Math.random() * 0.44}`);
    drop.style.setProperty("--drop-drift", `${-2 + Math.random() * 4}vw`);
    drops.appendChild(drop);
  });

  Array.from({ length: 34 }).forEach(() => {
    const splash = document.createElement("span");
    splash.className = "rain-splash";
    splash.style.setProperty("--ground-height", "14vh");
    splash.style.setProperty("--splash-left", `${Math.random() * 100}%`);
    splash.style.setProperty("--splash-width", `${14 + Math.random() * 34}px`);
    splash.style.setProperty("--splash-speed", `${0.85 + Math.random() * 0.85}s`);
    splash.style.setProperty("--splash-delay", `${Math.random() * -2.4}s`);
    splashes.appendChild(splash);
  });

  els.rainDrops.appendChild(drops);
  els.rainSplashes.appendChild(splashes);
}

function createNoiseSource(context, seconds = 2, intensity = 0.55) {
  const bufferSize = context.sampleRate * seconds;
  const buffer = context.createBuffer(1, bufferSize, context.sampleRate);
  const data = buffer.getChannelData(0);

  for (let i = 0; i < bufferSize; i += 1) {
    data[i] = (Math.random() * 2 - 1) * intensity;
  }

  const source = context.createBufferSource();
  source.buffer = buffer;
  source.loop = true;
  return source;
}

function connectNoiseBand(context, output, { frequency, q = 0.8, gainValue = 0.4, type = "bandpass", seconds = 2, intensity = 0.55 }) {
  const noise = createNoiseSource(context, seconds, intensity);
  const filter = context.createBiquadFilter();
  const gain = context.createGain();

  filter.type = type;
  filter.frequency.value = frequency;
  filter.Q.value = q;
  gain.gain.value = gainValue;

  noise.connect(filter);
  filter.connect(gain);
  gain.connect(output);
  noise.start();

  ambientNodes.push(noise, filter, gain);
}

function createChime(context, output, startOffset) {
  const baseGain = context.createGain();
  const panner = typeof context.createStereoPanner === "function" ? context.createStereoPanner() : null;
  const frequencies = [528, 594, 660, 792, 990, 1188, 1320];
  const startAt = context.currentTime + startOffset;
  const duration = 4.8 + Math.random() * 3.2;
  const baseFrequency = frequencies[Math.floor(Math.random() * frequencies.length)];

  baseGain.gain.setValueAtTime(0, startAt);
  baseGain.gain.linearRampToValueAtTime(0.045, startAt + 0.08);
  baseGain.gain.exponentialRampToValueAtTime(0.001, startAt + duration);

  if (panner) {
    panner.pan.value = Math.random() * 1.6 - 0.8;
    baseGain.connect(panner);
    panner.connect(output);
  } else {
    baseGain.connect(output);
  }

  const oscillators = [1, 2.01, 3.02].map((ratio, index) => {
    const oscillator = context.createOscillator();
    const harmonicGain = context.createGain();
    oscillator.type = index === 0 ? "sine" : "triangle";
    oscillator.frequency.value = baseFrequency * ratio;
    harmonicGain.gain.value = index === 0 ? 1 : 0.22 / index;
    oscillator.connect(harmonicGain);
    harmonicGain.connect(baseGain);
    oscillator.start(startAt + index * 0.018);
    oscillator.stop(startAt + duration + 0.2);
    ambientNodes.push(oscillator, harmonicGain);
    return oscillator;
  });

  oscillators[0].addEventListener("ended", () => {
    oscillators.forEach((oscillator) => oscillator.disconnect());
    baseGain.disconnect();
    panner?.disconnect();
    if (ambientMode === "wind") createChime(context, output, 1.4 + Math.random() * 3.4);
  });

  ambientNodes.push(baseGain);
  if (panner) ambientNodes.push(panner);
}

function createCrackle(context, output) {
  function pop() {
    if (ambientMode !== "fire") return;

    const source = createNoiseSource(context, 0.04, 0.9);
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    const startAt = context.currentTime;
    const duration = 0.045 + Math.random() * 0.09;

    filter.type = "highpass";
    filter.frequency.value = 900 + Math.random() * 1800;
    gain.gain.setValueAtTime(0.0001, startAt);
    gain.gain.exponentialRampToValueAtTime(0.07 + Math.random() * 0.08, startAt + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(output);
    source.start(startAt);
    source.stop(startAt + duration + 0.02);
    source.addEventListener("ended", () => {
      source.disconnect();
      filter.disconnect();
      gain.disconnect();
    });

    ambientNodes.push(source, filter, gain);
    window.setTimeout(pop, 90 + Math.random() * 360);
  }

  pop();
}

function startAmbientSound(mode) {
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return;

  if (!ambientAudioContext) {
    ambientAudioContext = new AudioContext();
  }

  if (ambientAudioContext.state === "suspended") {
    ambientAudioContext.resume();
  }

  stopAmbientSound();

  ambientGain = ambientAudioContext.createGain();
  ambientGain.gain.value = 0.78;
  ambientGain.connect(ambientAudioContext.destination);
  ambientNodes.push(ambientGain);

  if (mode === "rain") {
    connectNoiseBand(ambientAudioContext, ambientGain, { frequency: 1300, q: 0.6, gainValue: 0.58 });
  } else if (mode === "water") {
    connectNoiseBand(ambientAudioContext, ambientGain, { frequency: 520, q: 0.75, gainValue: 0.5, type: "lowpass", seconds: 3, intensity: 0.65 });
    connectNoiseBand(ambientAudioContext, ambientGain, { frequency: 1900, q: 1.5, gainValue: 0.18, seconds: 1, intensity: 0.45 });
  } else if (mode === "wind") {
    connectNoiseBand(ambientAudioContext, ambientGain, { frequency: 420, q: 0.45, gainValue: 0.5, type: "lowpass", seconds: 4, intensity: 0.55 });
    connectNoiseBand(ambientAudioContext, ambientGain, { frequency: 1200, q: 0.5, gainValue: 0.12, seconds: 5, intensity: 0.35 });
    Array.from({ length: 5 }).forEach((_, index) => createChime(ambientAudioContext, ambientGain, 0.6 + index * 0.85));
  } else if (mode === "fire") {
    connectNoiseBand(ambientAudioContext, ambientGain, { frequency: 280, q: 0.7, gainValue: 0.35, type: "lowpass", seconds: 2, intensity: 0.5 });
    connectNoiseBand(ambientAudioContext, ambientGain, { frequency: 1550, q: 0.9, gainValue: 0.16, seconds: 2, intensity: 0.35 });
    createCrackle(ambientAudioContext, ambientGain);
  }
}

function stopAmbientSound() {
  if (ambientGain && ambientAudioContext) {
    ambientGain.gain.setTargetAtTime(0, ambientAudioContext.currentTime, 0.08);
  }

  const nodesToStop = ambientNodes;
  ambientNodes = [];
  ambientGain = null;

  window.setTimeout(() => {
    nodesToStop.forEach((node) => {
      try {
        if (typeof node.stop === "function") node.stop();
        if (typeof node.disconnect === "function") node.disconnect();
      } catch (error) {
        // Some generated ambient nodes may have already ended naturally.
      }
    });
  }, 180);
}

function setAmbientButtons(mode) {
  const buttons = {
    rain: [els.rainToggle, els.rainToggleText],
    water: [els.waterToggle, els.waterToggleText],
    wind: [els.windToggle, els.windToggleText],
    fire: [els.fireToggle, els.fireToggleText],
  };

  Object.entries(buttons).forEach(([buttonMode, [button, label]]) => {
    const isActive = mode === buttonMode;
    button.setAttribute("aria-pressed", String(isActive));
    label.textContent = isActive ? ambientConfigs[buttonMode].activeLabel : ambientConfigs[buttonMode].label;
  });
}

function clearAmbientBodyClasses() {
  Object.values(ambientConfigs).forEach((config) => {
    document.body.classList.remove(config.bodyClass);
  });
}

async function enterAmbientMode(mode) {
  const config = ambientConfigs[mode];
  if (!config) return;

  ambientMode = mode;
  shouldKeepPlaying = true;
  clearAmbientBodyClasses();
  document.body.classList.add(config.bodyClass);
  setAmbientButtons(mode);
  els.ambientMessageTitle.textContent = config.title;
  els.ambientMessageSubtitle.textContent = config.subtitle;
  activeAudio.loop = false;
  activeAudio.volume = 0.14;
  standbyAudio.volume = 0.14;
  startAmbientSound(mode);
  flashDiscGold();
  setStatus(config.status, "ready");

  if (currentTrack) {
    await playCurrent();
  }
}

function exitAmbientMode() {
  ambientMode = null;
  clearAmbientBodyClasses();
  setAmbientButtons(null);
  activeAudio.loop = false;
  activeAudio.volume = 1;
  standbyAudio.volume = 1;
  stopAmbientSound();
  flashDiscGold();
  setStatus("Reproductor de canciones activo", "ready");
}

async function toggleAmbientMode(mode, source) {
  burstGoldSparks(source);

  if (ambientMode === mode) {
    exitAmbientMode();
  } else {
    await enterAmbientMode(mode);
  }
}

function ensureAnalyser() {
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) {
    startVisualLoop();
    return;
  }

  if (!audioContext) {
    audioContext = new AudioContext();
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.82;
    analyserData = new Uint8Array(analyser.frequencyBinCount);
    analyser.connect(audioContext.destination);
  }

  if (audioContext.state === "suspended") {
    audioContext.resume();
  }

  [els.audio, els.audioB].forEach((audio) => {
    if (analyserSources.has(audio)) return;

    try {
      const source = audioContext.createMediaElementSource(audio);
      source.connect(analyser);
      analyserSources.set(audio, source);
    } catch (error) {
      // Media elements can only be attached once; if the browser already did it, keep the fallback animation.
    }
  });

  startVisualLoop();
}

function startVisualLoop() {
  if (visualRaf) return;

  function averageRange(start, end) {
    if (!analyserData) return 0;
    let sum = 0;
    let count = 0;

    for (let index = start; index <= end && index < analyserData.length; index += 1) {
      sum += analyserData[index];
      count += 1;
    }

    return count ? sum / count / 255 : 0;
  }

  function smoothValue(key, value, factor = 0.16) {
    smoothedElectric[key] += (value - smoothedElectric[key]) * factor;
    return smoothedElectric[key];
  }

  function frame() {
    const isPlaying = !activeAudio.paused && !activeAudio.ended;
    let bass = 0;
    let mid = 0;
    let treble = 0;
    let energy = 0;

    if (isPlaying && analyser) {
      analyser.getByteFrequencyData(analyserData);
      bass = averageRange(1, 8);
      mid = averageRange(9, 34);
      treble = averageRange(35, 92);
      energy = bass * 0.45 + mid * 0.35 + treble * 0.2;
    } else if (isPlaying) {
      const pulse = Math.sin(performance.now() / 180) * 0.5 + 0.5;
      bass = 0.16 + pulse * 0.22;
      mid = 0.12 + pulse * 0.16;
      treble = 0.1 + pulse * 0.12;
      energy = 0.18 + pulse * 0.18;
    }

    bass = smoothValue("bass", bass);
    mid = smoothValue("mid", mid);
    treble = smoothValue("treble", treble);
    energy = smoothValue("energy", energy);

    const scale = 1 + energy * 0.035;
    els.visualizer.style.transform = `scale(${scale})`;
    els.title.style.opacity = `${0.88 + energy * 0.12}`;
    document.body.style.setProperty("--electric-bass", bass.toFixed(3));
    document.body.style.setProperty("--electric-mid", mid.toFixed(3));
    document.body.style.setProperty("--electric-treble", treble.toFixed(3));
    document.body.style.setProperty("--electric-energy", energy.toFixed(3));

    if (isPlaying && energy > 0.32 && performance.now() - lastPeakAt > 1600) {
      lastPeakAt = performance.now();
      els.visualPanel.classList.remove("audio-peak");
      void els.visualPanel.offsetWidth;
      els.visualPanel.classList.add("audio-peak");
      emitVisualParticles(6);
    }

    visualRaf = requestAnimationFrame(frame);
  }

  visualRaf = requestAnimationFrame(frame);
}

function loadDeezerJsonp(url) {
  return new Promise((resolve, reject) => {
    const callbackName = `deezerCallback_${Date.now()}_${Math.random()
      .toString(16)
      .slice(2)}`;
    const script = document.createElement("script");
    const requestUrl = new URL(url, window.location.href);
    requestUrl.searchParams.delete("callback");
    requestUrl.searchParams.set("output", "jsonp");
    requestUrl.searchParams.set("callback", callbackName);
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error("Deezer tardo demasiado en responder."));
    }, 8000);

    window[callbackName] = (payload) => {
      resolve(payload);
      cleanup();
    };

    function cleanup() {
      window.clearTimeout(timeout);
      script.remove();
      delete window[callbackName];
    }

    script.onerror = () => {
      cleanup();
      reject(new Error("No se pudo conectar con Deezer."));
    };

    script.src = requestUrl.toString();
    document.body.appendChild(script);
  });
}

async function loadDeezerCatalog() {
  const results = [];
  let nextUrl = DEEZER_SEARCH_URL;

  for (let page = 0; page < 4 && nextUrl; page += 1) {
    try {
      const response = await loadDeezerJsonp(nextUrl);
      results.push(...(response.data || []));
      nextUrl = response.next || "";
    } catch (error) {
      nextUrl = "";
    }
  }

  return results;
}

async function init() {
  setLoading(true);

  try {
    const catalog = await loadDeezerCatalog();
    tracks = [
      ...new Map(
        catalog.filter(isCeratiPreview).map((track) => {
          const normalized = normalizeTrack(track);
          return [normalized.id, normalized];
        }),
      ).values(),
    ];

    if (tracks.length === 0) {
      throw new Error("No se encontraron previews validas de Gustavo Cerati.");
    }

    await loadTrack(tracks[Math.floor(Math.random() * tracks.length)], false);
    rememberTrack(currentTrack);
    setStatus(`${tracks.length} previews validas encontradas`, "ready");
  } catch (error) {
    els.title.textContent = "No se pudo cargar Deezer";
    els.album.textContent = error.message;
    setStatus("Error de conexion o datos insuficientes", "error");
  } finally {
    setLoading(false);
  }
}

function attachAudioEvents(audio) {
  audio.addEventListener("timeupdate", () => {
    if (audio !== activeAudio) return;
    const currentTime = audio.currentTime || 0;
    const duration = Math.min(audio.duration || 30, 30);
    updateTimeline(currentTime, duration);

    if (
      shouldKeepPlaying &&
      !audio.paused &&
      Number.isFinite(duration) &&
      duration - currentTime <= autoCrossfadeLeadSeconds &&
      currentTime > 1
    ) {
      autoNavigateBeforeEnd();
    }
  });

  audio.addEventListener("loadedmetadata", () => {
    if (audio !== activeAudio) return;
    updateTimeline(0, getPreviewDuration(audio));
    scheduleAutoTransition();
  });

  audio.addEventListener("play", () => {
    if (audio !== activeAudio) return;
    els.visualizer.classList.add("is-playing");
    els.playIcon.innerHTML = pausePath;
    scheduleAutoTransition();
  });

  audio.addEventListener("pause", () => {
    if (audio !== activeAudio || shouldKeepPlaying) return;
    els.visualizer.classList.remove("is-playing");
    els.playIcon.innerHTML = playPath;
    clearAutoTransitionTimer();
  });

  audio.addEventListener("ended", async () => {
    if (audio !== activeAudio) return;
    if (autoTransitioning) return;

    shouldKeepPlaying = true;
    await autoNavigateBeforeEnd();
  });
}

els.play.addEventListener("click", () => {
  flashDiscGold();
  burstGoldSparks(els.play);
  if (activeAudio.paused) {
    playCurrent();
  } else {
    pauseCurrent();
  }
});

els.next.addEventListener("click", () => navigateWithEffects(els.next, "next"));
els.prev.addEventListener("click", () => navigateWithEffects(els.prev, "previous"));
els.rainToggle.addEventListener("click", () => toggleAmbientMode("rain", els.rainToggle));
els.waterToggle.addEventListener("click", () => toggleAmbientMode("water", els.waterToggle));
els.windToggle.addEventListener("click", () => toggleAmbientMode("wind", els.windToggle));
els.fireToggle.addEventListener("click", () => toggleAmbientMode("fire", els.fireToggle));

els.circularTimeline.addEventListener("click", () => {
  const duration = Math.min(activeAudio.duration || 30, 30);
  activeAudio.currentTime = Math.min(activeAudio.currentTime + 5, duration - 0.3);
});

els.progress.addEventListener("input", () => {
  activeAudio.currentTime = Number(els.progress.value);
  scheduleAutoTransition();
});

document.addEventListener("visibilitychange", () => {
  if (!document.hidden && shouldKeepPlaying && activeAudio.paused) {
    playCurrent();
  }
});

window.addEventListener("focus", () => {
  if (shouldKeepPlaying && activeAudio.paused) {
    playCurrent();
  }
});

window.addEventListener("pageshow", () => {
  if (shouldKeepPlaying) {
    scheduleAutoTransition();
  }
});

if ("mediaSession" in navigator) {
  [
    ["previoustrack", () => previousNavigate()],
    ["nexttrack", () => nextNavigate()],
    ["play", () => playCurrent()],
    ["pause", () => pauseCurrent()],
  ].forEach(([action, handler]) => {
    try {
      navigator.mediaSession.setActionHandler(action, handler);
    } catch (error) {
      // Some browsers expose Media Session partially.
    }
  });
}

els.copyLyric.addEventListener("click", async () => {
  const text = els.lyricLine.textContent.trim();
  flashDiscGold();
  burstGoldSparks(els.copyLyric);

  try {
    await navigator.clipboard.writeText(text);
    setStatus("Frase copiada", "ready");
  } catch (error) {
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(els.lyricLine);
    selection.removeAllRanges();
    selection.addRange(range);
    setStatus("Frase seleccionada para copiar", "ready");
  }
});

attachAudioEvents(els.audio);
attachAudioEvents(els.audioB);
createRainDrops();
init();
