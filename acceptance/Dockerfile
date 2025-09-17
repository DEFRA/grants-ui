FROM node:current-alpine3.22

ENV TZ="Europe/London"

USER root

RUN apk add --no-cache \
    openjdk17-jre-headless \
    curl \
    aws-cli

USER node

WORKDIR /home/node/app

COPY --chown=node:node . .

RUN npm install

CMD [ "npm", "run", "test:ci" ]
