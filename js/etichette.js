const EtichetteModule = {

    render() {
        const container = document.getElementById('etichette-list');
        if (!container) return;

        const produzioni = ProduzioneModule.produzioni || [];

        if (produzioni.length === 0) {
            container.innerHTML = `<div class="text-center py-12 text-gray-400">
            <div class="text-5xl mb-3">🏷️</div>
            <p>Nessuna produzione disponibile.</p>
        </div>`;
            return;
        }

        const sorted = [...produzioni].sort((a, b) => new Date(b.data) - new Date(a.data));

        // Sezioni come in produzione
        const sezioni = [
            { key: 'Pasta fresca ripiena', label: 'Pasta fresca ripiena', emoji: '🍝' },
            { key: 'Gastronomia', label: 'Gastronomia', emoji: '🥘' },
            { key: 'Sfoglia', label: 'Sfoglia', emoji: '🍃' },
            { key: 'Semilavorato base', label: 'Semilavorati base', emoji: '🧱' },
            { key: 'Semilavorato composto', label: 'Semilavorati composti', emoji: '🔧' },
        ];

        let html = `
        <div class="mb-4">
            <input type="text" id="et-search" placeholder="🔍 Cerca prodotto o lotto..."
                class="w-full px-4 py-2 border rounded-lg text-sm"
                oninput="EtichetteModule.filtra()">
        </div>`;

        sezioni.forEach(sez => {
            const items = sorted.filter(p => {
                if (p.categoria) return p.categoria === sez.key;
                // Fallback per produzioni vecchie: cerca la categoria dalla ricetta
                const ricetta = RicetteModule.getAllRicette().find(r => r.id === p.ricettaId);
                return ricetta?.categoria === sez.key;
            });
            if (items.length === 0) return;
            const sezId = `et-sez-${sez.key.replace(/\s+/g, '-').toLowerCase()}`;
            html += `
        <div class="mb-2 mt-4">
            <button onclick="EtichetteModule.toggleSezione('${sezId}')"
                class="w-full flex items-center justify-between px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors">
                <span class="flex items-center gap-2">
                    <span class="text-xs font-bold text-gray-500 uppercase tracking-wider">
                        ${sez.emoji} ${sez.label}
                    </span>
                    <span class="bg-gray-300 text-gray-600 rounded-full px-2 py-0.5 text-xs font-medium">
                        ${items.length}
                    </span>
                </span>
                <span id="${sezId}-icon" class="text-gray-400 text-sm">▼</span>
            </button>
            <div id="${sezId}" class="mt-1 card-grid">
                ${items.map(p => this.renderCard(p)).join('')}
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
        el.style.display = isOpen ? 'none' : '';
        if (icon) icon.textContent = isOpen ? '▶' : '▼';
    },

    filtra() {
        const q = document.getElementById('et-search')?.value?.toLowerCase() || '';
        if (!q) { this.render(); return; }
        const produzioni = ProduzioneModule.produzioni || [];
        const filtered = produzioni
            .filter(p =>
                (p.nome || p.ricettaNome || '').toLowerCase().includes(q) ||
                (p.lotto || '').toLowerCase().includes(q)
            )
            .sort((a, b) => new Date(b.data) - new Date(a.data));
        const container = document.getElementById('etichette-list');
        if (!container) return;
        container.innerHTML = `
        <div class="mb-4">
            <input type="text" id="et-search" placeholder="🔍 Cerca prodotto o lotto..."
                class="w-full px-4 py-2 border rounded-lg text-sm"
                oninput="EtichetteModule.filtra()">
        </div>
        <div class="card-grid">
            ${filtered.map(p => this.renderCard(p)).join('')}
        </div>`;
        document.getElementById('et-search').value = q;
        document.getElementById('et-search').focus();
    },

    renderCard(p) {
        const data = p.data ? new Date(p.data).toLocaleDateString('it-IT') : '';
        return `
            <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-2 md:mb-0">
                <div class="font-bold text-gray-800 truncate">${p.nome || p.ricettaNome || '—'}</div>
                <div class="text-xs text-gray-500 mt-1">Lotto: <span class="font-mono font-bold">${p.lotto || '—'}</span></div>
                <div class="text-xs text-gray-400">${data}</div>
                ${p.quantita ? `<div class="text-xs text-gray-400">${p.quantita} ${p.unita || ''}</div>` : ''}
                <button onclick="EtichetteModule.stampa('${p.id}')"
                    class="mt-3 w-full bg-amber-800 text-white text-sm py-2 rounded-lg hover:bg-amber-900 font-medium">
                    🖨️ Stampa etichetta
                </button>
            </div>`;
    },

    getIngredienti(p) {
        if (!p.ricettaId) return '';
        const ricette = RicetteModule.getAllRicette ? RicetteModule.getAllRicette() : [];
        const ricetta = ricette.find(r => r.id === p.ricettaId);
        if (!ricetta || !ricetta.ingredienti || ricetta.ingredienti.length === 0) return '';
        return ricetta.ingredienti
            .map(i => i.refNome || i.nome || i.refId || '')
            .filter(Boolean)
            .join(', ');
    },

    stampa(prodId) {
        const prod = (ProduzioneModule.produzioni || []).find(p => p.id === prodId);
        if (!prod) return;

        const data = prod.data ? new Date(prod.data).toLocaleDateString('it-IT') : '';
        const ingredienti = this.getIngredienti(prod);

        const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8">
<style>
  @page { size: 60mm 40mm; margin: 0; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    width: 60mm; height: 40mm;
    font-family: Arial, sans-serif;
    padding: 2.5mm;
    display: flex;
    flex-direction: column;
    gap: 0.8mm;
  }
  .shop  { font-size: 6pt; color: #555; text-transform: uppercase; letter-spacing: 0.4px; }
  .nome  { font-size: 12pt; font-weight: bold; color: #000; line-height: 1.1; }
  .lotto { font-size: 7pt; color: #333; }
  .data  { font-size: 7pt; color: #333; }
  .sep   { border-top: 0.3mm solid #bbb; margin: 0.5mm 0; }
  .ing-label { font-size: 5.5pt; text-transform: uppercase; color: #777; }
  .ing   { font-size: 6pt; color: #333; line-height: 1.3; }
</style>
</head><body>
  <div class="shop">🍝 Pastificio Gramsci — Collegno (TO)</div>
  <div class="nome">${prod.nome || prod.ricettaNome || '—'}</div>
  <div class="lotto">Lotto: <strong>${prod.lotto || prod.id?.substring(0, 10)}</strong></div>
  <div class="data">Prodotto il: ${data}</div>
  <div class="sep"></div>
  <div class="ing-label">Ingredienti</div>
  <div class="ing">${ingredienti || '—'}</div>
</body></html>`;

        const win = window.open('', '_blank', 'width=320,height=260');
        win.document.write(html);
        win.document.close();
        win.onload = () => { win.focus(); win.print(); };
    }
};

window.EtichetteModule = EtichetteModule;
console.log("✅ EtichetteModule caricato");