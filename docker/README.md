'''MWoffliner Docker image''' allows to quickly benefit of MWoffliner
without having to install all dependencies. You just need a working
[Docker](https://www.docker.com).

## Standalone

The MWoffliner image needs a Redis (http://www.redis.io) server to run
properly.

You can run a Redis docker container with:

```
$docker run --name=redis -d redis
```

... and then run the moffliner interactively:

```
$docker run --link=redis:redis --name=mwoffliner -ti openzim/mwoffliner
```

... or non-interactively, directly with a command line (this is an
example, the second line is the mwoffliner command itself):

```
docker run --link=redis:redis --name=mwoffliner openzim/mwoffliner \
       mwoffliner --redis="redis://redis" --verbose --mwUrl=https://en.wikipedia.org/ --adminEmail=foo@bar.net
```

## With Docker compose

This allows to run both, Redis & MWoffliner, containers simultaneously:

```
docker-compose --file docker-compose.yml run mwoffliner
```
