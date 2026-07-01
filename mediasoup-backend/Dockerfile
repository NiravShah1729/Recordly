FROM node:22-alpine

# Install build tools AND py3-pip required for compiling mediasoup native C++ code
RUN apk add --no-cache python3 py3-pip make g++ linux-headers

WORKDIR /app

COPY package*.json ./

# Run install with foreground scripts so we can see the C++ compilation happening
RUN npm install --foreground-scripts

COPY . .

EXPOSE 3000 
EXPOSE 20000-20050/udp
EXPOSE 20000-20050/tcp

CMD ["node", "server.js"]