FROM mcr.microsoft.com/playwright:v1.59.1-noble

ENV TZ="Europe/London"

USER pwuser

WORKDIR /home/pwuser/app

COPY --chown=pwuser:pwuser . .

RUN npm install

ENTRYPOINT [ "/bin/sh", "./entrypoint.sh" ]

CMD ["npm", "run", "test:ci"]
