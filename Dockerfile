FROM alpine:latest
ENV CADDY_VERSION="2.10.2"

RUN apk add --no-cache curl tar

RUN addgroup -S caddygroup && adduser -S -G caddygroup -u 1069 caddyuser

WORKDIR /srv

RUN curl -L "https://github.com/caddyserver/caddy/releases/download/v${CADDY_VERSION}/caddy_${CADDY_VERSION}_linux_amd64.tar.gz" \
    | tar -xz -C /srv/ caddy && \
    chmod +x /srv/caddy && \
    chown caddyuser:caddygroup /srv/caddy

RUN chown -R caddyuser:caddygroup /srv

COPY index.html /srv/
COPY tree.html /srv/
COPY data /srv/data
COPY images /srv/images
COPY scripts /srv/scripts
COPY styles /srv/styles

RUN echo -e ':8080\nroot * /srv\nfile_server' > /srv/Caddyfile

EXPOSE 8080
USER caddyuser

CMD ["/srv/caddy", "run", "--config", "/srv/Caddyfile"]
