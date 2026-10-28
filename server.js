const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const crypto = require('crypto');

// Carrega .env simples (CHAVE=VALOR) sem dependência externa (uso local)
try {
    for (const line of fs.readFileSync(path.join(__dirname, '.env'), 'utf8').split(/\r?\n/)) {
        const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
        if (m) process.env[m[1]] = process.env[m[1]] || m[2].trim().replace(/^["']|["']$/g, '');
    }
} catch (e) { /* .env é opcional */ }

const app = express();
const PORT = 3005; // MUDAMOS A PORTA PARA 3005
const DB_FILE = path.join(__dirname, 'db.json');

// Login: FIN_USER/FIN_PASS no .env (local) e nas variáveis do Railway (online)
const FIN_USER = process.env.FIN_USER;
const FIN_PASS = process.env.FIN_PASS;
const FIN_SECRET = process.env.FIN_SECRET || crypto.randomBytes(16).toString('hex');

app.use(cors());

// Configuração robusta de limites usando o Express nativo
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ limit: '100mb', extended: true }));

// Sem cache: o navegador sempre baixa HTML/JS/CSS novos (fim dos problemas de tela desatualizada)
app.use((req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
});
app.use(express.static(__dirname, { maxAge: 0 }));

// --- LOGIN ---
// Token sem estado: base64url(user).timestamp.HMAC(SECRET) — dura 30 dias
function makeToken(user) {
    const ts = Date.now();
    const mac = crypto.createHmac('sha256', FIN_SECRET).update(`${user}:${ts}`).digest('hex');
    return `${Buffer.from(user).toString('base64url')}.${ts}.${mac}`;
}

function verifyToken(token) {
    if (typeof token !== 'string') return null;
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    let user = '';
    try { user = Buffer.from(parts[0], 'base64url').toString(); } catch (e) { return null; }
    const mac = crypto.createHmac('sha256', FIN_SECRET).update(`${user}:${parts[1]}`).digest('hex');
    if (mac !== parts[2]) return null;
    if (!parts[1] || Date.now() - parseInt(parts[1], 10) > 30 * 24 * 3600 * 1000) return null;
    return user;
}

function requireAuth(req, res, next) {
    const token = (req.headers['authorization'] || '').replace(/^Bearer\s+/i, '');
    if (verifyToken(token)) return next();
    res.status(401).json({ error: 'Não autenticado' });
}

app.post('/api/login', (req, res) => {
    if (!FIN_USER || !FIN_PASS) {
        res.status(500).json({ error: 'Credenciais não configuradas no servidor' });
        return;
    }
    const user = String((req.body && req.body.user) || '').trim();
    const pass = String((req.body && req.body.pass) || '');
    if (user === FIN_USER && pass === FIN_PASS) {
        console.log(`[${new Date().toLocaleTimeString()}] Login OK: ${user}`);
        res.json({ ok: true, token: makeToken(user) });
        return;
    }
    console.log(`[${new Date().toLocaleTimeString()}] Login falhou: ${user}`);
    res.status(401).json({ error: 'Usuário ou senha inválidos' });
});

app.get('/api/data', requireAuth, (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
        const data = fs.readFileSync(DB_FILE, 'utf8');
        res.json(JSON.parse(data));
    } catch (err) {
        res.status(500).json({ error: 'Erro ao ler db.json' });
    }
});

app.post('/api/data', requireAuth, (req, res) => {
    try {
        console.log(`[${new Date().toLocaleTimeString()}] Recebido POST de ${JSON.stringify(req.body).length} bytes`);
        fs.writeFileSync(DB_FILE, JSON.stringify(req.body, null, 2), 'utf8');
        console.log('✔ db.json salvo com sucesso na porta 3005!');
        res.json({ message: 'OK' });
    } catch (err) {
        console.error('Erro ao salvar:', err);
        res.status(500).json({ error: err.message });
    }
});

app.listen(PORT, () => {
    console.log(`\n=========================================`);
    console.log(`🚀 NOVO SERVIDOR RODANDO NA PORTA: 3005`);
    console.log(`Acesse agora: http://localhost:3005`);
    if (!FIN_USER || !FIN_PASS) console.log(`⚠️  FIN_USER/FIN_PASS não configurados (crie o .env ou variáveis do servidor)`);
    console.log(`=========================================\n`);
});
