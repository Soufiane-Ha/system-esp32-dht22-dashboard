// ===================================================================
// ESP32 + DHT22 Virtual Simulator
// جهاز محاكاة لـ ESP32 وحساس DHT22 يرسل بيانات واقعية عبر الـ MQTT
// ===================================================================

const mqtt = require('mqtt');
const config = require('../config');

const useCloud = process.argv.includes('--cloud') || config.brokerMode === 'cloud';
const brokerUrl = useCloud
  ? `mqtt://${config.cloudBroker.host}:${config.cloudBroker.tcpPort}`
  : `mqtt://${config.localBroker.host}:${config.localBroker.tcpPort}`;

console.log('\x1b[36m%s\x1b[0m', '======================================================');
console.log('\x1b[36m%s\x1b[0m', '   ESP32 + DHT22 Virtual Sensor Node');
console.log('\x1b[36m%s\x1b[0m', '======================================================');
console.log(`Connecting to MQTT Broker: \x1b[33m${brokerUrl}\x1b[0m`);

const client = mqtt.connect(brokerUrl, {
  clientId: 'ESP32_DHT22_' + Math.random().toString(16).substring(2, 8),
  clean: true,
  connectTimeout: 5000,
  reconnectPeriod: 3000
});

let currentTemp = 24.5;
let currentHumidity = 55.0;
let forceSpike = null;
let uptimeSeconds = 0;
let messageCount = 0;

client.on('connect', () => {
  console.log('\x1b[32m%s\x1b[0m', `[CONNECTED] ESP32 connected to broker successfully!`);
  console.log(`Target Topic: \x1b[35m${config.topics.rawSensor}\x1b[0m`);
  console.log(`Publishing every ${config.simulator.publishIntervalMs / 1000} seconds...\n`);
  printHelp();

  setInterval(publishTelemetry, config.simulator.publishIntervalMs);
  setInterval(() => { uptimeSeconds += 1; }, 1000);
});

client.on('error', (err) => {
  console.error('\x1b[31m[ERROR]\x1b[0m MQTT Connection error:', err.message);
});

client.on('offline', () => {
  console.log('\x1b[33m[OFFLINE]\x1b[0m Broker is offline, waiting to reconnect...');
});

function publishTelemetry() {
  if (!client.connected) return;

  if (forceSpike === 'heat') {
    currentTemp = +(37.5 + (Math.random() * 2)).toFixed(1);
    currentHumidity = +(35.0 + (Math.random() * 5)).toFixed(1);
  } else if (forceSpike === 'humidity') {
    currentTemp = +(26.0 + (Math.random() * 2)).toFixed(1);
    currentHumidity = +(88.0 + (Math.random() * 4)).toFixed(1);
  } else {
    const deltaTemp = (Math.random() - 0.5) * 0.4;
    const deltaHum = (Math.random() - 0.5) * 0.8;
    currentTemp = Math.min(32, Math.max(18, +(currentTemp + deltaTemp).toFixed(1)));
    currentHumidity = Math.min(80, Math.max(40, +(currentHumidity + deltaHum).toFixed(1)));
  }

  messageCount++;
  const payload = {
    device_id: 'ESP32_DHT22_Node01',
    sensor_model: 'DHT22 / AM2302',
    temperature: currentTemp,
    humidity: currentHumidity,
    unit_temp: '°C',
    unit_humidity: '%',
    rssi: Math.floor(-55 - Math.random() * 15),
    uptime_seconds: uptimeSeconds,
    packet_id: messageCount,
    timestamp: new Date().toISOString()
  };

  const payloadString = JSON.stringify(payload);

  client.publish(config.topics.rawSensor, payloadString, { qos: 0 }, (err) => {
    if (err) {
      console.error('\x1b[31m[TX FAILED]\x1b[0m Failed to publish:', err.message);
    } else {
      const timeStr = new Date().toLocaleTimeString();
      let color = '\x1b[32m';
      let flag = 'NORMAL';
      if (currentTemp >= config.thresholds.tempCritical || currentHumidity >= config.thresholds.humidityCritical) {
        color = '\x1b[31m';
        flag = 'CRITICAL';
      } else if (currentTemp >= config.thresholds.tempWarning || currentHumidity >= config.thresholds.humidityWarning) {
        color = '\x1b[33m';
        flag = 'WARNING';
      }

      console.log(
        `${color}[TX #${messageCount} @ ${timeStr}]\x1b[0m ` +
        `Temp: \x1b[1m${currentTemp}°C\x1b[0m | ` +
        `Humidity: \x1b[1m${currentHumidity}%\x1b[0m | ` +
        `Status: [${flag}]`
      );
    }
  });
}

function printHelp() {
  console.log('\x1b[90m------------------------------------------------------------');
  console.log(' Interactive controls (اضغط في نافذة الطرفية):');
  console.log('  [t] = محاكاة موجة حرارة مرتفعة (High Temp Alert: 38°C)');
  console.log('  [h] = محاكاة رطوبة مرتفعة (High Humidity Alert: 90%)');
  console.log('  [n] = العودة للقيم الطبيعية (Normal values)');
  console.log('  [q] = خروج (Exit)');
  console.log('------------------------------------------------------------\x1b[0m\n');
}

// قراءة ضغطات لوحة المفاتيح التفاعلية
if (process.stdin.isTTY) {
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.setEncoding('utf8');

  process.stdin.on('data', (key) => {
    if (key === 't' || key === 'T') {
      forceSpike = 'heat';
      console.log('\n\x1b[41m\x1b[37m >> SIMULATING OVERHEAT SPIKE (38°C)! << \x1b[0m');
      publishTelemetry();
    } else if (key === 'h' || key === 'H') {
      forceSpike = 'humidity';
      console.log('\n\x1b[44m\x1b[37m >> SIMULATING HIGH HUMIDITY SPIKE (90%)! << \x1b[0m');
      publishTelemetry();
    } else if (key === 'n' || key === 'N') {
      forceSpike = null;
      currentTemp = 24.5;
      currentHumidity = 55.0;
      console.log('\n\x1b[42m\x1b[30m >> RETURNED TO NORMAL AMBIENT CONDITIONS << \x1b[0m');
      publishTelemetry();
    } else if (key === 'q' || key === 'Q' || key === '\u0003') {
      console.log('\nStopping ESP32 Simulator...');
      client.end();
      process.exit(0);
    }
  });
}

