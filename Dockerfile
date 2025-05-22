FROM node:24-slim

RUN mkdir -p /home/node/app/node_modules && chown -R node:node /home/node/app

WORKDIR /home/node/app

COPY package*.json ./

# Install build tools needed for better-sqlite3
USER root
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

USER node
RUN npm install

COPY --chown=node:node . .

EXPOSE 3000

CMD [ "node", "server.js" ]