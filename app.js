// ตรวจสอบว่าเป็น iOS/iPad หรือไม่
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || 
              (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

// ESP32 Auto Discovery Controller
class ESP32Controller {
    constructor() {
        this.currentDevice = null;
        this.devices = [];
        this.scanBtn = document.getElementById('scanBtn');
        this.scanStatus = document.getElementById('scanStatus');
        this.devicesList = document.getElementById('devicesList');
        this.deviceControl = document.getElementById('deviceControl');
        this.isScanning = false;
        this.retryInterval = null;
        this.retryCount = 0;
        this.progressInterval = null;
        this.selectedArm = null; // แขนที่เลือก: 'right', 'left' หรือ null (ยังไม่เลือก)
        this.recognition = null; // Speech recognition
        this.isListening = false;
        this.currentRunningMode = null; // โหมดที่กำลังทำงานอยู่ (null = ไม่มีโหมดทำงาน)
        this.lastVoiceCommand = null; // คำสั่งเสียงล่าสุด
        this.lastVoiceCommandTime = 0; // เวลาที่ได้รับคำสั่งเสียงล่าสุด
        this.isIOS = isIOS; // เก็บสถานะว่าเป็น iOS หรือไม่
        this.firebaseManager = null; // Firebase Manager
        this.useFirebase = false; // ใช้ Firebase หรือไม่
        this.connectionMode = localStorage.getItem('connectionMode') || 'ip'; // 'ip' หรือ 'firebase'
        
        this.init();
    }

    init() {
        // เริ่มต้น Firebase (ถ้ามี)
        this.initFirebase();
        
        // ตั้งค่า Connection Mode Modal
        this.setupConnectionModeModal();
        
        this.scanBtn.addEventListener('click', () => {
            // ถ้ากำลัง retry อยู่ ให้หยุดก่อน
            this.stopRetry();
            this.retryCount = 0;
            this.scanDevices();
        });
        
        // ปุ่มข้ามไปทดสอบ (ไม่ต้องเชื่อมต่อบอร์ด)
        const skipBtn = document.getElementById('skipBtn');
        if (skipBtn) {
            skipBtn.addEventListener('click', () => {
                this.stopRetry();
                this.skipToTestMode();
            });
        }
        
        // Auto scan on load
        window.addEventListener('load', () => {
            setTimeout(() => this.scanDevices(), 1000);
        });
        
        // หยุด retry เมื่อปิดหน้าเว็บ
        window.addEventListener('beforeunload', () => {
            this.stopRetry();
        });
    }
    
    skipToTestMode() {
        // สร้าง fake device สำหรับทดสอบ
        const fakeDevice = {
            ip: 'TEST-MODE',
            mdns: null,
            name: 'โหมดทดสอบ (ไม่มีบอร์ด)',
            status: 'offline',
            useMDNS: false
        };
        
        this.currentDevice = fakeDevice;
        document.getElementById('deviceName').textContent = fakeDevice.name;
        document.getElementById('deviceIP').textContent = 'ไม่ได้เชื่อมต่อ';
        document.getElementById('deviceStatus').textContent = 'โหมดทดสอบ';
        document.getElementById('deviceStatus').className = 'status-badge offline';
        
        this.scanStatus.textContent = '⚠️ โหมดทดสอบ - ไม่ได้เชื่อมต่อกับบอร์ด';
        this.scanStatus.className = 'status info';
        
        this.deviceControl.classList.remove('hidden');
        
        // Setup arm selection buttons
        this.setupArmButtons();
        
        // Setup mode buttons
        this.setupModeButtons();
        
        // Setup voice control
        this.setupVoiceControl();
        
        // สร้าง HandGestureDetector สำหรับกล้อง (ไม่รองรับ iOS)
        if (!handGestureDetector && !this.isIOS) {
            try {
                handGestureDetector = new HandGestureDetector(this);
                console.log('✅ HandGestureDetector ถูกสร้างแล้ว');
            } catch (error) {
                console.error('❌ ไม่สามารถสร้าง HandGestureDetector ได้:', error);
            }
        } else if (this.isIOS) {
            console.log('ℹ️ iOS ตรวจพบ - ปิดฟีเจอร์กล้อง AI (ไม่รองรับ)');
            // ซ่อนปุ่มกล้อง
            const cameraSection = document.querySelector('.camera-control');
            if (cameraSection) {
                cameraSection.style.display = 'none';
            }
        }
        
        // พูดว่าระบบพร้อม
        setTimeout(() => {
            this.speakReady();
        }, 500);
        
        console.log('🧪 เข้าสู่โหมดทดสอบ - ดู Console เพื่อดูผลการแปลงโหมด');
    }
    
    async scanDevices() {
        // ป้องกันการเรียกซ้ำ
        if (this.isScanning) {
            return;
        }

        // ถ้าเป็น Firebase Mode ให้เชื่อมต่อ Firebase แทน
        if (this.connectionMode === 'firebase') {
            this.connectFirebaseMode();
            return;
        }

        this.isScanning = true;
        this.scanBtn.disabled = true;
        this.scanBtn.classList.add('scanning');
        this.scanStatus.textContent = 'กำลังค้นหา ESP32...';
        this.scanStatus.className = 'status info';
        this.devicesList.innerHTML = '';

        this.devices = [];

        // ตรวจสอบเฉพาะ Static IP (10.250.100.1) เท่านั้น
        const staticIP = '10.50.56.1';
        this.scanStatus.textContent = `กำลังเชื่อมต่อกับ ${staticIP}... (ลองครั้งที่ ${this.retryCount + 1})`;
        await this.checkESP32(staticIP);
        
        this.scanBtn.disabled = false;
        this.scanBtn.classList.remove('scanning');
        this.isScanning = false;

        if (this.devices.length > 0) {
            // หยุดการ retry ถ้าพบแล้ว
            this.stopRetry();
            this.retryCount = 0;
            
            // บันทึก Static IP ไว้
            localStorage.setItem('lastESP32IP', staticIP);
            this.scanStatus.textContent = `✅ พบ ESP32 ที่ ${staticIP}!`;
            this.scanStatus.className = 'status success';
            this.displayDevices();
            
            // เปิดหน้า ESP32 ถูกค้นพบแล้ว! โดยอัตโนมัติ
            if (this.devices.length > 0) {
                this.selectDevice(this.devices[0]);
            }
        } else {
            // ไม่พบ - เริ่ม retry
            this.retryCount++;
            this.scanStatus.textContent = `❌ ไม่พบ ESP32 ที่ ${staticIP} - กำลังลองใหม่ใน 3 วินาที... (ลองครั้งที่ ${this.retryCount})`;
            this.scanStatus.className = 'status error';
            
            // เริ่ม retry อัตโนมัติ
            this.startRetry();
        }
    }

    startRetry() {
        // หยุด retry เก่าก่อน (ถ้ามี)
        this.stopRetry();
        
        // เริ่ม retry ใหม่ทุก 3 วินาที
        this.retryInterval = setInterval(() => {
            if (!this.isScanning && this.devices.length === 0) {
                this.scanDevices();
            } else {
                // ถ้าพบแล้วหรือกำลังสแกนอยู่ ให้หยุด retry
                this.stopRetry();
            }
        }, 3000);
    }

    stopRetry() {
        if (this.retryInterval) {
            clearInterval(this.retryInterval);
            this.retryInterval = null;
        }
    }

    async getLocalIP() {
        return new Promise((resolve) => {
            // ในมือถืออาจใช้วิธีอื่น
            const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
            
            // ลองดึง IP ที่บันทึกไว้ก่อน
            const savedIP = localStorage.getItem('lastESP32IP');
            if (savedIP) {
                const savedRange = savedIP.substring(0, savedIP.lastIndexOf('.'));
                console.log(`📝 ใช้ IP range ที่บันทึกไว้: ${savedRange}.x`);
            }
            
            const RTCPeerConnection = window.RTCPeerConnection || 
                window.mozRTCPeerConnection || 
                window.webkitRTCPeerConnection;
            
            if (!RTCPeerConnection) {
                // Fallback: ลองใช้ IP ที่บันทึกไว้ หรือ common IP ranges
                const savedIP = localStorage.getItem('lastESP32IP');
                if (savedIP) {
                    const savedRange = savedIP.substring(0, savedIP.lastIndexOf('.'));
                    resolve(savedRange + '.1');
                    return;
                }
                const commonRanges = ['10.250.100'];
                resolve(commonRanges[0] + '.1');
                return;
            }

            const pc = new RTCPeerConnection({ iceServers: [] });
            pc.createDataChannel('');
            pc.createOffer().then(offer => pc.setLocalDescription(offer)).catch(() => {
                // ถ้า createOffer ไม่ได้ ให้ใช้ fallback
                const savedIP = localStorage.getItem('lastESP32IP');
                if (savedIP) {
                    const savedRange = savedIP.substring(0, savedIP.lastIndexOf('.'));
                    resolve(savedRange + '.1');
                    return;
                }
                const commonRanges = ['10.250.100'];
                resolve(commonRanges[0] + '.1');
            });
            
            let resolved = false;
            pc.onicecandidate = (event) => {
                if (event.candidate && !resolved) {
                    const candidate = event.candidate.candidate;
                    const match = candidate.match(/([0-9]{1,3}\.){3}[0-9]{1,3}/);
                    if (match) {
                        const ip = match[0];
                        // ตรวจสอบว่าเป็น private IP
                        if (ip.startsWith('192.168.') || ip.startsWith('10.') || ip.startsWith('172.')) {
                            resolved = true;
                            resolve(ip);
                            pc.close();
                        }
                    }
                }
            };

            setTimeout(() => {
                if (!resolved) {
                    resolved = true;
                    // Fallback: ลองใช้ IP ที่บันทึกไว้ หรือ common IP ranges
                    const savedIP = localStorage.getItem('lastESP32IP');
                    if (savedIP) {
                        const savedRange = savedIP.substring(0, savedIP.lastIndexOf('.'));
                        resolve(savedRange + '.1');
                    } else {
                        const commonRanges = ['192.168.1', '192.168.0', '192.168.4', '192.168.166'];
                        resolve(commonRanges[0] + '.1');
                    }
                    pc.close();
                }
            }, isMobile ? 2000 : 1000);
        });
    }

    getIPBase(ip) {
        const parts = ip.split('.');
        return `${parts[0]}.${parts[1]}.${parts[2]}`;
    }

    isDuplicateDevice(newDevice) {
        // ตรวจสอบว่า device นี้ซ้ำกับที่มีอยู่แล้วหรือไม่
        return this.devices.some(device => {
            // ตรวจสอบ mDNS name
            if (newDevice.mdns && device.mdns && newDevice.mdns === device.mdns) {
                return true;
            }
            // ตรวจสอบ IP address
            if (newDevice.ip && device.ip && newDevice.ip === device.ip) {
                return true;
            }
            // ตรวจสอบชื่ออุปกรณ์
            if (newDevice.name && device.name && newDevice.name === device.name) {
                return true;
            }
            return false;
        });
    }

    async checkMDNS(mdnsName) {
        console.log(`🔍 กำลังค้นหา mDNS: ${mdnsName}`);
        
        // ลองหลาย endpoint และหลายวิธี
        const endpoints = ['/info', '/status', '/'];
        const modes = ['cors', 'no-cors'];
        
        for (const endpoint of endpoints) {
            for (const mode of modes) {
                try {
                    const timeoutPromise = new Promise((_, reject) => 
                        setTimeout(() => reject(new Error('timeout')), 5000) // เพิ่ม timeout เป็น 5 วินาที
                    );

                    console.log(`  ลอง: ${mdnsName}${endpoint} (${mode})`);
                    
                    const fetchPromise = fetch(`http://${mdnsName}${endpoint}`, {
                        method: 'GET',
                        mode: mode,
                        cache: 'no-cache',
                        headers: mode === 'cors' ? {} : undefined
                    });

                    const response = await Promise.race([fetchPromise, timeoutPromise]);
                    
                    // ถ้า mode เป็น no-cors จะไม่สามารถอ่าน response ได้ แต่ถ้าไม่ error แสดงว่าเจอ
                    // แต่ในเบราว์เซอร์บางตัว no-cors อาจไม่ทำงานกับ mDNS
                    // ดังนั้นจะไม่ใช้ no-cors สำหรับ mDNS
                    if (mode === 'no-cors') {
                        // ข้าม no-cors สำหรับ mDNS เพราะอาจไม่ทำงาน
                        continue;
                    }
                    
                    if (response && response.ok) {
                        console.log(`  ✅ เจอด้วย cors: ${mdnsName}${endpoint}`);
                        let newDevice;
                        
                        // ถ้า endpoint เป็น /info ให้ดึงข้อมูล JSON
                        if (endpoint === '/info') {
                            try {
                                const info = await response.json();
                                newDevice = {
                                    ip: info.ip || mdnsName,
                                    mdns: mdnsName,
                                    name: info.name || 'ESP32 Controller',
                                    status: 'online',
                                    useMDNS: true
                                };
                            } catch (jsonError) {
                                // ถ้า parse JSON ไม่ได้ ให้ใช้ค่า default
                                newDevice = {
                                    ip: mdnsName,
                                    mdns: mdnsName,
                                    name: 'ESP32 Controller',
                                    status: 'online',
                                    useMDNS: true
                                };
                            }
                        } else {
                            // ถ้าเป็น endpoint อื่น ให้ใช้ค่า default
                            newDevice = {
                                ip: mdnsName,
                                mdns: mdnsName,
                                name: 'ESP32 Controller',
                                status: 'online',
                                useMDNS: true
                            };
                        }
                        
                        // ตรวจสอบ duplicate ก่อน push
                        if (!this.isDuplicateDevice(newDevice)) {
                            this.devices.push(newDevice);
                        }
                        return true;
                    }
                } catch (e) {
                    // ลองวิธีถัดไป
                    console.log(`  ❌ ไม่เจอ: ${mdnsName}${endpoint} (${mode}) - ${e.message}`);
                    continue;
                }
            }
        }
        
        console.log(`❌ ไม่พบ mDNS: ${mdnsName}`);
        return false;
    }

    async checkESP32(ip) {
        try {
            // ตรวจสอบว่า IP นี้ตรงกับ device ที่มี mDNS แล้วหรือไม่
            const existingDevice = this.devices.find(device => {
                // ถ้ามี device ที่มี IP ตรงกัน หรือมี mDNS แล้ว
                return (device.ip === ip) || 
                       (device.mdns === 'esp32-controller.local' && device.ip === ip);
            });
            
            if (existingDevice) {
                // ถ้ามีอยู่แล้วไม่ต้องตรวจสอบอีก
                return;
            }

            // ในมือถือใช้ timeout นานขึ้น
            const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
            const timeout = isMobile ? 1500 : 800;
            
            // Use Promise.race with timeout
            const timeoutPromise = new Promise((_, reject) => 
                setTimeout(() => reject(new Error('timeout')), timeout)
            );

            // Try to fetch ESP32 info endpoint
            const fetchPromise = fetch(`http://${ip}/info`, {
                method: 'GET',
                mode: 'cors',
                cache: 'no-cache'
            }).catch(() => {
                // If CORS fails, try status endpoint
                return fetch(`http://${ip}/status`, {
                    method: 'GET',
                    mode: 'no-cors',
                    cache: 'no-cache'
                });
            });

            const response = await Promise.race([fetchPromise, timeoutPromise]);
            
            // If we got a response, try to get device info
            try {
                const infoResponse = await fetch(`http://${ip}/info`, {
                    method: 'GET',
                    mode: 'cors',
                    cache: 'no-cache'
                });
                
                if (infoResponse.ok) {
                    const info = await infoResponse.json();
                    // ตรวจสอบว่าเป็น esp32-controller หรือไม่
                    const isController = info.name && info.name.includes('esp32-controller');
                    
                    // ถ้าเป็น esp32-controller และมี mDNS device อยู่แล้ว ไม่ต้องเพิ่ม
                    if (isController) {
                        const hasMDNSDevice = this.devices.some(device => 
                            device.mdns === 'esp32-controller.local' && device.ip === ip
                        );
                        if (hasMDNSDevice) {
                            return; // ไม่ต้องเพิ่มเพราะมี mDNS device อยู่แล้ว
                        }
                    }
                    
                    // ใช้ IP address จริงจาก info ถ้ามี
                    const realIP = info.ip || ip;
                    
                    const newDevice = {
                        ip: realIP, // ใช้ IP address จริง
                        mdns: isController ? 'esp32-controller.local' : null,
                        name: info.name || `ESP32-${realIP.split('.').pop()}`,
                        status: 'online',
                        useMDNS: isController
                    };
                    
                    // ตรวจสอบ duplicate ก่อน push
                    if (!this.isDuplicateDevice(newDevice)) {
                        this.devices.push(newDevice);
                        console.log(`✅ พบ ESP32: ${realIP} - ${newDevice.name}`);
                        
                        // บันทึก IP ไว้ใน localStorage
                        localStorage.setItem('lastESP32IP', realIP);
                        console.log(`💾 บันทึก IP: ${realIP}`);
                    }
                    return;
                }
            } catch (e) {
                // CORS might fail, but device responded
            }

            // If /info fails but device responded, add it anyway
            const newDevice = {
                ip: ip,
                mdns: null,
                name: `ESP32-${ip.split('.').pop()}`,
                status: 'online',
                useMDNS: false
            };
            
            // ตรวจสอบ duplicate ก่อน push
            if (!this.isDuplicateDevice(newDevice)) {
                this.devices.push(newDevice);
            }
        } catch (error) {
            // Device not found or not ESP32 - try alternative method
            await this.checkESP32Alternative(ip);
        }
    }

    async checkESP32Alternative(ip) {
        // Alternative method using Image loading
        return new Promise((resolve) => {
            const img = new Image();
            const timeout = setTimeout(() => {
                img.onload = null;
                img.onerror = null;
                resolve(false);
            }, 500);

            img.onload = () => {
                clearTimeout(timeout);
                const newDevice = {
                    ip: ip,
                    mdns: null,
                    name: `ESP32-${ip.split('.').pop()}`,
                    status: 'online',
                    useMDNS: false
                };
                
                // ตรวจสอบ duplicate ก่อน push
                if (!this.isDuplicateDevice(newDevice)) {
                    this.devices.push(newDevice);
                }
                resolve(true);
            };

            img.onerror = () => {
                clearTimeout(timeout);
                resolve(false);
            };

            img.src = `http://${ip}/favicon.ico?t=${Date.now()}`;
        });
    }

    displayDevices() {
        this.devicesList.innerHTML = '';
        
        if (this.devices.length === 0) {
            this.devicesList.innerHTML = '<p style="text-align: center; color: #666; padding: 20px;">ไม่พบ ESP32</p>';
            return;
        }
        
        this.devices.forEach(device => {
            const card = document.createElement('div');
            card.className = 'device-card';
            const address = device.useMDNS && device.mdns ? device.mdns : device.ip;
            const ipAddress = device.ip && device.ip !== device.mdns ? device.ip : (device.mdns ? 'กำลังหา IP...' : device.ip);
            
            card.innerHTML = `
                <h3>${device.name}</h3>
                <p><strong>IP Address:</strong> <a href="http://${ipAddress}" target="_blank" style="color: #667eea; text-decoration: none; font-weight: bold;">${ipAddress}</a></p>
                <p><strong>สถานะ:</strong> <span class="status-badge online">ออนไลน์</span></p>
            `;
            card.addEventListener('click', () => this.selectDevice(device));
            this.devicesList.appendChild(card);
        });
    }

    async selectDevice(device) {
        this.currentDevice = device;
        document.getElementById('deviceName').textContent = device.name;
        
        // ใช้ mDNS name เป็นหลัก ถ้ามี
        const address = device.useMDNS && device.mdns ? device.mdns : device.ip;
        document.getElementById('deviceIP').textContent = address;
        document.getElementById('deviceStatus').textContent = 'ออนไลน์';
        document.getElementById('deviceStatus').className = 'status-badge online';
        
        // แสดงสถานะว่ากำลังส่งข้อมูล
        this.scanStatus.textContent = `กำลังส่งข้อมูลไปที่ ${address}...`;
        this.scanStatus.className = 'status info';
        
        // ส่งข้อมูลไปที่ ESP32 ทันทีเมื่อเลือก
        await this.sendDiscoverySignal(device);
        
        // อัปเดตสถานะ
        this.scanStatus.textContent = `✅ ส่งข้อมูลไปที่ ${address} สำเร็จ!`;
        this.scanStatus.className = 'status success';
        
        this.deviceControl.classList.remove('hidden');
        
        // Setup arm selection buttons
        this.setupArmButtons();
        
        // Setup mode buttons
        this.setupModeButtons();
        
        // Setup voice control
        this.setupVoiceControl();
        
        // เริ่ม polling สำหรับดู progress
        this.startProgressPolling();
        
        // พูดว่าระบบพร้อม
        setTimeout(() => {
            this.speakReady();
        }, 500);
        
        // สร้าง HandGestureDetector เมื่อ deviceControl แสดงแล้ว (ไม่รองรับ iOS)
        if (!handGestureDetector && !this.isIOS) {
            try {
                handGestureDetector = new HandGestureDetector(this);
                console.log('✅ HandGestureDetector ถูกสร้างแล้ว');
            } catch (error) {
                console.error('❌ ไม่สามารถสร้าง HandGestureDetector ได้:', error);
            }
        } else if (this.isIOS) {
            console.log('ℹ️ iOS ตรวจพบ - ปิดฟีเจอร์กล้อง AI (ไม่รองรับ)');
            // ซ่อนปุ่มกล้อง
            const cameraSection = document.querySelector('.camera-control');
            if (cameraSection) {
                cameraSection.style.display = 'none';
            }
        }
    }

    startProgressPolling() {
        // หยุด polling เก่าก่อน (ถ้ามี)
        if (this.progressInterval) {
            clearInterval(this.progressInterval);
        }
        
        // เริ่ม polling ทุก 500ms
        this.progressInterval = setInterval(async () => {
            if (this.currentDevice) {
                await this.checkProgress();
            }
        }, 500);
    }

    stopProgressPolling() {
        if (this.progressInterval) {
            clearInterval(this.progressInterval);
            this.progressInterval = null;
        }
    }

    async checkProgress() {
        if (!this.currentDevice) return;
        
        const address = this.currentDevice.ip && this.currentDevice.ip !== this.currentDevice.mdns
            ? this.currentDevice.ip 
            : (this.currentDevice.mdns || this.currentDevice.ip);
        const baseUrl = `http://${address}`;
        
        try {
            const response = await fetch(`${baseUrl}/progress`, {
                method: 'GET',
                mode: 'cors',
                cache: 'no-cache'
            });
            
            if (response.ok) {
                const data = await response.json();
                this.updateProgressDisplay(data);
            }
        } catch (error) {
            // ถ้าไม่สามารถดึงข้อมูลได้ ไม่ต้องแสดงอะไร
        }
    }

    updateProgressDisplay(data) {
        const progressStatus = document.getElementById('progressStatus');
        
        // แปลงโหมดเป็น displayMode (1-4) สำหรับแสดงผล
        // โหมด 6-9 → แสดงเป็น 1-4
        let displayMode = data.mode;
        if (data.mode >= 6 && data.mode <= 9) {
            displayMode = data.mode - 5; // 6→1, 7→2, 8→3, 9→4
        }
        
        if (data.isRunning && data.mode >= 1 && data.mode <= 4) {
            // แสดง progress สำหรับโหมด 1, 2, 3, และ 4 (แขนขวา)
            progressStatus.textContent = `🔄 โหมด ${displayMode}: รอบที่ ${data.round}/${data.totalRounds} - ${data.action}`;
            progressStatus.className = 'progress-status running';
            
            // อัปเดตสถานะโหมดที่กำลังทำงาน (เก็บเป็น actualMode) - ยกเว้นโหมด 0 และ 5
            if (data.mode !== 0 && data.mode !== 5) {
                this.currentRunningMode = data.mode;
            }
        } else if (data.isRunning && data.mode >= 6 && data.mode <= 9) {
            // แสดง progress สำหรับโหมด 6-9 (แขนซ้าย) แต่แสดงเป็น 1-4
            progressStatus.textContent = `🔄 โหมด ${displayMode}: รอบที่ ${data.round}/${data.totalRounds} - ${data.action}`;
            progressStatus.className = 'progress-status running';
            
            // อัปเดตสถานะโหมดที่กำลังทำงาน (เก็บเป็น actualMode) - ยกเว้นโหมด 0 และ 5
            if (data.mode !== 0 && data.mode !== 5) {
                this.currentRunningMode = data.mode;
            }
        } else if (data.mode > 0 && !data.isRunning) {
            // แสดงว่าเสร็จแล้วหรือถูกหยุด
            if (data.action === "ถูกหยุด") {
                progressStatus.textContent = `🛑 โหมด ${displayMode} ถูกหยุด`;
                progressStatus.className = 'progress-status error';
            } else {
                progressStatus.textContent = `✅ โหมด ${displayMode} เสร็จสิ้น`;
                progressStatus.className = 'progress-status completed';
            }
            
            // รีเซ็ตสถานะโหมดที่กำลังทำงาน
            this.currentRunningMode = null;
            
            // รีเซ็ตสถานะ handGesture เมื่อโหมดเสร็จแล้ว (เรียกแค่ครั้งเดียว)
            if (handGestureDetector && !handGestureDetector.resetAfterModeCompleteCalled) {
                handGestureDetector.resetAfterModeCompleteCalled = true;
                handGestureDetector.resetAfterModeComplete();
                
                // รีเซ็ต flag หลังจาก 2 วินาที
                setTimeout(() => {
                    if (handGestureDetector) {
                        handGestureDetector.resetAfterModeCompleteCalled = false;
                    }
                }, 2000);
            }
            
            // รีเซ็ตหลังจาก 3 วินาที
            setTimeout(() => {
                progressStatus.textContent = '';
                progressStatus.className = '';
            }, 3000);
        } else {
            // ไม่มี progress - ไม่รีเซ็ต handGesture (เพื่อไม่ให้รีเซ็ตซ้ำๆ)
            progressStatus.textContent = '';
            progressStatus.className = '';
        }
    }

    setupModeButtons() {
        const modeButtons = document.querySelectorAll('.btn-mode');
        const modeStatus = document.getElementById('modeStatus');
        
        modeButtons.forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.preventDefault(); // ป้องกัน default behavior
                e.stopPropagation(); // หยุด event bubbling
                
                const mode = e.currentTarget.dataset.mode;
                
                console.log(`🔘 [DEBUG] กดปุ่มโหมด ${mode}`);
                
                // ตรวจสอบว่าเลือกแขนแล้วหรือยัง
                if (!this.selectedArm) {
                    modeStatus.textContent = '⚠️ กรุณาเลือกแขนก่อน';
                    modeStatus.className = 'mode-status error';
                    this.speakSelectArm();
                    
                    setTimeout(() => {
                        modeStatus.textContent = '';
                        modeStatus.className = '';
                    }, 3000);
                    return;
                }
                
                // แปลงโหมดตามแขนที่เลือก
                const displayMode = parseInt(mode); // โหมดที่แสดงและเล่นเสียง: 1-5
                let actualMode; // โหมดที่ส่งไป ESP32
                if (this.selectedArm === 'right') {
                    actualMode = displayMode; // แขนขวา: 1-5
                } else {
                    // แขนซ้าย: โหมด 1-4 → 6-9, โหมด 5 → 5 (หยุด)
                    actualMode = displayMode === 5 ? 5 : displayMode + 5;
                }
                const armName = this.selectedArm === 'right' ? 'แขนขวา' : 'แขนซ้าย';
                
                // แสดงสถานะว่ากำลังส่ง (แสดงเป็น displayMode เสมอ)
                modeStatus.textContent = `⏳ กำลังส่งโหมด ${displayMode}...`;
                modeStatus.className = 'mode-status info';
                
                // Update button states - เปลี่ยนเป็นสีชมพูทันที
                modeButtons.forEach(b => b.classList.remove('active'));
                e.currentTarget.classList.add('active');
                
                // พูดแจ้งเตือน - ไม่พูดชื่อแขน (เพราะกดปุ่มเอง รู้อยู่แล้วว่าเลือกแขนไหน)
                this.speakMode(displayMode, '');
                
                // ส่งโหมด (ส่ง actualMode ไป ESP32 แต่แสดงเป็น displayMode)
                const success = await this.sendMode(actualMode);
                
                // แสดงสถานะผลลัพธ์ (แสดงเป็น displayMode เสมอ)
                if (success) {
                    modeStatus.textContent = `✅ ส่งเสร็จแล้ว - โหมด ${displayMode}`;
                    modeStatus.className = 'mode-status success';
                    
                    // แสดงข้อความชัดเจนเป็นเวลา 3 วินาที
                    setTimeout(() => {
                        if (modeStatus.textContent.includes('ส่งเสร็จแล้ว')) {
                            modeStatus.textContent = '';
                            modeStatus.className = '';
                        }
                    }, 3000);
                } else {
                    // ถ้าส่งไม่สำเร็จ ให้ลบ active state
                    e.currentTarget.classList.remove('active');
                    modeStatus.textContent = `❌ ส่งโหมด ${displayMode} ไม่สำเร็จ`;
                    modeStatus.className = 'mode-status error';
                }
            });
        });
    }

    // ตั้งค่า Connection Mode Modal
    setupConnectionModeModal() {
        const connectionModeBtn = document.getElementById('connectionModeBtn');
        const modal = document.getElementById('connectionModeModal');
        const modalClose = document.getElementById('modalClose');
        const connectionOptions = document.querySelectorAll('.connection-option');
        
        // เปิด modal
        connectionModeBtn.addEventListener('click', () => {
            modal.style.display = 'block';
            document.body.style.overflow = 'hidden';
        });
        
        // ปิด modal
        const closeModal = () => {
            modal.style.display = 'none';
            document.body.style.overflow = 'auto';
        };
        
        modalClose.addEventListener('click', closeModal);
        
        // ปิด modal เมื่อคลิกนอก modal
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeModal();
            }
        });
        
        // เลือก connection mode
        connectionOptions.forEach(option => {
            option.addEventListener('click', () => {
                const mode = option.dataset.mode;
                this.setConnectionMode(mode);
                
                // อัปเดต UI
                connectionOptions.forEach(opt => opt.classList.remove('selected'));
                option.classList.add('selected');
                
                // ปิด modal หลังจาก 1 วินาที
                setTimeout(() => {
                    closeModal();
                }, 1000);
            });
        });
        
        // ตั้งค่าเริ่มต้น
        this.setConnectionMode(this.connectionMode);
        this.updateConnectionModeIndicator();
    }
    
    // ตั้งค่า Connection Mode
    setConnectionMode(mode) {
        this.connectionMode = mode;
        
        if (mode === 'firebase') {
            this.useFirebase = true;
            console.log('🔥 เปลี่ยนเป็น Firebase Mode');
        } else {
            this.useFirebase = false;
            console.log('🌐 เปลี่ยนเป็น IP Mode');
        }
        
        // บันทึกการตั้งค่า
        localStorage.setItem('connectionMode', mode);
        
        // อัปเดต UI
        this.updateConnectionModeIndicator();
        this.updateScanButtonText();
    }
    
    // อัปเดต Connection Mode Indicator
    updateConnectionModeIndicator() {
        // ลบ indicator เก่า (ถ้ามี)
        const existingIndicator = document.querySelector('.connection-mode-indicator');
        if (existingIndicator) {
            existingIndicator.remove();
        }
        
        // สร้าง indicator ใหม่
        const indicator = document.createElement('div');
        indicator.className = `connection-mode-indicator ${this.connectionMode}-mode`;
        
        if (this.connectionMode === 'firebase') {
            indicator.innerHTML = '🔥 Firebase Mode';
        } else {
            indicator.innerHTML = '🌐 IP Mode';
        }
        
        document.body.appendChild(indicator);
    }
    
    // อัปเดตข้อความปุ่มค้นหา
    updateScanButtonText() {
        const scanBtnText = document.getElementById('scanBtnText');
        
        if (this.connectionMode === 'firebase') {
            scanBtnText.textContent = 'เชื่อมต่อ Firebase';
        } else {
            scanBtnText.textContent = 'ค้นหา ESP32 อัตโนมัติ';
        }
    }

    // เริ่มต้น Firebase
    async initFirebase() {
        try {
            // รอให้ FirebaseManager โหลดเสร็จ
            if (typeof FirebaseManager !== 'undefined') {
                this.firebaseManager = new FirebaseManager();
                const connected = await this.firebaseManager.testConnection();
                
                if (connected) {
                    this.useFirebase = true;
                    console.log('🔥 Firebase พร้อมใช้งาน');
                    
                    // เริ่มฟังสถานะจาก Firebase
                    this.firebaseManager.listenToProgress((data) => {
                        this.updateProgress(data);
                    });
                    
                    // ส่งสถานะว่าออนไลน์
                    this.firebaseManager.sendDeviceStatus('online');
                    
                    // แสดงปุ่ม Firebase Mode
                    this.showFirebaseMode();
                } else {
                    console.log('⚠️ Firebase เชื่อมต่อไม่ได้ - ใช้โหมด Direct IP');
                }
            } else {
                console.log('⚠️ FirebaseManager ไม่พบ - ใช้โหมด Direct IP');
            }
        } catch (error) {
            console.error('❌ Firebase initialization error:', error);
        }
    }
    
    // แสดงปุ่ม Firebase Mode
    showFirebaseMode() {
        const deviceList = document.getElementById('deviceList');
        
        // เพิ่มปุ่ม Firebase Mode
        const firebaseDevice = document.createElement('div');
        firebaseDevice.className = 'device-item firebase-mode';
        firebaseDevice.innerHTML = `
            <div class="device-info">
                <div class="device-name">🔥 Firebase Mode</div>
                <div class="device-details">ใช้ Firebase เป็นตัวกลาง (เหมาะสำหรับ iOS)</div>
            </div>
            <button class="btn-connect" data-firebase="true">เชื่อมต่อ</button>
        `;
        
        // เพิ่มที่ด้านบนของรายการ
        deviceList.insertBefore(firebaseDevice, deviceList.firstChild);
        
        // เพิ่ม event listener
        const connectBtn = firebaseDevice.querySelector('.btn-connect');
        connectBtn.addEventListener('click', () => {
            this.connectFirebaseMode();
        });
    }
    
    // เชื่อมต่อ Firebase Mode
    connectFirebaseMode() {
        // อัปเดต scan status
        this.scanStatus.textContent = '🔥 กำลังเชื่อมต่อ Firebase...';
        this.scanStatus.className = 'status info';
        
        // ตรวจสอบ Firebase
        if (!this.firebaseManager) {
            this.scanStatus.textContent = '❌ Firebase ไม่พร้อมใช้งาน - กรุณาตั้งค่า Firebase ก่อน';
            this.scanStatus.className = 'status error';
            this.isScanning = false;
            this.scanBtn.disabled = false;
            this.scanBtn.classList.remove('scanning');
            return;
        }
        
        this.currentDevice = {
            name: 'Firebase Mode',
            ip: 'FIREBASE-MODE',
            mdns: 'firebase.local',
            isFirebase: true
        };
        
        // อัปเดต UI
        this.scanStatus.textContent = '✅ เชื่อมต่อ Firebase สำเร็จ!';
        this.scanStatus.className = 'status success';
        
        const deviceStatus = document.getElementById('deviceStatus');
        deviceStatus.textContent = '🔥 เชื่อมต่อผ่าน Firebase';
        deviceStatus.className = 'device-status connected';
        
        // แสดงข้อมูลอุปกรณ์
        document.getElementById('deviceName').textContent = 'Firebase Mode';
        document.getElementById('deviceIP').textContent = 'Cloud Database';
        
        // แสดงส่วนควบคุม
        const deviceControl = document.getElementById('deviceControl');
        deviceControl.style.display = 'block';
        deviceControl.classList.remove('hidden');
        
        // รีเซ็ตสถานะ scanning
        this.isScanning = false;
        this.scanBtn.disabled = false;
        this.scanBtn.classList.remove('scanning');
        
        // เริ่ม progress monitoring
        this.startProgressMonitoring();
        
        console.log('🔥 เชื่อมต่อ Firebase Mode สำเร็จ');
    }

    async sendMode(mode) {
        if (!this.currentDevice) {
            const modeStatus = document.getElementById('modeStatus');
            modeStatus.textContent = `❌ ไม่พบ ESP32 - กรุณาค้นหาก่อน`;
            modeStatus.className = 'mode-status error';
            console.error('❌ ไม่พบ ESP32 device');
            return false;
        }
        
        // ถ้าอยู่ในโหมดทดสอบ ไม่ต้องส่งจริง
        if (this.currentDevice.ip === 'TEST-MODE') {
            // แปลงโหมด 6-9 เป็น 1-4 สำหรับแสดงผล
            const displayMode = (parseInt(mode) >= 6 && parseInt(mode) <= 9) ? (parseInt(mode) - 5) : parseInt(mode);
            console.log(`🧪 [TEST MODE] จำลองการส่งโหมด ${displayMode} (ส่งจริง: ${mode}) (ไม่ได้ส่งจริง)`);
            return true; // return success เพื่อให้ UI แสดงว่าส่งสำเร็จ
        }
        
        // ถ้าใช้ Firebase Mode
        if (this.currentDevice.ip === 'FIREBASE-MODE' && this.firebaseManager) {
            // แปลงโหมด 6-9 เป็น 1-4 สำหรับแสดงผล
            const displayMode = (parseInt(mode) >= 6 && parseInt(mode) <= 9) ? (parseInt(mode) - 5) : parseInt(mode);
            console.log(`🔥 [FIREBASE MODE] ส่งโหมด ${displayMode} (ส่งจริง: ${mode}) ผ่าน Firebase`);
            
            const success = await this.firebaseManager.sendMode(mode, this.selectedArm || 'right');
            
            // ถ้าเป็นโหมด 5 (หยุด) ให้รีเซ็ตสถานะทันที
            if (parseInt(mode) === 5) {
                this.currentRunningMode = null;
                console.log('🛑 รีเซ็ตสถานะโหมดทันทีหลังส่งโหมด 5 (Firebase)');
            }
            
            return success;
        }
        
        // ใช้ IP address แทน mDNS เพราะ mDNS อาจไม่ทำงาน
        // ถ้า device มี IP จริงให้ใช้ IP, ถ้าไม่มีให้ใช้ mDNS name
        const address = this.currentDevice.ip && this.currentDevice.ip !== this.currentDevice.mdns
            ? this.currentDevice.ip 
            : (this.currentDevice.mdns || this.currentDevice.ip);
        const baseUrl = `http://${address}`;
        const modeUrl = `${baseUrl}/mode`;
        
        // แปลงโหมด 6-9 เป็น 1-4 สำหรับแสดงผล
        const displayMode = (parseInt(mode) >= 6 && parseInt(mode) <= 9) ? (parseInt(mode) - 5) : parseInt(mode);
        console.log(`📡 กำลังส่งโหมด ${displayMode} (ส่งจริง: ${mode}) ไปที่ ${modeUrl}`);
        console.log(`📦 Device info:`, this.currentDevice);
        
        try {
            // ส่งโหมดไปที่ ESP32 ด้วย POST method พร้อม arm
            console.log(`🔄 ส่ง POST request ไปที่ ${modeUrl}`);
            const payload = { 
                mode: parseInt(mode),
                arm: this.selectedArm || 'right'  // ส่ง arm ด้วย
            };
            console.log(`📦 Payload:`, payload);
            const response = await fetch(modeUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload),
                mode: 'cors',
                cache: 'no-cache'
            });
            
            console.log(`📥 Response status: ${response.status}`);
            console.log(`📥 Response ok: ${response.ok}`);
            
            if (response.ok) {
                const data = await response.text();
                console.log(`✅ ส่งโหมด ${displayMode} (ส่งจริง: ${mode}) ไปที่ ${modeUrl} สำเร็จ:`, data);
                
                // ถ้าเป็นโหมด 5 (หยุด) ให้รีเซ็ตสถานะทันที
                if (parseInt(mode) === 5) {
                    this.currentRunningMode = null;
                    console.log('🛑 รีเซ็ตสถานะโหมดทันทีหลังส่งโหมด 5');
                }
                
                return true;
            } else {
                console.error(`❌ ส่งโหมด ${displayMode} (ส่งจริง: ${mode}) ไม่สำเร็จ: ${response.status} ${response.statusText}`);
                return false;
            }
        } catch (error) {
            console.error(`❌ POST request failed:`, error);
            // ถ้า CORS ไม่ได้ ลองใช้ GET method
            try {
                const getUrl = `${baseUrl}/mode?mode=${mode}`;
                console.log(`🔄 ลองส่ง GET request ไปที่ ${getUrl}`);
                await fetch(getUrl, {
                    method: 'GET',
                    mode: 'no-cors',
                    cache: 'no-cache'
                });
                console.log(`✅ ส่งโหมด ${displayMode} (ส่งจริง: ${mode}) ไปที่ ${baseUrl} (GET method - no-cors)`);
                
                // ถ้าเป็นโหมด 5 (หยุด) ให้รีเซ็ตสถานะทันที
                if (parseInt(mode) === 5) {
                    this.currentRunningMode = null;
                    console.log('🛑 รีเซ็ตสถานะโหมดทันทีหลังส่งโหมด 5 (GET)');
                }
                
                return true;
            } catch (e) {
                console.error('❌ GET request ก็ล้มเหลว:', e);
                return false;
            }
        }
    }

    async sendDiscoverySignal(device) {
        // ใช้ IP address แทน mDNS เพราะ mDNS อาจไม่ทำงาน
        // ถ้า device มี IP จริงให้ใช้ IP, ถ้าไม่มีให้ใช้ mDNS name
        const address = device.ip && device.ip !== device.mdns ? device.ip : (device.mdns || device.ip);
        const baseUrl = `http://${address}`;
        
        console.log(`📡 กำลังส่งสัญญาณไปที่ ${baseUrl}`);
        
        // ส่ง request ไปหลาย endpoint เพื่อให้แน่ใจว่า ESP32 ได้รับสัญญาณ
        const endpoints = ['/', '/info', '/status'];
        
        for (const endpoint of endpoints) {
            try {
                // ลองใช้ cors ก่อน
                try {
                    const response = await fetch(`${baseUrl}${endpoint}`, {
                        method: 'GET',
                        mode: 'cors',
                        cache: 'no-cache'
                    });
                    if (response.ok) {
                        console.log(`✅ ส่งสัญญาณไปที่ ${baseUrl}${endpoint} สำเร็จ (CORS)`);
                    }
                } catch (corsError) {
                    // ถ้า CORS ไม่ได้ ลองใช้ no-cors
                    try {
                        await fetch(`${baseUrl}${endpoint}`, {
                            method: 'GET',
                            mode: 'no-cors',
                            cache: 'no-cache'
                        });
                        console.log(`✅ ส่งสัญญาณไปที่ ${baseUrl}${endpoint} สำเร็จ (no-cors)`);
                    } catch (noCorsError) {
                        console.warn(`⚠️ ไม่สามารถส่งไปที่ ${baseUrl}${endpoint} ได้`);
                    }
                }
            } catch (error) {
                console.warn(`⚠️ เกิดข้อผิดพลาดในการส่งไปที่ ${baseUrl}${endpoint}:`, error);
            }
            
            // หน่วงเวลานิดหน่อยระหว่าง request
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        console.log(`📡 ส่งสัญญาณค้นหาไปที่ ${baseUrl} เสร็จสิ้น`);
    }

    setupArmButtons() {
        const armButtons = document.querySelectorAll('.btn-arm');
        
        armButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const arm = e.currentTarget.dataset.arm;
                
                // Update selected arm
                this.selectedArm = arm;
                
                // Update button states
                armButtons.forEach(b => b.classList.remove('active'));
                e.currentTarget.classList.add('active');
                
                // แสดงข้อความแจ้งเตือน
                const armName = arm === 'right' ? 'แขนขวา' : 'แขนซ้าย';
                const modeStatus = document.getElementById('modeStatus');
                modeStatus.textContent = `✅ เลือก${armName}แล้ว`;
                modeStatus.className = 'mode-status success';
                
                // พูดแจ้งเตือน - ใช้ LanguageManager
                this.speakArmSelected(arm);
                
                setTimeout(() => {
                    if (modeStatus.textContent.includes('เลือก')) {
                        modeStatus.textContent = '';
                        modeStatus.className = '';
                    }
                }, 2000);
            });
        });
    }

    setupVoiceControl() {
        const startVoiceBtn = document.getElementById('startVoiceBtn');
        const stopVoiceBtn = document.getElementById('stopVoiceBtn');
        const voiceStatus = document.getElementById('voiceStatus');
        
        // ตรวจสอบว่า element มีอยู่จริงหรือไม่
        if (!startVoiceBtn || !stopVoiceBtn || !voiceStatus) {
            console.warn('⚠️ ไม่พบ element สำหรับ Voice Control');
            return;
        }
        
        // ตรวจสอบว่าเบราว์เซอร์รองรับ Speech Recognition หรือไม่
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        
        if (!SpeechRecognition) {
            voiceStatus.textContent = '❌ เบราว์เซอร์นี้ไม่รองรับการสั่งงานด้วยเสียง';
            voiceStatus.className = 'voice-status error';
            startVoiceBtn.disabled = true;
            return;
        }
        
        this.recognition = new SpeechRecognition();
        this.recognition.lang = 'th-TH';
        this.recognition.continuous = true;
        this.recognition.interimResults = true; // เปลี่ยนเป็น true เพื่อให้ได้ผลลัพธ์เร็วขึ้น
        this.recognition.maxAlternatives = 1; // ใช้ผลลัพธ์แรกเท่านั้น
        
        this.recognition.onstart = () => {
            this.isListening = true;
            voiceStatus.textContent = '🎤 กำลังฟังคำสั่ง...';
            voiceStatus.className = 'voice-status listening';
            startVoiceBtn.classList.add('hidden');
            stopVoiceBtn.classList.remove('hidden');
        };
        
        this.recognition.onend = () => {
            console.log('🎤 Recognition ended, isListening:', this.isListening);
            
            // ถ้ายังอยู่ในโหมดฟัง (ไม่ได้กดหยุด) ให้เริ่มฟังใหม่อัตโนมัติ
            if (this.isListening) {
                console.log('🎤 เริ่มฟังใหม่อัตโนมัติ...');
                // ใช้ setTimeout เล็กน้อยเพื่อให้ recognition พร้อม
                setTimeout(() => {
                    if (this.isListening) { // เช็คอีกครั้งเผื่อถูกหยุดระหว่างรอ
                        try {
                            this.recognition.start();
                        } catch (e) {
                            console.error('🎤 ไม่สามารถเริ่มฟังใหม่:', e);
                            // ถ้าเริ่มไม่ได้ ให้รีเซ็ตสถานะ
                            this.isListening = false;
                            voiceStatus.textContent = '';
                            voiceStatus.className = '';
                            startVoiceBtn.classList.remove('hidden');
                            stopVoiceBtn.classList.add('hidden');
                        }
                    }
                }, 300); // รอ 300ms ให้ recognition พร้อม
            } else {
                // ถ้ากดหยุดแล้ว ให้รีเซ็ตสถานะปกติ
                voiceStatus.textContent = '';
                voiceStatus.className = '';
                startVoiceBtn.classList.remove('hidden');
                stopVoiceBtn.classList.add('hidden');
            }
        };
        
        this.recognition.onerror = (event) => {
            console.error('Speech recognition error:', event.error);
            voiceStatus.textContent = `❌ เกิดข้อผิดพลาด: ${event.error}`;
            voiceStatus.className = 'voice-status error';
        };
        
        this.recognition.onresult = (event) => {
            const last = event.results.length - 1;
            const result = event.results[last];
            const transcript = result[0].transcript.toLowerCase().trim();
            const isFinal = result.isFinal;
            
            console.log('🎤 ได้ยิน:', transcript, isFinal ? '(final)' : '(interim)');
            
            // ประมวลผลทันทีถ้าเป็นตัวเลข 1-9 (ไม่ต้องรอ final)
            if (/^(\d+|หนึ่ง|สอง|สาม|สี่|ห้า|หก|เจ็ด|แปด|เก้า)$/.test(transcript)) {
                console.log('🎤 ตรวจพบตัวเลข - ประมวลผลทันที');
                this.processVoiceCommand(transcript);
            } else if (isFinal) {
                // ถ้าไม่ใช่ตัวเลขเดี่ยว ให้รอ final result
                this.processVoiceCommand(transcript);
            }
        };
        
        startVoiceBtn.addEventListener('click', () => {
            if (this.recognition) {
                this.isListening = true; // ตั้งค่าให้ฟังต่อเนื่อง
                this.recognition.start();
                console.log('🎤 เริ่มฟังคำสั่งเสียง (ต่อเนื่อง)');
            }
        });
        
        stopVoiceBtn.addEventListener('click', () => {
            if (this.recognition) {
                this.isListening = false; // ตั้งค่าให้หยุดฟัง
                this.recognition.stop();
                console.log('🎤 หยุดฟังคำสั่งเสียง');
            }
        });
    }

    processVoiceCommand(transcript) {
        const voiceStatus = document.getElementById('voiceStatus');
        
        console.log('🎤 [DEBUG] ได้ยิน:', transcript);
        
        // ป้องกันการรับคำสั่งซ้ำภายใน 3 วินาที (เพิ่มจาก 2 เป็น 3)
        const now = Date.now();
        if (this.lastVoiceCommand === transcript && (now - this.lastVoiceCommandTime) < 3000) {
            console.log('🎤 [DEBUG] ข้ามคำสั่งซ้ำ');
            return;
        }
        this.lastVoiceCommand = transcript;
        this.lastVoiceCommandTime = now;
        
        // ตรวจสอบคำสั่ง "หยุด" หรือ "stop"
        if (transcript.includes('หยุด') || transcript.includes('stop')) {
            console.log('🎤 [DEBUG] ได้ยินคำสั่ง: หยุด');
            
            // รีเซ็ตสถานะโหมดที่กำลังทำงาน
            this.currentRunningMode = null;
            
            // ส่งโหมด 5 (หยุด)
            voiceStatus.textContent = '🎤 กำลังหยุดการทำงาน...';
            voiceStatus.className = 'voice-status info';
            
            // หยุดฟังชั่วคราวขณะเล่นเสียง (แต่ยังคงสถานะ isListening ไว้)
            const wasListening = this.isListening;
            if (this.recognition) {
                this.recognition.stop();
            }
            
            this.speakMode(5, '');
            this.sendMode('5');
            
            // อัปเดตปุ่มโหมด
            const modeButtons = document.querySelectorAll('.btn-mode');
            modeButtons.forEach(btn => {
                if (btn.dataset.mode === '5') {
                    btn.classList.add('active');
                } else {
                    btn.classList.remove('active');
                }
            });
            
            // เปิดฟังใหม่หลังจาก 2 วินาที (ถ้าเดิมกำลังฟังอยู่)
            setTimeout(() => {
                if (wasListening && this.recognition) {
                    voiceStatus.textContent = '🎤 กำลังฟังคำสั่ง...';
                    voiceStatus.className = 'voice-status listening';
                    this.isListening = true;
                    // ไม่ต้อง start ใหม่ เพราะ onend จะ start อัตโนมัติ
                    // แต่ถ้า recognition หยุดไปแล้ว ให้ start
                    setTimeout(() => {
                        if (this.isListening) {
                            try {
                                this.recognition.start();
                            } catch (e) {
                                console.log('ℹ️ Recognition กำลังทำงานอยู่แล้ว หรือจะเริ่มเอง');
                            }
                        }
                    }, 100);
                }
            }, 2000);
            return;
        }
        
        // ตรวจสอบว่าเป็นตัวเลข 1-9 โดยตรง (ไม่รวม 5)
        const directNumberMatch = transcript.match(/(\d+|หนึ่ง|สอง|สาม|สี่|หก|เจ็ด|แปด|เก้า)/);
        
        if (directNumberMatch) {
            let modeNumber = directNumberMatch[1];
            
            // แปลงคำเป็นตัวเลข
            const thaiNumbers = {
                'หนึ่ง': 1,
                'สอง': 2,
                'สาม': 3,
                'สี่': 4,
                'หก': 6,
                'เจ็ด': 7,
                'แปด': 8,
                'เก้า': 9
            };
            
            if (thaiNumbers[modeNumber]) {
                modeNumber = thaiNumbers[modeNumber];
            } else {
                modeNumber = parseInt(modeNumber);
            }
            
            // ข้ามถ้าเป็น 5 (ใช้คำว่า "หยุด" แทน)
            if (modeNumber === 5) {
                return;
            }
            
            console.log('🎤 [DEBUG] แปลงเป็นโหมด:', modeNumber);
            
            // ตรวจสอบว่ากำลังทำงานโหมดอยู่หรือไม่
            if (this.currentRunningMode !== null && modeNumber !== 5) {
                // ถ้ากำลังทำงานอยู่และไม่ใช่คำสั่งหยุด (5) ให้ข้าม
                // แปลงโหมด 6-9 เป็น 1-4 สำหรับแสดงผล
                const displayRunningMode = (this.currentRunningMode >= 6 && this.currentRunningMode <= 9) 
                    ? (this.currentRunningMode - 5) 
                    : this.currentRunningMode;
                console.log('🎤 [DEBUG] กำลังทำงานโหมด', displayRunningMode, '(จริง:', this.currentRunningMode, ') อยู่ - ข้ามคำสั่ง');
                voiceStatus.textContent = `⚠️ กำลังทำงานโหมด ${displayRunningMode} อยู่ - พูด "หยุด" เพื่อหยุดก่อน`;
                voiceStatus.className = 'voice-status error';
                
                setTimeout(() => {
                    voiceStatus.textContent = '🎤 กำลังฟังคำสั่ง...';
                    voiceStatus.className = 'voice-status listening';
                }, 2000);
                return;
            }
            
            // ตรวจสอบว่าเป็นโหมด 1-9
            if (modeNumber >= 1 && modeNumber <= 9) {
                let actualMode = modeNumber;
                let displayMode = modeNumber;
                let armName = '';
                let armChanged = false; // ตรวจสอบว่าเปลี่ยนแขนหรือไม่
                
                // เก็บแขนเดิมไว้เพื่อเปรียบเทียบ
                const previousArm = this.selectedArm;
                
                // ถ้าเป็นโหมด 6-9 → เปลี่ยนเป็นแขนซ้ายอัตโนมัติ
                if (modeNumber >= 6 && modeNumber <= 9) {
                    // ตรวจสอบว่าเปลี่ยนแขนหรือไม่
                    if (this.selectedArm !== 'left') {
                        armChanged = true;
                    }
                    
                    // เปลี่ยนเป็นแขนซ้าย
                    this.selectedArm = 'left';
                    armName = 'แขนซ้าย';
                    
                    // อัปเดตปุ่มแขน
                    const armButtons = document.querySelectorAll('.btn-arm');
                    armButtons.forEach(btn => {
                        if (btn.dataset.arm === 'left') {
                            btn.classList.add('active');
                        } else {
                            btn.classList.remove('active');
                        }
                    });
                    
                    console.log('🎤 [DEBUG] เปลี่ยนเป็นแขนซ้ายอัตโนมัติ, ส่งโหมด:', actualMode);
                } else if (modeNumber >= 1 && modeNumber <= 5) {
                    // โหมด 1-4 → เปลี่ยนเป็นแขนขวาอัตโนมัติ (เพราะโหมด 1-4 อยู่ที่แขนขวา)
                    // โหมด 5 → หยุด (ไม่เปลี่ยนแขน)
                    if (modeNumber >= 1 && modeNumber <= 4) {
                        // ตรวจสอบว่าเปลี่ยนแขนหรือไม่
                        if (this.selectedArm !== 'right') {
                            armChanged = true;
                        }
                        
                        // เปลี่ยนเป็นแขนขวา
                        this.selectedArm = 'right';
                        armName = 'แขนขวา';
                        
                        // อัปเดตปุ่มแขน
                        const armButtons = document.querySelectorAll('.btn-arm');
                        armButtons.forEach(btn => {
                            if (btn.dataset.arm === 'right') {
                                btn.classList.add('active');
                            } else {
                                btn.classList.remove('active');
                            }
                        });
                        
                        console.log('🎤 [DEBUG] เปลี่ยนเป็นแขนขวาอัตโนมัติ, ส่งโหมด:', modeNumber);
                        
                        // แปลงโหมด (แขนขวา: 1-4)
                        actualMode = modeNumber;
                    } else if (modeNumber === 5) {
                        // โหมด 5 = หยุด (ไม่เปลี่ยนแขน)
                        armName = this.selectedArm === 'right' ? 'แขนขวา' : 'แขนซ้าย';
                        actualMode = 5; // หยุดทุกอย่าง
                        
                        console.log('🎤 [DEBUG] โหมด 5 (หยุด)');
                    }
                }
                
                // บันทึกโหมดที่กำลังทำงาน
                if (modeNumber === 5) {
                    // โหมด 5 = หยุด
                    this.currentRunningMode = null;
                } else {
                    // โหมด 1-4, 6-9 = กำลังทำงาน
                    this.currentRunningMode = actualMode;
                }
                
                // แสดงข้อความในเว็บ (แสดงเป็น displayMode เสมอ)
                voiceStatus.textContent = `🎤 กำลังเริ่ม${armChanged ? armName : ''} โหมดที่ ${displayMode}`;
                voiceStatus.className = 'voice-status info';
                
                // หยุดฟังชั่วคราวขณะเล่นเสียง (แต่ยังคงสถานะ isListening ไว้)
                const wasListening = this.isListening;
                if (this.recognition) {
                    this.recognition.stop();
                }
                
                // พูดแจ้งเตือน - พูดชื่อแขนเฉพาะตอนเปลี่ยนแขน
                this.speakMode(displayMode, armChanged ? armName : '');
                
                // ส่งคำสั่งไปที่ ESP32
                this.sendMode(actualMode.toString());
                
                // เปิดฟังใหม่หลังจาก 2 วินาที (ถ้าเดิมกำลังฟังอยู่)
                setTimeout(() => {
                    if (wasListening && this.recognition) {
                        this.isListening = true;
                        // ไม่ต้อง start ใหม่ เพราะ onend จะ start อัตโนมัติ
                        // แต่ถ้า recognition หยุดไปแล้ว ให้ start
                        setTimeout(() => {
                            if (this.isListening) {
                                try {
                                    this.recognition.start();
                                } catch (e) {
                                    console.log('ℹ️ Recognition กำลังทำงานอยู่แล้ว หรือจะเริ่มเอง');
                                }
                            }
                        }, 100);
                    }
                }, 2000);
                
                // อัปเดตปุ่มโหมด (แสดงโหมด 1-5 เสมอ)
                const modeButtons = document.querySelectorAll('.btn-mode');
                modeButtons.forEach(btn => {
                    const btnMode = parseInt(btn.dataset.mode);
                    // ถ้าเป็นโหมด 6-9 ให้แสดงปุ่มโหมด 1-4 แทน
                    if (modeNumber >= 6 && modeNumber <= 9) {
                        if (btnMode === (modeNumber - 5)) {
                            btn.classList.add('active');
                        } else {
                            btn.classList.remove('active');
                        }
                    } else {
                        if (btnMode === modeNumber) {
                            btn.classList.add('active');
                        } else {
                            btn.classList.remove('active');
                        }
                    }
                });
                
                setTimeout(() => {
                    if (voiceStatus.textContent.includes('กำลังเริ่ม')) {
                        voiceStatus.textContent = '🎤 กำลังฟังคำสั่ง...';
                        voiceStatus.className = 'voice-status listening';
                    }
                }, 3000);
            } else {
                voiceStatus.textContent = `❌ โหมด ${modeNumber} ไม่ถูกต้อง (ใช้ได้เฉพาะ 1-9)`;
                voiceStatus.className = 'voice-status error';
                
                setTimeout(() => {
                    voiceStatus.textContent = '🎤 กำลังฟังคำสั่ง...';
                    voiceStatus.className = 'voice-status listening';
                }, 2000);
            }
        }
    }

    speak(text) {
        console.log('🔊 กำลังพูด:', text);
        
        // หยุดเสียงเก่าก่อน (ถ้ามี)
        window.speechSynthesis.cancel();
        
        // รอสักครู่แล้วค่อยพูด
        setTimeout(() => {
            // ใช้ Web Speech API พูดข้อความภาษาไทย
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.lang = 'en-US';
            utterance.rate = 0.9;
            utterance.pitch = 1.0;
            utterance.volume = 1.0;
            
            // พยายามหาเสียงภาษาไทย
            const voices = window.speechSynthesis.getVoices();
            console.log('🔊 เสียงทั้งหมด:', voices.length);
            
            // ลองหาเสียงภาษาไทยหลายแบบ
            let thaiVoice = voices.find(voice => voice.lang === 'th-TH');
            
            if (!thaiVoice) {
                thaiVoice = voices.find(voice => voice.lang.startsWith('th'));
            }
            
            if (!thaiVoice) {
                thaiVoice = voices.find(voice => 
                    voice.name.toLowerCase().includes('thai') ||
                    voice.name.includes('ไทย') ||
                    voice.name.includes('Kanya')
                );
            }
            
            // ถ้ายังไม่เจอ ใช้เสียงแรกที่มี
            if (!thaiVoice && voices.length > 0) {
                thaiVoice = voices[0];
            }
            
            if (thaiVoice) {
                utterance.voice = thaiVoice;
                console.log('✅ ใช้เสียง:', thaiVoice.name, '(', thaiVoice.lang, ')');
            } else {
                console.log('⚠️ ไม่พบเสียง - ใช้เสียงเริ่มต้นของระบบ');
            }
            
            utterance.onstart = () => {
                console.log('✅ เริ่มพูดแล้ว');
            };
            
            utterance.onend = () => {
                console.log('✅ พูดเสร็จแล้ว');
            };
            
            utterance.onerror = (event) => {
                console.error('❌ เกิดข้อผิดพลาดในการพูด:', event.error);
            };
            
            window.speechSynthesis.speak(utterance);
            console.log('📢 ส่งคำสั่งพูดแล้ว');
        }, 100);
    }
    
    speakMode(mode, armName) {
        // ใช้ LanguageManager
        if (languageManager) {
            languageManager.speakMode(mode, armName);
        }
    }
    
    async speakReady() {
        // ใช้ LanguageManager
        if (languageManager) {
            await languageManager.speakReady();
        }
    }
    
    speakSelectArm() {
        // ใช้ LanguageManager
        if (languageManager) {
            languageManager.speakSelectArm();
        }
    }
    
    speakArmSelected(arm) {
        // ใช้ LanguageManager
        if (languageManager) {
            languageManager.speakArmSelected(arm);
        }
    }

    async loadGPIOStates() {
        // ไม่มี GPIO control แล้ว
        return;
    }

    async toggleGPIO(gpio) {
        // ไม่มี GPIO control แล้ว
        return;
    }
}

// Initialize when DOM is ready
let esp32Controller;
let handGestureDetector;

document.addEventListener('DOMContentLoaded', () => {
    esp32Controller = new ESP32Controller();
    
    // สร้าง LanguageManager
    languageManager = new LanguageManager(esp32Controller);
    
    // สร้าง HandGestureDetector เมื่อ deviceControl แสดงแล้ว
    // จะถูกสร้างใน selectDevice() แทน
});

