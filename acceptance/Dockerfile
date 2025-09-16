FROM defradigital/node-development:latest-22 AS development

USER node

COPY ./dto /home/node/dto
COPY ./features /home/node/features
COPY ./page-objects /home/node/page-objects
COPY ./services /home/node/services
COPY ./steps /home/node/steps
COPY package.json ./
COPY wdio.ci.conf.js ./

RUN npm install --ignore-scripts

CMD [ "npm", "run", "test:ci" ]
