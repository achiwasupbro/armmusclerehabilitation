// ระบบเปลี่ยนภาษาและเสียง
class LanguageManager {
    constructor(esp32Controller) {
        this.esp32Controller = esp32Controller;
        this.currentLang = 'th'; // ภาษาเริ่มต้น: ไทย
        this.audioCache = {}; // เก็บ Audio objects
        this.isPlayingWelcome = false;
        
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
            // เร่งสปีดเสียงทุกไฟล์ยกเว้นโหมด
            if (!file.startsWith('mode')) {
                audio.playbackRate = 1.5; // เร่งสปีด 50% (เร็วขึ้นมาก)
            }
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
        
        if (lang === 'th') {
            // ภาษาไทย - แสดง TH (ภาษาปัจจุบัน)
            langToggle.textContent = '🌐 TH';
            document.getElementById('mainTitle').textContent = 'ระบบควบคุมหุ่นยนต์กายภาพบำบัดแขน';
            document.getElementById('subtitle').textContent = 'ควบคุมหุ่นยนต์กายภาพบำบัด - ไม่ต้องใส่ IP เอง';
            document.getElementById('scanBtnText').textContent = 'ค้นหา ESP32 อัตโนมัติ';
            document.getElementById('skipBtnText').textContent = 'ข้ามไปทดสอบ (ไม่มีบอร์ด)';
            document.getElementById('deviceControlTitle').textContent = 'เจออุปกรณ์ฟื้นฟูสมรรถภาพกล้ามเนื้อแขนแล้ว';
            document.getElementById('deviceNameLabel').textContent = 'ชื่อ:';
            document.getElementById('deviceAddressLabel').textContent = 'Address:';
            document.getElementById('deviceStatusLabel').textContent = 'สถานะ:';
            document.getElementById('armSelectionTitle').textContent = 'เลือกแขน';
            document.getElementById('rightArmLabel').textContent = 'แขนขวา';
            document.getElementById('leftArmLabel').textContent = 'แขนซ้าย';
            document.getElementById('modeControlTitle').textContent = 'เลือกโหมด';
            document.querySelector('.mode-label-1').textContent = 'โหมด 1';
            document.querySelector('.mode-label-2').textContent = 'โหมด 2';
            document.querySelector('.mode-label-3').textContent = 'โหมด 3';
            document.querySelector('.mode-label-4').textContent = 'โหมด 4';
            document.querySelector('.mode-label-5').textContent = 'หยุดการทำงาน';
            document.getElementById('voiceControlTitle').textContent = '🎤 สั่งงานด้วยเสียง';
            document.getElementById('startVoiceBtnText').textContent = 'เริ่มฟังคำสั่ง';
            document.getElementById('stopVoiceBtnText').textContent = 'หยุดฟังคำสั่ง';
            document.getElementById('cameraControlTitle').textContent = '🤖 AI ตรวจจับนิ้วมือ';
            document.getElementById('startCameraBtnText').textContent = 'เปิดกล้อง';
            document.getElementById('stopCameraBtnText').textContent = 'ปิดกล้อง';
        } else {
            // ภาษาอังกฤษ - แสดง EN (ภาษาปัจจุบัน)
            langToggle.textContent = '🌐 EN';
            document.getElementById('mainTitle').textContent = 'Arm Physiotherapy Controller';
            document.getElementById('subtitle').textContent = 'Control Physiotherapy Robot - Auto Discovery';
            document.getElementById('scanBtnText').textContent = 'Scan ESP32 Automatically';
            document.getElementById('skipBtnText').textContent = 'Skip to Test (No Board)';
            document.getElementById('deviceControlTitle').textContent = 'Arm Rehabilitation Device Found';
            document.getElementById('deviceNameLabel').textContent = 'Name:';
            document.getElementById('deviceAddressLabel').textContent = 'Address:';
            document.getElementById('deviceStatusLabel').textContent = 'Status:';
            document.getElementById('armSelectionTitle').textContent = 'Select Arm';
            document.getElementById('rightArmLabel').textContent = 'Right Arm';
            document.getElementById('leftArmLabel').textContent = 'Left Arm';
            document.getElementById('modeControlTitle').textContent = 'Select Mode';
            document.querySelector('.mode-label-1').textContent = 'Mode 1';
            document.querySelector('.mode-label-2').textContent = 'Mode 2';
            document.querySelector('.mode-label-3').textContent = 'Mode 3';
            document.querySelector('.mode-label-4').textContent = 'Mode 4';
            document.querySelector('.mode-label-5').textContent = 'Stop';
            document.getElementById('voiceControlTitle').textContent = '🎤 Voice Control';
            document.getElementById('startVoiceBtnText').textContent = 'Start Listening';
            document.getElementById('stopVoiceBtnText').textContent = 'Stop Listening';
            document.getElementById('cameraControlTitle').textContent = '🤖 AI Hand Detection';
            document.getElementById('startCameraBtnText').textContent = 'Start Camera';
            document.getElementById('stopCameraBtnText').textContent = 'Stop Camera';
        }
    }
    
    // เล่นเสียงภาษาไทย
    playThaiAudio(filename, callback = null) {
        if (this.currentLang !== 'th') return; // เล่นเฉพาะภาษาไทย
        
        const audio = this.audioCache[filename];
        if (audio) {
            audio.currentTime = 0;
            
            // ถ้ามี callback ให้เรียกเมื่อเสียงเล่นจบ
            if (callback) {
                audio.onended = () => {
                    callback();
                    audio.onended = null; // ลบ event listener
                };
            }
            
            audio.play().catch(err => {
                console.warn(`⚠️ ไม่สามารถเล่นเสียง ${filename}:`, err);
                // ถ้าเล่นไม่ได้แต่มี callback ให้เรียกทันที
                if (callback) callback();
            });
        } else {
            console.warn(`⚠️ ไม่พบไฟล์เสียง: ${filename}`);
            // ถ้าไม่พบไฟล์แต่มี callback ให้เรียกทันที
            if (callback) callback();
        }
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
        if (this.currentLang === 'th') {
            await this.playWelcomeAndWait();
        } else {
            this.speak('', 'Ready. Mode start operation. Please select the arm side.');
        }
    }
    
    // พูดเมื่อยังไม่ได้เลือกแขน
    speakSelectArm() {
        if (this.currentLang === 'th') {
            this.playThaiAudio('armconfirm.wav');
        } else {
            this.speak('', 'Please select the arm side.');
        }
    }
    
    // พูดเมื่อเลือกแขน
    speakArmSelected(arm) {
        if (this.currentLang === 'th') {
            if (arm === 'left') {
                this.playThaiAudio('leftarm.wav');
            } else {
                this.playThaiAudio('rightarm.wav');
            }
        } else {
            const armText = arm === 'left' ? 'Left arm' : 'Right arm';
            this.speak('', `${armText} selected`);
        }
    }
    
    // พูดเมื่อเริ่มโหมด
    speakMode(mode, armName = '') {
        if (this.currentLang === 'th') {
            // เล่นเสียงไทย - เล่นชื่อแขนก่อน (ถ้ามี) แล้วค่อยเล่นโหมด
            if (armName) {
                const armAudio = armName === 'แขนขวา' ? 'rightarm.wav' : 'leftarm.wav';
                this.playThaiAudio(armAudio, () => {
                    // เล่นเสียงโหมดหลังจากเสียงแขนเล่นเสร็จ
                    setTimeout(() => {
                        this.playThaiAudio(`mode${mode}.wav`);
                    }, 100);
                });
            } else {
                this.playThaiAudio(`mode${mode}.wav`);
            }
        } else {
            const armText = armName ? `${armName} ` : '';
            this.speak('', `${armText}Starting mode ${mode}`);
        }
    }
}

// สร้าง instance เมื่อ ESP32Controller พร้อม
let languageManager = null;
