const app = require('./app');

const PORT = process.env.PORT || 3000;
app.ensureReady()
  .then(() => app.listen(PORT, () => console.log(`Inventory Stock Management System berjalan di http://localhost:${PORT}`)))
  .catch((e) => { console.error('Gagal migrasi database', e); process.exit(1); });
