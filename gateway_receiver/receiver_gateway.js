// ===================================================================
// IoT Gateway & Intermediate Receiver
// جهاز الاستقبال والوسيط (Edge Gateway)
// يستقبل بيانات الـ ESP32 الخام، يعالجها ويحسب المؤشرات، ثم يمررها لشاشة العرض
// ===================================================================

const mqtt = require('mqtt');
const fs = require('fs');
const path = require('path');
const config = require('../config');

// تحديد عنوان البروكر
const useCloud = process.argv.includes('--cloud') || config.brokerMode === 'cloud';
const brokerUrl = useCloud
  ? `mqtt://${config.cloudBroker.host}:${config.cloudBroker.tcpPort}`
  : `mqtt://${config.localBroker.host}:${config.localBroker.tcpPort}`;

console.log('\x1b[35m%s\x1b[0m', '======================================================');
console.log('\x1b[35m%s\x1b[0m', '   IoT Intermediate Receiver & Edge Gateway');
console.log('\x1b[35m%s\x1b[0m', '======================================================');
console.log(`Gateway connecting to Broker: \x1b[33m${brokerUrl}\x1b[0m`);

const client = mqtt.connect(brokerUrl, {
  clientId: 'IoT_Gateway_' + Math.random().toString(16).substring(2, 8),
  clean: true,
  connectTimeout: 5000,
  reconnectPeriod: 3000
});

// مسار تخزين السجلات التاريخية
const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}
const historyFilePath = path.join(dataDir, 'telemetry_history.json');

// تحميل السجلات السابقة إن وجدت
let historyBuffer = [];
if (fs.existsSync(historyFilePath)) {
  try {
    historyBuffer = JSON.parse(fs.readFileSync(historyFilePath, 'utf8'));
    if (!Array.isArray(historyBuffer)) historyBuffer = [];
  } catch (e) {
    historyBuffer = [];
  }
}

// دالة حساب مؤشر الحرارة المحسوسة (Heat Index - NOAA)
function calculateHeatIndex(tempC, humidity) {
  // تحويل إلى فهرنهايت للمعادلة القياسية
  const T = (tempC * 9 / 5) + 32;
  const RH = humidity;

  let HI = 0.5 * (T + 61.0 + ((T - 68.0) * 1.2) + (RH * 0.094));

  if (HI >= 80) {
    HI = -42.379 + 2.04901523 * T + 10.14333127 * RH
      - 0.22475541 * T * RH - 0.00683783 * T * T
      - 0.05481717 * RH * RH + 0.00122874 * T * T * RH
      + 0.00085282 * T * RH * RH - 0.00000199 * T * T * RH * RH;
  }

  // إعادة التحويل إلى مئوية
  const heatIndexC = (HI - 32) * 5 / 9;
  return +heatIndexC.toFixed(1);
}

// دالة حساب نقطة الندى (Dew Point)
function calculateDewPoint(tempC, humidity) {
  const a = 17.27;
  const b = 237.7;
  const alpha = ((a * tempC) / (b + tempC)) + Math.log(humidity / 100.0);
  const dewPoint = (b * alpha) / (a - alpha);
  return +dewPoint.toFixed(1);
}

// تقييم حالة السلامة والتنبيهات
function evaluateStatus(temp, humidity) {
  const t = config.thresholds;
  if (temp >= t.tempCritical || humidity >= t.humidityCritical) {
    return {
      level: 'CRITICAL',
      color: '\x1b[41m\x1b[37m',
      alert: true,
      message: temp >= t.tempCritical
        ? `خطر: درجة الحرارة تجاوزت الحد الأقصى (${temp}°C >= ${t.tempCritical}°C)`
        : `خطر: الرطوبة تجاوزت الحد الحرج (${humidity}% >= ${t.humidityCritical}%)`
    };
  }

  if (temp >= t.tempWarning || humidity >= t.humidityWarning) {
    return {
      level: 'WARNING',
      color: '\x1b[43m\x1b[30m',
      alert: true,
      message: temp >= t.tempWarning
        ? `تحذير: ارتفاع في درجة الحرارة (${temp}°C)`
        : `تحذير: ارتفاع في نسبة الرطوبة (${humidity}%)`
    };
  }

  return {
    level: 'NORMAL',
    color: '\x1b[42m\x1b[30m',
    alert: false,
    message: 'الظروف البيئية طبيعية ومستقرة'
  };
}

let packetsReceived = 0;

client.on('connect', () => {
  console.log('\x1b[32m%s\x1b[0m', `[GATEWAY CONNECTED] Successfully connected to broker!`);

  // الاشتراك في موضوع البيانات الخام الواردة من ESP32
  client.subscribe(config.topics.rawSensor, (err) => {
    if (err) {
      console.error('\x1b[31m[SUB ERROR]\x1b[0m Failed to subscribe to raw sensor topic:', err);
    } else {
      console.log(`Subscribed to Raw Sensor Feed: \x1b[36m${config.topics.rawSensor}\x1b[0m`);
      console.log(`Forwarding Processed Data to: \x1b[32m${config.topics.processedData}\x1b[0m`);
      console.log(`Alerts Topic: \x1b[31m${config.topics.alerts}\x1b[0m\n`);
      console.log('Listening for ESP32 DHT22 incoming telemetry...\n');
    }
  });
});

client.on('message', (topic, message) => {
  if (topic !== config.topics.rawSensor) return;

  packetsReceived++;
  let rawData;
  try {
    rawData = JSON.parse(message.toString());
  } catch (e) {
    console.error('\x1b[31m[PARSE ERROR]\x1b[0m Invalid JSON received:', message.toString());
    return;
  }

  const temp = parseFloat(rawData.temperature);
  const hum = parseFloat(rawData.humidity);

  // 1. المعالجة الذكية للبيانات (Data Processing & Enrichment)
  const heatIndex = calculateHeatIndex(temp, hum);
  const dewPoint = calculateDewPoint(temp, hum);
  const evaluation = evaluateStatus(temp, hum);

  // بناء حزمة البيانات المعالجة الموجهة لشاشة العرض (Dashboard)
  const processedPayload = {
    packet_id: packetsReceived,
    device_id: rawData.device_id || 'ESP32_DHT22',
    raw: {
      temperature: temp,
      humidity: hum,
      rssi: rawData.rssi || -60,
      uptime: rawData.uptime_seconds || 0
    },
    analytics: {
      heat_index: heatIndex,
      dew_point: dewPoint,
      status: evaluation.level,
      alert_active: evaluation.alert,
      status_message: evaluation.message
    },
    gateway_id: 'EdgeGateway_Node_PC',
    processed_at: new Date().toISOString()
  };

  const payloadString = JSON.stringify(processedPayload);

  // 2. إعادة إرسال البيانات المعالجة إلى موضوع شاشة العرض
  client.publish(config.topics.processedData, payloadString, { qos: 0 });

  // 3. في حال وجود إنذار، إرسال تنبيه فوري منفصل
  if (evaluation.alert) {
    const alertPayload = JSON.stringify({
      timestamp: new Date().toISOString(),
      level: evaluation.level,
      message: evaluation.message,
      temperature: temp,
      humidity: hum,
      device_id: rawData.device_id
    });
    client.publish(config.topics.alerts, alertPayload, { qos: 1 });
  }

  // 4. حفظ البيانات في سجل التاريخ المحلي
  historyBuffer.push(processedPayload);
  if (historyBuffer.length > 100) historyBuffer.shift(); // الاحتفاظ بآخر 100 قراءة
  try {
    fs.writeFileSync(historyFilePath, JSON.stringify(historyBuffer, null, 2));
  } catch (err) {
    // تجاهل أخطاء الكتابة المتكررة
  }

  // 5. طباعة تقرير المعالجة في سطر الأوامر بوضوح
  const timeStr = new Date().toLocaleTimeString();
  console.log(
    `\x1b[90m[${timeStr}]\x1b[0m ` +
    `\x1b[1mGateway Pkt #${packetsReceived}\x1b[0m | ` +
    `Temp: \x1b[36m${temp}°C\x1b[0m | ` +
    `Hum: \x1b[34m${hum}%\x1b[0m | ` +
    `HeatIndex: \x1b[33m${heatIndex}°C\x1b[0m | ` +
    `${evaluation.color} ${evaluation.level} \x1b[0m -> Forwarded to Dashboard`
  );
});

client.on('error', (err) => {
  console.error('\x1b[31m[GATEWAY ERROR]\x1b[0m', err.message);
});

