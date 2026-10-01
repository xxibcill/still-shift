# Linux environment for composition baselines (docs/composition-engine-plan.md, CE0).
# The Playwright image supplies Chromium 151.0.7922.34 and its system libraries for
# the pinned Playwright 1.62.1; Node and pnpm are installed at the pinned versions.
FROM mcr.microsoft.com/playwright:v1.62.1-noble
ARG TARGETARCH
ARG NODE_VERSION=22.23.1
ARG PNPM_VERSION=10.29.3
RUN set -eux; \
    case "$TARGETARCH" in amd64) node_arch=x64 ;; arm64) node_arch=arm64 ;; *) exit 1 ;; esac; \
    curl -fsSL "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-${node_arch}.tar.gz" \
      | tar -xz -C /opt; \
    ln -s "/opt/node-v${NODE_VERSION}-linux-${node_arch}" /opt/node
ENV PATH=/opt/node/bin:$PATH
# Passage preparation probes audio durations with ffprobe; it does not affect pixels,
# so the distribution package stands in for the pinned FFmpeg 8.0.1.
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare "pnpm@${PNPM_VERSION}" --activate
WORKDIR /repo
