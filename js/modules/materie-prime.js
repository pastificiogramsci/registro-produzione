// ============================================
// 📦 MATERIE PRIME
// ============================================
// Gestisce l'anagrafica delle materie prime
// e i carichi (lotti in ingresso).
//
// Struttura dati:
//   materiePrime[] → anagrafica MP
//   carichi[]      → ogni singolo carico/lotto
// ============================================

const MateriePrimeModule = {

    materiePrime: [],
    carichi: [],

    // ==========================================
    // INIT
    // ==========================================

    async init() {
        this.materiePrime = Storage.loadLocal(CONFIG.STORAGE_KEYS.MATERIE_PRIME, []);
        this.carichi = Storage.loadLocal(CONFIG.STORAGE_KEYS.CARICHI, []);
        this.archiviaScaduti();
        console.log(`✅ Materie Prime: ${this.materiePrime.length} MP, ${this.carichi.length} carichi`);
        this.render();
    },

    archiviaScaduti() {
        const oggi = new Date();
        oggi.setHours(0, 0, 0, 0);
        let modificato = false;
        this.carichi.forEach(c => {
            if (!c.archiviato && c.scadenza && new Date(c.scadenza) < oggi) {
                c.archiviato = true;
                c.archiviatoAt = new Date().toISOString();
                modificato = true;
            }
        });
        if (modificato) this.save();
    },

    // ==========================================
    // SALVATAGGIO
    // ==========================================

    save() {
        Storage.saveLocal(CONFIG.STORAGE_KEYS.MATERIE_PRIME, this.materiePrime);
        Storage.saveLocal(CONFIG.STORAGE_KEYS.CARICHI, this.carichi);
        const now = new Date().toISOString();
        Storage.lastLocalSave[CONFIG.DROPBOX_PATHS.MATERIE_PRIME] = now;
        Storage.lastLocalSave[CONFIG.DROPBOX_PATHS.CARICHI] = now;
        localStorage.setItem('lastLocalSave_' + CONFIG.DROPBOX_PATHS.MATERIE_PRIME, now);
        localStorage.setItem('lastLocalSave_' + CONFIG.DROPBOX_PATHS.CARICHI, now);
        Storage.saveDropbox(CONFIG.DROPBOX_PATHS.MATERIE_PRIME, this.materiePrime);
        Storage.saveDropbox(CONFIG.DROPBOX_PATHS.CARICHI, this.carichi);
    },

    // ==========================================
    // GENERATORI ID e LOTTO
    // ==========================================

    newId() {
        return 'mp_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
    },

    // Genera riferimento interno lotto per fornitori senza lotto
    genLottoInterno(mpNome, data) {
        const d = (data || new Date().toISOString().split('T')[0]).replace(/-/g, '');
        const sigla = mpNome.replace(/[^a-zA-Z]/g, '').toUpperCase().substr(0, 6);
        return `INT-${sigla}-${d}`;
    },

    // ==========================================
    // CRUD ANAGRAFICA
    // ==========================================

    addMP(dati) {
        const nomeTrim = dati.nome.trim().toLowerCase();
        const esiste = this.materiePrime.find(m => m.nome.trim().toLowerCase() === nomeTrim);
        if (esiste) {
            Utils.showToast(`⚠️ "${dati.nome.trim()}" esiste già`, 'warning');
            return null;
        }
        const mp = {
            id: this.newId(),
            nome: dati.nome.trim(),
            fornitoreAbitual: dati.fornitoreAbitual?.trim() || '',
            unita: dati.unita || 'kg',
            note: dati.note?.trim() || '',
            foto: dati.foto?.trim() || '',
            createdAt: new Date().toISOString()
        };
        this.materiePrime.push(mp);
        this.save();
        return mp;
    },

    updateMP(id, dati) {
        const mp = this.materiePrime.find(m => m.id === id);
        if (!mp) return null;
        mp.nome = dati.nome?.trim() || mp.nome;
        mp.fornitoreAbitual = dati.fornitoreAbitual?.trim() ?? mp.fornitoreAbitual;
        mp.unita = dati.unita || mp.unita;
        mp.note = dati.note?.trim() ?? mp.note;
        this.save();
        return mp;
    },

    deleteMP(id) {
        // Controlla se ci sono carichi attivi
        const haCar = this.carichi.some(c => c.mpId === id && !c.archiviato);
        if (haCar) {
            Utils.showToast('⚠️ Archivia prima i lotti attivi di questa MP', 'warning');
            return false;
        }
        if (!confirm('Eliminare questa materia prima e tutto il suo storico carichi?')) return false;
        this.materiePrime = this.materiePrime.filter(m => m.id !== id);
        this.carichi = this.carichi.filter(c => c.mpId !== id);
        this.save();
        this.render();
        return true;
    },

    getMP(id) {
        return this.materiePrime.find(m => m.id === id);
    },

    getAllMP() {
        return [...this.materiePrime].sort((a, b) => a.nome.localeCompare(b.nome));
    },

    // ==========================================
    // CRUD CARICHI
    // ==========================================

    addCarico(dati) {
        const mp = this.getMP(dati.mpId);
        if (!mp) return null;

        // Se il fornitore non ha lotto, genera riferimento interno
        const lotto = dati.lotto?.trim()
            ? dati.lotto.trim()
            : this.genLottoInterno(mp.nome, dati.dataArrivo);

        const carico = {
            id: this.newId(),
            mpId: dati.mpId,
            mpNome: mp.nome,             // denormalizzato per praticità
            fornitore: dati.fornitore?.trim() || mp.fornitoreAbitual,
            lotto: lotto,
            lottoInterno: !dati.lotto?.trim(), // true = lotto generato da noi
            quantita: parseFloat(dati.quantita) || 0,
            quantitaUnita: dati.quantitaUnita || mp.unita,
            quantitaRimanente: parseFloat(dati.quantita) || 0,
            dataArrivo: dati.dataArrivo || new Date().toISOString().split('T')[0],
            scadenza: dati.scadenza?.trim() || '',
            note: dati.note?.trim() || '',
            foto: dati.foto?.trim() || '',
            archiviato: false,
            createdAt: new Date().toISOString()
        };

        this.carichi.push(carico);
        this.save();
        return carico;
    },

    archiviaCarico(id) {
        const c = this.carichi.find(c => c.id === id);
        if (!c) return;
        c.archiviato = true;
        c.archiviatoAt = new Date().toISOString();
        this.save();
        this.render();
        Utils.showToast('✅ Lotto archiviato', 'success');
    },

    deleteCarico(id) {
        if (!confirm('Eliminare questo carico dallo storico?')) return;
        const mpId = this.carichi.find(c => c.id === id)?.mpId;
        this.carichi = this.carichi.filter(c => c.id !== id);
        this.save();
        this.render();
        // Aggiorna il modal lotti se è aperto
        if (mpId && !document.getElementById('lotti-modal').classList.contains('hidden')) {
            this.renderModalLotti(mpId);
        }
    },

    openModalEditCarico(id) {
        const c = this.carichi.find(c => c.id === id);
        if (!c) return;
        // Chiudi prima il modal lotti
        this.closeModalLotti();
        document.getElementById('car-form-mpId').value = c.mpId;
        document.getElementById('car-modal-mp').textContent = c.mpNome;
        document.getElementById('car-form-fornitore').value = c.fornitore || '';
        document.getElementById('car-form-lotto').value = c.lottoInterno ? '' : c.lotto;
        document.getElementById('car-form-data').value = c.dataArrivo || '';
        document.getElementById('car-form-scadenza').value = c.scadenza || '';
        document.getElementById('car-form-note').value = c.note || '';
        document.getElementById('car-form-foto').value = c.foto || '';
        document.getElementById('car-form-congelato').checked = c.congelato || false;
        document.getElementById('car-form-quantita').value = c.quantita || '';
        document.getElementById('car-form-quantita-unita').value = c.quantitaUnita || 'kg';
        document.getElementById('car-modal').dataset.editId = id;
        document.getElementById('car-modal').dataset.mpId = c.mpId;
        document.getElementById('car-modal').classList.remove('hidden');
    },

    // Restituisce i lotti attivi di una MP, ordinati FIFO (più vecchio prima)
    getLottiAttivi(mpId) {
        const oggi = new Date();
        oggi.setHours(0, 0, 0, 0);
        return this.carichi
            .filter(c => c.mpId === mpId && !c.archiviato)
            .sort((a, b) => {
                const aScaduto = a.scadenza && new Date(a.scadenza) < oggi;
                const bScaduto = b.scadenza && new Date(b.scadenza) < oggi;
                // Scaduti sempre in fondo
                if (aScaduto && !bScaduto) return 1;
                if (!aScaduto && bScaduto) return -1;
                // Tra non scaduti: FIFO (più vecchio prima)
                return new Date(a.dataArrivo) - new Date(b.dataArrivo);
            });
    },

    // Restituisce tutti i lotti (attivi + archiviati) di una MP
    getTuttiLotti(mpId) {
        return this.carichi
            .filter(c => c.mpId === mpId)
            .sort((a, b) => new Date(b.dataArrivo) - new Date(a.dataArrivo)); // più recente prima
    },

    // Usato dalla produzione: restituisce gli ultimi 2 lotti attivi per selezione
    getLottiPerProduzione(mpId) {
        const oggi = new Date();
        oggi.setHours(0, 0, 0, 0);
        const attivi = this.getLottiAttivi(mpId);
        const validi = attivi.filter(l => !l.scadenza || new Date(l.scadenza) >= oggi);
        const scaduti = attivi.filter(l => l.scadenza && new Date(l.scadenza) < oggi);

        // Includi anche gli archiviati recenti (ultimi 30 giorni)
        const trentaGiorni = new Date();
        trentaGiorni.setDate(trentaGiorni.getDate() - 30);
        const archivatiRecenti = this.carichi.filter(c =>
            c.mpId === mpId &&
            c.archiviato &&
            new Date(c.archiviatoAt || c.dataArrivo) >= trentaGiorni
        );

        return [...validi, ...scaduti, ...archivatiRecenti].slice(0, 5);
    },

    // ==========================================
    // RENDER PRINCIPALE
    // ==========================================

    render() {
        this.renderListaMP();
    },

    renderListaMP() {
        const container = document.getElementById('materie-list');
        if (!container) return;

        const search = document.getElementById('mp-search')?.value?.toLowerCase() || '';

        let mp = this.getAllMP();

        if (search) {
            mp = mp.filter(m =>
                m.nome.toLowerCase().includes(search) ||
                m.fornitoreAbitual.toLowerCase().includes(search)
            );
        }

        if (mp.length === 0) {
            container.innerHTML = `
                <div class="text-center py-12 text-gray-400">
                    <div class="text-5xl mb-3">📦</div>
                    <p class="text-lg">Nessuna materia prima trovata.</p>
                </div>`;
            return;
        }

        // Separa MP con lotti in scadenza/esauriti da quelle ok
        const critiche = mp.filter(m => {
            const attivi = this.getLottiAttivi(m.id);
            if (attivi.length === 0) return true;
            const oggi = new Date();
            oggi.setHours(0, 0, 0, 0);
            const prossimo = attivi.find(l => !l.scadenza || new Date(l.scadenza) >= oggi) || attivi[0];
            if (!prossimo.scadenza) return false;
            const diffGg = Math.ceil((new Date(prossimo.scadenza) - new Date()) / 86400000);
            return diffGg <= 7;
        });
        const ok = mp.filter(m => !critiche.find(c => c.id === m.id));

        let html = '';

        if (critiche.length > 0) {
            const sezId = 'mp-sez-critiche';
            html += `
            <div class="mb-2 mt-2">
                <button onclick="MateriePrimeModule.toggleSezione('${sezId}')"
                    class="w-full flex items-center justify-between px-3 py-2 bg-red-50 hover:bg-red-100 rounded-lg transition-colors">
                    <span class="flex items-center gap-2">
                        <span class="text-xs font-bold text-red-500 uppercase tracking-wider">⚠️ Attenzione</span>
                        <span class="bg-red-200 text-red-700 rounded-full px-2 py-0.5 text-xs font-medium">
                            ${critiche.length}
                        </span>
                    </span>
                    <span id="${sezId}-icon" class="text-red-400 text-sm">▼</span>
                </button>
                <div id="${sezId}" class="mt-1 card-grid">
                    ${critiche.map(m => this.renderCardMP(m)).join('')}
                </div>
            </div>`;
        }

        if (ok.length > 0) {
            const sezId = 'mp-sez-ok';
            html += `
            <div class="mb-2 mt-2">
                <button onclick="MateriePrimeModule.toggleSezione('${sezId}')"
                    class="w-full flex items-center justify-between px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors">
                    <span class="flex items-center gap-2">
                        <span class="text-xs font-bold text-gray-500 uppercase tracking-wider">✅ Regolari</span>
                        <span class="bg-gray-300 text-gray-600 rounded-full px-2 py-0.5 text-xs font-medium">
                            ${ok.length}
                        </span>
                    </span>
                    <span id="${sezId}-icon" class="text-gray-400 text-sm">▼</span>
                </button>
                <div id="${sezId}" class="mt-1 card-grid">
                    ${ok.map(m => this.renderCardMP(m)).join('')}
                </div>
            </div>`;
        }

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

    renderCardMP(m) {
        const attivi = this.getLottiAttivi(m.id);
        const nAttivi = attivi.length;
        const prossimo = attivi[0];

        const badgeColor = nAttivi === 0
            ? 'bg-red-100 text-red-700 border-red-200'
            : nAttivi === 1
                ? 'bg-yellow-100 text-yellow-700 border-yellow-200'
                : 'bg-green-100 text-green-700 border-green-200';

        const scadAvviso = prossimo?.scadenza
            ? this.avvisoScadenza(prossimo.scadenza)
            : '';

        return `
        <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-2 md:mb-0">
            <div class="flex items-start justify-between gap-3">
                <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-2 flex-wrap">
                        <h3 class="font-bold text-gray-800 text-lg">${m.nome}</h3>
                        <span class="text-xs border rounded-full px-2 py-0.5 font-medium ${badgeColor}">
                            ${nAttivi} lott${nAttivi === 1 ? 'o' : 'i'} attiv${nAttivi === 1 ? 'o' : 'i'}
                        </span>
                    </div>
                    <div class="text-sm text-gray-500 mt-0.5">
                        ${m.fornitoreAbitual ? `📦 ${m.fornitoreAbitual} &nbsp;·&nbsp;` : ''}
                        ${m.unita}
                    </div>
                    ${prossimo ? `
                    <div class="mt-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5 text-sm">
                        <span class="font-medium text-amber-800">🏷 FIFO: ${prossimo.lotto}</span>
                        <span class="text-amber-600 ml-2">· arr. ${this.fmtData(prossimo.dataArrivo)}</span>
                        ${prossimo.scadenza ? `<span class="text-amber-600"> · scad. ${this.fmtData(prossimo.scadenza)}</span>` : ''}
                        ${scadAvviso}
                    </div>` : `
                    <div class="mt-2 text-sm text-red-500 font-medium">⚠️ Nessun lotto disponibile</div>`}
                </div>
                <div class="flex flex-col gap-1.5 flex-shrink-0">
                    <button onclick="MateriePrimeModule.openModalCarico('${m.id}')"
                        class="bg-amber-700 text-white text-xs px-2.5 py-1.5 rounded-lg hover:bg-amber-800 font-medium whitespace-nowrap">
                        + Carico
                    </button>
                    <button onclick="MateriePrimeModule.openModalLotti('${m.id}')"
                        class="bg-gray-100 text-gray-700 text-xs px-2.5 py-1.5 rounded-lg hover:bg-gray-200 font-medium whitespace-nowrap">
                        📋 Lotti
                    </button>
                    <button onclick="MateriePrimeModule.openModalEditMP('${m.id}')"
                        class="bg-gray-100 text-gray-700 text-xs px-2.5 py-1.5 rounded-lg hover:bg-gray-200 font-medium whitespace-nowrap">
                        ✏️ Modifica
                    </button>
                </div>
            </div>
        </div>`;
    },
    // ==========================================
    // HELPERS UI
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
        if (diffGg < 0) return `<span class="text-red-600 font-bold ml-1">⛔ SCADUTO</span>`;
        if (diffGg <= 7) return `<span class="text-red-500 font-bold ml-1">⚠️ scade tra ${diffGg}gg</span>`;
        if (diffGg <= 30) return `<span class="text-orange-500 ml-1">⚠️ scade tra ${diffGg}gg</span>`;
        return '';
    },

    // ==========================================
    // MODAL: NUOVA / MODIFICA MP
    // ==========================================

    openModalNewMP() {
        document.getElementById('mp-modal-title').textContent = '+ Nuova Materia Prima';
        document.getElementById('mp-form-id').value = '';
        document.getElementById('mp-form-nome').value = '';
        document.getElementById('mp-form-fornitore').value = '';
        document.getElementById('mp-form-unita').value = 'kg';
        document.getElementById('mp-form-note').value = '';
        document.getElementById('mp-modal').classList.remove('hidden');
        document.getElementById('mp-form-nome').focus();
        document.getElementById('mp-btn-elimina')?.classList.add('hidden');

    },

    openModalEditMP(id) {
        const mp = this.getMP(id);
        if (!mp) return;
        document.getElementById('mp-modal-title').textContent = '✏️ Modifica Materia Prima';
        document.getElementById('mp-form-id').value = mp.id;
        document.getElementById('mp-form-nome').value = mp.nome;
        document.getElementById('mp-form-fornitore').value = mp.fornitoreAbitual;
        document.getElementById('mp-form-unita').value = mp.unita;
        document.getElementById('mp-form-note').value = mp.note;
        document.getElementById('mp-modal').classList.remove('hidden');
        document.getElementById('mp-btn-elimina')?.classList.remove('hidden');
    },

    closeModalMP() {
        document.getElementById('mp-modal').classList.add('hidden');
    },

    eliminaDalModal() {
        const id = document.getElementById('mp-form-id').value;
        if (!id) return;
        this.closeModalMP();
        this.deleteMP(id);
    },

    saveModalMP() {
        const id = document.getElementById('mp-form-id').value;
        const nome = document.getElementById('mp-form-nome').value.trim();
        const fornitore = document.getElementById('mp-form-fornitore').value.trim();
        const unita = document.getElementById('mp-form-unita').value;
        const note = document.getElementById('mp-form-note').value.trim();

        if (!nome) { Utils.showToast('⚠️ Il nome è obbligatorio', 'warning'); return; }

        if (id) {
            this.updateMP(id, { nome, fornitoreAbitual: fornitore, unita, note });
            Utils.showToast('✅ Materia prima aggiornata', 'success');
        } else {
            const nuova = this.addMP({ nome, fornitoreAbitual: fornitore, unita, note });
            if (!nuova) return;
            Utils.showToast(`✅ "${nome}" aggiunta`, 'success');
        }

        this.closeModalMP();
        this.render();
    },

    // ==========================================
    // MODAL: NUOVO CARICO
    // ==========================================

    openModalCarico(mpId) {
        const mp = this.getMP(mpId);
        if (!mp) return;
        document.getElementById('car-form-mpId').value = mpId;
        document.getElementById('car-modal-mp').textContent = mp.nome;
        document.getElementById('car-form-fornitore').value = mp.fornitoreAbitual;
        document.getElementById('car-form-lotto').value = '';
        document.getElementById('car-form-data').value = new Date().toISOString().split('T')[0];
        document.getElementById('car-form-scadenza').value = '';
        document.getElementById('car-form-note').value = '';
        document.getElementById('car-form-foto').value = '';
        document.getElementById('car-form-congelato').checked = false;
        document.getElementById('car-form-quantita').value = '';                    // ← AGGIUNGI
        document.getElementById('car-form-quantita-unita').value = mp.unita || 'kg'; // ← AGGIUNGI
        document.getElementById('car-modal').classList.remove('hidden');
        document.getElementById('car-form-lotto').focus();
    },

    closeModalCarico() {
        document.getElementById('car-modal').classList.add('hidden');
    },

    saveModalCarico() {
        const editId = document.getElementById('car-modal').dataset.editId;
        const mpId = document.getElementById('car-form-mpId').value;
        const fornitore = document.getElementById('car-form-fornitore').value.trim();
        const lotto = document.getElementById('car-form-lotto').value.trim();
        const data = document.getElementById('car-form-data').value;
        const scadenza = document.getElementById('car-form-scadenza').value;
        const note = document.getElementById('car-form-note').value.trim();
        const foto = document.getElementById('car-form-foto').value.trim();
        const quantita = document.getElementById('car-form-quantita').value;
        const quantitaUnita = document.getElementById('car-form-quantita-unita').value;

        if (!data) { Utils.showToast('⚠️ La data di arrivo è obbligatoria', 'warning'); return; }

        if (editId) {
            // Modifica carico esistente
            const c = this.carichi.find(c => c.id === editId);
            if (c) {
                c.fornitore = fornitore;
                c.lotto = lotto || this.genLottoInterno(c.mpNome);
                c.lottoInterno = !lotto;
                c.dataArrivo = data;
                c.scadenza = scadenza;
                c.note = note;
                c.foto = foto;
                c.updatedAt = new Date().toISOString();
            }
            delete document.getElementById('car-modal').dataset.editId;
            Utils.showToast('✅ Carico aggiornato', 'success');
        } else {
            // Nuovo carico
            const carico = this.addCarico({ mpId, fornitore, lotto, dataArrivo: data, scadenza, note, foto, congelato, quantita, quantitaUnita });
            if (!lotto) {
                Utils.showToast(`✅ Carico registrato · Lotto interno: ${carico.lotto}`, 'success');
            } else {
                Utils.showToast(`✅ Carico registrato · Lotto: ${carico.lotto}`, 'success');
            }
        }

        this.save();
        const mpIdRiapri = document.getElementById('car-modal').dataset.mpId;
        delete document.getElementById('car-modal').dataset.editId;
        delete document.getElementById('car-modal').dataset.mpId;
        this.closeModalCarico();
        this.render();
        if (mpIdRiapri) this.openModalLotti(mpIdRiapri);
        // Riapri il modal lotti se era aperto
        const mpId2 = document.getElementById('lotti-modal-mpId')?.value;
        if (mpId2 && !document.getElementById('lotti-modal').classList.contains('hidden')) {
            this.renderModalLotti(mpId2);
        }
    },

    // ==========================================
    // MODAL: LISTA LOTTI
    // ==========================================

    openModalLotti(mpId) {
        const mp = this.getMP(mpId);
        if (!mp) return;
        document.getElementById('lotti-modal-mp').textContent = mp.nome;
        document.getElementById('lotti-modal-mpId').value = mpId;
        this.renderModalLotti(mpId);
        document.getElementById('lotti-modal').classList.remove('hidden');
    },

    closeModalLotti() {
        document.getElementById('lotti-modal').classList.add('hidden');
    },

    renderModalLotti(mpId) {
        const tutti = this.getTuttiLotti(mpId);
        const el = document.getElementById('lotti-modal-list');

        if (tutti.length === 0) {
            el.innerHTML = '<p class="text-gray-400 text-center py-6">Nessun carico registrato.</p>';
            return;
        }

        const attivi = tutti.filter(c => !c.archiviato);
        const archiviati = tutti.filter(c => c.archiviato);

        let html = '';

        if (attivi.length > 0) {
            html += `<p class="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Attivi (${attivi.length})</p>`;
            html += attivi.map(c => this.renderRigaLotto(c)).join('');
        } else {
            html += `<p class="text-sm text-red-400 mb-3">⚠️ Nessun lotto attivo</p>`;
        }

        if (archiviati.length > 0) {
            html += `
            <div class="mt-4">
                <button onclick="MateriePrimeModule.toggleArchiviati('${mpId}')"
                    class="w-full flex items-center justify-between px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-xs font-bold text-gray-400 uppercase tracking-wider">
                    <span>Archiviati (${archiviati.length})</span>
                    <span id="arch-icon-${mpId}">▶</span>
                </button>
                <div id="arch-list-${mpId}" class="hidden mt-1">
                    ${archiviati.map(c => this.renderRigaLotto(c)).join('')}
                </div>
            </div>`;
        }

        el.innerHTML = html;
    },

    toggleArchiviati(mpId) {
        const el = document.getElementById(`arch-list-${mpId}`);
        const icon = document.getElementById(`arch-icon-${mpId}`);
        if (!el) return;
        const isOpen = el.classList.contains('hidden');
        el.classList.toggle('hidden', !isOpen);
        icon.textContent = isOpen ? '▼' : '▶';
    },

    renderRigaLotto(c) {
        const scadAvv = c.scadenza ? this.avvisoScadenza(c.scadenza) : '';
        return `
        <div class="border rounded-lg p-3 mb-2 ${c.archiviato ? 'bg-gray-50 opacity-60' : 'bg-white'}">
            <div class="flex items-start justify-between gap-2">
                <div class="flex-1">
                    <div class="flex items-center gap-2 flex-wrap">
                        <span class="font-mono font-bold text-amber-800">${c.lotto}</span>
                        ${c.lottoInterno ? '<span class="text-xs bg-gray-200 text-gray-600 px-1.5 rounded">interno</span>' : ''}
                        ${c.archiviato
                ? '<span class="text-xs bg-gray-300 text-gray-600 px-1.5 rounded">archiviato</span>'
                : '<span class="text-xs bg-green-100 text-green-700 px-1.5 rounded font-medium">attivo</span>'}
                    </div>
                    <div class="text-sm text-gray-600 mt-1">
                        📦 ${c.fornitore || '–'} &nbsp;·&nbsp;
                        arr. ${this.fmtData(c.dataArrivo)}
                        ${c.scadenza ? ` &nbsp;·&nbsp; scad. ${this.fmtData(c.scadenza)}` : ''}
                        ${scadAvv}
                    </div>
                    ${c.note ? `<div class="text-xs text-gray-400 mt-0.5 italic">${c.note}</div>` : ''}
                    ${c.foto ? `<a href="${c.foto}" target="_blank"
                        class="text-xs text-blue-500 hover:text-blue-700 mt-0.5 block">📷 Vedi foto DDT</a>` : ''}
                </div>
                <div class="flex flex-col gap-1 flex-shrink-0">
                    ${!c.archiviato ? `
                    <button onclick="MateriePrimeModule.archiviaCarico('${c.id}')"
                        class="text-xs bg-gray-200 text-gray-700 px-2 py-1 rounded hover:bg-gray-300">
                        Archivia
                    </button>` : ''}
                    <button onclick="MateriePrimeModule.openModalEditCarico('${c.id}')"
                        class="text-xs bg-blue-100 text-blue-600 px-2 py-1 rounded hover:bg-blue-200">
                        ✏️ Modifica
                    </button>
                    <button onclick="MateriePrimeModule.deleteCarico('${c.id}')"
                        class="text-xs bg-red-100 text-red-600 px-2 py-1 rounded hover:bg-red-200">
                        Elimina
                    </button>
                </div>
            </div>
        </div>`;
    },

    // ==========================================
    // RICERCA
    // ==========================================

    cercaMP(query) {
        this.renderListaMP();
    },
};

window.MateriePrimeModule = MateriePrimeModule;
console.log('✅ MateriePrimeModule caricato');
