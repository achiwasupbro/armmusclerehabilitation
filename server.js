// WebSocket Relay Server สำหรับเชื่อมต่อระหว่าง Web และ ESP32
const WebSocket = require('ws');
const http = require('http');
const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000; // ใช้ PORT จาก Render หรือ 3000 สำหรับ local

// Serve static files - ใช้ __dirname เป็น root
app.use(express.static(__dirname));

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        websocket: 'ready'
    });
});

// Route สำหรับ root path
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Create HTTP server
const server = http.createServer(app);

// Create WebSocket server
const wss = new WebSocket.Server({ server });

// เก็บ connections
let webClient = null;  // Web browser
let esp32Client = null; // ESP32 board

wss.on('connection', (ws, req) => {
    console.log('🔌 New connection from:', req.socket.remoteAddress);
    
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            console.log('📨 Received:', data);
            
            // ระบุประเภทของ client
            if (data.type === 'register') {
                if (data.client === 'web') {
                    webClient = ws;
                    console.log('🌐 Web client registered');
                    ws.send(JSON.stringify({ type: 'registered', client: 'web' }));
                } else if (data.client === 'esp32') {
                    esp32Client = ws;
                    console.log('🤖 ESP32 client registered');
                    ws.send(JSON.stringify({ type: 'registered', client: 'esp32' }));
                    
                    // แจ้ง web ว่า ESP32 เชื่อมต่อแล้ว
                    if (webClient && webClient.readyState === WebSocket.OPEN) {
                        webClient.send(JSON.stringify({ 
                            type: 'esp32_connected',
                            status: 'online'
                        }));
                    }
                }
            }
            
            // ส่งโหมดจาก web ไป ESP32
            else if (data.type === 'mode' && esp32Client && esp32Client.readyState === WebSocket.OPEN) {
                console.log(`📤 Sending mode ${data.mode} to ESP32`);
                esp32Client.send(JSON.stringify(data));
            }
            
            // ส่ง progress จาก ESP32 ไป web
            else if (data.type === 'progress' && webClient && webClient.readyState === WebSocket.OPEN) {
                console.log(`📊 Sending progress to web:`, data);
                webClient.send(JSON.stringify(data));
            }
            
        } catch (error) {
            console.error('❌ Error parsing message:', error);
        }
    });
    
    ws.on('close', () => {
        console.log('🔌 Connection closed');
        if (ws === webClient) {
            webClient = null;
            console.log('🌐 Web client disconnected');
        } else if (ws === esp32Client) {
            esp32Client = null;
            console.log('🤖 ESP32 client disconnected');
            
            // แจ้ง web ว่า ESP32 ตัดการเชื่อมต่อ
            if (webClient && webClient.readyState === WebSocket.OPEN) {
                webClient.send(JSON.stringify({ 
                    type: 'esp32_disconnected',
                    status: 'offline'
                }));
            }
        }
    });
    
    ws.on('error', (error) => {
        console.error('❌ WebSocket error:', error);
    });
});

server.listen(PORT, '0.0.0.0', () => {
    console.log('========================================');
    console.log('🚀 Server started!');
    console.log(`🌐 Web: http://localhost:${PORT}`);
    console.log(`🔌 WebSocket: ws://localhost:${PORT}`);
    console.log('📡 Ready for connections from anywhere!');
    console.log('========================================');
});
