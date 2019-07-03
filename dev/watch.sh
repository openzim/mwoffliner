#!/bin/bash
# TODO: Check os and support MacOS and Linux
fswatch -0 src | xargs -0 -n 1 -I {} ./dev/build.sh
