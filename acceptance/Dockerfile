FROM node:24-alpine

ENV TZ="Europe/London"

# Playwright needs chromium dependencies.
# mesa-vulkan-swrast + vulkan-loader provide a software Vulkan device (lavapipe)
# so headless Chromium can create a real WebGL context via ANGLE's Vulkan
# backend. Without it, WebGL is unavailable in this GPU-less container and the
# MapLibre map on the land-parcel page fails to initialise, which makes
# mapping.feature flaky. See test/support/world.js for the matching launch args.
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    mesa-vulkan-swrast \
    vulkan-loader

ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
ENV PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium-browser

USER node

WORKDIR /home/node/app

COPY --chown=node:node . .

RUN npm install

ENTRYPOINT [ "./entrypoint.sh" ]

CMD ["npm", "run", "test:ci"]
