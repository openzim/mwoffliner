`mwoffliner Docker image` allows to quickly benefit of mwoffliner
without having to install all dependencies.

## Standalone

The mwoffliner image needs a Redis server to run properly.

You can run a Redis docker container with:

```
$docker run --name=redis -d redis
```

... and then run the moffliner interactively:

```
$docker run --link=redis:redis --name=mwoffliner -ti mwoffliner
```

... or with a command line (this is an example, the second line is the
mwoffliner itself):

```
docker run --link=redis:redis --name=mwoffliner mwoffliner \
       mwoffliner --redis="redis://redis" --verbose --mwUrl=https://en.wikipedia.org/ --adminEmail=foo@bar.net
```

## With Docker compose

This allows to run both, Redis & MWoffliner, container together easily:

```
docker-compose --file docker-compose.yml run mwoffliner
```
