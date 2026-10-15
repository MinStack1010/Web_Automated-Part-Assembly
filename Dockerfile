# ---- Build stage ----
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# ---- Serve stage ----
FROM nginx:1.27-alpine
RUN rm -f /etc/nginx/conf.d/default.conf
COPY nginx.conf /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html

# Hostname of the FastAPI backend on Cloud Run.
# /backend/* requests are proxied there (prefix stripped), same as the Vite dev proxy.
ENV BACKEND_HOST=automated-part-assembly-911218714377.asia-southeast1.run.app

EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]
