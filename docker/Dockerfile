FROM node:10

# Increase standards system limits
RUN echo "* - nofile unlimited" >  /etc/security/limits.conf
RUN echo "* - stack  unlimited" >> /etc/security/limits.conf

# Basics
RUN apt update && apt install -y --no-install-recommends make g++ curl git

# Install mwoffliner
RUN apt install -y --no-install-recommends imagemagick
RUN npm --global config set user root
RUN npm install -g mwoffliner@1.9.3
RUN apt remove -y make g++

# Boot commands
RUN mv /root/.bashrc /root/.old-bashrc
COPY .custom-bashrc /root/.bashrc
CMD mwoffliner
