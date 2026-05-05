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
            // Ricarica i moduli solo se nessun modal è aperto
            const modalAperto = document.querySelector('.modal-overlay:not(.hidden), [id$="-modal"]:not(.hidden)');
            if (!modalAperto) {
                if (typeof MateriePrimeModule !== 'undefined') MateriePrimeModule.init();
                if (typeof RicetteModule !== 'undefined') RicetteModule.init();
                if (typeof ProduzioneModule !== 'undefined') ProduzioneModule.init();
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

                    if (remoteTime > localSaveTime) {
                        console.warn(`🔀 CONFLITTO RILEVATO su ${key}!`);
                        console.log('   Dati remoti più recenti, eseguo merge...');
                        dataToSave = this.mergeData(key, data, existingData.data);
                        Utils.showToast(`🔀 Dati sincronizzati con altro dispositivo`, 'info');
                    } else {
                        console.log('✅ Nessun conflitto, dati locali sono più recenti');
                    }
                }
            } catch (loadError) {
                if (loadError.status !== 409) {
                    console.log('ℹ️ Impossibile controllare conflitti, salvo comunque');
                }
            }

            if (dataToSave !== data) {
                const storageKey = Object.entries(CONFIG.DROPBOX_PATHS)
                    .find(([, v]) => v === key)?.[0];
                if (storageKey) {
                    this.saveLocal(CONFIG.STORAGE_KEYS[storageKey], dataToSave);
                }
            }

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

            const content = JSON.stringify(payload);
            const path = key.startsWith('/') ? key : `/${key}.json`;

            await this.dropboxClient.filesUpload({
                path: path,
                contents: content,
                mode: 'overwrite',
                autorename: false
            });

            this.lastLocalSave[key] = new Date().toISOString();
            localStorage.setItem('lastLocalSave_' + key, this.lastLocalSave[key]);

            console.log(`✅ Salvato su Dropbox: ${key} (${metadata.recordCount} records)`);

        } catch (error) {
            console.error(`❌ Errore salvataggio Dropbox ${key}:`, error);
            if (error.status === 401 && this.dropboxRefreshToken) {
                const newToken = await this.refreshAccessToken();
                if (newToken) {
                    return await this.saveDropbox(key, data);
                }
            }
        }
    },

    mergeData(key, localData, remoteData) {
        if (!Array.isArray(localData) || !Array.isArray(remoteData)) {
            console.log('⚠️ Dati non sono array, uso versione locale');
            return localData;
        }

        console.log(`🔀 MERGE ${key}:`);
        console.log(`   Locale: ${localData.length} records`);
        console.log(`   Remoto: ${remoteData.length} records`);

        const getItemId = (item) => item.id || item.customerId || null;

        const merged = new Map();

        if (localData.length === 0 && remoteData.length > 0) {
            console.log('⚡ Locale vuoto, uso direttamente dati remoti');
            return remoteData;
        }

        remoteData.forEach(item => {
            const itemId = getItemId(item);
            if (itemId) {
                merged.set(itemId, { ...item, _source: 'remote' });
            }
        });

        let added = 0, updated = 0, kept = 0;

        localData.forEach(item => {
            const itemId = getItemId(item);

            if (!itemId) {
                merged.set(Math.random().toString(), { ...item, _source: 'local' });
                added++;
                return;
            }

            const existing = merged.get(itemId);

            if (!existing) {
                merged.set(itemId, { ...item, _source: 'local' });
                added++;
                console.log(`   ➕ Aggiunto nuovo: ${itemId.substring(0, 8)}...`);
            } else {
                const localTime = new Date(item.updatedAt || item.createdAt || 0);
                const remoteTime = new Date(existing.updatedAt || existing.createdAt || 0);

                if (localTime >= remoteTime) {
                    merged.set(itemId, { ...item, _source: 'local' });
                    localTime > remoteTime ? updated++ : kept++;
                } else {
                    kept++;
                    console.log(`   ⏸️ Mantenuto remoto: ${itemId.substring(0, 8)}...`);
                }
            }
        });

        const result = Array.from(merged.values()).map(({ _source, ...clean }) => clean);

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
                            resolve({ data: decrypted, metadata: parsedData.metadata || null });
                        } else {
                            resolve({ data: parsedData, metadata: null });
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
                if (newToken) return await this.loadDropbox(key);
            }
            console.error(`❌ Errore caricamento ${key}:`, error);
            return null;
        }
    },

    // ==========================================
    // INIZIALIZZAZIONE TIMESTAMP LOCALI
    // ==========================================

    initLastLocalSave() {
        const paths = Object.values(CONFIG.DROPBOX_PATHS);
        paths.forEach(path => {
            const saved = localStorage.getItem('lastLocalSave_' + path);
            if (saved) {
                this.lastLocalSave[path] = saved;
            }
        });
        console.log('📅 Timestamp locali recuperati:', this.lastLocalSave);
    },

};

window.Storage = Storage;
console.log("✅ Storage caricato");