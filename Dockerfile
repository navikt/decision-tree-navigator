FROM caddy:alpine

COPY index.html /usr/share/caddy/index.html
COPY tree.html /usr/share/caddy/tree.html

COPY data /usr/share/caddy/data
COPY images /usr/share/caddy/images
COPY styles /usr/share/caddy/styles

COPY scripts /usr/share/caddy/scripts

EXPOSE 80
