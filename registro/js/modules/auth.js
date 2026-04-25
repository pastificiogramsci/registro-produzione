const AuthManager = {
    password: null,
    isAuthenticated: false,
    sessionKey: 'appAuthSession',

    init() {
        // Controlla se c'è sessione salvata
        const session = this.getSession();
        if (session && !this.sessionExpired(session)) {
            // Recupera password dalla sessione
            const decrypted = CryptoJS.AES.decrypt(session.encryptedPassword, session.token);
            this.password = decrypted.toString(CryptoJS.enc.Utf8);
            this.isAuthenticated = true;
            return true;
        }
        return false;
    },

    login(password, remember = false) {
        // Password fissa (puoi cambiarla)
        const correctPassword = '22gennaio92Nadia!'; // ← CAMBIA QUESTA

        if (password === correctPassword) {
            this.password = password;
            this.isAuthenticated = true;
            this.saveSession(remember);
            return true;
        }
        return false;
    },

    logout() {
        this.password = null;
        this.isAuthenticated = false;
        this.clearSession();
        location.reload();
    },

    saveSession(remember) {
        const expiry = remember
            ? Date.now() + (30 * 24 * 60 * 60 * 1000) // 30 giorni
            : Date.now() + (30 * 60 * 1000); // 30 minuti

        const token = this.generateSecureToken();
        const encryptedPassword = CryptoJS.AES.encrypt(this.password, token).toString();

        const session = {
            token: token,
            encryptedPassword: encryptedPassword,
            expiry: expiry
        };

        const storage = remember ? localStorage : sessionStorage;
        storage.setItem(this.sessionKey, JSON.stringify(session));
    },

    generateSecureToken() {
        const array = new Uint8Array(32);
        crypto.getRandomValues(array);
        return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
    },

    getSession() {
        let sessionData = localStorage.getItem(this.sessionKey);
        if (sessionData) return JSON.parse(sessionData);

        sessionData = sessionStorage.getItem(this.sessionKey);
        if (sessionData) return JSON.parse(sessionData);

        return null;
    },

    clearSession() {
        localStorage.removeItem(this.sessionKey);
        sessionStorage.removeItem(this.sessionKey);
    },

    sessionExpired(session) {
        return Date.now() > session.expiry;
    },

    // CRITTOGRAFIA
    encrypt(data) {
        if (!this.password) return null;
        const encrypted = CryptoJS.AES.encrypt(JSON.stringify(data), this.password).toString();
        return encrypted;
    },

    decrypt(encryptedData) {
        if (!this.password || !encryptedData) return null;
        try {
            const decrypted = CryptoJS.AES.decrypt(encryptedData, this.password);
            const decryptedStr = decrypted.toString(CryptoJS.enc.Utf8);
            return JSON.parse(decryptedStr);
        } catch (e) {
            console.error('Errore decrittazione:', e);
            return null;
        }
    }
};

window.AuthManager = AuthManager;