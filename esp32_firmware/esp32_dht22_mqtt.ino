#include "DHT.h"
#include <PubSubClient.h>
#include <WiFi.h>

// -------------------------------------------------------------
// 1. إعدادات شبكة الواي فاي (Wi-Fi Settings)
// -------------------------------------------------------------
const char *ssid = "YOUR_WIFI_SSID";
const char *password = "YOUR_WIFI_PASSWORD";

// -------------------------------------------------------------
// 2. إعدادات وسيط الرسائل (MQTT Broker Settings)
// -------------------------------------------------------------

const char *mqtt_server = "broker.emqx.io";
const int mqtt_port = 1883;

const char *topic_sensor = "iot/sensors/esp32/dht22";
const char *topic_commands = "iot/commands";

// -------------------------------------------------------------
// 3. إعدادات حساس DHT22 و المكونات
// -------------------------------------------------------------
#define DHTPIN 4
#define DHTTYPE DHT22
#define LED_BUILTIN 2

DHT dht(DHTPIN, DHTTYPE);
WiFiClient espClient;
PubSubClient client(espClient);

unsigned long lastMsgTime = 0;
const unsigned long interval = 3000;
unsigned long packetCounter = 0;

// -------------------------------------------------------------
// دالة استقبال الأوامر الواردة من البروكر (Callback)
// -------------------------------------------------------------
void callback(char *topic, byte *payload, unsigned int length) {
  Serial.print("[MQTT] رسالة واردة في الموضوع: ");
  Serial.println(topic);

  String message = "";
  for (int i = 0; i < length; i++) {
    message += (char)payload[i];
  }
  Serial.print("[MQTT] محتوى الأمر: ");
  Serial.println(message);

  if (message == "LED_ON") {
    digitalWrite(LED_BUILTIN, HIGH);
  } else if (message == "LED_OFF") {
    digitalWrite(LED_BUILTIN, LOW);
  }
}

// -------------------------------------------------------------
// دالة الاتصال بالواي فاي
// -------------------------------------------------------------
void setup_wifi() {
  delay(10);
  Serial.println();
  Serial.print("[Wi-Fi] جاري الاتصال بالشبكة: ");
  Serial.println(ssid);

  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid, password);

  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 30) {
    delay(500);
    Serial.print(".");
    attempts++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\n[Wi-Fi] تم الاتصال بنجاح!");
    Serial.print("[Wi-Fi] عنوان IP الخاص بـ ESP32: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println(
        "\n[Wi-Fi] فشل الاتصال بالواي فاي. تأكد من اسم الشبكة وكلمة المرور.");
  }
}

// -------------------------------------------------------------
// دالة إعادة الاتصال بالـ MQTT Broker
// -------------------------------------------------------------
void reconnect() {
  while (!client.connected()) {
    Serial.print("[MQTT] جاري الاتصال بالوسيط (Broker)... ");

    String clientId = "ESP32_Client_" + String(random(0xffff), HEX);

    if (client.connect(clientId.c_str())) {
      Serial.println("تم الاتصال بنجاح!");

      client.subscribe(topic_commands);
    } else {
      Serial.print("فشل الاتصال، كود الخطأ rc=");
      Serial.print(client.state());
      Serial.println(" -> إعادة المحاولة بعد 3 ثوان...");
      delay(3000);
    }
  }
}

// -------------------------------------------------------------
// دالة التهيئة الأولية (Setup)
// -------------------------------------------------------------
void setup() {
  Serial.begin(115200);
  pinMode(LED_BUILTIN, OUTPUT);
  digitalWrite(LED_BUILTIN, LOW);

  Serial.println("\n==============================================");
  Serial.println("    ESP32 + DHT22 IoT Sensor Transmitter");
  Serial.println("==============================================");

  // تشغيل الحساس
  dht.begin();
  Serial.println("[DHT22] تم تهيئة الحساس بنجاح.");

  // الاتصال بالواي فاي والبروكر
  setup_wifi();
  client.setServer(mqtt_server, mqtt_port);
  client.setCallback(callback);
}

// -------------------------------------------------------------
// الحلقة الرئيسية (Loop)
// -------------------------------------------------------------
void loop() {
  // الحفاظ على اتصال الواي فاي والبروكر
  if (WiFi.status() != WL_CONNECTED) {
    setup_wifi();
  }
  if (!client.connected()) {
    reconnect();
  }
  client.loop();

  // إرسال البيانات دورياً كل 3 ثوانٍ
  unsigned long now = millis();
  if (now - lastMsgTime >= interval) {
    lastMsgTime = now;

    // قراءة درجات الحرارة والرطوبة
    float humidity = dht.readHumidity();
    float temperature = dht.readTemperature(); // بالدرجة المئوية (°C)

    // التحقق من صحة القراءة
    if (isnan(humidity) || isnan(temperature)) {
      Serial.println(
          "[ERROR] فشل في قراءة البيانات من حساس DHT22! تأكد من التوصيلات.");
      return;
    }

    packetCounter++;

    // وميض الليد لإشعار الإرسال
    digitalWrite(LED_BUILTIN, HIGH);

    char jsonBuffer[256];
    int rssi = WiFi.RSSI();
    unsigned long uptime = millis() / 1000;

    snprintf(jsonBuffer, sizeof(jsonBuffer),
             "{\"device_id\":\"ESP32_Node_01\",\"sensor\":\"DHT22\","
             "\"temperature\":%.1f,\"humidity\":%.1f,\"rssi\":%d,\"uptime_"
             "seconds\":%lu,\"packet_id\":%lu}",
             temperature, humidity, rssi, uptime, packetCounter);

    // نشر الرسالة عبر الـ MQTT
    boolean published = client.publish(topic_sensor, jsonBuffer);

    if (published) {
      Serial.print("[TX #");
      Serial.print(packetCounter);
      Serial.print("] تم الإرسال: ");
      Serial.println(jsonBuffer);
    } else {
      Serial.println("[ERROR] فشل نشر الحزمة إلى البروكر!");
    }

    delay(100);
    digitalWrite(LED_BUILTIN, LOW);
  }
}
