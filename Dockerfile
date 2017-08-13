# Inspired by:
# http://jdlm.info/articles/2016/03/06/lessons-building-node-app-docker.html
FROM node:8.3-alpine

# Ubuntu version:
#RUN apt-get update && apt-get install -y tar bzip2 gzip jq netcat && \
#    useradd --user-group --create-home --shell /bin/false cl
RUN apk update && \
    apk add --no-cache bash tar bzip2 gzip jq redis && \
    adduser -h /home/cl -D -s /bin/false cl
USER cl
WORKDIR /home/cl

COPY package.json package-lock.json /home/cl/
RUN npm install --production && \
    npm cache clear --force
COPY . /home/cl/

EXPOSE 3000
VOLUME [ "/home/cl" ]
