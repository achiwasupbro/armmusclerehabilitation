// ระบบเปลี่ยนภาษาและเสียง
class LanguageManager {
    constructor(esp32Controller) {
        this.esp32Controller = esp32Controller;
        this.currentLang = 'th'; // ภาษาเริ่มต้น: ไทย
        this.audioCache = {}; // เก็บ Audio objects
        this.isPlayingWelcome = false;
        this.currentAudio = null; // เก็บเสียงที่กำลังเล่นอยู่
        this.audioQueue = []; // คิวเสียง
        this.isProcessingQueue = false;
        
        // โหลดเสียงภาษาไทยทั้งหมด
        this.loadThaiAudios();
        
        // ตั้งค่าปุ่มเปลี่ยนภาษา
        this.setupLanguageToggle();
        
        // ตั้งค่าภาษาเริ่มต้น
        this.updateLanguage('th');
    }
    
    loadThaiAudios() {
        const audioFiles = [
            'welcome.wav',
            'armconfirm.wav',
            'leftarm.wav',
            'rightarm.wav',
            'mode1.wav',
            'mode2.wav',
            'mode3.wav',
            'mode4.wav',
            'mode5.wav'
        ];
        
        audioFiles.forEach(file => {
            const audio = new Audio(file);
            audio.preload = 'auto';
            // เร่งสปีดเสียงทุกไฟล์
            audio.playbackRate = 2.5; // เร่งสปีด 150% (เร็วมากขึ้น)
            this.audioCache[file] = audio;
        });
        
        console.log('✅ โหลดเสียงภาษาไทยเรียบร้อย');
    }
    
    setupLanguageToggle() {
        const langToggle = document.getElementById('langToggle');
        if (langToggle) {
            langToggle.addEventListener('click', () => {
                this.toggleLanguage();
            });
        }
    }
    
    toggleLanguage() {
        this.currentLang = this.currentLang === 'th' ? 'en' : 'th';
        this.updateLanguage(this.currentLang);
        console.log(`🌐 เปลี่ยนภาษาเป็น: ${this.currentLang === 'th' ? 'ไทย' : 'English'}`);
    }
    
    updateLanguage(lang) {
        const langToggle = document.getElementById('langToggle');
        
        // ฟังก์ชันช่วยตั้งค่า textContent อย่างปลอดภัย
        const setText = (id, text) => {
            const el = document.getElementById(id);
            if (el) el.textContent = text;
        };
        
        const setTextBySelector = (selector, text) => {
            const el = document.querySelector(selector);
            if (el) el.textContent = text;
        };
        
        if (lang === 'th') {
            // ภาษาไทย - แสดง TH (ภาษาปัจจุบัน)
            if (langToggle) langToggle.textContent = '🌐 TH';
            setText('mainTitle', 'อุปกรณ์ฟื้นฟูสมรรถภาพกล้ามเนื้อแขน');
            setText('subtitle', 'ควบคุมผ่าน WebSocket - ไม่ต้องใส่ IP');
            setText('scanBtnText', 'เชื่อมต่อ Server');
            setText('skipBtnText', 'ข้ามไปทดสอบ (ไม่มีบอร์ด)');
            setText('deviceControlTitle', 'เจออุปกรณ์ฟื้นฟูสมรรถภาพกล้ามเนื้อแขนแล้ว');
            setText('deviceNameLabel', 'ชื่อ:');
            setText('deviceAddressLabel', 'การเชื่อมต่อ:');
            setText('deviceStatusLabel', 'สถานะ:');
            setText('armSelectionTitle', 'เลือกแขน');
            setText('rightArmLabel', 'แขนขวา');
            setText('leftArmLabel', 'แขนซ้าย');
            setText('modeControlTitle', 'เลือกโหมด');
            setTextBySelector('.mode-label-1', 'โหมด 1');
            setTextBySelector('.mode-label-2', 'โหมด 2');
            setTextBySelector('.mode-label-3', 'โหมด 3');
            setTextBySelector('.mode-label-4', 'โหมด 4');
            setTextBySelector('.mode-label-5', 'หยุดการทำงาน');
            setText('voiceControlTitle', '🎤 สั่งงานด้วยเสียง');
            setText('startVoiceBtnText', 'เริ่มฟังคำสั่ง');
            setText('stopVoiceBtnText', 'หยุดฟังคำสั่ง');
            setText('cameraControlTitle', '🤖 AI ตรวจจับนิ้วมือ');
            setText('startCameraBtnText', 'เปิดกล้อง');
            setText('stopCameraBtnText', 'ปิดกล้อง');
        } else {
            // ภาษาอังกฤษ - แสดง EN (ภาษาปัจจุบัน)
            if (langToggle) langToggle.textContent = '🌐 EN';
            setText('mainTitle', 'Arm Physiotherapy Controller');
            setText('subtitle', 'WebSocket Control - No IP Required');
            setText('scanBtnText', 'Connect to Server');
            setText('skipBtnText', 'Skip to Test (No Board)');
            setText('deviceControlTitle', 'Arm Rehabilitation Device Found');
            setText('deviceNameLabel', 'Name:');
            setText('deviceAddressLabel', 'Connection:');
            setText('deviceStatusLabel', 'Status:');
            setText('armSelectionTitle', 'Select Arm');
            setText('rightArmLabel', 'Right Arm');
            setText('leftArmLabel', 'Left Arm');
            setText('modeControlTitle', 'Select Mode');
            setTextBySelector('.mode-label-1', 'Mode 1');
            setTextBySelector('.mode-label-2', 'Mode 2');
            setTextBySelector('.mode-label-3', 'Mode 3');
            setTextBySelector('.mode-label-4', 'Mode 4');
            setTextBySelector('.mode-label-5', 'Stop');
            setText('voiceControlTitle', '🎤 Voice Control');
            setText('startVoiceBtnText', 'Start Listening');
            setText('stopVoiceBtnText', 'Stop Listening');
            setText('cameraControlTitle', '🤖 AI Hand Detection');
            setText('startCameraBtnText', 'Start Camera');
            setText('stopCameraBtnText', 'Stop Camera');
        }
    }
    
    // หยุดเสียงปัจจุบัน
    stopCurrentAudio() {
        if (this.currentAudio) {
            this.currentAudio.pause();
            this.currentAudio.currentTime = 0;
            this.currentAudio.onended = null;
            this.currentAudio = null;
        }
    }

    // เพิ่มเสียงเข้าคิว
    addToQueue(filename, callback = null) {
        this.audioQueue.push({ filename, callback });
        if (!this.isProcessingQueue) {
            this.processQueue();
        }
    }

    // ประมวลผลคิวเสียง
    async processQueue() {
        if (this.isProcessingQueue || this.audioQueue.length === 0) return;
        
        this.isProcessingQueue = true;
        
        while (this.audioQueue.length > 0) {
            const { filename, callback } = this.audioQueue.shift();
            await this.playThaiAudioSync(filename, callback);
        }
        
        this.isProcessingQueue = false;
    }

    // เล่นเสียงแบบ sync (รอจนจบ)
    playThaiAudioSync(filename, callback = null) {
        if (this.currentLang !== 'th') return Promise.resolve();
        
        return new Promise((resolve) => {
            const audio = this.audioCache[filename];
            if (audio) {
                // หยุดเสียงเก่าก่อน
                this.stopCurrentAudio();
                
                this.currentAudio = audio;
                audio.currentTime = 0;
                
                audio.onended = () => {
                    this.currentAudio = null;
                    audio.onended = null;
                    if (callback) callback();
                    resolve();
                };
                
                audio.play().catch(err => {
                    console.warn(`⚠️ ไม่สามารถเล่นเสียง ${filename}:`, err);
                    this.currentAudio = null;
                    if (callback) callback();
                    resolve();
                });
            } else {
                console.warn(`⚠️ ไม่พบไฟล์เสียง: ${filename}`);
                if (callback) callback();
                resolve();
            }
        });
    }

    // เล่นเสียงภาษาไทย (แบบเดิม - ใช้คิว)
    playThaiAudio(filename, callback = null) {
        if (this.currentLang !== 'th') return;
        this.addToQueue(filename, callback);
    }

    // เล่นเสียงทันที (หยุดเสียงเก่า)
    playThaiAudioImmediate(filename, callback = null) {
        if (this.currentLang !== 'th') return;
        
        // ล้างคิวและเล่นทันที
        this.audioQueue = [];
        this.stopCurrentAudio();
        this.playThaiAudioSync(filename, callback);
    }
    
    // เล่นเสียง welcome และรอจนจบ
    async playWelcomeAndWait() {
        if (this.currentLang !== 'th') return;
        if (this.isPlayingWelcome) return; // ป้องกันเล่นซ้ำ
        
        this.isPlayingWelcome = true;
        const audio = this.audioCache['welcome.wav'];
        
        if (audio) {
            return new Promise((resolve) => {
                audio.currentTime = 0;
                audio.onended = () => {
                    this.isPlayingWelcome = false;
                    resolve();
                };
                audio.play().catch(err => {
                    console.warn('⚠️ ไม่สามารถเล่นเสียง welcome.wav:', err);
                    this.isPlayingWelcome = false;
                    resolve();
                });
            });
        } else {
            this.isPlayingWelcome = false;
        }
    }
    
    // พูดเสียงตามภาษา
    speak(textTh, textEn) {
        if (this.currentLang === 'th') {
            // ภาษาไทย - ไม่ใช้ Web Speech API
            console.log(`🔊 [TH] ${textTh}`);
        } else {
            // ภาษาอังกฤษ - ใช้ Web Speech API
            this.esp32Controller.speak(textEn);
        }
    }
    
    // พูดเมื่อระบบพร้อม
    async speakReady() {
        // ⭐ เฉพาะภาษาไทยเท่านั้น - อังกฤษไม่พูด
        if (this.currentLang === 'th') {
            await this.playWelcomeAndWait();
        }
        // ⭐ ภาษาอังกฤษไม่พูดอะไรเลย
    }
    
    // พูดเมื่อยังไม่ได้เลือกแขน
    speakSelectArm() {
        // ⭐ เฉพาะภาษาไทยเท่านั้น
        if (this.currentLang === 'th') {
            this.playThaiAudioImmediate('armconfirm.wav'); // เล่นทันทีเพื่อแจ้งเตือน
        }
        // ⭐ ภาษาอังกฤษไม่พูดอะไรเลย
    }
    
    // พูดเมื่อเลือกแขน
    speakArmSelected(arm) {
        // ⭐ เฉพาะภาษาไทยเท่านั้น
        if (this.currentLang === 'th') {
            if (arm === 'left') {
                this.playThaiAudioImmediate('leftarm.wav'); // เล่นทันทีเพื่อยืนยัน
            } else {
                this.playThaiAudioImmediate('rightarm.wav'); // เล่นทันทีเพื่อยืนยัน
            }
        }
        // ⭐ ภาษาอังกฤษไม่พูดอะไรเลย
    }
    
    // พูดเมื่อเริ่มโหมด
    speakMode(mode, armName = '') {
        // ⭐ เฉพาะภาษาไทยเท่านั้น
        if (this.currentLang === 'th') {
            // เล่นเสียงไทย - ใช้ระบบคิวเพื่อป้องกันเสียงซ้อนกัน
            if (armName) {
                const armAudio = armName === 'แขนขวา' ? 'rightarm.wav' : 'leftarm.wav';
                this.addToQueue(armAudio);
                this.addToQueue(`mode${mode}.wav`);
            } else {
                this.addToQueue(`mode${mode}.wav`);
            }
        }
        // ⭐ ภาษาอังกฤษไม่พูดอะไรเลย
    }
}

// สร้าง instance เมื่อ ESP32Controller พร้อม
let languageManager = null;
