# Pollius worker image: Node + pnpm + the Sui CLI (the Hermes agent shells out to `sui`).
FROM node:22-bookworm-slim

# --- Sui CLI (prebuilt release binary) ---
# Bump SUI_VERSION to a current release tag from https://github.com/MystenLabs/sui/releases
ARG SUI_VERSION=testnet-v1.39.3
RUN apt-get update \
 && apt-get install -y --no-install-recommends curl ca-certificates tar \
 && curl -fsSL -o /tmp/sui.tgz \
    "https://github.com/MystenLabs/sui/releases/download/${SUI_VERSION}/sui-${SUI_VERSION}-ubuntu-x86_64.tgz" \
 && tar -xzf /tmp/sui.tgz -C /usr/local/bin sui \
 && rm /tmp/sui.tgz \
 && apt-get purge -y curl \
 && apt-get autoremove -y \
 && rm -rf /var/lib/apt/lists/*

# --- pnpm via corepack ---
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .

# Long-lived worker: the resident scheduler. Override cadence via Railway env vars
# (HEARTBEAT_CRON, HEARTBEAT_MAX_CYCLES=0 to run forever).
CMD ["pnpm", "start"]
