FROM openzim/zimwriterfs:latest

# Basics
RUN apt-get update && apt-get install -y make g++

# Install jpegoptim
RUN apt-get install -y libjpeg-dev && \
 wget http://www.kokkonen.net/tjko/src/jpegoptim-1.4.4.tar.gz && \
 tar xvf jpegoptim-1.4.4.tar.gz && cd jpegoptim-1.4.4 && \
 ./configure && make all install && cd .. && rm -rf jpegoptim-1.4.4*

# Install pngquant
RUN apt-get install -y libpng16-dev && \
 wget http://pngquant.org/pngquant-2.9.0-src.tar.gz && \
 tar xvf pngquant-2.9.0-src.tar.gz && cd pngquant-2.9.0 && \
 ./configure && make all install && cd .. && rm -rf pngquant-2.9.0*

# Install gifsicle
RUN wget https://www.lcdf.org/gifsicle/gifsicle-1.88.tar.gz && \
 tar xvf gifsicle-1.88.tar.gz && cd gifsicle-1.88 && \
 ./configure && make all install && cd .. && rm -rf gifsicle-1.88*

# Install npm & nodejs
RUN apt-get install -y python
RUN wget https://nodejs.org/dist/v6.10.3/node-v6.10.3.tar.gz && \
 tar xvf node-v6.10.3.tar.gz && cd node-v6.10.3 && \
 ./configure && make all install && cd .. && rm -rf node-v6.10.3*

# Install mwoffliner
RUN apt-get install -y nscd file imagemagick advancecomp git
RUN npm install -g mwoffliner

RUN apt-get remove -y make g++

# Boot commands
COPY .custom-bashrc /root/
CMD mwoffliner; bash --init-file /root/.custom-bashrc
