"use strict";
// DhakaFlix crawler. DhakaFlix server (172.16.x.x) shudhu BD ISP network theke khole,
// tai eta oi network-er kono device-e chalao (phone Termux / PC / VPS). No npm install needed.
//
//   node scraper.js            -> full crawl (config.js-er shob year)
//   node scraper.js update     -> shudhu notun item / notun episode
//
// Env (optional): TMDB_API_KEY  -> poster, overview, rating, IMDb id (Cloudstream plugin-er moto)
//                 CONFIG        -> onno config file-er path
const fs = require("fs");
const zlib = require("zlib");
const path = require("path");
const os = require("os");
const crypto = require("crypto");

const CFG = require(process.env.CONFIG ? path.resolve(process.env.CONFIG) : "./config.js");
const OUT = path.join(__dirname, "data.json");
const OUT_GZ = OUT + ".gz";
const TMDB_KEY = process.env.TMDB_API_KEY || "";
const TMDB = process.env.TMDB_BASE || "https://api.themoviedb.org/3";
const IMG = "https://image.tmdb.org/t/p";
const UA = "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/124 Mobile Safari/537.36";
const VIDEO = /\.(mkv|mp4|avi|m4v|webm|mov)$/i;
const IMAGE = /\.(jpe?g|png|webp|bmp)$/i;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const safeDecode = (s) => { try { return decodeURIComponent(s); } catch { return s; } };
const decodeHtml = (s) => String(s || "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ");
const stripTags = (s) => decodeHtml(String(s || "").replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
const attr = (tag, name) => { const m = String(tag || "").match(new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, "i")); return m ? decodeHtml(m[2] ?? m[3]) : ""; };

// ---------------------------------------------------------------- HTTP + listing
async function getText(url, tries = 3) {
  let last;
  for (let t = 1; t <= tries; t++) {
    try {
      const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "text/html,*/*;q=0.8" }, signal: AbortSignal.timeout(20000) });
      if (r.status === 404) throw Object.assign(new Error("HTTP 404"), { status: 404 });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.text();
    } catch (e) { last = e; if (e.status === 404) break; await sleep(800 * t); }
  }
  throw last;
}

// dirUrl-er direct child hole URL, na hole null (parent link, sort link `?C=N`, onno host bad)
function childUrl(dirUrl, href) {
  let u, d;
  try { u = new URL(href, dirUrl); d = new URL(dirUrl); } catch { return null; }
  if (u.search || u.hash || u.host !== d.host) return null;
  const dp = safeDecode(d.pathname).replace(/\/+$/, "");
  const up = safeDecode(u.pathname).replace(/\/+$/, "");
  if (!up.startsWith(dp + "/")) return null;
  return up.slice(dp.length + 1).includes("/") ? null : u;
}

// Cloudstream selector: `tbody > tr`, `td.fb-n > a`, folder = `td.fb-i > img[alt=folder]`
function parseListing(html, dirUrl) {
  const out = [], seen = new Set();
  const add = (href, rawName, row) => {
    const u = childUrl(dirUrl, href);
    const name = stripTags(rawName);
    if (!u || !name || name === ".." || seen.has(u.href)) return;
    seen.add(u.href);
    const cell = (c) => { const m = row.match(new RegExp(`<td\\b[^>]*class\\s*=\\s*["'][^"']*\\b${c}\\b[^"']*["'][^>]*>([\\s\\S]*?)<\\/td>`, "i")); return m ? stripTags(m[1]) : ""; };
    out.push({
      name, url: u.href,
      isDir: /alt\s*=\s*["']folder["']/i.test(row) || u.pathname.endsWith("/"),
      mtime: cell("fb-d"), size: cell("fb-s")
    });
  };
  for (const row of html.match(/<tr\b[\s\S]*?<\/tr>/gi) || []) {
    const m = row.match(/<td\b[^>]*class\s*=\s*["'][^"']*\bfb-n\b[^"']*["'][^>]*>([\s\S]*?)<\/td>/i);
    const a = m && m[1].match(/<a\b([^>]*)>([\s\S]*?)<\/a>/i);
    if (a) add(attr(a[1], "href"), a[2], row);
  }
  if (!out.length) for (const a of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) add(attr(a[1], "href"), a[2], "");
  return out;
}

// ---------------------------------------------------------------- name parsing (Cloudstream-er moto)
const cleanName = (s) => decodeHtml(s)
  .replace(/\d{3,4}p.*/, "").replace(/\.(mkv|mp4|avi|mov)/g, "").replace(/\[.*?\]/g, "")
  .replace(/\s*\([^)]*TV Series[^)]*\)/g, "").replace(/\s*\([^)]*\)/g, "").replace(/\s+/g, " ").trim();
const extractYear = (s) => { const m = String(s).match(/\([^)]*?\b(19\d\d|20\d\d)\b/); return m ? +m[1] : undefined; };
const cleanEpisodeName = (s) => s.replace(/S\d{2}E\d{2}/gi, "").replace(/\d{3,4}p/g, "").replace(/NF WEBRip|WEBRip/g, "").replace(/\[.*?\]/g, "").replace(/\.(mkv|mp4|avi|m4v|webm|mov)$/i, "").replace(/[._]+/g, " ").replace(/\s+/g, " ").trim();
const parseSE = (name) => { const m = name.match(/[Ss](\d{1,2})[Ee](\d{1,3})/); return m ? { s: +m[1], e: +m[2] } : {}; };
function detectQuality(s) {
  s = s.toLowerCase();
  if (s.includes("2160p") || s.includes("4k")) return "4K";
  if (s.includes("1080p")) return "1080p";
  if (s.includes("720p")) return "720p";
  if (s.includes("480p")) return "480p";
  return "Direct";
}
const QRANK = { "4K": 5, "1080p": 4, "720p": 3, "480p": 2, Direct: 1 };
const toLink = (f) => ({ url: f.url, name: f.name, quality: detectQuality(f.name), size: f.size && f.size !== "-" ? f.size : undefined });
const byQuality = (a, b) => (QRANK[b.quality] || 0) - (QRANK[a.quality] || 0);

function parseSeasonInfo(folderName) {
  for (const re of [/season\s*(\d+)/i, /s(\d+)/i, /series\s*(\d+)/i]) {
    const m = folderName.match(re);
    if (m && +m[1] >= 0) return { num: +m[1] };
  }
  const nm = folderName.replace(/[%_]/g, " ").replace(/\s+/g, " ").trim();
  const map = { oav: "OAV", oavs: "OAV", ova: "OVA", ovas: "OVA", special: "Specials", specials: "Specials", movie: "Movies", movies: "Movies", extra: "Extras", extras: "Extras", bonus: "Bonus" };
  return { num: null, name: map[nm.toLowerCase()] || nm };
}

function pickPoster(listing) {
  const imgs = listing.filter((e) => !e.isDir && IMAGE.test(e.name));
  for (const n of ["poster", "cover", "a_al_", "thumbnail", "fanart"]) for (const ext of ["jpg", "jpeg", "png"]) {
    const f = imgs.find((e) => e.name.toLowerCase() === `${n}.${ext}`);
    if (f) return f.url;
  }
  const like = imgs.find((e) => /poster|cover/i.test(e.name));
  return (like || imgs[0] || {}).url;
}

// ---------------------------------------------------------------- build movie / series
async function buildMovie(entry) {
  const listing = parseListing(await getText(entry.url), entry.url);
  const links = listing.filter((e) => !e.isDir && VIDEO.test(e.name)).map(toLink).sort(byQuality);
  return { links, poster: pickPoster(listing) };
}

function toEpisodes(raw) {
  const seasons = new Map();
  for (const r of raw) { const k = r.s + "|" + (r.seasonName || ""); if (!seasons.has(k)) seasons.set(k, []); seasons.get(k).push(r); }
  const episodes = [];
  for (const group of seasons.values()) {
    // numbered episode age, tarpor baki (Cloudstream-er moto: index+1)
    const sorted = group.map((r) => ({ ...r, e: parseSE(r.file.name).e })).sort((a, b) => (a.e == null) - (b.e == null) || (a.e ?? 0) - (b.e ?? 0));
    const byEp = new Map();
    sorted.forEach((r, i) => {
      const e = r.e ?? i + 1;
      if (!byEp.has(e)) byEp.set(e, { s: r.s, e, name: cleanEpisodeName(r.file.name) || `Episode ${e}`, seasonName: r.seasonName || undefined, links: [] });
      byEp.get(e).links.push(toLink(r.file));
    });
    for (const ep of byEp.values()) { ep.links.sort(byQuality); episodes.push(ep); }
  }
  return episodes.sort((a, b) => a.s - b.s || a.e - b.e);
}

async function buildSeries(entry) {
  const listing = parseListing(await getText(entry.url), entry.url);
  const raw = [];
  for (const f of listing.filter((e) => !e.isDir && VIDEO.test(e.name))) raw.push({ s: parseSE(f.name).s ?? 1, file: f });
  for (const d of listing.filter((e) => e.isDir)) {
    const info = parseSeasonInfo(d.name);
    let sub;
    try { sub = parseListing(await getText(d.url), d.url); } catch { continue; }
    for (const f of sub.filter((e) => !e.isDir && VIDEO.test(e.name))) raw.push({ s: info.num ?? 0, seasonName: info.num == null ? info.name : null, file: f });
  }
  return { episodes: toEpisodes(raw), poster: pickPoster(listing) };
}

// ---------------------------------------------------------------- TMDB (optional)
let lastTmdb = 0;
async function tmdb(p) {
  if (!TMDB_KEY) return null;
  const wait = 250 - (Date.now() - lastTmdb);
  if (wait > 0) await sleep(wait);
  lastTmdb = Date.now();
  try {
    const r = await fetch(`${TMDB}${p}${p.includes("?") ? "&" : "?"}api_key=${TMDB_KEY}`, { signal: AbortSignal.timeout(15000) });
    return r.ok ? await r.json() : null;
  } catch { return null; }
}
function similarity(a, b) {
  const [s, l] = a.length < b.length ? [a, b] : [b, a];
  if (!s) return 0;
  if (l.includes(s)) return 1;
  const w1 = a.split(" ").filter((w) => w.length > 2), w2 = b.split(" ").filter((w) => w.length > 2);
  if (!w1.length || !w2.length) return 0;
  return w1.filter((w) => w2.some((x) => x.includes(w) || w.includes(x))).length / Math.max(w1.length, w2.length);
}
async function enrichTmdb(item) {
  const isMovie = item.kind === "movies";
  const type = isMovie ? "movie" : "tv";
  const q = encodeURIComponent(item.name.toLowerCase());
  const yp = item.year ? `&${isMovie ? "year" : "first_air_date_year"}=${item.year}` : "";
  let res = ((await tmdb(`/search/${type}?query=${q}${yp}`)) || {}).results || [];
  if (!res.length && yp) res = ((await tmdb(`/search/${type}?query=${q}`)) || {}).results || [];
  let best = null, bs = 0.5;
  for (const r of res) { const sc = similarity(item.name.toLowerCase(), String(r.title || r.name || "").toLowerCase()); if (sc > bs || (best === null && sc >= bs)) { best = r; bs = sc; } }
  item.tmdbTried = true;
  if (!best) return;
  const d = (await tmdb(`/${type}/${best.id}?append_to_response=external_ids`)) || best;
  item.tmdb = String(best.id);
  item.imdb = d.imdb_id || (d.external_ids || {}).imdb_id || undefined;
  item.overview = d.overview || undefined;
  item.rating = d.vote_average ? +d.vote_average.toFixed(1) : undefined;
  item.genres = (d.genres || []).map((g) => g.name).filter(Boolean);
  item.backdrop = d.backdrop_path ? `${IMG}/w780${d.backdrop_path}` : undefined;
  if (!item.poster && d.poster_path) item.poster = `${IMG}/w342${d.poster_path}`;
  const y = parseInt(String(d.release_date || d.first_air_date || "").slice(0, 4), 10);
  if (!item.year && y) item.year = y;
}
async function applySeasons(item) {
  for (const n of [...new Set(item.episodes.map((e) => e.s))].filter((n) => n > 0)) {
    const sd = await tmdb(`/tv/${item.tmdb}/season/${n}`);
    const map = new Map(((sd || {}).episodes || []).map((t) => [t.episode_number, t]));
    for (const ep of item.episodes.filter((e) => e.s === n)) {
      const t = map.get(ep.e);
      if (!t) continue;
      ep.name = t.name || ep.name;
      ep.overview = t.overview || undefined;
      ep.still = t.still_path ? `${IMG}/w300${t.still_path}` : undefined;
      ep.air = t.air_date || undefined;
    }
  }
}

// ---------------------------------------------------------------- storage
function readData() {
  try { return JSON.parse(fs.readFileSync(OUT, "utf8")).items || []; } catch {}
  try { return JSON.parse(zlib.gunzipSync(fs.readFileSync(OUT_GZ)).toString()).items || []; } catch {}
  return [];
}
const sortItems = (items) => items.sort((a, b) => (b.added || "").localeCompare(a.added || "") || (b.year || 0) - (a.year || 0) || a.name.localeCompare(b.name));
function save(items, final) {
  if (final) {
    sortItems(items);
    if (JSON.stringify(readData()) === JSON.stringify(items)) { console.log("Kichu bodlayni, save lagbe na."); return; }
  }
  const json = JSON.stringify({ updated: new Date().toISOString(), items });
  fs.writeFileSync(OUT, json);
  if (final) fs.writeFileSync(OUT_GZ, zlib.gzipSync(json, { level: 6 }));
}

const LOCK = path.join(os.tmpdir(), "dflix-scrape.lock");
function acquireLock() {
  try {
    if (fs.existsSync(LOCK) && Date.now() - fs.statSync(LOCK).mtimeMs > 12 * 3600 * 1000) fs.unlinkSync(LOCK);
    fs.writeFileSync(LOCK, String(process.pid), { flag: "wx" });
    return true;
  } catch { return false; }
}
const releaseLock = () => { try { fs.unlinkSync(LOCK); } catch {} };
process.on("exit", releaseLock);

// ---------------------------------------------------------------- main
const idOf = (serverId, url) => {
  const p = safeDecode(new URL(url).pathname).replace(/\/+$/, "");
  return `dflix:${serverId}:${crypto.createHash("sha1").update(serverId + "|" + p).digest("hex").slice(0, 12)}`;
};

async function run(mode) {
  const have = new Map(readData().map((i) => [i.id, i]));
  const years = mode === "update" ? CFG.updateYears : CFG.years;
  const startedAt = new Date().toISOString();
  console.log(`[${mode}] age theke ache: ${have.size} ta. Years: ${years.join(", ")}`);

  // 1) section listing -> folder entries
  const jobs = [], seen = new Set();
  let listed = 0, reachable = 0;
  for (const server of CFG.servers) {
    for (const section of server.sections) {
      const paths = section.path.includes("{year}") ? years.map((y) => section.path.replace(/\{year\}/g, y)) : [section.path];
      for (const p of paths) {
        const url = new URL(`${server.dir}/${p.replace(/^\/+/, "")}`, server.base.replace(/\/?$/, "/")).href;
        let listing;
        try { listing = parseListing(await getText(url), url); reachable++; }
        catch (e) { if (e.status !== 404) console.log(`  khule nai [${server.name}] ${p}: ${e.message}${e.cause ? " | " + (e.cause.code || e.cause.message) : ""}`); continue; }
        const dirs = listing.filter((e) => e.isDir);
        console.log(`[${server.name}] ${p} -> ${dirs.length} folder`);
        for (const entry of dirs) {
          const id = idOf(server.id, entry.url);
          if (seen.has(id)) continue;
          seen.add(id); listed++;
          const old = have.get(id);
          const hasData = old && (old.links?.length || old.episodes?.length);
          const isSeries = section.kind !== "movies";
          let need = !hasData;
          if (hasData && isSeries && mode === "update") need = !(entry.mtime && old.mtime === entry.mtime); // folder bodlale-i
          if (need) jobs.push({ server, section, entry, id, old });
        }
        await sleep(150);
      }
    }
  }
  if (!listed) {
    console.log(reachable ? "\nPROBLEM: server khulse kintu kono folder paoa jayni (listing format mile ni)." : "\nPROBLEM: kono DhakaFlix server khule nai. Ei device ta ki BD ISP network-e ache?");
    return false;
  }
  console.log(`\n${listed} ta folder dekha gelo. Detail anbo: ${jobs.length} ta`);

  // 2) detail pages (movie file / season + episode)
  let done = 0, failed = 0, idx = 0;
  const worker = async () => {
    while (idx < jobs.length) {
      const { server, section, entry, id, old } = jobs[idx++];
      try {
        const isSeries = section.kind !== "movies";
        const rawName = entry.name.replace(/\/$/, "");
        const item = old ? { ...old } : { id, server: server.id, kind: section.kind, rawName, name: cleanName(rawName) || rawName, year: extractYear(rawName), url: entry.url, added: startedAt };
        item.mtime = entry.mtime || undefined;
        if (isSeries) { const b = await buildSeries(entry); item.episodes = b.episodes; item.poster = item.poster || b.poster; }
        else { const b = await buildMovie(entry); item.links = b.links; item.poster = item.poster || b.poster; }
        if (TMDB_KEY && !item.tmdbTried) await enrichTmdb(item);
        if (TMDB_KEY && isSeries && item.tmdb) await applySeasons(item);
        if (item.links?.length || item.episodes?.length) have.set(id, item);
        else console.log(`  video file nai: ${rawName}`);
      } catch (e) { failed++; console.log(`  fail ${entry.name}: ${e.message}`); }
      if (++done % 25 === 0) { console.log(`  ${done}/${jobs.length}`); save([...have.values()]); }
      await sleep(150);
    }
  };
  await Promise.all(Array.from({ length: CFG.concurrency || 4 }, worker));

  save([...have.values()], true);
  const all = [...have.values()];
  const c = (k) => all.filter((i) => i.kind === k).length;
  console.log(`\nDONE. ${all.length} ta item (movies ${c("movies")}, series ${c("series")}, anime ${c("anime")}), ${failed} ta fail.`);
  console.log(`File: ${OUT_GZ}`);
  return true;
}

async function main() {
  const mode = process.argv[2] === "update" ? "update" : "scrape";
  if (!acquireLock()) { console.log("Ekta scrape ageri cholche. Shesh hole abar chalao."); return false; }
  try { return await run(mode); } finally { releaseLock(); }
}

if (require.main === module) main().then((ok) => process.exit(ok ? 0 : 1)).catch((e) => { console.error(e); process.exit(1); });
module.exports = { parseListing, cleanName, toEpisodes, parseSeasonInfo, extractYear };
