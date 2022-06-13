FROM openzim/node-redis:18-7
LABEL org.opencontainers.image.source https://github.com/openzim/mwoffliner

# Install dependences
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    make g++ curl git && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Install mwoffliner
WORKDIR /tmp/mwoffliner
COPY *.json ./
COPY src src
COPY res res
COPY translation translation
COPY extensions extensions
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

ENV REDIS /dev/shm/redis.sock
RUN printf '#!/bin/bash\n/usr/local/bin/mwoffliner --redis=$REDIS "$@"' > /usr/local/sbin/mwoffliner
RUN chmod +x /usr/local/sbin/mwoffliner

CMD mwoffliner
