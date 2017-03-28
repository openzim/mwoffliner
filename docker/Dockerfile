FROM ubuntu:latest

# Configure deb system
RUN echo 'debconf debconf/frontend select Noninteractive' | debconf-set-selections
RUN locale-gen "en_US.UTF-8"
ENV LANG en_US.UTF-8
RUN update-locale
RUN dpkg-reconfigure locales

# Increase standards system limits
RUN echo "* - nofile unlimited" >  /etc/security/limits.conf
RUN echo "* - stack  unlimited" >> /etc/security/limits.conf

# Update system
RUN apt-get update -y
RUN apt-get install -y apt-utils
RUN apt-get dist-upgrade -y

# Install necessary packages
RUN apt-get install -y git
RUN apt-get install -y pkg-config
RUN apt-get install -y libtool
RUN apt-get install -y automake
RUN apt-get install -y autoconf
RUN apt-get install -y make
RUN apt-get install -y g++
RUN apt-get install -y liblzma-dev

# Install zimlib
RUN git clone https://gerrit.wikimedia.org/r/p/openzim.git
RUN cd openzim/zimlib && ./autogen.sh
RUN cd openzim/zimlib && ./configure
RUN cd openzim/zimlib && make all install

# Install Xapian
RUN apt-get install -y wget
RUN apt-get install -y zlib1g-dev
RUN wget https://oligarchy.co.uk/xapian/1.4.3/xapian-core-1.4.3.tar.xz
RUN tar xvf xapian-core-1.4.3.tar.xz
RUN cd xapian-core-1.4.3 && ./configure
RUN cd xapian-core-1.4.3 && make all install

# Install zimwriterfs
RUN apt-get install -y libgumbo-dev
RUN apt-get install -y libmagic-dev
RUN apt-get install -y libicu-dev
RUN cd openzim/zimwriterfs && ./autogen.sh
RUN cd openzim/zimwriterfs && ./configure
RUN cd openzim/zimwriterfs && make all install

# Install jpegoptim
RUN apt-get install -y libjpeg-dev
RUN wget http://www.kokkonen.net/tjko/src/jpegoptim-1.4.4.tar.gz
RUN tar xvf jpegoptim-1.4.4.tar.gz
RUN cd jpegoptim-1.4.4 && ./configure
RUN cd jpegoptim-1.4.4 && make all install

# Install pngquant
RUN apt-get install -y libpng16-dev
RUN wget http://pngquant.org/pngquant-2.9.0-src.tar.gz
RUN tar xvf pngquant-2.9.0-src.tar.gz
RUN cd pngquant-2.9.0 && ./configure
RUN cd pngquant-2.9.0 && make all install

# Install gifsicle
RUN wget https://www.lcdf.org/gifsicle/gifsicle-1.88.tar.gz
RUN tar xvf gifsicle-1.88.tar.gz
RUN cd gifsicle-1.88 && ./configure
RUN cd gifsicle-1.88 && make all install

# Install npm & nodejs
RUN apt-get install -y python
RUN wget https://nodejs.org/dist/v6.10.1/node-v6.10.1.tar.gz
RUN tar xvf node-v6.10.1.tar.gz
RUN cd node-v6.10.1 && ./configure
RUN cd node-v6.10.1 && make all install

# Configure Redis
RUN apt-get install -y redis-server
RUN echo "" >> /etc/redis/redis.conf
RUN echo "unixsocket /dev/shm/redis.sock" >> /etc/redis/redis.conf 
RUN echo "unixsocketperm 777" >> /etc/redis/redis.conf
RUN echo "save \"\"" >> /etc/redis/redis.conf
RUN echo "appendfsync no" >> /etc/redis/redis.conf

# Install mwoffliner
RUN apt-get install -y nscd
RUN apt-get install -y file
RUN apt-get install -y imagemagick
RUN apt-get install -y advancecomp
RUN npm install -g mwoffliner

# Boot commands
CMD service redis-server restart && /bin/bash
