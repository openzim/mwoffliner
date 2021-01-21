**MWoffliner Docker image** allows to quickly benefit of MWoffliner
without having to install all dependencies. You just need a working
[Docker](https://www.docker.com).

## Standalone

MWoffliner requires a [Redis](http://www.redis.io) server to run.

For convenience purpose, MWoffliner image bundles a redis server launched in the background.

This bundled redis server is configured to be used only through a unix socket and to work exclusively from memory (no writes to disk).

Use of this bundled server is transparent as `mwoffliner` command is aliased to `mwoffliner --redis /dev/shm/redis.sock`. 

``` sh
docker run -ti openzim/mwoffliner mwoffliner --help
```

## With dedicated redis

You can also use a dedicated redis container with MWoffliner.

Run a Redis docker container with:

```
$docker run --name=redis -d redis
```

... and then run the moffliner interactively (remember to specify `--redis` in command):

```
$docker run --link=redis:redis --name=mwoffliner -ti openzim/mwoffliner
```

... or non-interactively, directly with a command line (this is an
example, the second line is the mwoffliner command itself):

```
docker run --link=redis:redis --name=mwoffliner -e REDIS="redis://redis" openzim/mwoffliner \
       mwoffliner --verbose --mwUrl=https://en.wikipedia.org/ --adminEmail=foo@bar.net
```

## With Docker compose

This allows to run both, Redis & MWoffliner, containers simultaneously:

```
docker-compose --file docker-compose.yml run mwoffliner
```

## Build the Docker image

Run from the repository root:
```
docker build . -f docker/Dockerfile -t openzim/mwoffliner
```