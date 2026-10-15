# ==============================================================================
# SỔ THU CHI - DOCKERFILE
# Multi-platform Lightweight Alpine Node.js Container with Auto Permission Fix
# ==============================================================================

FROM node:22-alpine

LABEL maintainer="So Thu Chi Team"
LABEL description="So Thu Chi - Offline-First Personal Finance & Dedicated Sync Server"

WORKDIR /app

# Cài đặt shadow và su-exec để tự động phân quyền volume theo PUID/PGID của máy chủ host
RUN apk add --no-cache su-exec shadow

# Sao chép package.json
COPY package*.json ./

# Cài đặt dependencies nếu có
RUN if [ -f package.json ] && grep -q '"dependencies"' package.json; then npm install --omit=dev; fi

# Sao chép toàn bộ mã nguồn ứng dụng
COPY . .

# Phân quyền thực thi cho entrypoint và thư mục ứng dụng
RUN chmod +x entrypoint.sh 2>/dev/null || true && \
    mkdir -p /app/data && \
    chown -R node:node /app

# Cổng mặc định
EXPOSE 8081

# Biến môi trường mặc định trong container
ENV NODE_ENV=production \
    PORT=8081 \
    HOST=0.0.0.0 \
    DATA_DIR=/app/data \
    PUID=1000 \
    PGID=1000

# Khối dữ liệu lưu trữ bền vững (Docker Volume)
VOLUME ["/app/data"]

# Kiểm tra tình trạng sức khỏe định kỳ (Healthcheck)
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://localhost:' + (process.env.PORT || 8081) + '/api/health').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

# Khởi chạy qua entrypoint để tự động cấp quyền thư mục volume mount và chuyển user an toàn
ENTRYPOINT ["./entrypoint.sh"]
CMD ["node", "server.js"]
