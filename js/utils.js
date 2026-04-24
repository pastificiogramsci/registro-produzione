// ============================================
// 🛠️ FUNZIONI UTILITY
// ============================================
// Funzioni di supporto riutilizzabili in tutta l'app

const Utils = {

    // Genera un ID univoco
    generateId() {
        return 'id_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    },

    // Formatta una data in italiano
    formatDate(date) {
        if (!date) return '';
        const d = new Date(date);
        return d.toLocaleDateString('it-IT', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        });
    },

    // Formatta una data con ora
    formatDateTime(date) {
        if (!date) return '';
        const d = new Date(date);
        return d.toLocaleString('it-IT', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    },

    // Formatta un prezzo in euro
    formatPrice(price) {
        if (price === null || price === undefined) return '€0,00';
        return '€' + parseFloat(price).toFixed(2).replace('.', ',');
    },

    // Mostra un toast (notifica)
    showToast(message, type = 'success') {
        const colors = {
            success: 'bg-green-600',
            warning: 'bg-yellow-600',
            error: 'bg-red-600',
            info: 'bg-blue-600'
        };

        const toast = document.createElement('div');
        toast.className = `toast-el fixed bottom-4 right-4 ${colors[type]} text-white px-6 py-3 rounded-lg shadow-lg z-50 transform transition-all`;
        toast.textContent = message;
        toast.style.opacity = '0';

        document.body.appendChild(toast);

        // Animazione entrata
        setTimeout(() => {
            toast.style.opacity = '1';
        }, 10);

        // Rimozione dopo 3 secondi
        setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    },

    // Valida email
    isValidEmail(email) {
        const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return regex.test(email);
    },

    // Valida telefono italiano
    isValidPhone(phone) {
        const cleaned = phone.replace(/\s/g, '');
        return cleaned.length >= 9 && cleaned.length <= 13;
    },

    // Sanitizza input (rimuove caratteri pericolosi)
    sanitize(text) {
        if (!text) return '';
        return text.toString()
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    },

    // Genera un codice casuale (es. per coupon)
    generateCode(length = 8) {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let code = '';
        for (let i = 0; i < length; i++) {
            code += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return code;
    },

    // Calcola la differenza tra due date in giorni
    daysDifference(date1, date2) {
        const d1 = new Date(date1);
        const d2 = new Date(date2);
        const diffTime = Math.abs(d2 - d1);
        return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    },

    // Formatta data con giorno della settimana in italiano
    formatDateWithDay(dateString) {
        if (!dateString) return 'Senza data';

        const date = new Date(dateString + 'T00:00:00');
        const days = ['Domenica', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato'];
        const months = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
            'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'];

        const dayName = days[date.getDay()];
        const day = date.getDate();
        const month = months[date.getMonth()];
        const year = date.getFullYear();

        return `${dayName} ${day} ${month} ${year}`;
    },

    // Formatta quantità prodotto (gestisce pezzi e kg)
    formatProductQuantity(quantity, product, item) {
        if (!product) return `${quantity} kg`;

        // Se prodotto venduto a peso con peso medio disponibile
        if (item?.mode === 'weight' && product.averageWeight && product.averageWeight > 0) {
            const pieces = Math.round(quantity / product.averageWeight);
            return `${pieces} ${pieces === 1 ? 'pezzo' : 'pezzi'} (${quantity.toFixed(2)} kg)`;
        }

        // Se prodotto venduto a pezzi
        if (item?.mode === 'pieces') {
            const pieces = Math.round(quantity);
            return `${pieces} ${pieces === 1 ? 'pezzo' : 'pezzi'}`;
        }

        // Default: kg con 2 decimali
        return `${quantity.toFixed(2)} ${product.unit || 'kg'}`;
    },
};

// Rendi Utils disponibile globalmente
window.Utils = Utils;

console.log("✅ Utils caricato");