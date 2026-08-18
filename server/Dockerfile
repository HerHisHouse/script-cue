FROM node:22-slim

# Install fontconfig and DejaVu / Liberation fonts
RUN apt-get update && apt-get install -y \
    fontconfig \
    fonts-dejavu-core \
    fonts-liberation \
    && fc-cache -f -v \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm ci --production

# Copy server code
COPY . .

EXPOSE 3000

ENV FONTCONFIG_PATH=/etc/fonts

CMD ["node", "index.js"]
