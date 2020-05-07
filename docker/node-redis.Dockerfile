FROM redis:5.0 as redis

FROM node:12.16.3-buster

COPY --from=redis /usr/local/bin/redis-* /usr/local/bin/
RUN redis-cli --version
RUN redis-server --version

COPY node_redis-entrypoint.sh /usr/local/bin/

ENTRYPOINT ["node_redis-entrypoint.sh"]

CMD ["bash"]
