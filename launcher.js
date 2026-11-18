// ===================================================================
// IoT System All-in-One Orchestrator & Launcher
// مشغل النظام الشامل - يقوم بتشغيل كافة المكونات بالتوازي في سطر الأوامر
// ===================================================================

const { spawn } = require('child_process');
const path = require('path');

console.log('\x1b[36m%s\x1b[0m', '==============================================================');
console.log('\x1b[36m%s\x1b[0m', '  🚀 تشغيل منظومة إنترنت الأشياء المتكاملة (IoT Full Stack)   ');
console.log('\x1b[36m%s\x1b[0m', '  [ESP32 Node] -> [MQTT Broker] -> [Edge Gateway] -> [Dashboard] ');
console.log('\x1b[36m%s\x1b[0m', '==============================================================\n');

const services = [
  {
    name: 'BROKER',
    color: '\x1b[35m', // Magenta
    file: path.join(__dirname, 'broker', 'broker.js'),
    delay: 0
  },
  {
    name: 'SERVER',
    color: '\x1b[36m', // Cyan
    file: path.join(__dirname, 'server.js'),
    delay: 500
  },
  {
    name: 'GATEWAY',
    color: '\x1b[32m', // Green
    file: path.join(__dirname, 'gateway_receiver', 'receiver_gateway.js'),
    delay: 1500
  },
  {
    name: 'ESP32_SIM',
    color: '\x1b[33m', // Yellow
    file: path.join(__dirname, 'simulator', 'esp32_simulator.js'),
    delay: 2500
  }
];

const processes = [];

services.forEach(svc => {
  setTimeout(() => {
    console.log(`${svc.color}▶ Starting [${svc.name}]...\x1b[0m`);
    const proc = spawn('node', [svc.file], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: process.env
    });

    proc.stdout.on('data', (data) => {
      const lines = data.toString().trim().split('\n');
      lines.forEach(line => {
        if (line.trim()) {
          console.log(`${svc.color}[${svc.name}]\x1b[0m ${line}`);
        }
      });
    });

    proc.stderr.on('data', (data) => {
      console.error(`\x1b[31m[${svc.name} ERR]\x1b[0m ${data.toString().trim()}`);
    });

    proc.on('close', (code) => {
      console.log(`\x1b[90m[${svc.name}] Process exited with code ${code}\x1b[0m`);
    });

    processes.push(proc);
  }, svc.delay);
});

// فتح المتصفح تلقائياً بعد 3 ثوانٍ
setTimeout(() => {
  console.log('\n\x1b[32m%s\x1b[0m', '✔ كافة الخدمات تعمل الآن بنجاح!');
  console.log('🔗 لوحة التحكم جاهزة على: \x1b[36mhttp://localhost:3000\x1b[0m\n');
  
  // محاولة فتح المتصفح على نظام ويندوز
  try {
    const { exec } = require('child_process');
    exec('start http://localhost:3000');
  } catch (e) {}
}, 3200);

// معالجة إيقاف جميع العمليات معاً
function cleanup() {
  console.log('\n\x1b[31mإيقاف كافة خدمات إنترنت الأشياء...\x1b[0m');
  processes.forEach(p => {
    try { p.kill(); } catch (e) {}
  });
  process.exit(0);
}

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);

