# DhakaFlix Stremio Addon

```
DhakaFlix server (HTTP, h5ai directory listing)      <- BD ISP network-e khole (172.16.x.x)
        |  scraper.js (crawler, BD network-er device-e chalao)
        v
data.json.gz  (folder/file info + media URL)         <- GitHub repo-te commit
        |  Vercel auto-deploy
        v
api/index.js  (manifest, catalog, meta, stream)      <- Stremio addon
        v
Stremio player  --> video DhakaFlix server theke SHORASORI tane
```

DhakaFlix-er IP private (`172.16.50.x`), tai **Vercel server kokhono oi server-e jete pare na**.
Crawl (`scraper.js`) oi ISP-er network-e thaka kono device-e chalate hobe (Android phone-e Termux hole PC lagbe na).
Vercel shudhu `data.json.gz` theke Stremio-ke catalog/stream dey.
Video chalanor shomoy Stremio **jei device-e**, shei device-o oi ISP network-e thakte hobe.

## 1. GitHub + Vercel (ekbar)
1. Ei folder ta GitHub repo-te upload koro.
2. Vercel-e repo import kore Deploy koro (kono setting/env lagbe na).
3. Stremio-te addon install: `https://TOMAR-PROJECT.vercel.app/manifest.json`

## 2. Crawl (phone-e Termux)
```
pkg install nodejs git
git clone https://github.com/TOMAR-USER/TOMAR-REPO && cd TOMAR-REPO
export TMDB_API_KEY=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx   # optional: poster/rating/IMDb id
node scraper.js            # prothombar full crawl (somoy lagbe)
```
Tarpor `data.json.gz` GitHub-e push korle Vercel nijei notun deploy dey:
```
git add data.json.gz && git commit -m "data" && git push     # (GitHub token lagbe)
```
Token na chaile: GitHub website-e `data.json.gz` file ta "Upload files" diye replace koro.

Notun movie/episode-er jonno (kichu din por por): `./update.sh` (crawl `update` mode + commit + push).

## Config
`config.js`: server (14, 9, 7), folder list, `years`. Cloudstream-er `mainPage`/`year` theke neya.
DhakaFlix 12 ekhono nai (BdixDhakaFlix12Provider.kt pele jog hobe).
`TMDB_API_KEY` na dile poster folder-er `poster.jpg` theke, ar IMDb id/overview thakbe na
(tokhon Stremio-r onno addon-er catalog theke khulle naam diye match kora hoy, Cinemeta diye).

## Endpoints
`/manifest.json`, `/catalog/{movie|series}/{dflix_movies|dflix_series|dflix_anime}.json`, `/meta/...`, `/stream/...`, `/status`
