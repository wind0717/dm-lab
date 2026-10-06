#!/bin/bash
# 数据挖掘实验教学平台 · 局域网共享启动器
# 双击本文件即可把平台共享给同一 Wi-Fi / 网段里的其他电脑（如教室里的学生机）
cd "$(dirname "$0")"

# 如果 dist 不存在或源码比 dist 新，先重新构建
if [ ! -d "dist" ] || [ "src" -nt "dist" ]; then
  echo "正在构建最新版本（npm run build）..."
  npm run build || { echo "构建失败，请检查"; read -r; exit 1; }
fi

# macOS 首次运行可能弹出"是否允许 node 接受传入连接"——请选择"允许"
node lan-server.cjs 8080
