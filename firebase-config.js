// Firebase Configuration
const firebaseConfig = {
    apiKey: "AIzaSyA6-QbUtR4ILamZc_S2Jva_ZRv-imesqHo",
    authDomain: "arm-rehabilitation.firebaseapp.com",
    databaseURL: "https://arm-rehabilitation-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "arm-rehabilitation",
    storageBucket: "arm-rehabilitation.firebasestorage.app",
    messagingSenderId: "661826211482",
    appId: "1:661826211482:web:47a1b4ac92bb06503ed923",
    measurementId: "G-01PMGWNSTN"
};

// Initialize Firebase
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import { getDatabase, ref, set, onValue, off } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js';

const app = initializeApp(firebaseConfig);
const database = getDatabase(app);

// Firebase Database Manager
class FirebaseManager {
    constructor() {
        this.database = database;
        this.deviceId = this.generateDeviceId();
        this.listeners = new Map();
        
        console.log('🔥 Firebase initialized, Device ID:', this.deviceId);
    }
    
    // สร้าง Device ID ที่ไม่ซ้ำ
    generateDeviceId() {
        // ใช้ Device ID เดียวกับ ESP32
        return 'esp32_001';
        localStorage.setItem('deviceId', newId);
        return newId;
    }
    
    // ส่งโหมดไป Firebase
    async sendMode(mode, arm = 'right') {
        try {
            const modeData = {
                mode: parseInt(mode),
                arm: arm,
                timestamp: Date.now(),
                deviceId: this.deviceId,
                status: 'pending'
            };
            
            const modeRef = ref(this.database, `commands/${this.deviceId}/currentMode`);
            await set(modeRef, modeData);
            
            console.log('🔥 ส่งโหมดไป Firebase:', modeData);
            return true;
        } catch (error) {
            console.error('❌ ส่งโหมดไป Firebase ไม่สำเร็จ:', error);
            return false;
        }
    }
    
    // ส่งสถานะอุปกรณ์
    async sendDeviceStatus(status) {
        try {
            const statusData = {
                status: status, // 'online', 'offline', 'busy'
                lastSeen: Date.now(),
                deviceId: this.deviceId
            };
            
            const statusRef = ref(this.database, `devices/${this.deviceId}/status`);
            await set(statusRef, statusData);
            
            console.log('🔥 ส่งสถานะอุปกรณ์:', statusData);
            return true;
        } catch (error) {
            console.error('❌ ส่งสถานะอุปกรณ์ไม่สำเร็จ:', error);
            return false;
        }
    }
    
    // ฟังการเปลี่ยนแปลงสถานะจาก ESP32
    listenToProgress(callback) {
        const progressRef = ref(this.database, `devices/${this.deviceId}/progress`);
        
        const listener = onValue(progressRef, (snapshot) => {
            const data = snapshot.val();
            if (data && callback) {
                callback(data);
            }
        });
        
        this.listeners.set('progress', { ref: progressRef, listener });
        console.log('🔥 เริ่มฟังสถานะ progress จาก Firebase');
    }
    
    // ฟังการเปลี่ยนแปลงสถานะอุปกรณ์
    listenToDeviceStatus(callback) {
        const statusRef = ref(this.database, `devices/${this.deviceId}/status`);
        
        const listener = onValue(statusRef, (snapshot) => {
            const data = snapshot.val();
            if (data && callback) {
                callback(data);
            }
        });
        
        this.listeners.set('status', { ref: statusRef, listener });
        console.log('🔥 เริ่มฟังสถานะอุปกรณ์จาก Firebase');
    }
    
    // หยุดฟัง
    stopListening(type) {
        const listenerData = this.listeners.get(type);
        if (listenerData) {
            off(listenerData.ref, listenerData.listener);
            this.listeners.delete(type);
            console.log(`🔥 หยุดฟัง ${type} จาก Firebase`);
        }
    }
    
    // หยุดฟังทั้งหมด
    stopAllListening() {
        for (const [type] of this.listeners) {
            this.stopListening(type);
        }
    }
    
    // ตรวจสอบการเชื่อมต่อ
    async testConnection() {
        try {
            const testRef = ref(this.database, `test/${this.deviceId}`);
            await set(testRef, { timestamp: Date.now() });
            console.log('🔥 Firebase เชื่อมต่อสำเร็จ');
            return true;
        } catch (error) {
            console.error('❌ Firebase เชื่อมต่อไม่สำเร็จ:', error);
            return false;
        }
    }
}

// Export for use in other files
window.FirebaseManager = FirebaseManager;