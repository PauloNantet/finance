const transactionList = document.getElementById('transaction-list');
const totalBalance = document.getElementById('total-balance');
const totalIncome = document.getElementById('total-income');
const totalExpense = document.getElementById('total-expense');
const btnAddInline = document.getElementById('btn-add-inline');

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
const selectType = document.getElementById('type');
const inputPaymentDate = document.getElementById('payment-date');

let transactions = [];
let configs = {
    category: [], user: [], payment: [], status: [], type: ['Receita', 'Despesa'], titular: '', descriptions: []
};

function setTitular(val) {
    console.log('Definindo titular como:', val);
    configs.titular = val;
    saveToServer().then(() => {
        console.log('Titular salvo com sucesso!');
        if (document.getElementById('content-summary').classList.contains('active')) {
            renderSummary();
        }
    });
}

let activeFilters = {
    year: [], month: [], day: [], payment: [], user: [], category: [], status: [], type: []
};

let activeMultiSelect = {
    year: false, month: false, day: false, payment: false, user: false, category: false, status: false, type: false
};

let editingId = null;
let sortConfig = { key: 'date', direction: 'desc' };

const monthNames = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const dayNames = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function formatCurrency(v) { return parseFloat(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }

function getReferenceMonth(dateStr, paymentName) {
    if (!dateStr) return { month: -1, year: 0, name: '' };
    const date = new Date(dateStr + 'T00:00:00');
    let month = date.getMonth();
    let year = date.getFullYear();
    const day = date.getDate();
    const pay = configs.payment.find(p => p.name === paymentName) || { startDay: 1 };
    if (pay.startDay > 1 && day >= pay.startDay) {
        month++;
        if (month > 11) { month = 0; year++; }
    }
    return { month, year, name: monthNames[month] };
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

function setupDescAutocomplete() {
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
}

function updateMonthInput(v) {
    const display = document.getElementById('month-display');
    if (!v) { display.value = ''; return; }
    const ref = getReferenceMonth(v, document.getElementById('payment').value);
    display.value = ref.name;
}

function togglePaymentDateInput() {
    if (selectStatus.value === 'Pago') {
        inputPaymentDate.disabled = false;
    } else {
        inputPaymentDate.disabled = true;
        inputPaymentDate.value = '';
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
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(dataToSave)
        });

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
        const res = await fetch(API_URL);
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
            console.log('Dados carregados. Titular atual:', configs.titular);
        }
    } catch (e) {
        transactions = JSON.parse(localStorage.getItem('fin_tx')) || [];
        const savedCfg = JSON.parse(localStorage.getItem('fin_cfg'));
        if (savedCfg) configs = { ...configs, ...savedCfg };
    }
}

// --- FILTROS (SLICERS) ---
function getTxValue(t, key) {
    if (key === 'year') return getReferenceMonth(t.date, t.payment).year.toString();
    if (key === 'month') return getReferenceMonth(t.date, t.payment).name;
    if (key === 'day') return new Date(t.date + 'T00:00:00').getDate().toString();
    if (key === 'type') return t.type === 'income' ? (configs.type[0] || 'Receita') : (configs.type[1] || 'Despesa');
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

    createSlicerOptions('payment', configs.payment.map(p => p.name));
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
    const otherFiltersKeys = Object.keys(activeFilters).filter(k => k !== key);
    
    // Mapear opções para objetos com status de dados
    const processedOptions = options.map(opt => {
        const isActive = activeFilters[key].includes(opt);
        
        // Verificar se existe alguma transação que satisfaça OS OUTROS filtros E esta opção
        const hasData = transactions.some(t => {
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
    activeFilters[key] = [];
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
function updateUI() {
    transactionList.innerHTML = '';
    let income = 0, expense = 0;

    const filtered = transactions.filter(t => {
        const ref = getReferenceMonth(t.date, t.payment);
        const tYear = ref.year.toString();
        const tMonth = ref.name;
        const tDay = new Date(t.date + 'T00:00:00').getDate().toString();
        
        // Mapear o tipo interno para o nome configurado (Ex: 'income' -> 'Receita')
        const tTypeName = t.type === 'income' ? (configs.type[0] || 'Receita') : (configs.type[1] || 'Despesa');

        const match = (k, v) => !activeFilters[k] || activeFilters[k].length === 0 || activeFilters[k].includes(v);
        return match('year', tYear) && match('month', tMonth) && match('day', tDay) &&
               match('payment', t.payment) && match('user', t.user) &&
               match('category', t.category) && match('status', t.status) &&
               match('type', tTypeName);
    });

    filtered.sort((a,b) => {
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

    filtered.forEach(t => {
        const amt = parseFloat(t.amount);
        if (t.type === 'income') income += amt; else expense += amt;
        const ref = getReferenceMonth(t.date, t.payment);
        const payCfg = configs.payment.find(p => p.name === t.payment) || { color: '#777' };
        
        const tr = document.createElement('tr');
        if (t.status === 'Pago') tr.classList.add('row-pago');

        if (editingId === t.id) {
            tr.classList.add('editing-row');
            tr.innerHTML = `
                <td><input type="date" value="${t.date}" id="edit-date-${t.id}"></td>
                <td>
                    <select id="edit-pay-${t.id}">
                        ${configs.payment.map(p => `<option value="${p.name}" ${p.name === t.payment ? 'selected' : ''}>${p.name}</option>`).join('')}
                    </select>
                </td>
                <td><input type="text" value="${ref.name}" readonly style="background:#eee; width:80px"></td>
                <td><input type="text" value="${t.description}" id="edit-desc-${t.id}"></td>
                <td><input type="number" value="${t.vezes > 0 ? t.vezes : 1}" id="edit-vezes-${t.id}" style="width:50px" min="1"></td>
                <td>
                    <select id="edit-cat-${t.id}">
                        ${configs.category.map(c => `<option value="${c}" ${c === t.category ? 'selected' : ''}>${c}</option>`).join('')}
                    </select>
                </td>
                <td><input type="number" step="0.01" value="${t.amount}" id="edit-amt-${t.id}" style="width:90px"></td>
                <td>
                    <select id="edit-type-${t.id}">
                        <option value="expense" ${t.type === 'expense' ? 'selected' : ''}>${configs.type[1] || 'Despesa'}</option>
                        <option value="income" ${t.type === 'income' ? 'selected' : ''}>${configs.type[0] || 'Receita'}</option>
                    </select>
                </td>
                <td>
                    <select id="edit-user-${t.id}">
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
                <td>${t.category}</td>
                <td class="${t.type === 'income' ? 'text-income' : 'text-expense'}">${t.type === 'expense' ? '-' : ''} ${formatCurrency(amt)}</td>
                <td>${t.type === 'income' ? (configs.type[0] || 'Receita') : (configs.type[1] || 'Despesa')}</td>
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
        transactionList.appendChild(tr);
    });

    totalIncome.innerText = formatCurrency(income);
    totalExpense.innerText = formatCurrency(expense);
    totalBalance.innerText = formatCurrency(income - expense);
    
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
    fill(selectType, [
        { name: configs.type[0] || 'Receita', value: 'income' },
        { name: configs.type[1] || 'Despesa', value: 'expense' }
    ]);
    
    // Popular o seletor de titular
    const selectTitular = document.getElementById('select-titular');
    fill(selectTitular, configs.user, true);
    if (configs.titular) selectTitular.value = configs.titular;
    
    renderSettingsList('category', 'list-categories');
    renderSettingsList('user', 'list-users');
    renderSettingsList('payment', 'list-payments');
    renderSettingsList('status', 'list-status');
    renderSettingsList('descriptions', 'list-descriptions');
}

function renderSettingsList(type, id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.innerHTML = '';
    configs[type].forEach(v => {
        const li = document.createElement('li');
        const name = typeof v === 'object' ? v.name : v;
        
        if (type === 'payment') {
            li.innerHTML = `
                <div class="payment-info">
                    <span class="payment-color-dot" style="background: ${v.color || '#ccc'}"></span>
                    <span class="payment-name">${name}</span>
                    <span class="payment-day">Dia ${v.startDay || 1}</span>
                </div>
                <span class="btn-remove-config" onclick="event.stopPropagation(); removeConfig('${type}', '${name}')">×</span>
            `;
            li.onclick = () => openPaymentEdit(name);
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

function addPaymentConfig() {
    const val = document.getElementById('new-payment').value.trim();
    if (val && !configs.payment.some(p => p.name === val)) {
        configs.payment.push({ name: val, startDay: 1, color: '#4a90e2' });
        saveToServer(); populateSelects(); updateUI();
        document.getElementById('new-payment').value = '';
    }
}

function removeConfig(type, name) {
    if (type === 'payment') configs.payment = configs.payment.filter(p => p.name !== name);
    else configs[type] = configs[type].filter(v => v !== name);
    saveToServer(); populateSelects(); updateUI();
}

// --- TRANSACTIONS ---
function toggleStatus(id) {
    const t = transactions.find(x => x.id === id);
    if (t) { 
        t.status = t.status === 'Pago' ? 'Pendente' : 'Pago'; 
        if (t.status === 'Pago' && !t.paymentDate) {
            t.paymentDate = new Date().toISOString().split('T')[0];
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
            survivor.type = document.getElementById(`edit-type-${id}`).value;
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
        type: document.getElementById(`edit-type-${id}`).value,
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

// --- PAYMENTS EDIT ---
let currentPay = null;
function openPaymentEdit(n) {
    const p = configs.payment.find(x => x.name === n);
    if (!p) return;
    currentPay = n;
    document.getElementById('edit-payment-panel').style.display = 'block';
    document.getElementById('edit-pay-day').value = p.startDay;
    document.getElementById('edit-pay-color').value = p.color;
}
function closePaymentEdit() { document.getElementById('edit-payment-panel').style.display = 'none'; }
function savePaymentEdit() {
    const p = configs.payment.find(x => x.name === currentPay);
    if (p) {
        p.startDay = parseInt(document.getElementById('edit-pay-day').value);
        p.color = document.getElementById('edit-pay-color').value;
        saveToServer(); populateSelects(); updateUI(); closePaymentEdit();
    }
}

// --- EVENTS ---
btnSettings.onclick = () => settingsOverlay.style.display = 'flex';
btnCloseSettings.onclick = () => settingsOverlay.style.display = 'none';
document.getElementById('btn-reset-filters').onclick = resetAllFilters;
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

btnAddInline.onclick = () => {
    const baseDescription = document.getElementById('description').value.trim();
    const amount = document.getElementById('amount').value;
    const baseDate = document.getElementById('date').value;
    const qtde = Math.max(parseInt(document.getElementById('vezes').value) || 1, 1);

    if (!baseDescription || !amount || !baseDate) return;

    for (let i = 1; i <= qtde; i++) {
        const d = {
            id: (Date.now() + i).toString(),
            description: qtde > 1 ? makeInstallmentDesc(baseDescription, i, qtde, amount) : baseDescription,
            amount: amount,
            category: document.getElementById('category').value,
            date: qtde > 1 ? addMonths(baseDate, i - 1) : baseDate,
            payment: document.getElementById('payment').value,
            user: document.getElementById('user').value,
            status: document.getElementById('status').value,
            type: document.getElementById('type').value,
            paymentDate: i === 1 ? inputPaymentDate.value : '',
            vezes: qtde
        };
        transactions.push(d);
    }

    saveToServer();
    updateUI();

    document.getElementById('description').value = '';
    document.getElementById('amount').value = '';
    document.getElementById('date').value = '';
    document.getElementById('vezes').value = '1';
    inputPaymentDate.value = '';
    inputPaymentDate.disabled = true;
};

function switchTab(tab) {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
    
    document.getElementById(`tab-${tab}`).classList.add('active');
    document.getElementById(`content-${tab}`).classList.add('active');
    
    if (tab === 'summary') renderSummary();
}

function renderSummary() {
    const summaryYearSelect = document.getElementById('summary-year-select');
    const summaryMonthSelect = document.getElementById('summary-month-select');
    const selectedYear = summaryYearSelect.value;
    const selectedMonthIdx = parseInt(summaryMonthSelect.value);
    
    const headerRow = document.getElementById('summary-header-row');
    const summaryBody = document.getElementById('summary-body');
    const categorySummaryBody = document.getElementById('category-summary-body');
    const titular = configs.titular;
    
    // Identificar pagamentos únicos (colunas dinâmicas)
    const payments = configs.payment.map(p => p.name);
    
    // --- 1. TABELA MENSAL ---
    headerRow.innerHTML = `<th>Meses</th>` + 
        payments.map(p => `<th>${p}</th>`).join('') + 
        `<th>Total</th><th>Renda</th><th>Saldo</th>`;
    
    summaryBody.innerHTML = '';
    let cumulativeBalance = 0;
    
    monthNames.forEach((monthName, monthIdx) => {
        const row = document.createElement('tr');
        if (monthIdx === selectedMonthIdx) row.style.background = '#00d5ff17'; // Destacar mês selecionado
        let totalExpenses = 0;
        let income = 0;
        let html = `<td>${monthName}</td>`;
        
        const monthTx = transactions.filter(t => {
            const ref = getReferenceMonth(t.date, t.payment);
            return ref.year.toString() === selectedYear && ref.month === monthIdx && (!titular || t.user === titular);
        });
        
        payments.forEach(payName => {
            const amount = monthTx.reduce((acc, t) => {
                if (t.type === 'expense' && t.payment === payName) {
                    return acc + parseFloat(t.amount);
                }
                return acc;
            }, 0);
            totalExpenses += amount;
            html += `<td>${amount > 0 ? formatCurrency(amount) : 'R$ -'}</td>`;
        });
        
        html += `<td class="summary-total-row">${formatCurrency(totalExpenses)}</td>`;
        
        income = monthTx.reduce((acc, t) => {
            if (t.type === 'income') return acc + parseFloat(t.amount);
            return acc;
        }, 0);
        html += `<td class="text-income">${income > 0 ? formatCurrency(income) : 'R$ -'}</td>`;
        
        cumulativeBalance += (income - totalExpenses);
        html += `<td class="${cumulativeBalance >= 0 ? 'summary-balance-pos' : 'summary-balance-neg'}">${formatCurrency(cumulativeBalance)}</td>`;
        
        row.innerHTML = html;
        summaryBody.appendChild(row);
    });

    // --- 2. TABELA DE CATEGORIAS (Broken down by month) ---
    categorySummaryBody.innerHTML = '';
    
    const currentMonthTx = transactions.filter(t => {
        const ref = getReferenceMonth(t.date, t.payment);
        return ref.year.toString() === selectedYear && ref.month === selectedMonthIdx && (!titular || t.user === titular);
    });

    const categoryTotals = {};
    configs.category.forEach(cat => categoryTotals[cat] = 0);

    currentMonthTx.forEach(t => {
        if (t.type === 'expense') {
            if (categoryTotals.hasOwnProperty(t.category)) {
                categoryTotals[t.category] += parseFloat(t.amount);
            } else {
                categoryTotals[t.category] = parseFloat(t.amount);
            }
        }
    });

    // Restaurar a renderização da tabela de categorias
    Object.keys(categoryTotals).sort().forEach(cat => {
        const val = categoryTotals[cat];
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${cat}</td>
            <td>${val > 0 ? formatCurrency(val) : 'R$ -'}</td>
        `;
        categorySummaryBody.appendChild(tr);
    });

    // --- 3. TABELA DE PENDENTES (Por Usuário e Conta) ---
    const pendingHeaderRow = document.getElementById('pending-header-row');
    const pendingBody = document.getElementById('pending-body');
    
    // Header: Usuário + Contas + Total
    pendingHeaderRow.innerHTML = `<th>Pendentes</th>` + 
        payments.map(p => `<th>${p}</th>`).join('') + 
        `<th>Total</th>`;
    
    pendingBody.innerHTML = '';

    // Filtrar transações pendentes do mês e ano selecionados (APENAS DESPESAS)
    const pendingTx = transactions.filter(t => {
        const ref = getReferenceMonth(t.date, t.payment);
        return ref.year.toString() === selectedYear && 
               ref.month === selectedMonthIdx && 
               t.status === 'Pendente' &&
               t.type === 'expense'; // Adicionado filtro de tipo despesa
    });

    // Percorrer todos os usuários configurados
    configs.user.forEach(userName => {
        const tr = document.createElement('tr');
        let html = `<td>${userName}</td>`;
        let userTotalPending = 0;

        payments.forEach(payName => {
            const amount = pendingTx.reduce((acc, t) => {
                if (t.user === userName && t.payment === payName) return acc + parseFloat(t.amount);
                return acc;
            }, 0);
            userTotalPending += amount;
            html += `<td>${amount > 0 ? formatCurrency(amount) : 'R$ -'}</td>`;
        });

        html += `<td class="pending-total-col">${userTotalPending > 0 ? formatCurrency(userTotalPending) : 'R$ -'}</td>`;
        
        tr.innerHTML = html;
        pendingBody.appendChild(tr);
    });
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
    
    // Status e Tipo começam vazios (Igual a Conta e Categoria)
    activeFilters.status = [];
    activeFilters.type = [];
    activeMultiSelect.status = false;
    activeMultiSelect.type = false;
    
    // Garantir que os demais filtros comecem limpos (Exibir Tudo)
    activeFilters.payment = [];
    activeFilters.category = [];
    activeFilters.day = [];
    
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
    
    updateUI();
    setupDescAutocomplete();
}

init();
