FROM openzim/zimwriterfs:latest

# Basics
RUN apt-get update && apt-get install -y make g++ curl git


# Install npm & nodejs
RUN curl -sL https://deb.nodesource.com/setup_10.x | bash && \
    apt-get install --yes nodejs

# Install mwoffliner
RUN apt-get install -y nscd file imagemagick && \
    npm install -g mwoffliner && \
    apt-get remove -y make g++

# Boot commands
# COPY .custom-bashrc /root/
CMD mwoffliner
