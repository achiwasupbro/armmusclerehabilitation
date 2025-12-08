// WebSocket Controller
class WebSocketController {
    constructor() {
        this.ws = null;
        this.isConnected = false;
        this.esp32Connected = false;
        this.selectedArm = null;
        this.currentRunningMode = null;
        this.isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || 
                     (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
        this.init();
    }

    init() {
        // เชื่อมต่อ WebSocket
        this.connectWebSocket();
        
        // Setup UI
        this.setupUI();
        
        // Setup arm buttons
        this.setupArmButtons();
        
        // Setup mode buttons
        this.setupModeButtons();
        
        // Setup voice control
        this.setupVoiceControl();
        
        // Setup camera (ถ้าไม่ใช่ iOS)
        if (!this.isIOS) {
            this.setupCamera();
        } else {
            const cameraSection = document.querySelector('.camera-control');
            if (cameraSection) {
                cameraSection.style.display = 'none';
            }
        }
    }

    connectWebSocket() {
        // ตรวจสอบว่าอยู่บน Production (Render) หรือ Local
        const isProduction = window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1';
        
        let serverUrl;
        if (isProduction) {
            // ใช้ wss:// (secure) สำหรับ Production
            serverUrl = `wss://${window.location.hostname}`;
        } else {
            // ใช้ ws:// สำหรับ Local
            serverUrl = 'ws://localhost:3000';
        }
        
        console.log('🔌 กำลังเชื่อมต่อ WebSocket:', serverUrl);
        
        this.ws = new WebSocket(serverUrl);
        
        this.ws.onopen = () => {
            console.log('✅ WebSocket เชื่อมต่อสำเร็จ');
            this.isConnected = true;
            
            // ลงทะเบียนเป็น web client
            this.ws.send(JSON.stringify({
                type: 'register',
                client: 'web'
            }));
            
            this.updateStatus('✅ เชื่อมต่อ Server สำเร็จ - รอ ESP32...', 'success');
        };
        
        this.ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                console.log('📨 Received:', data);
                
                if (data.type === 'registered') {
                    console.log('✅ ลงทะเบียนสำเร็จ');
                }
                else if (data.type === 'esp32_connected') {
                    this.esp32Connected = true;
                    this.updateStatus('✅ ESP32 เชื่อมต่อแล้ว - พร้อมใช้งาน!', 'success');
                    this.showDeviceControl();
                }
                else if (data.type === 'esp32_disconnected') {
                    this.esp32Connected = false;
                    this.updateStatus('❌ ESP32 ตัดการเชื่อมต่อ', 'error');
                }
                else if (data.type === 'progress') {
                    this.updateProgress(data);
                }
            } catch (error) {
                console.error('❌ Error parsing message:', error);
            }
        };
        
        this.ws.onclose = () => {
            console.log('❌ WebSocket ตัดการเชื่อมต่อ');
            this.isConnected = false;
            this.updateStatus('❌ ตัดการเชื่อมต่อ Server - กำลังลองใหม่...', 'error');
            
            // ลองเชื่อมต่อใหม่หลัง 3 วินาที
            setTimeout(() => this.connectWebSocket(), 3000);
        };
        
        this.ws.onerror = (error) => {
            console.error('❌ WebSocket error:', error);
            this.updateStatus('❌ เกิดข้อผิดพลาด - ตรวจสอบว่า Server ทำงานอยู่หรือไม่', 'error');
        };
    }

    setupUI() {
        // ซ่อนปุ่มค้นหา ESP32 (ไม่ต้องใช้แล้ว)
        const scanBtn = document.getElementById('scanBtn');
        const skipBtn = document.getElementById('skipBtn');
        if (scanBtn) scanBtn.style.display = 'none';
        if (skipBtn) skipBtn.style.display = 'none';
        
        // แสดงสถานะการเชื่อมต่อ
        this.updateStatus('🔌 กำลังเชื่อมต่อ Server...', 'info');
    }

    showDeviceControl() {
        const deviceControl = document.getElementById('deviceControl');
        deviceControl.classList.remove('hidden');
        
        document.getElementById('deviceName').textContent = 'ESP32 Controller';
        document.getElementById('deviceIP').textContent = 'WebSocket Connection';
        document.getElementById('deviceStatus').textContent = 'ออนไลน์';
        document.getElementById('deviceStatus').className = 'status-badge online';
    }

    updateStatus(message, className) {
        const scanStatus = document.getElementById('scanStatus');
        scanStatus.textContent = message;
        scanStatus.className = `status ${className}`;
    }

    setupArmButtons() {
        const armButtons = document.querySelectorAll('.btn-arm');
        armButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const arm = e.currentTarget.dataset.arm;
                this.selectedArm = arm;
                
                armButtons.forEach(b => b.classList.remove('active'));
                e.currentTarget.classList.add('active');
                
                console.log(`🦾 เลือกแขน: ${arm}`);
                this.speak(`เลือก${arm === 'right' ? 'แขนขวา' : 'แขนซ้าย'}`);
            });
        });
    }

    setupModeButtons() {
        const modeButtons = document.querySelectorAll('.btn-mode');
        const modeStatus = document.getElementById('modeStatus');
        
        modeButtons.forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.preventDefault();
                e.stopPropagation();
                
                const mode = e.currentTarget.dataset.mode;
                
                // ตรวจสอบว่าเลือกแขนแล้วหรือยัง
                if (!this.selectedArm) {
                    modeStatus.textContent = '⚠️ กรุณาเลือกแขนก่อน';
                    modeStatus.className = 'mode-status error';
                    this.speak('กรุณาเลือกแขนก่อน');
                    
                    setTimeout(() => {
                        modeStatus.textContent = '';
                        modeStatus.className = '';
                    }, 3000);
                    return;
                }
                
                // ตรวจสอบว่าเชื่อมต่อ ESP32 แล้วหรือยัง
                if (!this.esp32Connected) {
                    modeStatus.textContent = '⚠️ ESP32 ยังไม่เชื่อมต่อ';
                    modeStatus.className = 'mode-status error';
                    this.speak('ESP32 ยังไม่เชื่อมต่อ');
                    
                    setTimeout(() => {
                        modeStatus.textContent = '';
                        modeStatus.className = '';
                    }, 3000);
                    return;
                }
                
                // แปลงโหมดตามแขนที่เลือก
                const displayMode = parseInt(mode);
                let actualMode;
                if (this.selectedArm === 'right') {
                    actualMode = displayMode;
                } else {
                    actualMode = displayMode === 5 ? 5 : displayMode + 5;
                }
                
                // แสดงสถานะ
                modeStatus.textContent = `⏳ กำลังส่งโหมด ${displayMode}...`;
                modeStatus.className = 'mode-status info';
                
                // อัปเดตปุ่ม
                modeButtons.forEach(b => b.classList.remove('active'));
                e.currentTarget.classList.add('active');
                
                // พูดแจ้งเตือน
                this.speak(`โหมด ${displayMode}`);
                
                // ส่งโหมด
                this.sendMode(actualMode);
                
                // แสดงผลลัพธ์
                modeStatus.textContent = `✅ ส่งโหมด ${displayMode} แล้ว`;
                modeStatus.className = 'mode-status success';
                
                setTimeout(() => {
                    modeStatus.textContent = '';
                    modeStatus.className = '';
                }, 3000);
            });
        });
    }

    sendMode(mode) {
        if (!this.isConnected || !this.ws) {
            console.error('❌ WebSocket ไม่ได้เชื่อมต่อ');
            return;
        }
        
        console.log(`📤 ส่งโหมด ${mode}`);
        
        this.ws.send(JSON.stringify({
            type: 'mode',
            mode: mode
        }));
    }

    updateProgress(data) {
        const progressStatus = document.getElementById('progressStatus');
        
        let displayMode = data.mode;
        if (data.mode >= 6 && data.mode <= 9) {
            displayMode = data.mode - 5;
        }
        
        if (data.isRunning && data.mode >= 1 && data.mode <= 9) {
            progressStatus.textContent = `🔄 โหมด ${displayMode}: รอบที่ ${data.round}/${data.totalRounds} - ${data.action}`;
            progressStatus.className = 'progress-status running';
            
            if (data.mode !== 0 && data.mode !== 5) {
                this.currentRunningMode = data.mode;
            }
        } else if (data.mode > 0 && !data.isRunning) {
            if (data.action === "ถูกหยุด") {
                progressStatus.textContent = `🛑 โหมด ${displayMode} ถูกหยุด`;
                progressStatus.className = 'progress-status error';
            } else {
                progressStatus.textContent = `✅ โหมด ${displayMode} เสร็จสิ้น`;
                progressStatus.className = 'progress-status completed';
            }
            
            this.currentRunningMode = null;
            
            setTimeout(() => {
                progressStatus.textContent = '';
                progressStatus.className = '';
            }, 3000);
        } else {
            progressStatus.textContent = '';
            progressStatus.className = '';
        }
    }

    setupVoiceControl() {
        // TODO: เพิ่ม voice control
        console.log('Voice control setup (TODO)');
    }

    setupCamera() {
        // TODO: เพิ่ม camera control
        console.log('Camera setup (TODO)');
    }

    speak(text) {
        if ('speechSynthesis' in window) {
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.lang = 'th-TH';
            utterance.rate = 1.0;
            utterance.pitch = 1.0;
            speechSynthesis.speak(utterance);
        }
    }
}

// เริ่มต้นเมื่อโหลดหน้าเว็บ
let controller;
window.addEventListener('load', () => {
    controller = new WebSocketController();
});
