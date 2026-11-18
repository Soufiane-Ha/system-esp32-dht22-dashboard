// ===================================================================
// HTTP Web Server for IoT Dashboard
// خادم ويب مدمج لتشغيل وعرض لوحة التحكم في المتصفح أو على حاسوب آخر
// ===================================================================

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const config = require('./config');

const PORT = config.webServer.port || 3000;
const DASHBOARD_DIR = path.join(__dirname, 'dashboard');
const DATA_DIR = path.join(__dirname, 'data');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

const server = http.createServer((req, res) => {
  // 1. واجهة برمجة التطبيقات لجلب السجل التاريخي (REST API)
  if (req.url === '/api/history') {
    const historyFile = path.join(DATA_DIR, 'telemetry_history.json');
    if (fs.existsSync(historyFile)) {
      const data = fs.readFileSync(historyFile, 'utf8');
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      return res.end(data);
    } else {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      return res.end('[]');
    }
  }

  // 2. خدمة الملفات الثابتة الخاصة بالـ Dashboard
  let safePath = path.normalize(decodeURI(req.url)).replace(/^(\.\.[\/\\])+/, '');
  if (safePath === '/' || safePath === '\\') {
    safePath = '/index.html';
  }

  const filePath = path.join(DASHBOARD_DIR, safePath);
  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('404 Not Found');
      } else {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end(`500 Server Error: ${err.code}`);
      }
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
    }
  });
});

// العثور على عناوين IP المحلية لعرضها
function getLocalIpAddresses() {
  const interfaces = os.networkInterfaces();
  const addresses = [];
  for (const name of Object.keys(interfaces)) {
    for (const net of interfaces[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        addresses.push(net.address);
      }
    }
  }
  return addresses;
}

server.listen(PORT, () => {
  const ips = getLocalIpAddresses();
  console.log('\x1b[32m%s\x1b[0m', '======================================================');
  console.log('\x1b[32m%s\x1b[0m', `   [WEB DASHBOARD SERVER] Running on Port ${PORT}`);
  console.log('\x1b[32m%s\x1b[0m', '======================================================');
  console.log(`Open on this computer: \x1b[36mhttp://localhost:${PORT}\x1b[0m`);
  
  if (ips.length > 0) {
    console.log(`Or open from another PC / Phone on the same Wi-Fi:`);
    ips.forEach(ip => {
      console.log(` -> \x1b[33mhttp://${ip}:${PORT}\x1b[0m`);
    });
  }
  console.log('======================================================\n');
});

// إغلاق نظيف
process.on('SIGINT', () => {
  server.close(() => process.exit(0));
});

