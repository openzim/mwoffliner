FROM node:10

# Install dependences
RUN apt update && apt install -y --no-install-recommends make g++ curl git imagemagick

# Install mwoffliner
WORKDIR /tmp/mwoffliner
COPY package*.json ./
COPY src src
COPY res res
COPY translation translation
COPY index.js .
COPY dev dev
RUN npm --global config set user root
RUN npm i
RUN npm i -g .

# Configure launch environment
WORKDIR /
RUN mv /root/.bashrc /root/.old-bashrc
COPY docker/.custom-bashrc /root/.bashrc
CMD mwoffliner
