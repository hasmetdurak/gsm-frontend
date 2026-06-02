# GSM Frontend - Statik Nginx image
# Bu imaj sadece 3 statik dosyayi (HTML/CSS/JS) servis eder.
# Backend ile iletisim browser uzerinden API_BASE (window.location.origin) ile yapilir.
# Cross-origin CORS ve cookie yonetimi gsm-backend tarafindan halledilir.

FROM nginx:1.27-alpine

# Nginx default config sil, bizim minimal config'i koy
RUN rm /etc/nginx/conf.d/default.conf
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Frontend dosyalarini Nginx'in default web root'una kopyala
COPY index.html /usr/share/nginx/html/
COPY app.js /usr/share/nginx/html/
COPY index.css /usr/share/nginx/html/

# Nginx default 80 portu
EXPOSE 80

# Nginx zaten CMD ["nginx", "-g", "daemon off;"] ile gelir
CMD ["nginx", "-g", "daemon off;"]
