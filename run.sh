while true; do
  # Refresh stale cached constituencies
  npx tsx scripts/local-refresh.ts --batch 5 --delay 400
  sleep 30
  npx tsx scripts/local-refresh.ts --batch 5 --delay 400

  sleep 300

  # Fill missing/failed constituencies
  npx tsx scripts/local-fill.ts --batch 5 --delay 400
  sleep 30
  npx tsx scripts/local-fill.ts --batch 5 --delay 400

  sleep 300
done
