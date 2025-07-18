ARG PARENT_VERSION=latest-22
ARG PORT=3000
ARG PORT_DEBUG=9229

FROM defradigital/node-development:${PARENT_VERSION} AS development

ENV TZ="Europe/London"

ARG PARENT_VERSION=latest-22
LABEL uk.gov.defra.ffc.parent-image=defradigital/node-development:${PARENT_VERSION}

ARG PORT
ARG PORT_DEBUG
ENV PORT=${PORT}
EXPOSE ${PORT} ${PORT_DEBUG}

WORKDIR /home/node

COPY --chown=node:node --chmod=755 package*.json ./
COPY --chown=node:node --chmod=755 .browserslistrc ./
COPY --chown=node:node --chmod=755 webpack.config.js ./
COPY --chown=node:node --chmod=755 babel.config.cjs ./
COPY --chown=node:node --chmod=755 tsconfig.json ./
RUN npm install --ignore-scripts

CMD [ "npm", "run", "dev" ]

FROM development AS production_build

ENV NODE_ENV=production

COPY --chown=node:node --chmod=755 . .
RUN npm run build

FROM defradigital/node:${PARENT_VERSION} AS production

ENV TZ="Europe/London"

# Add curl to template.
# CDP PLATFORM HEALTHCHECK REQUIREMENT
USER root
RUN apk update \
    && apk add curl \
    && apk cache clean

USER node

ARG PARENT_VERSION
LABEL uk.gov.defra.ffc.parent-image=defradigital/node:${PARENT_VERSION}

COPY --from=production_build /home/node/package*.json ./
COPY --from=production_build /home/node/.server ./.server/
COPY --from=production_build /home/node/.public/ ./.public/
COPY --from=production_build /home/node/src/server/common/forms ./src/server/common/forms
COPY --from=production_build /home/node/src/server/common/tasklist ./src/server/common/tasklist
COPY --from=production_build /home/node/src/server/views ./src/server/views

RUN npm ci --omit=dev  --ignore-scripts

ARG PORT
ENV PORT=${PORT}
EXPOSE ${PORT}

CMD [ "node", "." ]
