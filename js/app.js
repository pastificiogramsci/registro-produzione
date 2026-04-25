// ============================================
// 🎯 APP PRINCIPALE — Registro Produzione
// ============================================

const App = {

    currentTab: 'materie',

    async init() {
        console.log("🚀 Avvio Registro Produzione...");
        try {
            this.updateLoaderStatus("Controllo autenticazione...");

            const urlParams = new URLSearchParams(window.location.search);
            if (urlParams.get('code')) await Storage.checkDropboxCallback();

            if (!AuthManager.init()) { this.hideLoader(); return; }
            this.hideAuthScreen();

            this.updateLoaderStatus("Connessione Dropbox...");
            await Storage.initDropbox();

            this.updateLoaderStatus("Caricamento dati...");
            await MateriePrimeModule.init();
            RicetteModule.init();
            ProduzioneModule.init();

            this.hideLoader();
            this.switchTab('materie');
            this.updateDropboxUI();
            console.log("✅ App pronta");
        } catch (err) {
            console.error("Errore init:", err);
            this.hideLoader();
        }
    },

    switchTab(tabName) {
        this.currentTab = tabName;
        document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
        document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
        const content = document.getElementById(`${tabName}-content`);
        if (content) content.classList.remove('hidden');
        const btn = document.querySelector(`[data-tab="${tabName}"]`);
        if (btn) btn.classList.add('active');
        if (tabName === 'settings') this.updateDropboxUI();
    },

    handleLogin(event) {
        event.preventDefault();
        const password = document.getElementById('login-password').value;
        const remember = document.getElementById('remember-me').checked;
        if (AuthManager.login(password, remember)) {
            this.hideAuthScreen();
            this.init();
        } else {
            const errEl = document.getElementById('login-error');
            errEl.textContent = 'Password errata';
            errEl.classList.remove('hidden');
        }
    },

    hideLoader() {
        const el = document.getElementById('app-loader');
        if (el) el.style.display = 'none';
    },
    updateLoaderStatus(msg) {
        const el = document.getElementById('loader-status');
        if (el) el.textContent = msg;
    },
    hideAuthScreen() {
        const el = document.getElementById('auth-screen');
        if (el) el.style.display = 'none';
    },

    updateDropboxUI() {
        const statusEl = document.getElementById('dropbox-status');
        const actionsEl = document.getElementById('dropbox-actions');
        if (!statusEl) return;
        if (Storage.dropboxClient) {
            statusEl.innerHTML = '<p class="text-green-600 font-medium text-sm">✅ Dropbox connesso</p>';
            actionsEl.innerHTML = `
                <div class="flex gap-2 flex-wrap">
                    <button onclick="app.syncWithDropbox()"
                        class="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700">
                        🔄 Sincronizza ora
                    </button>
                    <button onclick="Storage.disconnectDropbox();app.updateDropboxUI();"
                        class="bg-red-500 text-white px-4 py-2 rounded-lg text-sm hover:bg-red-600">
                        Disconnetti
                    </button>
                </div>`;
        } else {
            statusEl.innerHTML = '<p class="text-gray-500 text-sm">📦 Dropbox non connesso</p>';
            actionsEl.innerHTML = `
                <button onclick="Storage.startDropboxAuth()"
                    class="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700">
                    Connetti Dropbox
                </button>`;
        }
    },

    async syncWithDropbox() {
        if (!Storage.dropboxClient) { Utils.showToast("Dropbox non connesso", "warning"); return; }
        Utils.showToast("🔄 Sincronizzazione...", "info");
        await Storage.syncAllToDropbox();
        Utils.showToast("✅ Sincronizzazione completata", "success");
    },

    exportData() {
        const data = {
            version: '1.0',
            exportDate: new Date().toISOString(),
            materiePrime: Storage.loadLocal(CONFIG.STORAGE_KEYS.MATERIE_PRIME, []),
            carichi: Storage.loadLocal(CONFIG.STORAGE_KEYS.CARICHI, []),
            ricette: Storage.loadLocal(CONFIG.STORAGE_KEYS.RICETTE, []),
            semilavorati: Storage.loadLocal(CONFIG.STORAGE_KEYS.SEMILAVORATI, []),
            produzione: Storage.loadLocal(CONFIG.STORAGE_KEYS.PRODUZIONE, [])
        };
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `registro_gramsci_${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
        Utils.showToast("✅ Dati esportati", "success");
    },

    importData() {
        const input = document.getElementById('import-file-input');
        input.click();
        input.onchange = (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (ev) => {
                try {
                    const data = JSON.parse(ev.target.result);
                    if (data.materiePrime) Storage.saveLocal(CONFIG.STORAGE_KEYS.MATERIE_PRIME, data.materiePrime);
                    if (data.carichi) Storage.saveLocal(CONFIG.STORAGE_KEYS.CARICHI, data.carichi);
                    if (data.ricette) Storage.saveLocal(CONFIG.STORAGE_KEYS.RICETTE, data.ricette);
                    if (data.semilavorati) Storage.saveLocal(CONFIG.STORAGE_KEYS.SEMILAVORATI, data.semilavorati);
                    if (data.produzione) Storage.saveLocal(CONFIG.STORAGE_KEYS.PRODUZIONE, data.produzione);
                    Utils.showToast("✅ Dati importati — ricarica la pagina", "success");
                } catch { Utils.showToast("❌ File non valido", "error"); }
            };
            reader.readAsText(file);
        };
    },

    changePassword() {
        const newPwd = prompt("Nuova password (minimo 4 caratteri):");
        if (!newPwd || newPwd.length < 4) { alert("Password troppo corta"); return; }
        AuthManager.changePassword(newPwd);
        Utils.showToast("✅ Password aggiornata", "success");
    },

    resetAllData() {
        if (!confirm("⚠️ Cancellare TUTTI i dati? Azione IRREVERSIBILE.")) return;
        if (!confirm("Sei assolutamente sicuro?")) return;
        Object.values(CONFIG.STORAGE_KEYS).forEach(k => localStorage.removeItem(k));
        Utils.showToast("✅ Dati eliminati", "success");
        setTimeout(() => location.reload(), 1500);
    }
};

const app = App;
document.addEventListener('DOMContentLoaded', () => app.init());
