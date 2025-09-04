// Servidor Express que atua como um proxy seguro para a API do Airtable.
// Objetivo: impedir que o token da API fique exposto no frontend.
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import fetch from 'node-fetch';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
// Libera o consumo do frontend local
app.use(cors());
// Faz parse de JSON em requisições
app.use(express.json());

const PORT = process.env.PORT || 3000;
const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const AIRTABLE_TABLE_NAME = process.env.AIRTABLE_TABLE_NAME || 'Clientes';

if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID || !AIRTABLE_TABLE_NAME) {
  console.error('Variáveis de ambiente ausentes. Configure AIRTABLE_API_KEY, AIRTABLE_BASE_ID e AIRTABLE_TABLE_NAME.');
}

// URL da tabela configurada
const AIRTABLE_API_URL = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(AIRTABLE_TABLE_NAME)}`;

// Realiza uma chamada ao Airtable com os headers adequados
async function airtableRequest(endpoint, options = {}) {
  const url = `${AIRTABLE_API_URL}${endpoint || ''}`;
  const headers = {
    Authorization: `Bearer ${AIRTABLE_API_KEY}`,
    'Content-Type': 'application/json',
  };
  const response = await fetch(url, { ...options, headers: { ...headers, ...(options.headers || {}) } });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    const error = new Error(`Airtable error ${response.status}: ${text}`);
    error.status = response.status;
    throw error;
  }
  return response.json();
}

// GET /api/clients?search=&pageSize=&offset=
// Lista clientes com busca (filterByFormula) e paginação nativa do Airtable
app.get('/api/clients', async (req, res) => {
  try {
    const { search, pageSize, offset } = req.query;
    const params = new URLSearchParams();
    if (pageSize) params.set('pageSize', pageSize);
    if (offset) params.set('offset', offset);
    if (search) {
      // Busca simples por nome/email/telefone (case-insensitive)
      const formula = `OR(FIND(LOWER("${search}"), LOWER({nome}))>0, FIND(LOWER("${search}"), LOWER({email}))>0, FIND(LOWER("${search}"), LOWER({telefone}))>0)`;
      params.set('filterByFormula', formula);
    }
    const data = await airtableRequest(`?${params.toString()}`);
    res.json(data);
  } catch (err) {
    res.status(err.status || 500).json({ message: 'Falha ao listar clientes', details: err.message });
  }
});

// POST /api/clients
// Cria um cliente com campos nome, email e telefone
app.post('/api/clients', async (req, res) => {
  try {
    const { nome, email, telefone } = req.body || {};
    if (!nome || !email) {
      return res.status(400).json({ message: 'Campos obrigatórios ausentes: nome e email.' });
    }
    const payload = {
      records: [
        {
          fields: { nome, email, telefone: telefone || '' },
        },
      ],
    };
    const data = await airtableRequest('', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    res.status(201).json(data);
  } catch (err) {
    res.status(err.status || 500).json({ message: 'Falha ao criar cliente', details: err.message });
  }
});

// DELETE /api/clients/:id
// Exclui um cliente pelo ID do registro
app.delete('/api/clients/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const data = await airtableRequest(`/${id}`, { method: 'DELETE' });
    res.json(data);
  } catch (err) {
    res.status(err.status || 500).json({ message: 'Falha ao excluir cliente', details: err.message });
  }
});

// PATCH /api/clients/:id
// Atualiza parcialmente um cliente (usado na edição inline do frontend)
app.patch('/api/clients/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const fields = req.body || {};
    const payload = { records: [{ id, fields }] };
    const data = await airtableRequest('', {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
    res.json(data);
  } catch (err) {
    res.status(err.status || 500).json({ message: 'Falha ao editar cliente', details: err.message });
  }
});

// Servir arquivos estáticos do frontend (index.html, app.js, style.css)
app.use(express.static(__dirname));

// SPA simples – devolve index.html para qualquer rota desconhecida
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});


