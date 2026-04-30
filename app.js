const ARTIST = "Gustavo Cerati";
const CERATI_DEEZER_ARTIST_ID = 1374;
const DEEZER_SEARCH_URL =
  'https://api.deezer.com/search/track?q=artist:"Gustavo%20Cerati"&limit=100&output=jsonp';

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
};

let tracks = [];
let currentTrack = null;
let trackHistory = [];
let trackHistoryIndex = -1;
let shouldKeepPlaying = false;
let ambientMode = null;
let ambientContext = null;
let ambientGain = null;
let ambientNodes = [];
let visualRaf = null;

const playPath = '<path d="m8 5 11 7-11 7V5Z"></path>';
const pausePath = '<path d="M7 5h4v14H7z"></path><path d="M13 5h4v14h-4z"></path>';
const timelineLength = 320.44;

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
    subtitle: "La cancion respira detras",
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
