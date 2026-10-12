#!/bin/bash
# One-shot Atlas setup: verify connection, then seed the demo dataset.
set -e
cd "$(dirname "$0")/.."
echo "▸ Step 1/2 — checking the Atlas connection…"
npm run --silent db:check
echo
echo "▸ Step 2/2 — seeding demo data (wipes existing documents in the 'ems' database)…"
npm run --silent seed -- --force
echo
echo "✅ Atlas is ready. Restart the API server to switch from in-memory to Atlas."
