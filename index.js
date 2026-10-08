// DhakaFlix Stremio addon (Vercel). data.json.gz scraper.js baniye rekheche, tai Vercel-ke
// DhakaFlix server (172.16.x.x) e connect korte hoy na. Video Stremio player nijei server theke tane.
"use strict";
const fs = require("fs");
const zlib = require("zlib");
const pathMod = require("path");

function loadData() {
  try { return JSON.parse(zlib.gunzipSync(fs.readFileSync(pathMod.join(__dirname, "..", "data.json.gz"))).toString()); } catch {}
  try { return require("../data.json"); } catch {}
  return { items: [] };
}
const DATA = loadData();
const ITEMS = DATA.items || [];
const PAGE = 100;

const manifest = {
  id: "community.dhakaflix.bridge",
  version: "1.0.0",
  name: "DhakaFlix Bridge",
  description: "BDIX direct streams from DhakaFlix servers (Movies, TV Series, Anime). Playback works on the ISP network that can reach the servers.",
  resources: [
    "catalog",
    { name: "meta", types: ["movie", "series"], idPrefixes: ["dflix:"] },
    { name: "stream", types: ["movie", "series"], idPrefixes: ["dflix:", "tt", "tmdb:"] }
  ],
  types: ["movie", "series"],
  catalogs: [
    { type: "movie", id: "dflix_movies", name: "DhakaFlix Movies", extra: [{ name: "search", isRequired: false }, { name: "skip", isRequired: false }] },
    { type: "series", id: "dflix_series", name: "DhakaFlix TV Series", extra: [{ name: "search", isRequired: false }, { name: "skip", isRequired: false }] },
    { type: "series", id: "dflix_anime", name: "DhakaFlix Anime", extra: [{ name: "search", isRequired: false }, { name: "skip", isRequired: false }] }
  ],
  behaviorHints: { configurable: false, configurationRequired: false }
};

const CAT_KIND = { dflix_movies: "movies", dflix_series: "series", dflix_anime: "anime" };
const QRANK = { "4K": 5, "1080p": 4, "720p": 3, "480p": 2, Direct: 1 };
const stype = (k) => (k === "movies" ? "movie" : "series");
const norm = (s) => String(s || "").toLowerCase();
const normName = (s) => String(s || "").toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]/g, "");

const byId = new Map(ITEMS.map((i) => [i.id, i]));
const multi = (key) => {
  const m = new Map();
  for (const i of ITEMS) { const k = key(i); if (k) { if (!m.has(k)) m.set(k, []); m.get(k).push(i); } }
  return m;
};
const byImdb = multi((i) => i.imdb);
const byTmdb = multi((i) => i.tmdb);
const byName = multi((i) => normName(i.name));

const card = (i) => ({ id: i.id, type: stype(i.kind), name: i.name, poster: i.poster, releaseInfo: i.year ? String(i.year) : undefined });

function catalog(id, extra) {
  const kind = CAT_KIND[id];
  if (!kind) return { metas: [] };
  let list = ITEMS.filter((i) => i.kind === kind);
  if (extra.search) { const q = norm(extra.search); list = list.filter((i) => norm(i.name).includes(q)); }
  const skip = parseInt(extra.skip || "0", 10) || 0;
  return { metas: list.slice(skip, skip + PAGE).map(card) };
}

function meta(id) {
  const item = byId.get(id.split(":").slice(0, 3).join(":"));
  if (!item) return { meta: null };
  const m = {
    id: item.id, type: stype(item.kind), name: item.name, poster: item.poster, background: item.backdrop,
    description: item.overview, releaseInfo: item.year ? String(item.year) : undefined,
    imdbRating: item.rating ? String(item.rating) : undefined, genres: item.genres && item.genres.length ? item.genres : undefined
  };
  if (item.kind !== "movies") {
    m.videos = (item.episodes || []).map((ep) => ({
      id: `${item.id}:${ep.s}:${ep.e}`,
      title: ep.seasonName ? `${ep.seasonName} - ${ep.name}` : ep.name,
      season: ep.s, episode: ep.e, overview: ep.overview, thumbnail: ep.still,
      released: ep.air ? new Date(ep.air).toISOString() : new Date(0).toISOString()
    }));
  }
  return { meta: m };
}

// tt... id-te jodi imdb data na thake, Cinemeta theke naam-year niye match kori
async function matchByCinemeta(type, rawId) {
  const [imdb] = rawId.split(":");
  try {
    const r = await fetch(`https://v3-cinemeta.strem.io/meta/${type}/${imdb}.json`, { signal: AbortSignal.timeout(4500) });
    if (!r.ok) return [];
    const { meta: m } = await r.json();
    if (!m) return [];
    const cands = (byName.get(normName(m.name)) || []).filter((i) => (type === "movie") === (i.kind === "movies"));
    const y = parseInt(String(m.releaseInfo || m.year || "").slice(0, 4), 10);
    const exact = cands.filter((i) => !y || !i.year || i.year === y);
    return exact.length ? exact : cands.filter((i) => !y || !i.year || Math.abs(i.year - y) <= 1);
  } catch { return []; }
}

const toStreams = (item, links) => (links || []).filter((l) => l.url)
  .sort((a, b) => (QRANK[b.quality] || 0) - (QRANK[a.quality] || 0))
  .map((l) => ({
    name: `DhakaFlix ${item.server}\n${l.quality || "Direct"}`,
    title: `${l.name || item.name}${l.size ? "\n" + l.size : ""}`,
    url: l.url,
    behaviorHints: { notWebReady: true, bingeGroup: `dflix-${item.server}-${l.quality || "Direct"}` }
  }));

async function stream(id, type) {
  const parts = id.split(":");
  let items = [], s = null, e = null;
  if (id.startsWith("dflix:")) {
    const it = byId.get(parts.slice(0, 3).join(":"));
    items = it ? [it] : []; s = +parts[3] || null; e = +parts[4] || null;
  } else if (id.startsWith("tmdb:")) {
    items = byTmdb.get(parts[1]) || []; s = +parts[2] || null; e = +parts[3] || null;
  } else {
    items = byImdb.get(parts[0]) || []; s = +parts[1] || null; e = +parts[2] || null;
    if (!items.length) items = await matchByCinemeta(type === "movie" ? "movie" : "series", id);
  }
  const streams = [];
  for (const it of items) {
    if (it.kind === "movies") { if (type !== "series") streams.push(...toStreams(it, it.links)); continue; }
    if (type === "movie") continue;
    const ep = (it.episodes || []).find((x) => x.s === (s || 1) && x.e === (e || 1));
    if (ep) streams.push(...toStreams(it, ep.links));
  }
  return { streams };
}

function parseExtra(str) {
  const out = {};
  if (!str) return out;
  for (const p of str.split("&")) { const i = p.indexOf("="); if (i > 0) out[p.slice(0, i)] = decodeURIComponent(p.slice(i + 1)); }
  return out;
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "*");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  if (req.method === "OPTIONS") return res.status(204).end();
  const parts = decodeURIComponent((req.url || "/").split("?")[0]).replace(/\.json$/, "").split("/").filter(Boolean);
  const [resource, type, id, extraStr] = parts;
  const out = (o) => res.status(200).send(JSON.stringify(o));
  try {
    res.setHeader("Cache-Control", "public, s-maxage=600, stale-while-revalidate=3600");
    if (!resource || resource === "manifest") return out(manifest);
    if (resource === "status") {
      const c = (k) => ITEMS.filter((i) => i.kind === k).length;
      return out({ updated: DATA.updated || null, items: ITEMS.length, movies: c("movies"), series: c("series"), anime: c("anime") });
    }
    if (resource === "catalog") return out(catalog(id, parseExtra(extraStr)));
    if (resource === "meta") return out(meta(id));
    if (resource === "stream") return out(await stream(id, type));
    return res.status(404).send(JSON.stringify({ error: "not found" }));
  } catch (err) {
    console.error(err);
    res.setHeader("Cache-Control", "no-store");
    if (resource === "catalog") return out({ metas: [] });
    if (resource === "stream") return out({ streams: [] });
    return out({ meta: null });
  }
};
