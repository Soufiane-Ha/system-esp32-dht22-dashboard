// ===================================================================
// IoT Dashboard Client Controller (MQTT over WebSockets + Chart.js)
// ===================================================================

// الإعدادات الافتراضية
const BROKER_CONFIGS = {
  local: {
    name: 'Local Broker (Aedes)',
    url: 'ws://localhost:8888',
    options: { clientId: 'WebDashboard_' + Math.random().toString(16).substring(2, 8) }
  },
  cloud: {
    name: 'EMQX Cloud Public Broker',
    url: 'wss://broker.emqx.io:8084/mqtt',
    options: { clientId: 'WebDashboard_' + Math.random().toString(16).substring(2, 8) }
  }
};

const TOPICS = {
  raw: 'iot/sensors/esp32/dht22',
  processed: 'iot/processed/telemetry',
  alerts: 'iot/alerts',
  commands: 'iot/commands'
};

// حالة التطبيق (State)
let mqttClient = null;
let currentBrokerMode = 'local';
let soundEnabled = true;
let logsPaused = false;
let totalPackets = 0;
let logsData = [];

let stats = {
  tempMin: Infinity,
  tempMax: -Infinity,
  humMin: Infinity,
  humMax: -Infinity
};

// عناصر واجهة المستخدم
const elements = {
  brokerSelector: document.getElementById('brokerSelector'),
  connectionBadge: document.getElementById('connectionBadge'),
  connectionText: document.getElementById('connectionText'),
  soundToggleBtn: document.getElementById('soundToggleBtn'),
  alertBanner: document.getElementById('alertBanner'),
  alertTitle: document.getElementById('alertTitle'),
  alertMessage: document.getElementById('alertMessage'),
  dismissAlertBtn: document.getElementById('dismissAlertBtn'),

  valTemperature: document.getElementById('valTemperature'),
  valHumidity: document.getElementById('valHumidity'),
  valTempMin: document.getElementById('valTempMin'),
  valTempMax: document.getElementById('valTempMax'),
  valHumMin: document.getElementById('valHumMin'),
  valHumMax: document.getElementById('valHumMax'),
  tempProgress: document.getElementById('tempProgress'),
  humProgress: document.getElementById('humProgress'),
  tempBadge: document.getElementById('tempBadge'),
  humidityBadge: document.getElementById('humidityBadge'),

  valHeatIndex: document.getElementById('valHeatIndex'),
  valDewPoint: document.getElementById('valDewPoint'),
  valComfortText: document.getElementById('valComfortText'),
  heatIndexBadge: document.getElementById('heatIndexBadge'),

  valDeviceId: document.getElementById('valDeviceId'),
  valRssi: document.getElementById('valRssi'),
  valPacketCount: document.getElementById('valPacketCount'),
  valLastSeen: document.getElementById('valLastSeen'),

  esp32Status: document.getElementById('esp32Status'),
  gatewayStatus: document.getElementById('gatewayStatus'),
  nodeEsp32: document.getElementById('nodeEsp32'),
  nodeGateway: document.getElementById('nodeGateway'),
  nodeDashboard: document.getElementById('nodeDashboard'),

  logsTableBody: document.getElementById('logsTableBody'),
  pauseLogsBtn: document.getElementById('pauseLogsBtn'),
  clearLogsBtn: document.getElementById('clearLogsBtn'),
  exportJsonBtn: document.getElementById('exportJsonBtn'),
  clearChartBtn: document.getElementById('clearChartBtn'),

  btnLedOn: document.getElementById('btnLedOn'),
  btnLedOff: document.getElementById('btnLedOff'),
  btnPing: document.getElementById('btnPing'),
  cmdStatus: document.getElementById('cmdStatus')
};

// -------------------------------------------------------------
// تهيئة المخطط البياني (Chart.js)
// -------------------------------------------------------------
let telemetryChart;
const MAX_CHART_POINTS = 25;

function initChart() {
  const ctx = document.getElementById('telemetryChart').getContext('2d');
  
  telemetryChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: [],
      datasets: [
        {
          label: 'درجة الحرارة (°C)',
          data: [],
          borderColor: '#f97316',
          backgroundColor: 'rgba(249, 115, 22, 0.15)',
          borderWidth: 2.5,
          tension: 0.35,
          fill: true,
          pointRadius: 3,
          pointHoverRadius: 6,
          yAxisID: 'yTemp'
        },
        {
          label: 'نسبة الرطوبة (%)',
          data: [],
          borderColor: '#06b6d4',
          backgroundColor: 'rgba(6, 182, 212, 0.15)',
          borderWidth: 2.5,
          tension: 0.35,
          fill: true,
          pointRadius: 3,
          pointHoverRadius: 6,
          yAxisID: 'yHum'
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false
      },
      plugins: {
        legend: { display: false }
      },
      scales: {
        x: {
          grid: { color: 'rgba(255, 255, 255, 0.05)' },
          ticks: { color: '#94a3b8', font: { size: 11 } }
        },
        yTemp: {
          type: 'linear',
          position: 'right',
          title: { display: true, text: 'الحرارة (°C)', color: '#f97316' },
          grid: { color: 'rgba(255, 255, 255, 0.05)' },
          ticks: { color: '#f97316' },
          min: 10,
          max: 50
        },
        yHum: {
          type: 'linear',
          position: 'left',
          title: { display: true, text: 'الرطوبة (%)', color: '#06b6d4' },
          grid: { drawOnChartArea: false },
          ticks: { color: '#06b6d4' },
          min: 20,
          max: 100
        }
      }
    }
  });
}

function addChartData(timeLabel, temp, hum) {
  if (!telemetryChart) return;

  telemetryChart.data.labels.push(timeLabel);
  telemetryChart.data.datasets[0].data.push(temp);
  telemetryChart.data.datasets[1].data.push(hum);

  if (telemetryChart.data.labels.length > MAX_CHART_POINTS) {
    telemetryChart.data.labels.shift();
    telemetryChart.data.datasets[0].data.shift();
    telemetryChart.data.datasets[1].data.shift();
  }

  telemetryChart.update('none'); // تحديث سريع بدون إعادة بناء كاملة
}

// -------------------------------------------------------------
// مؤثر صوتي للإنذارات (Web Audio API Synthesizer)
// -------------------------------------------------------------
function playAlertChime(isCritical = false) {
  if (!soundEnabled) return;
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = isCritical ? 'sawtooth' : 'sine';
    osc.frequency.setValueAtTime(isCritical ? 880 : 587.33, ctx.currentTime); // A5 or D5
    if (isCritical) {
      osc.frequency.setValueAtTime(659.25, ctx.currentTime + 0.15); // E5
      osc.frequency.setValueAtTime(880, ctx.currentTime + 0.3);
    }

    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + (isCritical ? 0.6 : 0.3));

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + (isCritical ? 0.65 : 0.35));
  } catch (e) {
    // تجاهل أخطاء تشغيل الصوت إذا كان المتصفح يحجب التشغيل التلقائي
  }
}

// -------------------------------------------------------------
// إدارة اتصال MQTT عبر WebSocket
// -------------------------------------------------------------
function connectMqtt(mode = 'local') {
  currentBrokerMode = mode;
  const cfg = BROKER_CONFIGS[mode];

  if (mqttClient) {
    try { mqttClient.end(true); } catch(e) {}
  }

  updateConnectionStatus('connecting', `جاري الاتصال بـ ${cfg.name}...`);

  console.log(`[MQTT] Connecting to ${cfg.url}...`);
  mqttClient = mqtt.connect(cfg.url, cfg.options);

  mqttClient.on('connect', () => {
    console.log(`[MQTT] Connected successfully to ${cfg.name}`);
    updateConnectionStatus('connected', `متصل (${mode === 'local' ? 'محلي' : 'سحابي'})`);

    // الاشتراك في المواضيع
    mqttClient.subscribe([TOPICS.raw, TOPICS.processed, TOPICS.alerts], (err) => {
      if (!err) {
        console.log('[MQTT] Subscribed to telemetry topics.');
      }
    });
  });

  mqttClient.on('message', (topic, payload) => {
    handleIncomingMessage(topic, payload.toString());
  });

  mqttClient.on('error', (err) => {
    console.error('[MQTT Error]', err);
    updateConnectionStatus('disconnected', 'خطأ في الاتصال بالوسيط');
  });

  mqttClient.on('close', () => {
    updateConnectionStatus('disconnected', 'انقطع الاتصال بالوسيط');
  });
}

function updateConnectionStatus(state, message) {
  elements.connectionBadge.className = 'connection-badge';
  if (state === 'connected') {
    elements.connectionBadge.classList.add('status-connected');
    elements.connectionText.textContent = message;
  } else if (state === 'connecting') {
    elements.connectionBadge.classList.add('status-disconnected');
    elements.connectionText.textContent = message;
  } else {
    elements.connectionBadge.classList.add('status-disconnected');
    elements.connectionText.textContent = message;
  }
}

// -------------------------------------------------------------
// معالجة الرسائل الواردة
// -------------------------------------------------------------
function handleIncomingMessage(topic, payloadStr) {
  let data;
  try {
    data = JSON.parse(payloadStr);
  } catch (e) {
    console.warn('[MQTT] Non-JSON payload received:', payloadStr);
    return;
  }

  const now = new Date();
  const timeLabel = now.toLocaleTimeString();

  // تأثير حركي للمسار المعماري (Flow Animation)
  animateNodeTransmission(topic);

  // 1. إذا كانت الرسالة من المعالج والوسيط (Processed Data)
  if (topic === TOPICS.processed) {
    totalPackets++;
    elements.valPacketCount.textContent = totalPackets;
    elements.valLastSeen.textContent = timeLabel;

    const raw = data.raw || {};
    const analytics = data.analytics || {};

    const temp = raw.temperature;
    const hum = raw.humidity;
    const heatIndex = analytics.heat_index;
    const dewPoint = analytics.dew_point;
    const status = analytics.status || 'NORMAL';

    updateMetricsDisplay(temp, hum, heatIndex, dewPoint, status, data.device_id, raw.rssi);
    addChartData(timeLabel, temp, hum);

    if (analytics.alert_active) {
      showAlert(status, analytics.status_message);
      playAlertChime(status === 'CRITICAL');
    }

    if (!logsPaused) {
      appendLogRow(totalPackets, timeLabel, topic, temp, hum, heatIndex, status, payloadStr);
    }
  }

  // 2. إذا كانت رسالة إنذار مستقلة (Alerts)
  else if (topic === TOPICS.alerts) {
    showAlert(data.level || 'WARNING', data.message || 'تنبيه بيئي عاجل!');
    playAlertChime(true);
  }

  // 3. إذا كانت الرسالة خام مباشرة من الـ ESP32
  else if (topic === TOPICS.raw) {
    elements.esp32Status.textContent = `يرسل حزمة (${data.temperature}°C)`;
    elements.esp32Status.style.color = '#34d399';
  }
}

// تحديث البطاقات الرقمية
function updateMetricsDisplay(temp, hum, heatIndex, dewPoint, status, deviceId, rssi) {
  // الحرارة
  if (temp !== undefined) {
    elements.valTemperature.textContent = temp.toFixed(1);
    stats.tempMin = Math.min(stats.tempMin, temp);
    stats.tempMax = Math.max(stats.tempMax, temp);
    elements.valTempMin.textContent = stats.tempMin.toFixed(1);
    elements.valTempMax.textContent = stats.tempMax.toFixed(1);

    // نسبة ملء الشريط (من 0 إلى 50 مئوية)
    const tempPercent = Math.min(100, Math.max(0, ((temp - 10) / 40) * 100));
    elements.tempProgress.style.width = tempPercent + '%';

    // شارة الحرارة
    elements.tempBadge.className = 'card-badge';
    if (temp >= 35) {
      elements.tempBadge.textContent = 'خطر / مرتفعة جداً';
      elements.tempBadge.classList.add('badge-critical');
    } else if (temp >= 28) {
      elements.tempBadge.textContent = 'تحذير / دافئة';
      elements.tempBadge.classList.add('badge-warning');
    } else {
      elements.tempBadge.textContent = 'مثالي / طبيعي';
    }
  }

  // الرطوبة
  if (hum !== undefined) {
    elements.valHumidity.textContent = hum.toFixed(1);
    stats.humMin = Math.min(stats.humMin, hum);
    stats.humMax = Math.max(stats.humMax, hum);
    elements.valHumMin.textContent = stats.humMin.toFixed(1);
    elements.valHumMax.textContent = stats.humMax.toFixed(1);

    elements.humProgress.style.width = hum + '%';

    // شارة الرطوبة
    elements.humidityBadge.className = 'card-badge';
    if (hum >= 85) {
      elements.humidityBadge.textContent = 'رطوبة فائقة';
      elements.humidityBadge.classList.add('badge-critical');
    } else if (hum >= 70) {
      elements.humidityBadge.textContent = 'رطوبة عالية';
      elements.humidityBadge.classList.add('badge-warning');
    } else {
      elements.humidityBadge.textContent = 'رطوبة معتدلة';
    }
  }

  // الحرارة المحسوسة ونقطة الندى
  if (heatIndex !== undefined) {
    elements.valHeatIndex.textContent = heatIndex.toFixed(1);
    elements.valDewPoint.textContent = dewPoint !== undefined ? dewPoint.toFixed(1) : '--.-';

    elements.heatIndexBadge.className = 'card-badge';
    if (heatIndex >= 38) {
      elements.heatIndexBadge.textContent = 'إجهاد حراري شديد';
      elements.heatIndexBadge.classList.add('badge-critical');
      elements.valComfortText.textContent = 'تحذير: خطر الإصابة بالإجهاد أو ضربة شمس';
    } else if (heatIndex >= 30) {
      elements.heatIndexBadge.textContent = 'حار نسبياً';
      elements.heatIndexBadge.classList.add('badge-warning');
      elements.valComfortText.textContent = 'الطقس دافئ، يُنصح بالتهوية والتبريد';
    } else {
      elements.heatIndexBadge.textContent = 'راحة حرارية';
      elements.valComfortText.textContent = 'مستوى الراحة الحرارية ممتاز وطبيعي';
    }
  }

  // بيانات العقدة
  if (deviceId) elements.valDeviceId.textContent = deviceId;
  if (rssi !== undefined) elements.valRssi.textContent = `${rssi} dBm`;
}

// تأثير وميض العقد في المسار المعماري
function animateNodeTransmission(topic) {
  elements.nodeEsp32.classList.add('transmitting');
  elements.nodeGateway.classList.add('transmitting');
  elements.nodeDashboard.classList.add('transmitting');

  setTimeout(() => {
    elements.nodeEsp32.classList.remove('transmitting');
    elements.nodeGateway.classList.remove('transmitting');
    elements.nodeDashboard.classList.remove('transmitting');
  }, 450);
}

// إظهار راية التنبيه
function showAlert(level, message) {
  elements.alertTitle.textContent = level === 'CRITICAL' ? '🚨 إنذار حرج (Critical Alert)' : '⚠️ تنبيه بيئي (Warning)';
  elements.alertMessage.textContent = message;
  elements.alertBanner.classList.remove('hidden');
}

// إضافة سطر في جدول السجلات
function appendLogRow(id, time, topic, temp, hum, heatIndex, status, rawJson) {
  const tbody = elements.logsTableBody;

  // إزالة السطر الفارغ المبدئي إن وجد
  const emptyRow = tbody.querySelector('.empty-row');
  if (emptyRow) emptyRow.remove();

  const tr = document.createElement('tr');
  let badgeClass = 'card-badge';
  if (status === 'CRITICAL') badgeClass += ' badge-critical';
  else if (status === 'WARNING') badgeClass += ' badge-warning';

  tr.innerHTML = `
    <td><strong>#${id}</strong></td>
    <td>${time}</td>
    <td><code>${topic}</code></td>
    <td><strong>${temp !== undefined ? temp + ' °C' : '--'}</strong></td>
    <td><strong>${hum !== undefined ? hum + ' %' : '--'}</strong></td>
    <td>${heatIndex !== undefined ? heatIndex + ' °C' : '--'}</td>
    <td><span class="${badgeClass}">${status}</span></td>
    <td class="raw-payload-cell" title="${rawJson.replace(/"/g, '&quot;')}">${rawJson}</td>
  `;

  tbody.insertBefore(tr, tbody.firstChild);

  // الاحتفاظ بحد أقصى 50 سطر في الجدول لتفادي بطء المتصفح
  while (tbody.children.length > 50) {
    tbody.removeChild(tbody.lastChild);
  }

  // حفظ في الذاكرة للتصدير
  logsData.unshift({ id, time, topic, temp, hum, heatIndex, status, raw: rawJson });
  if (logsData.length > 200) logsData.pop();
}

// -------------------------------------------------------------
// إرسال أوامر التحكم (Remote Commands)
// -------------------------------------------------------------
function sendMqttCommand(cmd) {
  if (!mqttClient || !mqttClient.connected) {
    alert('الوسيط غير متصل! يرجى التأكد من تشغيل البروكر أولاً.');
    return;
  }

  mqttClient.publish(TOPICS.commands, cmd, { qos: 1 }, (err) => {
    if (err) {
      elements.cmdStatus.textContent = '❌ فشل إرسال الأمر';
      elements.cmdStatus.style.color = '#ef4444';
    } else {
      elements.cmdStatus.textContent = `✔ تم إرسال الأمر [${cmd}] بنجاح`;
      elements.cmdStatus.style.color = '#34d399';
      setTimeout(() => { elements.cmdStatus.textContent = ''; }, 3000);
    }
  });
}

// -------------------------------------------------------------
// مستمعات الأحداث (Event Listeners)
// -------------------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
  initChart();

  // تغيير البروكر
  elements.brokerSelector.addEventListener('change', (e) => {
    connectMqtt(e.target.value);
  });

  // كتم / تشغيل الصوت
  elements.soundToggleBtn.addEventListener('click', () => {
    soundEnabled = !soundEnabled;
    elements.soundToggleBtn.textContent = soundEnabled ? '🔔' : '🔕';
    elements.soundToggleBtn.title = soundEnabled ? 'صوت الإنذار مفعل' : 'صوت الإنذار مكتوم';
  });

  // إخفاء راية التنبيه
  elements.dismissAlertBtn.addEventListener('click', () => {
    elements.alertBanner.classList.add('hidden');
  });

  // أزرار التحكم عن بعد
  elements.btnLedOn.addEventListener('click', () => sendMqttCommand('LED_ON'));
  elements.btnLedOff.addEventListener('click', () => sendMqttCommand('LED_OFF'));
  elements.btnPing.addEventListener('click', () => sendMqttCommand('PING'));

  // إيقاف مؤقت للسجلات
  elements.pauseLogsBtn.addEventListener('click', () => {
    logsPaused = !logsPaused;
    elements.pauseLogsBtn.textContent = logsPaused ? 'استئناف ▶️' : 'إيقاف مؤقت ⏸️';
  });

  // تفريغ السجل
  elements.clearLogsBtn.addEventListener('click', () => {
    elements.logsTableBody.innerHTML = '<tr class="empty-row"><td colspan="8">تم تفريغ السجل. في انتظار حزم جديدة...</td></tr>';
    logsData = [];
  });

  // تفريغ المخطط البياني
  elements.clearChartBtn.addEventListener('click', () => {
    telemetryChart.data.labels = [];
    telemetryChart.data.datasets[0].data = [];
    telemetryChart.data.datasets[1].data = [];
    telemetryChart.update();
  });

  // تصدير JSON
  elements.exportJsonBtn.addEventListener('click', () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(logsData, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `iot_telemetry_${Date.now()}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  });

  // بدء الاتصال بالبروكر المحلي افتراضياً
  connectMqtt('local');
});

