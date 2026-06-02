<?php
/**
 * Storage Helper — Gestione centralizzata dello storage per utente
 *
 * Dipende da: config.php (chiamato automaticamente via require_once)
 *
 * Struttura su disco:
 *   data/users/<user_id>/<app>/
 *
 * Ogni app della suite salva i propri file nella propria
 * sottodirectory utente, separata dalle altre.
 */

require_once __DIR__ . '/config.php';

/**
 * Restituisce il percorso della directory di storage per un utente/app.
 * Crea la directory se non esiste.
 */
function getUserStorageDir(int $userId, string $appName): string {
    $app = preg_replace('/[^a-z0-9]/', '', strtolower($appName));
    if ($app === '') $app = 'files';
    $dir = DATA_DIR . '/users/' . $userId . '/' . $app;
    if (!is_dir($dir)) {
        @mkdir($dir, 0755, true);
    }
    return $dir;
}

/**
 * Restituisce il limite di storage per un utente in bytes.
 * Default: 100 MB
 */
function getStorageLimitBytes(int $userId): int {
    $db = getDB();
    $stmt = $db->prepare("SELECT COALESCE(storage_limit_mb, 100) FROM users WHERE id = ?");
    $stmt->execute([$userId]);
    return (int)$stmt->fetchColumn() * 1024 * 1024;
}

/**
 * Restituisce lo spazio usato da un utente in bytes,
 * calcolato ricorsivamente su tutte le sue directory app.
 */
function getStorageUsage(int $userId): int {
    $dir = DATA_DIR . '/users/' . $userId;
    if (!is_dir($dir)) return 0;
    $total = 0;
    try {
        $iter = new RecursiveIteratorIterator(
            new RecursiveDirectoryIterator($dir, RecursiveDirectoryIterator::SKIP_DOTS),
            RecursiveIteratorIterator::LEAVES_ONLY
        );
        foreach ($iter as $file) {
            if ($file->isFile()) {
                $total += $file->getSize();
            }
        }
    } catch (Exception $e) {}
    return $total;
}

/**
 * Restituisce lo spazio usato da un utente per una specifica app in bytes.
 */
function getStorageUsageForApp(int $userId, string $appName): int {
    $dir = getUserStorageDir($userId, $appName);
    if (!is_dir($dir)) return 0;
    $total = 0;
    try {
        $iter = new RecursiveIteratorIterator(
            new RecursiveDirectoryIterator($dir, RecursiveDirectoryIterator::SKIP_DOTS),
            RecursiveIteratorIterator::LEAVES_ONLY
        );
        foreach ($iter as $file) {
            if ($file->isFile()) {
                $total += $file->getSize();
            }
        }
    } catch (Exception $e) {}
    return $total;
}

/**
 * Calcola lo spazio usato per una directory specifica (es. una singola app).
 */
function getStorageUsageForDir(string $dir): int {
    if (!is_dir($dir)) return 0;
    $total = 0;
    try {
        $iter = new RecursiveIteratorIterator(
            new RecursiveDirectoryIterator($dir, RecursiveDirectoryIterator::SKIP_DOTS),
            RecursiveIteratorIterator::LEAVES_ONLY
        );
        foreach ($iter as $file) {
            if ($file->isFile()) {
                $total += $file->getSize();
            }
        }
    } catch (Exception $e) {}
    return $total;
}

/**
 * Verifica se l'utente ha spazio sufficiente per salvare altri dati.
 * Restituisce ['allowed' => true] oppure ['allowed' => false, 'message' => ...]
 */
function checkStorageQuota(int $userId, int $additionalBytes = 0): array {
    $usage = getStorageUsage($userId);
    $limit = getStorageLimitBytes($userId);
    if (($usage + $additionalBytes) > $limit) {
        $limitMb = $limit / 1024 / 1024;
        return [
            'allowed' => false,
            'usage' => $usage,
            'limit' => $limit,
            'message' => "Spazio di archiviazione esaurito ($limitMb MB). Elimina file non necessari o contatta l'amministratore."
        ];
    }
    return ['allowed' => true];
}

/**
 * Formatta bytes in formato leggibile.
 */
function formatBytes(int $bytes, int $decimals = 2): string {
    $units = ['B', 'KB', 'MB', 'GB', 'TB'];
    $factor = 0;
    while ($bytes >= 1024 && $factor < count($units) - 1) {
        $bytes /= 1024;
        $factor++;
    }
    return round($bytes, $decimals) . ' ' . $units[$factor];
}
