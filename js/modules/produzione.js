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
        return tipo === 'base' || tipo === 'composto' || tipo === 'sfoglia';
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
        const tipo = this.getTipo(dati.ricettaId);
        const ricetta = RicetteModule.getRicetta(dati.ricettaId);
        const prod = {
            id: this.newId(),
            tipo: tipo,
            categoria: ricetta?.categoria || '',
            ricettaId: dati.ricettaId,
            ricettaNome: dati.ricettaNome,
            lotto: lotto,
            data: dati.data || new Date().toISOString().split('T')[0],
            scadenza: dati.scadenza || '',
            quantita: parseFloat(dati.quantita) || 0,
            unita: dati.unita || 'kg',
            operatore: dati.operatore?.trim() || '',
            note: dati.note?.trim() || '',
            lottiMP: dati.lottiMP || [],
            lottiSML: dati.lottiSML || [],
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
            .sort((a, b) => new Date(a.data) - new Date(b.data));
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
            const oggiStr = oggi.toISOString().split('T')[0];
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
        const scadAvv = p.scadenza ? this.avvisoScadenza(p.scadenza) : '';

        const lottoColor = p.tipo === 'prodotto'
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

        return `
        <div class="bg-white border border-gray-200 rounded-lg mb-2 overflow-hidden
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
                            ${p.scadenza ? `<span class="text-xs text-gray-400">scad. ${this.fmtData(p.scadenza)}</span>` : ''}
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
                            class="text-gray-400 p-1.5 rounded-lg active:bg-gray-50 text-sm">📦</button>` : ''}
                        <button onclick="event.stopPropagation();ProduzioneModule.deleteProduzione('${p.id}')"
                            class="text-red-400 p-1.5 rounded-lg active:bg-red-50 text-sm">🗑</button>
                        <button onclick="EtichetteModule.stampa('${p.id}')" title="Stampa etichetta"
                        class="text-gray-400 hover:text-amber-700 p-1">🏷️</button>
                    </div>
                </div>

                ${p.quantita ? `<div class="text-xs text-gray-400 mt-0.5">${p.quantita} ${p.unita}</div>` : ''}

                <!-- Terza riga: lotti usati (troncata) -->
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

    renderAlberoHTML(prod, livello) {
        let html = '';
        const indent = livello * 16;

        // Semilavorati
        if (prod.lottiSML?.length > 0) {
            prod.lottiSML.forEach(s => {
                const smlDet = this.produzioni.find(x => x.lotto === s.lotto);
                html += `
                <div style="padding-left:${indent}px" class="flex items-start gap-1.5 py-1 border-b border-gray-100 last:border-0">
                    <span class="text-gray-300 text-xs mt-0.5">↳</span>
                    <div>
                        <span class="text-xs font-semibold text-orange-700">🥩 ${s.smlNome}</span>
                        <span class="font-mono text-xs text-orange-600 ml-1">${s.lotto}</span>
                        ${smlDet?.scadenza ? `<span class="text-xs text-gray-400 ml-1">scad. ${this.fmtData(smlDet.scadenza)}</span>` : ''}
                        ${smlDet ? this.renderAlberoHTML(smlDet, livello + 1) : ''}
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
        const sel = document.getElementById('prd-form-ricetta');
        sel.innerHTML = '<option value="">— Seleziona ricetta —</option>';

        // Tutte le ricette in ordine logico
        const ordine = ['Sfoglia', 'Semilavorato base', 'Semilavorato composto', 'Pasta fresca ripiena', 'Gastronomia'];
        const tutte = RicetteModule.getAllRicette();

        ordine.forEach(cat => {
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

        const oggi = new Date().toISOString().split('T')[0];
        document.getElementById('prd-form-data').value = oggi;
        document.getElementById('prd-form-scadenza').value = '';
        document.getElementById('prd-form-quantita').value = '';
        document.getElementById('prd-form-unita').value = 'kg';
        document.getElementById('prd-form-operatore').value = '';
        document.getElementById('prd-form-note').value = '';
        document.getElementById('prd-form-id').value = '';
        document.getElementById('prd-lotti-mp').innerHTML = '';
        document.getElementById('prd-lotti-sml').innerHTML = '';
        document.querySelector('#prd-modal h3').textContent = '🍳 Nuova Produzione';
        document.getElementById('prd-modal').classList.remove('hidden');
    },

    closeModal() {
        document.getElementById('prd-modal').classList.add('hidden');
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

    onDataChange() {
        const sel = document.getElementById('prd-form-ricetta');
        const opt = sel.options[sel.selectedIndex];
        const shelfLife = opt?.dataset.shelf || '';
        const data = document.getElementById('prd-form-data').value;
        if (shelfLife && data) {
            document.getElementById('prd-form-scadenza').value =
                this.calcolaScadenza(data, shelfLife);
        }
        // AGGIUNGI:
        if (data) {
            document.getElementById('prd-form-lotto').value = this.genLotto(data);
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
            const lotti = MateriePrimeModule.getLottiPerProduzione(ing.refId);
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
            const opzioni = attivi.length === 0
                ? '<option value="">Nessun lotto disponibile</option>'
                : attivi.map((s, i) =>
                    `<option value="${s.id}|${s.lotto}" ${i === 0 ? 'selected' : ''}>
                                ${s.lotto} · prod. ${this.fmtData(s.data)}
                                ${s.scadenza ? ` · scad. ${this.fmtData(s.scadenza)}` : ''}
                                ${i === 0 ? '— FIFO' : ''}
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
        const sel = document.getElementById('prd-form-ricetta');
        const ricettaId = sel.value;
        const ricettaNome = sel.options[sel.selectedIndex]?.dataset.nome || '';
        const data = document.getElementById('prd-form-data').value;
        const scadenza = document.getElementById('prd-form-scadenza').value;
        const quantita = document.getElementById('prd-form-quantita').value;
        const unita = document.getElementById('prd-form-unita').value;
        const operatore = document.getElementById('prd-form-operatore').value;
        const note = document.getElementById('prd-form-note').value;

        if (!ricettaId) { Utils.showToast('⚠️ Seleziona una ricetta', 'warning'); return; }
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

        const editId = document.getElementById('prd-form-id').value;

        if (editId) {
            const p = this.getProduzione(editId);
            if (p) {
                p.ricettaId = ricettaId;
                p.ricettaNome = ricettaNome;
                p.tipo = this.getTipo(ricettaId);
                p.data = data;
                p.scadenza = scadenza;
                p.quantita = parseFloat(quantita) || 0;
                p.unita = unita;
                p.operatore = operatore;
                p.note = note;
                p.lottiMP = lottiMP;
                p.lottiSML = lottiSML;
                p.updatedAt = new Date().toISOString();
                this.save();
                Utils.showToast(`✅ Produzione aggiornata`, 'success');
            }
        } else {
            const prod = this.addProduzione({
                ricettaId, ricettaNome, data, scadenza,
                quantita, unita, operatore, note, lottiMP, lottiSML
            });
            Utils.showToast(`✅ ${ricettaNome} · Lotto: ${prod.lotto}`, 'success');
        }

        this.closeModal();
        this.render();
    },

    openModalEdit(id) {
        const p = this.getProduzione(id);
        if (!p) return;

        this.openModalNew();

        // Seleziona la ricetta giusta
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
            const smlDet = this.produzioni.find(x => x.lotto === s.lotto);
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

    stampaRegistro() {
        const filtroRange = document.getElementById('prd-filtro-range')?.value || 'settimana';
        const filtroData = document.getElementById('prd-filtro-data')?.value;

        const oggi = new Date();
        oggi.setHours(0, 0, 0, 0);

        const tuttoRange = !filtroData && filtroRange === 'tutto';
        let lista = tuttoRange
            ? [...this.produzioni]
            : [...this.produzioni].filter(p => !p.archiviato);

        if (filtroData) {
            lista = lista.filter(p => p.data === filtroData);
        } else if (filtroRange === 'oggi') {
            const oggiStr = oggi.toISOString().split('T')[0];
            lista = lista.filter(p => p.data === oggiStr);
        } else if (filtroRange === 'settimana') {
            const settimanaFa = new Date(oggi);
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
                ? `Data: ${this.fmtData(oggi.toISOString().split('T')[0])}`
                : 'Periodo: ultimi 7 giorni';

        // Separa semilavorati vendibili da prodotti finiti
        const vendibili = lista.filter(p => {
            const r = RicetteModule.getRicetta(p.ricettaId);
            return r?.vendibile && p.tipo !== 'prodotto';
        });
        const finiti = lista.filter(p => p.tipo === 'prodotto');

        const buildAlbero = (prod, livello = 0) => {
            let html = '';
            const indent = livello * 20;

            if (prod.lottiSML?.length > 0) {
                prod.lottiSML.forEach(s => {
                    const smlDet = this.produzioni.find(x => x.lotto === s.lotto);
                    html += `<tr style="background:${livello === 0 ? '#fff7ed' : '#fefce8'}">
                        <td colspan="5" style="padding:3px 8px 3px ${indent + 24}px;font-size:12px">
                            <span style="color:#92400e;font-weight:600">↳ 🥩 ${s.smlNome}</span>
                            <span style="font-family:monospace;color:#b45309;margin-left:8px">${s.lotto}</span>
                            ${smlDet?.scadenza ? `<span style="color:#9ca3af;margin-left:8px;font-size:11px">scad. ${this.fmtData(smlDet.scadenza)}</span>` : ''}
                        </td>
                    </tr>`;
                    if (smlDet) html += buildAlbero(smlDet, livello + 1);
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

        const righe =
            renderSezione('🥘 Semilavorati vendibili', '#065f46', vendibili) +
            renderSezione('🍝 Prodotti finiti', '#1e3a5f', finiti);

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