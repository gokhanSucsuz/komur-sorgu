const { DatabaseSync } = require('node:sqlite');
const path = require('path');

const dbPath = path.join(process.cwd(), 'data', 'komur.db');
const db = new DatabaseSync(dbPath);

// Add column if missing
try {
  const cols = db.prepare('PRAGMA table_info(beneficiaries)').all();
  if (!cols.some(c => c.name === 'hedef_torba')) {
    db.exec('ALTER TABLE beneficiaries ADD COLUMN hedef_torba INTEGER DEFAULT 34;');
  }
} catch (e) {
  console.error(e);
}

// Add system settings table if missing
db.exec(`
  CREATE TABLE IF NOT EXISTS system_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  INSERT OR IGNORE INTO system_settings (key, value) VALUES ('varsayilan_hedef_torba', '34');
`);

// Update demo records
db.exec(`
  UPDATE beneficiaries SET hedef_torba = 34 WHERE hedef_torba IS NULL OR hedef_torba = 0;
  UPDATE beneficiaries SET hedef_torba = 34, torba_sayisi = 25, teslimat_durumu = 'EKSIK', teslimat_tarihi = '2026-10-13 14:15:00', teslim_alan = 'Mustafa Öztürk', teslimat_notu = '25 torba teslim edildi, 9 torba eksik kaldı' WHERE tc_no = '34567890126';
  UPDATE beneficiaries SET hedef_torba = 34, torba_sayisi = 34, teslimat_durumu = 'TAMAMLANDI' WHERE tc_no = '12345678902';
  UPDATE beneficiaries SET teslimat_durumu = 'TAMAMLANDI' WHERE teslimat_durumu = 'TESLIM_EDILDI';
`);

console.log('Database updated successfully with quota and partial delivery status!');
