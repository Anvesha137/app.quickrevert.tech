#!/bin/bash

# Supabase Migration Script
# This script helps you set up a fresh Supabase database

echo "Starting Supabase setup..."

# Check if supabase CLI is installed
if ! command -v supabase &> /dev/null; then
    echo "Supabase CLI is not installed. Installing..."
    npm install -g supabase
fi

# Start local Supabase development environment
echo "Starting local Supabase environment..."
supabase start

# Apply the schema to the database
echo "Applying schema to the database..."
supabase db reset

echo "Supabase setup complete!"
echo "Your local Supabase environment is now running."
echo ""
echo "API URL: http://127.0.0.1:54321"
echo "DB URL: postgresql://postgres:postgres@127.0.0.1:54322/postgres"
echo ""
echo "To stop the local environment, run: supabase stop"