# 1단계: 정적 파일로 빌드 (tsc 타입체크 + vite build)
FROM node:18-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# 2단계: nginx로 정적 파일을 서빙하고, /api는 백엔드로 리버스 프록시
FROM nginx:1.27-alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
