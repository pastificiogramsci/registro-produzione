// ============================================
// 📒 RICETTARIO
// ============================================

const RicetteModule = {

    ricette: [],

    // ==========================================
    // INIT
    // ==========================================

    init() {
        this.ricette = Storage.loadLocal(CONFIG.STORAGE_KEYS.RICETTE, []);
        console.log(`✅ Ricette: ${this.ricette.length} ricette`);
        this.render();
    },

    save() {
        Storage.saveLocal(CONFIG.STORAGE_KEYS.RICETTE, this.ricette);
        const now = new Date().toISOString();
        Storage.lastLocalSave[CONFIG.DROPBOX_PATHS.RICETTE] = now;
        localStorage.setItem('lastLocalSave_' + CONFIG.DROPBOX_PATHS.RICETTE, now);
        Storage.saveDropbox(CONFIG.DROPBOX_PATHS.RICETTE, this.ricette);
    },

    newId() {
        return 'ric_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
    },

    // ==========================================
    // CRUD RICETTE
    // ==========================================

    addRicetta(dati) {
        const ricetta = {
            id: this.newId(),
            nome: dati.nome.trim(),
            categoria: dati.categoria || 'Pasta',
            semilavorato: dati.semilavorato || false,
            vendibile: dati.vendibile || false,
            note: dati.note?.trim() || '',
            ingredienti: [],
            shelfLife: dati.shelfLife ? parseInt(dati.shelfLife) : null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        this.ricette.push(ricetta);
        this.save();
        return ricetta;
    },

    updateRicetta(id, dati) {
        const r = this.getRicetta(id);
        if (!r) return null;
        r.nome = dati.nome?.trim() || r.nome;
        r.categoria = dati.categoria || r.categoria;
        r.semilavorato = dati.semilavorato ?? r.semilavorato;
        r.vendibile = dati.vendibile ?? r.vendibile;
        r.note = dati.note?.trim() ?? r.note;
        r.shelfLife = dati.shelfLife ? parseInt(dati.shelfLife) : null;
        r.resa = dati.resa || r.resa;
        r.resaUnita = dati.resaUnita || r.resaUnita;
        r.updatedAt = new Date().toISOString();
        this.save();
        return r;
    },

    deleteRicetta(id) {
        if (!confirm('Eliminare questa ricetta?')) return false;
        this.ricette = this.ricette.filter(r => r.id !== id);
        this.save();
        this.render();
        return true;
    },

    getRicetta(id) {
        return this.ricette.find(r => r.id === id);
    },

    getAllRicette() {
        return [...this.ricette].sort((a, b) => a.nome.localeCompare(b.nome));
    },

    getRicetteSemilavorati() {
        return this.ricette.filter(r =>
            r.semilavorato ||
            r.categoria === 'Sfoglia' ||
            r.categoria === 'Semilavorato base' ||
            r.categoria === 'Semilavorato composto'
        );
    },

    getRicetteProdotti() {
        const categorieSML = ['Sfoglia', 'Semilavorato base', 'Semilavorato composto'];
        return this.ricette.filter(r =>
            !r.semilavorato && !categorieSML.includes(r.categoria) ||
            r.vendibile
        );
    },

    // ==========================================
    // INGREDIENTI
    // ==========================================

    addIngrediente(ricettaId, dati) {
        const r = this.getRicetta(ricettaId);
        if (!r) return null;
        const ing = {
            id: 'ing_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
            tipo: dati.tipo,      // 'mp' o 'sml'
            refId: dati.refId,
            refNome: dati.refNome,
            quantita: parseFloat(dati.quantita) || 0,
            unita: dati.unita || 'kg',
            note: dati.note?.trim() || ''
        };
        r.ingredienti.push(ing);
        this.save();
        return ing;
    },

    updateIngrediente(ricettaId, ingId, dati) {
        const r = this.getRicetta(ricettaId);
        if (!r) return null;
        const ing = r.ingredienti.find(i => i.id === ingId);
        if (!ing) return null;
        ing.quantita = parseFloat(dati.quantita) ?? ing.quantita;
        ing.unita = dati.unita || ing.unita;
        ing.note = dati.note?.trim() ?? ing.note;
        this.save();
        return ing;
    },

    deleteIngrediente(ricettaId, ingId) {
        const r = this.getRicetta(ricettaId);
        if (!r) return;
        r.ingredienti = r.ingredienti.filter(i => i.id !== ingId);
        this.save();
        this.renderDettaglioIngredienti(ricettaId);
    },

    // ==========================================
    // RENDER LISTA RICETTE
    // ==========================================

    render() {
        this.renderListaRicette();
    },

    renderListaRicette(filtroSearch = '') {
        const container = document.getElementById('ricette-list');
        if (!container) return;

        const search = filtroSearch ||
            document.getElementById('ric-search')?.value?.toLowerCase() || '';
        const filtrocat = document.getElementById('ric-filtro-cat')?.value || 'tutti';

        let ricette = this.getAllRicette();

        if (search) {
            ricette = ricette.filter(r =>
                r.nome.toLowerCase().includes(search) ||
                r.categoria.toLowerCase().includes(search)
            );
        }

        if (filtrocat !== 'tutti') {
            ricette = ricette.filter(r => r.categoria === filtrocat);
        }

        if (ricette.length === 0) {
            container.innerHTML = `
                <div class="text-center py-12 text-gray-400">
                    <div class="text-5xl mb-3">📒</div>
                    <p class="text-lg">Nessuna ricetta trovata.</p>
                </div>`;
            return;
        }

        const categorie = ['Pasta fresca ripiena', 'Gastronomia', 'Sfoglia', 'Semilavorato base', 'Semilavorato composto'];

        let html = '';
        categorie.forEach(cat => {
            const gruppo = ricette.filter(r => r.categoria === cat);
            if (gruppo.length === 0) return;
            const sezId = `ric-sez-${cat.replace(/\s+/g, '-').toLowerCase()}`;
            html += `
            <div class="mb-2 mt-4">
                <button onclick="RicetteModule.toggleSezione('${sezId}')"
                    class="w-full flex items-center justify-between px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors">
                    <span class="flex items-center gap-2">
                        <span class="text-xs font-bold text-gray-500 uppercase tracking-wider">${cat}</span>
                        <span class="bg-gray-300 text-gray-600 rounded-full px-2 py-0.5 text-xs font-medium">
                            ${gruppo.length}
                        </span>
                    </span>
                    <span id="${sezId}-icon" class="text-gray-400 text-sm">▼</span>
                </button>
                <div id="${sezId}" class="mt-1 card-grid">
                    ${gruppo.map(r => this.renderCardRicetta(r)).join('')}
                </div>
            </div>`;
        });

        container.innerHTML = html;
    },

    toggleSezione(id) {
        const el = document.getElementById(id);
        const icon = document.getElementById(`${id}-icon`);
        if (!el) return;
        const isOpen = el.style.display !== 'none';
        el.style.display = isOpen ? 'none' : 'block';
        icon.textContent = isOpen ? '▶' : '▼';
    },

    renderCardRicetta(r) {
        const badges = [];

        const nIng = r.ingredienti.length;
        const mpCount = r.ingredienti.filter(i => i.tipo === 'mp').length;
        const smlCount = r.ingredienti.filter(i => i.tipo === 'sml').length;

        return `
        <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-2 md:mb-0">
            <div class="flex items-start justify-between gap-3">
                <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-2 flex-wrap">
                        <h4 class="font-bold text-gray-800 text-base">${r.nome}</h4>
                        ${badges.join('')}
                    </div>
                    <div class="text-sm text-gray-400 mt-1">
                        ${nIng === 0
                ? '<span class="text-orange-400">⚠️ Nessun ingrediente</span>'
                : `${nIng} ingredient${nIng === 1 ? 'e' : 'i'}
                               ${mpCount ? `· ${mpCount} MP` : ''}
                               ${smlCount ? `· ${smlCount} SML` : ''}`}
                    </div>
                    ${r.shelfLife ? `<div class="text-xs text-blue-500 mt-1">⏱ Shelf life: ${r.shelfLife} giorni</div>` : ''}
                    ${r.note ? `<div class="text-xs text-gray-400 mt-1 italic">${r.note}</div>` : ''}
                </div>
                <div class="flex flex-col gap-1.5 flex-shrink-0">
                    <button onclick="RicetteModule.openModalIngredienti('${r.id}')"
                        class="bg-amber-700 text-white text-sm px-3 py-1.5 rounded-lg hover:bg-amber-800 font-medium">
                        🥚 Ingredienti
                    </button>
                    <button onclick="RicetteModule.openModalEditRicetta('${r.id}')"
                        class="bg-gray-100 text-gray-700 text-sm px-3 py-1.5 rounded-lg hover:bg-gray-200 font-medium">
                        ✏️ Modifica
                    </button>
                    <button onclick="RicetteModule.deleteRicetta('${r.id}')"
                        class="bg-red-50 text-red-500 text-sm px-3 py-1.5 rounded-lg hover:bg-red-100 font-medium">
                        🗑
                    </button>
                </div>
            </div>
        </div>`;
    },

    // ==========================================
    // RENDER INGREDIENTI (dentro modal)
    // ==========================================

    renderDettaglioIngredienti(ricettaId) {
        const r = this.getRicetta(ricettaId);
        if (!r) return;
        const el = document.getElementById('ing-modal-list');
        if (!el) return;

        if (r.ingredienti.length === 0) {
            el.innerHTML = '<p class="text-gray-400 text-sm text-center py-4">Nessun ingrediente. Aggiungine uno.</p>';
            return;
        }

        el.innerHTML = r.ingredienti.map(ing => `
            <div class="flex items-center gap-2 p-2 bg-gray-50 rounded-lg mb-2">
                <span class="text-xs font-bold px-1.5 py-0.5 rounded ${ing.tipo === 'mp' ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'}">
                    ${ing.tipo.toUpperCase()}
                </span>
                <span class="flex-1 text-sm font-medium text-gray-800">${ing.refNome}</span>
                <span class="text-sm text-gray-500">${ing.quantita > 0 ? ing.quantita + ' ' + ing.unita : '—'}</span>
                <button onclick="RicetteModule.deleteIngrediente('${ricettaId}','${ing.id}')"
                    class="text-red-400 hover:text-red-600 text-lg leading-none ml-1">×</button>
            </div>`).join('');
    },

    // ==========================================
    // MODAL: NUOVA / MODIFICA RICETTA
    // ==========================================

    openModalNewRicetta() {
        document.getElementById('ric-modal-title').textContent = '+ Nuova Ricetta';
        document.getElementById('ric-form-id').value = '';
        document.getElementById('ric-form-nome').value = '';
        document.getElementById('ric-form-categoria').value = 'Pasta';
        document.getElementById('ric-form-sml').checked = false;
        document.getElementById('ric-form-vendibile').checked = false;
        document.getElementById('ric-form-note').value = '';
        document.getElementById('ric-form-shelf').value = '';
        document.getElementById('ric-form-resa').value = '';
        document.getElementById('ric-form-resa-unita').value = 'kg';
        document.getElementById('ric-form-vendibile-row').classList.add('hidden');
        document.getElementById('ric-modal').classList.remove('hidden');
        document.getElementById('ric-form-nome').focus();
    },

    openModalEditRicetta(id) {
        const r = this.getRicetta(id);
        if (!r) return;
        document.getElementById('ric-modal-title').textContent = '✏️ Modifica Ricetta';
        document.getElementById('ric-form-id').value = r.id;
        document.getElementById('ric-form-nome').value = r.nome;
        document.getElementById('ric-form-categoria').value = r.categoria;
        document.getElementById('ric-form-note').value = r.note;
        document.getElementById('ric-form-shelf').value = r.shelfLife || '';
        document.getElementById('ric-form-resa').value = r.resa || '';
        document.getElementById('ric-form-resa-unita').value = r.resaUnita || 'kg';
        document.getElementById('ric-modal').classList.remove('hidden');
    },

    closeModalRicetta() {
        document.getElementById('ric-modal').classList.add('hidden');
    },

    onCategoriaChange() {
        // nessuna azione necessaria — il tipo è determinato dalla categoria
    },

    saveModalRicetta() {
        const id = document.getElementById('ric-form-id').value;
        const nome = document.getElementById('ric-form-nome').value.trim();
        const categoria = document.getElementById('ric-form-categoria').value;
        const note = document.getElementById('ric-form-note').value.trim();
        const shelfLife = document.getElementById('ric-form-shelf').value;
        const resa = parseFloat(document.getElementById('ric-form-resa').value) || 0;
        const resaUnita = document.getElementById('ric-form-resa-unita').value;

        if (!nome) { Utils.showToast('⚠️ Il nome è obbligatorio', 'warning'); return; }

        if (id) {
            this.updateRicetta(id, { nome, categoria, note, shelfLife, resa, resaUnita });
            Utils.showToast('✅ Ricetta aggiornata', 'success');
        } else {
            this.addRicetta({ nome, categoria, note, shelfLife, resa, resaUnita });
            Utils.showToast(`✅ "${nome}" aggiunta`, 'success');
        }

        this.closeModalRicetta();
        this.render();
    },

    // ==========================================
    // MODAL: INGREDIENTI
    // ==========================================

    openModalIngredienti(ricettaId) {
        const r = this.getRicetta(ricettaId);
        if (!r) return;
        document.getElementById('ing-modal-titolo').textContent = r.nome;
        document.getElementById('ing-modal-ricettaId').value = ricettaId;
        // Reset form aggiunta
        document.getElementById('ing-form-tipo').value = 'mp';
        document.getElementById('ing-form-quantita').value = '';
        document.getElementById('ing-form-unita').value = 'kg';
        document.getElementById('ing-form-note').value = '';
        this.renderDettaglioIngredienti(ricettaId);
        document.getElementById('ing-modal').classList.remove('hidden');
    },

    closeModalIngredienti() {
        document.getElementById('ing-modal').classList.add('hidden');
        this.render();
    },

    // Popola il select ingrediente in base al tipo scelto
    cercaIngrediente(query) {
        const results = document.getElementById('ing-search-results');
        if (!query || query.length < 2) {
            results.innerHTML = '';
            results.classList.add('hidden');
            return;
        }

        const q = query.toLowerCase();
        const mps = MateriePrimeModule.getAllMP().filter(m => m.nome.toLowerCase().includes(q));
        const ricette = this.getAllRicette().filter(r => r.nome.toLowerCase().includes(q));

        let html = '';

        if (mps.length > 0) {
            html += `<div class="text-xs font-bold text-gray-400 uppercase px-3 pt-2 pb-1">📦 Materie Prime</div>`;
            mps.forEach(mp => {
                html += `<div class="px-3 py-2 hover:bg-amber-50 cursor-pointer text-sm border-b border-gray-100 last:border-0"
                    onclick="RicetteModule.selezionaIngrediente('mp', '${mp.id}', ${JSON.stringify(mp.nome)})">
                    ${mp.nome}
                </div>`;
            });
        }

        if (ricette.length > 0) {
            html += `<div class="text-xs font-bold text-gray-400 uppercase px-3 pt-2 pb-1">🥩 Ricette</div>`;
            ricette.forEach(r => {
                html += `<div class="px-3 py-2 hover:bg-amber-50 cursor-pointer text-sm border-b border-gray-100 last:border-0"
                    onclick="RicetteModule.selezionaIngrediente('sml', '${r.id}', ${JSON.stringify(r.nome)})">
                    ${r.nome} <span class="text-xs text-gray-400">(${r.categoria})</span>
                </div>`;
            });
        }

        if (!html) {
            html = `<div class="px-3 py-3 text-sm text-gray-400">Nessun risultato per "${query}"</div>`;
        }

        results.innerHTML = html;
        results.classList.remove('hidden');
    },

    selezionaIngrediente(tipo, id, nome) {
        document.getElementById('ing-form-tipo').value = tipo;
        document.getElementById('ing-form-ref').value = id;
        document.getElementById('ing-form-ref-nome').value = nome;
        document.getElementById('ing-search').value = nome;
        document.getElementById('ing-search-results').innerHTML = '';
        document.getElementById('ing-search-results').classList.add('hidden');
        const icon = tipo === 'mp' ? '📦' : '🥩';
        document.getElementById('ing-selected').innerHTML = `
            <span class="text-xs bg-amber-100 text-amber-800 px-2 py-1 rounded-full">${icon} ${nome}</span>
        `;
    },

    saveIngrediente() {
        const ricettaId = document.getElementById('ing-modal-ricettaId').value;
        const tipo = document.getElementById('ing-form-tipo').value;
        const refId = document.getElementById('ing-form-ref').value;
        const refNome = document.getElementById('ing-form-ref-nome').value;
        const quantita = document.getElementById('ing-form-quantita').value;
        const unita = document.getElementById('ing-form-unita').value;
        const note = document.getElementById('ing-form-note').value.trim();

        if (!refId) { Utils.showToast('⚠️ Seleziona un ingrediente', 'warning'); return; }

        this.addIngrediente(ricettaId, { tipo, refId, refNome, quantita, unita, note });
        Utils.showToast('✅ Ingrediente aggiunto', 'success');

        // Reset form
        document.getElementById('ing-search').value = '';
        document.getElementById('ing-form-tipo').value = '';
        document.getElementById('ing-form-ref').value = '';
        document.getElementById('ing-form-ref-nome').value = '';
        document.getElementById('ing-selected').innerHTML = '';
        document.getElementById('ing-form-quantita').value = '';
        document.getElementById('ing-form-note').value = '';
        this.renderDettaglioIngredienti(ricettaId);
    },

    // ==========================================
    // RICERCA
    // ==========================================

    cercaRicetta(query) {
        this.renderListaRicette(query.toLowerCase().trim());
    },
};

window.RicetteModule = RicetteModule;
console.log('✅ RicetteModule caricato');