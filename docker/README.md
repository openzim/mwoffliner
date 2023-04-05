**MWoffliner Docker image** allows to quickly benefit of MWoffliner
without having to install all dependencies. You just need a working
[Docker](https://www.docker.com).

## Standalone

MWoffliner requires a [Redis](https://www.redis.io) server to run.

For convenience purpose, MWoffliner image bundles a Redis daemon launched in the background.

This bundled Redis daemon is configured to be used only through a unix socket and to work exclusively from memory (no writes to disk).

Use of this bundled server is transparent as `mwoffliner` command is aliased to `mwoffliner --redis /dev/shm/redis.sock`.

To run the following examples, you need first to create a local `out`
directory in you current directory. Created ZIM files will be written
there.

```sh
docker run --volume=$(pwd)/out:/out -ti ghcr.io/openzim/mwoffliner mwoffliner --help
```

## With dedicated Redis

You can also use a dedicated redis container with MWoffliner.

Run a Redis docker container with:

```sh
docker run --volume=$(pwd)/out:/out --name=redis -d redis
```

... and then run the moffliner interactively (remember to specify `--redis` in command):

```sh
$docker run --volume=$(pwd)/out:/out --link=redis:redis --name=mwoffliner -ti ghcr.io/openzim/mwoffliner
```

... or non-interactively, directly with a command line (this is an
example, the second line is the mwoffliner command itself):

```sh
docker run --volume=$(pwd)/out:/out --link=redis:redis --name=mwoffliner -e REDIS="redis://redis" ghcr.io/openzim/mwoffliner \
       mwoffliner --verbose --mwUrl=https://en.wikipedia.org/ --adminEmail=foo@bar.net
```

## With Docker compose

This allows to run both, Redis & MWoffliner, containers simultaneously:

```sh
docker-compose --file docker-compose.yml run mwoffliner
```

## Build the Docker image

Run from the repository root:
```sh
docker build . -f docker/Dockerfile -t ghcr.io/openzim/mwoffliner
```
