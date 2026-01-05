# Use Node.js base image
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy build script
COPY build.sh .

# Make build script executable
RUN chmod +x build.sh

# Copy source code
COPY . .

# Build the application with environment variables
RUN ./build.sh

# Install serve to serve the static files
RUN npm install -g serve

# Expose port
EXPOSE 3000

# Start the application
CMD ["serve", "-s", "dist", "-l", "3000"]