// ===================================================================
// Local MQTT Broker (Aedes)
// خادم البروكر المحلي (يدعم بروتوكول TCP للـ ESP32 و WebSocket للمتصفح)
// ===================================================================

const net = require('net');
const http = require('http');
const { WebSocketServer, createWebSocketStream } = require('ws');
const { Aedes } = require('aedes');
const config = require('../config');

async function startBroker() {

  const aedes = await Aedes.createBroker();

  const tcpPort = config.localBroker.tcpPort;
  const wsPort = config.localBroker.wsPort;

  const tcpServer = net.createServer(aedes.handle.bind(aedes));

  tcpServer.listen(tcpPort, '0.0.0.0', () => {
    console.log('\x1b[32m%s\x1b[0m', `======================================================`);
    console.log('\x1b[32m%s\x1b[0m', ` [MQTT BROKER] Running TCP on 0.0.0.0:${tcpPort}`);
    console.log('\x1b[32m%s\x1b[0m', ` -> ESP32 & Node.js clients can connect here`);
    console.log('\x1b[32m%s\x1b[0m', `======================================================`);
  });

  const wsHttpServer = http.createServer();
  const wss = new WebSocketServer({ server: wsHttpServer });

  wss.on('connection', (ws) => {
    const stream = createWebSocketStream(ws);
    aedes.handle(stream);
  });

  wsHttpServer.listen(wsPort, '0.0.0.0', () => {
    console.log('\x1b[36m%s\x1b[0m', ` [MQTT BROKER] Running WebSocket on ws://0.0.0.0:${wsPort}`);
    console.log('\x1b[36m%s\x1b[0m', ` -> Web Browsers (Dashboard) can connect here`);
    console.log('\x1b[36m%s\x1b[0m', `======================================================\n`);
  });

  aedes.on('client', (client) => {
    console.log(`\x1b[34m[+ Client Connected]\x1b[0m ID: ${client.id}`);
  });

  aedes.on('clientDisconnect', (client) => {
    console.log(`\x1b[33m[- Client Disconnected]\x1b[0m ID: ${client.id}`);
  });

  aedes.on('subscribe', (subscriptions, client) => {
    const topics = subscriptions.map(s => s.topic).join(', ');
    console.log(`\x1b[35m[Subscription]\x1b[0m Client '${client.id}' subscribed to: [${topics}]`);
  });

  aedes.on('publish', (packet, client) => {
    if (packet.topic.startsWith('$SYS')) return;

    const sender = client ? client.id : 'Broker/Internal';
    const payloadStr = packet.payload ? packet.payload.toString() : '';
    const shortPayload = payloadStr.length > 80 ? payloadStr.substring(0, 80) + '...' : payloadStr;

    console.log(`\x1b[90m[Traffic]\x1b[0m Topic: \x1b[33m${packet.topic}\x1b[0m | From: \x1b[36m${sender}\x1b[0m | Data: ${shortPayload}`);
  });

  // معالجة الإغلاق النظيف
  process.on('SIGINT', () => {
    console.log('\n\x1b[31m[Broker] Shutting down...\x1b[0m');
    tcpServer.close(() => {
      wsHttpServer.close(() => {
        aedes.close(() => {
          console.log('[Broker] Closed successfully.');
          process.exit(0);
        });
      });
    });
  });
}

startBroker().catch(err => {
  console.error('\x1b[31m[Broker Startup Error]\x1b[0m', err);
});
