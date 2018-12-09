FROM openzim/zimwriterfs:latest

# Basics
RUN apt-get update && apt-get install -y make g++ curl

# Install jpegoptim
RUN apt-get install -y libjpeg-dev && \
    wget http://www.kokkonen.net/tjko/src/jpegoptim-1.4.6.tar.gz && \
    tar xvf jpegoptim-1.4.6.tar.gz && cd jpegoptim-1.4.6 && \
    ./configure && make all install && cd .. && rm -rf jpegoptim-1.4.6*

# Install pngquant
RUN apt-get install -y libpng-dev && \
    wget http://pngquant.org/pngquant-2.12.0-src.tar.gz && \
    tar xvf pngquant-2.12.0-src.tar.gz && cd pngquant-2.12.0 && \
    ./configure && make all install && cd .. && rm -rf pngquant-2.12.0*

# Install gifsicle
RUN wget https://www.lcdf.org/gifsicle/gifsicle-1.91.tar.gz && \
    tar xvf gifsicle-1.91.tar.gz && cd gifsicle-1.91 && \
    ./configure && make all install && cd .. && rm -rf gifsicle-1.91*

# Install npm & nodejs
RUN curl -sL https://deb.nodesource.com/setup_10.x | bash && \
    apt-get install --yes nodejs

# Install mwoffliner
RUN apt-get install -y nscd file imagemagick advancecomp git librsvg2-bin && \
    npm install -g mwoffliner && \
    apt-get remove -y make g++

# Boot commands
COPY .custom-bashrc /root/
CMD mwoffliner; bash --init-file /root/.custom-bashrc
