# Zaino with the Zecky Rock it patches.
#
# Builds for the platform it runs on (arm64 on a Raspberry Pi, amd64 on a PC).
# Upstream: https://github.com/zingolabs/zaino (Apache-2.0, ZingoLabs).
# The build checks that the tag still points at the commit the patches were
# made and tested against, so a moved tag fails the build instead of shipping
# untested code.

ARG ZAINO_TAG=zainod-0.10.2
ARG ZAINO_COMMIT=5ced0ae83df1f873274332dc2e6bc25acb856a62

FROM docker.io/library/rust:1.98.0-bookworm AS builder
ARG ZAINO_TAG
ARG ZAINO_COMMIT
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      pkg-config clang cmake make protobuf-compiler git ca-certificates \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /src
RUN git clone --depth 1 --branch "${ZAINO_TAG}" https://github.com/zingolabs/zaino.git . \
 && test "$(git rev-parse HEAD)" = "${ZAINO_COMMIT}"
COPY patches/ /patches/
RUN git apply /patches/*.patch
RUN cargo install --locked --path packages/zainod --bin zainod --root /out

FROM docker.io/library/debian:bookworm-slim
LABEL org.opencontainers.image.source="https://github.com/zeckyapp/rock-it" \
      org.opencontainers.image.description="Zaino light-wallet server with the Zecky Rock it patches" \
      org.opencontainers.image.licenses="Apache-2.0"
# Zaino's RPC client loads the system root certificates when it starts, even
# for a plain connection to the node, and fails without them.
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates \
 && rm -rf /var/lib/apt/lists/*
# Zaino refuses to run as root.
RUN groupadd --gid 1000 zaino \
 && useradd --uid 1000 --gid 1000 --home-dir /home/zaino --create-home zaino \
 && mkdir -p /app/config /app/data \
 && chown -R 1000:1000 /app
COPY --from=builder /out/bin/zainod /usr/local/bin/zainod
USER 1000:1000
ENV HOME=/home/zaino
EXPOSE 8137
ENTRYPOINT ["zainod"]
CMD ["start", "--config", "/app/config/zainod.toml"]
