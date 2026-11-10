# The DTV analytics server: the Haskell server, Node for its sidecar, the store's schema and
# Hasura metadata, and the app. Built from packages/dtv-analytics after `npm run build`, which
# makes dist/sidecar.mjs (and dist/app).
#
#   docker build -f docker/Dockerfile -t dtv-analytics-server .

FROM haskell:9.10.3-slim-bookworm AS build
RUN apt-get update && apt-get install -y --no-install-recommends libpq-dev && rm -rf /var/lib/apt/lists/*
WORKDIR /build
RUN cabal update
# Dependencies first, so that a change to the sources does not build them again
COPY server/dtv-analytics-server.cabal server/cabal.project ./
RUN cabal build --only-dependencies lib:dtv-analytics-server
COPY server/ ./
RUN cabal install exe:dtv-analytics-server --installdir=/out --install-method=copy

FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends libpq5 libgmp10 ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV LANG=C.UTF-8
COPY --from=build /out/dtv-analytics-server /usr/local/bin/
COPY store/ ./store/
COPY dist/sidecar.mjs ./sidecar.mjs
COPY dist/app/ ./public/
EXPOSE 8090
ENTRYPOINT ["dtv-analytics-server"]
# The CLI names the configuration of the source it runs
CMD ["/dtv-analytics/config.json"]
