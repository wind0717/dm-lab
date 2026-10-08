# VPS 部署指南（Ubuntu 24.04）

面向自建 VPS 服务器的部署方式。**在开发机上执行脚本**，不需要登录服务器。

---

## 快速开始

```bash
# 1. 本地构建 + 上传 + 配置服务，一步完成
./deploy-vps.sh 1.2.3.4

# 或者指定非 root 用户（脚本内部会自动用 sudo）
./deploy-vps.sh 1.2.3.4 ubuntu

# 端口默认 8080，需要改的话：
DM_LAB_PORT=9000 ./deploy-vps.sh 1.2.3.4
```

部署完成后访问 `http://1.2.3.4:8080/`。

---

## 前置条件

### VPS 侧

| 项 | 要求 |
|---|---|
| 系统 | Ubuntu 24.04（其他 Debian 系也基本可用） |
| Node.js | 脚本会自动装（Nodesource 官方源，v20 LTS） |
| 磁盘 | 500 MB 足够（产物约 1 MB，主要是 Node 运行时） |
| 内存 | 512 MB 起步（这个服务很轻） |

**不需要**：域名、HTTPS 证书、Nginx、数据库。

### 本地（开发机）

```bash
# rsync：macOS 自带；Ubuntu 用 sudo apt install rsync
command -v rsync || sudo apt install rsync
command -v node   # 需 Node ≥ 20
```

---

## 脚本做了什么

| 步骤 | 动作 |
|---|---|
| 1 | 本地 `npm run build`（没装依赖会自动 `npm ci`） |
| 2 | SSH 连通性检查（连不上会明确提示排查方向） |
| 3 | 服务器装 Node（已有则跳过，版本 ≥20 才用） |
| 4 | rsync 上传到 `/opt/dm-lab/releases/<时间戳>/`，然后软链接 `current` 指向它 |
| 5 | 写 systemd unit、daemon-reload、enable、restart |
| 6 | ufw 已启用时放行端口；**不动防火墙默认策略** |
| 7 | `curl /healthz` 验证，不通就打印最近 30 行日志 |
| 8 | 清理历史版本，只保留最近 3 个（便于回滚） |

**幂等**：重复执行安全，只会更新文件 + 重启服务，不会重复安装 Node 或改防火墙。

---

## 服务器上的文件结构

```
/opt/dm-lab/
├── current -> releases/20261008-231045      # 软链接，systemd 指向这里
└── releases/
    ├── 20261008-231045/
    │   ├── dist/          # 构建产物（带 hash 的文件名）
    │   └── server.cjs     # 生产级静态服务器
    ├── 20261008-220500/
    └── ...
```

**每次部署建一个新目录**，然后切软链接。这样即使新版本有问题，把 `current` 切回旧目录再 `systemctl restart dm-lab` 就回滚了：

```bash
cd /opt/dm-lab/releases
ls -1dt */                      # 看历史版本
ln -sfn /opt/dm-lab/releases/<旧版本> /opt/dm-lab/current
systemctl restart dm-lab
```

---

## 日常运维

```bash
systemctl status dm-lab          # 状态
systemctl restart dm-lab         # 重启（比如切回滚后）
journalctl -u dm-lab -f          # 实时日志
journalctl -u dm-lab -n 100      # 最近 100 行
curl localhost:8080/healthz      # 健康检查，返回 {"status":"ok",...}
```

---

## 生产服务器的取舍

`server.cjs` 是零依赖的单文件 Node 服务器，相比 Nginx 少一层、部署更简单，适合这个纯静态站点。它做了这些：

| 特性 | 效果 |
|---|---|
| **gzip** | JS/CSS 传输量降约 68%（实测 232KB → 74.7KB） |
| **缓存策略** | 带 hash 的资源 `immutable` 永久缓存；`index.html` `no-cache` 保证更新生效 |
| **安全响应头** | nosniff / X-Frame-Options / Referrer-Policy / **CSP** |
| **CSP** | `script-src 'self'` —— 本平台不加载任何外部脚本，所以能开很严的策略 |
| **健康检查** | `/healthz` |
| **优雅退出** | SIGTERM 后等在途请求做完再退（配合 systemd `TimeoutStopSec=10`） |
| **静态索引** | 启动时扫一次 `dist/`，请求直接查 Map，不每次 `stat` |

**已知限制**（本场景都不成问题）：

- **没有 HTTPS**。公网传输是明文的。校园网场景够用，但若长期公开对外，建议前面挂 Nginx/Caddy 终结 TLS。
- **单进程单核**。这是静态文件服务，瓶颈在网络带宽而非 CPU，够撑几千并发。
- **不做日志落盘**。日志走 `journalctl`。若要长期留存，`journalctl` 配置持久化即可。

---

## 需要在云控制台做的事

**脚本碰不到云厂商的安全组**，这一步必须你手动做：

| 厂商 | 位置 |
|---|---|
| 阿里云 ECS | 控制台 → 实例 → 安全组 → 配置规则 → 入方向 → TCP 8080 |
| 腾讯云 CVM | 控制台 → 云服务器 → 安全组 → 添加入站规则 TCP 8080 |
| 华为云 ECS | 控制台 → 云服务器 → 安全组 → 规则 → 入方向 → TCP 8080 |
| AWS EC2 | EC2 → Security Groups → Inbound → Custom TCP 8080 |

脚本会检测这一点并提示：如果服务器自己访问公网 IP 失败，多半就是安全组没放行。

---

## 加 HTTPS（可选）

脚本本身不配证书。如果需要：

### 方案 A：有域名 → Caddy（最省事，自动续期）

```bash
ssh root@1.2.3.4 'bash -s' <<'EOF'
apt-get update && apt-get install -y caddy
# 把平台反代到 Caddy，并自动申请证书
cat > /etc/caddy/Caddyfile <<CADDY
your-domain.com {
    reverse_proxy 127.0.0.1:8080
}
CADDY
systemctl reload caddy
EOF
```

域名需已解析到该服务器 IP。Caddy 会自动申请并续期 Let's Encrypt 证书。

### 方案 B：不想装代理 → 云厂商负载均衡

阿里云 SLB / 腾讯云 CLB 也能挂 HTTPS 证书，后端指向 `1.2.3.4:8080`（走内网更安全）。

---

## 卸载

```bash
systemctl disable --now dm-lab
rm /etc/systemd/system/dm-lab.service
systemctl daemon-reload
rm -rf /opt/dm-lab
```

---

## 排查

| 现象 | 排查 |
|---|---|
| 本地连不上 SSH | 脚本会提示检查 IP、SSH 端口、云安全组 |
| 部署后访问 502 | `journalctl -u dm-lab -n 50` 看是否启动失败（多半是 Node 版本不够） |
| 部署后访问超时 | 云安全组没放行 8080 —— 脚本会提示 |
| `curl /healthz` 通但页面空白 | 浏览器控制台看报错；多半是 dist 没同步完整，重跑一次部署 |
| 更新后学生看到旧版本 | 强制刷新（Ctrl/Cmd+Shift+R）。`index.html` 已设 `no-cache`，正常不会缓存 |
| 内存占用高 | 不应发生。若发生看 `journalctl -u dm-lab | grep -i memory` |