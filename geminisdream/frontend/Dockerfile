FROM node:20-alpine AS build

WORKDIR /app
COPY package*.json ./
# Install deps including tailwind cli
RUN npm install

COPY . .

# MANUALLY BUILD TAILWIND to bypass vite/postcss async bugs
RUN npx tailwindcss -i ./src/index.css -o ./src/style.css -c tailwind.config.cjs

# Now build vite (it will treat style.css as a standard asset)
RUN npm run build

# Serving stage
FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 3000
CMD ["nginx", "-g", "daemon off;"]
