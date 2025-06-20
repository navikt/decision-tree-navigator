FROM nginx:alpine

COPY index.html /usr/share/nginx/html/index.html
COPY tree.html /usr/share/nginx/html/tree.html

COPY data /usr/share/nginx/html/data
COPY images /usr/share/nginx/html/images
COPY styles /usr/share/nginx/html/styles

COPY scripts /usr/share/nginx/html/scripts

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
