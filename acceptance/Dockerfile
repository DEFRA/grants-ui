FROM node:24-alpine

ENV TZ="Europe/London"

# Playwright needs chromium dependencies
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont

ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
ENV PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium-browser

USER node

WORKDIR /home/node/app

COPY --chown=node:node . .

RUN npm install

ENTRYPOINT [ "./entrypoint.sh" ]

CMD ["npm", "run", "test:ci"]
