// Hand Gesture Detector with Finger Counting
class HandGestureDetector {
    constructor(esp32Controller) {
        this.esp32Controller = esp32Controller;
        
        // ตรวจสอบว่า element มีอยู่จริงหรือไม่
        this.videoElement = document.getElementById('videoElement');
        this.canvasElement = document.getElementById('canvasElement');
        this.fingerCountElement = document.getElementById('fingerCount');
        this.countdownElement = document.getElementById('countdown');
        this.gestureStatusElement = document.getElementById('gestureStatus');
        this.startCameraBtn = document.getElementById('startCameraBtn');
        this.stopCameraBtn = document.getElementById('stopCameraBtn');
        
        // ตรวจสอบว่า element มีอยู่จริงหรือไม่
        if (!this.videoElement || !this.canvasElement) {
            console.error('❌ ไม่พบ videoElement หรือ canvasElement');
            return;
        }
        
        this.canvasCtx = this.canvasElement.getContext('2d');
        
        // Hand tracking state
        this.hands = null;
        this.camera = null;
        this.isRunning = false;
        this.currentFingerCount = 0;
        this.lastFingerCount = 0;
        
        // Countdown state
        this.countdownTimer = null;
        this.countdownStartTime = null;
        this.countdownDuration = 3000; // 3 seconds
        this.isCountingDown = false;
        this.stableFingerCount = 0;
        this.stableFrames = 0;
        this.requiredStableFrames = 5; // ลดลงเหลือ 5 เฟรมเพื่อให้เริ่มเร็วขึ้น
        
        // Mode activation state
        this.isModeActive = false;
        this.lastModeActivated = null;
        
        // Debounce/throttle state
        this.resetDebounceTimer = null;
        this.lastResetTime = 0;
        this.resetDebounceDelay = 1000; // 1 second debounce
        this.resetAfterModeCompleteCalled = false; // Flag เพื่อป้องกันการเรียกซ้ำ
        
        // Gesture flow state
        this.gestureState = 'SELECT_ARM'; // 'SELECT_ARM' หรือ 'SELECT_MODE'
        this.armSelected = false; // ตรวจสอบว่าเลือกแขนแล้วหรือยัง
        
        // Finger stability state - เพิ่ม tolerance
        this.fingerCountHistory = []; // เก็บประวัติจำนวนนิ้ว
        this.historySize = 5; // เก็บ 5 ค่าล่าสุด
        this.stabilityThreshold = 3; // ต้องมีนิ้วเหมือนกันอย่างน้อย 3 จาก 5 ค่า
        this.lastStableFingerCount = 0; // ค่าเสถียรล่าสุด
        
        // ⭐ Flag สำหรับเล่นเสียง armconfirm.wav ครั้งเดียว
        this.hasPlayedCameraWelcome = false;
        
        console.log('✅ HandGestureDetector กำลังเริ่มต้น...');
        this.init();
    }
    
    init() {
        // ตรวจสอบว่า MediaPipe โหลดสำเร็จหรือไม่
        if (typeof Hands === 'undefined') {
            console.error('❌ MediaPipe Hands ไม่ได้โหลด - ตรวจสอบการเชื่อมต่ออินเทอร์เน็ต');
            if (this.gestureStatusElement) {
                this.gestureStatusElement.textContent = '❌ ไม่สามารถโหลด AI กล้อง - ตรวจสอบอินเทอร์เน็ต';
                this.gestureStatusElement.className = 'gesture-status error';
                this.gestureStatusElement.style.display = 'block';
            }
            if (this.startCameraBtn) {
                this.startCameraBtn.disabled = true;
                this.startCameraBtn.textContent = '❌ AI ไม่พร้อม';
            }
            return;
        }
        
        // Setup MediaPipe Hands
        try {
            this.hands = new Hands({
                locateFile: (file) => {
                    return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
                }
            });
        } catch (error) {
            console.error('❌ ไม่สามารถสร้าง MediaPipe Hands:', error);
            if (this.gestureStatusElement) {
                this.gestureStatusElement.textContent = '❌ ไม่สามารถเริ่ม AI กล้อง';
                this.gestureStatusElement.className = 'gesture-status error';
                this.gestureStatusElement.style.display = 'block';
            }
            return;
        }
        
        this.hands.setOptions({
            maxNumHands: 1, // ตรวจจับมือเดียว
            modelComplexity: 1, // ใช้ model ที่แม่นยำ (0=light, 1=full, 2=heavy)
            minDetectionConfidence: 0.5, // ลดลงเพื่อให้ตรวจจับได้ง่ายขึ้น
            minTrackingConfidence: 0.5 // ลดลงเพื่อให้ติดตามได้ง่ายขึ้น
        });
        
        console.log('✅ MediaPipe Hands ถูกตั้งค่าแล้ว');
        
        this.hands.onResults(this.onResults.bind(this));
        
        // Setup camera buttons
        if (this.startCameraBtn) {
            this.startCameraBtn.addEventListener('click', () => this.startCamera());
        }
        if (this.stopCameraBtn) {
            this.stopCameraBtn.addEventListener('click', () => this.stopCamera());
        }
        
        // Set canvas size
        this.updateCanvasSize();
        window.addEventListener('resize', () => this.updateCanvasSize());
    }
    
    updateCanvasSize() {
        if (this.videoElement && this.canvasElement) {
            const videoWidth = this.videoElement.videoWidth || 640;
            const videoHeight = this.videoElement.videoHeight || 480;
            this.canvasElement.width = videoWidth;
            this.canvasElement.height = videoHeight;
        }
    }
    
    async startCamera() {
        if (this.isRunning) return;
        
        console.log('🎥 เริ่มต้นกล้อง...');
        
        // ตรวจสอบ User Agent เพื่อดู iOS Safari
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
        const isSafari = /Safari/.test(navigator.userAgent) && !/Chrome/.test(navigator.userAgent);
        
        console.log(`📱 Device: iOS=${isIOS}, Safari=${isSafari}`);
        
        try {
            // สำหรับ iOS Safari ใช้ getUserMedia โดยตรง
            if (isIOS || isSafari) {
                console.log('📱 ใช้ getUserMedia สำหรับ iOS/Safari');
                await this.startCameraForIOS();
            } else {
                // สำหรับ browser อื่นใช้ MediaPipe Camera API
                console.log('💻 ใช้ MediaPipe Camera API');
                await this.startCameraWithMediaPipe();
            }
            
            this.isRunning = true;
            
            console.log('✅ Camera started, waiting for video...');
            
            // รอให้ video element พร้อม
            await new Promise((resolve) => {
                if (this.videoElement.readyState >= 2) {
                    resolve();
                } else {
                    const checkReady = setInterval(() => {
                        if (this.videoElement.readyState >= 2) {
                            clearInterval(checkReady);
                            resolve();
                        }
                    }, 100);
                    
                    // Timeout after 5 seconds
                    setTimeout(() => {
                        clearInterval(checkReady);
                        resolve();
                    }, 5000);
                }
            });
            
            // ตั้งค่า canvas size
            this.updateCanvasSize();
            
            // Update UI
            if (this.startCameraBtn) this.startCameraBtn.classList.add('hidden');
            if (this.stopCameraBtn) this.stopCameraBtn.classList.remove('hidden');
            
            // Reset state
            this.resetState();
            
            // ตั้งค่าเริ่มต้นให้เลือกแขน
            this.gestureState = 'SELECT_ARM';
            this.armSelected = false;
            
            // ⭐ เล่นเสียง armconfirm.wav ครั้งเดียวเมื่อเปิดกล้อง (แทน welcome.wav)
            if (!this.hasPlayedCameraWelcome && languageManager) {
                this.hasPlayedCameraWelcome = true;
                setTimeout(() => {
                    languageManager.speakSelectArm(); // เล่น armconfirm.wav
                }, 500);
            }
            
            // แสดงข้อความสถานะ
            if (this.gestureStatusElement) {
                this.gestureStatusElement.textContent = '👆 กรุณาเลือกแขน: ชู 1 นิ้ว = แขนขวา, ชู 2 นิ้ว = แขนซ้าย';
                this.gestureStatusElement.className = 'gesture-status info';
                this.gestureStatusElement.style.display = 'block';
            }
            
            // แสดงจำนวนนิ้วเริ่มต้น
            if (this.fingerCountElement) {
                this.fingerCountElement.textContent = '0 นิ้ว';
                this.fingerCountElement.style.display = 'block';
                this.fingerCountElement.style.visibility = 'visible';
            }
            
            // ตั้งค่า canvas size ใหม่หลังจาก video พร้อม
            setTimeout(() => {
                this.updateCanvasSize();
                console.log('✅ Canvas size updated:', this.canvasElement.width, 'x', this.canvasElement.height);
            }, 500);
            
            // ลบข้อความสถานะหลังจาก 3 วินาที
            setTimeout(() => {
                if (this.gestureStatusElement && this.gestureStatusElement.textContent.includes('กล้องเริ่มทำงานแล้ว')) {
                    this.gestureStatusElement.textContent = '';
                    this.gestureStatusElement.className = '';
                }
            }, 3000);
            
            console.log('✅ กล้องเริ่มทำงานแล้ว - พร้อมตรวจจับมือ');
        } catch (error) {
            console.error('❌ ไม่สามารถเปิดกล้องได้:', error);
            if (this.gestureStatusElement) {
                this.gestureStatusElement.textContent = '❌ ไม่สามารถเปิดกล้องได้ - กรุณาอนุญาตให้เข้าถึงกล้อง';
                this.gestureStatusElement.className = 'gesture-status error';
                this.gestureStatusElement.style.display = 'block';
            }
            this.isRunning = false;
        }
    }

    // ฟังก์ชันสำหรับ iOS Safari
    async startCameraForIOS() {
        console.log('📱 เริ่มกล้องสำหรับ iOS Safari...');
        
        // ตรวจสอบ HTTPS (iOS Safari ต้องการ HTTPS)
        if (location.protocol !== 'https:' && location.hostname !== 'localhost') {
            throw new Error('iOS Safari ต้องการ HTTPS เพื่อเข้าถึงกล้อง');
        }
        
        // ขอสิทธิ์เข้าถึงกล้อง
        const constraints = {
            video: {
                facingMode: 'user',
                width: { ideal: 640 },
                height: { ideal: 480 }
            },
            audio: false
        };
        
        // ตรวจสอบว่า getUserMedia พร้อมใช้งาน
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            throw new Error('getUserMedia ไม่รองรับในเบราว์เซอร์นี้');
        }

        try {
            console.log('📱 ขอสิทธิ์เข้าถึงกล้อง...');
            const stream = await navigator.mediaDevices.getUserMedia(constraints);
            console.log('📱 ได้รับสิทธิ์เข้าถึงกล้องแล้ว');
            
            this.videoElement.srcObject = stream;
            
            // รอให้ video โหลด
            await new Promise((resolve, reject) => {
                this.videoElement.onloadedmetadata = () => {
                    console.log('📱 Video metadata โหลดแล้ว');
                    resolve();
                };
                this.videoElement.onerror = reject;
                
                // Timeout หลัง 10 วินาที
                setTimeout(() => reject(new Error('Video load timeout')), 10000);
            });
            
            // เล่น video
            await this.videoElement.play();
            console.log('📱 Video เริ่มเล่นแล้ว');
            
            // เริ่ม frame processing
            this.startFrameProcessing();
            
        } catch (error) {
            console.error('❌ iOS Camera Error:', error);
            
            // จัดการ error message ที่เฉพาะเจาะจง
            let errorMessage = '❌ ไม่สามารถเปิดกล้องได้';
            
            if (error.name === 'NotAllowedError') {
                errorMessage = '❌ กรุณาอนุญาตให้เข้าถึงกล้องในการตั้งค่าเบราว์เซอร์';
            } else if (error.name === 'NotFoundError') {
                errorMessage = '❌ ไม่พบกล้องในอุปกรณ์';
            } else if (error.name === 'NotSupportedError') {
                errorMessage = '❌ เบราว์เซอร์ไม่รองรับการเข้าถึงกล้อง';
            } else if (error.name === 'NotReadableError') {
                errorMessage = '❌ กล้องถูกใช้งานโดยแอปอื่น';
            } else if (error.message.includes('timeout')) {
                errorMessage = '❌ การเชื่อมต่อกล้องหมดเวลา - ลองใหม่อีกครั้ง';
            }
            
            if (this.gestureStatusElement) {
                this.gestureStatusElement.textContent = errorMessage;
                this.gestureStatusElement.className = 'gesture-status error';
                this.gestureStatusElement.style.display = 'block';
            }
            
            throw new Error(errorMessage);
        }
    }

    // ฟังก์ชันสำหรับ MediaPipe Camera API
    async startCameraWithMediaPipe() {
        // ตรวจสอบว่า Camera API พร้อมหรือไม่
        if (typeof Camera === 'undefined') {
            console.error('❌ MediaPipe Camera API ไม่ได้โหลด');
            if (this.gestureStatusElement) {
                this.gestureStatusElement.textContent = '❌ Camera API ไม่พร้อม - รีเฟรชหน้าเว็บ';
                this.gestureStatusElement.className = 'gesture-status error';
                this.gestureStatusElement.style.display = 'block';
            }
            throw new Error('MediaPipe Camera API not loaded');
        }
        
        // ตั้งค่า MediaPipe Camera
        this.camera = new Camera(this.videoElement, {
            onFrame: async () => {
                if (this.hands && this.isRunning) {
                    await this.hands.send({ image: this.videoElement });
                }
            },
            width: 640,
            height: 480,
            facingMode: 'user'
        });
        
        // เริ่มต้นกล้อง
        await this.camera.start();
        console.log('💻 MediaPipe Camera เริ่มแล้ว');
    }

    // ฟังก์ชันประมวลผล frame สำหรับ iOS
    startFrameProcessing() {
        const processFrame = async () => {
            if (this.hands && this.isRunning && this.videoElement.readyState >= 2) {
                try {
                    await this.hands.send({ image: this.videoElement });
                } catch (error) {
                    console.warn('⚠️ Frame processing error:', error);
                }
            }
            
            if (this.isRunning) {
                requestAnimationFrame(processFrame);
            }
        };
        
        requestAnimationFrame(processFrame);
        console.log('📱 เริ่ม frame processing สำหรับ iOS');
    }
    
    stopCamera() {
        console.log('⏹️ หยุดกล้อง...');
        
        // หยุด MediaPipe Camera (สำหรับ desktop)
        if (this.camera) {
            this.camera.stop();
            this.camera = null;
        }
        
        // หยุด getUserMedia stream (สำหรับ iOS)
        if (this.videoElement && this.videoElement.srcObject) {
            const stream = this.videoElement.srcObject;
            if (stream && stream.getTracks) {
                stream.getTracks().forEach(track => {
                    track.stop();
                    console.log('⏹️ หยุด track:', track.kind);
                });
            }
            this.videoElement.srcObject = null;
        }
        
        this.isRunning = false;
        this.resetState();
        
        // Clear canvas
        if (this.canvasCtx) {
            this.canvasCtx.clearRect(0, 0, this.canvasElement.width, this.canvasElement.height);
        }
        
        // Update UI
        if (this.startCameraBtn) this.startCameraBtn.classList.remove('hidden');
        if (this.stopCameraBtn) this.stopCameraBtn.classList.add('hidden');
        
        if (this.fingerCountElement) {
            this.fingerCountElement.textContent = '0 นิ้ว';
        }
        if (this.countdownElement) {
            this.countdownElement.textContent = '';
            this.countdownElement.className = 'countdown';
        }
        if (this.gestureStatusElement) {
            this.gestureStatusElement.textContent = '';
            this.gestureStatusElement.className = '';
        }
        
        console.log('⏹️ กล้องหยุดทำงานแล้ว');
    }
    
    resetState() {
        // Clear countdown
        if (this.countdownTimer) {
            clearInterval(this.countdownTimer);
            this.countdownTimer = null;
        }
        
        this.isCountingDown = false;
        this.countdownStartTime = null;
        this.stableFingerCount = 0;
        this.stableFrames = 0;
        this.currentFingerCount = 0;
        this.lastFingerCount = 0;
        this.lastModeActivated = null;
        
        // Update UI
        if (this.countdownElement) {
            this.countdownElement.textContent = '';
            this.countdownElement.className = 'countdown';
        }
    }
    
    onResults(results) {
        if (!this.isRunning) {
            return;
        }
        
        // Clear canvas - ไม่วาดเส้น overlay ตามที่ผู้ใช้ต้องการ
        if (this.canvasCtx && this.canvasElement) {
            this.canvasCtx.save();
            this.canvasCtx.clearRect(0, 0, this.canvasElement.width, this.canvasElement.height);
            this.canvasCtx.restore();
        }
        
        // Detect fingers
        if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
            const handLandmarks = results.multiHandLandmarks[0];
            const handedness = results.multiHandedness && results.multiHandedness.length > 0 
                ? results.multiHandedness[0].label 
                : 'Right'; // Default เป็น Right
            const fingerCount = this.countFingers(handLandmarks, handedness);
            
            this.currentFingerCount = fingerCount;
            
            // อัปเดต UI - แสดงจำนวนนิ้ว (อัปเดตทุกครั้งที่ตรวจจับได้)
            if (this.fingerCountElement) {
                // ถ้าอยู่ใน SELECT_MODE และเป็น 0 นิ้ว ให้แสดง "RESET"
                if (this.gestureState === 'SELECT_MODE' && fingerCount === 0) {
                    this.fingerCountElement.textContent = 'RESET';
                } else {
                    this.fingerCountElement.textContent = `${fingerCount} นิ้ว`;
                }
                this.fingerCountElement.style.display = 'block'; // แสดงผล
                this.fingerCountElement.style.visibility = 'visible'; // แสดงผล
            }
            
            // เพิ่มค่าลงในประวัติ
            this.fingerCountHistory.push(fingerCount);
            if (this.fingerCountHistory.length > this.historySize) {
                this.fingerCountHistory.shift(); // ลบค่าเก่าที่สุด
            }
            
            // คำนวณจำนวนนิ้วที่เสถียร (mode ของประวัติ)
            const stableFingerCount = this.calculateStableFingerCount();
            
            // ตรวจสอบว่านิ้วเสถียรหรือไม่ (ต้องมีค่าเหมือนกันอย่างน้อย 3 จาก 5)
            // สำหรับ 0 นิ้ว (กำปั้น) ต้องเสถียรมากกว่า (4 จาก 5) เพื่อป้องกัน false positive
            let isStable;
            if (stableFingerCount === 0 && this.gestureState === 'SELECT_MODE') {
                // กำปั้น (RESET) - ต้องเสถียรมาก
                isStable = this.fingerCountHistory.filter(f => f === 0).length >= 4;
            } else {
                // นิ้วอื่นๆ - เสถียรปกติ
                isStable = stableFingerCount > 0 && 
                          this.fingerCountHistory.filter(f => f === stableFingerCount).length >= this.stabilityThreshold;
            }
            
            // ตรวจสอบว่าควรเริ่ม countdown หรือไม่ตาม state
            let shouldStartCountdown = false;
            
            if (this.gestureState === 'SELECT_ARM') {
                // ⭐ กำลังเลือกแขน - รับเฉพาะ 1 หรือ 2 นิ้วเท่านั้น (ไม่รับ 3-5)
                shouldStartCountdown = (stableFingerCount === 1 || stableFingerCount === 2);
                
                // ⭐ ถ้าชู 3-5 นิ้ว ให้แสดงข้อความเตือน
                if (stableFingerCount >= 3 && stableFingerCount <= 5 && isStable) {
                    if (this.gestureStatusElement) {
                        this.gestureStatusElement.textContent = '⚠️ กรุณาชู 1 นิ้ว (แขนขวา) หรือ 2 นิ้ว (แขนซ้าย) เท่านั้น';
                        this.gestureStatusElement.className = 'gesture-status warning';
                        this.gestureStatusElement.style.display = 'block';
                    }
                }
            } else if (this.gestureState === 'SELECT_MODE') {
                // กำลังเลือกโหมด - รับ 0 (รีเซ็ต) หรือ 1-5 (โหมด)
                shouldStartCountdown = (stableFingerCount >= 0 && stableFingerCount <= 5);
                
                // ถ้าเป็นโหมดเดียวกันกับที่กำลังทำงานอยู่ ไม่ต้องเริ่ม countdown ใหม่
                const isSameMode = this.isModeActive && this.lastModeActivated === stableFingerCount && stableFingerCount > 0;
                if (isSameMode) {
                    shouldStartCountdown = false;
                }
            }
            
            if (isStable && shouldStartCountdown) {
                // นิ้วเสถียรแล้ว - เริ่ม countdown
                if (!this.isCountingDown) {
                    // เริ่ม countdown ถ้ายังไม่ได้เริ่ม
                    // ตรวจสอบว่าค่าเสถียรเปลี่ยนหรือไม่
                    if (stableFingerCount !== this.lastStableFingerCount) {
                        this.stableFrames = 0;
                        this.lastStableFingerCount = stableFingerCount;
                    }
                    this.stableFrames++;
                    
                    if (this.stableFrames >= this.requiredStableFrames) {
                        this.startCountdown(stableFingerCount);
                    }
                } else if (this.isCountingDown) {
                    // กำลัง countdown อยู่ - ตรวจสอบว่านิ้วยังเหมือนเดิมหรือไม่
                    if (stableFingerCount === this.stableFingerCount) {
                        // นิ้วยังเหมือนเดิม - อัปเดต countdown ต่อไป
                        // ไม่ต้องทำอะไร countdown จะอัปเดตเองผ่าน timer
                    } else {
                        // ⭐ นิ้วเปลี่ยน - ตรวจสอบว่าเปลี่ยนเป็นค่าที่ไม่ถูกต้องหรือไม่
                        
                        // ⭐ ถ้าอยู่ในโหมด SELECT_ARM และเปลี่ยนเป็น 3-5 นิ้ว ต้องยกเลิกทันที
                        if (this.gestureState === 'SELECT_ARM' && stableFingerCount >= 3 && stableFingerCount <= 5) {
                            console.log(`⚠️ ชู ${stableFingerCount} นิ้วระหว่างเลือกแขน - ยกเลิกการนับถอยหลัง`);
                            this.resetCountdown();
                            this.stableFrames = 0;
                            this.fingerCountHistory = [];
                            
                            // แสดงข้อความเตือน
                            if (this.gestureStatusElement) {
                                this.gestureStatusElement.textContent = '⚠️ กรุณาชู 1 นิ้ว (แขนขวา) หรือ 2 นิ้ว (แขนซ้าย) เท่านั้น';
                                this.gestureStatusElement.className = 'gesture-status warning';
                                this.gestureStatusElement.style.display = 'block';
                            }
                            return; // ⭐ หยุดการทำงานทันที
                        }
                        
                        const diff = Math.abs(stableFingerCount - this.stableFingerCount);
                        
                        // ถ้าเปลี่ยนมากกว่า 1 หรือเป็น 0 ให้รีเซ็ต
                        if (diff > 1 || stableFingerCount === 0) {
                            // ตรวจสอบอีกครั้งว่าเปลี่ยนจริงหรือเป็น noise
                            const currentStableCount = this.fingerCountHistory.filter(f => f === this.stableFingerCount).length;
                            if (currentStableCount < 2) {
                                // มีค่าที่เหมือนกันน้อย - รีเซ็ต
                                console.log(`⚠️ นิ้วเปลี่ยนจาก ${this.stableFingerCount} เป็น ${stableFingerCount} - รีเซ็ต`);
                                this.resetCountdown();
                                this.stableFrames = 0;
                                this.fingerCountHistory = [];
                            }
                            // ถ้ายังมีค่าที่เหมือนกันมากกว่า 2 ไม่รีเซ็ต (อาจเป็น noise)
                        } else if (diff === 1) {
                            // เปลี่ยน 1 นิ้ว - ตรวจสอบว่าเป็นค่าที่ถูกต้องหรือไม่
                            
                            // ⭐ ถ้าอยู่ในโหมด SELECT_ARM และเปลี่ยนเป็น 3 นิ้ว ต้องยกเลิก
                            if (this.gestureState === 'SELECT_ARM' && stableFingerCount === 3) {
                                console.log(`⚠️ เปลี่ยนเป็น 3 นิ้วระหว่างเลือกแขน - ยกเลิก`);
                                this.resetCountdown();
                                this.stableFrames = 0;
                                this.fingerCountHistory = [];
                                return;
                            }
                            
                            // ถ้าเสถียรแล้วให้เริ่ม countdown ใหม่ (เฉพาะค่าที่ถูกต้อง)
                            const newStableCount = this.fingerCountHistory.filter(f => f === stableFingerCount).length;
                            if (newStableCount >= this.stabilityThreshold) {
                                console.log(`🔄 เปลี่ยนจาก ${this.stableFingerCount} นิ้ว เป็น ${stableFingerCount} นิ้ว - เริ่ม countdown ใหม่`);
                                this.resetCountdown();
                                this.stableFrames = this.requiredStableFrames;
                                this.startCountdown(stableFingerCount);
                            }
                        }
                    }
                }
            } else {
                // นิ้วไม่เสถียร - แต่ถ้ากำลัง countdown อยู่ ตรวจสอบอีกครั้ง
                if (this.isCountingDown) {
                    // ตรวจสอบว่ามีค่าที่เหมือนกันกับที่กำลัง countdown อยู่หรือไม่
                    const stableCount = this.fingerCountHistory.filter(f => f === this.stableFingerCount).length;
                    if (stableCount < 2) {
                        // มีค่าที่เหมือนกันน้อย - รีเซ็ต
                        const currentMode = this.calculateMode(this.fingerCountHistory);
                        if (currentMode === 0 || Math.abs(currentMode - this.stableFingerCount) > 1) {
                            // ไม่มีมือหรือเปลี่ยนมาก - รีเซ็ต
                            this.resetCountdown();
                            this.stableFrames = 0;
                        }
                    }
                    // ถ้ายังมีค่าที่เหมือนกันมาก ไม่รีเซ็ต
                } else {
                    // ไม่กำลัง countdown - รีเซ็ต stableFrames
                    this.stableFrames = 0;
                    this.lastStableFingerCount = 0;
                }
            }
            
            this.lastFingerCount = fingerCount;
        } else {
            // ไม่พบมือ
            this.currentFingerCount = 0;
            if (this.fingerCountElement) {
                this.fingerCountElement.textContent = '0 นิ้ว';
            }
            
            // เพิ่ม 0 ลงในประวัติ
            this.fingerCountHistory.push(0);
            if (this.fingerCountHistory.length > this.historySize) {
                this.fingerCountHistory.shift();
            }
            
            // ตรวจสอบว่ามือหายไปจริงหรือไม่ (ต้องมี 0 อย่างน้อย 3 จาก 5)
            const zeroCount = this.fingerCountHistory.filter(f => f === 0).length;
            if (zeroCount >= this.stabilityThreshold) {
                // มือหายไปจริง - รีเซ็ต countdown (แต่ไม่รีเซ็ตโหมดที่กำลังทำงาน)
                this.resetCountdown();
                this.stableFrames = 0;
                // ไม่รีเซ็ตประวัติทั้งหมด เพื่อให้สามารถตรวจจับนิ้วใหม่ได้เร็วขึ้น
            }
            // ถ้ายังไม่แน่ใจว่ามือหาย ไม่รีเซ็ต (อาจเป็น noise ชั่วครู่)
            this.lastFingerCount = 0;
        }
    }
    
    // คำนวณจำนวนนิ้วที่เสถียร (mode)
    calculateStableFingerCount() {
        if (this.fingerCountHistory.length === 0) return 0;
        
        // นับความถี่ของแต่ละค่า
        const frequency = {};
        this.fingerCountHistory.forEach(count => {
            frequency[count] = (frequency[count] || 0) + 1;
        });
        
        // หาค่าที่มีความถี่สูงสุด
        let maxFreq = 0;
        let mode = 0;
        Object.keys(frequency).forEach(count => {
            if (frequency[count] > maxFreq) {
                maxFreq = frequency[count];
                mode = parseInt(count);
            }
        });
        
        // ถ้ามีค่าที่เหมือนกันอย่างน้อย 3 จาก 5 คืนค่า mode
        if (maxFreq >= this.stabilityThreshold) {
            return mode;
        }
        
        return 0; // ยังไม่เสถียร
    }
    
    // คำนวณ mode ของ array
    calculateMode(arr) {
        if (arr.length === 0) return 0;
        const frequency = {};
        arr.forEach(val => {
            frequency[val] = (frequency[val] || 0) + 1;
        });
        let maxFreq = 0;
        let mode = 0;
        Object.keys(frequency).forEach(val => {
            if (frequency[val] > maxFreq) {
                maxFreq = frequency[val];
                mode = parseInt(val);
            }
        });
        return mode;
    }
    
    countFingers(landmarks, handedness) {
        // MediaPipe Hands landmarks:
        // 0: wrist
        // 1-4: thumb (1=MCP, 2=IP, 3=tip, 4=ไม่ใช้)
        // 5-8: index finger (5=MCP, 6=PIP, 7=DIP, 8=tip)
        // 9-12: middle finger (9=MCP, 10=PIP, 11=DIP, 12=tip)
        // 13-16: ring finger (13=MCP, 14=PIP, 15=DIP, 16=tip)
        // 17-20: pinky (17=MCP, 18=PIP, 19=DIP, 20=tip)
        
        let fingers = 0;
        
        // นิ้วโป้ง - ใช้วิธีที่แม่นยำกว่าโดยเปรียบเทียบกับ IP joint
        // MediaPipe Hands landmarks: 0=wrist, 1=thumb_cmc, 2=thumb_mcp, 3=thumb_ip, 4=thumb_tip
        const thumbTip = landmarks[4];
        const thumbIP = landmarks[3];
        const thumbMCP = landmarks[2];
        
        // ตรวจสอบว่านิ้วโป้งชูขึ้นหรือไม่โดยดูจากตำแหน่ง x coordinate
        // เพราะวิดีโอถูก mirror (scaleX(-1)) เราต้องตรวจสอบแบบย้อนกลับ
        // สำหรับมือขวา (ที่เห็นในกล้อง mirror): นิ้วโป้งชูขึ้นเมื่อ thumbTip.x < thumbIP.x
        // สำหรับมือซ้าย (ที่เห็นในกล้อง mirror): นิ้วโป้งชูขึ้นเมื่อ thumbTip.x > thumbIP.x
        let thumbIsExtended = false;
        
        if (handedness === 'Right') {
            // มือขวา (mirror) - นิ้วโป้งชูขึ้นเมื่อ tip อยู่ด้านซ้ายของ IP joint
            thumbIsExtended = thumbTip.x < thumbIP.x;
        } else {
            // มือซ้าย (mirror) - นิ้วโป้งชูขึ้นเมื่อ tip อยู่ด้านขวาของ IP joint
            thumbIsExtended = thumbTip.x > thumbIP.x;
        }
        
        // เพิ่มการตรวจสอบจาก y coordinate เพื่อให้แม่นยำมากขึ้น
        // นิ้วโป้งชูขึ้นเมื่อ tip อยู่เหนือ IP joint หรือใกล้เคียง
        const thumbYExtended = thumbTip.y <= thumbIP.y + 0.05;
        
        if (thumbIsExtended && thumbYExtended) {
            fingers++;
        }
        
        // นิ้วชี้ - ตรวจสอบจากตำแหน่ง y coordinate (นิ้วชูขึ้นเมื่อ tip อยู่เหนือ PIP joint)
        // ใช้ threshold ที่เหมาะสมเพื่อให้แม่นยำและเสถียร
        const indexTip = landmarks[8];
        const indexPIP = landmarks[6];
        const indexMCP = landmarks[5];
        
        // คำนวณความสูงของนิ้วชี้ (ระยะห่างระหว่าง tip กับ PIP)
        const indexExtension = indexPIP.y - indexTip.y;
        // คำนวณความยาวของนิ้วชี้ (ระยะห่างระหว่าง PIP กับ MCP)
        const indexLength = Math.sqrt(
            Math.pow(indexPIP.x - indexMCP.x, 2) + 
            Math.pow(indexPIP.y - indexMCP.y, 2)
        );
        
        // นิ้วชี้ชูขึ้นเมื่อ extension มากกว่า 20% ของความยาวนิ้ว (ลด threshold เพื่อให้ตรวจจับได้ง่ายขึ้น)
        if (indexExtension > indexLength * 0.2 && indexExtension > 0) {
            fingers++;
        }
        
        // นิ้วกลาง - ตรวจสอบจากตำแหน่ง y coordinate
        const middleTip = landmarks[12];
        const middlePIP = landmarks[10];
        const middleMCP = landmarks[9];
        
        const middleExtension = middlePIP.y - middleTip.y;
        const middleLength = Math.sqrt(
            Math.pow(middlePIP.x - middleMCP.x, 2) + 
            Math.pow(middlePIP.y - middleMCP.y, 2)
        );
        
        if (middleExtension > middleLength * 0.2 && middleExtension > 0) {
            fingers++;
        }
        
        // นิ้วนาง - ตรวจสอบจากตำแหน่ง y coordinate
        const ringTip = landmarks[16];
        const ringPIP = landmarks[14];
        const ringMCP = landmarks[13];
        
        const ringExtension = ringPIP.y - ringTip.y;
        const ringLength = Math.sqrt(
            Math.pow(ringPIP.x - ringMCP.x, 2) + 
            Math.pow(ringPIP.y - ringMCP.y, 2)
        );
        
        if (ringExtension > ringLength * 0.2 && ringExtension > 0) {
            fingers++;
        }
        
        // นิ้วก้อย - ตรวจสอบจากตำแหน่ง y coordinate
        const pinkyTip = landmarks[20];
        const pinkyPIP = landmarks[18];
        const pinkyMCP = landmarks[17];
        
        const pinkyExtension = pinkyPIP.y - pinkyTip.y;
        const pinkyLength = Math.sqrt(
            Math.pow(pinkyPIP.x - pinkyMCP.x, 2) + 
            Math.pow(pinkyPIP.y - pinkyMCP.y, 2)
        );
        
        if (pinkyExtension > pinkyLength * 0.2 && pinkyExtension > 0) {
            fingers++;
        }
        
        return fingers;
    }
    
    startCountdown(fingerCount) {
        this.isCountingDown = true;
        this.stableFingerCount = fingerCount;
        this.countdownStartTime = Date.now();
        
        // Update UI - แสดง countdown พร้อมข้อความตาม state
        if (this.countdownElement) {
            this.countdownElement.className = 'countdown counting';
            this.countdownElement.style.display = 'block';
            this.updateCountdown();
        }
        
        // Start countdown timer
        this.countdownTimer = setInterval(() => {
            this.updateCountdown();
        }, 50);
        
        // แสดงข้อความตาม state
        if (this.gestureState === 'SELECT_ARM') {
            if (fingerCount === 1) {
                console.log(`⏱️ เริ่มนับถอยหลังเพื่อเลือกแขนขวา`);
            } else if (fingerCount === 2) {
                console.log(`⏱️ เริ่มนับถอยหลังเพื่อเลือกแขนซ้าย`);
            }
        } else if (this.gestureState === 'SELECT_MODE') {
            if (fingerCount === 0) {
                console.log(`⏱️ เริ่มนับถอยหลังเพื่อรีเซ็ต`);
            } else {
                console.log(`⏱️ เริ่มนับถอยหลังสำหรับโหมด ${fingerCount}`);
            }
        }
    }
    
    updateCountdown() {
        if (!this.isCountingDown || !this.countdownStartTime) return;
        if (!this.countdownElement) return;
        // ลบการตรวจสอบ isModeActive เพื่อให้ countdown ทำงานได้แม้มีโหมดทำงานอยู่
        
        const elapsed = Date.now() - this.countdownStartTime;
        const remaining = Math.max(0, this.countdownDuration - elapsed);
        const seconds = Math.ceil(remaining / 1000); // แสดงเป็นเลขเต็ม
        
        if (remaining > 0) {
            // แสดง countdown พร้อมข้อความตาม state
            let countdownText = `${seconds} วินาที`;
            if (this.gestureState === 'SELECT_MODE' && this.stableFingerCount === 0) {
                countdownText = `RESET ใน ${seconds} วินาที`;
            }
            
            this.countdownElement.textContent = countdownText;
            this.countdownElement.style.display = 'block'; // แสดงผล
            this.countdownElement.style.visibility = 'visible'; // แสดงผล
            
            // ⭐ ตรวจสอบว่านิ้วยังคงเหมือนเดิมหรือไม่
            const currentStable = this.calculateStableFingerCount();
            
            // ⭐ ถ้าอยู่ในโหมด SELECT_ARM และชู 3-5 นิ้ว → หยุดทันที!
            if (this.gestureState === 'SELECT_ARM') {
                if (currentStable >= 3 && currentStable <= 5) {
                    console.log(`🛑 SELECT_ARM: ตรวจพบ ${currentStable} นิ้ว - หยุดทันที!`);
                    this.resetCountdown();
                    
                    // แสดงข้อความเตือน
                    if (this.gestureStatusElement) {
                        this.gestureStatusElement.textContent = '⚠️ กรุณาชู 1 นิ้ว (แขนขวา) หรือ 2 นิ้ว (แขนซ้าย) เท่านั้น';
                        this.gestureStatusElement.className = 'gesture-status warning';
                        this.gestureStatusElement.style.display = 'block';
                    }
                    return; // ⭐ หยุดทันที
                }
                
                // ⭐ ถ้านิ้วเปลี่ยนจาก 1 หรือ 2 → หยุด
                if (currentStable !== this.stableFingerCount && currentStable !== -1) {
                    console.log(`🛑 SELECT_ARM: นิ้วเปลี่ยนจาก ${this.stableFingerCount} → ${currentStable} - หยุด!`);
                    this.resetCountdown();
                    return;
                }
            }
            
            // ⭐ ถ้ากำลังนับถอยหลัง RESET (0 นิ้ว)
            if (this.stableFingerCount === 0 && this.gestureState === 'SELECT_MODE') {
                const zeroCount = this.fingerCountHistory.filter(f => f === 0).length;
                if (zeroCount < 4) {
                    console.log(`⚠️ ไม่ใช่กำปั้นแล้ว - ยกเลิก RESET`);
                    this.resetCountdown();
                    return;
                }
            } else if (this.gestureState === 'SELECT_MODE') {
                // ⭐ โหมดอื่นๆ - ถ้านิ้วเปลี่ยน → หยุด
                if (currentStable !== this.stableFingerCount && currentStable !== -1) {
                    console.log(`⚠️ นิ้วเปลี่ยนระหว่าง countdown - รีเซ็ต`);
                    this.resetCountdown();
                    return;
                }
            }
        } else {
            // Countdown เสร็จสิ้น
            if (this.countdownTimer) {
                clearInterval(this.countdownTimer);
                this.countdownTimer = null;
            }
            
            const fingerCount = this.stableFingerCount;
            
            // ตรวจสอบ state ปัจจุบัน
            if (this.gestureState === 'SELECT_ARM') {
                // กำลังเลือกแขน
                this.selectArmByGesture(fingerCount);
            } else if (this.gestureState === 'SELECT_MODE') {
                // กำลังเลือกโหมดหรือรีเซ็ต
                if (fingerCount === 0) {
                    // รีเซ็ตระบบ
                    this.resetGestureSystem();
                } else {
                    // เปิดโหมด
                    this.activateMode(fingerCount);
                }
            }
        }
    }
    
    resetCountdown() {
        if (this.countdownTimer) {
            clearInterval(this.countdownTimer);
            this.countdownTimer = null;
        }
        
        this.isCountingDown = false;
        this.countdownStartTime = null;
        this.stableFingerCount = 0;
        this.stableFrames = 0;
        this.lastStableFingerCount = 0;
        
        // Update UI
        if (this.countdownElement) {
            this.countdownElement.textContent = '';
            this.countdownElement.className = 'countdown';
        }
    }
    
    selectArmByGesture(fingerCount) {
        // เลือกแขนด้วยท่าทาง: 1 นิ้ว = แขนขวา, 2 นิ้ว = แขนซ้าย
        if (fingerCount === 1) {
            // เลือกแขนขวา
            this.esp32Controller.selectedArm = 'right';
            this.armSelected = true;
            this.gestureState = 'SELECT_MODE';
            
            // อัปเดตปุ่มแขน
            const armButtons = document.querySelectorAll('.btn-arm');
            armButtons.forEach(btn => {
                if (btn.dataset.arm === 'right') {
                    btn.classList.add('active');
                } else {
                    btn.classList.remove('active');
                }
            });
            
            console.log('✅ เลือกแขนขวาด้วยท่าทาง');
            
            if (this.gestureStatusElement) {
                this.gestureStatusElement.textContent = '✅ เลือกแขนขวาแล้ว - ชู 1-5 นิ้วเพื่อเลือกโหมด หรือกำปั้นเพื่อรีเซ็ต';
                this.gestureStatusElement.className = 'gesture-status success';
            }
            
            // พูดแจ้งเตือน
            this.esp32Controller.speakArmSelected('right');
            
        } else if (fingerCount === 2) {
            // เลือกแขนซ้าย
            this.esp32Controller.selectedArm = 'left';
            this.armSelected = true;
            this.gestureState = 'SELECT_MODE';
            
            // อัปเดตปุ่มแขน
            const armButtons = document.querySelectorAll('.btn-arm');
            armButtons.forEach(btn => {
                if (btn.dataset.arm === 'left') {
                    btn.classList.add('active');
                } else {
                    btn.classList.remove('active');
                }
            });
            
            console.log('✅ เลือกแขนซ้ายด้วยท่าทาง');
            
            if (this.gestureStatusElement) {
                this.gestureStatusElement.textContent = '✅ เลือกแขนซ้ายแล้ว - ชู 1-5 นิ้วเพื่อเลือกโหมด หรือกำปั้นเพื่อรีเซ็ต';
                this.gestureStatusElement.className = 'gesture-status success';
            }
            
            // พูดแจ้งเตือน
            this.esp32Controller.speakArmSelected('left');
        }
        
        // รีเซ็ต countdown
        this.resetCountdown();
    }
    
    resetGestureSystem() {
        // รีเซ็ตระบบกล้องกลับไปเลือกแขนใหม่ (เหมือนเข้าเว็บใหม่)
        console.log('🔄 รีเซ็ตระบบทั้งหมด - กลับไปเลือกแขนใหม่');
        
        // รีเซ็ตสถานะกล้อง
        this.gestureState = 'SELECT_ARM';
        this.armSelected = false;
        this.isModeActive = false;
        this.lastModeActivated = null;
        
        // รีเซ็ต countdown
        this.resetCountdown();
        
        // รีเซ็ตการเลือกแขนใน ESP32Controller
        this.esp32Controller.selectedArm = null;
        
        // รีเซ็ตปุ่มแขนทั้งหมด (ไม่มีปุ่มไหน active)
        const armButtons = document.querySelectorAll('.btn-arm');
        armButtons.forEach(btn => {
            btn.classList.remove('active');
        });
        
        // รีเซ็ตปุ่มโหมดทั้งหมด (ไม่มีปุ่มไหน active)
        const modeButtons = document.querySelectorAll('.btn-mode');
        modeButtons.forEach(btn => {
            btn.classList.remove('active');
        });
        
        // รีเซ็ตสถานะโหมดที่กำลังทำงาน
        this.esp32Controller.currentRunningMode = null;
        
        // แสดงข้อความ
        if (this.gestureStatusElement) {
            this.gestureStatusElement.textContent = '🔄 รีเซ็ตแล้ว - กรุณาเลือกแขน: ชู 1 นิ้ว = แขนขวา, ชู 2 นิ้ว = แขนซ้าย';
            this.gestureStatusElement.className = 'gesture-status info';
        }
        
        // พูดแจ้งเตือน
        if (languageManager) {
            languageManager.speak('รีเซ็ตระบบแล้ว กรุณาเลือกแขนใหม่', 'System reset. Please select arm.');
        }
        
        console.log('✅ รีเซ็ตทุกอย่างเรียบร้อย - พร้อมเลือกแขนใหม่');
    }
    
    async activateMode(fingerCount) {
        // ตรวจสอบว่าอยู่ใน state SELECT_MODE หรือไม่
        if (this.gestureState !== 'SELECT_MODE') {
            console.log('⚠️ ยังไม่ได้เลือกแขน - ข้ามการเปิดโหมด');
            return;
        }
        
        // ตรวจสอบว่านิ้วอยู่ในช่วง 1-5
        if (fingerCount < 1 || fingerCount > 5) return;
        
        // ตรวจสอบว่าเป็นโหมดเดิมหรือไม่
        const isSameMode = this.isModeActive && this.lastModeActivated === fingerCount;
        if (isSameMode) {
            // เป็นโหมดเดียวกัน - ไม่ต้องส่งซ้ำ
            console.log(`ℹ️ โหมด ${fingerCount} กำลังทำงานอยู่แล้ว`);
            return;
        }
        
        // หยุด countdown
        this.resetCountdown();
        
        // ตั้งค่าสถานะว่าโหมดกำลังทำงาน
        this.isModeActive = true;
        this.lastModeActivated = fingerCount;
        
        console.log(`🎯 เปิดโหมด ${fingerCount} ผ่านการชู ${fingerCount} นิ้ว`);
        
        // แปลงโหมดตามแขนที่เลือก (เหมือนกับการกดปุ่ม)
        let actualMode;
        if (this.esp32Controller.selectedArm === 'right') {
            actualMode = fingerCount; // แขนขวา: 1-5
        } else {
            // แขนซ้าย: โหมด 1-4 → 6-9, โหมด 5 → 5 (หยุด)
            actualMode = fingerCount === 5 ? 5 : fingerCount + 5;
        }
        const armName = this.esp32Controller.selectedArm === 'right' ? 'แขนขวา' : 'แขนซ้าย';
        
        // 🧪 LOG สำหรับเทส
        console.log(`🧪 [TEST CAMERA] แขน: ${armName}, ชูนิ้ว: ${fingerCount}, ส่งคำสั่งจริง: ${actualMode}`);
        
        // ตรวจสอบว่าเลือกแขนแล้วหรือยัง
        if (!this.esp32Controller.selectedArm) {
            if (this.gestureStatusElement) {
                this.gestureStatusElement.textContent = '⚠️ กรุณาเลือกแขนก่อน';
                this.gestureStatusElement.className = 'gesture-status error';
                this.gestureStatusElement.style.display = 'block';
            }
            this.esp32Controller.speakSelectArm();
            
            setTimeout(() => {
                if (this.gestureStatusElement) {
                    this.gestureStatusElement.textContent = '';
                    this.gestureStatusElement.className = '';
                }
            }, 3000);
            
            this.isModeActive = false;
            this.lastModeActivated = null;
            return;
        }
        
        // พูดแจ้งเตือน - ไม่พูดชื่อแขน (เพราะเลือกแขนไปแล้ว)
        this.esp32Controller.speakMode(fingerCount, '');
        
        // ส่งคำสั่งไปยัง ESP32 ผ่าน ESP32Controller
        // ESP32 จะจัดการหยุดโหมดเก่าและเริ่มโหมดใหม่เอง
        if (this.esp32Controller) {
            const success = await this.esp32Controller.sendMode(actualMode.toString());
            
            if (success) {
                // อัปเดตปุ่มโหมดให้เป็น active
                const modeButtons = document.querySelectorAll('.btn-mode');
                modeButtons.forEach(btn => {
                    if (btn.dataset.mode === fingerCount.toString()) {
                        btn.classList.add('active');
                    } else {
                        btn.classList.remove('active');
                    }
                });
                
                // แสดงข้อความที่ถูกต้อง
                if (this.gestureStatusElement) {
                    this.gestureStatusElement.textContent = `✅ เปิดโหมด ${actualMode} แล้ว`;
                    this.gestureStatusElement.className = 'gesture-status success';
                    this.gestureStatusElement.style.display = 'block';
                }
            } else {
                if (this.gestureStatusElement) {
                    this.gestureStatusElement.textContent = `❌ ไม่สามารถเปิดโหมด ${actualMode} ได้`;
                    this.gestureStatusElement.className = 'gesture-status error';
                }
                this.isModeActive = false;
                this.lastModeActivated = null;
            }
        }
        
        // รีเซ็ต countdown element หลังจาก 2 วินาที
        setTimeout(() => {
            if (this.countdownElement) {
                this.countdownElement.textContent = '';
                this.countdownElement.className = 'countdown';
            }
        }, 2000);
        
        // รีเซ็ตประวัติบางส่วน แต่เก็บค่าใหม่ไว้บ้างเพื่อให้เปลี่ยนโหมดได้ต่อเนื่อง
        // ไม่รีเซ็ตทั้งหมด เพื่อให้สามารถตรวจจับนิ้วใหม่ได้เร็วขึ้น
        // เพิ่มค่าปัจจุบันลงในประวัติเพื่อให้เปลี่ยนโหมดได้เร็วขึ้น
        this.fingerCountHistory.push(fingerCount);
        if (this.fingerCountHistory.length > 3) {
            // ลบประวัติเก่าบางส่วน แต่เก็บค่าล่าสุด 3 ค่าไว้
            this.fingerCountHistory = this.fingerCountHistory.slice(-3);
        }
        this.stableFrames = 0;
        this.lastStableFingerCount = fingerCount; // ตั้งค่าเป็น fingerCount ปัจจุบัน
    }
    
    resetAfterModeComplete() {
        // ฟังก์ชันนี้จะถูกเรียกจาก ESP32Controller เมื่อโหมดเสร็จสิ้น
        // เพิ่ม debounce เพื่อไม่ให้รีเซ็ตซ้ำๆ
        
        const now = Date.now();
        if (now - this.lastResetTime < this.resetDebounceDelay) {
            // ยังไม่ถึงเวลา debounce - ไม่รีเซ็ต
            return;
        }
        
        // Clear debounce timer ถ้ามี
        if (this.resetDebounceTimer) {
            clearTimeout(this.resetDebounceTimer);
            this.resetDebounceTimer = null;
        }
        
        // ตั้งค่า debounce timer
        this.resetDebounceTimer = setTimeout(() => {
            this.lastResetTime = Date.now();
            
            // รีเซ็ตสถานะ
            this.isModeActive = false;
            this.lastModeActivated = null;
            this.resetCountdown();
            
            // รีเซ็ตประวัติ
            this.fingerCountHistory = [];
            this.stableFrames = 0;
            this.lastStableFingerCount = 0;
            
            // รีเซ็ต UI
            if (this.gestureStatusElement) {
                this.gestureStatusElement.textContent = '';
                this.gestureStatusElement.className = '';
            }
            
            console.log('🔄 รีเซ็ตสถานะ hand gesture หลังจากโหมดเสร็จสิ้น');
            
            this.resetDebounceTimer = null;
        }, this.resetDebounceDelay);
    }
}

