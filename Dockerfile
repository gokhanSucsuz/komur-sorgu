FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Install dependencies
COPY package*.json ./
RUN npm ci --omit=dev || npm install --omit=dev

# Copy project files
COPY . .

# Build Next.js application
RUN npm run build

# Volume mount point for persistent SQLite database
VOLUME ["/app/data"]

EXPOSE 3000

CMD ["npm", "run", "start"]
