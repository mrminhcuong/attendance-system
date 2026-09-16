class DeviceIdentity {
    constructor() {
        this.deviceIdKey = 'device_id';
    }

    async getFingerprint() {
        let deviceId = localStorage.getItem(this.deviceIdKey);
        if (deviceId) {
            return deviceId;
        }

        const components = [
            this.getCanvasFingerprint(),
            this.getScreenInfo(),
            this.getNavigatorInfo(),
            this.getTimezone(),
            this.getWebGLInfo()
        ];

        const rawString = components.join('|');
        const hash = await this.sha256(rawString);
        
        const uuid = crypto.randomUUID ? crypto.randomUUID() : this.generateUUID();
        deviceId = `${hash}-${uuid}`;
        
        localStorage.setItem(this.deviceIdKey, deviceId);
        return deviceId;
    }

    getDeviceInfo() {
        return {
            userAgent: navigator.userAgent,
            platform: navigator.platform,
            language: navigator.language,
            screenResolution: `${window.screen.width}x${window.screen.height}`,
            timezone: this.getTimezone()
        };
    }

    getCanvasFingerprint() {
        try {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            canvas.width = 200;
            canvas.height = 50;
            ctx.textBaseline = 'top';
            ctx.font = '14px Arial';
            ctx.textBaseline = 'alphabetic';
            ctx.fillStyle = '#f60';
            ctx.fillRect(125, 1, 62, 20);
            ctx.fillStyle = '#069';
            ctx.fillText('Attendance Fingerprint, 😃', 2, 15);
            ctx.fillStyle = 'rgba(102, 204, 0, 0.7)';
            ctx.fillText('Attendance Fingerprint, 😃', 4, 17);
            return canvas.toDataURL();
        } catch (e) {
            return 'canvas_error';
        }
    }

    getScreenInfo() {
        return `${window.screen.width}x${window.screen.height}x${window.screen.colorDepth}x${window.devicePixelRatio}`;
    }

    getNavigatorInfo() {
        return `${navigator.userAgent}|${navigator.language}|${navigator.platform}|${navigator.hardwareConcurrency || 'unknown'}|${navigator.deviceMemory || 'unknown'}`;
    }

    getTimezone() {
        try {
            return Intl.DateTimeFormat().resolvedOptions().timeZone;
        } catch (e) {
            return 'timezone_error';
        }
    }

    getWebGLInfo() {
        try {
            const canvas = document.createElement('canvas');
            const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
            if (!gl) return 'webgl_not_supported';
            const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
            if (!debugInfo) return 'webgl_debug_not_supported';
            const vendor = gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL);
            const renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
            return `${vendor}|${renderer}`;
        } catch (e) {
            return 'webgl_error';
        }
    }

    async sha256(message) {
        const msgBuffer = new TextEncoder().encode(message);
        const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        return hashHex;
    }

    generateUUID() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }
}

window.DeviceIdentity = new DeviceIdentity();
