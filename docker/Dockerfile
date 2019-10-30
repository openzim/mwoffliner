FROM openzim/node-redis:10-5

# Install dependences
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    make g++ curl git imagemagick && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Install mwoffliner
WORKDIR /tmp/mwoffliner
COPY *.json ./
COPY src src
COPY res res
COPY translation translation
COPY index.js .
COPY dev dev
RUN npm --global config set user root
RUN npm config set unsafe-perm true
RUN npm i
RUN npm i -g .

# Configure launch environment
WORKDIR /
RUN mv /root/.bashrc /root/.old-bashrc
COPY docker/.custom-bashrc /root/.bashrc
CMD mwoffliner
