// ============================================
// 🥩 SEMILAVORATI
// ============================================
// Registra le produzioni di semilavorati
// (ragù, besciamella, arrosti, ripieni…)
// Ogni produzione genera un lotto SML.
// ============================================

const SemilavoratiModule = {

    semilavorati: [],

    // ==========================================
    // INIT
    // ==========================================

    init() {
        this.semilavorati = Storage.loadLocal(CONFIG.STORAGE_KEYS.SEMILAVORATI, []);
        console.log(`✅ Semilavorati: ${this.semilavorati.length} produzioni`);
        this.render();
    },

    save() {
        Storage.saveLocal(CONFIG.STORAGE_KEYS.SEMILAVORATI, this.semilavorati);
        const now = new Date().toISOString();
        Storage.lastLocalSave[CONFIG.DROPBOX_PATHS.SEMILAVORATI] = now;
        localStorage.setItem('lastLocalSave_' + CONFIG.DROPBOX_PATHS.SEMILAVORATI, now);
        Storage.saveDropbox(CONFIG.DROPBOX_PATHS.SEMILAVORATI, this.semilavorati);
    },

    newId() {
        return 'sml_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
    },

    // ==========================================
    // GENERAZIONE LOTTO SML
    // ==========================================

    genLotto(data) {
        const d = data || new Date().toISOString().split('T')[0];
        const [y, m, gg] = d.split('-');
        const aa = y.slice(2);
        const base = `${gg}-${m}-${aa}`;
        const existing = this.semilavorati.filter(s => s.lotto?.startsWith(base));
        if (existing.length === 0) return base;
        return `${base}-${existing.length + 1}`;
    },

    // ==========================================
    // CRUD
    // ==========================================

    addSemilavorato(dati) {
        const lotto = this.genLotto(dati.data);
        const sml = {
            id: this.newId(),
            ricettaId: dati.ricettaId,
            ricettaNome: dati.ricettaNome,
            lotto: lotto,
            data: dati.data || new Date().toISOString().split('T')[0],
            scadenza: dati.scadenza || '',
            quantita: parseFloat(dati.quantita) || 0,
            unita: dati.unita || 'kg',
            operatore: dati.operatore?.trim() || '',
            note: dati.note?.trim() || '',
            // Lotti MP usati: [{ mpId, mpNome, lotto, lottoId }]
            lottiUsati: dati.lottiUsati || [],
            archiviato: false,
            createdAt: new Date().toISOString()
        };
        this.semilavorati.push(sml);
        this.save();
        return sml;
    },

    archiviaSmL(id) {
        const s = this.semilavorati.find(s => s.id === id);
        if (!s) return;
        s.archiviato = true;
        s.archiviatoAt = new Date().toISOString();
        this.save();
        this.render();
        Utils.showToast('✅ Semilavorato archiviato', 'success');
    },

    deleteSml(id) {
        if (!confirm('Eliminare questo semilavorato dallo storico?')) return;
        this.semilavorati = this.semilavorati.filter(s => s.id !== id);
        this.save();
        this.render();
    },

    openModalEdit(id) {
        const s = this.getSml(id);
        if (!s) return;

        const sel = document.getElementById('sml-form-ricetta');
        sel.innerHTML = '<option value="">— Seleziona ricetta —</option>';
        RicetteModule.getRicetteSemilavorati().forEach(r => {
            sel.innerHTML += `<option value="${r.id}" data-nome="${r.nome}"
                ${r.id === s.ricettaId ? 'selected' : ''}>${r.nome}</option>`;
        });

        document.getElementById('sml-form-data').value = s.data;
        document.getElementById('sml-form-scadenza').value = s.scadenza || '';
        document.getElementById('sml-form-quantita').value = s.quantita || '';
        document.getElementById('sml-form-unita').value = s.unita || 'kg';
        document.getElementById('sml-form-operatore').value = s.operatore || '';
        document.getElementById('sml-form-note').value = s.note || '';
        document.getElementById('sml-form-id').value = id;
        document.querySelector('#sml-modal h3').textContent = '✏️ Modifica Semilavorato';

        this.onRicettaChange();
        document.getElementById('sml-modal').classList.remove('hidden');
    },

    getSml(id) {
        return this.semilavorati.find(s => s.id === id);
    },

    // Semilavorati attivi (non archiviati) — usati dalla produzione
    getAttiviPerRicetta(ricettaId) {
        return this.semilavorati
            .filter(s => s.ricettaId === ricettaId && !s.archiviato)
            .sort((a, b) => new Date(a.data) - new Date(b.data)); // FIFO
    },

    // Tutti i semilavorati attivi (per selezione nella produzione)
    getTuttiAttivi() {
        return this.semilavorati
            .filter(s => !s.archiviato)
            .sort((a, b) => new Date(b.data) - new Date(a.data));
    },

    // ==========================================
    // RENDER
    // ==========================================

    render() {
        const container = document.getElementById('semilavorati-list');
        if (!container) return;   // tab non presente nel DOM corrente
        if (!container) return;

        const attivi = this.semilavorati.filter(s => !s.archiviato);
        const archiviati = this.semilavorati.filter(s => s.archiviato);

        if (this.semilavorati.length === 0) {
            container.innerHTML = `
                <div class="text-center py-12 text-gray-400">
                    <div class="text-5xl mb-3">🥩</div>
                    <p class="text-lg">Nessun semilavorato ancora.</p>
                    <p class="text-sm mt-1">Registra la produzione di ragù, besciamella, arrosti…</p>
                </div>`;
            return;
        }

        let html = '';

        if (attivi.length > 0) {
            // Suddividi attivi per tipo ricetta
            const semplici = attivi.filter(s => {
                const r = RicetteModule.getRicetta(s.ricettaId);
                return r?.categoria === 'Semilavorato base' || r?.categoria === 'Sfoglia';
            });
            const composti = attivi.filter(s => {
                const r = RicetteModule.getRicetta(s.ricettaId);
                return r?.categoria === 'Semilavorato composto';
            });
            const altri = attivi.filter(s => {
                const r = RicetteModule.getRicetta(s.ricettaId);
                return !r || (r.categoria !== 'Semilavorato base' && r.categoria !== 'Sfoglia' && r.categoria !== 'Semilavorato composto');
            });

            if (semplici.length > 0) {
                html += `<h3 class="text-sm font-bold text-gray-400 uppercase tracking-wider mb-2 px-1 mt-2">
                            🧱 Semilavorati base (${semplici.length})
                         </h3>`;
                html += semplici
                    .sort((a, b) => new Date(b.data) - new Date(a.data))
                    .map(s => this.renderCard(s)).join('');
            }

            if (composti.length > 0) {
                html += `<h3 class="text-sm font-bold text-gray-400 uppercase tracking-wider mb-2 px-1 mt-5">
                            🔧 Semilavorati composti (${composti.length})
                         </h3>`;
                html += composti
                    .sort((a, b) => new Date(b.data) - new Date(a.data))
                    .map(s => this.renderCard(s)).join('');
            }

            if (altri.length > 0) {
                html += `<h3 class="text-sm font-bold text-gray-400 uppercase tracking-wider mb-2 px-1 mt-5">
                            📦 Altri (${altri.length})
                         </h3>`;
                html += altri
                    .sort((a, b) => new Date(b.data) - new Date(a.data))
                    .map(s => this.renderCard(s)).join('');
            }
        }

        if (archiviati.length > 0) {
            html += `<h3 class="text-sm font-bold text-gray-400 uppercase tracking-wider mt-6 mb-2 px-1">
                        Archiviati (${archiviati.length})
                     </h3>`;
            html += archiviati
                .sort((a, b) => new Date(b.data) - new Date(a.data))
                .map(s => this.renderCard(s)).join('');
        }

        container.innerHTML = html;
    },

    renderCard(s) {
        const scadAvv = s.scadenza ? this.avvisoScadenza(s.scadenza) : '';
        const lottiStr = s.lottiUsati.length > 0
            ? s.lottiUsati.map(l => `${l.mpNome}: <span class="font-mono">${l.lotto}</span>`).join(' · ')
            : '<span class="text-gray-300">nessun lotto MP registrato</span>';

        return `
        <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-3
                    ${s.archiviato ? 'opacity-50' : ''}">
            <div class="flex items-start justify-between gap-3">
                <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-2 flex-wrap">
                        <h4 class="font-bold text-gray-800">${s.ricettaNome}</h4>
                        <span class="font-mono text-xs bg-orange-100 text-orange-800 border border-orange-200
                                     rounded-full px-2 py-0.5 font-bold">
                            ${s.lotto}
                        </span>
                        ${s.archiviato ? '<span class="text-xs bg-gray-200 text-gray-500 rounded-full px-2 py-0.5">archiviato</span>' : ''}
                    </div>
                    <div class="text-sm text-gray-500 mt-1">
                        📅 ${this.fmtData(s.data)}
                        ${s.quantita ? ` · ${s.quantita} ${s.unita}` : ''}
                        ${s.scadenza ? ` · scad. ${this.fmtData(s.scadenza)}` : ''}
                        ${scadAvv}
                        ${s.operatore ? ` · 👤 ${s.operatore}` : ''}
                    </div>
                    <div class="text-xs text-gray-400 mt-1">🏷 MP: ${lottiStr}</div>
                    ${s.note ? `<div class="text-xs text-gray-400 mt-0.5 italic">${s.note}</div>` : ''}
                </div>
                ${!s.archiviato ? `
                <div class="flex flex-col gap-1.5 flex-shrink-0">
                    <button onclick="SemilavoratiModule.openModalEdit('${s.id}')"
                        class="bg-amber-100 text-amber-700 text-sm px-3 py-1.5 rounded-lg hover:bg-amber-200 font-medium">
                        ✏️ Modifica
                    </button>    
                    <button onclick="SemilavoratiModule.archiviaSmL('${s.id}')"
                        class="bg-gray-100 text-gray-700 text-sm px-3 py-1.5 rounded-lg hover:bg-gray-200 font-medium">
                        Archivia
                    </button>
                    <button onclick="SemilavoratiModule.deleteSml('${s.id}')"
                        class="bg-red-50 text-red-500 text-sm px-3 py-1.5 rounded-lg hover:bg-red-100 font-medium">
                        🗑
                    </button>
                </div>` : ''}
            </div>
        </div>`;
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
        if (diffGg < 0) return `<span class="text-red-600 font-bold">⛔ SCADUTO</span>`;
        if (diffGg <= 7) return `<span class="text-red-500 font-bold">⚠️ ${diffGg}gg</span>`;
        if (diffGg <= 30) return `<span class="text-orange-500">⚠️ ${diffGg}gg</span>`;
        return '';
    },

    // ==========================================
    // MODAL: NUOVA PRODUZIONE SEMILAVORATO
    // ==========================================

    openModalNew() {
        // Popola select ricette semilavorati
        const sel = document.getElementById('sml-form-ricetta');
        sel.innerHTML = '<option value="">— Seleziona ricetta —</option>';
        RicetteModule.getRicetteSemilavorati().forEach(r => {
            sel.innerHTML += `<option value="${r.id}" data-nome="${r.nome}">${r.nome}</option>`;
        });

        // Reset form
        document.getElementById('sml-form-data').value = new Date().toISOString().split('T')[0];
        document.getElementById('sml-form-scadenza').value = '';
        document.getElementById('sml-form-quantita').value = '';
        document.getElementById('sml-form-unita').value = 'kg';
        document.getElementById('sml-form-operatore').value = '';
        document.getElementById('sml-form-note').value = '';
        document.getElementById('sml-lotti-mp').innerHTML = '';
        document.getElementById('sml-form-id').value = '';
        document.querySelector('#sml-modal h3').textContent = '🥩 Nuova Produzione Semilavorato';
        document.getElementById('sml-modal').classList.remove('hidden');
    },

    closeModal() {
        document.getElementById('sml-modal').classList.add('hidden');
    },

    // Quando si sceglie la ricetta, mostra i campi lotti MP
    onRicettaChange() {
        const sel = document.getElementById('sml-form-ricetta');
        const ricId = sel.value;
        const ricetta = RicetteModule.getRicetta(ricId);
        const container = document.getElementById('sml-lotti-mp');

        if (!ricetta || ricetta.ingredienti.length === 0) {
            container.innerHTML = '';
            return;
        }

        // Mostra solo ingredienti MP (i SML li gestiamo a parte)
        const mpIng = ricetta.ingredienti.filter(i => i.tipo === 'mp');
        if (mpIng.length === 0) { container.innerHTML = ''; return; }

        container.innerHTML = `
            <div class="border-t pt-3 mt-1">
                <p class="text-xs font-semibold text-gray-500 uppercase mb-2">
                    Lotti MP utilizzati
                </p>
                ${mpIng.map(ing => {
            const lottiAttivi = MateriePrimeModule.getLottiPerProduzione(ing.refId);
            const opzioni = lottiAttivi.length === 0
                ? '<option value="">Nessun lotto disponibile</option>'
                : lottiAttivi.map((l, i) =>
                    `<option value="${l.id}|${l.lotto}" ${i === 0 ? 'selected' : ''}>
                                ${l.lotto} — arr. ${this.fmtData(l.dataArrivo)}
                                ${i === 0 ? '(FIFO)' : ''}
                             </option>`
                ).join('') + '<option value="manuale">✏️ Inserisci manualmente</option>';
            return `
                    <div class="mb-2" data-mp-id="${ing.refId}" data-mp-nome="${ing.refNome}">
                        <label class="block text-xs text-gray-600 mb-1 font-medium">
                            📦 ${ing.refNome}
                        </label>
                        <select class="sml-lotto-sel w-full px-3 py-2 border rounded-lg text-sm"
                            onchange="SemilavoratiModule.onLottoChange(this)">
                            ${opzioni}
                        </select>
                        <input type="text" class="sml-lotto-manual hidden w-full px-3 py-2 border rounded-lg text-sm mt-1"
                            placeholder="Inserisci lotto manualmente">
                    </div>`;
        }).join('')}
            </div>`;
    },

    onLottoChange(sel) {
        const manualInput = sel.parentElement.querySelector('.sml-lotto-manual');
        if (sel.value === 'manuale') {
            manualInput.classList.remove('hidden');
            manualInput.focus();
        } else {
            manualInput.classList.add('hidden');
        }
    },

    saveSemilavorato() {
        const sel = document.getElementById('sml-form-ricetta');
        const ricettaId = sel.value;
        const ricettaNome = sel.options[sel.selectedIndex]?.dataset.nome || sel.options[sel.selectedIndex]?.text || '';
        const data = document.getElementById('sml-form-data').value;
        const scadenza = document.getElementById('sml-form-scadenza').value;
        const quantita = document.getElementById('sml-form-quantita').value;
        const unita = document.getElementById('sml-form-unita').value;
        const operatore = document.getElementById('sml-form-operatore').value;
        const note = document.getElementById('sml-form-note').value;

        if (!ricettaId) { Utils.showToast('⚠️ Seleziona una ricetta', 'warning'); return; }
        if (!data) { Utils.showToast('⚠️ La data è obbligatoria', 'warning'); return; }

        // Raccoglie i lotti MP selezionati
        const lottiUsati = [];
        document.querySelectorAll('#sml-lotti-mp [data-mp-id]').forEach(div => {
            const mpId = div.dataset.mpId;
            const mpNome = div.dataset.mpNome;
            const sel = div.querySelector('.sml-lotto-sel');
            const manual = div.querySelector('.sml-lotto-manual');
            let lotto = '', lottoId = '';
            if (sel.value === 'manuale') {
                lotto = manual.value.trim();
            } else if (sel.value) {
                [lottoId, lotto] = sel.value.split('|');
            }
            if (lotto) lottiUsati.push({ mpId, mpNome, lottoId, lotto });
        });

        const editId = document.getElementById('sml-form-id').value;

        if (editId) {
            // MODIFICA
            const s = this.getSml(editId);
            if (s) {
                s.ricettaId = ricettaId;
                s.ricettaNome = ricettaNome;
                s.data = data;
                s.scadenza = scadenza;
                s.quantita = parseFloat(quantita) || 0;
                s.unita = unita;
                s.operatore = operatore;
                s.note = note;
                s.lottiUsati = lottiUsati;
                s.updatedAt = new Date().toISOString();
                this.save();
                Utils.showToast(`✅ Semilavorato aggiornato`, 'success');
            }
        } else {
            // NUOVO
            const sml = this.addSemilavorato({
                ricettaId, ricettaNome, data, scadenza,
                quantita, unita, operatore, note, lottiUsati
            });
            Utils.showToast(`✅ ${ricettaNome} registrato · Lotto: ${sml.lotto}`, 'success');
        }

        this.closeModal();
        this.render();
    },
};

window.SemilavoratiModule = SemilavoratiModule;
console.log('✅ SemilavoratiModule caricato');