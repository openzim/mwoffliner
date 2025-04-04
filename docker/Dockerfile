FROM redis:7 AS redis

FROM node:22-bookworm
LABEL org.opencontainers.image.source=https://github.com/openzim/mwoffliner

COPY --from=redis /usr/local/bin/redis-* /usr/local/bin/
RUN redis-cli --version
RUN redis-server --version

COPY docker/node_redis-entrypoint.sh /usr/local/bin/

# Configure launch environment
WORKDIR /
RUN mv /root/.bashrc /root/.old-bashrc
COPY docker/.custom-bashrc /root/.bashrc

ENV REDIS=/dev/shm/redis.sock
RUN printf '#!/bin/bash\n/usr/local/bin/mwoffliner --redis=$REDIS "$@"' > /usr/local/sbin/mwoffliner
RUN chmod +x /usr/local/sbin/mwoffliner

# Install dependences
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    make g++ curl git && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Install mwoffliner
WORKDIR /tmp/mwoffliner
COPY *.json ./
COPY dev dev
RUN mkdir src
RUN npm i
COPY src src
COPY res res
COPY translation translation
COPY extensions extensions
COPY index.js .
RUN npm i
RUN npm i -g .


# Configure launch environment
WORKDIR /
RUN mv /root/.bashrc /root/.old-bashrc
COPY docker/.custom-bashrc /root/.bashrc

ENTRYPOINT ["node_redis-entrypoint.sh"]

CMD ["mwoffliner"]
