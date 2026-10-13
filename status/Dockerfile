# Rock it status page: a small Python web server, standard library only.
FROM python:3.12-alpine3.22

LABEL org.opencontainers.image.title="Zecky Rock it status" \
      org.opencontainers.image.description="Status and connection page for Zecky Rock it" \
      org.opencontainers.image.source="https://github.com/zeckyapp/rock-it" \
      org.opencontainers.image.licenses="Apache-2.0"

WORKDIR /app
COPY server.py index.html icon.svg ./

USER 1000:1000
EXPOSE 8080
ENV PYTHONUNBUFFERED=1
CMD ["python", "/app/server.py"]
