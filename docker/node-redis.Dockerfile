FROM redis:7 as redis

FROM node:18-bullseye

COPY --from=redis /usr/local/bin/redis-* /usr/local/bin/
RUN redis-cli --version
RUN redis-server --version

COPY node_redis-entrypoint.sh /usr/local/bin/

ENTRYPOINT ["node_redis-entrypoint.sh"]

CMD ["bash"]
