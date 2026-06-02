<?php
/**
 * Outlook Clone - Database SQLite con FTS5
 * Gestione database per email, account, cartelle, contatti
 */

if (!defined('ENCRYPTION_KEY')) {
    define('ENCRYPTION_KEY', hash('sha256', 'outlook-clone-key-' . (__DIR__), true));
}

class OutlookDB {
    private static $instance = null;
    private $db;
    private $path;

    private function __construct($dbPath) {
        $this->path = $dbPath;
        $this->db = new PDO('sqlite:' . $dbPath);
        $this->db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        $this->db->exec('PRAGMA journal_mode=WAL');
        $this->db->exec('PRAGMA foreign_keys=ON');
        $this->db->exec('PRAGMA cache_size=-8000'); // 8MB cache
        $this->init();
    }

    /**
     * Restituisce l'istanza del DB. Il percorso è OBBLIGATORIO e deve essere
     * la directory di storage PER-UTENTE (data/users/<id>/outlook/...), così
     * ogni utente ha un database fisicamente separato: nessun utente può
     * vedere i dati (account, email, contatti) di un altro.
     */
    public static function getInstance($dbPath = null) {
        if ($dbPath === null) {
            // Fallback legacy (mono-utente). In uso multi-utente passare sempre
            // il percorso per-utente dall'API autenticata.
            $dbPath = __DIR__ . '/outlook_data.db';
        }
        if (self::$instance === null) {
            self::$instance = new self($dbPath);
        }
        return self::$instance;
    }

    public function getDb() {
        return $this->db;
    }

    private function init() {
        $this->db->exec('
            CREATE TABLE IF NOT EXISTS accounts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                email TEXT NOT NULL UNIQUE,
                imap_host TEXT NOT NULL,
                imap_port INTEGER DEFAULT 993,
                imap_encryption TEXT DEFAULT "ssl",
                smtp_host TEXT NOT NULL,
                smtp_port INTEGER DEFAULT 587,
                smtp_encryption TEXT DEFAULT "tls",
                username TEXT NOT NULL,
                password_enc TEXT NOT NULL,
                delete_from_server INTEGER DEFAULT 0,
                is_default INTEGER DEFAULT 0,
                signature TEXT DEFAULT "",
                last_sync DATETIME,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS folders (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                account_id INTEGER NOT NULL,
                name TEXT NOT NULL,
                type TEXT DEFAULT "custom",
                imap_name TEXT,
                icon TEXT DEFAULT "fa-folder",
                sort_order INTEGER DEFAULT 100,
                unread_count INTEGER DEFAULT 0,
                total_count INTEGER DEFAULT 0,
                FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
                UNIQUE(account_id, name)
            );

            CREATE TABLE IF NOT EXISTS emails (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                account_id INTEGER NOT NULL,
                folder_id INTEGER NOT NULL,
                message_id TEXT,
                uid INTEGER,
                from_name TEXT,
                from_email TEXT,
                to_addresses TEXT,
                cc_addresses TEXT,
                bcc_addresses TEXT,
                reply_to TEXT,
                subject TEXT DEFAULT "(nessun oggetto)",
                body_text TEXT,
                body_html TEXT,
                date DATETIME,
                is_read INTEGER DEFAULT 0,
                is_starred INTEGER DEFAULT 0,
                is_flagged INTEGER DEFAULT 0,
                is_draft INTEGER DEFAULT 0,
                has_attachments INTEGER DEFAULT 0,
                attachments_json TEXT DEFAULT "[]",
                priority INTEGER DEFAULT 3,
                size INTEGER DEFAULT 0,
                in_reply_to TEXT,
                references_header TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
                FOREIGN KEY (folder_id) REFERENCES folders(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS contacts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                account_id INTEGER,
                name TEXT,
                email TEXT NOT NULL,
                phone TEXT,
                company TEXT,
                notes TEXT,
                is_favorite INTEGER DEFAULT 0,
                last_used DATETIME DEFAULT CURRENT_TIMESTAMP,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT
            );

            CREATE TABLE IF NOT EXISTS attachments (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email_id INTEGER NOT NULL,
                filename TEXT NOT NULL,
                mime_type TEXT,
                size INTEGER DEFAULT 0,
                content BLOB,
                cid TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (email_id) REFERENCES emails(id) ON DELETE CASCADE
            );
        ');

        // Indici per performance
        $indices = [
            'CREATE INDEX IF NOT EXISTS idx_emails_folder ON emails(folder_id)',
            'CREATE INDEX IF NOT EXISTS idx_emails_account ON emails(account_id)',
            'CREATE INDEX IF NOT EXISTS idx_emails_date ON emails(date DESC)',
            'CREATE INDEX IF NOT EXISTS idx_emails_uid ON emails(account_id, uid)',
            'CREATE INDEX IF NOT EXISTS idx_emails_msgid ON emails(message_id)',
            'CREATE INDEX IF NOT EXISTS idx_emails_read ON emails(folder_id, is_read)',
            'CREATE INDEX IF NOT EXISTS idx_emails_starred ON emails(account_id, is_starred)',
            'CREATE INDEX IF NOT EXISTS idx_emails_draft ON emails(account_id, is_draft)',
            'CREATE INDEX IF NOT EXISTS idx_folders_account ON folders(account_id)',
            'CREATE INDEX IF NOT EXISTS idx_contacts_email ON contacts(email)',
            'CREATE INDEX IF NOT EXISTS idx_contacts_account ON contacts(account_id)',
            'CREATE INDEX IF NOT EXISTS idx_attachments_email ON attachments(email_id)',
        ];
        foreach ($indices as $idx) {
            $this->db->exec($idx);
        }

        // FTS5 per ricerca full-text
        try {
            $this->db->exec('
                CREATE VIRTUAL TABLE IF NOT EXISTS emails_fts USING fts5(
                    subject, body_text, from_name, from_email, to_addresses,
                    content=emails, content_rowid=id
                )
            ');
        } catch (Exception $e) {
            // FTS5 non disponibile, usa fallback LIKE
        }

        // Trigger per mantenere FTS sincronizzato
        $this->db->exec('
            CREATE TRIGGER IF NOT EXISTS emails_ai AFTER INSERT ON emails BEGIN
                INSERT OR IGNORE INTO emails_fts(rowid, subject, body_text, from_name, from_email, to_addresses)
                VALUES (new.id, new.subject, new.body_text, new.from_name, new.from_email, new.to_addresses);
            END;
            CREATE TRIGGER IF NOT EXISTS emails_ad AFTER DELETE ON emails BEGIN
                INSERT OR IGNORE INTO emails_fts(emails_fts, rowid, subject, body_text, from_name, from_email, to_addresses)
                VALUES ("delete", old.id, old.subject, old.body_text, old.from_name, old.from_email, old.to_addresses);
            END;
            CREATE TRIGGER IF NOT EXISTS emails_au AFTER UPDATE ON emails BEGIN
                INSERT OR IGNORE INTO emails_fts(emails_fts, rowid, subject, body_text, from_name, from_email, to_addresses)
                VALUES ("delete", old.id, old.subject, old.body_text, old.from_name, old.from_email, old.to_addresses);
                INSERT OR IGNORE INTO emails_fts(rowid, subject, body_text, from_name, from_email, to_addresses)
                VALUES (new.id, new.subject, new.body_text, new.from_name, new.from_email, new.to_addresses);
            END;
        ');
    }

    // Cifratura password
    public static function encryptPassword($password) {
        $iv = openssl_random_pseudo_bytes(16);
        $encrypted = openssl_encrypt($password, 'aes-256-cbc', ENCRYPTION_KEY, 0, $iv);
        return base64_encode($iv . '::' . $encrypted);
    }

    public static function decryptPassword($encrypted) {
        $data = base64_decode($encrypted);
        $parts = explode('::', $data, 2);
        if (count($parts) !== 2) return '';
        return openssl_decrypt($parts[1], 'aes-256-cbc', ENCRYPTION_KEY, 0, $parts[0]);
    }

    // Crea cartelle predefinite per un account
    public function createDefaultFolders($accountId) {
        $defaults = [
            ['Posta in arrivo', 'inbox', 'INBOX', 'fa-inbox', 1],
            ['Posta inviata', 'sent', 'Sent', 'fa-paper-plane', 2],
            ['Bozze', 'drafts', 'Drafts', 'fa-file-alt', 3],
            ['Posta eliminata', 'trash', 'Trash', 'fa-trash-alt', 4],
            ['Posta indesiderata', 'junk', 'Junk', 'fa-shield-alt', 5],
            ['Archivio', 'archive', 'Archive', 'fa-archive', 6],
        ];
        $stmt = $this->db->prepare('INSERT OR IGNORE INTO folders (account_id, name, type, imap_name, icon, sort_order) VALUES (?, ?, ?, ?, ?, ?)');
        foreach ($defaults as $f) {
            $stmt->execute([$accountId, $f[0], $f[1], $f[2], $f[3], $f[4]]);
        }
    }

    // Aggiorna conteggi cartelle
    public function updateFolderCounts($folderId) {
        $this->db->prepare('UPDATE folders SET total_count = (SELECT COUNT(*) FROM emails WHERE folder_id = ?), unread_count = (SELECT COUNT(*) FROM emails WHERE folder_id = ? AND is_read = 0) WHERE id = ?')
            ->execute([$folderId, $folderId, $folderId]);
    }
}
