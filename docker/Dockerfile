FROM node:10

# Basics
RUN apt-get update && apt-get install -y make g++ curl git

# Install mwoffliner
RUN apt-get install -y imagemagick
RUN npm --global config set user root
RUN npm install -g mwoffliner
RUN apt-get remove -y make g++

# Boot commands
COPY .custom-bashrc /root/
CMD mwoffliner
