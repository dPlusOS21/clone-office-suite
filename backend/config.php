<?php
/**
 * Configurazione centrale — Database SQLite, sessioni e utility
 *
 * Su Altervista assicurati che:
 * 1. La cartella /data/ NON sia accessibile via web (vedi .htaccess)
 * 2. PHP abbia i permessi di scrittura su /data/
 */

// ─── Fuso orario ───
// Evita il warning/crash di PHP su date() quando il timezone di sistema
// non è configurato (E_WARNING "It is not safe to rely on the system's
// timezone settings") che può corrompere l'output JSON delle API.
date_default_timezone_set('Europe/Rome');

// ─── Percorsi ───
define('ROOT_DIR', dirname(__DIR__));                         // /cartella-clone
define('DATA_DIR', ROOT_DIR . '/data');                       // /data
define('DB_PATH', DATA_DIR . '/clone_office.db');            // /data/clone_office.db

// ─── Avvio sessione ───
if (session_status() === PHP_SESSION_NONE) {
    session_set_cookie_params([
        'lifetime' => 86400 * 30,   // 30 giorni
        'path'     => '/',
        'domain'   => '',
        'secure'   => isset($_SERVER['HTTPS']),
        'httponly' => true,
        'samesite' => 'Lax'
    ]);
    session_name('CLONE_OFFICE_SID');
    session_start();
}

// ─── Database ───
function getDB(): PDO {
    static $db = null;
    if ($db === null) {
        if (!is_dir(DATA_DIR)) {
            @mkdir(DATA_DIR, 0755, true);
        }
        $db = new PDO('sqlite:' . DB_PATH);
        $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        $db->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
        $db->exec('PRAGMA journal_mode=WAL');
        $db->exec('PRAGMA foreign_keys=ON');
    }
    return $db;
}

// ─── Inizializza database (crea tabelle se non esistono) ───
function initDatabase(): void {
    $db = getDB();
    $db->exec("
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            secret_key TEXT UNIQUE NOT NULL,
            role TEXT NOT NULL DEFAULT 'user',
            is_active INTEGER NOT NULL DEFAULT 1,
            created_at DATETIME DEFAULT (datetime('now')),
            last_login DATETIME
        )
    ");
    $db->exec("
        CREATE TABLE IF NOT EXISTS auth_requests (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            token TEXT UNIQUE NOT NULL,
            user_id INTEGER,
            status TEXT NOT NULL DEFAULT 'pending',
            ip_address TEXT,
            user_agent TEXT,
            created_at DATETIME DEFAULT (datetime('now')),
            expires_at DATETIME
        )
    ");
    $db->exec("
        CREATE TABLE IF NOT EXISTS licenses (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            license_key TEXT UNIQUE NOT NULL,
            plan TEXT NOT NULL DEFAULT 'base',
            max_devices INTEGER NOT NULL DEFAULT 1,
            paypal_txn_id TEXT,
            amount REAL,
            is_active INTEGER NOT NULL DEFAULT 1,
            created_at DATETIME DEFAULT (datetime('now')),
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    ");
    $db->exec("
        CREATE TABLE IF NOT EXISTS devices (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            license_id INTEGER NOT NULL,
            device_id TEXT NOT NULL,
            device_name TEXT,
            activated_at DATETIME DEFAULT (datetime('now')),
            FOREIGN KEY (license_id) REFERENCES licenses(id),
            UNIQUE(license_id, device_id)
        )
    ");
    $db->exec("
        CREATE TABLE IF NOT EXISTS sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            php_session_id TEXT,
            device_fingerprint TEXT NOT NULL,
            device_name TEXT,
            ip_address TEXT,
            user_agent TEXT,
            app_name TEXT DEFAULT 'index',
            started_at DATETIME DEFAULT (datetime('now')),
            last_heartbeat DATETIME DEFAULT (datetime('now')),
            is_active INTEGER NOT NULL DEFAULT 1,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    ");
    $db->exec("CREATE INDEX IF NOT EXISTS idx_sessions_user_active ON sessions(user_id, is_active)");
    $db->exec("CREATE INDEX IF NOT EXISTS idx_sessions_fingerprint ON sessions(device_fingerprint)");

    // Impostazioni globali (chiave/valore) — es. email destinatario dei feedback
    $db->exec("
        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT
        )
    ");
    // Feedback inviati dalle guide delle app (anche se l'email fallisce restano qui)
    $db->exec("
        CREATE TABLE IF NOT EXISTS feedback (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            app TEXT,
            type TEXT,
            message TEXT NOT NULL,
            email TEXT,
            mailed INTEGER NOT NULL DEFAULT 0,
            created_at DATETIME DEFAULT (datetime('now'))
        )
    ");

    // Migrazione: aggiungi storage_limit_mb se mancante
    try {
        $db->exec("ALTER TABLE users ADD COLUMN storage_limit_mb INTEGER NOT NULL DEFAULT 100");
    } catch (Exception $e) {
        // Colonna già esistente — ignora
    }
}

// ─── Leggi/scrivi un'impostazione globale ───
function getSetting(string $key, ?string $default = null): ?string {
    try {
        $stmt = getDB()->prepare("SELECT value FROM settings WHERE key = ?");
        $stmt->execute([$key]);
        $v = $stmt->fetchColumn();
        return $v !== false ? $v : $default;
    } catch (Exception $e) {
        return $default;
    }
}
function setSetting(string $key, string $value): void {
    $stmt = getDB()->prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value");
    $stmt->execute([$key, $value]);
}

// ─── Pulisci sessioni stale (più di 5 minuti senza heartbeat) ───
function cleanupStaleSessions(): void {
    getDB()->exec("UPDATE sessions SET is_active = 0 WHERE is_active = 1 AND last_heartbeat < datetime('now', '-5 minutes')");
}

// ─── Genera token casuale ───
function generateToken(int $length = 32): string {
    return bin2hex(random_bytes($length));
}

// ─── Genera secret key leggibile ───
function generateSecretKey(): string {
    $chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    $parts = [];
    for ($p = 0; $p < 4; $p++) {
        $part = '';
        for ($i = 0; $i < 4; $i++) {
            $part .= $chars[random_int(0, strlen($chars) - 1)];
        }
        $parts[] = $part;
    }
    return implode('-', $parts);
}

// ─── Invia risposta JSON ───
function jsonResponse(array $data, int $code = 200): void {
    http_response_code($code);
    header('Content-Type: application/json');
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

// ─── Verifica autenticazione ───
function getAuthUser(): ?array {
    if (empty($_SESSION['user_id'])) return null;
    $db = getDB();
    $stmt = $db->prepare("SELECT id, name, email, secret_key, role, is_active, created_at, last_login FROM users WHERE id = ? AND is_active = 1");
    $stmt->execute([$_SESSION['user_id']]);
    return $stmt->fetch() ?: null;
}

// ─── Richiede autenticazione ───
function requireAuth(): array {
    $user = getAuthUser();
    if (!$user) {
        jsonResponse(['error' => 'Non autenticato'], 401);
    }
    return $user;
}

// ─── Richiede ruolo admin ───
function requireAdmin(): array {
    $user = requireAuth();
    if ($user['role'] !== 'admin') {
        jsonResponse(['error' => 'Accesso negato — servono privilegi amministrativi'], 403);
    }
    return $user;
}

// ─── CORS per sviluppo locale ───
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-Requested-With');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// Inizializza database all'avvio di ogni richiesta
initDatabase();
