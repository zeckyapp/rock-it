# Rock it status page and pairing: a small Python web server, standard library
# only. qr.js is qrcode-generator 2.0.4 by Kazuhiko Arase (MIT), vendored so
# the page loads nothing from the internet.
FROM python:3.12-alpine3.22

LABEL org.opencontainers.image.title="Zecky Rock it status" \
      org.opencontainers.image.description="Status and connection page for Zecky Rock it" \
      org.opencontainers.image.source="https://github.com/zeckyapp/rock-it" \
      org.opencontainers.image.licenses="Apache-2.0"

# openssl makes the Rock's own HTTPS certificate on first start.
RUN apk add --no-cache openssl

WORKDIR /app
COPY server.py index.html icon.svg qr.js ./

USER 1000:1000
EXPOSE 8080 8139
ENV PYTHONUNBUFFERED=1
CMD ["python", "/app/server.py"]
