#!/bin/bash

# Check if environment variables are set
if [ -z "$VITE_SUPABASE_URL" ]; then
    echo "Error: VITE_SUPABASE_URL is not set"
    exit 1
fi

if [ -z "$VITE_SUPABASE_ANON_KEY" ]; then
    echo "Error: VITE_SUPABASE_ANON_KEY is not set"
    exit 1
fi

# Install dependencies
npm install

# Build the application
npm run build