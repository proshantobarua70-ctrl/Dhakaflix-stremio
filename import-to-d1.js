```javascript
const fs = require("fs");
const zlib = require("zlib");

const ACCOUNT = process.env.CLOUDFLARE_ACCOUNT_ID;
const DATABASE = process.env.CLOUDFLARE_D1_DATABASE_ID;
const TOKEN = process.env.CLOUDFLARE_API_TOKEN;

const FILE = "data.json.gz";
const TABLE = "movies";
const BATCH_SIZE = 5;

const columns = [
  "id", "kind", "slug", "name", "poster", "backdrop",
  "year", "overview", "rating", "genres", "runtime",
  "imdb", "tmdb", "trailer", "episodes", "detail_url", "links"
];

function jsonText(value) {
  if (value == null) return null;
  return typeof value === "string" ? value : JSON.stringify(value);
}

function normalize(item, index) {
  const kind = String(item.kind || item.type || "movie").toLowerCase();
  const name = item.name || item.title || `Item ${index + 1}`;
  const slug = item.slug || item.id ||
    name.toLowerCase().replace(/[^a-z0-9]+/g, "-");

  return [
    String(item.id || `${kind}:${slug}`),
    kind,
    String(slug),
    String(name),
```
