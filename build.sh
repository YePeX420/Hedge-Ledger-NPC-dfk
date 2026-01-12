#!/bin/bash
# Build script for production deployment
# Runs vite build and copies output to static-build/ for persistence

set -e

echo "🔨 Building frontend..."
npx vite build

echo "📁 Copying build output to static-build/..."
mkdir -p static-build
cp -r dist/public/* static-build/

echo "✅ Build complete! Files in static-build/"
ls -la static-build/
