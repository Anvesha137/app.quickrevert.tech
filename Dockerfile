# Use a newer Node.js base image that supports react-router requirements
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY . .

# Set environment variables and build the application
ENV VITE_SUPABASE_URL=https://unwijhqoqvwztpbahlly.supabase.co
ENV VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVud2lqaHFvcXZ3enRwYmFobGx5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc1OTg1NjgsImV4cCI6MjA4MzE3NDU2OH0.XxljpvAbv1kR0yWdRBDimBCkvXG0fnmQ0g-e4kJcowY

# Build the application
RUN npm run build

# Install serve to serve the static files
RUN npm install -g serve

# Expose port
EXPOSE 3000

# Start the application
CMD ["serve", "-s", "dist", "-l", "3000"]