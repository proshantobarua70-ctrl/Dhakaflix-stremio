#!/usr/bin/env sh
# Phone (Termux) / PC / VPS theke chalao, jeta DhakaFlix server khulte pare (BD ISP network).
cd "$(dirname "$0")" || exit 1
node scraper.js update || exit 1
git add data.json.gz
if git diff --cached --quiet; then echo "Notun kichu nai."; exit 0; fi
git commit -m "Update catalog $(date -u +%F-%H%M)" && git push
