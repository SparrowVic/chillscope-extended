# syntax=docker/dockerfile:1.7@sha256:a57df69d0ea827fb7266491f2813635de6f17269be881f696fbfdf2d83dda33e

FROM node:24.18.0-bookworm-slim@sha256:6f7b03f7c2c8e2e784dcf9295400527b9b1270fd37b7e9a7285cf83b6951452d AS build

WORKDIR /workspace

ENV CI=true \
    YARN_CACHE_FOLDER=/yarn-cache

RUN test "$(node --version)" = "v24.18.0" \
    && test "$(yarn --version)" = "1.22.22"

COPY package.json yarn.lock .npmrc ./
COPY chart/package.json chart/yarn.lock ./chart/

# The root link dependency needs chart/ to exist, but its sources can stay out of this cached layer.
# The actual two-stage chart -> Angular build runs after the complete source tree is copied.
RUN --mount=type=cache,target=/yarn-cache \
    yarn install --frozen-lockfile --ignore-scripts --non-interactive \
    && yarn --cwd chart install --frozen-lockfile --non-interactive

COPY angular.json ngsw-config.json tsconfig.app.json tsconfig.json ./
COPY public ./public/
COPY src ./src/
COPY chart ./chart/

RUN yarn build

FROM nginxinc/nginx-unprivileged:1.30.4-alpine-slim@sha256:e88d990b349df8cf4aa82f16642d7a23375016638c9ace4e5c6ca25028e62e65 AS runtime

COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build --chown=101:101 /workspace/dist/chillscope/browser/ /usr/share/nginx/html/

USER 101:101

EXPOSE 8080

HEALTHCHECK --interval=5s --timeout=2s --start-period=2s --retries=3 \
  CMD ["wget", "-q", "-T", "2", "-O", "/dev/null", "http://127.0.0.1:8080/index.html"]

STOPSIGNAL SIGQUIT
