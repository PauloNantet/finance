// --- LOGIN ---
// Sem token salvo: redireciona para a tela de login e para o script
if (!localStorage.getItem('fin_token')) {
    window.location.href = 'login.html';
    throw new Error('Sem sessão: redirecionando para login');
}

function authHeaders() {
    return { 'Authorization': 'Bearer ' + (localStorage.getItem('fin_token') || '') };
}

function logoutForced() {
    localStorage.removeItem('fin_token');
    window.location.href = 'login.html';
}

const transactionList = document.getElementById('transaction-list');
const transactionListIncome = document.getElementById('transaction-list-income');
const totalBalance = document.getElementById('total-balance');
const totalIncome = document.getElementById('total-income');
const totalExpense = document.getElementById('total-expense');
const btnAddInline = document.getElementById('btn-add-inline');
const btnAddIncome = document.getElementById('btn-add-income');

const btnSaveDb = document.getElementById('btn-save-db');
const btnLoadDb = document.getElementById('btn-load-db');
const inputDb = document.getElementById('input-db');

const settingsOverlay = document.getElementById('settings-overlay');
const btnSettings = document.getElementById('btn-settings');
const btnCloseSettings = document.getElementById('btn-close-settings');
const btnTheme = document.getElementById('btn-theme');

// Theme toggle
btnTheme.addEventListener('click', function() {
  const current = document.body.dataset.theme;
  const next = current === 'white' ? '' : 'white';
  document.body.dataset.theme = next;
  localStorage.setItem('fatura_theme', next || '');
  btnTheme.textContent = next === 'white' ? '☀️' : '🌙';
});

// Apply saved theme icon on load
(function() {
  const saved = localStorage.getItem('fatura_theme');
  if (saved) {
    btnTheme.textContent = saved === 'white' ? '☀️' : '🌙';
  } else {
    btnTheme.textContent = '🌙';
  }
})();

// Calendário abre clicando no input de data (ícone removido via CSS)
document.addEventListener('click', (e) => {
  const el = e.target && e.target.closest ? e.target.closest('input[type="date"]') : null;
  if (!el || el.disabled || el.readOnly) return;
  if (typeof el.showPicker === 'function') {
    try { el.showPicker(); } catch (err) { /* picker já aberto ou sem suporte */ }
  }
});

// Some a borda vermelha ao preencher o campo
document.addEventListener('input', (e) => {
  if (e.target && e.target.classList && e.target.classList.contains('input-error') && e.target.value) {
    e.target.classList.remove('input-error');
  }
});
document.addEventListener('change', (e) => {
  if (e.target && e.target.classList && e.target.classList.contains('input-error') && e.target.value) {
    e.target.classList.remove('input-error');
  }
});

// Drag-to-scroll for table containers
document.querySelectorAll('.table-container').forEach(function(container) {
  var isDown = false;
  var startX, scrollLeft;

  container.addEventListener('mousedown', function(e) {
    isDown = true;
    container.classList.add('dragging');
    startX = e.pageX - container.offsetLeft;
    scrollLeft = container.scrollLeft;
  });

  container.addEventListener('mouseleave', function() {
    isDown = false;
    container.classList.remove('dragging');
  });

  container.addEventListener('mouseup', function() {
    isDown = false;
    container.classList.remove('dragging');
  });

  container.addEventListener('mousemove', function(e) {
    if (!isDown) return;
    e.preventDefault();
    var x = e.pageX - container.offsetLeft;
    var walk = (x - startX) * 1.5;
    container.scrollLeft = scrollLeft - walk;
  });
});

const selectCategory = document.getElementById('category');
const selectPayment = document.getElementById('payment');
const selectUser = document.getElementById('user');
const selectStatus = document.getElementById('status');
const inputPaymentDate = document.getElementById('payment-date');
// Aba Receitas (sufixo -income)
const selectCategoryIncome = document.getElementById('category-income');
const selectPaymentIncome = document.getElementById('payment-income');
const selectUserIncome = document.getElementById('user-income');
const selectStatusIncome = document.getElementById('status-income');
const inputPaymentDateIncome = document.getElementById('payment-date-income');

let transactions = [];
let configs = {
    category: [], user: [], payment: [], paymentIncome: [], status: [], type: ['Receita', 'Despesa'], titular: '', descriptions: []
};

function findPaymentCfg(name) {
    return (configs.payment || []).find(p => p.name === name)
        || (configs.paymentIncome || []).find(p => p.name === name)
        || { startDay: 1, avista: true, color: '#777' };
}

function setTitular(val) {
    console.log('Definindo titular como:', val);
    configs.titular = val;
    const uInc = document.getElementById('user-income');
    if (uInc && val) uInc.value = val;
    saveToServer().then(() => {
        console.log('Titular salvo com sucesso!');
        if (document.getElementById('content-summary').classList.contains('active')) {
            renderSummary();
        }
    });
}

let activeFilters = {
    year: [], month: [], day: [], payment: [], paymentIncome: [], user: [], category: [], status: [], type: []
};

let activeMultiSelect = {
    year: false, month: false, day: false, payment: false, paymentIncome: false, user: false, category: false, status: false, type: false
};

let editingId = null;
let sortConfig = { key: 'date', direction: 'desc' };

const monthNames = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const dayNames = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function formatCurrency(v) { return parseFloat(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }

function closingDayOf(pay) {
    return pay.closingDay ?? pay.startDay ?? 1;
}
function dueDayOf(pay) {
    return pay.dueDay ?? closingDayOf(pay);
}

function lastDayOf(y, m) { return new Date(y, m + 1, 0).getDate(); }
function fmtYMD(y, m, d) {
    return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}
// Próxima ocorrência do dia `day` ESTRITAMENTE após `fromStr` (sempre pra frente)
function nextOccurrence(fromStr, day) {
    let y = parseInt(fromStr.slice(0, 4));
    let m = parseInt(fromStr.slice(5, 7)) - 1;
    const d = parseInt(fromStr.slice(8, 10));
    day = Math.min(Math.max(day, 1), 31);
    if (Math.min(day, lastDayOf(y, m)) > d) return fmtYMD(y, m, Math.min(day, lastDayOf(y, m)));
    m++;
    if (m > 11) { m = 0; y++; }
    return fmtYMD(y, m, Math.min(day, lastDayOf(y, m)));
}

// Vencimento fatura: próximo fechamento após a compra, depois próximo vencimento após o fechamento.
// Ex BV (fecha 29, vence 5): compra 28/9 → fecha 29/9 → vence 5/10; compra 29/9 → fecha 29/10 → vence 5/11.
// À vista (Dinheiro/Pix): vence no dia da compra.
function dueDateStr(t) {
    if (!t.date) return '';
    const pay = findPaymentCfg(t.payment);
    if (pay.avista) return t.date;
    const closingDate = nextOccurrence(t.date, closingDayOf(pay));
    return nextOccurrence(closingDate, dueDayOf(pay));
}

// Mês de referência = mês do VENCIMENTO (fatura "de outubro" = vence em outubro).
function getReferenceMonth(dateStr, paymentName) {
    if (!dateStr) return { month: -1, year: 0, name: '' };
    const pay = findPaymentCfg(paymentName);
    // À vista: vale do dia 1 ao último — mês da compra
    if (pay.avista) {
        const date = new Date(dateStr + 'T00:00:00');
        return { month: date.getMonth(), year: date.getFullYear(), name: monthNames[date.getMonth()] };
    }
    const due = dueDateStr({ date: dateStr, payment: paymentName });
    const month = parseInt(due.slice(5, 7)) - 1;
    const year = parseInt(due.slice(0, 4));
    return { month, year, name: monthNames[month] };
}

function migratePayments(list) {
    if (!Array.isArray(list)) return [];
    return list.map(p => {
        const closing = p.closingDay ?? p.startDay ?? 1;
        const isAvista = p.avista ?? /^(dinheiro|pix)$/i.test((p.name || '').trim());
        return {
            name: p.name,
            closingDay: closing,
            dueDay: p.dueDay ?? closing,
            avista: !!isAvista,
            color: p.color || '#4a90e2'
        };
    });
}

function parseInstallment(desc) {
    const m = desc.match(/^(.*) \((\d+)\/(\d+)\)(?: \(R\$[ \u00A0][\d.,]+\))?$/);
    return m ? { base: m[1], current: parseInt(m[2]), total: parseInt(m[3]) } : null;
}

function makeInstallmentDesc(base, current, total, amount) {
    const totalVal = parseFloat(amount) * total;
    const fmt = totalVal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }).replace(/\u00A0/g, ' ');
    return `${base} (${current}/${total}) (${fmt})`;
}

function addMonths(dateStr, n) {
    const d = new Date(dateStr + 'T00:00:00');
    const day = d.getDate();
    d.setMonth(d.getMonth() + n);
    if (d.getDate() !== day) d.setDate(0);
    return d.toISOString().split('T')[0];
}

function setupDescAutocompleteFor(inputId, dropdownId) {
    const input = document.getElementById(inputId);
    const dropdown = document.getElementById(dropdownId);
    if (!input || !dropdown || input.dataset.autocompleteSetup) return;
    input.dataset.autocompleteSetup = '1';

    function positionDropdown(container, inp) {
        const rect = inp.getBoundingClientRect();
        container.style.left = rect.left + 'px';
        container.style.top = (rect.bottom) + 'px';
        container.style.width = rect.width + 'px';
    }

    function showSuggestions(container, inp) {
        const val = inp.value.trim().toLowerCase();
        container.innerHTML = '';
        if (!val) { container.style.display = 'none'; return; }
        const matches = (configs.descriptions || []).filter(kw => kw.toLowerCase().includes(val));
        if (matches.length === 0) { container.style.display = 'none'; return; }
        matches.forEach(kw => {
            const div = document.createElement('div');
            div.className = 'autocomplete-item';
            div.textContent = kw;
            div.onclick = () => { inp.value = kw; container.style.display = 'none'; };
            container.appendChild(div);
        });
        positionDropdown(container, inp);
        container.style.display = 'block';
    }

    input.addEventListener('input', () => showSuggestions(dropdown, input));
    document.addEventListener('click', (e) => {
        if (!dropdown.contains(e.target) && e.target !== input) dropdown.style.display = 'none';
    });
    window.addEventListener('scroll', () => { if (dropdown.style.display === 'block') positionDropdown(dropdown, input); }, true);
    window.addEventListener('resize', () => { if (dropdown.style.display === 'block') positionDropdown(dropdown, input); });
}

function setupDescAutocomplete() {
    setupDescAutocompleteFor('description', 'desc-autocomplete');
    setupDescAutocompleteFor('description-income', 'desc-autocomplete-income');
    const input = document.getElementById('description');
    const editInputs = () => document.querySelectorAll('input[id^="edit-desc-"]');
    const dropdown = document.getElementById('desc-autocomplete');
    if (!input || !dropdown) return;

    function positionDropdown(container, inp) {
        const rect = inp.getBoundingClientRect();
        container.style.left = rect.left + 'px';
        container.style.top = (rect.bottom) + 'px';
        container.style.width = rect.width + 'px';
    }

    function showSuggestions(container, inp) {
        const val = inp.value.trim().toLowerCase();
        container.innerHTML = '';
        if (!val) { container.style.display = 'none'; return; }
        const matches = (configs.descriptions || []).filter(kw => kw.toLowerCase().includes(val));
        if (matches.length === 0) { container.style.display = 'none'; return; }
        matches.forEach(kw => {
            const div = document.createElement('div');
            div.className = 'autocomplete-item';
            div.textContent = kw;
            div.onclick = () => { inp.value = kw; container.style.display = 'none'; };
            container.appendChild(div);
        });
        positionDropdown(container, inp);
        container.style.display = 'block';
    }

    input.addEventListener('input', () => showSuggestions(dropdown, input));
    document.addEventListener('click', (e) => {
        if (!dropdown.contains(e.target) && e.target !== input) dropdown.style.display = 'none';
    });
    window.addEventListener('scroll', () => { if (dropdown.style.display === 'block') positionDropdown(dropdown, input); }, true);
    window.addEventListener('resize', () => { if (dropdown.style.display === 'block') positionDropdown(dropdown, input); });

    const observer = new MutationObserver(() => {
        editInputs().forEach(inp => {
            if (!inp.dataset.autocompleteSetup) {
                inp.dataset.autocompleteSetup = '1';
                const parent = inp.parentElement;
                let dd = parent.querySelector('.autocomplete-dropdown');
                if (!dd) {
                    dd = document.createElement('div');
                    dd.className = 'autocomplete-dropdown';
                    parent.appendChild(dd);
                }
                inp.addEventListener('input', () => showSuggestions(dd, inp));
                document.addEventListener('click', (e) => {
                    if (!dd.contains(e.target) && e.target !== inp) dd.style.display = 'none';
                });
                window.addEventListener('scroll', () => { if (dd.style.display === 'block') positionDropdown(dd, inp); }, true);
                window.addEventListener('resize', () => { if (dd.style.display === 'block') positionDropdown(dd, inp); });
            }
        });
    });
    observer.observe(document.getElementById('transaction-list'), { childList: true, subtree: true });
    const incomeList = document.getElementById('transaction-list-income');
    if (incomeList) observer.observe(incomeList, { childList: true, subtree: true });
}

function updateMonthInput(v, suffix) {
    suffix = suffix || '';
    const display = document.getElementById('month-display' + suffix);
    const payEl = document.getElementById('payment' + suffix);
    if (!display) return;
    if (!v) { display.value = ''; return; }
    const ref = getReferenceMonth(v, payEl ? payEl.value : '');
    display.value = ref.name;
}

function togglePaymentDateInput(suffix) {
    suffix = suffix || '';
    const statusEl = document.getElementById('status' + suffix);
    const payDateEl = document.getElementById('payment-date' + suffix);
    if (!statusEl || !payDateEl) return;
    if (statusEl.value === 'Pago') {
        payDateEl.disabled = false;
    } else {
        payDateEl.disabled = true;
        payDateEl.value = '';
    }
}

// --- PERSISTÊNCIA DE FILTROS ---
function saveFiltersState() {
    localStorage.setItem('fin_active_filters_v2', JSON.stringify(activeFilters));
    localStorage.setItem('fin_multi_select_v2', JSON.stringify(activeMultiSelect));
}

function loadFiltersState() {
    const savedFilters = localStorage.getItem('fin_active_filters_v2');
    const savedMulti = localStorage.getItem('fin_multi_select_v2');
    if (savedFilters) {
        const parsed = JSON.parse(savedFilters);
        activeFilters = { ...activeFilters, ...parsed };
    }
    if (savedMulti) {
        const parsed = JSON.parse(savedMulti);
        activeMultiSelect = { ...activeMultiSelect, ...parsed };
    }
}

// --- API ---
const API_URL = '/api/data';
async function saveToServer() {
    // Garantir que o titular atual faça parte do objeto enviado
    const dataToSave = { 
        transactions, 
        configs: { ...configs } 
    };
    
    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...authHeaders() },
            body: JSON.stringify(dataToSave)
        });

        if (response.status === 401) { logoutForced(); return; }
        if (!response.ok) {
            const errorMsg = `Erro ${response.status}: O servidor não aceitou os dados (talvez o arquivo esteja grande demais).`;
            alert(errorMsg);
            throw new Error(errorMsg);
        }

        localStorage.setItem('fin_tx', JSON.stringify(transactions));
        localStorage.setItem('fin_cfg', JSON.stringify(configs));
        console.log('Dados salvos no servidor e no LocalStorage.');
    } catch (e) { 
        console.error('Erro ao salvar no servidor:', e);
        localStorage.setItem('fin_tx', JSON.stringify(transactions));
        localStorage.setItem('fin_cfg', JSON.stringify(configs));
    }
}

async function loadData() {
    try {
        const res = await fetch(API_URL, { headers: authHeaders() });
        if (res.status === 401) { logoutForced(); return; }
        if (res.ok) {
            const data = await res.json();
            transactions = data.transactions || [];
            
            // Preservar o titular local se o do servidor vier vazio
            const localCfg = JSON.parse(localStorage.getItem('fin_cfg')) || {};
            const serverCfg = data.configs || {};
            
            configs = {
                ...configs,
                ...serverCfg,
                titular: serverCfg.titular || localCfg.titular || ''
            };

            if (!configs.type || configs.type.length === 0) configs.type = ['Receita', 'Despesa'];
            if (!Array.isArray(configs.payment)) configs.payment = [];
            // Migração: Tipo Receita separado. Se ainda não existe, inicia com Dinheiro + Pix (usados hoje em receitas)
            if (!Array.isArray(configs.paymentIncome) || configs.paymentIncome.length === 0) {
                if (serverCfg.paymentIncome && serverCfg.paymentIncome.length > 0) {
                    configs.paymentIncome = serverCfg.paymentIncome;
                } else {
                    const incomeNames = [...new Set(transactions.filter(t => t.type === 'income').map(t => t.payment).filter(Boolean))];
                    const base = incomeNames.length > 0 ? incomeNames : ['Dinheiro', 'Pix'];
                    configs.paymentIncome = base.map(n => {
                        const found = (configs.payment || []).find(p => p.name === n);
                        return found ? { ...found } : { name: n, closingDay: 1, dueDay: 1, avista: true, color: '#4a90e2' };
                    });
                }
            }
            // Migração fechamento/vencimento (startDay -> closingDay/dueDay, Dinheiro/Pix à vista)
            configs.payment = migratePayments(configs.payment);
            configs.paymentIncome = migratePayments(configs.paymentIncome);
            console.log('Dados carregados. Titular atual:', configs.titular);
        }
    } catch (e) {
        transactions = JSON.parse(localStorage.getItem('fin_tx')) || [];
        const savedCfg = JSON.parse(localStorage.getItem('fin_cfg'));
        if (savedCfg) configs = { ...configs, ...savedCfg };
        configs.payment = migratePayments(configs.payment);
        configs.paymentIncome = migratePayments(configs.paymentIncome);
    }
}

// --- FILTROS (SLICERS) ---
function getTxValue(t, key) {
    if (key === 'year') return getReferenceMonth(t.date, t.payment).year.toString();
    if (key === 'month') return getReferenceMonth(t.date, t.payment).name;
    if (key === 'day') return new Date(t.date + 'T00:00:00').getDate().toString();
    if (key === 'type') return t.type === 'income' ? (configs.type[0] || 'Receita') : (configs.type[1] || 'Despesa');
    if (key === 'paymentIncome') return t.payment;
    return t[key];
}

function renderSlicers() {
    // Pegar todos os anos únicos das transações
    let years = [...new Set(transactions.map(t => getReferenceMonth(t.date, t.payment).year))].sort((a,b) => b-a);
    if (years.length === 0) years.push(new Date().getFullYear());

    createSlicerOptions('year', years.map(String));
    createSlicerOptions('month', monthNames);

    // Gerar dias de 1 a 31
    const days = Array.from({length: 31}, (_, i) => (i + 1).toString());
    createSlicerOptions('day', days);

    createSlicerOptions('payment', (configs.payment || []).map(p => p.name));
    createSlicerOptions('paymentIncome', (configs.paymentIncome || []).map(p => p.name));
    createSlicerOptions('user', configs.user);
    createSlicerOptions('category', configs.category);
    createSlicerOptions('status', configs.status);
    createSlicerOptions('type', configs.type);

    // Atualizar visual dos botões de multi-seleção
    Object.keys(activeMultiSelect).forEach(key => {
        const btn = document.querySelector(`#slicer-${key} .btn-multi`);
        if (btn) btn.classList.toggle('active', activeMultiSelect[key]);
    });
}

function createSlicerOptions(key, options) {
    const container = document.getElementById(`options-${key}`);
    if (!container) return;
    const slicerParent = container.closest('.slicer');
    container.innerHTML = '';
    
    // Configurar colunas baseadas na quantidade de opções
    container.classList.remove('cols-1', 'cols-2', 'cols-3');
    slicerParent.classList.remove('grow-1', 'grow-2', 'grow-3');

    let cols = 1;
    if (options.length > 12) cols = 3;
    else if (options.length > 6) cols = 2;

    container.classList.add(`cols-${cols}`);
    slicerParent.classList.add(`grow-${cols}`);

    // Lógica Excel: Verificar quais opções têm dados considerando os OUTROS filtros
    // 'type' ignorado (cada aba é fixa no seu tipo); o filtro de Tipo da aba corrente entra no cross
    const isIncomeTab = document.getElementById('content-income')?.classList.contains('active');
    const tabType = isIncomeTab ? 'income' : 'expense';
    const payKey = isIncomeTab ? 'paymentIncome' : 'payment';
    const otherFiltersKeys = Object.keys(activeFilters).filter(k => k !== key && k !== 'type' && k !== 'payment' && k !== 'paymentIncome');
    // Demais slicers reagem ao Tipo marcado (ex.: Nubank marcado → só aparece quem tem dados nela)
    if (key !== 'payment' && key !== 'paymentIncome') otherFiltersKeys.push(payKey);
    
    // Mapear opções para objetos com status de dados
    if (!Array.isArray(activeFilters[key])) activeFilters[key] = [];
    // payment só enxerga despesas e paymentIncome só receitas (evita receita do titular
    // liberar opção de Tipo na aba Despesas, e despesa alheia liberar Tipo na aba Receitas);
    // nos demais slicers, considerar apenas transações do tipo da aba corrente
    const pool = key === 'payment' ? transactions.filter(t => t.type === 'expense')
        : key === 'paymentIncome' ? transactions.filter(t => t.type === 'income')
        : transactions.filter(t => t.type === tabType);
    const processedOptions = options.map(opt => {
        const isActive = activeFilters[key].includes(opt);
        
        // Verificar se existe alguma transação que satisfaça OS OUTROS filtros E esta opção
        const hasData = pool.some(t => {
            // Primeiro checar se a transação bate com a opção atual deste slicer
            if (getTxValue(t, key) !== opt) return false;
            
            // Depois checar se bate com todos os outros filtros ativos
            return otherFiltersKeys.every(otherKey => {
                const activeVals = activeFilters[otherKey];
                if (activeVals.length === 0) return true;
                return activeVals.includes(getTxValue(t, otherKey));
            });
        });

        return { value: opt, hasData, isActive };
    });

    // Ordenar: primeiro os que têm dados (hasData: true), depois os que não têm
    processedOptions.sort((a, b) => {
        if (a.hasData && !b.hasData) return -1;
        if (!a.hasData && b.hasData) return 1;
        // Se ambos forem iguais no hasData, mantém a ordem original das options (especialmente importante para meses e dias)
        return options.indexOf(a.value) - options.indexOf(b.value);
    });

    processedOptions.forEach(optObj => {
        const btn = document.createElement('button');
        btn.className = 'slicer-opt';
        if (optObj.isActive) btn.classList.add('active');
        if (!optObj.hasData) btn.classList.add('unavailable');
        // Sem dados = desabilitado (não clicável), exceto se for a opção ativa (para poder desmarcar)
        if (!optObj.hasData && !optObj.isActive) btn.disabled = true;
        
        btn.textContent = optObj.value;
        btn.onclick = () => toggleFilter(key, optObj.value);
        container.appendChild(btn);
    });
}

function toggleMultiSelect(key, btn) {
    activeMultiSelect[key] = !activeMultiSelect[key];
    btn.classList.toggle('active', activeMultiSelect[key]);
    saveFiltersState();
}

function toggleFilter(key, value) {
    if (!Array.isArray(activeFilters[key])) activeFilters[key] = [];
    const idx = activeFilters[key].indexOf(value);
    
    if (activeMultiSelect[key]) {
        if (idx > -1) activeFilters[key].splice(idx, 1);
        else activeFilters[key].push(value);
    } else {
        if (idx > -1 && activeFilters[key].length === 1) {
            activeFilters[key] = [];
        } else {
            activeFilters[key] = [value];
        }
    }
    saveFiltersState();
    updateUI();
}

function clearSlicer(key) {
    if (!Array.isArray(activeFilters[key])) activeFilters[key] = [];
    else activeFilters[key] = [];
    activeMultiSelect[key] = false;
    const btnMulti = document.querySelector(`#slicer-${key} .btn-multi`);
    if (btnMulti) btnMulti.classList.remove('active');
    saveFiltersState();
    updateUI();
}

function resetAllFilters() {
    Object.keys(activeFilters).forEach(key => {
        activeFilters[key] = [];
        activeMultiSelect[key] = false;
    });
    saveFiltersState();
    updateUI();
}

// --- UI ---
function sortTxList(list) {
    list.sort((a,b) => {
        let vA, vB;
        if (sortConfig.key === 'month') {
            const rA = getReferenceMonth(a.date, a.payment), rB = getReferenceMonth(b.date, b.payment);
            vA = rA.year * 100 + rA.month; vB = rB.year * 100 + rB.month;
        } else if (sortConfig.key === 'amount') {
            vA = parseFloat(a.amount); vB = parseFloat(b.amount);
        } else if (sortConfig.key === 'vezes') {
            vA = a.vezes || 1; vB = b.vezes || 1;
        } else if (sortConfig.key === 'paymentDate') {
            vA = a.paymentDate || '0000-00-00'; vB = b.paymentDate || '0000-00-00';
        } else {
            vA = (a[sortConfig.key] || '').toString().toLowerCase();
            vB = (b[sortConfig.key] || '').toString().toLowerCase();
        }
        return sortConfig.direction === 'asc' ? (vA > vB ? 1 : -1) : (vA < vB ? 1 : -1);
    });
    return list;
}

function buildTxRow(t) {
    const amt = parseFloat(t.amount);
    const ref = getReferenceMonth(t.date, t.payment);
    const payCfg = findPaymentCfg(t.payment);

    const tr = document.createElement('tr');
    if (t.status === 'Pago') tr.classList.add('row-pago');

    if (editingId === t.id) {
        tr.classList.add('editing-row');
        tr.innerHTML = `
            <td><input type="date" value="${t.date}" id="edit-date-${t.id}"></td>
            <td>
                <select id="edit-pay-${t.id}">
                    ${(t.type === 'income' ? (configs.paymentIncome || []) : (configs.payment || [])).map(p => `<option value="${p.name}" ${p.name === t.payment ? 'selected' : ''}>${p.name}</option>`).join('')}
                </select>
            </td>
            <td><input type="text" value="${ref.name}" readonly style="background:var(--bg-input);opacity:.6"></td>
            <td><input type="text" value="${t.description}" id="edit-desc-${t.id}"></td>
            <td><input type="number" value="${t.vezes > 0 ? t.vezes : 1}" id="edit-vezes-${t.id}" min="1"></td>
            <td><input type="number" step="0.01" value="${t.amount}" id="edit-amt-${t.id}"></td>
            <td>
                <select id="edit-cat-${t.id}" ${t.type === 'income' ? 'disabled' : ''}>
                    ${configs.category.map(c => `<option value="${c}" ${c === t.category ? 'selected' : ''}>${c}</option>`).join('')}
                </select>
            </td>
            <td>
                <select id="edit-user-${t.id}" ${t.type === 'income' ? 'disabled' : ''}>
                    ${configs.user.map(u => `<option value="${u}" ${u === t.user ? 'selected' : ''}>${u}</option>`).join('')}
                </select>
            </td>
            <td>
                <select id="edit-status-${t.id}" onchange="document.getElementById('edit-pdate-${t.id}').disabled = (this.value !== 'Pago')">
                    ${configs.status.map(s => `<option value="${s}" ${s === t.status ? 'selected' : ''}>${s}</option>`).join('')}
                </select>
            </td>
            <td><input type="date" value="${t.paymentDate || ''}" id="edit-pdate-${t.id}" ${t.status !== 'Pago' ? 'disabled' : ''}></td>
            <td class="actions-cell">
                <button class="btn-action btn-save" onclick="saveInlineEdit('${t.id}')" title="Salvar">💾</button>
                <button class="btn-action btn-cancel" onclick="cancelEdit()" title="Cancelar">❌</button>
            </td>
        `;
    } else {
        const dateObj = new Date(t.date + 'T00:00:00');
        const dateFormatted = dateObj.toLocaleDateString('pt-BR');
        const dayOfWeek = dayNames[dateObj.getDay()];

        tr.innerHTML = `
            <td>${dateFormatted} (${dayOfWeek})</td>
            <td><span class="payment-badge" style="background:${payCfg.color}">${t.payment}</span></td>
            <td>${ref.name}</td>
            <td>${t.description}</td>
            <td>${t.vezes > 0 ? t.vezes : '-'}</td>
            <td class="${t.type === 'income' ? 'text-income' : 'text-expense'}">${t.type === 'expense' ? '-' : ''} ${formatCurrency(amt)}</td>
            <td>${t.category}</td>
            <td>${t.user}</td>
            <td><span class="status-badge ${t.status === 'Pago' ? 'status-pago' : 'status-pendente'}">${t.status}</span></td>
            <td>${t.paymentDate ? new Date(t.paymentDate + 'T00:00:00').toLocaleDateString('pt-BR') : '-'}</td>
            <td class="actions-cell">
                <button class="btn-action btn-toggle" onclick="toggleStatus('${t.id}')" title="Alterar Status">✅</button>
                <button class="btn-action btn-edit" onclick="editTransaction('${t.id}')" title="Editar">✏️</button>
                <button class="btn-action btn-delete" onclick="removeTransaction('${t.id}')" title="Excluir">🗑️</button>
            </td>
        `;
    }
    return tr;
}

function updateUI() {
    if (transactionList) transactionList.innerHTML = '';
    if (transactionListIncome) transactionListIncome.innerHTML = '';
    let expense = 0;

    // Filtros compartilhados (tipo ignorado: cada aba filtra pelo seu tipo fixo)
    // payment (Tipo Despesa) só na aba Despesas, paymentIncome (Tipo Receita) só na aba Receitas
    // user + category valem para ambas
    const filteredBase = transactions.filter(t => {
        const ref = getReferenceMonth(t.date, t.payment);
        const tYear = ref.year.toString();
        const tMonth = ref.name;
        const tDay = new Date(t.date + 'T00:00:00').getDate().toString();

        const match = (k, v) => !activeFilters[k] || activeFilters[k].length === 0 || activeFilters[k].includes(v);
        return match('year', tYear) && match('month', tMonth) && match('day', tDay) &&
               match('user', t.user) &&
               match('category', t.category) && match('status', t.status);
    });

    const matchPay = (v) => !activeFilters.payment || activeFilters.payment.length === 0 || activeFilters.payment.includes(v);
    const matchPayInc = (v) => !activeFilters.paymentIncome || activeFilters.paymentIncome.length === 0 || activeFilters.paymentIncome.includes(v);
    const filteredExpenses = sortTxList(filteredBase.filter(t => t.type === 'expense' && matchPay(t.payment)));
    const filteredIncome = sortTxList(filteredBase.filter(t => t.type === 'income' && matchPayInc(t.payment)));

    // Income card: receitas pagas - despesas pagas do titular (ignora filtros)
    let incomePaid = 0, expensePaidTitular = 0;
    transactions.forEach(t => {
        const amt = parseFloat(t.amount || 0);
        if (t.type === 'income' && t.status === 'Pago') incomePaid += amt;
        if (t.type === 'expense' && t.status === 'Pago' && t.user === configs.titular) expensePaidTitular += amt;
    });

    let income = 0;
    filteredExpenses.forEach(t => {
        expense += parseFloat(t.amount);
        if (transactionList) transactionList.appendChild(buildTxRow(t));
    });
    filteredIncome.forEach(t => {
        income += parseFloat(t.amount);
        if (transactionListIncome) transactionListIncome.appendChild(buildTxRow(t));
    });

    // Total filtrado no header (entre Despesas e limpar filtros): segue a aba ativa
    const isIncomeTab = document.getElementById('content-income')?.classList.contains('active');
    const filterLabel = document.getElementById('filter-total-label');
    const filterValue = document.getElementById('filter-total-value');
    if (filterLabel && filterValue) {
        if (isIncomeTab) {
            filterLabel.textContent = `Receitas filtradas (${filteredIncome.length})`;
            filterValue.textContent = formatCurrency(income);
        } else {
            filterLabel.textContent = `Despesas filtradas (${filteredExpenses.length})`;
            filterValue.textContent = formatCurrency(expense);
        }
    }

    const incomeDisplay = incomePaid - expensePaidTitular;
    if (totalIncome) totalIncome.innerText = formatCurrency(incomeDisplay < 0 ? 0 : incomeDisplay);
    if (totalExpense) totalExpense.innerText = formatCurrency(expense);
    if (totalBalance) totalBalance.innerText = formatCurrency(incomeDisplay);

    renderSlicers();
    document.querySelectorAll('[data-sort]').forEach(th => {
        th.classList.toggle('sort-asc', sortConfig.key === th.dataset.sort && sortConfig.direction === 'asc');
        th.classList.toggle('sort-desc', sortConfig.key === th.dataset.sort && sortConfig.direction === 'desc');
    });
}

// --- CONFIGS ---
function populateSelects() {
    const fill = (el, list, addEmpty = false) => {
        if (!el) return;
        el.innerHTML = '';
        if (addEmpty) {
            const emptyOpt = document.createElement('option');
            emptyOpt.value = '';
            emptyOpt.textContent = 'Selecione...';
            el.appendChild(emptyOpt);
        }
        list.forEach(v => {
            const o = document.createElement('option');
            if (typeof v === 'object' && v.value) {
                o.value = v.value;
                o.textContent = v.name;
            } else {
                o.value = o.textContent = (typeof v === 'object' ? v.name : v);
            }
            el.appendChild(o);
        });
    };
    fill(selectCategory, configs.category);
    fill(selectUser, configs.user);
    if (configs.titular) selectUser.value = configs.titular;
    fill(selectPayment, configs.payment);
    fill(selectStatus, configs.status);
    // Aba Receitas: selects desabilitados (travados em Renda + titular)
    fill(selectCategoryIncome, configs.category);
    fill(selectUserIncome, configs.user);
    if (selectCategoryIncome) {
        selectCategoryIncome.value = 'Renda';
        selectCategoryIncome.disabled = true;
    }
    if (selectUserIncome) {
        if (configs.titular) selectUserIncome.value = configs.titular;
        selectUserIncome.disabled = true;
    }
    fill(selectPaymentIncome, configs.paymentIncome);
    fill(selectStatusIncome, configs.status);
    
    // Popular o seletor de titular
    const selectTitular = document.getElementById('select-titular');
    fill(selectTitular, configs.user, true);
    if (configs.titular) selectTitular.value = configs.titular;
    
    renderSettingsList('category', 'list-categories');
    renderSettingsList('user', 'list-users');
    renderSettingsList('payment', 'list-payments');
    renderSettingsList('paymentIncome', 'list-payments-income');
    renderSettingsList('status', 'list-status');
    renderSettingsList('descriptions', 'list-descriptions');

    // Sincroniza Data Pagto com o Sta atual (ex: já vem Pago mas o campo nascia desabilitado)
    togglePaymentDateInput('');
    togglePaymentDateInput('-income');
}

function renderSettingsList(type, id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.innerHTML = '';
    (configs[type] || []).forEach(v => {
        const li = document.createElement('li');
        const name = typeof v === 'object' ? v.name : v;

        if (type === 'payment' || type === 'paymentIncome') {
            const tag = v.avista ? 'À vista' : `Fecha ${closingDayOf(v)} · Vence ${dueDayOf(v)}`;
            li.innerHTML = `
                <div class="payment-info">
                    <span class="payment-color-dot" style="background: ${v.color || '#ccc'}"></span>
                    <span class="payment-name">${name}</span>
                    <span class="payment-day">${tag}</span>
                </div>
                <span class="btn-remove-config" onclick="event.stopPropagation(); removeConfig('${type}', '${name}')">×</span>
            `;
            li.onclick = () => openPaymentEdit(name, type);
        } else {
            li.innerHTML = `<span>${name}</span> <span class="btn-remove-config" onclick="removeConfig('${type}', '${name}')">×</span>`;
        }
        el.appendChild(li);
    });
}

function addConfig(type, id) {
    const val = document.getElementById(id).value.trim();
    if (val && !configs[type].includes(val)) {
        configs[type].push(val);
        saveToServer(); populateSelects(); updateUI();
        document.getElementById(id).value = '';
    }
}

function addPaymentConfig(kind, inputId) {
    kind = kind || 'payment';
    inputId = inputId || 'new-payment';
    if (!Array.isArray(configs[kind])) configs[kind] = [];
    const val = document.getElementById(inputId).value.trim();
    if (val && !configs[kind].some(p => p.name === val)) {
        const av = /^(dinheiro|pix)$/i.test(val);
        configs[kind].push({ name: val, closingDay: 1, dueDay: 1, avista: av, color: '#4a90e2' });
        saveToServer(); populateSelects(); updateUI();
        document.getElementById(inputId).value = '';
    }
}

function removeConfig(type, name) {
    if (type === 'payment' || type === 'paymentIncome') configs[type] = (configs[type] || []).filter(p => p.name !== name);
    else configs[type] = configs[type].filter(v => v !== name);
    saveToServer(); populateSelects(); updateUI();
}

// --- TRANSACTIONS ---
function toggleStatus(id) {
    const t = transactions.find(x => x.id === id);
    if (t) { 
        t.status = t.status === 'Pago' ? 'Pendente' : 'Pago'; 
        if (t.status === 'Pago' && !t.paymentDate) {
            t.paymentDate = new Date().toLocaleDateString('en-CA');
        } else if (t.status === 'Pendente') {
            t.paymentDate = '';
        }
        saveToServer(); 
    updateUI();
    setupDescAutocomplete();
}
}

function removeTransaction(id) {
    transactions = transactions.filter(x => x.id !== id);
    saveToServer(); updateUI();
}

function editTransaction(id) {
    editingId = id;
    updateUI();
}

function cancelEdit() {
    editingId = null;
    updateUI();
}

function saveInlineEdit(id) {
    const idx = transactions.findIndex(x => x.id === id);
    if (idx === -1) return;

    const oldTx = transactions[idx];
    const oldVezes = oldTx.vezes || 1;
    const newVezes = Math.max(parseInt(document.getElementById(`edit-vezes-${id}`).value) || 1, 1);
    const baseDesc = document.getElementById(`edit-desc-${id}`).value;

    // Caso especial: reduzir para 1 parcela
    if (newVezes === 1 && oldVezes > 1 && parseInstallment(oldTx.description)) {
        const p = parseInstallment(oldTx.description);
        const siblings = transactions.filter(t => {
            const sp = parseInstallment(t.description);
            return sp && sp.base === p.base && sp.total === oldVezes &&
                   parseFloat(t.amount) === parseFloat(oldTx.amount) &&
                   t.category === oldTx.category &&
                   t.user === oldTx.user;
        });
        const survivor = siblings.find(t => {
            const sp = parseInstallment(t.description);
            return sp && sp.current === 1;
        });
        siblings.forEach(t => {
            if (t !== survivor) {
                const i = transactions.indexOf(t);
                if (i !== -1) transactions.splice(i, 1);
            }
        });
        if (survivor) {
            survivor.date = document.getElementById(`edit-date-${id}`).value;
            survivor.description = baseDesc;
            survivor.category = document.getElementById(`edit-cat-${id}`).value;
            survivor.amount = document.getElementById(`edit-amt-${id}`).value;
            survivor.type = survivor.type || oldTx.type;
            survivor.payment = document.getElementById(`edit-pay-${id}`).value;
            survivor.user = document.getElementById(`edit-user-${id}`).value;
            survivor.status = document.getElementById(`edit-status-${id}`).value;
            survivor.paymentDate = document.getElementById(`edit-pdate-${id}`).value;
            survivor.vezes = 1;
            const p2 = parseInstallment(survivor.description);
            if (p2) survivor.description = p2.base;
        }
        editingId = null;
        saveToServer();
        updateUI();
        return;
    }

    // Lida com mudança de parcelas ANTES de construir newTx
    if (newVezes !== oldVezes) {
        console.log('saveInlineEdit: vezes mudou', { old: oldVezes, new: newVezes });
        const parsed = parseInstallment(oldTx.description);
        console.log('saveInlineEdit: parsed', parsed);
        if (parsed) {
            const base = parsed.base;
            const siblings = transactions
                .map((t, i) => ({ t, i }))
                .filter(({ t }) => {
                    const p = parseInstallment(t.description);
                    return p && p.base === base &&
                           parseFloat(t.amount) === parseFloat(oldTx.amount) &&
                           t.category === oldTx.category &&
                           t.user === oldTx.user;
                })
                .sort((a, b) => parseInstallment(a.t.description).current - parseInstallment(b.t.description).current);

            console.log('saveInlineEdit: siblings encontrados', siblings.length);

            if (newVezes > oldVezes) {
                const lastSibling = siblings[siblings.length - 1];
                const lastDate = lastSibling ? lastSibling.t.date : oldTx.date;
                const maxCurrent = lastSibling ? parseInstallment(lastSibling.t.description).current : 0;

                console.log('saveInlineEdit: aumentando parcelas', { oldTotal: oldVezes, newVezes, maxCurrent, lastDate });

                for (let i = maxCurrent + 1; i <= newVezes; i++) {
                    transactions.push({
                        id: (Date.now() + i).toString(),
                        description: makeInstallmentDesc(base, i, newVezes, oldTx.amount),
                        desc2: oldTx.desc2 || '',
                        amount: oldTx.amount,
                        category: oldTx.category,
                        date: addMonths(lastDate, i - maxCurrent),
                        payment: oldTx.payment,
                        user: oldTx.user,
                        status: 'Pendente',
                        type: oldTx.type,
                        paymentDate: '',
                        vezes: newVezes
                    });
                }
                siblings.forEach(({ t }) => {
                    const p = parseInstallment(t.description);
                    t.description = makeInstallmentDesc(p.base, p.current, newVezes, t.amount);
                    t.vezes = newVezes;
                });
            } else {
                console.log('saveInlineEdit: reduzindo parcelas', { oldTotal: oldVezes, newVezes });
                siblings.forEach(({ t }) => {
                    const p = parseInstallment(t.description);
                    if (p.current <= newVezes) {
                        t.description = newVezes > 1 ? makeInstallmentDesc(p.base, p.current, newVezes, t.amount) : p.base;
                        t.vezes = newVezes;
                    }
                });
                siblings
                    .filter(({ t }) => parseInstallment(t.description).current > newVezes)
                    .map(({ i }) => i)
                    .sort((a, b) => b - a)
                    .forEach(removeIdx => transactions.splice(removeIdx, 1));
            }
        } else if (newVezes > oldVezes) {
            // Converter transação única em parcelas
            const base = oldTx.description;
            for (let i = 2; i <= newVezes; i++) {
                transactions.push({
                    id: (Date.now() + i).toString(),
                    description: makeInstallmentDesc(base, i, newVezes, oldTx.amount),
                    desc2: oldTx.desc2 || '',
                    amount: oldTx.amount,
                    category: oldTx.category,
                    date: addMonths(oldTx.date, i - 1),
                    payment: oldTx.payment,
                    user: oldTx.user,
                    status: 'Pendente',
                    type: oldTx.type,
                    paymentDate: '',
                    vezes: newVezes
                });
            }
        }
    }

    const currentIdx = transactions.findIndex(t => t.id === id);
    if (currentIdx === -1) {
        editingId = null;
        saveToServer();
        updateUI();
        return;
    }

    const newTx = {
        ...transactions[currentIdx],
        date: document.getElementById(`edit-date-${id}`).value,
        description: baseDesc,
        category: document.getElementById(`edit-cat-${id}`).value,
        amount: document.getElementById(`edit-amt-${id}`).value,
        type: transactions[currentIdx].type,
        payment: document.getElementById(`edit-pay-${id}`).value,
        user: document.getElementById(`edit-user-${id}`).value,
        status: document.getElementById(`edit-status-${id}`).value,
        paymentDate: document.getElementById(`edit-pdate-${id}`).value,
        vezes: newVezes
    };

    if (!newTx.description || !newTx.amount || !newTx.date) return;

    // Se mudou parcelas, corrigir o sufixo da descrição
    if (newVezes !== oldVezes) {
        const p = parseInstallment(newTx.description);
        if (p) {
            const base = p.base.replace(/ \(\d+\/\d+\)(?: \(R\$[ \u00A0][\d.,]+\))?$/, '');
            newTx.description = newVezes > 1
                ? makeInstallmentDesc(base, p.current, newVezes, newTx.amount)
                : base;
        } else if (newVezes > 1) {
            const cleaned = newTx.description.replace(/ \(\d+\/\d+\)(?: \(R\$[ \u00A0][\d.,]+\))?$/, '');
            newTx.description = makeInstallmentDesc(cleaned, 1, newVezes, newTx.amount);
        }
    }

    transactions[currentIdx] = newTx;

    // Propagar campos comuns para todos os irmãos
    const parsedOldDesc = parseInstallment(oldTx.description);
    if (parsedOldDesc) {
        const newParsed = parseInstallment(newTx.description);
        const newBase = (newParsed ? newParsed.base : newTx.description).replace(/ \(\d+\/\d+\)(?: \(R\$[ \u00A0][\d.,]+\))?$/, '');
        const oldBase = parsedOldDesc.base.replace(/ \(\d+\/\d+\)(?: \(R\$[ \u00A0][\d.,]+\))?$/, '');
        transactions.forEach(t => {
            if (t.id === id) return;
            const sp = parseInstallment(t.description);
            const spBase = sp ? sp.base.replace(/ \(\d+\/\d+\)(?: \(R\$[ \u00A0][\d.,]+\))?$/, '') : '';
            if (sp && spBase === oldBase &&
                sp.total === newVezes &&
                parseFloat(t.amount) === parseFloat(oldTx.amount) &&
                t.category === oldTx.category &&
                t.user === oldTx.user) {
                t.category = newTx.category;
                t.amount = newTx.amount;
                t.type = newTx.type;
                t.payment = newTx.payment;
                t.user = newTx.user;
                t.desc2 = newTx.desc2;
                t.description = makeInstallmentDesc(newBase, sp.current, newVezes, newTx.amount);
                if (newParsed) {
                    t.date = addMonths(newTx.date, sp.current - newParsed.current);
                }
            }
        });
    }

    editingId = null;
    saveToServer();
    updateUI();
}

// --- PAYMENTS EDIT (Tipo Despesa + Tipo Receita) ---
let currentPay = null;
let currentPayKind = 'payment';
function openPaymentEdit(n, kind) {
    kind = kind || 'payment';
    const list = configs[kind] || [];
    const p = list.find(x => x.name === n);
    if (!p) return;
    currentPay = n;
    currentPayKind = kind;
    if (kind === 'paymentIncome') {
        document.getElementById('edit-payment-income-panel').style.display = 'block';
        document.getElementById('edit-pay-income-day').value = closingDayOf(p);
        document.getElementById('edit-pay-income-due').value = dueDayOf(p);
        document.getElementById('edit-pay-income-avista').checked = !!p.avista;
        document.getElementById('edit-pay-income-color').value = p.color;
    } else {
        document.getElementById('edit-payment-panel').style.display = 'block';
        document.getElementById('edit-pay-day').value = closingDayOf(p);
        document.getElementById('edit-pay-due').value = dueDayOf(p);
        document.getElementById('edit-pay-avista').checked = !!p.avista;
        document.getElementById('edit-pay-color').value = p.color;
    }
}
function closePaymentEdit() { document.getElementById('edit-payment-panel').style.display = 'none'; }
function savePaymentEdit() {
    const p = (configs[currentPayKind] || []).find(x => x.name === currentPay);
    if (p) {
        const av = document.getElementById('edit-pay-avista').checked;
        p.closingDay = Math.min(Math.max(parseInt(document.getElementById('edit-pay-day').value) || 1, 1), 31);
        p.dueDay = Math.min(Math.max(parseInt(document.getElementById('edit-pay-due').value) || p.dueDay || p.closingDay, 1), 31);
        p.avista = av;
        delete p.startDay;
        saveToServer(); populateSelects(); updateUI(); closePaymentEdit();
    }
}
let currentPayIncome = null;
function closePaymentIncomeEdit() { document.getElementById('edit-payment-income-panel').style.display = 'none'; }
function savePaymentIncomeEdit() {
    const list = configs.paymentIncome || [];
    // Reusa currentPay/currentPayKind quando aberto via openPaymentEdit com kind paymentIncome
    const name = (currentPayKind === 'paymentIncome') ? currentPay : currentPayIncome;
    const p = list.find(x => x.name === name);
    if (p) {
        const av = document.getElementById('edit-pay-income-avista').checked;
        p.closingDay = Math.min(Math.max(parseInt(document.getElementById('edit-pay-income-day').value) || 1, 1), 31);
        p.dueDay = Math.min(Math.max(parseInt(document.getElementById('edit-pay-income-due').value) || p.dueDay || p.closingDay, 1), 31);
        p.avista = av;
        delete p.startDay;
        saveToServer(); populateSelects(); updateUI(); closePaymentIncomeEdit();
    }
}

// --- EVENTS ---
btnSettings.onclick = () => settingsOverlay.style.display = 'flex';
btnCloseSettings.onclick = () => settingsOverlay.style.display = 'none';
document.getElementById('btn-reset-filters').onclick = resetAllFilters;

// Deslogar: limpa o token e volta para a tela de login
const btnLogout = document.getElementById('btn-logout');
if (btnLogout) btnLogout.onclick = () => {
    localStorage.removeItem('fin_token');
    window.location.href = 'login.html';
};
settingsOverlay.onclick = (e) => { if (e.target === settingsOverlay) settingsOverlay.style.display = 'none'; };
btnSaveDb.onclick = () => {
    const blob = new Blob([JSON.stringify({ transactions, configs }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'finance.json'; a.click();
};
btnLoadDb.onclick = () => inputDb.click();
inputDb.onchange = e => {
    const reader = new FileReader();
    reader.onload = x => {
        const d = JSON.parse(x.target.result);
        transactions = d.transactions || [];
        // Usar merge para preservar o titular se ele já estiver definido localmente
        configs = { ...configs, ...(d.configs || {}) };
        configs.payment = migratePayments(configs.payment);
        configs.paymentIncome = migratePayments(configs.paymentIncome);
        saveToServer(); populateSelects(); updateUI();
    };
    reader.readAsText(e.target.files[0]);
};

document.querySelectorAll('[data-sort]').forEach(th => {
    th.onclick = () => {
        if (sortConfig.key === th.dataset.sort) sortConfig.direction = sortConfig.direction === 'asc' ? 'desc' : 'asc';
        else { sortConfig.key = th.dataset.sort; sortConfig.direction = 'asc'; }
        updateUI();
    };
});

function addTransactionFromForm(suffix, fixedType) {
    const descEl = document.getElementById('description' + suffix);
    const amountEl = document.getElementById('amount' + suffix);
    const dateEl = document.getElementById('date' + suffix);
    const statusEl = document.getElementById('status' + suffix);
    const payDateEl = document.getElementById('payment-date' + suffix);
    // Limpa erros anteriores deste formulário
    [descEl, amountEl, dateEl, payDateEl].forEach(el => el && el.classList.remove('input-error'));

    const baseDescription = descEl.value.trim();
    const amount = amountEl.value;
    const baseDate = dateEl.value;
    const qtde = Math.max(parseInt(document.getElementById('vezes' + suffix).value) || 1, 1);

    // Borda vermelha nos vazios ao clicar em Add
    let missing = false;
    if (!baseDescription) { descEl.classList.add('input-error'); missing = true; }
    if (!amount) { amountEl.classList.add('input-error'); missing = true; }
    if (!baseDate) { dateEl.classList.add('input-error'); missing = true; }
    // Sta Pago exige Data Pagto
    if (statusEl && statusEl.value === 'Pago' && payDateEl && !payDateEl.value) {
        payDateEl.classList.add('input-error');
        missing = true;
    }
    if (missing) return;

    for (let i = 1; i <= qtde; i++) {
        const d = {
            id: (Date.now() + i).toString() + (suffix || ''),
            description: qtde > 1 ? makeInstallmentDesc(baseDescription, i, qtde, amount) : baseDescription,
            amount: amount,
            category: document.getElementById('category' + suffix).value,
            date: qtde > 1 ? addMonths(baseDate, i - 1) : baseDate,
            payment: document.getElementById('payment' + suffix).value,
            user: document.getElementById('user' + suffix).value,
            status: document.getElementById('status' + suffix).value,
            type: fixedType,
            paymentDate: i === 1 && payDateEl ? payDateEl.value : '',
            vezes: qtde
        };
        transactions.push(d);
    }

    saveToServer();
    updateUI();

    document.getElementById('description' + suffix).value = '';
    document.getElementById('amount' + suffix).value = '';
    document.getElementById('date' + suffix).value = '';
    document.getElementById('vezes' + suffix).value = '1';
    const pdEl = document.getElementById('payment-date' + suffix);
    if (pdEl) { pdEl.value = ''; pdEl.disabled = true; }
    const mdEl = document.getElementById('month-display' + suffix);
    if (mdEl) mdEl.value = '';
}

if (btnAddInline) btnAddInline.onclick = () => addTransactionFromForm('', 'expense');
if (btnAddIncome) btnAddIncome.onclick = () => addTransactionFromForm('-income', 'income');

function switchTab(tab) {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));

    document.getElementById(`tab-${tab}`).classList.add('active');
    document.getElementById(`content-${tab}`).classList.add('active');

    const globalFilters = document.getElementById('global-filters');
    if (globalFilters) globalFilters.style.display = (tab === 'summary' || tab === 'debts') ? 'none' : 'flex';

    // Total filtrado do header só faz sentido onde há slicers (Receitas/Despesas)
    const filterTotal = document.getElementById('filter-total');
    if (filterTotal) filterTotal.style.display = (tab === 'summary' || tab === 'debts') ? 'none' : 'flex';
    if (tab !== 'summary') updateUI();

    // Slicers de tipo: só o relevante por aba (Categoria e Usuário valem para ambas)
    const slicerPay = document.getElementById('slicer-payment');
    const slicerPayInc = document.getElementById('slicer-paymentIncome');
    if (slicerPay) slicerPay.style.display = (tab === 'income') ? 'none' : '';
    if (slicerPayInc) slicerPayInc.style.display = (tab === 'transactions') ? 'none' : '';

    // Na aba Receitas, Categoria e Usuário ficam desabilitados (travados em Renda + titular)
    const slicerCat = document.getElementById('slicer-category');
    const slicerUser = document.getElementById('slicer-user');
    [[slicerCat, tab === 'income'], [slicerUser, tab === 'income']].forEach(([el, off]) => {
        if (!el) return;
        el.classList.toggle('slicer-disabled', !!off);
    });
    // Reforça travamento dos selects de receita (caso o HTML em cache não tenha disabled)
    const catInc = document.getElementById('category-income');
    const userInc = document.getElementById('user-income');
    if (catInc) { if (!catInc.value || catInc.value !== 'Renda') { if ([...catInc.options].some(o => o.value === 'Renda')) catInc.value = 'Renda'; } catInc.disabled = true; }
    if (userInc) { if (configs.titular && [...userInc.options].some(o => o.value === configs.titular)) userInc.value = configs.titular; userInc.disabled = true; }

    if (tab === 'summary') renderSummary();
    if (tab === 'debts') renderDebts();
}

let selectedDebtsUser = null;
let selectedDebtsPay = null;
function selectDebtsUser(u) {
    selectedDebtsUser = (selectedDebtsUser === u) ? null : u;
    selectedDebtsPay = null;
    renderDebts();
}
function selectDebtsPay(p) {
    selectedDebtsPay = (selectedDebtsPay === p) ? null : p;
    renderDebts();
}

function renderDebtsUserDetail() {
    const el = document.getElementById('debts-user-detail');
    if (!el) return;
    el.innerHTML = '';
    if (!selectedDebtsUser) return;

    const debtsYearSelect = document.getElementById('debts-year-select');
    const debtsMonthSelect = document.getElementById('debts-month-select');
    const sy = debtsYearSelect ? debtsYearSelect.value : '';
    const sm = debtsMonthSelect ? parseInt(debtsMonthSelect.value) : -1;
    const userName = selectedDebtsUser;

    const byPay = {};
    transactions.forEach(t => {
        if (t.type !== 'expense' || t.user !== userName) return;
        const ref = getReferenceMonth(t.date, t.payment);
        if (ref.year.toString() !== sy || ref.month !== sm) return;
        const v = parseFloat(t.amount || 0);
        const entry = byPay[t.payment] || (byPay[t.payment] = { paid: 0, pend: 0, due: '' });
        if (t.status === 'Pago') entry.paid += v;
        else if (t.status === 'Pendente') entry.pend += v;
        const dd = dueDateStr(t);
        if (dd && (!entry.due || dd < entry.due)) entry.due = dd;
    });

    const rows = Object.keys(byPay)
        .filter(k => byPay[k].paid > 0 || byPay[k].pend > 0)
        .sort((a, b) => (byPay[a].due < byPay[b].due ? -1 : 1));

    const wrap = document.createElement('div');
    wrap.className = 'table-container summary-table-container';
    if (rows.length === 0) {
        wrap.innerHTML = `<table id="debts-user-table"><tbody><tr><td style="text-align:center;opacity:.6">Sem movimento no mês</td></tr></tbody></table>`;
    } else {
        wrap.innerHTML = `
            <table id="debts-user-table">
                <thead><tr><th>${userName}</th><th>Vence em</th><th>Pago</th><th>Pendente</th></tr></thead>
                <tbody>
                    ${rows.map(k => {
                        const e = byPay[k];
                        const venc = e.due ? new Date(e.due + 'T00:00:00').toLocaleDateString('pt-BR') : '-';
                        return `<tr data-pay="${k}" onclick="selectDebtsPay(this.dataset.pay)" class="${selectedDebtsPay === k ? 'selected' : ''}" style="cursor:pointer">
                            <td><span class="payment-badge" style="background:${findPaymentCfg(k).color}">${k}</span></td>
                            <td>${venc}</td>
                            <td class="text-income">${formatCurrency(e.paid)}</td>
                            <td class="text-expense">${formatCurrency(e.pend)}</td>
                        </tr>`;
                    }).join('')}
                </tbody>
            </table>`;
    }
    el.appendChild(wrap);
}

function renderDebts() {
    const debtsYearSelect = document.getElementById('debts-year-select');
    const debtsMonthSelect = document.getElementById('debts-month-select');
    const selectedYear = debtsYearSelect ? debtsYearSelect.value : '';
    const selectedMonthIdx = debtsMonthSelect ? parseInt(debtsMonthSelect.value) : -1;

    // Pendentes do mês de referência selecionado (mês do vencimento)
    const pend = transactions.filter(t => {
        if (t.status !== 'Pendente') return false;
        const ref = getReferenceMonth(t.date, t.payment);
        return ref.year.toString() === selectedYear && ref.month === selectedMonthIdx;
    });
    // Totais do mês (despesas): a pagar = pendente (azul), recebido = pago (verde), saldo = resta (vermelho)
    let payPend = 0, payPaid = 0;
    transactions.forEach(t => {
        if (t.type !== 'expense') return;
        const ref = getReferenceMonth(t.date, t.payment);
        if (ref.year.toString() !== selectedYear || ref.month !== selectedMonthIdx) return;
        const v = parseFloat(t.amount || 0);
        if (t.status === 'Pendente') payPend += v;
        else if (t.status === 'Pago') payPaid += v;
    });

    const elPay = document.getElementById('debts-pay');
    const elRec = document.getElementById('debts-rec');
    const elTotal = document.getElementById('debts-total');
    if (elPay) elPay.textContent = formatCurrency(payPend);
    if (elRec) elRec.textContent = formatCurrency(payPaid);
    if (elTotal) elTotal.textContent = formatCurrency(payPend + payPaid);

    // Cards por usuário: Pago (verde) + Pendente (vermelho) do mês
    const box = document.getElementById('debts-users');
    if (box) {
        box.innerHTML = '';
        const debtsYearSelect = document.getElementById('debts-year-select');
        const debtsMonthSelect = document.getElementById('debts-month-select');
        const sy = debtsYearSelect ? debtsYearSelect.value : '';
        const sm = debtsMonthSelect ? parseInt(debtsMonthSelect.value) : -1;
        const inMonth = (t) => {
            const ref = getReferenceMonth(t.date, t.payment);
            return ref.year.toString() === sy && ref.month === sm;
        };
        configs.user.forEach(u => {
            let paidOut = 0, pendOut = 0;
            transactions.forEach(t => {
                if (t.type !== 'expense' || t.user !== u || !inMonth(t)) return;
                const v = parseFloat(t.amount || 0);
                if (t.status === 'Pago') paidOut += v;
                else if (t.status === 'Pendente') pendOut += v;
            });
            if (paidOut <= 0 && pendOut <= 0) return;
            const card = document.createElement('div');
            card.className = 'extrato-card debts-user-card' + (selectedDebtsUser === u ? ' selected' : '');
            card.onclick = () => selectDebtsUser(u);
            card.innerHTML = `
                <span>${u}</span>
                <p class="debts-net summary-balance-pos">${formatCurrency(paidOut)}</p>
                <p class="debts-net summary-balance-neg">${formatCurrency(pendOut)}</p>
            `;
            box.appendChild(card);
        });
        if (!box.children.length) {
            box.innerHTML = '<p style="opacity:.6">Nenhuma movimentação no mês.</p>';
        }
    }

    // Bloco do usuário clicado: por conta, pago + pendente, ordem de vencimento
    renderDebtsUserDetail();

    // Detalhe: todas do mês (pendentes + pagas), ordenado por vencimento
    const body = document.getElementById('debts-body');
    if (!body) return;
    body.innerHTML = '';
    const all = transactions.filter(t => {
        if (t.type !== 'expense') return false;
        const ref = getReferenceMonth(t.date, t.payment);
        if (ref.year.toString() !== selectedYear || ref.month !== selectedMonthIdx) return false;
        if (selectedDebtsUser && t.user !== selectedDebtsUser) return false;
        if (selectedDebtsPay && t.payment !== selectedDebtsPay) return false;
        return true;
    });
    all.sort((a, b) => {
        const da = dueDateStr(a), db = dueDateStr(b);
        if (da < db) return -1;
        if (da > db) return 1;
        return 0;
    });
    if (all.length === 0) {
        body.innerHTML = '<tr><td colspan="6" style="text-align:center;opacity:.6">Nada no mês</td></tr>';
        return;
    }
    all.forEach(t => {
        const due = dueDateStr(t);
        const venc = due ? new Date(due + 'T00:00:00').toLocaleDateString('pt-BR') : '-';
        const isIn = t.type === 'income';
        const tr = document.createElement('tr');
        if (t.status === 'Pago') tr.classList.add('row-pago');
        tr.innerHTML = `
            <td>${t.user}</td>
            <td>${t.description}</td>
            <td><span class="payment-badge" style="background:${findPaymentCfg(t.payment).color}">${t.payment}</span></td>
            <td>${venc}</td>
            <td><span class="status-badge ${t.status === 'Pago' ? 'status-pago' : 'status-pendente'}">${t.status}</span></td>
            <td class="${isIn ? 'text-income' : 'text-expense'}">${isIn ? '+' : '-'} ${formatCurrency(parseFloat(t.amount || 0))}</td>
        `;
        body.appendChild(tr);
    });
}

function refKey(ref) { return ref.year * 100 + ref.month; }

// Data efetiva do extrato: pagamento (só Pago entra) com fallback para lançamento
function effDateStr(t) { return t.paymentDate || t.date || ''; }
function effKey(t) {
    const s = effDateStr(t);
    if (!s || s.length < 7) return 0;
    const y = parseInt(s.slice(0, 4));
    const m = parseInt(s.slice(5, 7)) - 1;
    return y * 100 + m;
}

function renderSummaryPart(suffix, matchUser) {
    const summaryYearSelect = document.getElementById('summary-year-select');
    const summaryMonthSelect = document.getElementById('summary-month-select');
    const selectedYear = summaryYearSelect.value;
    const selectedMonthIdx = parseInt(summaryMonthSelect.value);
    const selKey = parseInt(selectedYear) * 100 + selectedMonthIdx;

    const elPrev = document.getElementById('sum-prev' + suffix);
    const elIn = document.getElementById('sum-in' + suffix);
    const elOut = document.getElementById('sum-out' + suffix);
    const elCur = document.getElementById('sum-cur' + suffix);
    const extratoBody = document.getElementById('extrato-body' + suffix);
    const pendBody = document.getElementById('pend-body' + suffix);
    if (!extratoBody || !pendBody) return;

    // Só Pago mexe no saldo
    const signed = (t) => (t.type === 'income' ? 1 : -1) * parseFloat(t.amount || 0);

    // Saldo anterior: tudo Pago com data de pagamento anterior ao mês selecionado
    let prev = 0;
    transactions.forEach(t => {
        if (t.status !== 'Pago' || !matchUser(t)) return;
        if (effKey(t) < selKey) prev += signed(t);
    });

    // Movimentações Pago do mês, em ordem de data de pagamento
    const monthPaid = transactions.filter(t => {
        if (t.status !== 'Pago' || !matchUser(t)) return false;
        return effKey(t) === selKey;
    }).sort((a, b) => {
        const ea = effDateStr(a), eb = effDateStr(b);
        if (ea < eb) return -1;
        if (ea > eb) return 1;
        return (a.description || '') < (b.description || '') ? -1 : 1;
    });

    let entradas = 0, saidas = 0;
    monthPaid.forEach(t => {
        const v = parseFloat(t.amount || 0);
        if (t.type === 'income') entradas += v; else saidas += v;
    });
    const cur = prev + entradas - saidas;

    if (elPrev) elPrev.textContent = formatCurrency(prev);
    if (elIn) elIn.textContent = formatCurrency(entradas);
    if (elOut) elOut.textContent = formatCurrency(saidas);
    if (elCur) {
        elCur.textContent = formatCurrency(cur);
        elCur.className = cur >= 0 ? 'summary-balance-pos' : 'summary-balance-neg';
    }

    // Extrato com saldo progressivo
    extratoBody.innerHTML = '';
    const firstDay = `01/${String(selectedMonthIdx + 1).padStart(2, '0')}/${selectedYear}`;

    // Saldo após calculado em ordem cronológica, exibição com mais recentes no topo
    const withBal = [];
    let running = prev;
    monthPaid.forEach(t => {
        running += signed(t);
        withBal.push({ t, bal: running });
    });
    if (withBal.length === 0) {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td colspan="5" style="text-align:center;opacity:.6">Sem movimentações pagas neste mês</td>`;
        extratoBody.appendChild(tr);
    }
    withBal.reverse().forEach(({ t, bal }) => {
        const d = new Date(effDateStr(t) + 'T00:00:00').toLocaleDateString('pt-BR');
        const isIn = t.type === 'income';
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${d}</td>
            <td>${t.description}</td>
            <td><span class="payment-badge" style="background:${findPaymentCfg(t.payment).color}">${t.payment}</span></td>
            <td class="${isIn ? 'text-income' : 'text-expense'}">${isIn ? '+' : '-'} ${formatCurrency(parseFloat(t.amount || 0))}</td>
            <td>${formatCurrency(bal)}</td>
        `;
        extratoBody.appendChild(tr);
    });

    // Saldo anterior: primeiro lançamento cronológico = última linha
    const tr0 = document.createElement('tr');
    tr0.className = 'extrato-prev-row';
    tr0.innerHTML = `<td>${firstDay}</td><td>Saldo anterior</td><td>-</td><td>-</td><td>${formatCurrency(prev)}</td>`;
    extratoBody.appendChild(tr0);

    // Pendentes do mês (não entram no saldo), ordenados por vencimento
    const pendTx = transactions.filter(t => {
        if (t.status !== 'Pendente' || !matchUser(t)) return false;
        const ref = getReferenceMonth(t.date, t.payment);
        return ref.year.toString() === selectedYear && ref.month === selectedMonthIdx;
    }).sort((a, b) => {
        const da = dueDateStr(a), db = dueDateStr(b);
        if (da < db) return -1;
        if (da > db) return 1;
        return 0;
    });

    pendBody.innerHTML = '';
    if (pendTx.length === 0) {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td colspan="2" style="text-align:center;opacity:.6">Nada pendente</td>`;
        pendBody.appendChild(tr);
    }
    pendTx.forEach(t => {
        const due = dueDateStr(t);
        const venc = due ? new Date(due + 'T00:00:00').toLocaleDateString('pt-BR') : '-';
        const isIn = t.type === 'income';
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${t.description} <span style="opacity:.55">· ${t.payment} · vence ${venc}</span></td>
            <td class="${isIn ? 'text-income' : 'text-expense'}">${isIn ? '+' : '-'} ${formatCurrency(parseFloat(t.amount || 0))}</td>
        `;
        pendBody.appendChild(tr);
    });
}

function renderSummary() {
    const titular = configs.titular;
    const t1 = document.getElementById('summary-part1-title');
    if (t1) t1.textContent = titular ? `Resumo — ${titular}` : 'Meu Resumo';

    // Só titular (ou tudo, se titular vazio — comportamento antigo)
    renderSummaryPart('', (t) => (!titular || t.user === titular));
}

async function init() {
    loadFiltersState();
    await loadData();
    populateSelects();
    
    const now = new Date();
    const currentYear = now.getFullYear().toString();
    const currentMonthName = monthNames[now.getMonth()];
    const currentMonthIdx = now.getMonth();

    // DEFINIR FILTROS PADRÃO (Sempre que atualizar a tela)
    activeFilters.year = [currentYear];
    activeFilters.month = [currentMonthName];
    activeFilters.user = configs.titular ? [configs.titular] : [];
    
    // Status padrão: Pendente (mesmo esquema do Titular). Tipo começa vazio (Igual a Conta e Categoria)
    activeFilters.status = ['Pendente'];
    activeFilters.type = [];
    activeMultiSelect.status = false;
    activeMultiSelect.type = false;
    
    // Garantir que os demais filtros comecem limpos (Exibir Tudo)
    activeFilters.payment = [];
    activeFilters.paymentIncome = [];
    activeFilters.category = [];
    activeFilters.day = [];
    activeMultiSelect.payment = false;
    activeMultiSelect.paymentIncome = false;

    // Salvar este estado inicial para que o localStorage reflita os padrões
    saveFiltersState();
    
    // Popular seletores do resumo
    const summaryYearSelect = document.getElementById('summary-year-select');
    const summaryMonthSelect = document.getElementById('summary-month-select');
    
    // Garantir que o ano atual exista na lista de anos, mesmo que não haja transações nele
    let years = [...new Set(transactions.map(t => getReferenceMonth(t.date, t.payment).year.toString()))];
    if (!years.includes(currentYear)) years.push(currentYear);
    years.sort((a,b) => b-a);
    
    summaryYearSelect.innerHTML = years.map(y => `<option value="${y}">${y}</option>`).join('');
    summaryMonthSelect.innerHTML = monthNames.map((m, i) => `<option value="${i}">${m}</option>`).join('');

    // Setar Ano e Mês atuais nos seletores do resumo
    summaryYearSelect.value = currentYear;
    summaryMonthSelect.value = currentMonthIdx;

    // Mesmos seletores na aba Dívidas
    const debtsYearSelect = document.getElementById('debts-year-select');
    const debtsMonthSelect = document.getElementById('debts-month-select');
    if (debtsYearSelect) {
        debtsYearSelect.innerHTML = years.map(y => `<option value="${y}">${y}</option>`).join('');
        debtsYearSelect.value = currentYear;
    }
    if (debtsMonthSelect) {
        debtsMonthSelect.innerHTML = monthNames.map((m, i) => `<option value="${i}">${m}</option>`).join('');
        debtsMonthSelect.value = currentMonthIdx;
    }
    
    updateUI();
    setupDescAutocomplete();
    // Estado inicial: aba Resumo primeiro
    switchTab('summary');
}

init();
