FROM node:24-alpine

ENV TZ="Europe/London"

USER node

WORKDIR /home/node/app

COPY --chown=node:node . .

RUN npm install

ENTRYPOINT [ "./entrypoint.sh" ]

CMD ["npm", "run", "test:ci"]
