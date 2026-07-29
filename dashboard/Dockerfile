FROM node:20-alpine AS build
WORKDIR /app/dashboard
COPY dashboard/package*.json ./
RUN npm ci
COPY dashboard ./
ARG VITE_OFFLINE_MODE=false
ARG VITE_AUTH_ENABLED=false
ARG VITE_AUTH_TENANT_ID=
ARG VITE_AUTH_CLIENT_ID=
ENV VITE_OFFLINE_MODE=$VITE_OFFLINE_MODE
ENV VITE_AUTH_ENABLED=$VITE_AUTH_ENABLED
ENV VITE_AUTH_TENANT_ID=$VITE_AUTH_TENANT_ID
ENV VITE_AUTH_CLIENT_ID=$VITE_AUTH_CLIENT_ID
RUN npm run build

FROM nginx:1.27-alpine
COPY --from=build /app/dashboard/dist /usr/share/nginx/html
COPY dashboard/nginx.conf /etc/nginx/conf.d/default.conf
