// Estado global simples da UI
const state = {
  isLoading: false,
  error: null,
  records: [],
  offset: null,
  prevOffsets: [],
  pageSize: 10,
  search: '',
};

// Referências para elementos da página
const els = {
  form: document.getElementById('client-form'),
  nome: document.getElementById('nome'),
  email: document.getElementById('email'),
  telefone: document.getElementById('telefone'),
  formStatus: document.getElementById('form-status'),
  table: document.getElementById('clients-table'),
  tbody: document.getElementById('clients-body'),
  loading: document.getElementById('loading'),
  error: document.getElementById('error'),
  empty: document.getElementById('empty'),
  refresh: document.getElementById('refresh'),
  search: document.getElementById('search'),
  prev: document.getElementById('prev-page'),
  next: document.getElementById('next-page'),
  pageInfo: document.getElementById('page-info'),
};

// Base da API (configurável via config.json para funcionar no GitHub Pages)
let API_BASE_URL = '/api';
let USE_DIRECT_AIRTABLE = false;
let AIRTABLE_BASE_URL = '';
let AIRTABLE_HEADERS = {};

// Se existir PUBLIC_AIRTABLE no window com credenciais, usamos modo direto
if (window.PUBLIC_AIRTABLE && window.PUBLIC_AIRTABLE.API_KEY && window.PUBLIC_AIRTABLE.BASE_ID && window.PUBLIC_AIRTABLE.TABLE_NAME) {
  USE_DIRECT_AIRTABLE = true;
  AIRTABLE_BASE_URL = `https://api.airtable.com/v0/${window.PUBLIC_AIRTABLE.BASE_ID}/${encodeURIComponent(window.PUBLIC_AIRTABLE.TABLE_NAME)}`;
  AIRTABLE_HEADERS = {
    Authorization: `Bearer ${window.PUBLIC_AIRTABLE.API_KEY}`,
    'Content-Type': 'application/json',
  };
}

// Controla visibilidade do estado de carregamento
function setLoading(isLoading) {
  state.isLoading = isLoading;
  els.loading.hidden = !isLoading;
}

// Exibe/limpa mensagens de erro globais
function setError(message) {
  state.error = message;
  if (message) {
    els.error.hidden = false;
    els.error.textContent = message;
  } else {
    els.error.hidden = true;
    els.error.textContent = '';
  }
}

// Mostra aviso de lista vazia
function setEmpty(isEmpty) {
  els.empty.hidden = !isEmpty;
}

// Renderiza a tabela com suporte a edição inline e botões de ação
function renderTable(records) {
  els.tbody.innerHTML = '';
  records.forEach((rec) => {
    const { id, fields } = rec;
    const tr = document.createElement('tr');

    const tdNome = document.createElement('td');
    tdNome.textContent = fields.nome || '';
    tdNome.contentEditable = 'true';
    tdNome.dataset.field = 'nome';

    const tdEmail = document.createElement('td');
    tdEmail.textContent = fields.email || '';
    tdEmail.contentEditable = 'true';
    tdEmail.dataset.field = 'email';

    const tdTelefone = document.createElement('td');
    tdTelefone.textContent = fields.telefone || '';
    tdTelefone.contentEditable = 'true';
    tdTelefone.dataset.field = 'telefone';

    const tdActions = document.createElement('td');
    tdActions.className = 'actions-cell';
    // Botão de exclusão
    const delBtn = document.createElement('button');
    delBtn.textContent = 'Excluir';
    delBtn.className = 'btn-danger';
    delBtn.addEventListener('click', () => handleDelete(id));

    // Botão de salvar alterações da linha
    const saveBtn = document.createElement('button');
    saveBtn.textContent = 'Salvar';
    saveBtn.className = 'btn-secondary';
    // Span de status por linha (sucesso/erro)
    const rowStatus = document.createElement('span');
    rowStatus.className = 'status';

    saveBtn.addEventListener('click', async () => {
      const fieldsToUpdate = {
        nome: tdNome.textContent.trim(),
        email: tdEmail.textContent.trim(),
        telefone: tdTelefone.textContent.trim(),
      };
      rowStatus.textContent = 'Salvando...';
      rowStatus.className = 'status';
      saveBtn.disabled = true;
      try {
        await handleUpdate(id, fieldsToUpdate);
        rowStatus.textContent = 'Salvo!';
        rowStatus.className = 'status success';
      } catch (e) {
        rowStatus.textContent = e.message || 'Erro ao salvar';
        rowStatus.className = 'status error';
      } finally {
        saveBtn.disabled = false;
      }
    });

    tdActions.appendChild(saveBtn);
    tdActions.appendChild(rowStatus);
    tdActions.appendChild(delBtn);

    tr.appendChild(tdNome);
    tr.appendChild(tdEmail);
    tr.appendChild(tdTelefone);
    tr.appendChild(tdActions);
    els.tbody.appendChild(tr);
  });

  els.table.hidden = records.length === 0;
  setEmpty(records.length === 0);
}

// Busca clientes no backend (proxy) com filtros e paginação
async function fetchClients({ search = '', pageSize = 10, offset = null } = {}) {
  try {
    setError(null);
    setLoading(true);

    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (pageSize) params.set('pageSize', pageSize);
    if (offset) params.set('offset', offset);

    let res;
    if (USE_DIRECT_AIRTABLE) {
      // Converter "search" em filterByFormula quando em modo direto
      if (search) {
        const formula = `OR(FIND(LOWER(\"${search}\"), LOWER({nome}))>0, FIND(LOWER(\"${search}\"), LOWER({email}))>0, FIND(LOWER(\"${search}\"), LOWER({telefone}))>0)`;
        params.set('filterByFormula', formula);
        params.delete('search');
      }
      // pageSize/offset são aceitos nativamente pelo Airtable
      res = await fetch(`${AIRTABLE_BASE_URL}?${params.toString()}`, { headers: AIRTABLE_HEADERS });
    } else {
      res = await fetch(`${API_BASE_URL}/clients?${params.toString()}`);
    }
    if (!res.ok) throw new Error('Erro ao carregar clientes.');
    const data = await res.json();
    state.records = data.records || [];
    state.offset = data.offset || null;
    renderTable(state.records);
    updatePagination();
  } catch (err) {
    setError(err.message || 'Erro ao listar clientes.');
    renderTable([]);
  } finally {
    setLoading(false);
  }
}

// Cria um novo cliente a partir do formulário
async function createClient({ nome, email, telefone }) {
  els.formStatus.textContent = '';
  try {
    const res = await fetch(`${API_BASE_URL}/clients`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nome, email, telefone }),
    });
    if (USE_DIRECT_AIRTABLE) {
      // Em modo direto, precisamos enviar no formato records[]
      const payload = { records: [{ fields: { nome, email, telefone: telefone || '' } }] };
      const directRes = await fetch(AIRTABLE_BASE_URL, {
        method: 'POST',
        headers: AIRTABLE_HEADERS,
        body: JSON.stringify(payload),
      });
      if (!directRes.ok) {
        const err = await directRes.json().catch(() => ({}));
        throw new Error(err?.error?.message || 'Erro ao criar cliente.');
      }
      els.formStatus.textContent = 'Criado com sucesso!';
      els.formStatus.className = 'status success';
      els.form.reset();
      await fetchClients({ search: state.search, pageSize: state.pageSize });
      return;
    }
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Erro ao criar cliente.');
    }
    els.formStatus.textContent = 'Criado com sucesso!';
    els.formStatus.className = 'status success';
    els.form.reset();
    await fetchClients({ search: state.search, pageSize: state.pageSize });
  } catch (err) {
    els.formStatus.textContent = err.message;
    els.formStatus.className = 'status error';
  }
}

// Exclui um cliente confirmado pelo usuário
async function handleDelete(id) {
  if (!confirm('Tem certeza que deseja excluir este cliente?')) return;
  try {
    if (USE_DIRECT_AIRTABLE) {
      const res = await fetch(`${AIRTABLE_BASE_URL}/${id}`, { method: 'DELETE', headers: AIRTABLE_HEADERS });
      if (!res.ok) throw new Error('Erro ao excluir.');
    } else {
      const res = await fetch(`${API_BASE_URL}/clients/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Erro ao excluir.');
    }
    await fetchClients({ search: state.search, pageSize: state.pageSize, offset: state.prevOffsets.at(-1) || null });
  } catch (err) {
    alert(err.message || 'Falha ao excluir cliente');
  }
}

// Atualiza um cliente (edição inline)
async function handleUpdate(id, fields) {
  try {
    if (USE_DIRECT_AIRTABLE) {
      const payload = { records: [{ id, fields }] };
      const res = await fetch(AIRTABLE_BASE_URL, {
        method: 'PATCH',
        headers: AIRTABLE_HEADERS,
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('Erro ao atualizar.');
    } else {
      const res = await fetch(`${API_BASE_URL}/clients/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fields),
      });
      if (!res.ok) throw new Error('Erro ao atualizar.');
    }
    await fetchClients({ search: state.search, pageSize: state.pageSize, offset: state.prevOffsets.at(-1) || null });
    return true;
  } catch (err) {
    // Propaga erro para o chamador exibir na linha
    throw err;
  }
}

// Atualiza controles de paginação
function updatePagination() {
  els.prev.disabled = state.prevOffsets.length === 0;
  els.next.disabled = !state.offset;
  const currentPage = state.prevOffsets.length + 1;
  els.pageInfo.textContent = `Página ${currentPage}`;
}

// Eventos
els.form.addEventListener('submit', (e) => {
  e.preventDefault();
  const nome = els.nome.value.trim();
  const email = els.email.value.trim();
  const telefone = els.telefone.value.trim();
  if (!nome || !email) {
    els.formStatus.textContent = 'Preencha nome e email.';
    els.formStatus.className = 'status error';
    return;
  }
  createClient({ nome, email, telefone });
});

els.refresh.addEventListener('click', () => {
  state.prevOffsets = [];
  fetchClients({ search: state.search, pageSize: state.pageSize });
});

els.search.addEventListener('input', (e) => {
  state.search = e.target.value;
  state.prevOffsets = [];
  fetchClients({ search: state.search, pageSize: state.pageSize });
});

els.next.addEventListener('click', () => {
  if (state.offset) {
    state.prevOffsets.push(state.offset);
    fetchClients({ search: state.search, pageSize: state.pageSize, offset: state.offset });
  }
});

els.prev.addEventListener('click', () => {
  const last = state.prevOffsets.pop();
  const prevPrev = state.prevOffsets.at(-1) || null;
  fetchClients({ search: state.search, pageSize: state.pageSize, offset: prevPrev });
});

// Carrega configuração dinâmica (para rodar no GitHub Pages apontando para um proxy)
async function loadConfig() {
  try {
    // Tenta buscar config.json na raiz do site
    const res = await fetch('config.json', { cache: 'no-store' });
    if (res.ok) {
      const cfg = await res.json();
      if (cfg && typeof cfg.API_BASE_URL === 'string' && cfg.API_BASE_URL.trim().length > 0) {
        API_BASE_URL = cfg.API_BASE_URL.trim().replace(/\/$/, '');
      }
    }
  } catch (_) {
    // Mantém padrão '/api' (útil em desenvolvimento com o proxy local)
  }
}

// Inicialização
(async function init() {
  await loadConfig();
  fetchClients({ pageSize: state.pageSize });
})();


