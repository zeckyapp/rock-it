# Zaino with the Zecky Rock it patches.
#
# Builds for the platform it runs on (arm64 on a Raspberry Pi, amd64 on a PC).
# Upstream: https://github.com/zingolabs/zaino (Apache-2.0, ZingoLabs).
# The build fetches one exact commit and checks it, so it always builds the
# code the patches were made and tested against.

# NU7: Zaino 0.10.2 stops at the last block before NU7 (zingolabs/zaino#1731).
# Until ZingoLabs releases NU7 support, Rock it builds the exact commit of
# their NU7 pull request (zingolabs/zaino#1655, branch feat/nu7), fetched by
# commit so a moved branch cannot change what is built. Move to the official
# release as soon as it is out.
# The branch is for reference only; the commit decides what is built.
ARG ZAINO_REF=feat/nu7
ARG ZAINO_COMMIT=aaf8122a703704e05147d984f08ff82c789860ad

# The digests pin the exact base images; the tags say what they are. To
# update: look up each tag's current digest on Docker Hub and replace both.
FROM docker.io/library/rust:1.98.0-bookworm@sha256:82150a52ec202c1b14d7817e14516c392bb7f5cfebd88f1ed531cb37ebd39922 AS builder
ARG ZAINO_REF
ARG ZAINO_COMMIT
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      pkg-config clang cmake make protobuf-compiler git ca-certificates \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /src
RUN git init -q . \
 && git remote add origin https://github.com/zingolabs/zaino.git \
 && git fetch -q --depth 1 origin "${ZAINO_COMMIT}" \
 && git checkout -q FETCH_HEAD \
 && test "$(git rev-parse HEAD)" = "${ZAINO_COMMIT}"
COPY patches/ /patches/
RUN git apply /patches/*.patch
RUN cargo install --locked --path packages/zainod --bin zainod --root /out

FROM docker.io/library/debian:bookworm-slim@sha256:7c7b2c966bc9ee8cedfeef67e0e279108992c77681fa595db4a9d65c06ccc587
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
