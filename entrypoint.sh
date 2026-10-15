#!/bin/sh
set -e

DATA_DIRECTORY="${DATA_DIR:-/app/data}"

# Đảm bảo thư mục dữ liệu tồn tại
mkdir -p "$DATA_DIRECTORY"

# Nếu container chạy với quyền root (mặc định của Docker daemon khi bind mount)
if [ "$(id -u)" = "0" ]; then
  PUID="${PUID:-1000}"
  PGID="${PGID:-1000}"

  # Cập nhật GID/UID của user node nếu được chỉ định PUID/PGID khác 1000
  if [ "$PGID" != "1000" ] && [ -n "$PGID" ]; then
    groupmod -o -g "$PGID" node 2>/dev/null || true
  fi
  if [ "$PUID" != "1000" ] && [ -n "$PUID" ]; then
    usermod -o -u "$PUID" -g "${PGID:-1000}" node 2>/dev/null || true
  fi

  # Tự động cấp quyền sở hữu và ghi cho thư mục volume dữ liệu
  chown -R "$PUID:${PGID:-$PUID}" "$DATA_DIRECTORY" 2>/dev/null || true
  chmod -R 775 "$DATA_DIRECTORY" 2>/dev/null || true

  # Chạy ứng dụng dưới quyền user node không đặc quyền (Non-root an toàn)
  exec su-exec "$PUID:${PGID:-$PUID}" "$@"
else
  # Nếu container đã được chỉ định chạy với user khác từ Docker
  exec "$@"
fi
