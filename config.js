// ===================================================================
// Configuration File for IoT ESP32 + DHT22 MQTT Project
// ملف الإعدادات المركزي لمشروع تطوير تطبيقات إنترنت الأشياء
// ===================================================================

module.exports = {
  // وضع البروكر: 'local' (بروكر محلي Aedes) أو 'cloud' (بروكر سحابي مثل EMQX)
  // يمكنك التبديل بينهما بكل سهولة
  brokerMode: 'local', // 'local' or 'cloud'

  // إعدادات البروكر المحلي (Aedes)
  localBroker: {
    tcpPort: 1883,          // المنفذ القياسي لـ MQTT (للـ ESP32 و Node.js)
    wsPort: 8888,           // منفذ WebSocket (لشاشة العرض في المتصفح)
    host: '127.0.0.1'
  },

  // إعدادات البروكر السحابي المجاني (EMQX Public Broker)
  cloudBroker: {
    host: 'broker.emqx.io',
    tcpPort: 1883,
    wsPort: 8083,           // WebSocket عادي
    wssPort: 8084,          // WebSocket مشفر (SSL)
    wsPath: '/mqtt'
  },

  // مواضيع MQTT (Topics)
  topics: {
    // موضوع البيانات الخام المرسلة من الـ ESP32 أو جهاز المحاكاة
    rawSensor: 'iot/sensors/esp32/dht22',
    
    // موضوع البيانات المعالجة الصادرة من جهاز الاستقبال والوسيط (Gateway)
    processedData: 'iot/processed/telemetry',
    
    // موضوع التنبيهات والإنذارات (Alerts)
    alerts: 'iot/alerts',
    
    // موضوع أوامر التحكم (Commands)
    commands: 'iot/commands'
  },

  // عتبات الإنذار (Thresholds)
  thresholds: {
    tempWarning: 28.0,      // درجة مئوية تحذيرية
    tempCritical: 35.0,     // درجة مئوية خطيرة
    humidityWarning: 70.0,  // رطوبة تحذيرية %
    humidityCritical: 85.0  // رطوبة خطيرة %
  },

  // خيارات أخرى
  simulator: {
    publishIntervalMs: 3000 // إرسال بيانات كل 3 ثواني
  },

  webServer: {
    port: 3000              // منفذ خادم لوحة التحكم (Dashboard)
  }
};
