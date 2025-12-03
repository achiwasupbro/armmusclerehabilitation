<?php
// Endpoint สำหรับ ESP32 ค้นหาเว็บ
// ไฟล์นี้ต้องอยู่บน web server ที่ ESP32 จะค้นหา

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    // ESP32 ตรวจสอบว่าเว็บเปิดอยู่หรือไม่
    echo json_encode([
        'status' => 'online',
        'type' => 'esp32-controller-web'
    ]);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    // ESP32 ส่งข้อมูลมา
    $data = json_decode(file_get_contents('php://input'), true);
    
    if ($data) {
        // บันทึกข้อมูล ESP32 ไว้ใน session หรือ file
        file_put_contents('esp32_data.json', json_encode($data));
        
        // ส่งข้อมูลไปที่ frontend ผ่าน localStorage (ใช้ polling)
        echo json_encode([
            'success' => true,
            'message' => 'ESP32 data received'
        ]);
    }
}
?>

