#!/bin/sh
# Daily compressed pg_dump into /backups, pruning dumps older than BACKUP_KEEP_DAYS.
# Copy ./backups off the server (S3, B2, rsync) — a backup on the same disk is not a backup.
set -eu

while true; do
  stamp=$(date -u +%Y%m%dT%H%M%SZ)
  pg_dump --format=custom --file="/backups/evntiqa_${stamp}.dump"
  echo "backup written: evntiqa_${stamp}.dump"
  find /backups -name 'evntiqa_*.dump' -mtime +"${BACKUP_KEEP_DAYS}" -delete
  sleep 86400
done
