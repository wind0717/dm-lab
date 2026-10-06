// 局域网共享服务器：把 dist/ 静态站点共享给同一 Wi-Fi/网段里的其他电脑
// 用法：node lan-server.cjs [端口]   （默认 8080）
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PORT = parseInt(process.argv[2] || '8080', 10);
const ROOT = path.join(__dirname, 'dist');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.map': 'application/json',
};

if (!fs.existsSync(ROOT)) {
  console.error('❌ 找不到 dist/ 目录，请先在项目目录运行：npm run build');
  process.exit(1);
}

const server = http.createServer((req, res) => {
  let urlPath = decodeURIComponent(req.url.split('?')[0]);
  if (urlPath === '/') urlPath = '/index.html';
  const filePath = path.join(ROOT, path.normalize(urlPath));
  // 防目录穿越
  if (!filePath.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      // SPA 兜底：其他路径回退到 index.html
      fs.readFile(path.join(ROOT, 'index.html'), (e2, html) => {
        if (e2) { res.writeHead(404); res.end('Not Found'); return; }
        res.writeHead(200, { 'Content-Type': MIME['.html'] });
        res.end(html);
      });
      return;
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream' });
    res.end(data);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  const nets = os.networkInterfaces();
  const ips = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal) ips.push(net.address);
    }
  }
  console.log('');
  console.log('  ✅ 数据挖掘实验教学平台 · 局域网共享已启动');
  console.log('');
  console.log('  本机访问：  http://localhost:' + PORT + '/');
  for (const ip of ips) {
    console.log('  局域网访问：http://' + ip + ':' + PORT + '/   ← 把这个网址发给同一 Wi-Fi 下的学生');
  }
  console.log('');
  console.log('  提示：保持本窗口开着，学生就能一直访问；按 Ctrl+C 停止共享。');
  console.log('');
});
