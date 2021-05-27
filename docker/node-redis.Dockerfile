FROM redis:6 as redis

FROM node:16-buster

COPY --from=redis /usr/local/bin/redis-* /usr/local/bin/
RUN redis-cli --version
RUN redis-server --version

COPY node_redis-entrypoint.sh /usr/local/bin/

ENTRYPOINT ["node_redis-entrypoint.sh"]

CMD ["bash"]
