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
      vault_history: []
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
        this.jsonStore.item_shares = this.jsonStore.item_shares || {};
        this.jsonStore.item_share_links = this.jsonStore.item_share_links || {};
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
        SELECT vs.*, u.name as user_name, u.picture as user_picture
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
        return { id: existing.id, vault_id: vaultId, user_email: cleanEmail, role: shareRole };
      }
      const shareId = 'shr_' + crypto.randomBytes(8).toString('hex');
      this.sqliteDb.prepare(`
        INSERT INTO vault_shares (id, vault_id, user_email, role, invited_by, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(shareId, vaultId, cleanEmail, shareRole, invitedBy, now);
      return { id: shareId, vault_id: vaultId, user_email: cleanEmail, role: shareRole, created_at: now };
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
      const newShare = { id: shareId, vault_id: vaultId, user_email: cleanEmail, role: shareRole, invited_by: invitedBy, created_at: now };
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
    const nextVersion = (current?.version || 0) + 1;
    const jsonStr = JSON.stringify(dataObj);

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
    const id = generateId();
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
    const id = generateId();
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

  getReceivedItemData(vaultId, itemType, itemId) {
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

  saveSharedItemTransactions(shareId, email, incomingTxs) {
    let share = null;
    if (this.isSqlite) {
      share = this.sqliteDb.prepare('SELECT * FROM item_shares WHERE id = ?').get(shareId);
    } else {
      share = (this.jsonStore.item_shares || []).find(s => s.id === shareId);
    }

    if (!share) throw new Error('Không tìm thấy thông tin chia sẻ.');
    if (share.role !== 'editor') throw new Error('Bạn không có quyền chỉnh sửa tài khoản này.');

    const vault = this.getVaultData(share.vault_id);
    if (!vault || !vault.data) throw new Error('Dữ liệu sổ chủ sở hữu không khả dụng.');

    const currentTxs = Array.isArray(vault.data.transactions) ? vault.data.transactions : [];
    const mergedTxs = mergeTableData(currentTxs, incomingTxs, false);

    vault.data.transactions = mergedTxs;
    this.saveVaultData(share.vault_id, vault.data, email);
    return { success: true, count: mergedTxs.length };
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
}

const dbManager = new DatabaseManager();

// ==============================================================================
// 2. DATA MERGE ENGINE (Conflict-Free Last-Write-Wins Multi-Table)
// ==============================================================================
function mergeTableData(serverItems = [], clientItems = [], isAccountTable = false) {
  const map = new Map();

  // Nạp dữ liệu hiện có trên Server
  if (Array.isArray(serverItems)) {
    for (const item of serverItems) {
      if (item && item.id !== undefined) {
        map.set(item.id, item);
      }
    }
  }

  // So khớp với dữ liệu từ Client gửi lên
  if (Array.isArray(clientItems)) {
    for (const cItem of clientItems) {
      if (!cItem || cItem.id === undefined) continue;

      let sItem = map.get(cItem.id);

      // Đối với tài khoản: nếu chưa có ID nhưng trùng tên & loại -> ghép tránh nhân đôi
      if (!sItem && isAccountTable && cItem.name) {
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
        // Thuật toán Last-Write-Wins: so sánh updatedAt
        const cTime = new Date(cItem.updatedAt || 0).getTime() || 0;
        const sTime = new Date(sItem.updatedAt || 0).getTime() || 0;

        if (cTime >= sTime) {
          // Client mới hơn hoặc bằng -> nhận bản ghi của Client
          map.set(sItem.id, { ...cItem, id: sItem.id });
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
    transactions: mergeTableData(s.transactions, c.transactions, false),
    accounts: mergeTableData(s.accounts, c.accounts, true),
    categories: mergeTableData(s.categories, c.categories, false),
    debts: mergeTableData(s.debts, c.debts, false),
    budgets: mergeTableData(s.budgets, c.budgets, false),
    recurring: mergeTableData(s.recurring, c.recurring, false),
    savings: mergeTableData(s.savings, c.savings, false),
    accumulations: mergeTableData(s.accumulations, c.accumulations, false),
    assets: mergeTableData(s.assets, c.assets, false),
    loans: mergeTableData(s.loans, c.loans, false),
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

function getAuthUser(req) {
  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7).trim();
  return dbManager.getUserByToken(token);
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

  // 1. Health check & Server Info
  if (req.method === 'GET' && (pathname === '/api/health' || pathname === '/health')) {
    return sendJson(res, 200, {
      status: 'ok',
      service: 'So Thu Chi Sync Server',
      version: '2.5.0',
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
        dbManager.createVault(`Sổ của ${user.name}`, user.id);
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

    return sendJson(res, 200, {
      token: link.token,
      itemType: link.item_type,
      itemId: link.item_id,
      itemName: link.item_name,
      role: link.role,
      ownerName: link.owner_name,
      ownerEmail: link.owner_email,
      createdAt: link.created_at
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
      const newV = dbManager.createVault(`Sổ của ${currentUser.name}`, currentUser.id);
      vaults = [newV];
    }
    return sendJson(res, 200, { vaults });
  }

  // 7. Tạo Sổ mới (Create Vault)
  if (req.method === 'POST' && pathname === '/api/vaults') {
    try {
      const body = await parseJsonBody(req);
      const name = (body.name || '').trim() || 'Sổ Thu Chi Mới';
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

    // 8. Đổi tên Sổ
    if (req.method === 'PUT' && subPath === '') {
      if (role !== 'owner' && role !== 'editor') {
        return sendJson(res, 403, { error: 'Chỉ Chủ sổ hoặc Editor mới có quyền đổi tên sổ' });
      }
      const body = await parseJsonBody(req);
      const updated = dbManager.renameVault(vaultId, (body.name || '').trim() || 'Sổ Thu Chi');
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

    // 13. Lấy dữ liệu Sổ (Data Pull)
    if (req.method === 'GET' && subPath === '/data') {
      const vaultData = dbManager.getVaultData(vaultId);
      const vaultInfo = dbManager.getVaultById(vaultId);

      return sendJson(res, 200, {
        vault: {
          id: vaultId,
          name: vaultInfo?.name || 'Sổ',
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

        let targetData;
        if (forceOverwrite) {
          targetData = incomingData;
        } else {
          // Lấy dữ liệu hiện có trên Server
          const serverCurrent = dbManager.getVaultData(vaultId);
          const serverData = serverCurrent?.data || {};

          // Thực hiện gộp dữ liệu Last-Write-Wins
          targetData = mergeFullVaultData(serverData, incomingData);
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
      const { shareId, transactions } = body;
      if (!shareId || !Array.isArray(transactions)) {
        return sendJson(res, 400, { error: 'Thiếu shareId hoặc danh sách transactions' });
      }

      const result = dbManager.saveSharedItemTransactions(shareId, currentUser.email, transactions);
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
    if (ext === '.html' || ext === '.json' || path.basename(filePath) === 'sw.js') {
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
  console.log(`  💾 Dữ liệu lưu tại: ${DATA_DIR}`);
  console.log(`  🔒 Database Engine: ${dbManager.isSqlite ? 'SQLite (node:sqlite)' : 'JSON File Store'}`);
  console.log(`  🔑 Google OAuth:    ${GOOGLE_CLIENT_ID ? 'Đã cấu hình' : 'Chờ client truyền token'}`);
  console.log('================================================================');
});
