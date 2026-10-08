#!/usr/bin/env bash
# ============================================================
# 数据挖掘实验教学平台 —— VPS 一键部署脚本（Ubuntu 24.04）
# ============================================================
#
# 用法（在开发机上执行，不是服务器上）：
#   ./deploy-vps.sh <VPS地址> [SSH用户]
#
# 例：
#   ./deploy-vps.sh 1.2.3.4              # 默认用户 root
#   ./deploy-vps.sh 1.2.3.4 ubuntu
#
# 脚本会做这些事：
#   1. 本地执行 npm run build（没装依赖会自动 npm ci）
#   2. rsync 上传 dist/ + server.cjs 到服务器 /opt/dm-lab
#   3. 服务器上安装 Node（若缺失）、建 systemd 服务、开防火墙
#   4. 启动服务并做健康检查
#
# 幂等：可重复执行，重复执行只会更新文件并重启服务
#
# 不做什么（重要）：
#   × 不碰服务器的 SSH 配置
#   × 不修改已有 Nginx / Apache 配置
#   × 不改防火墙默认策略，只在 ufw 已启用时放行端口
# ============================================================

set -euo pipefail

# ---------- 可配置项 ----------
APP_NAME="dm-lab"
REMOTE_DIR="/opt/dm-lab"
SERVICE_NAME="dm-lab"
PORT="${DM_LAB_PORT:-8080}"
NODE_MAJOR="20"
KEEP_RELEASES=3          # 保留最近几个版本的 dist（便于回滚）
# --------------------------

# ---------- 颜色输出 ----------
if [ -t 1 ]; then
  R='\033[0;31m'; G='\033[0;32m'; Y='\033[0;33m'; B='\033[0;34m'; N='\033[0m'
else
  R=''; G=''; Y=''; B=''; N=''
fi
step() { echo -e "${B}==>${N} $*"; }
ok()   { echo -e "  ${G}✓${N} $*"; }
warn() { echo -e "  ${Y}!${N} $*"; }
die()  { echo -e "  ${R}✗${N} $*" >&2; exit 1; }

# ---------- 参数校验 ----------
if [ $# -lt 1 ]; then
  echo "用法: $0 <VPS地址> [SSH用户]"
  echo "例:  $0 1.2.3.4  或  $0 1.2.3.4 ubuntu"
  exit 1
fi

VPS_HOST="$1"
SSH_USER="${2:-root}"
SSH_TARGET="${SSH_USER}@${VPS_HOST}"

echo ""
echo -e "${B}╔══════════════════════════════════════════════╗${N}"
echo -e "${B}║   数据挖掘实验教学平台 · VPS 一键部署${N}      ${B}║${N}"
echo -e "${B}╚══════════════════════════════════════════════╝${N}"
echo ""
echo "  目标服务器 : ${SSH_TARGET}"
echo "  部署目录   : ${REMOTE_DIR}"
echo "  服务端口   : ${PORT}"
echo "  Node 版本  : ${NODE_MAJOR}.x"
echo ""

# ---------- 前置检查 ----------
step "检查本地依赖"

command -v node >/dev/null 2>&1 || die "未找到 node，请先安装 Node.js ≥ ${NODE_MAJOR}"
command -v npm  >/dev/null 2>&1 || die "未找到 npm"
command -v rsync >/dev/null 2>&1 || die "未找到 rsync（macOS 自带；Ubuntu 用 sudo apt install rsync）"

LOCAL_NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$LOCAL_NODE_MAJOR" -lt 20 ]; then
  die "本地 Node 版本过低（$(node -v)），需要 ≥ ${NODE_MAJOR}"
fi
ok "Node $(node -v)、npm、rsync 就绪"

# ---------- 1. 本地构建 ----------
step "本地构建（npm run build）"

if [ ! -d node_modules ]; then
  warn "未找到 node_modules，先执行 npm ci…"
  npm ci
fi

npm run build

[ -f dist/index.html ] || die "构建失败：未生成 dist/index.html"

DIST_COUNT=$(find dist -type f | wc -l | tr -d ' ')
DIST_SIZE=$(du -sh dist | cut -f1)
ok "构建完成：${DIST_COUNT} 个文件，${DIST_SIZE}"
# -------------------------------------------------------

# ---------- 2. 检查服务器连通性 ----------
step "连接服务器 ${SSH_TARGET}"

if ! ssh -o ConnectTimeout=15 -o StrictHostKeyChecking=accept-new "$SSH_TARGET" 'echo ok' >/dev/null 2>&1; then
  die "无法连接 ${SSH_TARGET}
   请检查：
     · IP / 用户名是否正确
     · SSH 端口（若非 22，用 ssh -p 端口 user@host）
     · 服务器防火墙是否放行你的 SSH 端口
     · 云厂商安全组是否放行你的 SSH 端口"
fi
ok "SSH 连接正常"

# ---------- 3. 服务器环境准备 ----------
step "准备服务器环境"

# 在远端执行的准备脚本
REMOTE_PREP=$(cat <<'PREP'
set -euo pipefail
APP_NAME="dm-app"
REMOTE_DIR="/opt/dm-app"
NODE_MAJOR="20"

# 只在 root 下装软件；非 root 用户交给 sudo
SUDO=""
if [ "$(id -u)" -ne 0 ]; then
  SUDO="sudo"
fi

# --- Node.js ---
if command -v node >/dev/null 2>&1; then
  CUR_MAJOR=$(node -p 'process.versions.node.split(".")[0]')
  if [ "$CUR_MAJOR" -ge "$NODE_MAJOR" ]; then
    echo "NODE_OK=$(node -v)"
  else
    echo "NODE_OLD=$(node -v)"
  fi
else
  echo "NODE_MISSING=1"
fi
echo "SUDO=$SUDO"
PREP
)

PREP_RESULT=$(ssh "$SSH_TARGET" 'bash -s' <<<"$REMOTE_PREP")

SUDO=$(echo "$PREP_RESULT" | sed -n 's/^SUDO=//p')

if echo "$PREP_RESULT" | grep -q '^NODE_MISSING=1$\|^NODE_OLD='; then
  warn "服务器缺少 Node ≥ ${NODE_MAJOR}，开始安装…"

  # Ubuntu 24.04 用 Nodesource 官方源（比 apt 里的版本新）
  ssh "$SSH_TARGET" "bash -s" <<'INSTALL'
set -euo pipefail
SUDO=""
if [ "$(id -u)" -ne 0 ]; then SUDO="sudo"; fi

$SUDO apt-get update -qq
$SUDO apt-get install -y -qq curl ca-certificates >/dev/null

# 先移除可能冲突的旧源
$SUDO rm -f /etc/apt/sources.list.d/nodesource.list 2>/dev/null || true

curl -fsSL https://deb.nodesource.com/setup_20.x | $SUDO -E bash - >/dev/null 2>&1
$SUDO apt-get install -y -qq nodejs >/dev/null

echo "NODE_INSTALLED=$(node -v)"
INSTALL

  ok "Node 安装完成"
else
  ok "服务器已有 $(echo "$PREP_RESULT" | sed -n 's/^NODE_OK=//p')"
fi

# ---------- 4. 上传文件 ----------
step "上传构建产物"

ssh "$SSH_TARGET" "mkdir -p ${REMOTE_DIR}"

# 带时间戳的发布目录 → 便于回滚
RELEASE_ID="$(date +%Y%m%d-%H%M%S)"
RELEASE_DIR="${REMOTE_DIR}/releases/${RELEASE_ID}"

ssh "$SSH_TARGET" "mkdir -p '${RELEASE_DIR}/dist'"

info "同步 dist/ → ${RELEASE_DIR}/dist/"
rsync -az --delete \
      --exclude '.DS_Store' \
      dist/ "${SSH_TARGET}:${RELEASE_DIR}/dist/"

info "同步 server.cjs"
scp -q server.cjs "${SSH_TARGET}:${RELEASE_DIR}/server.cjs"

# 切换软链接 current → 本次发布
ssh "$SSH_TARGET" "ln -sfn '${RELEASE_DIR}' '${REMOTE_DIR}/current'"

UPLOADED=$(ssh "$SSH_TARGET" "find '${RELEASE_DIR}/dist' -type f | wc -l | tr -d ' '")
ok "已上传 ${UPLOADED} 个文件（发布版本 ${RELEASE_ID}）"

# ---------- 5. systemd 服务 ----------
step "配置 systemd 服务"

ssh "$SSH_TARGET" "bash -s" <<SYSTEMD
set -euo pipefail
# 需要 root 权限时用这个：root 下执行原命令，非 root 下加 sudo 前缀
as_root() {
  if [ "$(id -u)" -eq 0 ]; then
    "$@"
  else
    sudo "$@"
  fi
}

as_root tee /etc/systemd/system/${SERVICE_NAME}.service > /dev/null <<'UNIT'
[Unit]
Description=数据挖掘实验教学平台（静态站点服务）
Documentation=https://github.com/wind0717/dm-lab
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
# 用 current 软链接指向具体发布目录，重启即切换版本
WorkingDirectory=/opt/dm-lab/current
ExecStart=/usr/bin/env node /opt/dm-lab/current/server.cjs ${PORT}
Environment=PORT=${PORT}
Environment=NODE_ENV=production

# 自动重启：崩溃/OOM 都能拉起
Restart=always
RestartSec=3
# 短时间内重启过于频繁就停下来，避免刷日志
StartLimitBurst=5
StartLimitIntervalSec=60

# 优雅退出：server.cjs 处理 SIGTERM，等它把在途请求做完
KillSignal=SIGTERM
TimeoutStopSec=10

# 日志
StandardOutput=journal
StandardError=journal
SyslogIdentifier=${SERVICE_NAME}

# ---- 安全加固 ----
# 说明：不降权到 nobody —— 站点文件在 /opt/dm-lab 下，
# 若用低权限用户运行需要额外 chmod 目录，容易在首次部署时踩权限坑。
# 这里改为「以root 运行但锁死一切写操作与内核接口」，
# 对一个只读静态站点来说安全性已足够，且部署行为更可预期。
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ProtectKernelTunables=true
ProtectKernelModules=true
ProtectControlGroups=true
RestrictAddressFamilies=AF_INET AF_INET6 AF_UNIX
RestrictNamespaces=true
LockPersonality=true
MemoryDenyWriteExecute=false
# 允许写的地方只有日志目录（journald 不需要文件写，给 /tmp 兜底）
ReadWritePaths=/tmp

[Install]
WantedBy=multi-user.target
UNIT

as_root systemctl daemon-reload
as_root systemctl enable ${SERVICE_NAME}. > /dev/null
as_root systemctl restart ${SERVICE_NAME}
SYSTEMD

ok "systemd 服务已配置并启动"

# ---------- 6. 防火墙 ----------
step "配置防火墙"

FW_RESULT=$(ssh "$SSH_TARGET" "bash -s" <<'FW'
set -euo pipefail
if ! command -v ufw >/dev/null 2>&1; then
  echo "UFW_MISSING"
  exit 0
fi
if ! ufw status 2>/dev/null | grep -q "Status: active"; then
  echo "UFW_INACTIVE"
  exit 0
fi
# 已启用 → 放行端口
if ufw status | grep -q "${PORT}/tcp"; then
  echo "UFW_ALREADY"
else
  ufw allow ${PORT}/tcp comment "dm-lab" >/dev/null
  echo "UFW_ADDED"
fi
FW
)

case "$FW_RESULT" in
  UFW_MISSING)
    warn "未安装 ufw，跳过（若用其他防火墙请手动放行 ${PORT}/tcp）" ;;
  UFW_INACTIVE)
    warn "ufw 未启用，未改规则。若要启用：ufw enable && ufw allow ${PORT}/tcp" ;;
  UFW_ALREADY)
    ok "ufw 已放行 ${PORT}/tcp" ;;
  UFW_ADDED)
    ok "ufw 已放行 ${PORT}/tcp" ;;
  *)
    warn "防火墙配置返回未知结果：${FW_RESULT}" ;;
esac

# 云厂商安全组提醒
echo -e "  ${Y}!${N} 若服务器有云厂商安全组（阿里云/腾讯云/华为云等），"
echo -e "    记得在控制台放行入方向 TCP ${PORT}"

# ---------- 7. 验证 ----------
step "验证服务"

sleep 2

HEALTH=$(ssh "$SSH_TARGET" "curl -fsS --max-time 8 http://127.0.0.1:${PORT}/healthz" 2>/dev/null || echo "")

if [ -z "$HEALTH" ]; then
  warn "健康检查未响应，查看服务日志："
  ssh "$SSH_TARGET" "journalctl -u ${SERVICE_NAME} -n 30 --no-pager"
  die "部署失败：服务未正常响应"
fi

ok "健康检查通过：${HEALTH}"

STATUS=$(ssh "$SSH_TARGET" "systemctl is-active ${SERVICE_NAME}")
ENABLED=$(ssh "$SSH_TARGET" "systemctl is-enabled ${SERVICE_NAME}" 2>/dev/null || echo "disabled")

if [ "$STATUS" = "active" ]; then
  ok "服务状态：active（已运行）"
else
  die "服务状态异常：${STATUS}"
fi
ok "开机自启：${ENABLED}"

# ---------- 8. 清理旧版本 ----------
step "清理历史版本（保留最近 ${KEEP_RELEASES} 个）"
ssh "$SSH_TARGET" "bash -s" <<CLEAN
set -euo pipefail
cd ${REMOTE_DIR}/releases
# 按时间倒序，保留最近 ${KEEP_RELEASES} 个，其余删除
ls -1dt */ 2>/dev/null | tail -n +$(( ${KEEP_RELEASES} + 1 )) | while read -r d; do
  rm -rf "\${d%/}"
  echo "  已删除旧版本 \${d%/}"
done
CLEAN
ok "清理完成"
# -------------------------------------------------------

# ---------- 9. 外网可达性 ----------
echo ""
step "检查外网可达性"

LOCAL_IP=$(curl -s --max-time 8 https://api.ipify.org 2>/dev/null || echo "")

EXTERNAL=$(ssh "$SSH_TARGET" "curl -fsS --max-time 8 -o /dev/null -w '%{http_code}' http://${LOCAL_IP:-127.0.0.1}:${PORT}/ 2>/dev/null || echo '000'")

if [ "$EXTERNAL" = "200" ]; then
  ok "从服务器访问公网 IP 成功（${LOCAL_IP}:${PORT}）"
else
  warn "服务器自己访问 ${LOCAL_IP}:${PORT} 返回 ${EXTERNAL}"
  warn "通常是云安全组未放行 ${PORT}/tcp，请在控制台配置"
fi

# ---------- 完成 ----------
echo ""
echo -e "${G}╔══════════════════════════════════════════════╗${N}"
echo -e "${G}║  ✅ 部署完成${N}"
echo -e "${G}╚══════════════════════════════════════════════╝${N}"
echo ""
echo "  访问地址:"
echo -e "    ${G}http://${VPS_HOST}:${PORT}/${N}"
if [ -n "$LOCAL_IP" ] && [ "$LOCAL_IP" != "$VPS_HOST" ]; then
echo -e "    ${G}http://${LOCAL_IP}:${PORT}/${N}  ${Y}(服务器公网 IP)${N}"
fi
echo ""
echo "  发给学生的深链示例:"
echo "    http://${VPS_HOST}:${PORT}/#/tree/svm"
echo "    http://${VPS_HOST}:${PORT}/#/cluster/dbscan"
echo "    http://${VPS_HOST}:${PORT}/#/tree/xgb"
echo ""
echo "  常用运维命令（在服务器上执行）:"
echo "    systemctl status ${SERVICE_NAME}      # 查看状态"
echo "    systemctl restart ${SERVICE_NAME}     # 重启"
echo "    journalctl -u ${SERVICE_NAME} -f       # 实时日志"
echo "    curl localhost:${PORT}/healthz         # 健康检查"
echo ""
echo "  更新版本：重新执行 $0 ${VPS_HOST} ${SSH_USER}"
echo ""