// ============================================
// 🍝 GESTIONE PRODOTTI
// ============================================

const ProductsModule = {

    products: [],

    // ==========================================
    // INIZIALIZZAZIONE
    // ==========================================

    async init() {
        await this.loadProducts();
        console.log("✅ Modulo Prodotti inizializzato");
    },

    // ==========================================
    // CARICAMENTO DATI
    // ==========================================

    async loadProducts() {
        this.products = await Storage.loadProducts();
        console.log(`📋 Caricati ${this.products.length} prodotti`);
    },

    async saveProducts() {
        await Storage.saveProducts(this.products);
        console.log("💾 Prodotti salvati");
    },

    // ==========================================
    // OPERAZIONI CRUD
    // ==========================================

    // Aggiungi nuovo prodotto
    // Aggiungi nuovo prodotto
    addProduct(productData) {
        // ✅ CONTROLLO DUPLICATI
        const nameClean = productData.name.toLowerCase().trim();
        const existing = this.products.find(p =>
            p.name.toLowerCase().trim() === nameClean
        );

        if (existing) {
            const message = `⚠️ Prodotto già esistente!\n\n` +
                `Nome: ${existing.name}\n` +
                `Prezzo: €${existing.price}/kg\n` +
                `Categoria: ${existing.category}\n` +
                `Stato: ${existing.active ? 'Attivo' : 'Disattivato'}\n\n` +
                `Vuoi comunque creare un duplicato?`;

            if (!confirm(message)) {
                Utils.showToast("❌ Creazione prodotto annullata", "warning");
                return null;
            }
        }

        const product = {
            id: Utils.generateId(),
            name: productData.name,
            price: parseFloat(productData.price) || 0,
            category: productData.category || 'Altro',
            description: productData.description || '',
            unit: productData.unit || 'kg',
            averageWeight: productData.averageWeight || null,
            mode: productData.mode || 'pieces',
            ingredients: productData.ingredients || '',
            allergens: productData.allergens || [],
            active: true,
            createdAt: new Date().toISOString()
        };

        this.products.push(product);
        this.saveProducts();

        Utils.showToast(`✅ Prodotto "${product.name}" aggiunto!`, "success");
        return product;
    },

    // ✅ TROVA DUPLICATI ESISTENTI NEL DATABASE
    findExistingDuplicates() {
        const duplicates = [];
        const seen = new Map();

        this.products.forEach(product => {
            const nameClean = product.name.toLowerCase().trim();

            if (seen.has(nameClean)) {
                // Questo è un duplicato
                const existing = seen.get(nameClean);

                // Trova se questo gruppo di duplicati esiste già
                let group = duplicates.find(d =>
                    d.products.some(p => p.id === existing.id)
                );

                if (!group) {
                    // Crea nuovo gruppo
                    group = {
                        name: nameClean,
                        products: [existing]
                    };
                    duplicates.push(group);
                }

                // Aggiungi questo prodotto al gruppo
                group.products.push(product);
            } else {
                seen.set(nameClean, product);
            }
        });

        return duplicates;
    },

    // ✅ UNISCI DUE PRODOTTI DUPLICATI
    mergeDuplicateProducts(keepId, removeId) {
        const keep = this.getProductById(keepId);
        const remove = this.getProductById(removeId);

        if (!keep || !remove) {
            Utils.showToast("❌ Prodotti non trovati", "error");
            return false;
        }

        // Trova tutti gli ordini che usano il prodotto da rimuovere
        const orders = OrdersModule.getAllOrders();
        let ordersUpdated = 0;

        orders.forEach(order => {
            order.items.forEach(item => {
                if (item.productId === removeId) {
                    item.productId = keepId;
                    item.price = keep.price; // Aggiorna anche il prezzo
                    ordersUpdated++;
                }
            });
        });

        // Salva ordini aggiornati
        if (ordersUpdated > 0) {
            OrdersModule.saveOrders();
            console.log(`✅ Aggiornati ${ordersUpdated} item in ordini`);
        }

        // Elimina il prodotto duplicato
        const index = this.products.findIndex(p => p.id === removeId);
        if (index !== -1) {
            this.products.splice(index, 1);
            this.saveProducts();

            Utils.showToast(
                `✅ Prodotti uniti!\n${ordersUpdated} ordini aggiornati`,
                "success"
            );
            return true;
        }

        return false;
    },

    // ✅ RINOMINA PRODOTTO
    renameProduct(productId, newName) {
        const product = this.getProductById(productId);
        if (!product) return false;

        product.name = newName;
        this.saveProducts();

        Utils.showToast(`✅ Prodotto rinominato in "${newName}"`, "success");
        return true;
    },

    // Aggiorna prodotto esistente
    updateProduct(productId, updates) {
        const product = this.getProductById(productId);
        if (!product) return null;

        product.name = updates.name || product.name;
        product.price = parseFloat(updates.price) || product.price;
        product.category = updates.category || product.category;
        product.description = updates.description !== undefined ? updates.description : product.description;
        product.unit = updates.unit || product.unit;
        product.averageWeight = updates.averageWeight !== undefined ? updates.averageWeight : product.averageWeight;
        product.mode = updates.mode || product.mode; // ← AGGIUNGI
        product.ingredients = updates.ingredients !== undefined ? updates.ingredients : product.ingredients;
        product.allergens = updates.allergens !== undefined ? updates.allergens : product.allergens;

        this.saveProducts();
        Utils.showToast("✅ Prodotto aggiornato!", "success");
        return product;
    },

    // Elimina prodotto
    deleteProduct(productId) {
        const index = this.products.findIndex(p => p.id === productId);

        if (index === -1) {
            Utils.showToast("Prodotto non trovato", "error");
            return false;
        }

        const product = this.products[index];

        if (confirm(`Eliminare il prodotto "${product.name}"?`)) {
            this.products.splice(index, 1);
            this.saveProducts();
            Utils.showToast("✅ Prodotto eliminato", "success");
            return true;
        }

        return false;
    },

    // Attiva/Disattiva prodotto
    toggleProductActive(productId) {
        const product = this.getProductById(productId);

        if (product) {
            product.active = !product.active;
            this.saveProducts();

            const status = product.active ? "attivato" : "disattivato";
            Utils.showToast(`✅ Prodotto ${status}`, "success");
            return product;
        }

        return null;
    },

    // ==========================================
    // RICERCA E FILTRI
    // ==========================================

    // Trova prodotto per ID
    getProductById(productId) {
        return this.products.find(p => p.id === productId);
    },

    // Cerca prodotti per nome
    searchProducts(query) {
        if (!query) return this.getActiveProducts();

        const lowerQuery = query.toLowerCase();

        return this.products.filter(p =>
            p.name.toLowerCase().includes(lowerQuery) ||
            p.category.toLowerCase().includes(lowerQuery)
        );
    },

    // Ottieni solo prodotti attivi
    getActiveProducts() {
        return this.products.filter(p => p.active);
    },

    // Ottieni prodotti per categoria
    getProductsByCategory(category) {
        return this.products.filter(p =>
            p.category === category && p.active
        );
    },

    // Ottieni tutte le categorie
    getCategories() {
        const categories = [...new Set(this.products.map(p => p.category))];
        return categories.sort();
    },

    // Ottieni tutti i prodotti ordinati
    getAllProducts(sortBy = 'name') {
        const sorted = [...this.products];

        switch (sortBy) {
            case 'name':
                sorted.sort((a, b) => a.name.localeCompare(b.name));
                break;
            case 'price':
                sorted.sort((a, b) => a.price - b.price);
                break;
            case 'category':
                sorted.sort((a, b) => a.category.localeCompare(b.category));
                break;
            case 'recent':
                sorted.sort((a, b) =>
                    new Date(b.createdAt) - new Date(a.createdAt)
                );
                break;
        }

        return sorted;
    },

    // ==========================================
    // VALIDAZIONE
    // ==========================================

    validateProduct(productData) {
        const errors = [];

        if (!productData.name || productData.name.trim() === '') {
            errors.push("Nome prodotto obbligatorio");
        }

        if (productData.price === undefined || productData.price === null) {
            errors.push("Prezzo obbligatorio");
        } else if (parseFloat(productData.price) < 0) {
            errors.push("Prezzo non può essere negativo");
        }

        if (!productData.category || productData.category.trim() === '') {
            errors.push("Categoria obbligatoria");
        }

        return {
            isValid: errors.length === 0,
            errors: errors
        };
    },

    // ==========================================
    // UTILITY
    // ==========================================

    // Conta prodotti totali
    getProductsCount() {
        return this.products.length;
    },

    // Conta prodotti attivi
    getActiveProductsCount() {
        return this.products.filter(p => p.active).length;
    },

    // Calcola prezzo medio
    getAveragePrice() {
        if (this.products.length === 0) return 0;

        const total = this.products.reduce((sum, p) => sum + p.price, 0);
        return total / this.products.length;
    },

    // Formatta prodotto per visualizzazione
    formatProductDisplay(productId) {
        const product = this.getProductById(productId);
        if (!product) return 'Prodotto sconosciuto';

        return `${product.name} - ${Utils.formatPrice(product.price)}`;
    }
};

// Rendi il modulo disponibile globalmente
window.ProductsModule = ProductsModule;

console.log("✅ Modulo Prodotti caricato");