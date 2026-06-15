const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = 3005; // MUDAMOS A PORTA PARA 3005
const DB_FILE = path.join(__dirname, 'db.json');

app.use(cors());

// Configuração robusta de limites usando o Express nativo
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ limit: '100mb', extended: true }));

app.use(express.static(__dirname));

app.get('/api/data', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
        const data = fs.readFileSync(DB_FILE, 'utf8');
        res.json(JSON.parse(data));
    } catch (err) {
        res.status(500).json({ error: 'Erro ao ler db.json' });
    }
});

app.post('/api/data', (req, res) => {
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
    console.log(`=========================================\n`);
});
