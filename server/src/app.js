require('dotenv').config();
const path = require('path');
const fs = require('fs');
const express = require('express');
const cookieParser = require('cookie-parser');
const { migrate } = require('./db');
const routes = require('./routes');

// Migrasi dijalankan sekali per proses (juga aman untuk serverless / Vercel)
let ready = null;
const ensureReady = () => {
  if (!ready) ready = migrate().catch((e) => { ready = null; throw e; });
  return ready;
};

const app = express();
app.set('trust proxy', 1);
app.use(express.json({ limit: '2mb' }));
app.use(cookieParser());

app.get('/api/health', (req, res) => res.json({ ok: true }));
app.use('/api', (req, res, next) => ensureReady().then(() => next()).catch(next));
app.use('/api', routes);

// Sajikan frontend hasil build (client/dist) bila tersedia — dipakai saat jalan di server biasa
const dist = path.join(__dirname, '..', '..', 'client', 'dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^\/(?!api).*/, (req, res) => res.sendFile(path.join(dist, 'index.html')));
}

module.exports = app;
module.exports.ensureReady = ensureReady;
