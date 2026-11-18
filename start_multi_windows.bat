@echo off
chcp 65001 > nul
title IoT System Multi-Window Launcher

echo ===================================================================
echo   تشغيل منظومة إنترنت الأشياء في 4 نوافذ مستقلة
echo   [ESP32] -> [Broker] -> [Gateway] -> [Dashboard]
echo ===================================================================

echo [1/4] جاري تشغيل وسيط الرسائل (MQTT Broker)...
start "1. MQTT Broker (Local Port 1883 & 8888)" cmd /k "node broker/broker.js"
timeout /t 2 > nul

echo [2/4] جاري تشغيل خادم شاشة العرض (Web Dashboard Server)...
start "2. Dashboard Web Server (Port 3000)" cmd /k "node server.js"
timeout /t 2 > nul

echo [3/4] جاري تشغيل جهاز الاستقبال والمعالجة (Edge Gateway Receiver)...
start "3. Intermediate Receiver & Gateway" cmd /k "node gateway_receiver/receiver_gateway.js"
timeout /t 2 > nul

echo [4/4] جاري تشغيل محاكي حساس ESP32 + DHT22...
start "4. ESP32 + DHT22 Sensor Simulator" cmd /k "node simulator/esp32_simulator.js"

echo.
echo ===================================================================
echo تم تشغيل جميع المكونات في نوافذ منفصلة بنجاح!
echo يمكنك فتح شاشة العرض في المتصفح عبر: http://localhost:3000
echo ===================================================================
start http://localhost:3000
pause

