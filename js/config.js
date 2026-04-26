// ============================================
// 🔧 CONFIGURAZIONI — Registro Produzione
// ============================================

const CONFIG = {

    // Dropbox
    DROPBOX_APP_KEY: "7bf3akruqbuttif",

    getDropboxConfig() {
        return {
            clientId: this.DROPBOX_APP_KEY,
            clientSecret: atob('NXpsdzJ3dXFzeGQ1ZGdl'),
            redirectUri: this.getRedirectUri()
        };
    },

    getRedirectUri() {
        const hostname = window.location.hostname;
        if (hostname === "127.0.0.1" || hostname === "localhost") {
            return "http://127.0.0.1:5500/";
        } else {
            return "https://pastificiogramsci.github.io/registro-produzione/";
        }
    },

    // Percorsi Dropbox
    DROPBOX_PATHS: {
        MATERIE_PRIME: "/registro/materie_prime.json",
        CARICHI: "/registro/carichi.json",
        RICETTE: "/registro/ricette.json",
        SEMILAVORATI: "/registro/semilavorati.json",
        PRODUZIONE: "/registro/produzione.json"
    },

    // Chiavi localStorage
    STORAGE_KEYS: {
        MATERIE_PRIME: "reg_materie_prime",
        CARICHI: "reg_carichi",
        RICETTE: "reg_ricette",
        SEMILAVORATI: "reg_semilavorati",
        PRODUZIONE: "reg_produzione",
        DROPBOX_TOKEN: "dropboxAccessToken"
    }
};

window.CONFIG = CONFIG;
console.log("✅ Config Registro Produzione caricato");
