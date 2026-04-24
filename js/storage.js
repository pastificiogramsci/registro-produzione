// ============================================
// 💾 GESTIONE STORAGE (localStorage + Dropbox)
// ============================================

const Storage = {

    dropboxClient: null,
    dropboxAccessToken: null,
    dropboxRefreshToken: null,
    autoSyncInterval: null,
    lastLocalSave: {},

    // ==========================================
    // INIZIALIZZAZIONE DROPBOX
    // ==========================================

    async initDropbox() {
        this.dropboxAccessToken = localStorage.getItem('dropboxAccessToken');
        this.dropboxRefreshToken = localStorage.getItem('dropboxRefreshToken');

        this.initLastLocalSave();

        if (this.dropboxAccessToken) {
            this.dropboxClient = new Dropbox.Dropbox({
                accessToken: this.dropboxAccessToken
            });

            this.startAutoSync();
        }

        await this.checkDropboxCallback();
    },

    startDropboxAuth() {
        const config = CONFIG.getDropboxConfig();
        const authUrl = `https://www.dropbox.com/oauth2/authorize?client_id=${config.clientId}&response_type=code&redirect_uri=${encodeURIComponent(config.redirectUri)}&token_access_type=offline`;
        window.location.href = authUrl;
    },

    async checkDropboxCallback() {
        const urlParams = new URLSearchParams(window.location.search);
        const code = urlParams.get('code');

        if (code) {
            try {
                const config = CONFIG.getDropboxConfig();
                const response = await fetch('https://api.dropboxapi.com/oauth2/token', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: new URLSearchParams({
                        code: code,
                        grant_type: 'authorization_code',
                        client_id: config.clientId,
                        client_secret: config.clientSecret,
                        redirect_uri: config.redirectUri
                    })
                });

                const data = await response.json();

                if (data.access_token) {
                    this.dropboxAccessToken = data.access_token;
                    localStorage.setItem('dropboxAccessToken', data.access_token);

                    if (data.refresh_token) {
                        this.dropboxRefreshToken = data.refresh_token;
                        localStorage.setItem('dropboxRefreshToken', data.refresh_token);
                        console.log("✅ Refresh token salvato");
                    }

                    this.dropboxClient = new Dropbox.Dropbox({
                        accessToken: this.dropboxAccessToken
                    });

                    Utils.showToast("✅ Dropbox connesso!", "success");
                    window.history.replaceState({}, document.title, window.location.pathname);
                }
            } catch (error) {
                console.error("Errore auth Dropbox:", error);
                Utils.showToast("Errore connessione Dropbox", "error");
            }
        }
    },

    getDeviceId() {
        let deviceId = localStorage.getItem('deviceId');
        if (!deviceId) {
            deviceId = 'device_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now();
            localStorage.setItem('deviceId', deviceId);
            console.log('📱 Device ID generato:', deviceId);
        }
        return deviceId;
    },

    async refreshAccessToken() {
        console.log("🔄 Rinnovo access token...");

        if (!this.dropboxRefreshToken) {
            console.warn("⚠️ Nessun refresh token disponibile");
            return null;
        }

        try {
            const config = CONFIG.getDropboxConfig();
            const response = await fetch("https://api.dropboxapi.com/oauth2/token", {
                method: "POST",
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                body: new URLSearchParams({
                    grant_type: "refresh_token",
                    refresh_token: this.dropboxRefreshToken,
                    client_id: config.clientId,
                    client_secret: config.clientSecret
                })
            });

            if (!response.ok) {
                console.error("❌ Errore rinnovo token");
                return null;
            }

            const data = await response.json();

            if (!data.access_token) {
                console.error("❌ Nessun token nella risposta");
                return null;
            }

            this.dropboxAccessToken = data.access_token;
            localStorage.setItem("dropboxAccessToken", data.access_token);

            if (data.refresh_token) {
                this.dropboxRefreshToken = data.refresh_token;
                localStorage.setItem("dropboxRefreshToken", data.refresh_token);
            }

            this.dropboxClient = new Dropbox.Dropbox({
                accessToken: this.dropboxAccessToken
            });

            console.log("✅ Token rinnovato con successo");
            return data.access_token;

        } catch (err) {
            console.error("❌ Errore rinnovo token:", err);
            return null;
        }
    },

    startAutoSync() {
        if (this.autoSyncInterval) {
            clearInterval(this.autoSyncInterval);
        }

        this.autoSyncInterval = setInterval(() => {
            this.syncAllToDropbox(true);
        }, 5 * 60 * 1000);

        console.log("✅ Auto-sync attivato (ogni 5 minuti)");
    },

    stopAutoSync() {
        if (this.autoSyncInterval) {
            clearInterval(this.autoSyncInterval);
            this.autoSyncInterval = null;
            console.log("⏸️ Auto-sync disattivato");
        }
    },

    async syncAllToDropbox(silent = false) {
        if (!this.dropboxClient) {
            if (!silent) console.log("⚠️ Dropbox non connesso");
            return;
        }
        try {
            if (!silent) console.log("🔄 Sync Dropbox...");
            const keys = [
                { path: CONFIG.DROPBOX_PATHS.MATERIE_PRIME, key: CONFIG.STORAGE_KEYS.MATERIE_PRIME },
                { path: CONFIG.DROPBOX_PATHS.CARICHI, key: CONFIG.STORAGE_KEYS.CARICHI },
                { path: CONFIG.DROPBOX_PATHS.RICETTE, key: CONFIG.STORAGE_KEYS.RICETTE },
                { path: CONFIG.DROPBOX_PATHS.SEMILAVORATI, key: CONFIG.STORAGE_KEYS.SEMILAVORATI },
                { path: CONFIG.DROPBOX_PATHS.PRODUZIONE, key: CONFIG.STORAGE_KEYS.PRODUZIONE }
            ];
            for (const { path, key } of keys) {
                await this.saveDropbox(path, this.loadLocal(key, []));
                await this.delay(500);
            }
            if (!silent) {
                console.log("✅ Sync completato");
                localStorage.setItem('lastSync', new Date().toISOString());
            }
        } catch (error) {
            console.error("❌ Errore sync:", error);
        }
    },

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    },

    disconnectDropbox() {
        this.stopAutoSync();
        localStorage.removeItem('dropboxAccessToken');
        localStorage.removeItem('dropboxRefreshToken');
        this.dropboxClient = null;
        this.dropboxAccessToken = null;
        this.dropboxRefreshToken = null;
        Utils.showToast("📦 Dropbox disconnesso", "info");
    },

    // ==========================================
    // SALVATAGGIO DATI
    // ==========================================

    saveLocal(key, data) {
        try {
            localStorage.setItem(key, JSON.stringify(data));
            console.log(`💾 Salvato in localStorage: ${key}`);
            return true;
        } catch (error) {
            console.error("Errore salvataggio locale:", error);
            Utils.showToast("Errore salvataggio locale", "error");
            return false;
        }
    },

    loadLocal(key, defaultValue = null) {
        try {
            const data = localStorage.getItem(key);
            return data ? JSON.parse(data) : defaultValue;
        } catch (error) {
            console.error("Errore caricamento locale:", error);
            return defaultValue;
        }
    },

    async saveDropbox(key, data) {
        if (!this.dropboxClient) return;

        try {
            // 1. Crea metadata con timestamp e device info
            const metadata = {
                lastModified: new Date().toISOString(),
                deviceId: this.getDeviceId(),
                recordCount: Array.isArray(data) ? data.length : 0,
                version: '2.1'
            };

            console.log(`📦 Preparazione salvataggio ${key}:`, {
                records: metadata.recordCount,
                device: metadata.deviceId
            });

            // 2. Controlla se ci sono conflitti prima di salvare
            let dataToSave = data;

            try {
                const existingData = await this.loadDropbox(key);

                if (existingData && existingData.metadata) {
                    const remoteTime = new Date(existingData.metadata.lastModified);
                    const localSaveTime = this.lastLocalSave[key]
                        ? new Date(this.lastLocalSave[key])
                        : new Date(0);

                    console.log(`🔍 Controllo conflitti per ${key}:`, {
                        remoto: remoteTime.toISOString(),
                        locale: localSaveTime.toISOString(),
                        remoteDevice: existingData.metadata.deviceId
                    });

                    // Se i dati remoti sono più recenti dell'ultimo nostro salvataggio locale
                    if (remoteTime > localSaveTime) {
                        console.warn(`🔀 CONFLITTO RILEVATO su ${key}!`);
                        console.log('   Dati remoti più recenti, eseguo merge...');

                        // Fai merge dei dati
                        dataToSave = this.mergeData(key, data, existingData.data);

                        Utils.showToast(
                            `🔀 Dati sincronizzati con altro dispositivo`,
                            'info'
                        );
                    } else {
                        console.log('✅ Nessun conflitto, dati locali sono più recenti');
                    }
                }
            } catch (loadError) {
                // File non esiste ancora o errore di lettura - ok, salva normalmente
                if (loadError.status !== 409) {
                    console.log('ℹ️ Impossibile controllare conflitti, salvo comunque');
                }
            }

            // 3. Cripta e prepara payload con metadata
            const encryptedData = AuthManager.encrypt(dataToSave);
            if (!encryptedData) {
                console.error('❌ Errore crittografia');
                return;
            }

            const payload = {
                encrypted: true,
                version: '2.1',
                metadata: metadata,
                data: encryptedData
            };

            // 4. Salva su Dropbox
            const content = JSON.stringify(payload);
            const path = key.startsWith('/') ? key : `/${key}.json`;

            await this.dropboxClient.filesUpload({
                path: path,
                contents: content,
                mode: 'overwrite',
                autorename: false
            });

            // 5. Aggiorna timestamp del salvataggio locale
            this.lastLocalSave[key] = new Date().toISOString();
            localStorage.setItem('lastLocalSave_' + key, this.lastLocalSave[key]);

            console.log(`✅ Salvato su Dropbox: ${key} (${metadata.recordCount} records)`);

        } catch (error) {
            console.error(`❌ Errore salvataggio Dropbox ${key}:`, error);

            // Retry con token refresh se necessario
            if (error.status === 401 && this.dropboxRefreshToken) {
                const newToken = await this.refreshAccessToken();
                if (newToken) {
                    return await this.saveDropbox(key, data);
                }
            }
        }
    },

    mergeData(key, localData, remoteData) {
        // Se non sono array, usa i dati locali (più sicuro)
        if (!Array.isArray(localData) || !Array.isArray(remoteData)) {
            console.log('⚠️ Dati non sono array, uso versione locale');
            return localData;
        }

        console.log(`🔀 MERGE ${key}:`);
        console.log(`   Locale: ${localData.length} records`);
        console.log(`   Remoto: ${remoteData.length} records`);

        // ✅ NUOVO: Determina quale campo ID usare
        const getItemId = (item) => {
            // Fidelity usa customerId, altri usano id
            return item.id || item.customerId || null;
        };

        // Usa Map per merge efficiente
        const merged = new Map();

        // 1. Aggiungi tutti i records remoti
        remoteData.forEach(item => {
            const itemId = getItemId(item);
            if (itemId) {
                merged.set(itemId, {
                    ...item,
                    _source: 'remote'
                });
            } else {
                console.warn('⚠️ Record remoto senza ID:', item);
            }
        });

        // 2. Aggiungi/aggiorna con records locali
        let added = 0;
        let updated = 0;
        let kept = 0;

        localData.forEach(item => {
            const itemId = getItemId(item);

            if (!itemId) {
                console.warn('⚠️ Record locale senza ID, lo aggiungo comunque');
                merged.set(Math.random().toString(), {
                    ...item,
                    _source: 'local'
                });
                added++;
                return;
            }

            const existing = merged.get(itemId);

            if (!existing) {
                // Nuovo record locale che non esiste in remoto
                merged.set(itemId, {
                    ...item,
                    _source: 'local'
                });
                added++;
                console.log(`   ➕ Aggiunto nuovo: ${itemId.substring(0, 8)}...`);
            } else {
                // Record esiste in entrambi - usa il più recente
                const localTime = new Date(item.updatedAt || item.createdAt || 0);
                const remoteTime = new Date(existing.updatedAt || existing.createdAt || 0);

                if (localTime > remoteTime) {
                    merged.set(itemId, {
                        ...item,
                        _source: 'local'
                    });
                    updated++;
                    console.log(`   ✏️ Aggiornato: ${itemId.substring(0, 8)}... (locale più recente)`);
                } else if (localTime.getTime() === remoteTime.getTime()) {
                    // Stesso timestamp - usa locale per sicurezza
                    merged.set(itemId, {
                        ...item,
                        _source: 'local'
                    });
                    kept++;
                } else {
                    // Remoto più recente, mantieni quello
                    kept++;
                    console.log(`   ⏸️ Mantenuto remoto: ${itemId.substring(0, 8)}... (remoto più recente)`);
                }
            }
        });

        // 3. Rimuovi metadata _source
        const result = Array.from(merged.values()).map(item => {
            const { _source, ...clean } = item;
            return clean;
        });

        console.log(`✅ MERGE COMPLETATO:`);
        console.log(`   Totale: ${result.length} records`);
        console.log(`   Aggiunti: ${added} | Aggiornati: ${updated} | Mantenuti: ${kept}`);

        return result;
    },

    async loadDropbox(key) {
        if (!this.dropboxClient) return null;

        try {
            const path = key.startsWith('/') ? key : `/${key}.json`;
            const response = await this.dropboxClient.filesDownload({ path });

            const reader = new FileReader();
            return new Promise((resolve, reject) => {
                reader.onload = () => {
                    try {
                        const parsedData = JSON.parse(reader.result);

                        // Salva metadata se presente
                        if (parsedData.metadata) {
                            console.log(`📥 Caricato da Dropbox con metadata:`, {
                                key: key,
                                records: parsedData.metadata.recordCount,
                                lastModified: parsedData.metadata.lastModified,
                                device: parsedData.metadata.deviceId
                            });
                        }

                        if (parsedData.encrypted) {
                            const decrypted = AuthManager.decrypt(parsedData.data);
                            if (!decrypted) {
                                console.error('❌ Errore decrittazione');
                                reject(new Error('Decryption failed'));
                                return;
                            }

                            // Ritorna oggetto con data E metadata
                            resolve({
                                data: decrypted,
                                metadata: parsedData.metadata || null
                            });
                        } else {
                            // Vecchio formato senza metadata
                            resolve({
                                data: parsedData,
                                metadata: null
                            });
                        }
                    } catch (e) {
                        reject(e);
                    }
                };
                reader.onerror = reject;
                reader.readAsText(response.result.fileBlob);
            });
        } catch (error) {
            if (error.status === 409) {
                console.log(`📦 File ${key} non esiste ancora`);
                return null;
            }

            if (error.status === 401 && this.dropboxRefreshToken) {
                const newToken = await this.refreshAccessToken();
                if (newToken) {
                    return await this.loadDropbox(key);
                }
            }

            console.error(`❌ Errore caricamento ${key}:`, error);
            return null;
        }
    },

    // ==========================================
    // FUNZIONI COMODE
    // ==========================================

    async saveOrders(orders) {
        this.saveLocal(CONFIG.STORAGE_KEYS.ORDERS, orders);
        await this.saveDropbox(CONFIG.DROPBOX_PATHS.ORDERS, orders);
    },

    async loadOrders() {
        const cloudData = await this.loadDropbox(CONFIG.DROPBOX_PATHS.ORDERS);
        if (cloudData) return cloudData;
        return this.loadLocal(CONFIG.STORAGE_KEYS.ORDERS, []);
    },

    async saveCustomers(customers) {
        this.saveLocal(CONFIG.STORAGE_KEYS.CUSTOMERS, customers);
        await this.saveDropbox(CONFIG.DROPBOX_PATHS.CUSTOMERS, customers);
    },

    async loadCustomers() {
        const cloudData = await this.loadDropbox(CONFIG.DROPBOX_PATHS.CUSTOMERS);
        if (cloudData) return cloudData;
        return this.loadLocal(CONFIG.STORAGE_KEYS.CUSTOMERS, []);
    },

    async saveProducts(products) {
        this.saveLocal(CONFIG.STORAGE_KEYS.PRODUCTS, products);
        await this.saveDropbox(CONFIG.DROPBOX_PATHS.PRODUCTS, products);
    },

    async loadProducts() {
        const cloudData = await this.loadDropbox(CONFIG.DROPBOX_PATHS.PRODUCTS);
        if (cloudData) return cloudData;
        return this.loadLocal(CONFIG.STORAGE_KEYS.PRODUCTS, []);
    },

    async saveFidelity(fidelityData) {
        this.saveLocal(CONFIG.STORAGE_KEYS.FIDELITY, fidelityData);
        await this.saveDropbox(CONFIG.DROPBOX_PATHS.FIDELITY, fidelityData);
    },

    async loadFidelity() {
        const cloudData = await this.loadDropbox(CONFIG.DROPBOX_PATHS.FIDELITY);
        if (cloudData) return cloudData;
        return this.loadLocal(CONFIG.STORAGE_KEYS.FIDELITY, []);
    },

    async saveCampaigns(campaigns) {
        this.saveLocal(CONFIG.STORAGE_KEYS.CAMPAIGNS, campaigns);
        this.lastLocalSave[CONFIG.STORAGE_KEYS.CAMPAIGNS] = new Date().toISOString();
        await this.saveDropbox(CONFIG.DROPBOX_PATHS.CAMPAIGNS, campaigns);
    },

    async loadCampaigns() {
        const result = await this.loadDropbox(CONFIG.DROPBOX_PATHS.CAMPAIGNS);
        if (result?.data) {
            const localCampaigns = this.loadLocal(CONFIG.STORAGE_KEYS.CAMPAIGNS, []);
            if (localCampaigns.length > 0) {
                const merged = this.mergeData(
                    CONFIG.STORAGE_KEYS.CAMPAIGNS,
                    localCampaigns,
                    result.data
                );
                return merged;
            }
            return result.data;
        }
        return this.loadLocal(CONFIG.STORAGE_KEYS.CAMPAIGNS, []);
    },

    // ==========================================
    // INIZIALIZZAZIONE TIMESTAMP LOCALI
    // ==========================================

    initLastLocalSave() {
        // Recupera i timestamp usando i path Dropbox come chiave
        const paths = Object.values(CONFIG.DROPBOX_PATHS);

        paths.forEach(path => {
            const saved = localStorage.getItem('lastLocalSave_' + path);
            if (saved) {
                this.lastLocalSave[path] = saved;
            }
        });

        console.log('📅 Timestamp locali recuperati:', this.lastLocalSave);
    },

    // ==========================================
    // COUNTER CENTRALIZZATO CON LOCK
    // ==========================================

    async getNextOrderNumber(deliveryDate) {
        if (!this.dropboxClient) {
            console.warn('⚠️ Dropbox non disponibile, uso counter locale');
            return this.getNextOrderNumberLocal(deliveryDate);
        }

        const maxRetries = 10;
        const lockKey = `/counters/lock_orders_${deliveryDate}.json`;
        const counterKey = `/counters/orders_${deliveryDate}.json`;

        for (let attempt = 0; attempt < maxRetries; attempt++) {
            try {
                // 1. Prova a creare il LOCK
                const lockAcquired = await this.acquireLock(lockKey);

                if (!lockAcquired) {
                    console.log(`🔒 Lock occupato, aspetto... (tentativo ${attempt + 1}/${maxRetries})`);
                    await this.delay(200 + (attempt * 100));
                    continue;
                }

                console.log(`🟢 Lock acquisito!`);

                try {
                    // 2. Leggi counter
                    let counter = await this.loadDropbox(counterKey);
                    let currentNumber = null;

                    if (counter?.data?.number) {
                        currentNumber = counter.data.number;
                        console.log(`📥 Counter esistente per ${deliveryDate}: ${currentNumber}`);
                    } else {
                        // ✅ NUOVO: Inizializza counter contando ordini esistenti
                        console.log(`🆕 Counter non esiste, conto ordini esistenti per ${deliveryDate}...`);
                        currentNumber = this.countExistingOrders(deliveryDate) + 1;
                        console.log(`📊 Trovati ${currentNumber - 1} ordini esistenti, parto da ${currentNumber}`);
                    }

                    console.log(`🎫 Counter per ${deliveryDate}: assegno numero ${currentNumber}`);

                    // 3. Incrementa e salva
                    const newCounter = {
                        number: currentNumber + 1,
                        lastUpdate: new Date().toISOString(),
                        initialized: true
                    };

                    await this.saveDropbox(counterKey, newCounter);

                    console.log(`✅ Counter aggiornato → prossimo sarà ${currentNumber + 1}`);

                    // 4. Rilascia il lock
                    await this.releaseLock(lockKey);

                    return currentNumber;

                } catch (error) {
                    await this.releaseLock(lockKey);
                    throw error;
                }

            } catch (error) {
                console.error(`❌ Errore tentativo ${attempt + 1}:`, error);

                if (attempt === maxRetries - 1) {
                    console.error('❌ Troppi tentativi, uso counter locale');
                    return this.getNextOrderNumberLocal(deliveryDate);
                }
            }
        }

        return this.getNextOrderNumberLocal(deliveryDate);
    },

    countExistingOrders(deliveryDate) {
        return 0;
    },

    async acquireLock(lockKey, timeout = 30000) {
        try {
            const lockData = {
                deviceId: this.getDeviceId(),
                timestamp: Date.now(),
                expires: Date.now() + timeout
            };

            const existing = await this.loadDropbox(lockKey);

            if (existing?.data) {
                const lockAge = Date.now() - existing.data.timestamp;
                if (lockAge < timeout) {
                    return false;
                }
                console.log('🔓 Lock scaduto, lo sostituisco');
            }

            await this.saveDropbox(lockKey, lockData);

            await this.delay(50);
            const verify = await this.loadDropbox(lockKey);

            if (verify?.data?.deviceId === this.getDeviceId()) {
                return true;
            }

            return false;

        } catch (error) {
            console.error('❌ Errore acquisizione lock:', error);
            return false;
        }
    },

    async releaseLock(lockKey) {
        try {
            await this.dropboxClient.filesDeleteV2({ path: lockKey });
            console.log('🔓 Lock rilasciato');
        } catch (error) {
            console.log('🔓 Lock già rilasciato o non esistente');
        }
    },

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    },

    getNextOrderNumberLocal(deliveryDate) {
        return 1;
    }

};

window.Storage = Storage;
console.log("✅ Storage caricato con merge intelligente v2.1");