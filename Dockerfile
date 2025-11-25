ARG PARENT_VERSION=latest-24
ARG PORT=3000
ARG PORT_DEBUG=9229

FROM defradigital/node-development:${PARENT_VERSION} AS development

ENV TZ="Europe/London"

ARG PARENT_VERSION=latest-24
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

# Add curl for CDP platform healthcheck requirement
USER root
RUN apk update && \
    apk add --no-cache curl && \
    rm -rf /var/cache/apk/*

USER node

ARG PARENT_VERSION
LABEL uk.gov.defra.ffc.parent-image=defradigital/node:${PARENT_VERSION}

# Explicit working directory
WORKDIR /home/node

# Copy package files
COPY --from=production_build --chown=node:node /home/node/package*.json ./

# Copy built artifacts
COPY --from=production_build --chown=node:node /home/node/.server ./.server/
COPY --from=production_build --chown=node:node /home/node/.public/ ./.public/

# Copy runtime-required source files (templates, forms, configs)
# The .dockerignore file ensures only production assets are included
COPY --from=production_build --chown=node:node /home/node/src ./src/

# Install production dependencies
RUN npm ci --omit=dev --ignore-scripts

ARG PORT
ENV PORT=${PORT}
EXPOSE ${PORT}

CMD [ "node", "." ]
