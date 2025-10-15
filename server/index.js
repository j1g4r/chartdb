import express from 'express';
import cors from 'cors';
import cookieSession from 'cookie-session';
import bcrypt from 'bcryptjs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import Database from 'better-sqlite3';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 8080;
const CLIENT_DIST = path.join(__dirname, '..', 'dist');
const DB_FILE = process.env.SQLITE_DB_PATH || path.join(__dirname, 'data.db');

const app = express();
const httpServer = createServer(app);
const io = new SocketIOServer(httpServer, {
    cors: {
        origin: process.env.CORS_ORIGIN || '*',
        credentials: true,
    },
});

app.use(
    cors({
        origin: process.env.CORS_ORIGIN || true,
        credentials: true,
    })
);
app.use(express.json({ limit: '10mb' }));
app.use(
    cookieSession({
        name: 'session',
        secret: process.env.SESSION_SECRET || 'dev_secret',
        httpOnly: true,
        sameSite: 'lax',
    })
);

// Init DB and schema
const db = new Database(DB_FILE);
db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  owner_id INTEGER NOT NULL,
  diagram_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (owner_id) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS workspace_members (
  user_id INTEGER NOT NULL,
  workspace_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'editor',
  PRIMARY KEY (user_id, workspace_id),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id)
);
`);

function requireAuth(req, res, next) {
    if (req.session && req.session.userId) return next();
    res.status(401).json({ error: 'Unauthorized' });
}

// Auth routes
app.post('/api/auth/signup', (req, res) => {
    const { email, password } = req.body || {};
    if (!email || !password)
        return res.status(400).json({ error: 'Email and password required' });
    const password_hash = bcrypt.hashSync(password, 10);
    try {
        const stmt = db.prepare(
            'INSERT INTO users (email, password_hash) VALUES (?, ?)'
        );
        const info = stmt.run(email, password_hash);
        req.session.userId = info.lastInsertRowid;
        res.json({ id: info.lastInsertRowid, email });
    } catch (e) {
        if (String(e).includes('UNIQUE'))
            return res.status(409).json({ error: 'Email already exists' });
        res.status(500).json({ error: 'Failed to sign up' });
    }
});

app.post('/api/auth/login', (req, res) => {
    const { email, password } = req.body || {};
    if (!email || !password)
        return res.status(400).json({ error: 'Email and password required' });
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    if (!bcrypt.compareSync(password, user.password_hash))
        return res.status(401).json({ error: 'Invalid credentials' });
    req.session.userId = user.id;
    res.json({ id: user.id, email: user.email });
});

app.post('/api/auth/logout', (req, res) => {
    req.session = null;
    res.json({ ok: true });
});

app.get('/api/session', (req, res) => {
    if (req.session && req.session.userId) {
        const user = db
            .prepare('SELECT id, email FROM users WHERE id = ?')
            .get(req.session.userId);
        return res.json({ user });
    }
    res.json({ user: null });
});

// Workspace routes
app.get('/api/workspaces', requireAuth, (req, res) => {
    const rows = db
        .prepare(
            `SELECT w.id, w.name, w.updated_at
     FROM workspaces w
     JOIN workspace_members m ON m.workspace_id = w.id
     WHERE m.user_id = ?
     ORDER BY w.updated_at DESC`
        )
        .all(req.session.userId);
    res.json(rows);
});

app.post('/api/workspaces', requireAuth, (req, res) => {
    const { id, name, diagram } = req.body || {};
    if (!id || !name)
        return res.status(400).json({ error: 'id and name required' });
    const stmt = db.prepare(
        'INSERT INTO workspaces (id, name, owner_id, diagram_json) VALUES (?, ?, ?, ?)'
    );
    try {
        stmt.run(id, name, req.session.userId, JSON.stringify(diagram ?? {}));
        db.prepare(
            'INSERT INTO workspace_members (user_id, workspace_id, role) VALUES (?, ?, ?)'
        ).run(req.session.userId, id, 'owner');
        res.json({ id, name });
    } catch (e) {
        if (String(e).includes('UNIQUE'))
            return res.status(409).json({ error: 'Workspace already exists' });
        res.status(500).json({ error: 'Failed to create workspace' });
    }
});

app.get('/api/workspaces/:id', requireAuth, (req, res) => {
    const w = db
        .prepare(
            `SELECT w.id, w.name, w.diagram_json, w.updated_at
     FROM workspaces w
     JOIN workspace_members m ON m.workspace_id = w.id
     WHERE w.id = ? AND m.user_id = ?`
        )
        .get(req.params.id, req.session.userId);
    if (!w) return res.status(404).json({ error: 'Not found' });
    res.json({
        id: w.id,
        name: w.name,
        diagram: JSON.parse(w.diagram_json),
        updatedAt: w.updated_at,
    });
});

app.put('/api/workspaces/:id', requireAuth, (req, res) => {
    const { name, diagram } = req.body || {};
    const exists = db
        .prepare(
            `SELECT 1 FROM workspaces w JOIN workspace_members m ON m.workspace_id = w.id
     WHERE w.id = ? AND m.user_id = ?`
        )
        .get(req.params.id, req.session.userId);
    if (!exists) return res.status(404).json({ error: 'Not found' });
    const now = new Date().toISOString();
    const stmt = db.prepare(
        'UPDATE workspaces SET name = COALESCE(?, name), diagram_json = COALESCE(?, diagram_json), updated_at = ? WHERE id = ?'
    );
    stmt.run(
        name ?? null,
        diagram ? JSON.stringify(diagram) : null,
        now,
        req.params.id
    );
    io.to(`ws:${req.params.id}`).emit('workspace:update', {
        id: req.params.id,
        name,
        diagram,
        updatedAt: now,
    });
    res.json({ ok: true, updatedAt: now });
});

// Socket.io for collaboration
io.on('connection', (socket) => {
    socket.on('workspace:join', (workspaceId) => {
        socket.join(`ws:${workspaceId}`);
    });
    socket.on('workspace:leave', (workspaceId) => {
        socket.leave(`ws:${workspaceId}`);
    });
    socket.on('workspace:update', ({ id, patch }) => {
        // broadcast patches as-is; client merges
        socket.to(`ws:${id}`).emit('workspace:patch', { id, patch });
    });
});

// Serve static frontend in production build
app.use(express.static(CLIENT_DIST));
app.get('*', (req, res) => {
    res.sendFile(path.join(CLIENT_DIST, 'index.html'));
});

httpServer.listen(PORT, () => {
    console.log(`Server listening on http://localhost:${PORT}`);
});
