const http = require("http");
const fs = require("fs");
const path = require("path");

const port = Number(process.env.PORT || 5173);
const host = "127.0.0.1";
const root = __dirname;

const types = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mp3": "audio/mpeg",
};

const LETRAS_ARTIST_URL = "https://www.letras.com/gustavo-cerati/";
let letrasIndexPromise;
const fragmentCache = new Map();
const curatedFragments = new Map([
  ["medium", "Chica con ojos de ayer"],
]);

function normalizeText(value) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\([^)]*\)/g, " ")
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeSongTitle(value) {
  return normalizeText(value)
    .replace(/\b(remasterizado|remaster|live|en vivo|mtv unplugged|version|versión|edit|radio edit)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeHtml(value) {
  return value
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([a-f\d]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&#34;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

async function fetchHtml(url) {
  const result = await fetch(url, {
    headers: {
      Accept: "text/html,application/xhtml+xml",
      "User-Agent": "Mozilla/5.0 CeratiPreviewPlayer/1.0",
    },
  });

  if (!result.ok) {
    throw new Error(`Letras.com respondio ${result.status}`);
  }

  return result.text();
}

function isAllowedPreviewUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname.endsWith("dzcdn.net");
  } catch (error) {
    return false;
  }
}

async function proxyAudioPreview(url, response) {
  if (!isAllowedPreviewUrl(url)) {
    response.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Preview no valida");
    return;
  }

  try {
    const preview = await fetch(url, {
      headers: {
        Accept: "audio/mpeg,audio/*",
        "User-Agent": "Mozilla/5.0 CeratiPreviewPlayer/1.0",
      },
    });

    if (!preview.ok || !preview.body) {
      throw new Error(`Deezer preview respondio ${preview.status}`);
    }

    response.writeHead(200, {
      "Content-Type": preview.headers.get("content-type") || "audio/mpeg",
      "Cache-Control": "public, max-age=86400",
    });

    const reader = preview.body.getReader();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      response.write(Buffer.from(value));
    }

    response.end();
  } catch (error) {
    response.writeHead(502, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("No se pudo cargar el preview");
  }
}

async function getLetrasIndex() {
  if (!letrasIndexPromise) {
    letrasIndexPromise = fetchHtml(LETRAS_ARTIST_URL).then((html) => {
      const songs = [];
      const scriptPattern =
        /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
      let match;

      while ((match = scriptPattern.exec(html))) {
        try {
          const data = JSON.parse(decodeHtml(match[1].trim()));
          const tracks = Array.isArray(data.track) ? data.track : [];

          tracks.forEach((track) => {
            if (track?.name && track?.url) {
              songs.push({
                name: track.name,
                normalizedName: normalizeText(track.name),
                url: track.url,
              });
            }
          });
        } catch (error) {
          // Letras.com includes several JSON-LD blocks; only the track index matters here.
        }
      }

      return songs;
    });
  }

  return letrasIndexPromise;
}

function findSong(songs, title) {
  const normalizedTitle = normalizeSongTitle(title);

  return (
    songs.find((song) => song.normalizedName === normalizedTitle) ||
    songs.find((song) => normalizeSongTitle(song.name) === normalizedTitle) ||
    songs.find(
      (song) =>
        normalizeSongTitle(song.name).includes(normalizedTitle) ||
        normalizedTitle.includes(normalizeSongTitle(song.name)),
    )
  );
}

function toLetrasSlug(title) {
  return normalizeText(title).replace(/\s+/g, "-");
}

function getMetaContent(html, attribute, value) {
  const pattern = new RegExp(
    `<meta[^>]+${attribute}=["']${value}["'][^>]+content=["']([^"']+)["'][^>]*>`,
    "i",
  );
  const reversePattern = new RegExp(
    `<meta[^>]+content=["']([^"']+)["'][^>]+${attribute}=["']${value}["'][^>]*>`,
    "i",
  );
  const match = html.match(pattern) || html.match(reversePattern);
  return match ? decodeHtml(match[1]) : "";
}

function cleanLyricSource(value) {
  return value
    .replace(/^.*?\(Letra y canción para escuchar\)\s*-\s*/i, "")
    .replace(/^.*?-\s*/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function limitLyricWords(line) {
  return line.split(/\s+/).filter(Boolean).slice(0, 10).join(" ");
}

function scorePoeticLine(line, index) {
  const normalized = normalizeText(line);
  const words = normalized.split(/\s+/).filter(Boolean);
  const poeticTerms = [
    "alma",
    "amor",
    "arder",
    "azul",
    "brillar",
    "cielo",
    "corazon",
    "cristal",
    "despertar",
    "destino",
    "dios",
    "ecos",
    "eterno",
    "flor",
    "fuego",
    "luz",
    "mar",
    "memoria",
    "misterio",
    "noche",
    "ojos",
    "oro",
    "piel",
    "puente",
    "resplandor",
    "sol",
    "sombra",
    "sueno",
    "temblor",
    "tiempo",
    "universo",
    "vibras",
    "vida",
    "viento",
    "vibras",
];
  const plainTerms = ["decir", "nada", "vos", "venir", "ayer"];

  let score = 0;
  poeticTerms.forEach((term) => {
    if (normalized.includes(term)) score += 4;
  });
  plainTerms.forEach((term) => {
    if (normalized === term || normalized.startsWith(`${term} `)) score -= 1;
  });

  if (words.length >= 4 && words.length <= 8) score += 3;
  if (words.length > 10) score -= 6;
  if (/[¿?]/.test(line)) score += 1;
  if (/[,;]/.test(line)) score += 1;
  score -= index * 0.25;

  return score;
}

function choosePoeticFragment(text) {
  const lines = cleanLyricSource(text)
    .split(/\s+\/\s+/)
    .map((line) => line.trim())
    .filter((line) => {
      const wordCount = line.split(/\s+/).filter(Boolean).length;
      return wordCount > 1;
    });

  return lines
    .map((line, index) => ({ line, score: scorePoeticLine(line, index) }))
    .sort((a, b) => b.score - a.score)[0]?.line || "";
}

async function getLyricFragment(title) {
  const normalizedTitle = normalizeSongTitle(title);
  const cacheKey = normalizedTitle;
  if (fragmentCache.has(cacheKey)) return fragmentCache.get(cacheKey);

  const curatedFragment = curatedFragments.get(normalizedTitle);
  if (curatedFragment) {
    const result = {
      fragment: curatedFragment,
      source: `${LETRAS_ARTIST_URL}${normalizedTitle.replace(/\s+/g, "-")}/`,
      matchedTitle: title,
    };
    fragmentCache.set(cacheKey, result);
    return result;
  }

  const songs = await getLetrasIndex();
  const song = findSong(songs, title);
  const fallbackUrl = `https://www.letras.com/gustavo-cerati/${toLetrasSlug(title)}/`;

  const html = await fetchHtml(song?.url || fallbackUrl);
  const metaDescription =
    getMetaContent(html, "property", "og:description") ||
    getMetaContent(html, "name", "description");
  const fragment = limitLyricWords(choosePoeticFragment(metaDescription));
  const result = fragment
    ? {
        fragment,
        source: song?.url || fallbackUrl,
        matchedTitle: song?.name || title,
      }
    : null;

  fragmentCache.set(cacheKey, result);
  return result;
}

http
  .createServer(async (request, response) => {
    const requestUrl = new URL(request.url, `http://${host}:${port}`);
    const pathname = requestUrl.pathname === "/" ? "/index.html" : requestUrl.pathname;

    if (pathname === "/lyric-fragment") {
      try {
        const title = requestUrl.searchParams.get("title") || "";
        const result = title ? await getLyricFragment(title) : null;

        response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        response.end(JSON.stringify(result || { fragment: "", source: "", matchedTitle: "" }));
      } catch (error) {
        response.writeHead(502, { "Content-Type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({ fragment: "", source: "", matchedTitle: "" }));
      }
      return;
    }

    if (pathname === "/audio-preview") {
      await proxyAudioPreview(requestUrl.searchParams.get("url") || "", response);
      return;
    }

    const filePath = path.join(root, decodeURIComponent(pathname));

    if (!filePath.startsWith(root)) {
      response.writeHead(403);
      response.end("Forbidden");
      return;
    }

    fs.readFile(filePath, (error, content) => {
      if (error) {
        response.writeHead(404);
        response.end("Not found");
        return;
      }

      response.writeHead(200, {
        "Content-Type": types[path.extname(filePath)] || "application/octet-stream",
      });
      response.end(content);
    });
  })
  .listen(port, host, () => {
    console.log(`Servidor listo en http://${host}:${port}`);
  });
