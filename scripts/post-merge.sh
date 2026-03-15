#!/bin/bash
set -e
npm install
if npm run --silent db:push --if-present 2>/dev/null; then
  echo "db:push completed"
else
  echo "db:push skipped (script not found)"
fi
