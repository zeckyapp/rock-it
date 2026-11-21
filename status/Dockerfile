# Rock it status page and pairing: a small Python web server, standard library
# only. qr.js is qrcode-generator 2.0.4 by Kazuhiko Arase (MIT), and fonts/
# holds Inter and Newsreader (SIL Open Font License, from Fontsource 5.1.0),
# vendored so the page loads nothing from the internet. planet.js carries the
# Natural Earth land outline (public domain).
# The digest pins the exact base image; the tag says what it is. To update:
# look up the tag's current digest on Docker Hub and replace both.
FROM python:3.12-alpine3.22@sha256:a190708a2dec1bd18b1decb539f8e8f5407abaa9bf39cacda583f7f8c11db322

LABEL org.opencontainers.image.title="Zecky Rock it status" \
      org.opencontainers.image.description="Status and connection page for Zecky Rock it" \
      org.opencontainers.image.source="https://github.com/zeckyapp/rock-it" \
      org.opencontainers.image.licenses="MIT"

# openssl makes the Rock's own HTTPS certificate on first start.
RUN apk add --no-cache openssl

WORKDIR /app
COPY server.py index.html icon.svg qr.js qr.js.LICENSE planet.js ./
COPY fonts/ ./fonts/

USER 1000:1000
EXPOSE 8080 8139
ENV PYTHONUNBUFFERED=1
CMD ["python", "/app/server.py"]
