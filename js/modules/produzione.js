// ============================================
// 🍳 PRODUZIONE UNIFICATA
// ============================================
// Gestisce sia semilavorati che prodotti finiti
// in un unico registro con lotti unificati.
// ============================================

const ProduzioneModule = {

    produzioni: [],
    _filtroRange: 'settimana',   // stato del filtro (no più hidden input)

    // ==========================================
    // INIT
    // ==========================================

    init() {
        const produzioni = Storage.loadLocal(CONFIG.STORAGE_KEYS.PRODUZIONE, []);
        const semilavorati = Storage.loadLocal(CONFIG.STORAGE_KEYS.SEMILAVORATI, []);

        // Migra semilavorati esistenti
        semilavorati.forEach(s => {
            if (!produzioni.find(p => p.id === s.id)) {
                produzioni.push({
                    ...s,
                    tipo: ProduzioneModule.getTipo(s.ricettaId),
                    lottiMP: s.lottiUsati || [],
                    lottiSML: []
                });
            }
        });

        // Ricalcola sempre il tipo dalla ricetta (fonte di verità)
        produzioni.forEach(p => {
            p.tipo = ProduzioneModule.getTipo(p.ricettaId);
        });

        this.produzioni = produzioni;
        this.archiviaScaduti();
        console.log(`✅ Produzione unificata: ${this.produzioni.length} records`);
        this.save();
        this.render();
    },

    archiviaScaduti() {
        const oggi = new Date();
        oggi.setHours(0, 0, 0, 0);
        let modificato = false;
        this.produzioni.forEach(p => {
            if (!p.archiviato && p.scadenza && new Date(p.scadenza) < oggi) {
                p.archiviato = true;
                p.archiviatoAt = new Date().toISOString();
                modificato = true;
            }
        });
        if (modificato) this.save();
    },

    save() {
        Storage.saveLocal(CONFIG.STORAGE_KEYS.PRODUZIONE, this.produzioni);
        const now = new Date().toISOString();
        Storage.lastLocalSave[CONFIG.DROPBOX_PATHS.PRODUZIONE] = now;
        localStorage.setItem('lastLocalSave_' + CONFIG.DROPBOX_PATHS.PRODUZIONE, now);
        Storage.saveDropbox(CONFIG.DROPBOX_PATHS.PRODUZIONE, this.produzioni);
    },

    newId() {
        return 'prd_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
    },

    // ==========================================
    // TIPO PRODUZIONE (da categoria ricetta)
    // ==========================================

    getTipo(ricettaId) {
        const r = RicetteModule.getRicetta(ricettaId);
        if (!r) return 'prodotto';
        if (r.categoria === 'Sfoglia') return 'sfoglia';
        if (r.categoria === 'Semilavorato base') return 'base';
        if (r.categoria === 'Semilavorato composto') return 'composto';
        return 'prodotto';
    },

    isSemilavorato(ricettaId) {
        const tipo = this.getTipo(ricettaId);
        if (tipo === 'base' || tipo === 'composto' || tipo === 'sfoglia') return true;
        // Controlla anche il flag semilavorato nella ricetta
        const ricetta = RicetteModule.getRicetta(ricettaId);
        return ricetta?.semilavorato === true;
    },

    // ==========================================
    // GENERAZIONE LOTTO
    // ==========================================

    genLotto(data) {
        const d = data || new Date().toISOString().split('T')[0];
        const [y, m, gg] = d.split('-');
        const aa = y.slice(2);
        const base = `${gg}-${m}-${aa}`;
        const existing = this.produzioni.filter(p => p.lotto?.startsWith(base));
        if (existing.length === 0) return base;
        return `${base}-${existing.length + 1}`;
    },

    calcolaScadenza(data, shelfLife) {
        if (!shelfLife || !data) return '';
        const d = new Date(data);
        d.setDate(d.getDate() + parseInt(shelfLife));
        return d.toISOString().split('T')[0];
    },

    // ==========================================
    // CRUD
    // ==========================================

    addProduzione(dati) {
        const lotto = this.genLotto(dati.data);
        const tipo = dati.isAdHoc ? 'prodotto' : this.getTipo(dati.ricettaId);
        const ricetta = dati.isAdHoc ? null : RicetteModule.getRicetta(dati.ricettaId);
        const prod = {
            id: this.newId(),
            tipo: tipo,
            categoria: dati.isAdHoc ? 'Gastronomia' : (ricetta?.categoria || ''),
            ricettaId: dati.ricettaId,
            ricettaNome: dati.ricettaNome,
            isAdHoc: dati.isAdHoc || false,
            lotto: lotto,
            data: dati.data || new Date().toISOString().split('T')[0],
            scadenza: dati.scadenza || '',
            quantita: parseFloat(dati.quantita) || 0,
            unita: dati.unita || 'kg',
            operatore: dati.operatore?.trim() || '',
            note: dati.note?.trim() || '',
            lottiMP: dati.lottiMP || [],
            lottiSML: dati.lottiSML || [],
            congelato: dati.congelato || false,
            dataAbbattimento: dati.dataAbbattimento || '',
            lottoOrigineId: dati.lottoOrigineId || '',
            lottoOrigineNum: dati.lottoOrigineNum || '',
            archiviato: false,
            createdAt: new Date().toISOString()
        };
        this.produzioni.push(prod);
        this.save();
        return prod;
    },

    getProduzione(id) {
        return this.produzioni.find(p => p.id === id);
    },

    archiviaP(id) {
        const p = this.produzioni.find(p => p.id === id);
        if (!p) return;
        p.archiviato = true;
        p.archiviatoAt = new Date().toISOString();
        this.save();
        this.render();
        Utils.showToast('✅ Archiviato', 'success');
    },

    deleteProduzione(id) {
        if (!confirm('Eliminare questo record?')) return;
        this.produzioni = this.produzioni.filter(p => p.id !== id);
        this.save();
        this.render();
    },

    // Semilavorati attivi per una ricetta (usati dal modal produzione)
    getAttiviPerRicetta(ricettaId) {
        return this.produzioni
            .filter(p => p.ricettaId === ricettaId && !p.archiviato && this.isSemilavorato(p.ricettaId))
            .sort((a, b) => {
                // Freschi prima dei congelati
                if (a.congelato && !b.congelato) return 1;
                if (!a.congelato && b.congelato) return -1;
                // Poi FIFO per data
                return new Date(a.data) - new Date(b.data);
            });
    },

    // ==========================================
    // RENDER
    // ==========================================

    render() {
        this.renderLista();
    },

    renderLista() {
        const container = document.getElementById('produzione-list');
        if (!container) return;

        const filtroData = document.getElementById('prd-filtro-data')?.value;
        const filtroRange = this._filtroRange || 'settimana';
        const filtroSearch = document.getElementById('prd-search')?.value?.toLowerCase() || '';

        const oggi = new Date();
        oggi.setHours(0, 0, 0, 0);

        let lista = [...this.produzioni];

        if (filtroData) {
            lista = lista.filter(p => p.data === filtroData);
        } else if (filtroRange === 'oggi') {
            const oggiStr = new Date().toLocaleDateString('en-CA'); // formato YYYY-MM-DD locale
            lista = lista.filter(p => p.data === oggiStr);
        } else if (filtroRange === 'settimana') {
            const settimanaFa = new Date(oggi);
            settimanaFa.setDate(settimanaFa.getDate() - 7);
            lista = lista.filter(p => new Date(p.data) >= settimanaFa);
        }

        if (filtroSearch) {
            lista = lista.filter(p =>
                p.ricettaNome?.toLowerCase().includes(filtroSearch) ||
                p.lotto?.toLowerCase().includes(filtroSearch)
            );
        }

        const attivi = lista.filter(p => !p.archiviato);
        const archiviati = lista.filter(p => p.archiviato);

        if (lista.length === 0) {
            container.innerHTML = `
                <div class="text-center py-12 text-gray-400">
                    <div class="text-5xl mb-3">🍳</div>
                    <p class="text-lg">Nessuna produzione trovata.</p>
                </div>`;
            return;
        }

        let html = '';

        const sezioni = [
            { tipo: 'sfoglia', label: '🍃 Sfoglia', items: attivi.filter(p => p.tipo === 'sfoglia') },
            { tipo: 'base', label: '🧱 Semilavorati base', items: attivi.filter(p => p.tipo === 'base') },
            { tipo: 'composto', label: '🔧 Semilavorati composti', items: attivi.filter(p => p.tipo === 'composto') },
            { tipo: 'prodotto', label: '🍝 Prodotti finiti', items: attivi.filter(p => p.tipo === 'prodotto') },
        ];

        sezioni.forEach(sez => {
            if (sez.items.length === 0) return;
            const sezId = `sez-${sez.tipo}`;
            html += `
            <div class="mb-2 mt-4">
                <button onclick="ProduzioneModule.toggleSezione('${sezId}')"
                    class="w-full flex items-center justify-between px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors">
                    <span class="flex items-center gap-2">
                        <span class="text-xs font-bold text-gray-500 uppercase tracking-wider">${sez.label}</span>
                        <span class="bg-gray-300 text-gray-600 rounded-full px-2 py-0.5 text-xs font-medium">
                            ${sez.items.length}
                        </span>
                    </span>
                    <span id="${sezId}-icon" class="text-gray-400 text-sm">▼</span>
                </button>
                <div id="${sezId}" class="mt-1 card-grid">
                    ${sez.items
                    .sort((a, b) => new Date(b.data) - new Date(a.data))
                    .map(p => this.renderRow(p)).join('')}
                </div>
            </div>`;
        });

        // Archiviati in accordion chiuso
        if (archiviati.length > 0) {
            html += `
            <div class="mb-2 mt-6">
                <button onclick="ProduzioneModule.toggleSezione('sez-archiviati')"
                    class="w-full flex items-center justify-between px-3 py-2 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors border border-gray-200">
                    <span class="flex items-center gap-2">
                        <span class="text-xs font-bold text-gray-400 uppercase tracking-wider">📦 Archiviati</span>
                        <span class="bg-gray-200 text-gray-500 rounded-full px-2 py-0.5 text-xs font-medium">
                            ${archiviati.length}
                        </span>
                    </span>
                    <span id="sez-archiviati-icon" class="text-gray-400 text-sm">▶</span>
                </button>
                <div id="sez-archiviati" class="mt-1 hidden card-grid">
                    ${archiviati
                    .sort((a, b) => new Date(b.data) - new Date(a.data))
                    .map(p => this.renderRow(p)).join('')}
                </div>
            </div>`;
        }

        container.innerHTML = html;
    },

    setFiltroRange(range) {
        this._filtroRange = range;
        document.getElementById('prd-filtro-data').value = '';
        ['oggi', 'settimana', 'tutto'].forEach(r => {
            const btn = document.getElementById(`btn-range-${r}`);
            if (!btn) return;
            if (r === range) {
                btn.className = 'flex-1 py-2 px-4 bg-amber-800 text-white font-semibold';
            } else {
                btn.className = r === 'oggi'
                    ? 'flex-1 py-2 px-4 bg-white hover:bg-gray-50 text-gray-600 border-r border-gray-300'
                    : r === 'tutto'
                        ? 'flex-1 py-2 px-4 bg-white hover:bg-gray-50 text-gray-600 border-l border-gray-300'
                        : 'flex-1 py-2 px-4 bg-white hover:bg-gray-50 text-gray-600';
            }
        });
        this.renderLista();
    },

    toggleSezione(id) {
        const el = document.getElementById(id);
        const icon = document.getElementById(`${id}-icon`);
        if (!el) return;
        const isOpen = el.style.display !== 'none';
        el.style.display = isOpen ? 'none' : 'block';
        icon.textContent = isOpen ? '▶' : '▼';
    },

    renderRow(p) {
        const scadAvv = p.scadenza && !p.congelato ? this.avvisoScadenza(p.scadenza) : '';

        const lottoColor = p.congelato
            ? 'bg-blue-100 text-blue-800'
            : p.tipo === 'prodotto'
                ? 'bg-green-100 text-green-800'
                : p.tipo === 'composto'
                    ? 'bg-purple-100 text-purple-800'
                    : p.tipo === 'sfoglia'
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-orange-100 text-orange-800';

        const lottiStr = [
            ...(p.lottiMP || []).map(l => `${l.mpNome}: <span class="font-mono">${l.lotto}</span>`),
            ...(p.lottiSML || []).map(l => `${l.smlNome}: <span class="font-mono">${l.lotto}</span>`)
        ].join(' · ');

        const hasIngredients = (p.lottiMP?.length > 0) || (p.lottiSML?.length > 0) || (p.lottiUsati?.length > 0);
        const rowId = `row-detail-${p.id}`;

        // Nota scongelo
        const notaScongelo = p.congelato
            ? `<div class="text-xs text-blue-500 mt-0.5">
            ℹ️ Dopo scongelo: <strong>2gg</strong> se non trasformato · <strong>4gg</strong> se cotto
           </div>`
            : '';

        return `
        <div class="border rounded-lg mb-2 overflow-hidden
                    ${p.congelato ? 'border-blue-300 bg-blue-50' : 'bg-white border-gray-200'}
                    ${p.archiviato ? 'opacity-40' : ''}">
            <div class="px-3 py-2.5 ${hasIngredients ? 'cursor-pointer active:bg-gray-50' : ''}"
                ${hasIngredients ? `onclick="ProduzioneModule.toggleDettaglio('${rowId}')"` : ''}>

                <!-- Prima riga: nome + lotto + azioni -->
                <div class="flex items-start gap-2 min-w-0">
                    <div class="flex-1 min-w-0 overflow-hidden">
                        <div class="font-bold text-gray-800 text-sm truncate">${p.ricettaNome}</div>
                        <div class="flex items-center gap-1.5 mt-0.5 flex-wrap">
                            <span class="font-mono text-xs px-2 py-0.5 rounded font-bold whitespace-nowrap ${lottoColor}">
                                ${p.lotto}
                            </span>
                            ${p.congelato ? `<span class="text-xs bg-blue-200 text-blue-700 px-1.5 py-0.5 rounded font-medium">❄️ congelato</span>` : ''}
                            ${p.dataAbbattimento ? `<span class="text-xs text-blue-500">· abbatt. ${this.fmtData(p.dataAbbattimento)}</span>` : ''}
                            ${p.lottoOrigineNum ? `<span class="text-xs text-gray-400">· da ${p.lottoOrigineNum}</span>` : ''}
                            ${!p.congelato && p.scadenza ? `<span class="text-xs text-gray-400">scad. ${this.fmtData(p.scadenza)}</span>` : ''}
                            ${scadAvv}
                        </div>
                    </div>
                    <!-- Azioni -->
                    <div class="flex items-center gap-0.5 flex-shrink-0">
                        ${hasIngredients ? `<span id="${rowId}-icon" class="text-gray-300 text-xs px-1">▼</span>` : ''}
                        <button onclick="event.stopPropagation();ProduzioneModule.openModalEdit('${p.id}')"
                            class="text-amber-600 p-1.5 rounded-lg active:bg-amber-50 text-sm">✏️</button>
                        <button onclick="event.stopPropagation();ProduzioneModule.openModalTracciabilita('${p.id}')"
                            class="text-gray-500 p-1.5 rounded-lg active:bg-gray-50 text-sm">🔍</button>
                        ${!p.archiviato ? `
                            <button onclick="event.stopPropagation();ProduzioneModule.archiviaP('${p.id}')"
                                class="text-gray-400 p-1.5 rounded-lg active:bg-gray-50 text-sm">📦</button>
                            ${p.congelato ? `
                                <button onclick="event.stopPropagation();ProduzioneModule.apriScongela('${p.id}')"
                                    title="Scongela"
                                    class="text-amber-500 p-1.5 rounded-lg active:bg-amber-50 text-sm">🌡️</button>
                            ` : `
                                <button onclick="event.stopPropagation();ProduzioneModule.apriCongelaAvanzo('${p.id}')"
                                    title="Congela avanzo"
                                    class="text-blue-400 p-1.5 rounded-lg active:bg-blue-50 text-sm">❄️</button>
                            `}
                        ` : ''}
                        <button onclick="event.stopPropagation();ProduzioneModule.deleteProduzione('${p.id}')"
                            class="text-red-400 p-1.5 rounded-lg active:bg-red-50 text-sm">🗑</button>
                        <button onclick="EtichetteModule.stampa('${p.id}')" title="Stampa etichetta"
                            class="text-gray-400 hover:text-amber-700 p-1">🏷️</button>
                    </div>
                </div>

                ${p.quantita ? `<div class="text-xs text-gray-400 mt-0.5">
                    ${p.quantita} ${p.unita}
                    ${p.rimanente !== undefined && p.rimanente !== p.quantita
                    ? `· <span class="text-orange-600 font-medium">rimasti: ${p.rimanente} ${p.unita}</span>`
                    : ''}
                </div>` : ''}
                ${notaScongelo}

                <!-- Lotti usati -->
                ${lottiStr ? `<div class="text-xs text-gray-300 mt-0.5 truncate">${lottiStr}</div>` : ''}
            </div>

            <!-- Albero ingredienti -->
            ${hasIngredients ? `
            <div id="${rowId}" class="hidden border-t border-gray-100 bg-gray-50 px-3 py-2">
                ${this.renderAlberoHTML(p, 0)}
            </div>` : ''}
        </div>`;
    },

    toggleDettaglio(id) {
        const el = document.getElementById(id);
        const icon = document.getElementById(`${id}-icon`);
        if (!el) return;
        const isHidden = el.classList.contains('hidden');
        el.classList.toggle('hidden', !isHidden);
        if (icon) icon.textContent = isHidden ? '▲' : '▼';
    },

    renderAlberoHTML(prod, livello, visited = new Set()) {
        if (livello > 5) return '';
        if (visited.has(prod.id)) return '';
        visited.add(prod.id);

        let html = '';
        const indent = livello * 16;

        // Semilavorati
        if (prod.lottiSML?.length > 0) {
            prod.lottiSML.forEach(s => {
                const smlDet = this.produzioni.find(x => x.lotto === s.lotto && x.id !== prod.id)
                    || this.produzioni.find(x => x.id === s.smlRefId);
                const subId = `sub-${s.smlRefId || s.lotto.replace(/[^a-z0-9]/gi, '')}`;
                const hasSubIngredients = smlDet && ((smlDet.lottiMP?.length > 0) || (smlDet.lottiSML?.length > 0));

                html += `
                <div style="padding-left:${indent}px" class="flex items-start gap-1.5 py-1 border-b border-gray-100 last:border-0">
                    <span class="text-gray-300 text-xs mt-0.5">↳</span>
                    <div class="flex-1">
                        <div class="${hasSubIngredients ? 'cursor-pointer' : ''} flex items-center gap-1"
                            ${hasSubIngredients ? `onclick="document.getElementById('${subId}').classList.toggle('hidden')"` : ''}>
                            <span class="text-xs font-semibold text-orange-700">🥩 ${s.smlNome}</span>
                            <span class="font-mono text-xs text-orange-600 ml-1">${s.lotto}</span>
                            ${smlDet?.scadenza ? `<span class="text-xs text-gray-400 ml-1">scad. ${this.fmtData(smlDet.scadenza)}</span>` : ''}
                            ${hasSubIngredients ? `<span class="text-xs text-gray-400">▼</span>` : ''}
                        </div>
                        ${smlDet && hasSubIngredients ? `
                        <div id="${subId}" class="hidden mt-1">
                            ${this.renderAlberoHTML(smlDet, livello + 1, visited)}
                        </div>` : ''}
                    </div>
                </div>`;
            });
        }

        // Materie prime
        const mpList = prod.lottiMP?.length > 0 ? prod.lottiMP : (prod.lottiUsati || []);
        if (mpList.length > 0) {
            mpList.forEach(mp => {
                html += `
            <div style="padding-left:${indent}px" class="flex items-center gap-1.5 py-0.5">
                <span class="text-gray-300 text-xs">↳</span>
                <span class="text-xs text-gray-600">📦 ${mp.mpNome}</span>
                <span class="font-mono text-xs text-gray-500 ml-1">${mp.lotto}</span>
            </div>`;
            });
        }

        return html;
    },

    // ==========================================
    // HELPERS
    // ==========================================

    fmtData(iso) {
        if (!iso) return '–';
        const [y, m, d] = iso.split('-');
        return `${d}/${m}/${y}`;
    },

    avvisoScadenza(scadenza) {
        const oggi = new Date();
        const scad = new Date(scadenza);
        const diffGg = Math.ceil((scad - oggi) / 86400000);
        if (diffGg < 0) return `<span class="text-red-600 font-bold text-xs">⛔ scad.</span>`;
        if (diffGg <= 3) return `<span class="text-red-500 font-bold text-xs">⚠️ ${diffGg}gg</span>`;
        if (diffGg <= 7) return `<span class="text-orange-500 text-xs">⚠️ ${diffGg}gg</span>`;
        return '';
    },

    // ==========================================
    // MODAL: NUOVA / MODIFICA PRODUZIONE
    // ==========================================

    openModalNew() {
        // Reset ricerca e filtri categoria
        document.getElementById('prd-ricetta-search').value = '';
        document.querySelectorAll('.prd-cat-btn').forEach(btn => {
            if (btn.dataset.cat === '') {
                btn.classList.remove('bg-gray-200', 'text-gray-700');
                btn.classList.add('bg-green-700', 'text-white', 'active');
            } else {
                btn.classList.remove('bg-green-700', 'text-white', 'active');
                btn.classList.add('bg-gray-200', 'text-gray-700');
            }
        });
        this._popolaSelectRicette('', '');

        const oggi = new Date().toLocaleDateString('en-CA');
        document.getElementById('prd-form-data').value = oggi;
        document.getElementById('prd-form-scadenza').value = '';
        document.getElementById('prd-form-quantita').value = '';
        document.getElementById('prd-form-unita').value = 'kg';
        document.getElementById('prd-form-operatore').value = '';
        document.getElementById('prd-form-note').value = '';
        document.getElementById('prd-form-id').value = '';
        document.getElementById('prd-lotti-mp').innerHTML = '';
        document.getElementById('prd-lotti-sml').innerHTML = '';
        document.getElementById('prd-form-congelato').checked = false;
        document.querySelector('#prd-modal h3').textContent = '🍳 Nuova Produzione';

        // Reset modalità ad hoc
        document.getElementById('prd-form-is-adhoc').value = '0';
        const selRic = document.getElementById('prd-form-ricetta');
        selRic.disabled = false;
        document.getElementById('prd-adhoc-fields').classList.add('hidden');
        document.getElementById('prd-form-nome-adhoc').value = '';
        document.getElementById('prd-adhoc-toggle').textContent = '✏️ Produzione senza ricetta (gastronomia ad hoc)';
        document.getElementById('prd-adhoc-toggle').className = 'text-xs text-blue-600 underline mt-1 block';
        document.getElementById('prd-modal').classList.remove('hidden');
    },

    closeModal() {
        document.getElementById('prd-modal').classList.add('hidden');
        this._scongelaRef = null;
    },

    toggleAdHoc() {
        const isAdHoc = document.getElementById('prd-form-is-adhoc').value === '1';
        const sel = document.getElementById('prd-form-ricetta');
        const adhocFields = document.getElementById('prd-adhoc-fields');
        const toggle = document.getElementById('prd-adhoc-toggle');
        const lottiMP = document.getElementById('prd-lotti-mp');
        const lottiSML = document.getElementById('prd-lotti-sml');

        if (!isAdHoc) {
            document.getElementById('prd-form-is-adhoc').value = '1';
            sel.disabled = true;
            sel.value = '';
            adhocFields.classList.remove('hidden');
            toggle.textContent = '← Usa una ricetta esistente';
            toggle.classList.replace('text-blue-600', 'text-gray-500');
            lottiMP.innerHTML = '';
            lottiSML.innerHTML = '';
            this.renderAdHocLotti();
        } else {
            document.getElementById('prd-form-is-adhoc').value = '0';
            sel.disabled = false;
            adhocFields.classList.add('hidden');
            document.getElementById('prd-form-nome-adhoc').value = '';
            document.getElementById('prd-adhoc-lotti').innerHTML = '';
            toggle.textContent = '✏️ Produzione senza ricetta (gastronomia ad hoc)';
            toggle.classList.replace('text-gray-500', 'text-blue-600');
        }
    },

    renderAdHocLotti() {
        const container = document.getElementById('prd-adhoc-lotti');
        container.innerHTML = `
        <div class="border rounded-lg p-3 bg-amber-50">
            <p class="text-xs font-bold text-amber-700 uppercase mb-2">
                🏷 Ingredienti usati (opzionale)
            </p>
            <div id="prd-adhoc-lotti-list"></div>
            <button type="button" onclick="ProduzioneModule.addAdHocLotto()"
                class="mt-2 text-xs text-amber-700 underline">
                + Aggiungi ingrediente
            </button>
        </div>`;
    },

    addAdHocLotto() {
        const list = document.getElementById('prd-adhoc-lotti-list');
        const idx = list.children.length;

        const mpOptions = (MateriePrimeModule.materiePrime || [])
            .map(mp => `<option value="mp|${mp.id}" data-nome="${mp.nome}">${mp.nome}</option>`)
            .join('');

        const smlAttivi = (this.produzioni || []).filter(p => this.isSemilavorato(p.ricettaId) && !p.archiviato);
        const smlOptions = smlAttivi
            .map(s => `<option value="sml|${s.id}" data-nome="${s.ricettaNome}">${s.ricettaNome} · ${s.lotto}</option>`)
            .join('');

        const div = document.createElement('div');
        div.className = 'flex gap-2 mb-2 items-center';
        div.dataset.idx = idx;
        div.innerHTML = `
            <select class="flex-1 px-2 py-1 border rounded text-sm adhoc-mp-sel"
                onchange="ProduzioneModule.onAdHocMPChange(this)">
                <option value="">— Ingrediente —</option>
                ${mpOptions.length ? `<optgroup label="Materie Prime">${mpOptions}</optgroup>` : ''}
                ${smlOptions.length ? `<optgroup label="Semilavorati">${smlOptions}</optgroup>` : ''}
            </select>
            <input type="text" placeholder="Lotto"
                class="w-28 px-2 py-1 border rounded text-sm adhoc-lotto-val">
            <button type="button" onclick="this.parentElement.remove()"
                class="text-red-400 hover:text-red-600 text-lg leading-none">×</button>`;
        list.appendChild(div);
    },

    onAdHocMPChange(sel) {
        const val = sel.value;
        if (!val) return;
        const [tipo, id] = val.split('|');
        const lottoInput = sel.parentElement.querySelector('.adhoc-lotto-val');
        if (tipo === 'mp') {
            const lottiAttivi = MateriePrimeModule.getLottiAttivi(id);
            if (lottiAttivi.length > 0) lottoInput.value = lottiAttivi[0].lotto;
        } else if (tipo === 'sml') {
            const sml = this.produzioni.find(p => p.id === id);
            if (sml) lottoInput.value = sml.lotto;
        }
    },

    _popolaSelectRicette(catFiltro = '', search = '') {
        const sel = document.getElementById('prd-form-ricetta');
        sel.innerHTML = '<option value="">— Seleziona ricetta —</option>';

        const ordine = ['Sfoglia', 'Semilavorato base', 'Semilavorato composto', 'Pasta fresca ripiena', 'Gastronomia'];
        let tutte = RicetteModule.getAllRicette();

        if (search) {
            tutte = tutte.filter(r => r.nome.toLowerCase().includes(search.toLowerCase()));
        }

        const categorieDaMostrare = catFiltro === ''
            ? ordine
            : catFiltro === 'Semilavorato'
                ? ['Semilavorato base', 'Semilavorato composto']
                : [catFiltro];

        categorieDaMostrare.forEach(cat => {
            const gruppo = tutte.filter(r => r.categoria === cat);
            if (gruppo.length === 0) return;
            const optgroup = document.createElement('optgroup');
            optgroup.label = cat;
            gruppo.forEach(r => {
                const opt = document.createElement('option');
                opt.value = r.id;
                opt.dataset.nome = r.nome;
                opt.dataset.shelf = r.shelfLife || '';
                opt.textContent = r.nome + (r.shelfLife ? ` (${r.shelfLife}gg)` : '');
                optgroup.appendChild(opt);
            });
            sel.appendChild(optgroup);
        });
    },

    onRicercaRicetta() {
        const search = document.getElementById('prd-ricetta-search').value;
        const catAttiva = document.querySelector('.prd-cat-btn.active')?.dataset.cat || '';
        this._popolaSelectRicette(catAttiva, search);
    },

    filtraCategoria(cat) {
        document.querySelectorAll('.prd-cat-btn').forEach(btn => {
            if (btn.dataset.cat === cat) {
                btn.classList.remove('bg-gray-200', 'text-gray-700');
                btn.classList.add('bg-green-700', 'text-white', 'active');
            } else {
                btn.classList.remove('bg-green-700', 'text-white', 'active');
                btn.classList.add('bg-gray-200', 'text-gray-700');
            }
        });
        const search = document.getElementById('prd-ricetta-search').value;
        this._popolaSelectRicette(cat, search);
    },

    onRicettaChange() {
        const sel = document.getElementById('prd-form-ricetta');
        const opt = sel.options[sel.selectedIndex];
        const ricId = sel.value;
        const shelfLife = opt?.dataset.shelf || '';
        const data = document.getElementById('prd-form-data').value;

        if (shelfLife && data) {
            document.getElementById('prd-form-scadenza').value =
                this.calcolaScadenza(data, shelfLife);
        }

        const ricetta = RicetteModule.getRicetta(ricId);
        if (!ricetta) return;
        this.renderLottiMP(ricetta);
        this.renderLottiSML(ricetta);
    },

    async verificaDisponibilita() {
        const sel = document.getElementById('prd-form-ricetta');
        const ricettaId = sel.value;
        const quantita = parseFloat(document.getElementById('prd-form-quantita').value) || 0;
        if (!ricettaId || quantita <= 0) return;

        const ricetta = RicetteModule.getRicetta(ricettaId);
        if (!ricetta || !ricetta.ingredienti) return;

        const problemi = [];
        const visited = new Set([ricettaId]);

        // Controlla ogni ingrediente
        for (const ing of ricetta.ingredienti) {
            if (ing.tipo === 'mp') {
                const mpObj = MateriePrimeModule.getMP(ing.refId);
                if (mpObj?.noTraccia) continue;

                const giacenza = MateriePrimeModule.getGiacenza(ing.refId);
                const lottiAttivi = MateriePrimeModule.getLottiAttivi(ing.refId);
                const hasLotti = lottiAttivi.length > 0;

                if (!hasLotti) {
                    problemi.push({
                        tipo: 'mp_no_lotti',
                        nome: ing.refNome,
                        refId: ing.refId,
                        msg: `Nessun lotto attivo`
                    });
                } else if (giacenza > 0 && ing.quantita && ricetta.resa) {
                    const necessaria = (quantita * ing.quantita) / ricetta.resa;
                    if (giacenza < necessaria) {
                        problemi.push({
                            tipo: 'mp_scorta',
                            nome: ing.refNome,
                            refId: ing.refId,
                            msg: `Scorta insufficiente (hai ${giacenza}${ing.unita || 'kg'}, servono ~${Math.round(necessaria * 10) / 10}${ing.unita || 'kg'})`
                        });
                    }
                }
            } else if (ing.tipo === 'sml') {
                const ricettaSml = RicetteModule.getRicetta(ing.refId);
                const isSfoglia = ricettaSml?.categoria === 'Sfoglia';
                const isBase = ricettaSml?.categoria === 'Semilavorato base';

                if (!isSfoglia) {
                    const attiviSml = this.getAttiviPerRicetta(ing.refId);
                    if (attiviSml.length === 0) {
                        problemi.push({
                            tipo: isBase ? 'sml_bloccante' : 'sml_mancante',
                            nome: ing.refNome,
                            refId: ing.refId,
                            ricettaId: ing.refId,
                            msg: isBase
                                ? `⛔ Deve essere prodotto prima`
                                : `Nessuna produzione attiva — verrà creato automaticamente`
                        });
                    }
                }

                this.controllaSml(ricettaSml, ing.refNome, problemi, new Set([ricettaId]), quantita > 0 ? document.getElementById('prd-form-data')?.value : null);
            }
        }

        if (problemi.length === 0) return;

        // Mostra popup avvisi
        let html = `
    <div class="modal-overlay" id="disponibilita-modal">
        <div class="modal-box">
            <div class="bg-yellow-600 text-white p-5 rounded-t-xl">
                <h3 class="text-xl font-bold">⚠️ Verifica disponibilità</h3>
                <p class="text-sm opacity-80">Alcuni elementi potrebbero mancare</p>
            </div>
            <div class="p-5 space-y-3">`;

        problemi.forEach(p => {
            const actionBtn = p.tipo === 'mp_no_lotti' || p.tipo === 'mp_scorta'
                ? `<button onclick="ProduzioneModule.chiudiDisponibilita();MateriePrimeModule.openModalCarico('${p.refId}')"
                    class="text-xs bg-amber-100 text-amber-700 px-2 py-1 rounded hover:bg-amber-200 mt-1">
                    + Aggiungi carico
                    </button>`
                : p.tipo === 'sml_bloccante'
                    ? `<button onclick="ProduzioneModule.chiudiDisponibilita();ProduzioneModule.openModalNewPerSml('${p.ricettaId}')"
                        class="text-xs bg-red-100 text-red-700 px-2 py-1 rounded hover:bg-red-200 mt-1">
                        + Registra produzione prima
                        </button>`
                    : `<span class="text-xs text-blue-500 mt-1 block">
                            ✅ Verrà creato automaticamente con lotti FIFO
                        </span>`;
            html += `
            <div class="border rounded-lg p-3 ${p.tipo === 'sml_mancante' ? 'bg-blue-50 border-blue-200' : p.tipo === 'sml_bloccante' ? 'bg-red-50 border-red-300' : 'bg-red-50 border-red-200'}">
                <div class="font-semibold text-gray-800 text-sm">${p.nome}</div>
                <div class="text-xs text-gray-500 mt-0.5">${p.msg}</div>
                ${actionBtn}
            </div>`;
        });

        html += `
            <div class="flex gap-3 pt-2">
                <button onclick="ProduzioneModule.chiudiDisponibilita()"
                    class="flex-1 bg-gray-200 text-gray-700 py-2.5 rounded-lg font-semibold hover:bg-gray-300">
                    Procedi lo stesso
                </button>
            </div>
            </div>
        </div>
    </div>`;

        document.body.insertAdjacentHTML('beforeend', html);
    },

    controllaSml(ricettaSml, nomeParent, problemi, visited, dataProduzione) {
        if (!ricettaSml?.ingredienti) return;
        if (visited.has(ricettaSml.id)) return;
        visited.add(ricettaSml.id);

        for (const ing of ricettaSml.ingredienti) {
            if (ing.tipo === 'mp') {
                const mpObj = MateriePrimeModule.getMP(ing.refId);
                if (mpObj?.noTraccia) continue;
                const lottiDisp = MateriePrimeModule.getLottiPerProduzione(ing.refId, dataProduzione);
                if (lottiDisp.length === 0) {
                    problemi.push({
                        tipo: 'mp_no_lotti',
                        nome: `${ing.refNome} (per ${nomeParent})`,
                        refId: ing.refId,
                        msg: `Nessun lotto attivo`
                    });
                } else {
                    const giacenza = MateriePrimeModule.getGiacenza(ing.refId);
                    if (giacenza <= 0 && ing.quantita) {
                        problemi.push({
                            tipo: 'mp_scorta',
                            nome: `${ing.refNome} (per ${nomeParent})`,
                            refId: ing.refId,
                            msg: `Scorta esaurita`
                        });
                    }
                }
            } else if (ing.tipo === 'sml') {
                const ricettaSub = RicetteModule.getRicetta(ing.refId);
                const isSfoglia = ricettaSub?.categoria === 'Sfoglia';
                const isBase = ricettaSub?.categoria === 'Semilavorato base';

                if (!isSfoglia) {
                    const attiviSml = this.getAttiviPerRicetta(ing.refId);
                    if (attiviSml.length === 0) {
                        problemi.push({
                            tipo: isBase ? 'sml_bloccante' : 'sml_mancante',
                            nome: `${ing.refNome} (per ${nomeParent})`,
                            refId: ing.refId,
                            ricettaId: ing.refId,
                            msg: isBase
                                ? `⛔ Deve essere prodotto prima`
                                : `Nessuna produzione attiva`
                        });
                        // Controlla ricorsivamente SOLO se il SML non esiste
                        this.controllaSml(ricettaSub, ing.refNome, problemi, visited, dataProduzione);
                    }
                    // Se il SML esiste già → non controllare le sue MP
                } else {
                    // Sfoglia: controlla sempre le sue MP
                    this.controllaSml(ricettaSub, ing.refNome, problemi, visited, dataProduzione);
                }
            }
        }
    },

    chiudiDisponibilita() {
        document.getElementById('disponibilita-modal')?.remove();
    },

    openModalNewPerSml(ricettaId) {
        this.openModalNew();
        // Preseleziona la ricetta
        setTimeout(() => {
            const sel = document.getElementById('prd-form-ricetta');
            for (let opt of sel.options) {
                if (opt.value === ricettaId) {
                    opt.selected = true;
                    this.onRicettaChange();
                    break;
                }
            }
        }, 100);
    },

    onDataChange() {
        const sel = document.getElementById('prd-form-ricetta');
        const opt = sel.options[sel.selectedIndex];
        const shelfLife = opt?.dataset.shelf || '';
        const data = document.getElementById('prd-form-data').value;
        if (shelfLife && data) {
            document.getElementById('prd-form-scadenza').value =
                this.calcolaScadenza(data, shelfLife);
        }
        if (data) {
            const lottoEl = document.getElementById('prd-form-lotto');
            if (lottoEl) lottoEl.value = this.genLotto(data);
        }
    },

    renderLottiMP(ricetta) {
        const container = document.getElementById('prd-lotti-mp');
        const mpIng = ricetta.ingredienti.filter(i => i.tipo === 'mp');
        if (mpIng.length === 0) { container.innerHTML = ''; return; }

        container.innerHTML = `
            <div class="border rounded-lg p-3 bg-blue-50">
                <p class="text-xs font-bold text-blue-700 uppercase mb-2">🏷 Lotti Materie Prime</p>
                ${mpIng.map(ing => {
            const dataProd = document.getElementById('prd-form-data')?.value;
            const lotti = MateriePrimeModule.getLottiPerProduzione(ing.refId, dataProd);
            const opzioni = lotti.length === 0
                ? '<option value="">Nessun lotto disponibile</option>'
                : lotti.map((l, i) =>
                    `<option value="${l.id}|${l.lotto}" ${i === 0 ? 'selected' : ''}>
                        ${l.lotto} · arr. ${this.fmtData(l.dataArrivo)} ${i === 0 ? '— FIFO' : ''}
                     </option>`
                ).join('') + '<option value="manuale">✏️ Inserisci manualmente</option>';
            return `
                <div class="mb-2" data-mp-id="${ing.refId}" data-mp-nome="${ing.refNome}">
                    <label class="block text-xs text-gray-600 mb-1 font-medium">${ing.refNome}</label>
                    <select class="prd-lotto-mp-sel w-full px-3 py-2 border rounded-lg text-sm bg-white"
                        onchange="ProduzioneModule.onLottoMPChange(this)">
                        ${opzioni}
                    </select>
                    <input type="text" class="prd-lotto-mp-manual hidden w-full px-3 py-2 border rounded-lg text-sm mt-1"
                        placeholder="Inserisci lotto manualmente">
                </div>`;
        }).join('')}
            </div>`;
    },

    renderLottiSML(ricetta) {
        const container = document.getElementById('prd-lotti-sml');
        const smlIng = ricetta.ingredienti.filter(i => i.tipo === 'sml');
        if (smlIng.length === 0) { container.innerHTML = ''; return; }

        container.innerHTML = `
        <div class="border rounded-lg p-3 bg-orange-50">
        <p class="text-xs font-bold text-orange-700 uppercase mb-2">🥩 Lotti Semilavorati</p>
            ${smlIng.map(ing => {
            const attivi = this.getAttiviPerRicetta(ing.refId);

            // Pre-seleziona lotto scongelato se presente
            const scongelaRefId = this._scongelaRef?.prodRicettaId === ing.refId
                ? this._scongelaRef.prodId
                : null;

            const opzioni = attivi.length === 0
                ? '<option value="">Nessun lotto disponibile</option>'
                : attivi.map((s, i) =>
                    `<option value="${s.id}|${s.lotto}" 
                    ${scongelaRefId ? s.id === scongelaRefId ? 'selected' : '' : i === 0 ? 'selected' : ''}>
                    ${s.congelato ? '❄️ ' : '🌿 '}${s.lotto} · ${s.congelato ? 'abbatt.' : 'prod.'} ${this.fmtData(s.congelato ? s.dataAbbattimento || s.data : s.data)}
                    ${!s.congelato && s.scadenza ? ` · scad. ${this.fmtData(s.scadenza)}` : ''}
                    ${i === 0 && !scongelaRefId ? '— FIFO' : s.id === scongelaRefId ? '— SCONGELATO' : ''}
                 </option>`
                ).join('') + '<option value="manuale">✏️ Inserisci manualmente</option>';
            return `
            <div class="mb-2" data-sml-id="${ing.refId}" data-sml-nome="${ing.refNome}">
                <label class="block text-xs text-gray-600 mb-1 font-medium">${ing.refNome}</label>
                <select class="prd-lotto-sml-sel w-full px-3 py-2 border rounded-lg text-sm bg-white"
                    onchange="ProduzioneModule.onLottoSMLChange(this)">
                    ${opzioni}
                </select>
                <input type="text" class="prd-lotto-sml-manual hidden w-full px-3 py-2 border rounded-lg text-sm mt-1"
                    placeholder="Inserisci lotto manualmente">
            </div>`;
        }).join('')}
            </div>`;
    },

    onLottoMPChange(sel) {
        const manual = sel.parentElement.querySelector('.prd-lotto-mp-manual');
        if (sel.value === 'manuale') { manual.classList.remove('hidden'); manual.focus(); }
        else manual.classList.add('hidden');
    },

    onLottoSMLChange(sel) {
        const manual = sel.parentElement.querySelector('.prd-lotto-sml-manual');
        if (sel.value === 'manuale') { manual.classList.remove('hidden'); manual.focus(); }
        else manual.classList.add('hidden');
    },

    saveProduzione() {
        const isAdHoc = document.getElementById('prd-form-is-adhoc').value === '1';
        const sel = document.getElementById('prd-form-ricetta');

        let ricettaId = '';
        let ricettaNome = '';

        if (isAdHoc) {
            ricettaNome = document.getElementById('prd-form-nome-adhoc').value.trim();
            if (!ricettaNome) { Utils.showToast('⚠️ Inserisci il nome del piatto', 'warning'); return; }
        } else {
            ricettaId = sel.value;
            ricettaNome = sel.options[sel.selectedIndex]?.dataset.nome || '';
            if (!ricettaId) { Utils.showToast('⚠️ Seleziona una ricetta', 'warning'); return; }
        }

        const data = document.getElementById('prd-form-data').value;
        const scadenza = document.getElementById('prd-form-scadenza').value;
        const quantita = document.getElementById('prd-form-quantita').value;
        const unita = document.getElementById('prd-form-unita').value;
        const operatore = document.getElementById('prd-form-operatore').value;
        const note = document.getElementById('prd-form-note').value;
        const congelato = document.getElementById('prd-form-congelato')?.checked || false;

        if (!data) { Utils.showToast('⚠️ La data è obbligatoria', 'warning'); return; }

        const lottiMP = [];
        document.querySelectorAll('#prd-lotti-mp [data-mp-id]').forEach(div => {
            const mpId = div.dataset.mpId;
            const mpNome = div.dataset.mpNome;
            const sel = div.querySelector('.prd-lotto-mp-sel');
            const manual = div.querySelector('.prd-lotto-mp-manual');
            let lotto = '', lottoId = '';
            if (sel.value === 'manuale') {
                lotto = manual.value.trim();
            } else if (sel.value) {
                [lottoId, lotto] = sel.value.split('|');
            }
            if (lotto) lottiMP.push({ mpId, mpNome, lottoId, lotto });
        });

        const lottiSML = [];
        document.querySelectorAll('#prd-lotti-sml [data-sml-id]').forEach(div => {
            const smlId = div.dataset.smlId;
            const smlNome = div.dataset.smlNome;
            const sel = div.querySelector('.prd-lotto-sml-sel');
            const manual = div.querySelector('.prd-lotto-sml-manual');
            let lotto = '', smlRefId = '';
            if (sel.value === 'manuale') {
                lotto = manual.value.trim();
            } else if (sel.value) {
                [smlRefId, lotto] = sel.value.split('|');
            }
            if (lotto) lottiSML.push({ smlId, smlNome, smlRefId, lotto });
        });

        // Lotti ad hoc (modalità senza ricetta)
        if (isAdHoc) {
            document.querySelectorAll('#prd-adhoc-lotti-list [data-idx]').forEach(div => {
                const mpSel = div.querySelector('.adhoc-mp-sel');
                const lottoInput = div.querySelector('.adhoc-lotto-val');
                const mpId = mpSel.value;
                const mpNome = mpSel.options[mpSel.selectedIndex]?.dataset.nome || '';
                const lotto = lottoInput.value.trim();
                if (mpId && lotto) lottiMP.push({ mpId, mpNome, lottoId: '', lotto });
            });
        }

        const editId = document.getElementById('prd-form-id').value;

        if (editId) {
            const p = this.getProduzione(editId);
            if (p) {
                p.ricettaId = ricettaId;
                p.ricettaNome = ricettaNome;
                p.isAdHoc = isAdHoc;
                p.tipo = isAdHoc ? 'prodotto' : this.getTipo(ricettaId);
                p.categoria = isAdHoc ? 'Gastronomia' : (RicetteModule.getRicetta(ricettaId)?.categoria || '');
                p.data = data;
                p.scadenza = scadenza;
                p.quantita = parseFloat(quantita) || 0;
                p.unita = unita;
                p.operatore = operatore;
                p.note = note;
                p.congelato = congelato;
                p.lottiMP = lottiMP;
                p.lottiSML = lottiSML;
                p.updatedAt = new Date().toISOString();
                this.save();
                Utils.showToast(`✅ Produzione aggiornata`, 'success');
            }
            this.closeModal();
            this.render();
        } else {
            if (!isAdHoc) {
                // Controlla SML bloccanti PRIMA di salvare
                const ricettaCheck = RicetteModule.getRicetta(ricettaId);
                const problemiBloccanti = [];

                if (ricettaCheck?.ingredienti) {
                    for (const ing of ricettaCheck.ingredienti) {
                        if (ing.tipo === 'sml') {
                            const ricettaSml = RicetteModule.getRicetta(ing.refId);
                            const isBase = ricettaSml?.categoria === 'Semilavorato base';
                            if (isBase) {
                                const attiviSml = this.getAttiviPerRicetta(ing.refId);
                                if (attiviSml.length === 0) {
                                    problemiBloccanti.push({
                                        tipo: 'sml_bloccante',
                                        nome: ing.refNome,
                                        refId: ing.refId,
                                        ricettaId: ing.refId
                                    });
                                }
                            }
                            const subProblemi = [];
                            this.controllaSml(ricettaSml, ing.refNome, subProblemi, new Set([ricettaId]), data);
                            subProblemi.filter(p => p.tipo === 'sml_bloccante' || p.tipo === 'mp_no_lotti')
                                .forEach(p => problemiBloccanti.push(p));
                        } else if (ing.tipo === 'mp') {
                            const mpObj = MateriePrimeModule.getMP(ing.refId);
                            if (mpObj?.noTraccia) continue;
                            const lottiDisponibili = MateriePrimeModule.getLottiPerProduzione(ing.refId, data);
                            if (lottiDisponibili.length === 0) {
                                problemiBloccanti.push({
                                    tipo: 'mp_no_lotti',
                                    nome: ing.refNome,
                                    refId: ing.refId
                                });
                            }
                        }
                    }
                }

                if (problemiBloccanti.length > 0) {
                    const primo = problemiBloccanti[0];
                    if (primo.tipo === 'mp_no_lotti') {
                        Utils.showToast(`⛔ Aggiungi prima il carico: ${primo.nome.split(' (per')[0]}`, 'warning');
                        this._pendingProduzione = { ricettaId, data, scadenza, quantita, unita, operatore, note, congelato };
                        this.closeModal();
                        MateriePrimeModule.openModalCarico(primo.refId);
                    } else if (primo.tipo === 'sml_bloccante') {
                        Utils.showToast(`⛔ Produci prima: ${primo.nome.split(' (per')[0]}`, 'warning');
                        this._pendingProduzione = { ricettaId, data, scadenza, quantita, unita, operatore, note, congelato };
                        this.closeModal();
                        this.openModalNewPerSml(primo.ricettaId);
                    }
                    return;
                }
            }

            const prod = this.addProduzione({
                ricettaId, ricettaNome, data, scadenza,
                quantita, unita, operatore, note, lottiMP, lottiSML, congelato,
                isAdHoc
            });

            // Scarico automatico MP (solo se ricetta normale)
            if (!isAdHoc) {
                const ricetta = RicetteModule.getRicetta(ricettaId);
                const mpIng = ricetta?.ingredienti?.filter(i => i.tipo === 'mp') || [];
                const avvisi = [];

                mpIng.forEach(ing => {
                    if (!ing.quantita || !ricetta.resa) {
                        avvisi.push(`${ing.refNome}: quantità non definita in ricetta`);
                        return;
                    }
                    const qtaDaScaricare = (parseFloat(quantita) * parseFloat(ing.quantita)) / parseFloat(ricetta.resa);
                    const risultato = MateriePrimeModule.scaricoMP(ing.refId, qtaDaScaricare);
                    if (risultato.mancante > 0) {
                        avvisi.push(`${ing.refNome}: scorta insufficiente (mancano ${risultato.mancante} ${ing.unita || 'kg'})`);
                    }
                });

                MateriePrimeModule.save();
                MateriePrimeModule.render();

                if (avvisi.length > 0) {
                    Utils.showToast(`⚠️ Scorte: ${avvisi[0]}`, 'warning');
                }
            }

            Utils.showToast(`✅ ${ricettaNome} · Lotto: ${prod.lotto}`, 'success');
            this.closeModal();
            this.render();

            // Se c'era una produzione in sospeso, riapri il modal
            if (this._pendingProduzione) {
                const p = this._pendingProduzione;
                this._pendingProduzione = null;
                setTimeout(() => {
                    this.openModalNew();
                    setTimeout(() => {
                        const sel = document.getElementById('prd-form-ricetta');
                        for (let opt of sel.options) {
                            if (opt.value === p.ricettaId) { opt.selected = true; this.onRicettaChange(); break; }
                        }
                        document.getElementById('prd-form-data').value = p.data;
                        document.getElementById('prd-form-scadenza').value = p.scadenza || '';
                        document.getElementById('prd-form-quantita').value = p.quantita || '';
                        document.getElementById('prd-form-unita').value = p.unita || 'kg';
                        document.getElementById('prd-form-operatore').value = p.operatore || '';
                        document.getElementById('prd-form-note').value = p.note || '';
                        document.getElementById('prd-form-congelato').checked = p.congelato || false;
                    }, 150);
                }, 300);
                return;
            }

            if (!this._scongelaRef) {
                this.verificaSemilavoratiNecessari(prod);
            } else {
                this._scongelaRef = null;
            }
        }
    },

    mostraPopupConsumo(prod) {
        const smlUsati = prod.lottiSML || [];
        if (smlUsati.length === 0) return;

        let html = `
    <div class="modal-overlay" id="consumo-modal">
        <div class="modal-box">
            <div class="bg-orange-700 text-white p-5 rounded-t-xl">
                <h3 class="text-xl font-bold">🥩 Semilavorati utilizzati</h3>
                <p class="text-sm opacity-80">Quali semilavorati sono esauriti?</p>
            </div>
            <div class="p-5 space-y-3">`;

        smlUsati.forEach(sml => {
            const prodSML = this.produzioni.find(p => p.id === sml.smlRefId);
            const rimanente = prodSML?.rimanente ?? prodSML?.quantita ?? '';
            html += `
        <div class="border rounded-lg p-3 bg-orange-50">
            <div class="flex items-center gap-2 mb-2">
                <input type="checkbox" id="consumo-${sml.smlRefId}"
                    class="w-4 h-4" value="${sml.smlRefId}">
                <label for="consumo-${sml.smlRefId}" class="font-semibold text-gray-800">
                    ${sml.smlNome} · <span class="font-mono text-orange-700">${sml.lotto}</span>
                </label>
            </div>
            <div class="ml-6">
                <label class="text-xs text-gray-500">Quantità rimanente (opz.)</label>
                <div class="flex gap-2 mt-1">
                    <input type="number" id="rim-${sml.smlRefId}"
                        step="0.1" min="0"
                        placeholder="${rimanente || 'es. 2'}"
                        class="w-32 px-3 py-1.5 border rounded-lg text-sm">
                    <span class="text-sm text-gray-400 self-center">
                        ${prodSML?.unita || 'kg'}
                    </span>
                </div>
            </div>
        </div>`;
        });

        html += `
            <div class="flex gap-3 pt-2">
                <button onclick="ProduzioneModule.chiudiConsumo()"
                    class="flex-1 bg-gray-200 text-gray-700 py-2.5 rounded-lg font-semibold hover:bg-gray-300">
                    Salta
                </button>
                <button onclick="ProduzioneModule.salvaConsumo('${prod.id}')"
                    class="flex-1 bg-orange-700 text-white py-2.5 rounded-lg font-semibold hover:bg-orange-800">
                    ✓ Conferma
                </button>
            </div>
            </div>
        </div>
    </div>`;

        document.body.insertAdjacentHTML('beforeend', html);
    },

    verificaSemilavoratiNecessari(prod) {
        const ricetta = RicetteModule.getRicetta(prod.ricettaId);
        if (!ricetta || !ricetta.ingredienti) {
            this.mostraPopupConsumo(prod);
            return;
        }

        const smlNecessari = ricetta.ingredienti.filter(i => i.tipo === 'sml');
        if (smlNecessari.length === 0) {
            this.mostraPopupConsumo(prod);
            return;
        }

        const mancanti = [];

        smlNecessari.forEach(ing => {
            const esiste = this.produzioni.find(p =>
                p.ricettaId === ing.refId && !p.archiviato
            );
            if (!esiste) {
                let qtaSuggerita = ing.quantita || 0;
                if (ricetta.resa && prod.quantita && ing.quantita) {
                    qtaSuggerita = (parseFloat(prod.quantita) * parseFloat(ing.quantita)) / parseFloat(ricetta.resa);
                    qtaSuggerita = Math.round(qtaSuggerita * 10) / 10;
                }
                mancanti.push({ ...ing, qtaSuggerita });
            }
        });

        if (mancanti.length === 0) {
            this.mostraPopupConsumo(prod);
            return;
        }

        let html = `
    <div class="modal-overlay" id="sml-mancanti-modal" data-prod-id="${prod.id}">
        <div class="modal-box">
            <div class="bg-blue-700 text-white p-5 rounded-t-xl">
                <h3 class="text-xl font-bold">⚠️ Semilavorati non registrati</h3>
                <p class="text-sm opacity-80">Per produrre ${prod.ricettaNome} servono questi semilavorati</p>
            </div>
            <div class="p-5 space-y-3">`;

        mancanti.forEach(sml => {
            html += `
        <div class="border rounded-lg p-3 bg-blue-50">
            <div class="flex items-center gap-2 mb-2">
                <input type="checkbox" id="sml-add-${sml.refId}"
                    class="w-4 h-4" checked>
                <label for="sml-add-${sml.refId}" class="font-semibold text-gray-800">
                    ${sml.refNome}
                </label>
            </div>
            <div class="ml-6 flex gap-2 items-center">
                <input type="number" id="sml-qta-${sml.refId}"
                    value="${sml.qtaSuggerita || ''}"
                    step="0.1" min="0"
                    placeholder="Quantità"
                    class="w-28 px-3 py-1.5 border rounded-lg text-sm">
                <span class="text-sm text-gray-400">${sml.unita || 'kg'}</span>
                ${sml.qtaSuggerita ? `<span class="text-xs text-blue-500">(suggerito)</span>` : ''}
            </div>
        </div>`;
        });

        html += `
            <div class="flex gap-3 pt-2">
                <button onclick="ProduzioneModule.chiudiSmlMancanti()"
                    class="flex-1 bg-gray-200 text-gray-700 py-2.5 rounded-lg font-semibold hover:bg-gray-300">
                    Salta
                </button>
                <button onclick="ProduzioneModule.aggiungiSmlMancanti('${prod.id}')"
                    class="flex-1 bg-blue-700 text-white py-2.5 rounded-lg font-semibold hover:bg-blue-800">
                    ✓ Aggiungi
                </button>
            </div>
            </div>
        </div>
    </div>`;

        document.body.insertAdjacentHTML('beforeend', html);
    },

    chiudiSmlMancanti() {
        const modal = document.getElementById('sml-mancanti-modal');
        const prodId = modal?.dataset.prodId;
        modal?.remove();
        if (prodId) {
            const prod = this.getProduzione(prodId);
            if (prod) this.mostraPopupConsumo(prod);
        }
    },

    aggiungiSmlMancanti(prodId) {
        const prod = this.getProduzione(prodId);
        if (!prod) return;

        const ricetta = RicetteModule.getRicetta(prod.ricettaId);
        const smlNecessari = ricetta?.ingredienti?.filter(i => i.tipo === 'sml') || [];

        if (!prod.lottiSML) prod.lottiSML = [];

        // Prima controlla se ci sono SML bloccanti
        const tuttiBloccanti = [];
        smlNecessari.forEach(ing => {
            const checkbox = document.getElementById(`sml-add-${ing.refId}`);
            if (!checkbox?.checked) return;
            const ricettaSml = RicetteModule.getRicetta(ing.refId);
            if (!ricettaSml) return;

            const problemiSml = [];
            this.controllaSml(ricettaSml, ing.refNome, problemiSml, new Set([ing.refId]));
            const bloccanti = problemiSml.filter(p => p.tipo === 'sml_bloccante');
            tuttiBloccanti.push(...bloccanti);
        });

        if (tuttiBloccanti.length > 0) {
            document.getElementById('sml-mancanti-modal')?.remove();
            const primo = tuttiBloccanti[0];
            Utils.showToast(`⛔ Produci prima: ${primo.nome.split(' (per')[0]}`, 'warning');
            this.openModalNewPerSml(primo.ricettaId);
            return;
        }

        // Procedi con la creazione
        smlNecessari.forEach(ing => {
            const checkbox = document.getElementById(`sml-add-${ing.refId}`);
            const qtaInput = document.getElementById(`sml-qta-${ing.refId}`);
            if (!checkbox?.checked) return;

            const ricettaSml = RicetteModule.getRicetta(ing.refId);
            if (!ricettaSml) return;

            const lottiMPAuto = [];
            if (ricettaSml.ingredienti) {
                ricettaSml.ingredienti.filter(i => i.tipo === 'mp').forEach(mpIng => {
                    const lottiDisponibili = MateriePrimeModule.getLottiPerProduzione(mpIng.refId);
                    if (lottiDisponibili.length > 0) {
                        const lottoPriority = lottiDisponibili[0];
                        lottiMPAuto.push({
                            mpId: mpIng.refId,
                            mpNome: mpIng.refNome,
                            lottoId: lottoPriority.id,
                            lotto: lottoPriority.lotto
                        });
                    }
                });
            }

            const lottiSMLAuto = [];
            if (ricettaSml.ingredienti) {
                ricettaSml.ingredienti.filter(i => i.tipo === 'sml').forEach(smlIng => {
                    const attiviSml = this.getAttiviPerRicetta(smlIng.refId);
                    if (attiviSml.length > 0) {
                        const smlPriority = attiviSml[0];
                        lottiSMLAuto.push({
                            smlId: smlIng.refId,
                            smlNome: smlIng.refNome,
                            smlRefId: smlPriority.id,
                            lotto: smlPriority.lotto
                        });
                    } else {
                        Utils.showToast(
                            `⚠️ ${smlIng.refNome} non trovato per ${ing.refNome} — aggiungilo manualmente`,
                            'warning'
                        );
                    }
                });
            }

            const nuovaProd = this.addProduzione({
                ricettaId: ing.refId,
                ricettaNome: ing.refNome,
                data: prod.data,
                scadenza: ricettaSml.shelfLife
                    ? this.calcolaScadenza(prod.data, ricettaSml.shelfLife)
                    : '',
                quantita: parseFloat(qtaInput?.value) || 0,
                unita: ing.unita || 'kg',
                operatore: prod.operatore,
                note: `Aggiunto automaticamente per ${prod.ricettaNome}`,
                lottiMP: lottiMPAuto,
                lottiSML: lottiSMLAuto,
                _autoCreato: true
            });

            prod.lottiSML.push({
                smlId: ing.refId,
                smlNome: ing.refNome,
                smlRefId: nuovaProd.id,
                lotto: nuovaProd.lotto
            });

            nuovaProd.archiviato = true;
            nuovaProd.archiviatoAt = new Date().toISOString();
            delete nuovaProd._autoCreato;
        });

        // Scarico automatico SML dalla ricetta principale
        const ricettaProd = RicetteModule.getRicetta(prod.ricettaId);
        if (ricettaProd?.resa && prod.quantita) {
            const smlIngProd = ricettaProd.ingredienti?.filter(i => i.tipo === 'sml') || [];
            smlIngProd.forEach(ing => {
                if (!ing.quantita) return;
                const qtaDaScaricare = (parseFloat(prod.quantita) * parseFloat(ing.quantita)) / parseFloat(ricettaProd.resa);
                const lottoProd = prod.lottiSML?.find(l => l.smlId === ing.refId);
                if (!lottoProd) return;
                const smlProd = this.produzioni.find(p => p.id === lottoProd.smlRefId);
                if (!smlProd) return;
                const disponibile = smlProd.rimanente ?? smlProd.quantita ?? 0;
                const nuovoRimanente = Math.round((disponibile - qtaDaScaricare) * 100) / 100;
                smlProd.rimanente = Math.max(0, nuovoRimanente);
                if (nuovoRimanente <= 0) {
                    smlProd.archiviato = true;
                    smlProd.archiviatoAt = new Date().toISOString();
                }
            });
        }

        this.save();
        this.render();
        document.getElementById('sml-mancanti-modal')?.remove();
        Utils.showToast('✅ Semilavorati aggiunti e registrati', 'success');
    },

    chiudiConsumo() {
        document.getElementById('consumo-modal')?.remove();
    },

    salvaConsumo(prodId) {
        const prod = this.getProduzione(prodId);
        if (!prod) return;

        const smlUsati = prod.lottiSML || [];

        smlUsati.forEach(sml => {
            const checkbox = document.getElementById(`consumo-${sml.smlRefId}`);
            const rimInput = document.getElementById(`rim-${sml.smlRefId}`);
            const prodSML = this.produzioni.find(p => p.id === sml.smlRefId);
            if (!prodSML) return;

            if (checkbox?.checked) {
                prodSML.archiviato = true;
                prodSML.archiviatoAt = new Date().toISOString();
                prodSML.rimanente = 0;
                delete prodSML._autoCreato;
                if (prodSML.congelato) {
                    prodSML.dataScongelo = new Date().toLocaleDateString('en-CA');
                }
            } else {
                if (rimInput?.value !== '') {
                    prodSML.rimanente = parseFloat(rimInput.value);
                }
            }
        });

        this.save();
        this.render();
        this.chiudiConsumo();
        Utils.showToast('✅ Consumo registrato', 'success');
    },

    apriCongelaAvanzo(id) {
        const p = this.getProduzione(id);
        if (!p) return;
        const disponibile = p.rimanente ?? p.quantita ?? 0;
        if (disponibile <= 0) {
            Utils.showToast('⚠️ Nessun avanzo disponibile', 'warning');
            return;
        }

        const html = `
    <div class="modal-overlay" id="congela-modal">
        <div class="modal-box">
            <div class="bg-blue-700 text-white p-5 rounded-t-xl">
                <h3 class="text-xl font-bold">❄️ Congela avanzo</h3>
                <p class="text-sm opacity-80">${p.ricettaNome} · ${p.lotto}</p>
            </div>
            <div class="p-5 space-y-4">
                <div class="bg-gray-50 rounded-lg p-3 text-sm text-gray-600">
                    Disponibile: <strong>${disponibile} ${p.unita}</strong>
                </div>
                <div>
                    <label class="block text-sm font-semibold mb-1 text-gray-700">
                        Data abbattimento
                    </label>
                    <input type="date" id="congela-data"
                        value="${new Date().toLocaleDateString('en-CA')}"
                        class="w-full px-4 py-2 border rounded-lg">
                </div>
                <div>
                    <label class="block text-sm font-semibold mb-1 text-gray-700">
                        Quantità da congelare
                    </label>
                    <div class="flex gap-2 items-center">
                        <input type="number" id="congela-qta" step="0.1" min="0.1"
                            max="${disponibile}"
                            placeholder="Es. 1"
                            class="flex-1 px-4 py-2 border rounded-lg">
                        <span class="text-gray-500">${p.unita}</span>
                    </div>
                    <p class="text-xs text-gray-400 mt-1">
                        La quantità rimanente nella produzione originale sarà ridotta automaticamente
                    </p>
                </div>
                <div class="flex gap-3 pt-2">
                    <button onclick="ProduzioneModule.chiudiCongelaAvanzo()"
                        class="flex-1 bg-gray-200 text-gray-700 py-2.5 rounded-lg font-semibold hover:bg-gray-300">
                        Annulla
                    </button>
                    <button onclick="ProduzioneModule.confermaCongelaAvanzo('${id}')"
                        class="flex-1 bg-blue-700 text-white py-2.5 rounded-lg font-semibold hover:bg-blue-800">
                        ❄️ Congela
                    </button>
                </div>
            </div>
        </div>
    </div>`;

        document.body.insertAdjacentHTML('beforeend', html);
    },

    chiudiCongelaAvanzo() {
        document.getElementById('congela-modal')?.remove();
    },

    apriScongela(id) {
        const p = this.getProduzione(id);
        if (!p || !p.congelato) return;
        const disponibile = p.rimanente ?? p.quantita ?? 0;

        const html = `
    <div class="modal-overlay" id="scongela-modal">
        <div class="modal-box">
            <div class="bg-amber-700 text-white p-5 rounded-t-xl">
                <h3 class="text-xl font-bold">🌡️ Scongela</h3>
                <p class="text-sm opacity-80">${p.ricettaNome} · ${p.lotto}</p>
            </div>
            <div class="p-5 space-y-4">
                <div class="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-700">
                    ❄️ Abbattuto il ${this.fmtData(p.dataAbbattimento || p.data)}
                    ${p.lottoOrigineNum ? `· da lotto ${p.lottoOrigineNum}` : ''}
                    <br>Disponibile: <strong>${disponibile} ${p.unita}</strong>
                </div>
                <div>
                    <label class="block text-sm font-semibold mb-1 text-gray-700">
                        Quantità da scongelare
                    </label>
                    <div class="flex gap-2 items-center">
                        <input type="number" id="scongela-qta" step="0.1" min="0.1"
                            max="${disponibile}"
                            value="${disponibile}"
                            class="flex-1 px-4 py-2 border rounded-lg">
                        <span class="text-gray-500">${p.unita}</span>
                    </div>
                </div>
                <div>
                    <label class="block text-sm font-semibold mb-1 text-gray-700">
                        Data scongelo
                    </label>
                    <input type="date" id="scongela-data"
                        value="${new Date().toLocaleDateString('en-CA')}"
                        class="w-full px-4 py-2 border rounded-lg">
                </div>
                <div class="flex gap-3 pt-2">
                    <button onclick="ProduzioneModule.chiudiScongela()"
                        class="flex-1 bg-gray-200 text-gray-700 py-2.5 rounded-lg font-semibold hover:bg-gray-300">
                        Annulla
                    </button>
                    <button onclick="ProduzioneModule.confermaScongela('${id}')"
                        class="flex-1 bg-amber-700 text-white py-2.5 rounded-lg font-semibold hover:bg-amber-800">
                        🌡️ Scongela e registra produzione
                    </button>
                </div>
            </div>
        </div>
    </div>`;

        document.body.insertAdjacentHTML('beforeend', html);
    },

    chiudiScongela() {
        document.getElementById('scongela-modal')?.remove();
    },

    confermaScongela(id) {
        const p = this.getProduzione(id);
        if (!p) return;

        const qtaScongelare = parseFloat(document.getElementById('scongela-qta').value);
        const dataScongelo = document.getElementById('scongela-data').value;
        const disponibile = p.rimanente ?? p.quantita ?? 0;

        if (!qtaScongelare || qtaScongelare <= 0) {
            Utils.showToast('⚠️ Inserisci una quantità valida', 'warning');
            return;
        }
        if (qtaScongelare > disponibile) {
            Utils.showToast(`⚠️ Hai solo ${disponibile} ${p.unita} disponibili`, 'warning');
            return;
        }

        // Riduce o archivia il lotto congelato
        const nuovoRimanente = Math.round((disponibile - qtaScongelare) * 100) / 100;
        p.rimanente = nuovoRimanente;
        if (nuovoRimanente <= 0) {
            p.archiviato = true;
            p.archiviatoAt = new Date().toISOString();
            p.dataScongelo = dataScongelo;
        }

        this.save();
        this.chiudiScongela();

        // Apre modal nuova produzione con il lotto scongelato preselezionato
        // Salva riferimento al lotto scongelato per precompilare il modal
        this._scongelaRef = {
            prodId: id,
            prodLotto: p.lotto,
            prodNome: p.ricettaNome,
            prodRicettaId: p.ricettaId,
            qtaScongelo: qtaScongelare,
            unita: p.unita,
            dataScongelo: dataScongelo
        };

        this.openModalNew();
        Utils.showToast(`✅ ${qtaScongelare} ${p.unita} di ${p.ricettaNome} scongelati — seleziona la ricetta da produrre`, 'info');
    },

    confermaCongelaAvanzo(id) {
        const p = this.getProduzione(id);
        if (!p) return;

        const qtaCongelare = parseFloat(document.getElementById('congela-qta').value);
        const dataAbbattimento = document.getElementById('congela-data').value;
        const disponibile = p.rimanente ?? p.quantita ?? 0;

        if (!qtaCongelare || qtaCongelare <= 0) {
            Utils.showToast('⚠️ Inserisci una quantità valida', 'warning');
            return;
        }
        if (qtaCongelare > disponibile) {
            Utils.showToast(`⚠️ Hai solo ${disponibile} ${p.unita} disponibili`, 'warning');
            return;
        }

        // Riduce produzione originale
        const nuovoRimanente = Math.round((disponibile - qtaCongelare) * 100) / 100;
        p.rimanente = nuovoRimanente;
        if (nuovoRimanente <= 0) {
            p.archiviato = true;
            p.archiviatoAt = new Date().toISOString();
        }

        // Crea nuova produzione congelata con tracciabilità
        const nuovaProd = this.addProduzione({
            ricettaId: p.ricettaId,
            ricettaNome: p.ricettaNome,
            data: p.data,
            scadenza: p.scadenza,
            quantita: qtaCongelare,
            unita: p.unita,
            operatore: p.operatore,
            note: `Avanzo congelato da lotto ${p.lotto}`,
            lottiMP: p.lottiMP,
            lottiSML: p.lottiSML,
            congelato: true,
            dataAbbattimento: dataAbbattimento,
            lottoOrigineId: p.id,
            lottoOrigineNum: p.lotto
        });

        this.save();
        this.render();
        this.chiudiCongelaAvanzo();
        Utils.showToast(`✅ Avanzo congelato: ${qtaCongelare} ${p.unita} ❄️ · Lotto: ${nuovaProd.lotto}`, 'success');
    },

    openModalEdit(id) {
        const p = this.getProduzione(id);
        if (!p) return;

        this.openModalNew();

        const sel = document.getElementById('prd-form-ricetta');
        for (let opt of sel.options) {
            if (opt.value === p.ricettaId) { opt.selected = true; break; }
        }

        document.getElementById('prd-form-data').value = p.data;
        document.getElementById('prd-form-scadenza').value = p.scadenza || '';
        document.getElementById('prd-form-quantita').value = p.quantita || '';
        document.getElementById('prd-form-unita').value = p.unita || 'kg';
        document.getElementById('prd-form-operatore').value = p.operatore || '';
        document.getElementById('prd-form-note').value = p.note || '';
        document.getElementById('prd-form-congelato').checked = p.congelato || false;
        document.getElementById('prd-form-id').value = id;
        document.querySelector('#prd-modal h3').textContent = '✏️ Modifica Produzione';

        const ricetta = RicetteModule.getRicetta(p.ricettaId);
        if (ricetta) {
            this.renderLottiMP(ricetta);
            this.renderLottiSML(ricetta);
        }
    },

    // ==========================================
    // MODAL: TRACCIABILITÀ
    // ==========================================

    openModalTracciabilita(id) {
        const p = this.getProduzione(id);
        if (!p) return;

        const el = document.getElementById('traccia-content');
        const scadAvv = p.scadenza ? this.avvisoScadenza(p.scadenza) : '';

        el.innerHTML = `
            <div class="space-y-4">
                <div class="bg-green-50 border border-green-200 rounded-lg p-4">
                    <p class="text-xs font-bold text-green-700 uppercase mb-2">🍳 Produzione</p>
                    <p class="font-bold text-lg text-gray-800">${p.ricettaNome}</p>
                    <p class="font-mono text-green-800 font-bold">${p.lotto}</p>
                    <p class="text-sm text-gray-600 mt-1">
                        📅 ${this.fmtData(p.data)}
                        ${p.quantita ? ` · ${p.quantita} ${p.unita}` : ''}
                        ${p.operatore ? ` · 👤 ${p.operatore}` : ''}
                    </p>
                    ${p.scadenza ? `<p class="text-sm text-gray-600">⏱ Scadenza: ${this.fmtData(p.scadenza)} ${scadAvv}</p>` : ''}
                    ${p.note ? `<p class="text-xs text-gray-400 italic mt-1">${p.note}</p>` : ''}
                </div>

                ${p.lottiSML?.length > 0 ? `
                <div class="bg-orange-50 border border-orange-200 rounded-lg p-4">
                    <p class="text-xs font-bold text-orange-700 uppercase mb-2">🥩 Semilavorati Utilizzati</p>
                    ${p.lottiSML.map(s => {
            const smlDet = this.produzioni.find(x => x.lotto === s.lotto)
                || this.produzioni.find(x => x.id === s.smlRefId);
            return `
                        <div class="mb-2 pb-2 border-b border-orange-100 last:border-0">
                            <p class="font-medium text-gray-800">${s.smlNome}</p>
                            <p class="font-mono text-orange-800 text-sm">${s.lotto}</p>
                            ${smlDet ? `
                            <p class="text-xs text-gray-500">
                                Prodotto il ${this.fmtData(smlDet.data)}
                                ${smlDet.scadenza ? ` · scad. ${this.fmtData(smlDet.scadenza)}` : ''}
                            </p>
                            ${smlDet.lottiMP?.length > 0 ? `
                            <div class="mt-1 pl-2 border-l-2 border-orange-200">
                                <p class="text-xs text-gray-400 mb-1">MP usate:</p>
                                ${smlDet.lottiMP.map(lu =>
                `<p class="text-xs font-mono text-gray-500">${lu.mpNome}: ${lu.lotto}</p>`
            ).join('')}
                            </div>` : ''}` : ''}
                        </div>`;
        }).join('')}
                </div>` : ''}

                ${p.lottiMP?.length > 0 ? `
                <div class="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <p class="text-xs font-bold text-blue-700 uppercase mb-2">📦 Materie Prime Utilizzate</p>
                    ${p.lottiMP.map(m => `
                        <div class="flex justify-between items-center mb-1">
                            <span class="text-sm text-gray-700">${m.mpNome}</span>
                            <span class="font-mono text-blue-800 text-sm font-bold">${m.lotto}</span>
                        </div>`).join('')}
                </div>` : ''}
            </div>`;

        document.getElementById('traccia-modal').classList.remove('hidden');
    },

    closeModalTracciabilita() {
        document.getElementById('traccia-modal').classList.add('hidden');
    },

    toggleAdHoc() {
        const isAdHoc = document.getElementById('prd-form-is-adhoc').value === '1';
        const sel = document.getElementById('prd-form-ricetta');
        const adhocFields = document.getElementById('prd-adhoc-fields');
        const toggle = document.getElementById('prd-adhoc-toggle');
        const lottiMP = document.getElementById('prd-lotti-mp');
        const lottiSML = document.getElementById('prd-lotti-sml');

        if (!isAdHoc) {
            // Attiva modalità ad hoc
            document.getElementById('prd-form-is-adhoc').value = '1';
            sel.disabled = true;
            sel.value = '';
            adhocFields.classList.remove('hidden');
            toggle.textContent = '← Usa una ricetta esistente';
            toggle.classList.replace('text-blue-600', 'text-gray-500');
            lottiMP.innerHTML = '';
            lottiSML.innerHTML = '';
            this.renderAdHocLotti();
        } else {
            // Torna al ricettario
            document.getElementById('prd-form-is-adhoc').value = '0';
            sel.disabled = false;
            adhocFields.classList.add('hidden');
            document.getElementById('prd-form-nome-adhoc').value = '';
            document.getElementById('prd-adhoc-lotti').innerHTML = '';
            toggle.textContent = '✏️ Produzione senza ricetta (gastronomia ad hoc)';
            toggle.classList.replace('text-gray-500', 'text-blue-600');
        }
    },

    renderAdHocLotti() {
        // Permette di aggiungere ingredienti/lotti manualmente
        const container = document.getElementById('prd-adhoc-lotti');
        container.innerHTML = `
        <div class="border rounded-lg p-3 bg-amber-50">
            <p class="text-xs font-bold text-amber-700 uppercase mb-2">
                🏷 Ingredienti usati (opzionale)
            </p>
            <div id="prd-adhoc-lotti-list"></div>
            <button type="button" onclick="ProduzioneModule.addAdHocLotto()"
                class="mt-2 text-xs text-amber-700 underline">
                + Aggiungi ingrediente
            </button>
        </div>`;
    },

    addAdHocLotto() {
        const list = document.getElementById('prd-adhoc-lotti-list');
        const idx = list.children.length;
        const mpOptions = MateriePrimeModule.materie_prime
            .map(mp => `<option value="${mp.id}" data-nome="${mp.nome}">${mp.nome}</option>`)
            .join('');
        const div = document.createElement('div');
        div.className = 'flex gap-2 mb-2 items-center';
        div.dataset.idx = idx;
        div.innerHTML = `
        <select class="flex-1 px-2 py-1 border rounded text-sm adhoc-mp-sel"
            onchange="ProduzioneModule.onAdHocMPChange(this)">
            <option value="">— Materia prima —</option>
            ${mpOptions}
        </select>
        <input type="text" placeholder="Lotto" class="w-28 px-2 py-1 border rounded text-sm adhoc-lotto-val">
        <button type="button" onclick="this.parentElement.remove()"
            class="text-red-400 hover:text-red-600 text-lg leading-none">×</button>`;
        list.appendChild(div);
    },

    onAdHocMPChange(sel) {
        const mpId = sel.value;
        if (!mpId) return;
        const lottiInput = sel.parentElement.querySelector('.adhoc-lotto-val');
        const lottiAttivi = MateriePrimeModule.getLottiAttivi(mpId);
        if (lottiAttivi.length > 0) {
            lottiInput.value = lottiAttivi[0].lotto; // precompila con FIFO
        }
    },

    stampaRegistro() {
        const filtroRange = this._filtroRange || 'settimana';
        const filtroData = document.getElementById('prd-filtro-data')?.value;

        const oggi = new Date();
        oggi.setHours(0, 0, 0, 0);

        let lista = [...this.produzioni];

        if (filtroData) {
            lista = lista.filter(p => p.data === filtroData);
        } else if (filtroRange === 'oggi') {
            const oggiStr = new Date().toLocaleDateString('en-CA');
            lista = lista.filter(p => p.data === oggiStr);
        } else if (filtroRange === 'settimana') {
            const settimanaFa = new Date();
            settimanaFa.setDate(settimanaFa.getDate() - 7);
            lista = lista.filter(p => new Date(p.data) >= settimanaFa);
        }

        const dataStampa = new Date().toLocaleDateString('it-IT', {
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit'
        });

        const periodoLabel = filtroData
            ? `Data: ${this.fmtData(filtroData)}`
            : filtroRange === 'oggi'
                ? `Data: ${this.fmtData(new Date().toLocaleDateString('en-CA'))}`
                : filtroRange === 'tutto'
                    ? 'Periodo: tutto lo storico'
                    : 'Periodo: ultimi 7 giorni';

        const includiArchiviati = !filtroData && filtroRange === 'tutto';

        const semilavorati = lista.filter(p =>
            (p.tipo === 'base' || p.tipo === 'composto' || p.tipo === 'sfoglia')
            && (includiArchiviati || !p.archiviato)
        );
        const finiti = lista.filter(p =>
            p.tipo === 'prodotto' &&
            (includiArchiviati || !p.archiviato)
        );

        const buildAlbero = (prod, livello = 0, visited = new Set()) => {
            if (livello > 5) return '';
            if (visited.has(prod.id)) return '';
            visited.add(prod.id);

            let html = '';
            const indent = livello * 20;

            if (prod.lottiSML?.length > 0) {
                prod.lottiSML.forEach(s => {
                    const smlDet = this.produzioni.find(x => x.lotto === s.lotto && x.id !== prod.id);
                    html += `<tr style="background:${livello === 0 ? '#fff7ed' : '#fefce8'}">
                <td colspan="5" style="padding:3px 8px 3px ${indent + 24}px;font-size:12px">
                    <span style="color:#92400e;font-weight:600">↳ 🥩 ${s.smlNome}</span>
                    <span style="font-family:monospace;color:#b45309;margin-left:8px">${s.lotto}</span>
                    ${smlDet?.scadenza ? `<span style="color:#9ca3af;margin-left:8px;font-size:11px">scad. ${this.fmtData(smlDet.scadenza)}</span>` : ''}
                </td>
            </tr>`;
                    if (smlDet) html += buildAlbero(smlDet, livello + 1, visited);
                });
            }

            const mpList = prod.lottiMP?.length > 0 ? prod.lottiMP : (prod.lottiUsati || []);
            if (mpList.length > 0) {
                mpList.forEach(mp => {
                    html += `<tr style="background:${livello === 0 ? '#fff7ed' : '#fefce8'}">
                <td colspan="5" style="padding:3px 8px 3px ${Math.min(indent + 24, 80)}px;font-size:12px">
                    <span style="color:#92400e;font-weight:600">↳ 📦 ${mp.mpNome}</span>
                    <span style="font-family:monospace;color:#b45309;margin-left:8px">${mp.lotto}</span>
                </td>
            </tr>`;
                });
            }
            return html;
        };

        const renderSezione = (titolo, colore, items) => {
            if (items.length === 0) return '';
            const righe = items.map(p => {
                const tipoLabel = p.tipo === 'sfoglia' ? 'Sfoglia'
                    : p.tipo === 'base' ? 'Semilavorato base'
                        : p.tipo === 'composto' ? 'Semilavorato composto'
                            : 'Prodotto finito';

                return `
                <tr style="border-top:2px solid #d1d5db;background:#f9fafb">
                    <td style="padding:10px 8px;vertical-align:top">
                        <div style="font-weight:700;font-size:14px">${p.ricettaNome}</div>
                        <div style="font-size:11px;color:${colore};margin-top:2px;font-weight:600">${tipoLabel}</div>
                        ${p.archiviato ? `<div style="font-size:10px;color:#9ca3af;margin-top:1px">archiviato</div>` : ''}
                    </td>
                    <td style="padding:10px 8px;vertical-align:top;font-family:monospace;font-weight:700;font-size:13px">${p.lotto}</td>
                    <td style="padding:10px 8px;vertical-align:top;font-size:13px">${this.fmtData(p.data)}</td>
                    <td style="padding:10px 8px;vertical-align:top;font-size:13px">${p.scadenza ? this.fmtData(p.scadenza) : '–'}</td>
                    <td style="padding:10px 8px;vertical-align:top;font-size:13px">${p.quantita ? `${p.quantita} ${p.unita}` : '–'}</td>
                </tr>
                ${buildAlbero(p)}`;
            }).join('');

            return `
            <tr>
                <td colspan="5" style="padding:12px 8px 6px;font-size:12px;font-weight:700;
                    color:white;background:${colore};letter-spacing:0.08em;text-transform:uppercase">
                    ${titolo}
                </td>
            </tr>
            ${righe}`;
        };

        const titoloSml = includiArchiviati ? '🧱 Semilavorati (tutto lo storico)' : '🧱 Semilavorati disponibili';
        const titoloFiniti = includiArchiviati ? '🍝 Prodotti finiti (tutto lo storico)' : '🍝 Prodotti finiti';

        const righe =
            renderSezione(titoloSml, '#065f46', semilavorati) +
            renderSezione(titoloFiniti, '#1e3a5f', finiti);

        const html = `
        <!DOCTYPE html>
        <html lang="it">
        <head>
            <meta charset="UTF-8">
            <title>Registro Produzione — Pastificio Gramsci</title>
            <style>
                body { font-family: Arial, sans-serif; margin: 20px; color: #1f2937; }
                h1 { font-size: 20px; margin-bottom: 2px; }
                h2 { font-size: 14px; font-weight: normal; color: #6b7280; margin-bottom: 4px; }
                .meta { font-size: 12px; color: #6b7280; margin-bottom: 20px; }
                table { width: 100%; border-collapse: collapse; }
                th { background: #3d2214; color: white; padding: 8px; text-align: left; font-size: 12px; }
                .footer { margin-top: 40px; font-size: 11px; color: #9ca3af; border-top: 1px solid #e5e7eb; padding-top: 10px; }
                .firma { margin-top: 60px; display: flex; justify-content: space-between; }
                .firma div { text-align: center; font-size: 12px; }
                .firma div span { display: block; width: 200px; border-top: 1px solid #374151; margin: 40px auto 4px; }
                @media print { body { margin: 10px; } }
            </style>
        </head>
        <body>
            <h1>🍝 Pastificio Gramsci</h1>
            <h2>Viale Gramsci 24/A — Collegno (TO)</h2>
            <div class="meta">
                <strong>Registro di Produzione e Rintracciabilità</strong> &nbsp;·&nbsp;
                ${periodoLabel} &nbsp;·&nbsp;
                Stampato il ${dataStampa}
            </div>

            <table>
                <thead>
                    <tr>
                        <th style="width:22%">Prodotto</th>
                        <th style="width:15%">N° Lotto</th>
                        <th style="width:12%">Data prod.</th>
                        <th style="width:12%">Scadenza</th>
                        <th style="width:10%">Quantità</th>
                    </tr>
                </thead>
                <tbody>
                    ${righe.length > 0 ? righe : '<tr><td colspan="5" style="padding:20px;text-align:center;color:#9ca3af">Nessuna produzione nel periodo selezionato</td></tr>'}
                </tbody>
            </table>

            <div class="firma">
                <div><span></span>Responsabile produzione</div>
                <div><span></span>Data e timbro</div>
            </div>

            <div class="footer">
                Documento generato automaticamente · Reg. CE 178/2002 · Piano di Autocontrollo HACCP
            </div>
        </body>
        </html>`;

        const win = window.open('', '_blank');
        win.document.write(html);
        win.document.close();
        win.print();
    },

    // ==========================================
    // RICERCA LOTTO
    // ==========================================

    apriRicercaLotto() {
        document.getElementById('lotto-search-input').value = '';
        document.getElementById('lotto-result').innerHTML = '';
        document.getElementById('btn-stampa-lotto').classList.add('hidden');
        document.getElementById('lotto-modal').classList.remove('hidden');
        document.getElementById('lotto-search-input').focus();
    },

    chiudiRicercaLotto() {
        document.getElementById('lotto-modal').classList.add('hidden');
    },

    cercaLotto() {
        const query = document.getElementById('lotto-search-input').value.trim().toLowerCase();
        const el = document.getElementById('lotto-result');

        if (!query) { el.innerHTML = '<p class="text-gray-400 text-sm">Inserisci un numero di lotto.</p>'; return; }

        // Cerca in produzioni
        const trovati = this.produzioni.filter(p =>
            p.lotto?.toLowerCase().includes(query) ||
            p.ricettaNome?.toLowerCase().includes(query)
        );

        const carichiTrovati = MateriePrimeModule.carichi.filter(c =>
            c.lotto?.toLowerCase() === query ||
            c.lotto?.toLowerCase().startsWith(query) ||
            c.mpNome?.toLowerCase().includes(query)
        );

        if (trovati.length === 0 && carichiTrovati.length === 0) {
            el.innerHTML = `<div class="text-center py-8 text-gray-400">
                <div class="text-3xl mb-2">🔍</div>
                <p>Nessun risultato per <strong>"${query}"</strong></p>
            </div>`;
            document.getElementById('btn-stampa-lotto').classList.add('hidden');
            return;
        }

        let html = '';

        // Risultati produzioni
        trovati.forEach(p => {
            const usatoIn = this.trovaUsoLotto(p.lotto);
            const mpList = p.lottiMP?.length > 0 ? p.lottiMP : (p.lottiUsati || []);

            html += `
            <div class="border rounded-xl p-4 mb-4 bg-white">
                <div class="flex items-center gap-2 mb-3">
                    <span class="font-mono font-bold text-lg text-blue-800">${p.lotto}</span>
                    <span class="text-sm font-bold text-gray-700">${p.ricettaNome}</span>
                    <span class="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
                        ${p.tipo === 'prodotto' ? 'Prodotto finito' : p.tipo === 'composto' ? 'Semilavorato composto' : p.tipo === 'sfoglia' ? 'Sfoglia' : 'Semilavorato base'}
                    </span>
                </div>
                <div class="text-sm text-gray-600 mb-3">
                    📅 Prodotto il ${this.fmtData(p.data)}
                    ${p.scadenza ? ` · Scadenza: ${this.fmtData(p.scadenza)}` : ''}
                    ${p.quantita ? ` · ${p.quantita} ${p.unita}` : ''}
                    ${p.archiviato ? ' · <span class="text-gray-400">archiviato</span>' : ''}
                </div>

                ${mpList.length > 0 ? `
                <div class="mb-3">
                    <p class="text-xs font-bold text-gray-400 uppercase mb-1">Materie prime usate</p>
                    ${mpList.map(m => `
                        <div class="text-sm py-1 border-b border-gray-50 last:border-0">
                            📦 <span class="font-medium">${m.mpNome}</span>
                            <span class="font-mono text-amber-800 ml-2">${m.lotto}</span>
                        </div>`).join('')}
                </div>` : ''}

                ${p.lottiSML?.length > 0 ? `
                <div class="mb-3">
                    <p class="text-xs font-bold text-gray-400 uppercase mb-1">Semilavorati usati</p>
                    ${p.lottiSML.map(s => `
                        <div class="text-sm py-1 border-b border-gray-50 last:border-0">
                            🥩 <span class="font-medium">${s.smlNome}</span>
                            <span class="font-mono text-orange-800 ml-2">${s.lotto}</span>
                        </div>`).join('')}
                </div>` : ''}

                ${usatoIn.length > 0 ? `
                <div class="bg-blue-50 rounded-lg p-3">
                    <p class="text-xs font-bold text-blue-700 uppercase mb-1">Utilizzato in</p>
                    ${usatoIn.map(u => `
                        <div class="text-sm py-1">
                            → <span class="font-medium">${u.ricettaNome}</span>
                            <span class="font-mono text-blue-800 ml-2">${u.lotto}</span>
                            <span class="text-gray-400 ml-2">${this.fmtData(u.data)}</span>
                        </div>`).join('')}
                </div>` : ''}
            </div>`;
        });

        // Risultati carichi MP
        carichiTrovati.forEach(c => {
            const usatoIn = this.trovaUsoLottoMP(c.lotto);
            html += `
            <div class="border rounded-xl p-4 mb-4 bg-white">
                <div class="flex items-center gap-2 mb-3">
                    <span class="font-mono font-bold text-lg text-amber-800">${c.lotto}</span>
                    <span class="text-sm font-bold text-gray-700">${c.mpNome}</span>
                    <span class="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">Materia prima</span>
                </div>
                <div class="text-sm text-gray-600 mb-3">
                    📦 Fornitore: ${c.fornitore || '–'}
                    · Arrivo: ${this.fmtData(c.dataArrivo)}
                    ${c.scadenza ? ` · Scadenza: ${this.fmtData(c.scadenza)}` : ''}
                    ${c.foto ? ` · <a href="${c.foto}" target="_blank" class="text-blue-500">📷 Foto DDT</a>` : ''}
                </div>
                ${usatoIn.length > 0 ? `
                <div class="bg-blue-50 rounded-lg p-3">
                    <p class="text-xs font-bold text-blue-700 uppercase mb-1">Utilizzato in</p>
                    ${usatoIn.map(u => `
                        <div class="text-sm py-1">
                            → <span class="font-medium">${u.ricettaNome}</span>
                            <span class="font-mono text-blue-800 ml-2">${u.lotto}</span>
                            <span class="text-gray-400 ml-2">${this.fmtData(u.data)}</span>
                        </div>`).join('')}
                </div>` : ''}
            </div>`;
        });

        el.innerHTML = html;
        document.getElementById('btn-stampa-lotto').classList.remove('hidden');
        // Salva per la stampa
        this._lottoSearchQuery = query;
        this._lottoSearchTrovati = trovati;
        this._lottoSearchCarichi = carichiTrovati;
    },

    // Trova dove è stato usato un lotto di produzione
    trovaUsoLotto(lotto) {
        return this.produzioni.filter(p =>
            p.lottiSML?.some(s => s.lotto === lotto)
        );
    },

    // Trova dove è stato usato un lotto di materia prima
    trovaUsoLottoMP(lotto) {
        return this.produzioni.filter(p =>
            p.lottiMP?.some(m => m.lotto === lotto) ||
            p.lottiUsati?.some(m => m.lotto === lotto)
        );
    },

    stampaSchedaLotto() {
        const query = this._lottoSearchQuery || '';
        const trovati = this._lottoSearchTrovati || [];
        const carichi = this._lottoSearchCarichi || [];

        const dataStampa = new Date().toLocaleDateString('it-IT', {
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit'
        });

        let body = '';

        trovati.forEach(p => {
            const mpList = p.lottiMP?.length > 0 ? p.lottiMP : (p.lottiUsati || []);
            const usatoIn = this.trovaUsoLotto(p.lotto);
            body += `
            <div style="border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin-bottom:16px">
                <div style="display:flex;align-items:center;gap:12px;margin-bottom:8px">
                    <span style="font-family:monospace;font-size:18px;font-weight:700;color:#1e40af">${p.lotto}</span>
                    <span style="font-size:14px;font-weight:700">${p.ricettaNome}</span>
                </div>
                <div style="font-size:12px;color:#6b7280;margin-bottom:12px">
                    Prodotto il ${this.fmtData(p.data)}
                    ${p.scadenza ? ` · Scadenza: ${this.fmtData(p.scadenza)}` : ''}
                    ${p.quantita ? ` · ${p.quantita} ${p.unita}` : ''}
                </div>
                ${mpList.length > 0 ? `
                <div style="margin-bottom:12px">
                    <p style="font-size:11px;font-weight:700;color:#9ca3af;text-transform:uppercase;margin-bottom:4px">Materie prime</p>
                    ${mpList.map(m => `<div style="font-size:12px;padding:3px 0;border-bottom:1px solid #f3f4f6">
                        📦 ${m.mpNome} <span style="font-family:monospace;margin-left:8px">${m.lotto}</span>
                    </div>`).join('')}
                </div>` : ''}
                ${p.lottiSML?.length > 0 ? `
                <div style="margin-bottom:12px">
                    <p style="font-size:11px;font-weight:700;color:#9ca3af;text-transform:uppercase;margin-bottom:4px">Semilavorati</p>
                    ${p.lottiSML.map(s => `<div style="font-size:12px;padding:3px 0;border-bottom:1px solid #f3f4f6">
                        🥩 ${s.smlNome} <span style="font-family:monospace;margin-left:8px">${s.lotto}</span>
                    </div>`).join('')}
                </div>` : ''}
                ${usatoIn.length > 0 ? `
                <div style="background:#eff6ff;border-radius:6px;padding:10px">
                    <p style="font-size:11px;font-weight:700;color:#1d4ed8;text-transform:uppercase;margin-bottom:4px">Utilizzato in</p>
                    ${usatoIn.map(u => `<div style="font-size:12px;padding:2px 0">
                        → ${u.ricettaNome} <span style="font-family:monospace;margin-left:8px">${u.lotto}</span>
                        <span style="color:#9ca3af;margin-left:8px">${this.fmtData(u.data)}</span>
                    </div>`).join('')}
                </div>` : ''}
            </div>`;
        });

        carichi.forEach(c => {
            const usatoIn = this.trovaUsoLottoMP(c.lotto);
            body += `
            <div style="border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin-bottom:16px">
                <div style="display:flex;align-items:center;gap:12px;margin-bottom:8px">
                    <span style="font-family:monospace;font-size:18px;font-weight:700;color:#92400e">${c.lotto}</span>
                    <span style="font-size:14px;font-weight:700">${c.mpNome}</span>
                    <span style="font-size:11px;background:#fef3c7;color:#92400e;padding:2px 8px;border-radius:12px">Materia prima</span>
                </div>
                <div style="font-size:12px;color:#6b7280;margin-bottom:12px">
                    Fornitore: ${c.fornitore || '–'} · Arrivo: ${this.fmtData(c.dataArrivo)}
                    ${c.scadenza ? ` · Scadenza: ${this.fmtData(c.scadenza)}` : ''}
                </div>
                ${usatoIn.length > 0 ? `
                <div style="background:#eff6ff;border-radius:6px;padding:10px">
                    <p style="font-size:11px;font-weight:700;color:#1d4ed8;text-transform:uppercase;margin-bottom:4px">Utilizzato in</p>
                    ${usatoIn.map(u => `<div style="font-size:12px;padding:2px 0">
                        → ${u.ricettaNome} <span style="font-family:monospace;margin-left:8px">${u.lotto}</span>
                        <span style="color:#9ca3af;margin-left:8px">${this.fmtData(u.data)}</span>
                    </div>`).join('')}
                </div>` : ''}
            </div>`;
        });

        const html = `
        <!DOCTYPE html><html lang="it"><head><meta charset="UTF-8">
        <title>Scheda Rintracciabilità — ${query}</title>
        <style>body{font-family:Arial,sans-serif;margin:20px;color:#1f2937}
        h1{font-size:18px;margin-bottom:2px}h2{font-size:13px;font-weight:normal;color:#6b7280}
        .meta{font-size:11px;color:#6b7280;margin-bottom:20px}
        @media print{body{margin:10px}}</style>
        </head><body>
        <h1>🍝 Pastificio Gramsci</h1>
        <h2>Viale Gramsci 24/A — Collegno (TO)</h2>
        <div class="meta">
            <strong>Scheda di Rintracciabilità</strong> · Lotto ricercato: <strong>${query}</strong> · Stampato il ${dataStampa}
        </div>
        ${body}
        <div style="margin-top:40px;font-size:11px;color:#9ca3af;border-top:1px solid #e5e7eb;padding-top:10px">
            Documento generato automaticamente · Reg. CE 178/2002 · Piano di Autocontrollo HACCP
        </div>
        </body></html>`;

        const win = window.open('', '_blank');
        win.document.write(html);
        win.document.close();
        win.print();
    },
};

window.ProduzioneModule = ProduzioneModule;
console.log('✅ ProduzioneModule unificato caricato');