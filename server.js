/**
 * SỔ THU CHI - DEDICATED SYNC & MULTI-USER SERVER
 * Máy chủ riêng đồng bộ & Chia sẻ qua Tài khoản Google
 * - 100% Zero external dependencies (Dùng chuẩn thư viện Node.js built-in)
 * - Tích hợp SQLite Database (node:sqlite) với WAL mode cực nhanh và an toàn
 * - Xác thực & Đăng nhập bảo mật qua Google Identity Services (ID Token & Access Token)
 * - Quản lý nhiều Sổ (Multi-Vault) & Chia sẻ Sổ qua Email Google (Chủ sổ / Editor / Viewer)
 * - Thuật toán gộp dữ liệu hai chiều thông minh Last-Write-Wins (Conflict-Free LWW)
 * - Lưu lịch sử phiên bản (Snapshot History) tự động phòng ngừa mất dữ liệu
 * - Tích hợp máy chủ web tĩnh phục vụ ứng dụng PWA (Single Page App)
 * - Hỗ trợ Docker & Docker Compose sẵn sàng 1 lệnh chạy ngay
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Tự động nạp file .env nếu có (khi chạy trực tiếp với node server.js)
const envFilePath = path.join(__dirname, '.env');
if (fs.existsSync(envFilePath)) {
  try {
    const envContent = fs.readFileSync(envFilePath, 'utf8');
    for (const line of envContent.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx > 0) {
        const k = trimmed.slice(0, idx).trim();
        let v = trimmed.slice(idx + 1).trim();
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
          v = v.slice(1, -1);
        }
        if (k && process.env[k] === undefined) {
          process.env[k] = v;
        }
      }
    }
  } catch (_) {}
}

// Tùy chọn cấu hình môi trường
const PORT = parseInt(process.env.PORT || '8081', 10);
const HOST = process.env.HOST || '0.0.0.0';
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const JWT_SECRET = process.env.JWT_SECRET || 'sothuchi_vault_secret_' + crypto.randomBytes(16).toString('hex');
const GOOGLE_CLIENT_ID = (process.env.GOOGLE_CLIENT_ID || process.env.VITE_GOOGLE_CLIENT_ID || '').trim();
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';

// Cấu hình Email quản trị viên máy chủ sao lưu (Admin Dashboard) - Chỉ xác thực qua ADMIN_EMAIL
const ADMIN_EMAILS = [
  ...(process.env.ADMIN_EMAIL ? process.env.ADMIN_EMAIL.split(',') : []),
  ...(process.env.ADMIN_EMAILS ? process.env.ADMIN_EMAILS.split(',') : [])
]
  .map(e => e.trim().toLowerCase())
  .filter(Boolean);

// Đảm bảo thư mục lưu trữ dữ liệu tồn tại và kiểm tra quyền ghi
if (!fs.existsSync(DATA_DIR)) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  } catch (err) {
    console.error(`[Storage Error] Không thể tạo thư mục DATA_DIR (${DATA_DIR}):`, err.message);
  }
}

// Kiểm tra quyền ghi vào DATA_DIR để cảnh báo sớm nếu bị lỗi phân quyền volume
try {
  const writeTestFile = path.join(DATA_DIR, '.write_test_' + Date.now());
  fs.writeFileSync(writeTestFile, 'test');
  fs.unlinkSync(writeTestFile);
} catch (permErr) {
  console.error('================================================================');
  console.error(' [CẢNH BÁO NGUY HIỂM] THƯ MỤC DỮ LIỆU BỊ LỖI QUYỀN GHI (PERMISSION DENIED)!');
  console.error(` Thư mục: ${DATA_DIR}`);
  console.error(` Chi tiết lỗi: ${permErr.message}`);
  console.error(' SQLite không thể ghi file xuống đĩa. DỮ LIỆU SẼ BỊ MẤT KHI RESTART CONTAINER!');
  console.error(' Hướng dẫn khắc phục trên máy chủ host:');
  console.error('   sudo chown -R 1000:1000 <thư_mục_data_trên_host>');
  console.error('   sudo chmod -R 777 <thư_mục_data_trên_host>');
  console.error('================================================================');
}

// Ham tien ich tao ID ngau nhien duy nhat
function generateId(prefix = 'id_') {
  return (prefix || 'id_') + crypto.randomBytes(8).toString('hex');
}

// ==============================================================================
// 1. DATABASE & STORAGE LAYER (SQLite with node:sqlite or JSON Store Fallback)
// ==============================================================================
class DatabaseManager {
  constructor() {
    this.isSqlite = false;
    this.sqliteDb = null;
    this.jsonStore = {
      users: {},
      sessions: {},
      vaults: {},
      vault_shares: {},
      vault_data: {},
      vault_history: [],
      item_shares: [],
      item_share_links: [],
      server_admins: {}
    };
    this.jsonFilePath = path.join(DATA_DIR, 'sothuchi_store.json');
    this.initDatabase();
  }

  initDatabase() {
    try {
      const { DatabaseSync } = require('node:sqlite');
      const dbPath = path.join(DATA_DIR, 'sothuchi.sqlite');
      this.sqliteDb = new DatabaseSync(dbPath);
      
      // Kích hoạt WAL mode để đọc/ghi đa luồng tốc độ cao
      this.sqliteDb.exec(`
        PRAGMA journal_mode = WAL;
        PRAGMA foreign_keys = ON;

        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          google_id TEXT UNIQUE,
          email TEXT UNIQUE,
          name TEXT,
          picture TEXT,
          created_at TEXT,
          updated_at TEXT
        );

        CREATE TABLE IF NOT EXISTS sessions (
          token TEXT PRIMARY KEY,
          user_id TEXT,
          expires_at INTEGER,
          created_at TEXT,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS vaults (
          id TEXT PRIMARY KEY,
          name TEXT,
          owner_id TEXT,
          version INTEGER DEFAULT 1,
          created_at TEXT,
          updated_at TEXT,
          FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS vault_shares (
          id TEXT PRIMARY KEY,
          vault_id TEXT,
          user_email TEXT,
          role TEXT,
          invited_by TEXT,
          created_at TEXT,
          UNIQUE(vault_id, user_email),
          FOREIGN KEY (vault_id) REFERENCES vaults(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS vault_data (
          vault_id TEXT PRIMARY KEY,
          data_json TEXT,
          version INTEGER DEFAULT 1,
          updated_at TEXT,
          updated_by TEXT,
          FOREIGN KEY (vault_id) REFERENCES vaults(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS vault_history (
          id TEXT PRIMARY KEY,
          vault_id TEXT,
          data_json TEXT,
          version INTEGER,
          synced_at TEXT,
          updated_by TEXT,
          FOREIGN KEY (vault_id) REFERENCES vaults(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS item_shares (
          id TEXT PRIMARY KEY,
          vault_id TEXT NOT NULL,
          item_type TEXT NOT NULL,
          item_id TEXT NOT NULL,
          item_name TEXT,
          user_email TEXT NOT NULL,
          role TEXT NOT NULL DEFAULT 'viewer',
          created_by TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_item_shares_lookup ON item_shares(vault_id, item_type, item_id);
        CREATE INDEX IF NOT EXISTS idx_item_shares_user ON item_shares(user_email);

        CREATE TABLE IF NOT EXISTS item_share_links (
          id TEXT PRIMARY KEY,
          token TEXT UNIQUE NOT NULL,
          vault_id TEXT NOT NULL,
          item_type TEXT NOT NULL,
          item_id TEXT NOT NULL,
          item_name TEXT,
          role TEXT NOT NULL DEFAULT 'viewer',
          created_by TEXT NOT NULL,
          created_at TEXT NOT NULL,
          expires_at TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_share_links_token ON item_share_links(token);
        CREATE INDEX IF NOT EXISTS idx_share_links_lookup ON item_share_links(vault_id, item_type, item_id);

        CREATE TABLE IF NOT EXISTS server_admins (
          email TEXT PRIMARY KEY,
          added_by TEXT,
          created_at TEXT
        );

        CREATE TABLE IF NOT EXISTS admin_sessions (
          token TEXT PRIMARY KEY,
          username TEXT,
          expires_at INTEGER,
          created_at TEXT
        );

        CREATE TABLE IF NOT EXISTS shared_item_projections (
          id TEXT PRIMARY KEY,
          vault_id TEXT NOT NULL,
          item_type TEXT NOT NULL,
          item_id TEXT NOT NULL,
          data_json TEXT NOT NULL,
          version INTEGER NOT NULL DEFAULT 1,
          updated_at TEXT NOT NULL,
          updated_by TEXT NOT NULL
        );
        CREATE UNIQUE INDEX IF NOT EXISTS idx_projections_unique ON shared_item_projections(vault_id, item_type, item_id);
      `);

      this.isSqlite = true;
      console.log(`[Storage] Đã khởi tạo SQLite Database tại: ${dbPath}`);
    } catch (err) {
      console.warn('[Storage] node:sqlite không khả dụng hoặc lỗi, chuyển sang JSON Store:', err.message);
      this.isSqlite = false;
      this.loadJsonStore();
    }
  }

  loadJsonStore() {
    if (fs.existsSync(this.jsonFilePath)) {
      try {
        const content = fs.readFileSync(this.jsonFilePath, 'utf8');
        this.jsonStore = JSON.parse(content);
        this.jsonStore.item_shares = Array.isArray(this.jsonStore.item_shares) ? this.jsonStore.item_shares : [];
        this.jsonStore.item_share_links = Array.isArray(this.jsonStore.item_share_links) ? this.jsonStore.item_share_links : [];
        this.jsonStore.shared_item_projections = typeof this.jsonStore.shared_item_projections === 'object' && this.jsonStore.shared_item_projections !== null ? this.jsonStore.shared_item_projections : {};
        this.jsonStore.admin_sessions = typeof this.jsonStore.admin_sessions === 'object' && this.jsonStore.admin_sessions !== null ? this.jsonStore.admin_sessions : {};
      } catch (e) {
        console.warn('[Storage] Không thể đọc JSON store, khởi tạo mới:', e.message);
      }
    }
  }

  saveJsonStore() {
    if (this.isSqlite) return;
    try {
      const tmpPath = `${this.jsonFilePath}.tmp.${Date.now()}`;
      fs.writeFileSync(tmpPath, JSON.stringify(this.jsonStore, null, 2), 'utf8');
      fs.renameSync(tmpPath, this.jsonFilePath);
    } catch (e) {
      console.error('[Storage] Lưu JSON store thất bại:', e);
    }
  }

  // --- Users & Sessions ---
  findUserByGoogleId(googleId) {
    if (this.isSqlite) {
      const stmt = this.sqliteDb.prepare('SELECT * FROM users WHERE google_id = ?');
      return stmt.get(googleId) || null;
    }
    return Object.values(this.jsonStore.users).find(u => u.google_id === googleId) || null;
  }

  findUserByEmail(email) {
    const cleanEmail = (email || '').toLowerCase().trim();
    if (this.isSqlite) {
      const stmt = this.sqliteDb.prepare('SELECT * FROM users WHERE LOWER(email) = ?');
      return stmt.get(cleanEmail) || null;
    }
    return Object.values(this.jsonStore.users).find(u => u.email.toLowerCase() === cleanEmail) || null;
  }

  findUserById(userId) {
    if (this.isSqlite) {
      const stmt = this.sqliteDb.prepare('SELECT * FROM users WHERE id = ?');
      return stmt.get(userId) || null;
    }
    return this.jsonStore.users[userId] || null;
  }

  upsertUser({ googleId, email, name, picture }) {
    const cleanEmail = (email || '').toLowerCase().trim();
    const now = new Date().toISOString();
    let existing = this.findUserByGoogleId(googleId) || this.findUserByEmail(cleanEmail);

    if (existing) {
      if (this.isSqlite) {
        this.sqliteDb.prepare(`
          UPDATE users 
          SET name = ?, picture = ?, email = ?, updated_at = ? 
          WHERE id = ?
        `).run(name || existing.name, picture || existing.picture, cleanEmail, now, existing.id);
        return this.findUserById(existing.id);
      } else {
        existing.name = name || existing.name;
        existing.picture = picture || existing.picture;
        existing.email = cleanEmail;
        existing.updated_at = now;
        this.saveJsonStore();
        return existing;
      }
    }

    const userId = 'usr_' + crypto.randomBytes(8).toString('hex');
    if (this.isSqlite) {
      this.sqliteDb.prepare(`
        INSERT INTO users (id, google_id, email, name, picture, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(userId, googleId, cleanEmail, name || 'Người dùng Google', picture || '', now, now);
      return this.findUserById(userId);
    } else {
      const newUser = {
        id: userId,
        google_id: googleId,
        email: cleanEmail,
        name: name || 'Người dùng Google',
        picture: picture || '',
        created_at: now,
        updated_at: now
      };
      this.jsonStore.users[userId] = newUser;
      this.saveJsonStore();
      return newUser;
    }
  }

  createSession(userId, expiresInDays = 90) {
    const token = 'stc_' + crypto.randomBytes(32).toString('hex');
    const expiresAt = Date.now() + (expiresInDays * 24 * 60 * 60 * 1000);
    const now = new Date().toISOString();

    if (this.isSqlite) {
      this.sqliteDb.prepare(`
        INSERT INTO sessions (token, user_id, expires_at, created_at)
        VALUES (?, ?, ?, ?)
      `).run(token, userId, expiresAt, now);
    } else {
      this.jsonStore.sessions[token] = { token, user_id: userId, expires_at: expiresAt, created_at: now };
      this.saveJsonStore();
    }
    return { token, expiresAt };
  }

  getUserByToken(token) {
    if (!token) return null;
    const now = Date.now();
    let session = null;

    if (this.isSqlite) {
      const stmt = this.sqliteDb.prepare('SELECT * FROM sessions WHERE token = ? AND expires_at > ?');
      session = stmt.get(token, now);
    } else {
      const s = this.jsonStore.sessions[token];
      if (s && s.expires_at > now) session = s;
    }

    if (!session) return null;
    return this.findUserById(session.user_id);
  }

  getAllUsers() {
    if (this.isSqlite) {
      const stmt = this.sqliteDb.prepare('SELECT id, email, name, picture FROM users ORDER BY name ASC');
      return stmt.all() || [];
    }
    return Object.values(this.jsonStore.users || {}).map(u => ({
      id: u.id,
      email: u.email,
      name: u.name,
      picture: u.picture
    }));
  }

  deleteSession(token) {
    if (this.isSqlite) {
      this.sqliteDb.prepare('DELETE FROM sessions WHERE token = ?').run(token);
    } else {
      delete this.jsonStore.sessions[token];
      this.saveJsonStore();
    }
  }

  // --- Vaults & Sharing ---
  getUserVaults(userId, userEmail) {
    const cleanEmail = (userEmail || '').toLowerCase().trim();
    if (this.isSqlite) {
      // 1. Sổ do chính user sở hữu
      const ownedStmt = this.sqliteDb.prepare(`
        SELECT v.*, 'owner' as role, u.name as owner_name, u.email as owner_email, u.picture as owner_picture
        FROM vaults v
        JOIN users u ON v.owner_id = u.id
        WHERE v.owner_id = ?
      `);
      const owned = ownedStmt.all(userId);

      // 2. Sổ được chia sẻ cho userEmail
      const sharedStmt = this.sqliteDb.prepare(`
        SELECT v.*, vs.role as role, u.name as owner_name, u.email as owner_email, u.picture as owner_picture, vs.id as share_id
        FROM vault_shares vs
        JOIN vaults v ON vs.vault_id = v.id
        JOIN users u ON v.owner_id = u.id
        WHERE LOWER(vs.user_email) = ?
      `);
      const shared = sharedStmt.all(cleanEmail);

      return [...owned, ...shared];
    } else {
      const result = [];
      for (const v of Object.values(this.jsonStore.vaults)) {
        const owner = this.findUserById(v.owner_id) || {};
        if (v.owner_id === userId) {
          result.push({
            ...v,
            role: 'owner',
            owner_name: owner.name || '',
            owner_email: owner.email || '',
            owner_picture: owner.picture || ''
          });
        }
      }

      for (const s of Object.values(this.jsonStore.vault_shares)) {
        if (s.user_email.toLowerCase() === cleanEmail) {
          const v = this.jsonStore.vaults[s.vault_id];
          if (v) {
            const owner = this.findUserById(v.owner_id) || {};
            result.push({
              ...v,
              role: s.role,
              owner_name: owner.name || '',
              owner_email: owner.email || '',
              owner_picture: owner.picture || '',
              share_id: s.id
            });
          }
        }
      }
      return result;
    }
  }

  getVaultById(vaultId) {
    if (this.isSqlite) {
      return this.sqliteDb.prepare('SELECT * FROM vaults WHERE id = ?').get(vaultId) || null;
    }
    return this.jsonStore.vaults[vaultId] || null;
  }

  getVaultRole(vaultId, userId, userEmail) {
    const vault = this.getVaultById(vaultId);
    if (!vault) return null;
    if (vault.owner_id === userId) return 'owner';

    const cleanEmail = (userEmail || '').toLowerCase().trim();
    if (this.isSqlite) {
      const stmt = this.sqliteDb.prepare('SELECT role FROM vault_shares WHERE vault_id = ? AND LOWER(user_email) = ?');
      const share = stmt.get(vaultId, cleanEmail);
      return share ? share.role : null;
    } else {
      const share = Object.values(this.jsonStore.vault_shares).find(
        s => s.vault_id === vaultId && s.user_email.toLowerCase() === cleanEmail
      );
      return share ? share.role : null;
    }
  }

  createVault(name, ownerId) {
    const vaultId = 'vlt_' + crypto.randomBytes(8).toString('hex');
    const now = new Date().toISOString();
    const defaultName = name && name.trim() ? name.trim() : 'Sổ Cá Nhân';

    if (this.isSqlite) {
      this.sqliteDb.prepare(`
        INSERT INTO vaults (id, name, owner_id, version, created_at, updated_at)
        VALUES (?, ?, ?, 1, ?, ?)
      `).run(vaultId, defaultName, ownerId, now, now);
      
      // Tạo bản ghi dữ liệu trắng ban đầu
      this.sqliteDb.prepare(`
        INSERT INTO vault_data (vault_id, data_json, version, updated_at, updated_by)
        VALUES (?, ?, 1, ?, ?)
      `).run(vaultId, JSON.stringify({}), now, ownerId);
    } else {
      this.jsonStore.vaults[vaultId] = {
        id: vaultId,
        name: defaultName,
        owner_id: ownerId,
        version: 1,
        created_at: now,
        updated_at: now
      };
      this.jsonStore.vault_data[vaultId] = {
        vault_id: vaultId,
        data_json: '{}',
        version: 1,
        updated_at: now,
        updated_by: ownerId
      };
      this.saveJsonStore();
    }
    return this.getVaultById(vaultId);
  }

  copyVault(sourceVaultId, newName, newOwnerId) {
    const sourceVault = this.getVaultById(sourceVaultId);
    if (!sourceVault) throw new Error('Sổ nguồn không tồn tại');

    let raw = null;
    if (this.isSqlite) {
      raw = this.sqliteDb.prepare('SELECT * FROM vault_data WHERE vault_id = ?').get(sourceVaultId);
    } else {
      raw = this.jsonStore.vault_data[sourceVaultId];
    }
    const dataJson = raw && raw.data_json ? raw.data_json : '{}';

    const newVault = this.createVault(newName || `${sourceVault.name} (Bản sao)`, newOwnerId);
    const now = new Date().toISOString();
    if (this.isSqlite) {
      this.sqliteDb.prepare(`
        UPDATE vault_data
        SET data_json = ?, version = 1, updated_at = ?, updated_by = ?
        WHERE vault_id = ?
      `).run(dataJson, now, newOwnerId, newVault.id);
    } else {
      this.jsonStore.vault_data[newVault.id] = {
        vault_id: newVault.id,
        data_json: dataJson,
        version: 1,
        updated_at: now,
        updated_by: newOwnerId
      };
      this.saveJsonStore();
    }
    return this.getVaultById(newVault.id);
  }

  renameVault(vaultId, newName) {
    const now = new Date().toISOString();
    if (this.isSqlite) {
      this.sqliteDb.prepare('UPDATE vaults SET name = ?, updated_at = ? WHERE id = ?').run(newName, now, vaultId);
    } else {
      if (this.jsonStore.vaults[vaultId]) {
        this.jsonStore.vaults[vaultId].name = newName;
        this.jsonStore.vaults[vaultId].updated_at = now;
        this.saveJsonStore();
      }
    }
    return this.getVaultById(vaultId);
  }

  deleteVault(vaultId) {
    if (this.isSqlite) {
      this.sqliteDb.prepare('DELETE FROM vaults WHERE id = ?').run(vaultId);
      this.sqliteDb.prepare('DELETE FROM vault_shares WHERE vault_id = ?').run(vaultId);
      this.sqliteDb.prepare('DELETE FROM vault_data WHERE vault_id = ?').run(vaultId);
      this.sqliteDb.prepare('DELETE FROM vault_history WHERE vault_id = ?').run(vaultId);
    } else {
      delete this.jsonStore.vaults[vaultId];
      delete this.jsonStore.vault_data[vaultId];
      for (const k of Object.keys(this.jsonStore.vault_shares)) {
        if (this.jsonStore.vault_shares[k].vault_id === vaultId) delete this.jsonStore.vault_shares[k];
      }
      this.jsonStore.vault_history = this.jsonStore.vault_history.filter(h => h.vault_id !== vaultId);
      this.saveJsonStore();
    }
  }

  // --- Vault Shares Management ---
  getVaultShares(vaultId) {
    if (this.isSqlite) {
      const stmt = this.sqliteDb.prepare(`
        SELECT vs.*, vs.user_email as email, u.name as user_name, u.picture as user_picture
        FROM vault_shares vs
        LEFT JOIN users u ON LOWER(vs.user_email) = LOWER(u.email)
        WHERE vs.vault_id = ?
        ORDER BY vs.created_at ASC
      `);
      return stmt.all(vaultId);
    } else {
      const result = [];
      for (const s of Object.values(this.jsonStore.vault_shares)) {
        if (s.vault_id === vaultId) {
          const user = this.findUserByEmail(s.user_email) || {};
          result.push({
            ...s,
            user_name: user.name || '',
            user_picture: user.picture || ''
          });
        }
      }
      return result;
    }
  }

  addOrUpdateShare(vaultId, email, role, invitedBy) {
    const cleanEmail = email.toLowerCase().trim();
    const shareRole = role === 'viewer' ? 'viewer' : 'editor';
    const now = new Date().toISOString();

    if (this.isSqlite) {
      const existing = this.sqliteDb.prepare('SELECT id FROM vault_shares WHERE vault_id = ? AND LOWER(user_email) = ?').get(vaultId, cleanEmail);
      if (existing) {
        this.sqliteDb.prepare('UPDATE vault_shares SET role = ? WHERE id = ?').run(shareRole, existing.id);
        return { id: existing.id, vault_id: vaultId, user_email: cleanEmail, email: cleanEmail, role: shareRole };
      }
      const shareId = 'shr_' + crypto.randomBytes(8).toString('hex');
      this.sqliteDb.prepare(`
        INSERT INTO vault_shares (id, vault_id, user_email, role, invited_by, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(shareId, vaultId, cleanEmail, shareRole, invitedBy, now);
      return { id: shareId, vault_id: vaultId, user_email: cleanEmail, email: cleanEmail, role: shareRole, created_at: now };
    } else {
      const existing = Object.values(this.jsonStore.vault_shares).find(
        s => s.vault_id === vaultId && s.user_email.toLowerCase() === cleanEmail
      );
      if (existing) {
        existing.role = shareRole;
        this.saveJsonStore();
        return existing;
      }
      const shareId = 'shr_' + crypto.randomBytes(8).toString('hex');
      const newShare = { id: shareId, vault_id: vaultId, user_email: cleanEmail, email: cleanEmail, role: shareRole, invited_by: invitedBy, created_at: now };
      this.jsonStore.vault_shares[shareId] = newShare;
      this.saveJsonStore();
      return newShare;
    }
  }

  removeShare(vaultId, shareIdOrEmail) {
    if (this.isSqlite) {
      if (shareIdOrEmail.includes('@')) {
        this.sqliteDb.prepare('DELETE FROM vault_shares WHERE vault_id = ? AND LOWER(user_email) = ?').run(vaultId, shareIdOrEmail.toLowerCase().trim());
      } else {
        this.sqliteDb.prepare('DELETE FROM vault_shares WHERE vault_id = ? AND id = ?').run(vaultId, shareIdOrEmail);
      }
    } else {
      for (const k of Object.keys(this.jsonStore.vault_shares)) {
        const s = this.jsonStore.vault_shares[k];
        if (s.vault_id === vaultId && (s.id === shareIdOrEmail || s.user_email.toLowerCase() === shareIdOrEmail.toLowerCase().trim())) {
          delete this.jsonStore.vault_shares[k];
        }
      }
      this.saveJsonStore();
    }
  }

  // --- Vault Data & Synchronization ---
  getVaultData(vaultId) {
    let raw = null;
    if (this.isSqlite) {
      raw = this.sqliteDb.prepare('SELECT * FROM vault_data WHERE vault_id = ?').get(vaultId);
    } else {
      raw = this.jsonStore.vault_data[vaultId];
    }
    if (!raw) return null;

    let parsedData = {};
    try {
      parsedData = JSON.parse(raw.data_json || '{}');
    } catch (e) {
      console.warn('Lỗi phân tích JSON vault_data:', e);
    }
    return {
      vault_id: raw.vault_id,
      version: raw.version || 1,
      updated_at: raw.updated_at,
      updated_by: raw.updated_by,
      data: parsedData
    };
  }

  saveVaultData(vaultId, dataObj, updatedBy) {
    const now = new Date().toISOString();
    const current = this.getVaultData(vaultId);
    const jsonStr = JSON.stringify(dataObj);
    if (current && JSON.stringify(current.data) === jsonStr) {
      return { vault_id: vaultId, version: current.version, updated_at: current.updated_at, updated_by: current.updated_by, data: current.data, unchanged: true };
    }
    const nextVersion = (current?.version || 0) + 1;

    if (this.isSqlite) {
      this.sqliteDb.prepare(`
        INSERT INTO vault_data (vault_id, data_json, version, updated_at, updated_by)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(vault_id) DO UPDATE SET
          data_json = excluded.data_json,
          version = excluded.version,
          updated_at = excluded.updated_at,
          updated_by = excluded.updated_by
      `).run(vaultId, jsonStr, nextVersion, now, updatedBy);

      // Cập nhật updatedAt của vault
      this.sqliteDb.prepare('UPDATE vaults SET version = ?, updated_at = ? WHERE id = ?').run(nextVersion, now, vaultId);

      // Lưu 1 bản snapshot vào lịch sử (giữ tối đa 20 bản gần nhất)
      const histId = 'hst_' + crypto.randomBytes(8).toString('hex');
      this.sqliteDb.prepare(`
        INSERT INTO vault_history (id, vault_id, data_json, version, synced_at, updated_by)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(histId, vaultId, jsonStr, nextVersion, now, updatedBy);

      // Xóa các snapshot cũ hơn 20 bản
      this.sqliteDb.prepare(`
        DELETE FROM vault_history
        WHERE vault_id = ? AND id NOT IN (
          SELECT id FROM vault_history WHERE vault_id = ? ORDER BY synced_at DESC LIMIT 20
        )
      `).run(vaultId, vaultId);
    } else {
      this.jsonStore.vault_data[vaultId] = {
        vault_id: vaultId,
        data_json: jsonStr,
        version: nextVersion,
        updated_at: now,
        updated_by: updatedBy
      };
      if (this.jsonStore.vaults[vaultId]) {
        this.jsonStore.vaults[vaultId].version = nextVersion;
        this.jsonStore.vaults[vaultId].updated_at = now;
      }
      this.jsonStore.vault_history.unshift({
        id: 'hst_' + crypto.randomBytes(8).toString('hex'),
        vault_id: vaultId,
        data_json: jsonStr,
        version: nextVersion,
        synced_at: now,
        updated_by: updatedBy
      });
      // Giữ tối đa 20 bản cho vault này
      const keep = [];
      let count = 0;
      for (const h of this.jsonStore.vault_history) {
        if (h.vault_id === vaultId) {
          if (count < 20) {
            keep.push(h);
            count++;
          }
        } else {
          keep.push(h);
        }
      }
      this.jsonStore.vault_history = keep;
      this.saveJsonStore();
    }

    return {
      vault_id: vaultId,
      version: nextVersion,
      updated_at: now,
      updated_by: updatedBy,
      data: dataObj
    };
  }

  getVaultHistoryEntry(vaultId, historyId) {
    if (this.isSqlite) {
      const stmt = this.sqliteDb.prepare(`
        SELECT * FROM vault_history
        WHERE vault_id = ? AND id = ?
      `);
      return stmt.get(vaultId, historyId) || null;
    } else {
      return this.jsonStore.vault_history.find(h => h.vault_id === vaultId && h.id === historyId) || null;
    }
  }

  restoreVaultHistory(vaultId, historyId, updatedBy) {
    const entry = this.getVaultHistoryEntry(vaultId, historyId);
    if (!entry) return null;
    let dataObj = {};
    try {
      dataObj = JSON.parse(entry.data_json || '{}');
    } catch (e) {
      console.warn('Lỗi phân tích JSON snapshot:', e);
    }
    return this.saveVaultData(vaultId, dataObj, updatedBy);
  }

  // --- Per-Item Sharing Methods (Granular Sharing) ---
  getItemShares(vaultId, itemType, itemId) {
    if (this.isSqlite) {
      const stmt = this.sqliteDb.prepare(`
        SELECT s.*, u.name as user_name, u.picture as user_picture
        FROM item_shares s
        LEFT JOIN users u ON LOWER(u.email) = LOWER(s.user_email)
        WHERE s.vault_id = ? AND s.item_type = ? AND s.item_id = ?
        ORDER BY s.created_at DESC
      `);
      return stmt.all(vaultId, itemType, String(itemId));
    } else {
      return (this.jsonStore.item_shares || [])
        .filter(s => s.vault_id === vaultId && s.item_type === itemType && String(s.item_id) === String(itemId))
        .map(s => {
          const u = (this.jsonStore.users || []).find(u => u.email.toLowerCase() === s.user_email.toLowerCase());
          return { ...s, user_name: u?.name || null, user_picture: u?.picture || null };
        });
    }
  }

  getItemShareLinks(vaultId, itemType, itemId) {
    if (this.isSqlite) {
      const stmt = this.sqliteDb.prepare(`
        SELECT * FROM item_share_links
        WHERE vault_id = ? AND item_type = ? AND item_id = ?
        ORDER BY created_at DESC
      `);
      return stmt.all(vaultId, itemType, String(itemId));
    } else {
      return (this.jsonStore.item_share_links || [])
        .filter(l => l.vault_id === vaultId && l.item_type === itemType && String(l.item_id) === String(itemId));
    }
  }

  addItemShare(vaultId, itemType, itemId, itemName, email, role, createdBy) {
    const id = generateId('ishr_');
    const now = new Date().toISOString();
    const cleanEmail = email.trim().toLowerCase();

    if (this.isSqlite) {
      const checkStmt = this.sqliteDb.prepare(`
        SELECT id FROM item_shares
        WHERE vault_id = ? AND item_type = ? AND item_id = ? AND LOWER(user_email) = ?
      `);
      const existing = checkStmt.get(vaultId, itemType, String(itemId), cleanEmail);
      if (existing) {
        const updateStmt = this.sqliteDb.prepare(`
          UPDATE item_shares
          SET role = ?, updated_at = ?
          WHERE id = ?
        `);
        updateStmt.run(role, now, existing.id);
        return { id: existing.id, vault_id: vaultId, item_type: itemType, item_id: itemId, item_name: itemName, user_email: cleanEmail, role, updated_at: now };
      }

      const insertStmt = this.sqliteDb.prepare(`
        INSERT INTO item_shares (id, vault_id, item_type, item_id, item_name, user_email, role, created_by, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      insertStmt.run(id, vaultId, itemType, String(itemId), itemName || '', cleanEmail, role, createdBy, now, now);
      return { id, vault_id: vaultId, item_type: itemType, item_id: itemId, item_name: itemName, user_email: cleanEmail, role, created_by: createdBy, created_at: now, updated_at: now };
    } else {
      this.jsonStore.item_shares = this.jsonStore.item_shares || [];
      const idx = this.jsonStore.item_shares.findIndex(s => s.vault_id === vaultId && s.item_type === itemType && String(s.item_id) === String(itemId) && s.user_email.toLowerCase() === cleanEmail);
      if (idx >= 0) {
        this.jsonStore.item_shares[idx].role = role;
        this.jsonStore.item_shares[idx].updated_at = now;
        this.saveJsonStore();
        return this.jsonStore.item_shares[idx];
      }
      const record = { id, vault_id: vaultId, item_type: itemType, item_id: String(itemId), item_name: itemName || '', user_email: cleanEmail, role, created_by: createdBy, created_at: now, updated_at: now };
      this.jsonStore.item_shares.push(record);
      this.saveJsonStore();
      return record;
    }
  }

  removeItemShare(shareId, userEmail) {
    if (this.isSqlite) {
      const stmt = this.sqliteDb.prepare('DELETE FROM item_shares WHERE id = ?');
      stmt.run(shareId);
    } else {
      this.jsonStore.item_shares = (this.jsonStore.item_shares || []).filter(s => s.id !== shareId);
      this.saveJsonStore();
    }
    return true;
  }

  createItemShareLink(vaultId, itemType, itemId, itemName, role, createdBy) {
    const id = generateId('ilnk_');
    const token = crypto.randomBytes(16).toString('hex');
    const now = new Date().toISOString();

    if (this.isSqlite) {
      const stmt = this.sqliteDb.prepare(`
        INSERT INTO item_share_links (id, token, vault_id, item_type, item_id, item_name, role, created_by, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      stmt.run(id, token, vaultId, itemType, String(itemId), itemName || '', role, createdBy, now);
    } else {
      this.jsonStore.item_share_links = this.jsonStore.item_share_links || [];
      this.jsonStore.item_share_links.push({ id, token, vault_id: vaultId, item_type: itemType, item_id: String(itemId), item_name: itemName || '', role, created_by: createdBy, created_at: now });
      this.saveJsonStore();
    }
    return { id, token, vault_id: vaultId, item_type: itemType, item_id: itemId, item_name: itemName, role, created_at: now };
  }

  revokeItemShareLink(linkId) {
    if (this.isSqlite) {
      const stmt = this.sqliteDb.prepare('DELETE FROM item_share_links WHERE id = ?');
      stmt.run(linkId);
    } else {
      this.jsonStore.item_share_links = (this.jsonStore.item_share_links || []).filter(l => l.id !== linkId);
      this.saveJsonStore();
    }
    return true;
  }

  getShareLinkByToken(token) {
    if (this.isSqlite) {
      const stmt = this.sqliteDb.prepare(`
        SELECT l.*, u.name as owner_name, u.email as owner_email
        FROM item_share_links l
        LEFT JOIN users u ON u.id = l.created_by
        WHERE l.token = ?
      `);
      return stmt.get(token) || null;
    } else {
      const l = (this.jsonStore.item_share_links || []).find(x => x.token === token);
      if (!l) return null;
      const u = (this.jsonStore.users || []).find(u => u.id === l.created_by);
      return { ...l, owner_name: u?.name || 'Chủ sở hữu', owner_email: u?.email || '' };
    }
  }

  getReceivedSharesForEmail(email) {
    const cleanEmail = email.trim().toLowerCase();
    if (this.isSqlite) {
      const stmt = this.sqliteDb.prepare(`
        SELECT s.*, v.name as vault_name, u.name as owner_name, u.email as owner_email
        FROM item_shares s
        JOIN vaults v ON v.id = s.vault_id
        JOIN users u ON u.id = v.owner_id
        WHERE LOWER(s.user_email) = ?
      `);
      return stmt.all(cleanEmail);
    } else {
      return (this.jsonStore.item_shares || [])
        .filter(s => s.user_email.toLowerCase() === cleanEmail)
        .map(s => {
          const v = (this.jsonStore.vaults || []).find(x => x.id === s.vault_id);
          const u = v ? (this.jsonStore.users || []).find(x => x.id === v.owner_id) : null;
          return { ...s, vault_name: v?.name || '', owner_name: u?.name || '', owner_email: u?.email || '' };
        });
    }
  }

  saveItemProjection(vaultId, itemType, itemId, projectionData, updatedBy) {
    const now = new Date().toISOString();
    const dataJson = typeof projectionData === 'string' ? projectionData : JSON.stringify(projectionData);
    const id = `prj_${vaultId}_${itemType}_${itemId}`;

    if (this.isSqlite) {
      this.sqliteDb.prepare(`
        INSERT INTO shared_item_projections (id, vault_id, item_type, item_id, data_json, version, updated_at, updated_by)
        VALUES (?, ?, ?, ?, ?, 1, ?, ?)
        ON CONFLICT(vault_id, item_type, item_id) DO UPDATE SET
          data_json = excluded.data_json,
          version = version + 1,
          updated_at = excluded.updated_at,
          updated_by = excluded.updated_by
      `).run(id, vaultId, itemType, String(itemId), dataJson, now, updatedBy);
    } else {
      this.jsonStore.shared_item_projections = this.jsonStore.shared_item_projections || {};
      const key = `${vaultId}_${itemType}_${itemId}`;
      const cur = this.jsonStore.shared_item_projections[key];
      const nextVer = (cur?.version || 0) + 1;
      this.jsonStore.shared_item_projections[key] = {
        id, vault_id: vaultId, item_type: itemType, item_id: String(itemId),
        data_json: dataJson, version: nextVer, updated_at: now, updated_by: updatedBy
      };
      this.saveJsonStore();
    }
    return { success: true, updated_at: now };
  }

  getItemProjection(vaultId, itemType, itemId) {
    let raw;
    if (this.isSqlite) {
      raw = this.sqliteDb.prepare('SELECT * FROM shared_item_projections WHERE vault_id = ? AND item_type = ? AND item_id = ?').get(vaultId, itemType, String(itemId));
    } else {
      const key = `${vaultId}_${itemType}_${itemId}`;
      raw = (this.jsonStore.shared_item_projections || {})[key];
    }
    if (!raw) return null;
    try {
      return {
        ...raw,
        data: JSON.parse(raw.data_json)
      };
    } catch (_) {
      return null;
    }
  }

  getReceivedItemData(vaultId, itemType, itemId) {
    // 1. Ưu tiên Bản Chiếu Độc Lập (Client-Side Projection - hỗ trợ mã hóa E2EE)
    const proj = this.getItemProjection(vaultId, itemType, itemId);
    if (proj && proj.data) {
      if (proj.data.encrypted) {
        return {
          isProjection: true,
          isEncrypted: true,
          projectionData: proj.data
        };
      }
      return {
        isProjection: true,
        isEncrypted: false,
        item: proj.data.item,
        transactions: Array.isArray(proj.data.transactions) ? proj.data.transactions : [],
        categories: Array.isArray(proj.data.categories) ? proj.data.categories : []
      };
    }

    // 2. Fallback bóc tách từ vault.data (nếu sổ không bật mã hóa E2EE)
    const vault = this.getVaultData(vaultId);
    if (!vault || !vault.data) return null;
    const data = vault.data;

    let targetItem = null;
    let transactions = [];

    if (itemType === 'account') {
      const accs = Array.isArray(data.accounts) ? data.accounts : [];
      targetItem = accs.find(a => String(a.id) === String(itemId)) || null;

      const txs = Array.isArray(data.transactions) ? data.transactions : [];
      transactions = txs.filter(t => String(t.accountId) === String(itemId) || String(t.toAccountId) === String(itemId));
    } else if (itemType === 'savings' || itemType === 'saving') {
      const savings = Array.isArray(data.savings) ? data.savings : [];
      targetItem = savings.find(s => String(s.id) === String(itemId)) || null;
    } else if (itemType === 'accumulation' || itemType === 'accumulations') {
      const accs = Array.isArray(data.accumulations) ? data.accumulations : [];
      targetItem = accs.find(a => String(a.id) === String(itemId)) || null;
    } else if (itemType === 'loan' || itemType === 'loans') {
      const loans = Array.isArray(data.loans) ? data.loans : [];
      targetItem = loans.find(l => String(l.id) === String(itemId)) || null;
    } else if (itemType === 'asset' || itemType === 'assets') {
      const assets = Array.isArray(data.assets) ? data.assets : [];
      targetItem = assets.find(a => String(a.id) === String(itemId)) || null;
    }

    return {
      item: targetItem,
      transactions,
      categories: Array.isArray(data.categories) ? data.categories : []
    };
  }

  saveSharedItemTransactions(shareId, email, incomingTxs, incomingProjection = null) {
    let share = null;
    if (this.isSqlite) {
      share = this.sqliteDb.prepare('SELECT * FROM item_shares WHERE id = ?').get(shareId);
    } else {
      share = (this.jsonStore.item_shares || []).find(s => s.id === shareId);
    }

    if (!share) throw new Error('Không tìm thấy thông tin chia sẻ.');
    if (share.role !== 'editor') throw new Error('Bạn không có quyền chỉnh sửa tài khoản này.');

    // Nếu Editor gửi kèm bản chiếu đã cập nhật (hỗ trợ cả E2EE)
    if (incomingProjection) {
      this.saveItemProjection(share.vault_id, share.item_type, share.item_id, incomingProjection, email);
      return { success: true, isProjection: true };
    }

    // Nếu đã có bản chiếu plain trên server
    const proj = this.getItemProjection(share.vault_id, share.item_type, share.item_id);
    if (proj && proj.data && !proj.data.encrypted) {
      const currentTxs = Array.isArray(proj.data.transactions) ? proj.data.transactions : [];
      const mergedTxs = mergeTableData(currentTxs, incomingTxs, false);
      proj.data.transactions = mergedTxs;
      this.saveItemProjection(share.vault_id, share.item_type, share.item_id, proj.data, email);
      return { success: true, count: mergedTxs.length };
    }

    const vault = this.getVaultData(share.vault_id);
    if (!vault || !vault.data) throw new Error('Dữ liệu sổ chủ sở hữu không khả dụng.');

    if (Array.isArray(vault.data.transactions)) {
      const currentTxs = vault.data.transactions;
      const mergedTxs = mergeTableData(currentTxs, incomingTxs, false);
      vault.data.transactions = mergedTxs;
      this.saveVaultData(share.vault_id, vault.data, email);
      return { success: true, count: mergedTxs.length };
    }

    return { success: true };
  }

  getVaultHistory(vaultId) {
    if (this.isSqlite) {
      const stmt = this.sqliteDb.prepare(`
        SELECT id, vault_id, version, synced_at, updated_by, LENGTH(data_json) as data_size
        FROM vault_history
        WHERE vault_id = ?
        ORDER BY synced_at DESC
        LIMIT 20
      `);
      return stmt.all(vaultId);
    } else {
      return this.jsonStore.vault_history
        .filter(h => h.vault_id === vaultId)
        .map(h => ({
          id: h.id,
          vault_id: h.vault_id,
          version: h.version,
          synced_at: h.synced_at,
          updated_by: h.updated_by,
          data_size: (h.data_json || '').length
        }));
    }
  }


  // ==============================================================================
  // ADMIN MANAGEMENT METHODS (Quản trị Máy chủ sao lưu & Dọn rác)
  // ==============================================================================
  createAdminSession(username, expiresInDays = 7) {
    const token = 'stc_adm_' + crypto.randomBytes(32).toString('hex');
    const expiresAt = Date.now() + (expiresInDays * 24 * 60 * 60 * 1000);
    const now = new Date().toISOString();

    if (this.isSqlite) {
      this.sqliteDb.prepare(`
        INSERT INTO admin_sessions (token, username, expires_at, created_at)
        VALUES (?, ?, ?, ?)
      `).run(token, username, expiresAt, now);
    } else {
      this.jsonStore.admin_sessions = this.jsonStore.admin_sessions || {};
      this.jsonStore.admin_sessions[token] = { token, username, expires_at: expiresAt, created_at: now };
      this.saveJsonStore();
    }
    return { token, expiresAt };
  }

  getAdminSession(token) {
    if (!token) return null;
    const now = Date.now();
    if (this.isSqlite) {
      const stmt = this.sqliteDb.prepare('SELECT * FROM admin_sessions WHERE token = ? AND expires_at > ?');
      return stmt.get(token, now) || null;
    }
    const s = (this.jsonStore.admin_sessions || {})[token];
    if (s && s.expires_at > now) return s;
    return null;
  }

  deleteAdminSession(token) {
    if (!token) return;
    if (this.isSqlite) {
      this.sqliteDb.prepare('DELETE FROM admin_sessions WHERE token = ?').run(token);
    } else if (this.jsonStore.admin_sessions) {
      delete this.jsonStore.admin_sessions[token];
      this.saveJsonStore();
    }
  }

  getDatabaseStorageStats() {
    let sizeBytes = 0;
    const files = [];
    try {
      const mainDb = path.join(DATA_DIR, 'sothuchi.sqlite');
      if (fs.existsSync(mainDb)) {
        const s = fs.statSync(mainDb);
        sizeBytes += s.size;
        files.push({ name: 'sothuchi.sqlite', size: s.size });
      }
      const walDb = path.join(DATA_DIR, 'sothuchi.sqlite-wal');
      if (fs.existsSync(walDb)) {
        const s = fs.statSync(walDb);
        sizeBytes += s.size;
        files.push({ name: 'sothuchi.sqlite-wal', size: s.size });
      }
      const shmDb = path.join(DATA_DIR, 'sothuchi.sqlite-shm');
      if (fs.existsSync(shmDb)) {
        const s = fs.statSync(shmDb);
        sizeBytes += s.size;
        files.push({ name: 'sothuchi.sqlite-shm', size: s.size });
      }
      const jsonDb = path.join(DATA_DIR, 'sothuchi_store.json');
      if (fs.existsSync(jsonDb)) {
        const s = fs.statSync(jsonDb);
        sizeBytes += s.size;
        files.push({ name: 'sothuchi_store.json', size: s.size });
      }
    } catch (_) {}
    return { sizeBytes, files };
  }

  getAdminOverview() {
    const now = Date.now();
    const nowIso = new Date().toISOString();
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    let allUsers = [];
    let allVaults = [];
    let allVaultData = [];
    let allSessions = [];
    let allHistory = [];
    let allItemShares = [];
    let allItemShareLinks = [];

    if (this.isSqlite) {
      allUsers = this.sqliteDb.prepare('SELECT * FROM users').all();
      allVaults = this.sqliteDb.prepare('SELECT * FROM vaults').all();
      allVaultData = this.sqliteDb.prepare('SELECT vault_id, LENGTH(data_json) as data_size, data_json, updated_at FROM vault_data').all();
      allSessions = this.sqliteDb.prepare('SELECT * FROM sessions').all();
      allHistory = this.sqliteDb.prepare('SELECT id, vault_id, version, synced_at, LENGTH(data_json) as data_size FROM vault_history').all();
      allItemShares = this.sqliteDb.prepare('SELECT * FROM item_shares').all();
      allItemShareLinks = this.sqliteDb.prepare('SELECT * FROM item_share_links').all();
    } else {
      allUsers = Object.values(this.jsonStore.users || {});
      allVaults = Object.values(this.jsonStore.vaults || {});
      allVaultData = Object.values(this.jsonStore.vault_data || {}).map(vd => ({
        vault_id: vd.vault_id,
        data_size: (vd.data_json || '').length,
        data_json: vd.data_json,
        updated_at: vd.updated_at
      }));
      allSessions = Object.values(this.jsonStore.sessions || {});
      allHistory = this.jsonStore.vault_history || [];
      allItemShares = this.jsonStore.item_shares || [];
      allItemShareLinks = this.jsonStore.item_share_links || [];
    }

    const vaultDataMap = new Map();
    for (const vd of allVaultData) {
      let txCount = 0;
      let isEncrypted = false;
      try {
        const parsed = JSON.parse(vd.data_json || '{}');
        if (parsed.encrypted && parsed.payload) {
          isEncrypted = true;
        } else if (Array.isArray(parsed.transactions)) {
          txCount = parsed.transactions.length;
        }
      } catch (_) {}
      vaultDataMap.set(vd.vault_id, {
        size: vd.data_size || 0,
        txCount,
        isEncrypted,
        updatedAt: vd.updated_at
      });
    }

    const testUsers = allUsers.filter(u => {
      const gId = (u.google_id || '').toLowerCase();
      const email = (u.email || '').toLowerCase();
      const name = (u.name || '').toLowerCase();
      return gId.startsWith('quick_') || email.includes('test') || email.includes('demo') || email.endsWith('@example.com') || name.includes('test') || name.includes('demo');
    });

    let emptyVaultsCount = 0;
    let testVaultsCount = 0;
    let abandonedVaultsCount = 0;

    for (const v of allVaults) {
      const vData = vaultDataMap.get(v.id);
      const isTestUserOwner = testUsers.some(tu => tu.id === v.owner_id);
      const vName = (v.name || '').toLowerCase();
      const isTestName = vName.includes('test') || vName.includes('demo') || vName.includes('nháp') || vName.includes('thử nghiệm');

      if (isTestUserOwner || isTestName) {
        testVaultsCount++;
      }

      if (!vData || (!vData.isEncrypted && vData.txCount === 0)) {
        emptyVaultsCount++;
      }

      const lastUpdate = v.updated_at || (vData ? vData.updatedAt : null) || v.created_at;
      if (lastUpdate && lastUpdate < thirtyDaysAgo) {
        abandonedVaultsCount++;
      }
    }

    const expiredSessions = allSessions.filter(s => s.expires_at <= now);
    const expiredLinks = allItemShareLinks.filter(l => l.expires_at && l.expires_at <= nowIso);
    const storageStats = this.getDatabaseStorageStats();

    return {
      users: {
        total: allUsers.length,
        testCount: testUsers.length,
        realCount: allUsers.length - testUsers.length
      },
      vaults: {
        total: allVaults.length,
        emptyCount: emptyVaultsCount,
        testCount: testVaultsCount,
        abandonedCount: abandonedVaultsCount
      },
      garbage: {
        totalGarbageItems: testUsers.length + emptyVaultsCount + expiredSessions.length + expiredLinks.length,
        expiredSessionsCount: expiredSessions.length,
        expiredLinksCount: expiredLinks.length,
        emptyVaultsCount,
        testVaultsCount,
        testUsersCount: testUsers.length,
        abandonedVaultsCount,
        snapshotsCount: allHistory.length
      },
      sessions: {
        total: allSessions.length,
        active: allSessions.length - expiredSessions.length,
        expired: expiredSessions.length
      },
      shares: {
        itemSharesCount: allItemShares.length,
        totalLinks: allItemShareLinks.length,
        activeLinks: allItemShareLinks.length - expiredLinks.length,
        expiredLinks: expiredLinks.length
      },
      storage: {
        engine: this.isSqlite ? 'SQLite (node:sqlite WAL)' : 'JSON Store',
        dbSizeBytes: storageStats.sizeBytes,
        files: storageStats.files,
        snapshotsTotal: allHistory.length
      },
      system: {
        uptime: process.uptime(),
        nodeVersion: process.version,
        platform: process.platform,
        memory: process.memoryUsage(),
        adminEmails: getAdminEmails(),
        serverTime: nowIso
      }
    };
  }

  getAdminUsersList() {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    let allUsers = [];
    let allVaults = [];
    let allVaultData = [];
    let allSessions = [];

    if (this.isSqlite) {
      allUsers = this.sqliteDb.prepare('SELECT * FROM users ORDER BY created_at DESC').all();
      allVaults = this.sqliteDb.prepare('SELECT * FROM vaults').all();
      allVaultData = this.sqliteDb.prepare('SELECT vault_id, LENGTH(data_json) as data_size, data_json, updated_at FROM vault_data').all();
      allSessions = this.sqliteDb.prepare('SELECT * FROM sessions').all();
    } else {
      allUsers = Object.values(this.jsonStore.users || {});
      allVaults = Object.values(this.jsonStore.vaults || {});
      allVaultData = Object.values(this.jsonStore.vault_data || {}).map(vd => ({
        vault_id: vd.vault_id,
        data_size: (vd.data_json || '').length,
        data_json: vd.data_json,
        updated_at: vd.updated_at
      }));
      allSessions = Object.values(this.jsonStore.sessions || {});
    }

    const vaultDataMap = new Map();
    for (const vd of allVaultData) {
      let txCount = 0;
      let isEncrypted = false;
      try {
        const parsed = JSON.parse(vd.data_json || '{}');
        if (parsed.encrypted && parsed.payload) isEncrypted = true;
        else if (Array.isArray(parsed.transactions)) txCount = parsed.transactions.length;
      } catch (_) {}
      vaultDataMap.set(vd.vault_id, {
        size: vd.data_size || 0,
        txCount,
        isEncrypted,
        updatedAt: vd.updated_at
      });
    }

    const now = Date.now();

    return allUsers.map(user => {
      const ownedVaults = allVaults.filter(v => v.owner_id === user.id);
      let totalTransactions = 0;
      let totalSizeBytes = 0;
      let hasEncryptedVault = false;
      let latestVaultUpdate = null;

      for (const v of ownedVaults) {
        const vd = vaultDataMap.get(v.id);
        if (vd) {
          totalTransactions += vd.txCount;
          totalSizeBytes += vd.size;
          if (vd.isEncrypted) hasEncryptedVault = true;
          if (!latestVaultUpdate || (vd.updatedAt && vd.updatedAt > latestVaultUpdate)) {
            latestVaultUpdate = vd.updatedAt;
          }
        }
      }

      const userSessions = allSessions.filter(s => s.user_id === user.id);
      const activeSessions = userSessions.filter(s => s.expires_at > now);

      const email = (user.email || '').toLowerCase();
      const name = (user.name || '').toLowerCase();
      const gId = (user.google_id || '').toLowerCase();

      const isTestUser = gId.startsWith('quick_') || email.includes('test') || email.includes('demo') || email.endsWith('@example.com') || name.includes('test') || name.includes('demo');
      const lastActive = latestVaultUpdate || user.updated_at || user.created_at;
      const isAbandoned = (!activeSessions.length && lastActive < thirtyDaysAgo && totalTransactions === 0);

      return {
        id: user.id,
        google_id: user.google_id,
        email: user.email,
        name: user.name,
        picture: user.picture,
        created_at: user.created_at,
        updated_at: user.updated_at,
        is_test_user: isTestUser,
        is_abandoned: isAbandoned,
        owned_vaults_count: ownedVaults.length,
        owned_vaults: ownedVaults.map(v => ({ id: v.id, name: v.name, version: v.version })),
        total_transactions: totalTransactions,
        total_size_bytes: totalSizeBytes,
        has_encrypted_vault: hasEncryptedVault,
        active_sessions_count: activeSessions.length,
        total_sessions_count: userSessions.length,
        last_active: lastActive
      };
    });
  }

  deleteAdminVault(vaultId) {
    if (this.isSqlite) {
      this.sqliteDb.prepare('DELETE FROM item_shares WHERE vault_id = ?').run(vaultId);
      this.sqliteDb.prepare('DELETE FROM item_share_links WHERE vault_id = ?').run(vaultId);
      this.sqliteDb.prepare('DELETE FROM shared_item_projections WHERE vault_id = ?').run(vaultId);
      this.sqliteDb.prepare('DELETE FROM vault_history WHERE vault_id = ?').run(vaultId);
      this.sqliteDb.prepare('DELETE FROM vault_data WHERE vault_id = ?').run(vaultId);
      this.sqliteDb.prepare('DELETE FROM vault_shares WHERE vault_id = ?').run(vaultId);
      const res = this.sqliteDb.prepare('DELETE FROM vaults WHERE id = ?').run(vaultId);
      return res.changes > 0;
    } else {
      delete this.jsonStore.vaults[vaultId];
      delete this.jsonStore.vault_data[vaultId];
      if (this.jsonStore.vault_history) {
        this.jsonStore.vault_history = this.jsonStore.vault_history.filter(h => h.vault_id !== vaultId);
      }
      if (this.jsonStore.vault_shares) {
        for (const k of Object.keys(this.jsonStore.vault_shares)) {
          if (this.jsonStore.vault_shares[k].vault_id === vaultId) {
            delete this.jsonStore.vault_shares[k];
          }
        }
      }
      if (this.jsonStore.item_shares) {
        this.jsonStore.item_shares = this.jsonStore.item_shares.filter(s => s.vault_id !== vaultId);
      }
      if (this.jsonStore.item_share_links) {
        this.jsonStore.item_share_links = this.jsonStore.item_share_links.filter(l => l.vault_id !== vaultId);
      }
      if (this.jsonStore.shared_item_projections) {
        for (const k of Object.keys(this.jsonStore.shared_item_projections)) {
          if (this.jsonStore.shared_item_projections[k].vault_id === vaultId) {
            delete this.jsonStore.shared_item_projections[k];
          }
        }
      }
      this.saveJsonStore();
      return true;
    }
  }


  getDynamicAdminEmails() {
    try {
      if (this.isSqlite) {
        const rows = this.sqliteDb.prepare('SELECT email FROM server_admins').all();
        return rows.map(r => (r.email || '').toLowerCase().trim()).filter(Boolean);
      } else {
        return Object.keys(this.jsonStore.server_admins || {}).map(e => e.toLowerCase().trim()).filter(Boolean);
      }
    } catch (_) {
      return [];
    }
  }

  getAllAdminsList() {
    const envEmails = ADMIN_EMAILS;
    let dynamicList = [];
    try {
      if (this.isSqlite) {
        dynamicList = this.sqliteDb.prepare('SELECT email, added_by, created_at FROM server_admins ORDER BY created_at DESC').all();
      } else {
        dynamicList = Object.values(this.jsonStore.server_admins || {});
      }
    } catch (_) {}

    const map = new Map();
    // 1. Env emails
    for (const email of envEmails) {
      map.set(email, {
        email,
        source: 'env',
        source_label: 'Docker Compose / .env',
        added_by: 'Hệ thống (docker-compose)',
        created_at: null,
        can_delete: false
      });
    }

    // 2. Dynamic emails
    for (const item of dynamicList) {
      const email = (item.email || '').toLowerCase().trim();
      if (!email) continue;
      if (map.has(email)) continue;
      map.set(email, {
        email,
        source: 'database',
        source_label: 'Cấp qua Dashboard',
        added_by: item.added_by || 'admin',
        created_at: item.created_at || new Date().toISOString(),
        can_delete: true
      });
    }

    return Array.from(map.values());
  }

  addAdminEmail(email, addedBy = 'admin') {
    email = (email || '').toLowerCase().trim();
    if (!email || !email.includes('@')) {
      throw new Error('Địa chỉ email không hợp lệ');
    }
    const allAdmins = getAdminEmails();
    if (allAdmins.includes(email)) {
      throw new Error(`Email "${email}" đã có quyền quản trị máy chủ`);
    }

    const now = new Date().toISOString();
    if (this.isSqlite) {
      this.sqliteDb.prepare(`
        INSERT INTO server_admins (email, added_by, created_at)
        VALUES (?, ?, ?)
        ON CONFLICT(email) DO UPDATE SET added_by = excluded.added_by, created_at = excluded.created_at
      `).run(email, addedBy, now);
    } else {
      this.jsonStore.server_admins = this.jsonStore.server_admins || {};
      this.jsonStore.server_admins[email] = { email, added_by: addedBy, created_at: now };
      this.saveJsonStore();
    }
    return { email, added_by: addedBy, created_at: now };
  }

  removeAdminEmail(email) {
    email = (email || '').toLowerCase().trim();
    if (ADMIN_EMAILS.includes(email)) {
      throw new Error(`Không thể xóa email "${email}" vì được cấu hình cố định trong docker-compose.yml`);
    }

    if (this.isSqlite) {
      this.sqliteDb.prepare('DELETE FROM server_admins WHERE LOWER(email) = ?').run(email);
    } else {
      if (this.jsonStore.server_admins && this.jsonStore.server_admins[email]) {
        delete this.jsonStore.server_admins[email];
        this.saveJsonStore();
      }
    }
    return true;
  }

  deleteAdminUser(userId) {
    const user = this.findUserById(userId);
    if (!user) return false;

    let ownedVaults = [];
    if (this.isSqlite) {
      ownedVaults = this.sqliteDb.prepare('SELECT id FROM vaults WHERE owner_id = ?').all(userId);
    } else {
      ownedVaults = Object.values(this.jsonStore.vaults || {}).filter(v => v.owner_id === userId);
    }
    for (const v of ownedVaults) {
      this.deleteAdminVault(v.id);
    }

    if (this.isSqlite) {
      this.sqliteDb.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
      this.sqliteDb.prepare('DELETE FROM vault_shares WHERE LOWER(user_email) = ?').run((user.email || '').toLowerCase());
      this.sqliteDb.prepare('DELETE FROM item_shares WHERE LOWER(user_email) = ? OR created_by = ?').run((user.email || '').toLowerCase(), userId);
      this.sqliteDb.prepare('DELETE FROM item_share_links WHERE created_by = ?').run(userId);
      this.sqliteDb.prepare('DELETE FROM users WHERE id = ?').run(userId);
    } else {
      for (const t of Object.keys(this.jsonStore.sessions || {})) {
        if (this.jsonStore.sessions[t].user_id === userId) {
          delete this.jsonStore.sessions[t];
        }
      }
      delete this.jsonStore.users[userId];
      this.saveJsonStore();
    }
    return true;
  }

  getAdminVaultsList() {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    let allVaults = [];
    let allVaultData = [];
    let allHistory = [];
    let allShares = [];

    if (this.isSqlite) {
      allVaults = this.sqliteDb.prepare(`
        SELECT v.*, u.name as owner_name, u.email as owner_email, u.google_id as owner_google_id
        FROM vaults v
        LEFT JOIN users u ON v.owner_id = u.id
        ORDER BY v.updated_at DESC
      `).all();
      allVaultData = this.sqliteDb.prepare('SELECT vault_id, data_json, updated_at, updated_by, LENGTH(data_json) as data_size FROM vault_data').all();
      allHistory = this.sqliteDb.prepare('SELECT vault_id, id, version, synced_at FROM vault_history').all();
      allShares = this.sqliteDb.prepare('SELECT vault_id, id, user_email, role FROM vault_shares').all();
    } else {
      const allUsers = Object.values(this.jsonStore.users || {});
      const userMap = new Map(allUsers.map(u => [u.id, u]));
      allVaults = Object.values(this.jsonStore.vaults || {}).map(v => {
        const u = userMap.get(v.owner_id);
        return {
          ...v,
          owner_name: u ? u.name : '',
          owner_email: u ? u.email : '',
          owner_google_id: u ? u.google_id : ''
        };
      });
      allVaultData = Object.values(this.jsonStore.vault_data || {}).map(vd => ({
        vault_id: vd.vault_id,
        data_json: vd.data_json,
        updated_at: vd.updated_at,
        updated_by: vd.updated_by,
        data_size: (vd.data_json || '').length
      }));
      allHistory = this.jsonStore.vault_history || [];
      allShares = Object.values(this.jsonStore.vault_shares || {});
    }

    const dataMap = new Map(allVaultData.map(d => [d.vault_id, d]));
    const historyCountMap = new Map();
    for (const h of allHistory) {
      historyCountMap.set(h.vault_id, (historyCountMap.get(h.vault_id) || 0) + 1);
    }
    const sharesMap = new Map();
    for (const s of allShares) {
      if (!sharesMap.has(s.vault_id)) sharesMap.set(s.vault_id, []);
      sharesMap.get(s.vault_id).push(s);
    }

    return allVaults.map(vault => {
      const vd = dataMap.get(vault.id);
      let parsed = null;
      let txCount = 0;
      let accCount = 0;
      let catCount = 0;
      let debtCount = 0;
      let budgetCount = 0;
      let savingsCount = 0;
      let isEncrypted = false;

      if (vd && vd.data_json) {
        try {
          parsed = JSON.parse(vd.data_json);
          if (parsed.encrypted && parsed.payload) {
            isEncrypted = true;
          } else {
            txCount = Array.isArray(parsed.transactions) ? parsed.transactions.length : 0;
            accCount = Array.isArray(parsed.accounts) ? parsed.accounts.length : 0;
            catCount = Array.isArray(parsed.categories) ? parsed.categories.length : 0;
            debtCount = Array.isArray(parsed.debts) ? parsed.debts.length : 0;
            budgetCount = Array.isArray(parsed.budgets) ? parsed.budgets.length : 0;
            savingsCount = Array.isArray(parsed.savings) ? parsed.savings.length : 0;
          }
        } catch (_) {}
      }

      const vName = (vault.name || '').toLowerCase();
      const ownerGId = (vault.owner_google_id || '').toLowerCase();
      const ownerEmail = (vault.owner_email || '').toLowerCase();

      const isTestOwner = ownerGId.startsWith('quick_') || ownerEmail.includes('test') || ownerEmail.includes('demo');
      const isTestName = vName.includes('test') || vName.includes('demo') || vName.includes('nháp') || vName.includes('thử nghiệm');
      const isTest = isTestOwner || isTestName;
      const isEmpty = !isEncrypted && txCount === 0;
      const lastUpdate = vault.updated_at || (vd ? vd.updated_at : null) || vault.created_at;
      const isAbandoned = lastUpdate < thirtyDaysAgo;

      return {
        id: vault.id,
        name: vault.name,
        owner_id: vault.owner_id,
        owner_name: vault.owner_name || 'Không xác định',
        owner_email: vault.owner_email || '',
        version: vault.version || 1,
        created_at: vault.created_at,
        updated_at: vault.updated_at,
        size_bytes: vd ? vd.data_size : 0,
        is_encrypted: isEncrypted,
        counts: {
          transactions: txCount,
          accounts: accCount,
          categories: catCount,
          debts: debtCount,
          budgets: budgetCount,
          savings: savingsCount
        },
        history_count: historyCountMap.get(vault.id) || 0,
        shares: sharesMap.get(vault.id) || [],
        is_test: isTest,
        is_empty: isEmpty,
        is_abandoned: isAbandoned,
        last_active: lastUpdate
      };
    });
  }

  getAdminGarbageReport() {
    const now = Date.now();
    const nowIso = new Date().toISOString();
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const usersList = this.getAdminUsersList();
    const vaultsList = this.getAdminVaultsList();

    let allSessions = [];
    let allShareLinks = [];
    let allHistory = [];

    if (this.isSqlite) {
      allSessions = this.sqliteDb.prepare(`
        SELECT s.token, s.user_id, s.expires_at, s.created_at, u.name as user_name, u.email as user_email
        FROM sessions s
        LEFT JOIN users u ON s.user_id = u.id
      `).all();
      allShareLinks = this.sqliteDb.prepare('SELECT * FROM item_share_links').all();
      allHistory = this.sqliteDb.prepare('SELECT id, vault_id, version, synced_at, updated_by, LENGTH(data_json) as data_size FROM vault_history').all();
    } else {
      const allUsers = Object.values(this.jsonStore.users || {});
      const userMap = new Map(allUsers.map(u => [u.id, u]));
      allSessions = Object.values(this.jsonStore.sessions || {}).map(s => {
        const u = userMap.get(s.user_id);
        return {
          ...s,
          user_name: u ? u.name : '',
          user_email: u ? u.email : ''
        };
      });
      allShareLinks = this.jsonStore.item_share_links || [];
      allHistory = this.jsonStore.vault_history || [];
    }

    const expiredSessions = allSessions.filter(s => s.expires_at <= now);
    const expiredLinks = allShareLinks.filter(l => l.expires_at && l.expires_at <= nowIso);
    const testUsers = usersList.filter(u => u.is_test_user);
    const emptyVaults = vaultsList.filter(v => v.is_empty);
    const testVaults = vaultsList.filter(v => v.is_test);
    const abandonedVaults = vaultsList.filter(v => v.is_abandoned);

    const historyByVault = new Map();
    for (const h of allHistory) {
      if (!historyByVault.has(h.vault_id)) historyByVault.set(h.vault_id, []);
      historyByVault.get(h.vault_id).push(h);
    }

    const staleSnapshots = [];
    for (const [vId, snaps] of historyByVault.entries()) {
      snaps.sort((a, b) => (b.synced_at || '').localeCompare(a.synced_at || ''));
      snaps.forEach((snap, idx) => {
        if (idx >= 5 || (snap.synced_at && snap.synced_at < thirtyDaysAgo)) {
          staleSnapshots.push({
            id: snap.id,
            vault_id: vId,
            version: snap.version,
            synced_at: snap.synced_at,
            data_size: snap.data_size || 0
          });
        }
      });
    }

    return {
      expired_sessions: expiredSessions,
      expired_links: expiredLinks,
      test_users: testUsers,
      empty_vaults: emptyVaults,
      test_vaults: testVaults,
      abandoned_vaults: abandonedVaults,
      stale_snapshots: staleSnapshots,
      summary: {
        expired_sessions_count: expiredSessions.length,
        expired_links_count: expiredLinks.length,
        test_users_count: testUsers.length,
        empty_vaults_count: emptyVaults.length,
        test_vaults_count: testVaults.length,
        abandoned_vaults_count: abandonedVaults.length,
        stale_snapshots_count: staleSnapshots.length,
        total_items: expiredSessions.length + expiredLinks.length + testUsers.length + emptyVaults.length + staleSnapshots.length
      }
    };
  }

  executeAdminCleanup(actions = []) {
    const now = Date.now();
    const nowIso = new Date().toISOString();
    const results = {
      purged_sessions: 0,
      purged_links: 0,
      pruned_snapshots: 0,
      deleted_empty_vaults: 0,
      deleted_test_users: 0,
      vacuum_done: false
    };

    const actionList = Array.isArray(actions) ? actions : [actions];

    // 1. Dọn dẹp phiên hết hạn
    if (actionList.includes('purge_expired_sessions') || actionList.includes('all')) {
      if (this.isSqlite) {
        const res = this.sqliteDb.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(now);
        results.purged_sessions = res.changes;
      } else {
        let count = 0;
        for (const t of Object.keys(this.jsonStore.sessions || {})) {
          if (this.jsonStore.sessions[t].expires_at <= now) {
            delete this.jsonStore.sessions[t];
            count++;
          }
        }
        results.purged_sessions = count;
      }
    }

    // 2. Dọn dẹp liên kết chia sẻ hết hạn
    if (actionList.includes('purge_expired_links') || actionList.includes('all')) {
      if (this.isSqlite) {
        const res = this.sqliteDb.prepare('DELETE FROM item_share_links WHERE expires_at IS NOT NULL AND expires_at != "" AND expires_at <= ?').run(nowIso);
        results.purged_links = res.changes;
      } else {
        const before = (this.jsonStore.item_share_links || []).length;
        this.jsonStore.item_share_links = (this.jsonStore.item_share_links || []).filter(l => !l.expires_at || l.expires_at > nowIso);
        results.purged_links = before - this.jsonStore.item_share_links.length;
      }
    }

    // 3. Thu gọn snapshots (giữ 5 bản mới nhất cho mỗi vault)
    if (actionList.includes('prune_snapshots') || actionList.includes('all')) {
      const report = this.getAdminGarbageReport();
      const idsToDelete = (report.stale_snapshots || []).map(s => s.id);
      if (idsToDelete.length > 0) {
        if (this.isSqlite) {
          const deleteStmt = this.sqliteDb.prepare('DELETE FROM vault_history WHERE id = ?');
          for (const sId of idsToDelete) {
            deleteStmt.run(sId);
          }
          results.pruned_snapshots = idsToDelete.length;
        } else {
          this.jsonStore.vault_history = (this.jsonStore.vault_history || []).filter(h => !idsToDelete.includes(h.id));
          results.pruned_snapshots = idsToDelete.length;
        }
      }
    }

    // 4. Xóa sổ trống
    if (actionList.includes('delete_empty_vaults') || actionList.includes('all')) {
      const vaults = this.getAdminVaultsList();
      const emptyVaults = vaults.filter(v => v.is_empty);
      for (const v of emptyVaults) {
        this.deleteAdminVault(v.id);
        results.deleted_empty_vaults++;
      }
    }

    // 5. Xóa dữ liệu test (test users & their vaults)
    if (actionList.includes('delete_test_data') || actionList.includes('delete_test_users')) {
      const users = this.getAdminUsersList();
      const testUsers = users.filter(u => u.is_test_user);
      for (const tu of testUsers) {
        this.deleteAdminUser(tu.id);
        results.deleted_test_users++;
      }
    }

    // 6. Vacuum database
    if (actionList.includes('vacuum') || actionList.includes('all')) {
      this.vacuumDatabase();
      results.vacuum_done = true;
    }

    if (!this.isSqlite) {
      this.saveJsonStore();
    }

    return results;
  }

  vacuumDatabase() {
    if (this.isSqlite) {
      try {
        this.sqliteDb.exec('PRAGMA wal_checkpoint(TRUNCATE);');
        this.sqliteDb.exec('VACUUM;');
        this.sqliteDb.exec('PRAGMA optimize;');
        return true;
      } catch (err) {
        console.warn('[Admin] Lỗi Vacuum database:', err.message);
        return false;
      }
    }
    return true;
  }
}

const dbManager = new DatabaseManager();

// ==============================================================================
// 2. DATA MERGE ENGINE (Conflict-Free Last-Write-Wins Multi-Table)
// ==============================================================================
function mergeTableData(serverItems = [], clientItems = [], isAccountTable = false, tableName = '') {
  const map = new Map();
  const generateUniqueNumericId = () => Date.now() * 1000 + Math.floor(Math.random() * 1000);

  // 1. Nạp dữ liệu hiện có trên Server
  if (Array.isArray(serverItems)) {
    for (const item of serverItems) {
      if (item && item.id !== undefined && item.id !== null) {
        map.set(item.id, item);
      }
    }
  }

  // 2. So khớp với dữ liệu từ Client gửi lên
  if (Array.isArray(clientItems)) {
    for (const cItem of clientItems) {
      if (!cItem || cItem.id === undefined || cItem.id === null) continue;

      let sItem = map.get(cItem.id);

      // --- XỬ LÝ RIÊNG CHO BẢNG TÀI KHOẢN (ACCOUNTS) ---
      if (isAccountTable) {
        if (!sItem && cItem.name) {
          for (const existing of map.values()) {
            if (
              existing.name &&
              existing.name.trim().toLowerCase() === cItem.name.trim().toLowerCase() &&
              existing.type === cItem.type
            ) {
              sItem = existing;
              break;
            }
          }
        }

        if (!sItem) {
          map.set(cItem.id, cItem);
        } else {
          // Bảo vệ tài khoản có số dư trên server tránh bị tài khoản trắng mới khởi tạo của client ghi đè
          const cIsBlank = (cItem.balance === 0 || cItem.balance === '0') &&
                           ((cItem.initialBalance || 0) === 0) &&
                           !cItem.isShared;
          const sHasData = (sItem.balance !== 0 || (sItem.initialBalance || 0) !== 0);

          if (cIsBlank && sHasData && !cItem.isDeleted) {
            continue; // Giữ nguyên tài khoản server
          }

          const sIsBlank = (sItem.balance === 0 || sItem.balance === '0') &&
                           ((sItem.initialBalance || 0) === 0) &&
                           !sItem.isShared;
          const cHasData = (cItem.balance !== 0 || (cItem.initialBalance || 0) !== 0);

          if (sIsBlank && cHasData && !sItem.isDeleted) {
            map.set(sItem.id, { ...cItem, id: sItem.id });
            continue;
          }

          const cTime = new Date(cItem.updatedAt || 0).getTime() || 0;
          const sTime = new Date(sItem.updatedAt || 0).getTime() || 0;
          if (cTime >= sTime) {
            map.set(sItem.id, { ...cItem, id: sItem.id });
          }
        }
        continue;
      }

      // --- XỬ LÝ CHO CÁC BẢNG KHÁC (TRANSACTIONS, V.V...) ---
      if (!sItem) {
        map.set(cItem.id, cItem);
      } else {
        // Kiểm tra xem có phải trùng ID ngẫu nhiên do auto-increment của 2 thiết bị khác nhau không
        let isSameEntity = false;

        if (tableName === 'transactions' || (cItem.amount !== undefined && cItem.date !== undefined)) {
          const sameType = cItem.type === sItem.type;
          const sameDate = String(cItem.date || '').slice(0, 10) === String(sItem.date || '').slice(0, 10);
          const sameAmount = Math.abs(Number(cItem.amount || 0) - Number(sItem.amount || 0)) < 0.01;
          const sameAccount = Number(cItem.accountId) === Number(sItem.accountId);
          isSameEntity = sameType && sameDate && sameAmount && sameAccount;
        } else if (cItem.name && sItem.name) {
          isSameEntity = (cItem.name.trim().toLowerCase() === sItem.name.trim().toLowerCase());
        } else {
          isSameEntity = true;
        }

        if (isSameEntity) {
          // Cùng một thực thể -> Last-Write-Wins
          const cTime = new Date(cItem.updatedAt || 0).getTime() || 0;
          const sTime = new Date(sItem.updatedAt || 0).getTime() || 0;
          if (cTime >= sTime) {
            map.set(sItem.id, { ...cItem, id: sItem.id });
          }
        } else {
          // Xung đột ID giữa 2 trình duyệt độc lập: Cấp ID mới cho cItem và giữ cả 2!
          const newId = generateUniqueNumericId();
          map.set(newId, { ...cItem, id: newId });
        }
      }
    }
  }

  return Array.from(map.values());
}

function mergeSettingsData(serverSettings = [], clientSettings = []) {
  const SYNCABLE_KEYS = [
    'budget_mode',
    'budget_applicable_accounts',
    'budget_rollover_enabled',
    'budget_auto_rollover',
    'theme',
    'currency',
    'privacyMode'
  ];

  const map = new Map();
  if (Array.isArray(serverSettings)) {
    for (const s of serverSettings) {
      if (s && s.key && SYNCABLE_KEYS.includes(s.key)) {
        map.set(s.key, s);
      }
    }
  }

  if (Array.isArray(clientSettings)) {
    for (const c of clientSettings) {
      if (!c || !c.key || !SYNCABLE_KEYS.includes(c.key)) continue;
      const s = map.get(c.key);
      const cTime = new Date(c.updatedAt || 0).getTime() || 0;
      const sTime = new Date(s?.updatedAt || 0).getTime() || 0;
      if (!s || cTime >= sTime) {
        map.set(c.key, c);
      }
    }
  }

  return Array.from(map.values());
}

function mergeFullVaultData(serverVault, clientVault) {
  const s = serverVault || {};
  const c = clientVault || {};

  return {
    transactions: mergeTableData(s.transactions, c.transactions, false, 'transactions'),
    accounts: mergeTableData(s.accounts, c.accounts, true, 'accounts'),
    categories: mergeTableData(s.categories, c.categories, false, 'categories'),
    debts: mergeTableData(s.debts, c.debts, false, 'debts'),
    budgets: mergeTableData(s.budgets, c.budgets, false, 'budgets'),
    recurring: mergeTableData(s.recurring, c.recurring, false, 'recurring'),
    savings: mergeTableData(s.savings, c.savings, false, 'savings'),
    accumulations: mergeTableData(s.accumulations, c.accumulations, false, 'accumulations'),
    assets: mergeTableData(s.assets, c.assets, false, 'assets'),
    loans: mergeTableData(s.loans, c.loans, false, 'loans'),
    settings: mergeSettingsData(s.settings, c.settings)
  };
}

// ==============================================================================
// 3. GOOGLE TOKEN VERIFICATION
// ==============================================================================
async function verifyGoogleToken({ id_token, access_token }) {
  // 1. Xác thực qua ID Token
  if (id_token) {
    try {
      const res = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(id_token)}`);
      if (res.ok) {
        const info = await res.json();
        if (GOOGLE_CLIENT_ID && info.aud !== GOOGLE_CLIENT_ID) {
          console.warn('[GoogleAuth] Warning: Token aud không trùng khớp với GOOGLE_CLIENT_ID');
        }
        return {
          googleId: info.sub,
          email: info.email,
          name: info.name || info.email.split('@')[0],
          picture: info.picture || ''
        };
      }
    } catch (e) {
      console.warn('[GoogleAuth] Lỗi kiểm tra id_token:', e.message);
    }
  }

  // 2. Xác thực qua Access Token (được tạo bởi GIS oauth2 token client)
  if (access_token) {
    try {
      const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${access_token}` }
      });
      if (res.ok) {
        const info = await res.json();
        return {
          googleId: info.sub,
          email: info.email,
          name: info.name || info.email.split('@')[0],
          picture: info.picture || ''
        };
      }
    } catch (e) {
      console.warn('[GoogleAuth] Lỗi kiểm tra access_token:', e.message);
    }
  }

  throw new Error('Mã xác thực Google không hợp lệ hoặc đã hết hạn.');
}

// ==============================================================================
// 4. HTTP REQUEST UTILITIES & MIME TYPES
// ==============================================================================
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.webmanifest': 'application/manifest+json',
  '.wasm': 'application/wasm',
  '.map': 'application/json',
  '.txt': 'text/plain; charset=utf-8'
};

function sendJson(res, statusCode, data) {
  const jsonStr = JSON.stringify(data);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': CORS_ORIGIN,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With'
  });
  res.end(jsonStr);
}

function parseJsonBody(req, maxSize = 25 * 1024 * 1024) { // Tối đa 25MB cho vault lớn
  return new Promise((resolve, reject) => {
    let totalSize = 0;
    const chunks = [];

    req.on('data', chunk => {
      totalSize += chunk.length;
      if (totalSize > maxSize) {
        reject(new Error('Kích thước payload vượt quá giới hạn (Max 25MB)'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', () => {
      if (chunks.length === 0) return resolve({});
      try {
        const bodyStr = Buffer.concat(chunks).toString('utf8');
        resolve(JSON.parse(bodyStr));
      } catch (err) {
        reject(new Error('Định dạng JSON gửi lên không hợp lệ'));
      }
    });

    req.on('error', err => reject(err));
  });
}

function getBearerToken(req) {
  const authHeader = req.headers.authorization || '';
  if (authHeader.startsWith('Bearer ')) return authHeader.slice(7).trim();
  if (req.headers['x-admin-token']) return String(req.headers['x-admin-token']).trim();
  if (req.headers.cookie) {
    const match = req.headers.cookie.match(/stc_admin_token=([^;]+)/);
    if (match) return match[1].trim();
  }
  return null;
}

function getAuthUser(req) {
  const token = getBearerToken(req);
  if (!token) return null;
  return dbManager.getUserByToken(token);
}

function getAdminEmails() {
  const envEmails = ADMIN_EMAILS;
  const dbEmails = dbManager ? dbManager.getDynamicAdminEmails() : [];
  const set = new Set([...envEmails, ...dbEmails]);
  return Array.from(set);
}

function getAdminUser(req) {
  const token = getBearerToken(req);
  if (!token) return null;

  // Lấy người dùng từ token phiên máy chủ (Google OAuth hoặc token phiên)
  const user = dbManager.getUserByToken(token);
  if (!user || !user.email) return null;

  const email = (user.email || '').toLowerCase().trim();
  // Kiểm tra email người dùng có nằm trong danh sách ADMIN_EMAIL được cấp quyền không
  const allAdmins = getAdminEmails();
  if (allAdmins.length > 0 && allAdmins.includes(email)) {
    return {
      id: user.id,
      name: user.name || user.email,
      email: user.email,
      picture: user.picture || '',
      role: 'admin'
    };
  }

  return null;
}

// ==============================================================================
// 5. REST API ROUTER & CONTROLLER
// ==============================================================================
async function handleApiRequest(req, res, pathname, url) {
  const searchParams = url ? url.searchParams : new URL(req.url, 'http://localhost').searchParams;
  // CORS Preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': CORS_ORIGIN,
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
      'Access-Control-Max-Age': '86400'
    });
    return res.end();
  }

  // ==============================================================================
  // ADMIN MANAGEMENT APIS (Trang Quản Trị Máy Chủ Sao Lưu)
  // ==============================================================================

    // A. Admin Auth Status (Xác thực người dùng qua ADMIN_EMAIL)
  if (req.method === 'GET' && pathname === '/api/admin/auth-status') {
    const token = getBearerToken(req);
    const user = token ? dbManager.getUserByToken(token) : null;
    const adminUser = getAdminUser(req);

    return sendJson(res, 200, {
      authenticated: !!adminUser,
      adminUser: adminUser ? {
        id: adminUser.id,
        name: adminUser.name,
        email: adminUser.email,
        picture: adminUser.picture,
        role: 'admin'
      } : null,
      currentUser: user ? {
        id: user.id,
        name: user.name,
        email: user.email,
        picture: user.picture
      } : null,
      adminEmails: ADMIN_EMAILS,
      adminEmailsConfigured: ADMIN_EMAILS.length > 0,
      googleClientId: GOOGLE_CLIENT_ID || null,
      serverTime: new Date().toISOString()
    });
  }

  // C. Admin Logout
  if (req.method === 'POST' && pathname === '/api/admin/logout') {
    const token = getBearerToken(req);
    if (token) {
      dbManager.deleteAdminSession(token);
    }
    return sendJson(res, 200, { success: true, message: 'Đã đăng xuất' });
  }

  // Các API quản trị sau đây yêu cầu quyền Admin
  if (pathname.startsWith('/api/admin/')) {
    const adminUser = getAdminUser(req);
    if (!adminUser) {
      return sendJson(res, 403, { error: 'Yêu cầu quyền Quản Trị Viên (Unauthorized Admin Access)' });
    }

    // 0. Quản lý danh sách email quản trị viên & cấp quyền admin
    if (pathname === '/api/admin/admins') {
      if (req.method === 'GET') {
        return sendJson(res, 200, {
          admins: dbManager.getAllAdminsList(),
          currentAdminEmail: adminUser.email
        });
      }
      if (req.method === 'POST') {
        const body = await parseJsonBody(req);
        const email = (body.email || '').trim();
        try {
          dbManager.addAdminEmail(email, adminUser.email);
          return sendJson(res, 200, {
            success: true,
            message: `Đã cấp quyền quản trị cho email ${email}`,
            admins: dbManager.getAllAdminsList()
          });
        } catch (err) {
          return sendJson(res, 400, { error: err.message });
        }
      }
    }

    const adminEmailMatch = pathname.match(/^\/api\/admin\/admins\/([^/]+)$/);
    if (req.method === 'DELETE' && adminEmailMatch) {
      const email = decodeURIComponent(adminEmailMatch[1]);
      try {
        dbManager.removeAdminEmail(email);
        return sendJson(res, 200, {
          success: true,
          message: `Đã thu hồi quyền quản trị của email ${email}`,
          admins: dbManager.getAllAdminsList()
        });
      } catch (err) {
        return sendJson(res, 400, { error: err.message });
      }
    }

    // 1. Tổng quan & Thống kê
    if (req.method === 'GET' && pathname === '/api/admin/overview') {
      const overview = dbManager.getAdminOverview();
      return sendJson(res, 200, overview);
    }

    // 2. Danh sách người dùng
    if (req.method === 'GET' && pathname === '/api/admin/users') {
      const users = dbManager.getAdminUsersList();
      return sendJson(res, 200, { users });
    }

    // 3. Chi tiết / Xóa người dùng
    const userMatch = pathname.match(/^\/api\/admin\/users\/([^/]+)$/);
    if (userMatch) {
      const userId = userMatch[1];
      if (req.method === 'GET') {
        const user = dbManager.findUserById(userId);
        if (!user) return sendJson(res, 404, { error: 'Không tìm thấy người dùng' });
        const userVaults = dbManager.getUserVaults(user.id, user.email);
        return sendJson(res, 200, { user, vaults: userVaults });
      }
      if (req.method === 'DELETE') {
        const ok = dbManager.deleteAdminUser(userId);
        return sendJson(res, 200, { success: ok, message: 'Đã xóa người dùng và dữ liệu liên quan' });
      }
    }

    // 4. Danh sách tất cả các sổ
    if (req.method === 'GET' && pathname === '/api/admin/vaults') {
      const vaults = dbManager.getAdminVaultsList();
      return sendJson(res, 200, { vaults });
    }

    // 5. Chi tiết / Xóa sổ
    const vaultMatch = pathname.match(/^\/api\/admin\/vaults\/([^/]+)$/);
    if (vaultMatch) {
      const vaultId = vaultMatch[1];
      if (req.method === 'GET') {
        const vault = dbManager.getVaultById(vaultId);
        if (!vault) return sendJson(res, 404, { error: 'Không tìm thấy sổ' });
        const vData = dbManager.getVaultData(vaultId);
        const history = dbManager.getVaultHistory(vaultId);
        return sendJson(res, 200, { vault, data: vData ? vData.data : null, history });
      }
      if (req.method === 'DELETE') {
        const ok = dbManager.deleteAdminVault(vaultId);
        return sendJson(res, 200, { success: ok, message: 'Đã xóa sổ thành công' });
      }
    }

    // 5b. Thu gọn snapshot một sổ
    const pruneVaultMatch = pathname.match(/^\/api\/admin\/vaults\/([^/]+)\/prune-history$/);
    if (req.method === 'POST' && pruneVaultMatch) {
      const vaultId = pruneVaultMatch[1];
      if (dbManager.isSqlite) {
        dbManager.sqliteDb.prepare(`
          DELETE FROM vault_history
          WHERE vault_id = ? AND id NOT IN (
            SELECT id FROM vault_history WHERE vault_id = ? ORDER BY synced_at DESC LIMIT 1
          )
        `).run(vaultId, vaultId);
      } else {
        const vHistory = (dbManager.jsonStore.vault_history || []).filter(h => h.vault_id === vaultId);
        vHistory.sort((a, b) => (b.synced_at || '').localeCompare(a.synced_at || ''));
        const keepId = vHistory.length > 0 ? vHistory[0].id : null;
        dbManager.jsonStore.vault_history = (dbManager.jsonStore.vault_history || []).filter(h => h.vault_id !== vaultId || h.id === keepId);
        dbManager.saveJsonStore();
      }
      return sendJson(res, 200, { success: true, message: 'Đã thu gọn lịch sử snapshot' });
    }

    // 6. Báo cáo quét dữ liệu rác
    if (req.method === 'GET' && pathname === '/api/admin/garbage') {
      const report = dbManager.getAdminGarbageReport();
      return sendJson(res, 200, report);
    }

    // 7. Thực thi dọn dẹp rác
    if (req.method === 'POST' && pathname === '/api/admin/cleanup') {
      const body = await parseJsonBody(req);
      const actions = body.actions || (body.action ? [body.action] : []);
      if (!actions.length) {
        return sendJson(res, 400, { error: 'Thiếu tham số action hoặc actions' });
      }
      const results = dbManager.executeAdminCleanup(actions);
      return sendJson(res, 200, { success: true, results });
    }

    // 8. Tối ưu hóa & nén SQLite Vacuum
    if (req.method === 'POST' && pathname === '/api/admin/vacuum') {
      const ok = dbManager.vacuumDatabase();
      const storage = dbManager.getDatabaseStorageStats();
      return sendJson(res, 200, { success: ok, storage });
    }
  }

  // 1. Health check & Server Info
  if (req.method === 'GET' && (pathname === '/api/health' || pathname === '/health')) {
    return sendJson(res, 200, {
      status: 'ok',
      service: 'So Thu Chi Sync Server',
      version: '2.7.6',
      storage: dbManager.isSqlite ? 'sqlite' : 'json_store',
      googleAuth: true,
      googleClientId: GOOGLE_CLIENT_ID || null,
      multiVault: true,
      sharing: true,
      uptime: process.uptime(),
      time: new Date().toISOString()
    });
  }

  // 2. Auth Config (Trả về Google Client ID nếu máy chủ đã cấu hình)
  if (req.method === 'GET' && pathname === '/api/auth/config') {
    return sendJson(res, 200, {
      googleClientId: GOOGLE_CLIENT_ID || null
    });
  }

  // 2.1 Cung cấp cấu hình PWA cấp sẵn cho người dùng (Google Drive, Dropbox, v.v...)
  if (req.method === 'GET' && pathname === '/api/config') {
    return sendJson(res, 200, {
      VITE_GOOGLE_CLIENT_ID: process.env.VITE_GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID || '',
      VITE_GOOGLE_STORAGE_LOCATION: process.env.VITE_GOOGLE_STORAGE_LOCATION || 'appDataFolder',
      VITE_GOOGLE_CUSTOM_FOLDER_NAME: process.env.VITE_GOOGLE_CUSTOM_FOLDER_NAME || 'Sổ Thu Chi',
      VITE_GOOGLE_WORKER_URL: process.env.VITE_GOOGLE_WORKER_URL || process.env.GOOGLE_WORKER_URL || '',
      VITE_GOOGLE_CLIENT_SECRET: process.env.VITE_GOOGLE_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET || '',
      VITE_DROPBOX_APP_KEY: process.env.VITE_DROPBOX_APP_KEY || process.env.DROPBOX_APP_KEY || '',
      VITE_AUTO_SYNC_ENABLED: process.env.VITE_AUTO_SYNC_ENABLED !== 'false'
    });
  }

  // 3. Google Login / Authenticate
  if (req.method === 'POST' && pathname === '/api/auth/google') {
    try {
      const body = await parseJsonBody(req);
      if (!body.id_token && !body.access_token) {
        return sendJson(res, 400, { error: 'Thiếu mã token Google (id_token hoặc access_token)' });
      }

      const googleProfile = await verifyGoogleToken(body);
      const user = dbManager.upsertUser(googleProfile);

      // Đảm bảo người dùng luôn có ít nhất 1 Sổ Cá Nhân ban đầu
      const vaults = dbManager.getUserVaults(user.id, user.email);
      if (vaults.length === 0) {
        dbManager.createVault('Sổ mặc định', user.id);
      }

      const session = dbManager.createSession(user.id, 90);

      return sendJson(res, 200, {
        success: true,
        token: session.token,
        expiresAt: session.expiresAt,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          picture: user.picture
        }
      });
    } catch (err) {
      console.warn('[API] Đăng nhập Google lỗi:', err.message);
      return sendJson(res, 401, { error: err.message || 'Xác thực Google thất bại' });
    }
  }

  // 3b. Quick Login / Xác thực nhanh máy chủ (Dành cho mạng nội bộ / Docker / LAN không cần cấu hình Google OAuth)
  if (req.method === 'POST' && pathname === '/api/auth/quick') {
    try {
      const body = await parseJsonBody(req);
      const email = (body.email || '').trim().toLowerCase();
      const name = (body.name || email.split('@')[0] || 'Người dùng').trim();
      if (!email) {
        return sendJson(res, 400, { error: 'Vui lòng cung cấp email tài khoản' });
      }

      const quickId = 'quick_' + crypto.createHash('md5').update(email).digest('hex');
      const user = dbManager.upsertUser({
        googleId: quickId,
        email,
        name,
        picture: body.avatar || null
      });

      // Đảm bảo người dùng luôn có ít nhất 1 Sổ Cá Nhân ban đầu
      const vaults = dbManager.getUserVaults(user.id, user.email);
      if (vaults.length === 0) {
        dbManager.createVault('Sổ mặc định', user.id);
      }

      const session = dbManager.createSession(user.id, 90);

      return sendJson(res, 200, {
        success: true,
        token: session.token,
        expiresAt: session.expiresAt,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          picture: user.picture
        }
      });
    } catch (err) {
      console.warn('[API] Đăng nhập nhanh lỗi:', err.message);
      return sendJson(res, 500, { error: err.message || 'Xác thực máy chủ thất bại' });
    }
  }

  // --- PUBLIC ENDPOINTS CHO CHIA SẺ & PHÂN QUYỀN ---
  // A. Danh sách các dịch vụ sao lưu khả dụng
  if (req.method === 'GET' && pathname === '/api/shares/services') {
    return sendJson(res, 200, {
      services: [
        {
          id: 'server',
          name: 'Máy Chủ Riêng (Self-Hosted)',
          status: 'connected',
          supported: true,
          badge: 'Sẵn sàng'
        },
        {
          id: 'google-drive',
          name: 'Google Drive',
          status: 'available',
          supported: false,
          badge: 'Sắp hỗ trợ'
        },
        {
          id: 'dropbox',
          name: 'Dropbox',
          status: 'available',
          supported: false,
          badge: 'Sắp hỗ trợ'
        }
      ]
    });
  }

  // B. Xem thông tin liên kết chia sẻ (Public Info)
  if (req.method === 'GET' && pathname === '/api/shares/link/info') {
    const token = searchParams.get('token');
    if (!token) return sendJson(res, 400, { error: 'Thiếu token chia sẻ' });

    const link = dbManager.getShareLinkByToken(token);
    if (!link) return sendJson(res, 404, { error: 'Liên kết không tồn tại hoặc đã bị thu hồi' });

    const proj = dbManager.getItemProjection(link.vault_id, link.item_type, link.item_id);
    const isEncrypted = !!(proj && proj.data && proj.data.encrypted);

    return sendJson(res, 200, {
      token: link.token,
      itemType: link.item_type,
      itemId: link.item_id,
      itemName: link.item_name,
      role: link.role,
      ownerName: link.owner_name,
      ownerEmail: link.owner_email,
      createdAt: link.created_at,
      isEncrypted
    });
  }

  // C. Lấy dữ liệu mục chia sẻ bằng Link Token (Dành cho truy cập qua liên kết)
  if (req.method === 'GET' && pathname === '/api/shares/link/data') {
    const token = searchParams.get('token');
    if (!token) return sendJson(res, 400, { error: 'Thiếu token chia sẻ' });

    const link = dbManager.getShareLinkByToken(token);
    if (!link) return sendJson(res, 404, { error: 'Liên kết không tồn tại hoặc đã bị thu hồi' });

    const itemData = dbManager.getReceivedItemData(link.vault_id, link.item_type, link.item_id);
    if (!itemData || !itemData.item) return sendJson(res, 404, { error: 'Mục chia sẻ không còn tồn tại trên máy chủ' });

    return sendJson(res, 200, {
      itemType: link.item_type,
      itemId: link.item_id,
      itemName: link.item_name,
      role: link.role,
      ownerName: link.owner_name,
      ownerEmail: link.owner_email,
      ...itemData
    });
  }

  // Yêu cầu xác thực Token từ đây trở xuống
  const currentUser = getAuthUser(req);
  if (!currentUser) {
    return sendJson(res, 401, { error: 'Yêu cầu đăng nhập hoặc phiên làm việc đã hết hạn' });
  }

  // 4. Lấy thông tin user hiện tại (Me)
  if (req.method === 'GET' && pathname === '/api/auth/me') {
    return sendJson(res, 200, {
      user: {
        id: currentUser.id,
        email: currentUser.email,
        name: currentUser.name,
        picture: currentUser.picture
      }
    });
  }

  // 4b. Danh sách tài khoản trên máy chủ để gợi ý chia sẻ sổ
  if (req.method === 'GET' && pathname === '/api/users') {
    const users = dbManager.getAllUsers();
    return sendJson(res, 200, { users });
  }

  // 5. Đăng xuất (Logout)
  if (req.method === 'POST' && pathname === '/api/auth/logout') {
    const token = (req.headers.authorization || '').slice(7).trim();
    dbManager.deleteSession(token);
    return sendJson(res, 200, { success: true, message: 'Đã đăng xuất thành công' });
  }

  // 6. Danh sách các Sổ (Vaults)
  if (req.method === 'GET' && pathname === '/api/vaults') {
    let vaults = dbManager.getUserVaults(currentUser.id, currentUser.email);
    if (vaults.length === 0) {
      const newV = dbManager.createVault('Sổ mặc định', currentUser.id);
      vaults = [newV];
    }
    return sendJson(res, 200, { vaults });
  }

  // 7. Tạo Sổ mới (Create Vault)
  if (req.method === 'POST' && pathname === '/api/vaults') {
    try {
      const body = await parseJsonBody(req);
      const name = (body.name || '').trim() || 'Sổ mặc định';
      const newVault = dbManager.createVault(name, currentUser.id);
      return sendJson(res, 201, {
        success: true,
        vault: {
          ...newVault,
          role: 'owner',
          owner_name: currentUser.name,
          owner_email: currentUser.email
        }
      });
    } catch (err) {
      return sendJson(res, 400, { error: err.message });
    }
  }

  // Match /api/vaults/:id...
  const vaultMatch = pathname.match(/^\/api\/vaults\/([^/]+)(.*)$/);
  if (vaultMatch) {
    const vaultId = vaultMatch[1];
    const subPath = vaultMatch[2]; // '', '/shares', '/data', '/sync', '/history'
    const role = dbManager.getVaultRole(vaultId, currentUser.id, currentUser.email);

    if (!role) {
      return sendJson(res, 403, { error: 'Bạn không có quyền truy cập vào sổ này hoặc sổ đã bị xóa' });
    }

    // 7.5. Sao chép Sổ (Copy Vault)
    if (req.method === 'POST' && subPath === '/copy') {
      try {
        const body = await parseJsonBody(req);
        const sourceVault = dbManager.getVaultById(vaultId);
        if (!sourceVault) {
          return sendJson(res, 404, { error: 'Sổ nguồn không tồn tại' });
        }
        const newName = (body.name || '').trim() || `${sourceVault.name} (Bản sao)`;
        const newVault = dbManager.copyVault(vaultId, newName, currentUser.id);
        return sendJson(res, 201, {
          success: true,
          vault: {
            ...newVault,
            role: 'owner',
            owner_name: currentUser.name,
            owner_email: currentUser.email
          }
        });
      } catch (err) {
        return sendJson(res, 400, { error: err.message });
      }
    }

    // 8. Đổi tên Sổ
    if (req.method === 'PUT' && subPath === '') {
      if (role !== 'owner' && role !== 'editor') {
        return sendJson(res, 403, { error: 'Chỉ Chủ sổ hoặc Editor mới có quyền đổi tên sổ' });
      }
      const body = await parseJsonBody(req);
      const updated = dbManager.renameVault(vaultId, (body.name || '').trim() || 'Sổ mặc định');
      return sendJson(res, 200, { success: true, vault: updated });
    }

    // 9. Xóa Sổ (Chỉ Owner)
    if (req.method === 'DELETE' && subPath === '') {
      if (role !== 'owner') {
        return sendJson(res, 403, { error: 'Chỉ Chủ sổ mới có quyền xóa sổ này' });
      }
      dbManager.deleteVault(vaultId);
      return sendJson(res, 200, { success: true, message: 'Đã xóa sổ thành công' });
    }

    // 10. Lấy danh sách thành viên chia sẻ
    if (req.method === 'GET' && subPath === '/shares') {
      const shares = dbManager.getVaultShares(vaultId);
      return sendJson(res, 200, { shares });
    }

    // 11. Mời / Chia sẻ sổ cho Email Google (Chỉ Owner)
    if (req.method === 'POST' && subPath === '/shares') {
      if (role !== 'owner') {
        return sendJson(res, 403, { error: 'Chỉ Chủ sổ mới có quyền chia sẻ sổ này cho người khác' });
      }
      try {
        const body = await parseJsonBody(req);
        const email = (body.email || '').toLowerCase().trim();
        if (!email || !email.includes('@')) {
          return sendJson(res, 400, { error: 'Email Google không đúng định dạng' });
        }
        if (email === currentUser.email.toLowerCase()) {
          return sendJson(res, 400, { error: 'Không thể chia sẻ sổ cho chính mình' });
        }

        const shareRole = body.role === 'viewer' ? 'viewer' : 'editor';
        const shareResult = dbManager.addOrUpdateShare(vaultId, email, shareRole, currentUser.id);

        return sendJson(res, 200, {
          success: true,
          message: `Đã cấp quyền ${shareRole === 'editor' ? 'Ghi chép (Editor)' : 'Chỉ xem (Viewer)'} cho ${email}`,
          share: shareResult
        });
      } catch (err) {
        return sendJson(res, 400, { error: err.message });
      }
    }

    // 12. Xóa quyền chia sẻ (Hủy share)
    const shareSubMatch = subPath.match(/^\/shares\/([^/]+)$/);
    if (req.method === 'DELETE' && shareSubMatch) {
      if (role !== 'owner') {
        return sendJson(res, 403, { error: 'Chỉ Chủ sổ mới có quyền xóa thành viên khỏi sổ' });
      }
      const shareId = shareSubMatch[1];
      dbManager.removeShare(vaultId, shareId);
      return sendJson(res, 200, { success: true, message: 'Đã xóa quyền chia sẻ' });
    }

    // 12.5. Kiểm tra phiên bản dữ liệu Sổ (Siêu nhẹ phục vụ Polling / Tự động làm mới dữ liệu)
    if (req.method === 'GET' && subPath === '/version') {
      const vaultData = dbManager.getVaultData(vaultId);
      const vaultInfo = dbManager.getVaultById(vaultId);
      return sendJson(res, 200, {
        vaultId: vaultId,
        version: vaultData?.version || 1,
        updated_at: vaultData?.updated_at || vaultInfo?.updated_at || null,
        updated_by: vaultData?.updated_by || null
      });
    }

    // 13. Lấy dữ liệu Sổ (Data Pull)
    if (req.method === 'GET' && subPath === '/data') {
      const vaultData = dbManager.getVaultData(vaultId);
      const vaultInfo = dbManager.getVaultById(vaultId);

      return sendJson(res, 200, {
        vault: {
          id: vaultId,
          name: vaultInfo?.name || 'Sổ mặc định',
          role: role,
          version: vaultData?.version || 1,
          updated_at: vaultData?.updated_at || vaultInfo?.updated_at,
          updated_by: vaultData?.updated_by || vaultInfo?.owner_id
        },
        data: vaultData?.data || {}
      });
    }

    // 14. Đồng bộ dữ liệu hai chiều (Data Push & Merge) hoặc Ghi đè toàn bộ (Force Overwrite)
    if (req.method === 'POST' && (subPath === '/sync' || subPath === '/overwrite')) {
      if (role === 'viewer') {
        return sendJson(res, 403, {
          error: 'Bạn chỉ có quyền Xem (Viewer), không có quyền chỉnh sửa hay đẩy dữ liệu mới lên sổ này'
        });
      }

      try {
        const body = await parseJsonBody(req);
        const incomingData = body.data || {};
        const forceOverwrite = body.forceOverwrite === true || subPath === '/overwrite';

        // Lấy dữ liệu hiện có trên Server
        const serverCurrent = dbManager.getVaultData(vaultId);
        const serverData = serverCurrent?.data || {};
        const currentVersion = serverCurrent?.version || 1;

        // KIỂM TRA XUNG ĐỘT ĐỒNG THỜI (Optimistic Concurrency Control):
        // Nếu 2 thiết bị cùng gửi lên: Thiết bị A đã đẩy thành công khiến version tăng lên (ví dụ v2).
        // Thiết bị B gửi sau nhưng dựa trên version cũ (baseVersion < currentVersion) -> Báo lỗi 409 Conflict
        // kèm theo bản dữ liệu mới nhất để Thiết bị B tự động gộp rồi mới gửi lại, tránh ghi đè làm mất giao dịch của A.
        if (!forceOverwrite && incomingData && incomingData.encrypted && body.baseVersion !== undefined && Number(body.baseVersion) < currentVersion) {
          return sendJson(res, 409, {
            error: 'conflict',
            message: 'Dữ liệu trên máy chủ đã được một thiết bị khác cập nhật trước. Vui lòng hợp nhất dữ liệu mới nhất.',
            currentVersion: currentVersion,
            serverData: serverData
          });
        }

        let targetData;
        if (forceOverwrite || (incomingData && incomingData.encrypted && incomingData.payload)) {
          // Khi dữ liệu gửi lên là gói mã hóa đầu cuối E2EE (Zero-Knowledge): Lưu trực tiếp vào DB
          targetData = incomingData;
        } else {
          if (serverData && serverData.encrypted && serverData.payload) {
            // Nếu dữ liệu hiện tại trên server đang được mã hóa mà client gửi plain: Lưu trực tiếp
            targetData = incomingData;
          } else {
            // Thực hiện gộp dữ liệu Last-Write-Wins giữa 2 bản plain text
            targetData = mergeFullVaultData(serverData, incomingData);
          }
        }

        // Lưu vào cơ sở dữ liệu
        const saved = dbManager.saveVaultData(vaultId, targetData, currentUser.email);

        return sendJson(res, 200, {
          success: true,
          vault_id: vaultId,
          version: saved.version,
          updated_at: saved.updated_at,
          updated_by: saved.updated_by,
          data: saved.data
        });
      } catch (err) {
        console.error('[API] Sync error:', err);
        return sendJson(res, 500, { error: 'Lỗi gộp dữ liệu: ' + err.message });
      }
    }

    // 15. Lịch sử các lần đồng bộ (Snapshot History)
    if (req.method === 'GET' && subPath === '/history') {
      const history = dbManager.getVaultHistory(vaultId);
      return sendJson(res, 200, { history });
    }

    // 16. Khôi phục Sổ từ một Snapshot (Restore Snapshot)
    const restoreMatch = subPath.match(/^\/history\/([^/]+)\/restore$/);
    if (req.method === 'POST' && restoreMatch) {
      if (role === 'viewer') {
        return sendJson(res, 403, { error: 'Bạn chỉ có quyền xem, không thể khôi phục dữ liệu sổ' });
      }
      const historyId = restoreMatch[1];
      const restored = dbManager.restoreVaultHistory(vaultId, historyId, currentUser.email);
      if (!restored) {
        return sendJson(res, 404, { error: 'Không tìm thấy bản snapshot này hoặc dữ liệu bị lỗi' });
      }
      return sendJson(res, 200, {
        success: true,
        message: 'Khôi phục bản snapshot thành công',
        vault_id: vaultId,
        version: restored.version,
        updated_at: restored.updated_at,
        data: restored.data
      });
    }
  }

  // --- AUTHENTICATED ENDPOINTS CHO CHIA SẺ & PHÂN QUYỀN MỤC (GRANULAR PER-ITEM) ---

  // 16b. Lưu hoặc cập nhật Bản Chiếu Chia Sẻ Mục (Client-Side Projection - E2EE)
  if (req.method === 'POST' && pathname === '/api/shares/item/projection') {
    try {
      const body = await parseJsonBody(req);
      const { itemType, itemId, projection, vaultId } = body;
      if (!itemType || !itemId || !projection) {
        return sendJson(res, 400, { error: 'Thiếu itemType, itemId hoặc projection' });
      }

      const userVaults = dbManager.getUserVaults(currentUser.id, currentUser.email);
      const targetVaultId = vaultId || (userVaults.length > 0 ? userVaults[0].id : null);
      if (!targetVaultId) return sendJson(res, 404, { error: 'Không tìm thấy sổ' });

      const result = dbManager.saveItemProjection(targetVaultId, itemType, itemId, projection, currentUser.email);
      return sendJson(res, 200, result);
    } catch (err) {
      return sendJson(res, 500, { error: err.message });
    }
  }

  // 16c. Lấy Bản Chiếu Chia Sẻ Mục
  if (req.method === 'GET' && pathname === '/api/shares/item/projection') {
    const itemType = searchParams.get('itemType');
    const itemId = searchParams.get('itemId');
    const vaultId = searchParams.get('vaultId');
    if (!itemType || !itemId) return sendJson(res, 400, { error: 'Thiếu itemType hoặc itemId' });

    const userVaults = dbManager.getUserVaults(currentUser.id, currentUser.email);
    const targetVaultId = vaultId || (userVaults.length > 0 ? userVaults[0].id : null);
    if (!targetVaultId) return sendJson(res, 404, { error: 'Không tìm thấy sổ' });

    const proj = dbManager.getItemProjection(targetVaultId, itemType, itemId);
    return sendJson(res, 200, { projection: proj ? proj.data : null });
  }

  // 17. Lấy danh sách thành viên và liên kết chia sẻ cho một mục
  if (req.method === 'GET' && pathname === '/api/shares/item') {
    const itemType = searchParams.get('itemType');
    const itemId = searchParams.get('itemId');
    if (!itemType || !itemId) return sendJson(res, 400, { error: 'Thiếu itemType hoặc itemId' });

    // Lấy vault của người dùng hiện tại
    const userVaults = dbManager.getUserVaults(currentUser.id, currentUser.email);
    if (userVaults.length === 0) return sendJson(res, 404, { error: 'Không tìm thấy sổ' });
    const vaultId = userVaults[0].id;

    const shares = dbManager.getItemShares(vaultId, itemType, itemId);
    const links = dbManager.getItemShareLinks(vaultId, itemType, itemId);
    return sendJson(res, 200, { shares, links });
  }

  // 18. Thêm thành viên chia sẻ qua Email Google
  if (req.method === 'POST' && pathname === '/api/shares/item/email') {
    try {
      const body = await parseJsonBody(req);
      const { itemType, itemId, itemName, email, role } = body;
      if (!itemType || !itemId || !email) {
        return sendJson(res, 400, { error: 'Thiếu thông tin itemType, itemId hoặc email' });
      }

      const userVaults = dbManager.getUserVaults(currentUser.id, currentUser.email);
      if (userVaults.length === 0) return sendJson(res, 404, { error: 'Không tìm thấy sổ của bạn' });
      const vaultId = userVaults[0].id;

      const shareRole = role === 'editor' ? 'editor' : 'viewer';
      const result = dbManager.addItemShare(vaultId, itemType, itemId, itemName, email, shareRole, currentUser.id);

      return sendJson(res, 200, { success: true, share: result });
    } catch (err) {
      return sendJson(res, 500, { error: err.message });
    }
  }

  // 19. Thu hồi quyền chia sẻ email
  const revokeEmailMatch = pathname.match(/^\/api\/shares\/item\/email\/([^/]+)$/);
  if (req.method === 'DELETE' && revokeEmailMatch) {
    const shareId = revokeEmailMatch[1];
    dbManager.removeItemShare(shareId, currentUser.email);
    return sendJson(res, 200, { success: true, message: 'Đã thu hồi quyền chia sẻ' });
  }

  // 20. Tạo liên kết chia sẻ mới (Link)
  if (req.method === 'POST' && pathname === '/api/shares/item/link') {
    try {
      const body = await parseJsonBody(req);
      const { itemType, itemId, itemName, role } = body;
      if (!itemType || !itemId) {
        return sendJson(res, 400, { error: 'Thiếu itemType hoặc itemId' });
      }

      const userVaults = dbManager.getUserVaults(currentUser.id, currentUser.email);
      if (userVaults.length === 0) return sendJson(res, 404, { error: 'Không tìm thấy sổ của bạn' });
      const vaultId = userVaults[0].id;

      const linkRole = role === 'editor' ? 'editor' : 'viewer';
      const link = dbManager.createItemShareLink(vaultId, itemType, itemId, itemName, linkRole, currentUser.id);

      return sendJson(res, 200, { success: true, link });
    } catch (err) {
      return sendJson(res, 500, { error: err.message });
    }
  }

  // 21. Thu hồi liên kết chia sẻ
  const revokeLinkMatch = pathname.match(/^\/api\/shares\/item\/link\/([^/]+)$/);
  if (req.method === 'DELETE' && revokeLinkMatch) {
    const linkId = revokeLinkMatch[1];
    dbManager.revokeItemShareLink(linkId);
    return sendJson(res, 200, { success: true, message: 'Đã thu hồi liên kết' });
  }

  // 22. Người nhận chấp nhận liên kết chia sẻ
  if (req.method === 'POST' && pathname === '/api/shares/link/accept') {
    try {
      const body = await parseJsonBody(req);
      const { token } = body;
      if (!token) return sendJson(res, 400, { error: 'Thiếu token' });

      const link = dbManager.getShareLinkByToken(token);
      if (!link) return sendJson(res, 404, { error: 'Liên kết không tồn tại hoặc đã hết hạn' });

      // Tự động thêm quyền cho email của currentUser
      const share = dbManager.addItemShare(link.vault_id, link.item_type, link.item_id, link.item_name, currentUser.email, link.role, link.created_by);

      const itemData = dbManager.getReceivedItemData(link.vault_id, link.item_type, link.item_id);

      return sendJson(res, 200, {
        success: true,
        shareId: share.id,
        vaultId: link.vault_id,
        itemType: link.item_type,
        itemId: link.item_id,
        itemName: link.item_name,
        role: link.role,
        ownerName: link.owner_name,
        ownerEmail: link.owner_email,
        ...itemData
      });
    } catch (err) {
      return sendJson(res, 500, { error: err.message });
    }
  }

  // 23. Danh sách tất cả các mục được người khác chia sẻ cho tôi
  if (req.method === 'GET' && pathname === '/api/shares/my-received') {
    const shares = dbManager.getReceivedSharesForEmail(currentUser.email);
    const results = [];

    for (const s of shares) {
      const data = dbManager.getReceivedItemData(s.vault_id, s.item_type, s.item_id);
      if (data && data.item) {
        results.push({
          shareId: s.id,
          vaultId: s.vault_id,
          vaultName: s.vault_name,
          ownerName: s.owner_name,
          ownerEmail: s.owner_email,
          itemType: s.item_type,
          itemId: s.item_id,
          itemName: s.item_name,
          role: s.role,
          ...data
        });
      }
    }

    return sendJson(res, 200, { items: results });
  }

  // 24. Đẩy cập nhật giao dịch từ thành viên (Editor) lên mục được chia sẻ
  if (req.method === 'POST' && pathname === '/api/shares/received/sync') {
    try {
      const body = await parseJsonBody(req);
      const { shareId, transactions, projection } = body;
      if (!shareId || (!Array.isArray(transactions) && !projection)) {
        return sendJson(res, 400, { error: 'Thiếu shareId hoặc danh sách transactions / projection' });
      }

      const result = dbManager.saveSharedItemTransactions(shareId, currentUser.email, transactions, projection);
      return sendJson(res, 200, result);
    } catch (err) {
      return sendJson(res, 500, { error: err.message });
    }
  }

  // 404 cho API không xác định
  return sendJson(res, 404, { error: 'API endpoint không tồn tại: ' + pathname });
}

// ==============================================================================
// 6. STATIC FILE SERVER (Single Page App & PWA Assets)
// ==============================================================================
function serveStaticFile(req, res, reqPath) {
  let safePath = decodeURI(reqPath.split('?')[0]);
  if (safePath === '/' || !safePath) safePath = '/index.html';
  if (safePath === '/admin' || safePath === '/admin/') safePath = '/admin.html';

  // Chặn Directory Traversal
  const normalizedPath = path.normalize(safePath).replace(/^(\.\.[/\\])+/, '');
  let filePath = path.join(__dirname, normalizedPath);

  // Nếu file không tồn tại nhưng không có phần mở rộng (SPA routing) -> fallback về index.html
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    if (!path.extname(filePath)) {
      filePath = path.join(__dirname, 'index.html');
    }
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('404 Not Found');
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    // Caching headers
    const headers = {
      'Content-Type': contentType,
      'Access-Control-Allow-Origin': CORS_ORIGIN
    };

    // PWA & Service Worker không cache vĩnh viễn để cập nhật tức thì
    if (ext === '.html' || ext === '.json' || ext === '.js' || ext === '.css' || path.basename(filePath) === 'sw.js') {
      headers['Cache-Control'] = 'no-cache, must-revalidate';
      if (path.basename(filePath) === 'sw.js') {
        headers['Service-Worker-Allowed'] = '/';
      }
    } else {
      headers['Cache-Control'] = 'public, max-age=86400';
    }

    res.writeHead(200, headers);
    fs.createReadStream(filePath).pipe(res);
  });
}

// ==============================================================================
// 7. HTTP SERVER STARTUP
// ==============================================================================
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = url.pathname;

  // Xử lý trang quản trị
  if (pathname === '/admin' || pathname === '/admin/') {
    serveStaticFile(req, res, '/admin.html');
    return;
  }

  // Xử lý các yêu cầu REST API
  if (pathname.startsWith('/api/') || pathname === '/health') {
    try {
      await handleApiRequest(req, res, pathname, url);
    } catch (err) {
      console.error('[Server] Unhandled API error:', err);
      sendJson(res, 500, { error: 'Lỗi máy chủ nội bộ: ' + err.message });
    }
    return;
  }

  // Phục vụ tệp tĩnh (Frontend PWA)
  serveStaticFile(req, res, pathname);
});

server.listen(PORT, HOST, () => {
  console.log('================================================================');
  console.log('  🚀 SỔ THU CHI - MÁY CHỦ RIÊNG ĐỒNG BỘ & ĐA NGƯỜI DÙNG');
  console.log('================================================================');
  console.log(`  🌐 Website & API: http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`);
  console.log(`  🛡️ Trang Quản Trị: http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}/admin`);
  console.log(`  📧 Admin Email:   ${getAdminEmails().length > 0 ? getAdminEmails().join(', ') : 'Chưa cấu hình (khai báo ADMIN_EMAIL trong compose)'}`);
  console.log(`  💾 Dữ liệu lưu tại: ${DATA_DIR}`);
  console.log(`  🔒 Database Engine: ${dbManager.isSqlite ? 'SQLite (node:sqlite)' : 'JSON File Store'}`);
  console.log(`  🔑 Google OAuth:    ${GOOGLE_CLIENT_ID ? 'Đã cấu hình' : 'Chờ client truyền token'}`);
  console.log('================================================================');
});
