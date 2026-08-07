# Playwright browsers + OS deps are provided by the base image.
# App code uses Node (image default); keep playwright version aligned with the tag.
FROM mcr.microsoft.com/playwright:v1.51.0-jammy

WORKDIR /app

ENV NODE_ENV=production
ENV PLAYWRIGHT_PORT=9380
ENV PLAYWRIGHT_HOST=0.0.0.0
# Browsers already in the image — skip download on npm install.
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

COPY package.json ./
RUN npm install --omit=dev

COPY scripts ./scripts

EXPOSE 9380

CMD ["node", "scripts/server.mjs"]
