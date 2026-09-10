# Build only from ops/osrm, never send repository credentials in the context.
ARG OSRM_IMAGE=ghcr.io/project-osrm/osrm-backend:v5.27.1@sha256:855614a38f464b0558a2ad6eaa7cb8c139f39887da9b38b485ce453c6e6e6124
FROM ${OSRM_IMAGE} AS prepare
USER root
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl osmium-tool && rm -rf /var/lib/apt/lists/*
# Bump MAP_REVISION deliberately when refreshing source data (Docker cache key).
ARG MAP_REVISION=2026-09-10
ARG MAP_URL=https://download.geofabrik.de/asia/israel-and-palestine-latest.osm.pbf
ARG REGION_BBOX=34.8,31.15,35.4,31.8
WORKDIR /data
RUN test -n "$MAP_REVISION" && curl --fail --location --retry 3 --proto '=https' "$MAP_URL" -o source.osm.pbf \
    && osmium extract --bbox="$REGION_BBOX" --strategy=complete_ways source.osm.pbf -o samou.osm.pbf \
    && sha256sum source.osm.pbf samou.osm.pbf > map-sha256.txt \
    && printf 'revision=%s\nsource=%s\nbbox=%s\n' "$MAP_REVISION" "$MAP_URL" "$REGION_BBOX" > map-source.txt \
    && osrm-extract --threads 2 -p /opt/car.lua samou.osm.pbf \
    && osrm-partition --threads 2 samou.osrm \
    && osrm-customize --threads 2 samou.osrm \
    && rm source.osm.pbf samou.osm.pbf

FROM ${OSRM_IMAGE}
USER root
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=prepare /data /data
USER 10001:10001
EXPOSE 5000
HEALTHCHECK --interval=30s --timeout=4s --start-period=30s --retries=3 \
    CMD curl --fail --silent 'http://127.0.0.1:5000/nearest/v1/driving/35.0661,31.3967?number=1' > /dev/null || exit 1
ENTRYPOINT ["osrm-routed"]
CMD ["--algorithm", "mld", "--ip", "0.0.0.0", "--port", "5000", "--threads", "2", "--max-viaroute-size", "3", "/data/samou.osrm"]
