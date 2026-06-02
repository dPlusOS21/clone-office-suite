<?php
/**
 * OneDrive Clone - API File Manager
 * Gestisce operazioni file, cartelle, ricerca, cestino
 */

require_once __DIR__ . '/../backend/storage.php';

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(200); exit; }

$AUTH_USER = requireAuth();

// ==================== CONFIGURAZIONE ====================
define('BASE_DIR', realpath(__DIR__ . '/..'));
define('ONEDRIVE_FILES_DIR', __DIR__ . '/files');
define('TRASH_DIR', __DIR__ . '/trash');
define('ONEDRIVE_DB_PATH', __DIR__ . '/onedrive_data.db');
define('MAX_UPLOAD_SIZE', 100 * 1024 * 1024); // 100MB

// Cartelle virtuali mappate allo storage utente
$uid = (int)$AUTH_USER['id'];
$VIRTUAL_ROOTS = [
    'I miei file' => getUserStorageDir($uid, 'onedrive'),
    'Documenti Word' => getUserStorageDir($uid, 'word'),
    'Fogli Excel' => getUserStorageDir($uid, 'excel'),
    'Presentazioni' => getUserStorageDir($uid, 'powerpoint'),
    'Blocchi OneNote' => getUserStorageDir($uid, 'onenote'),
];

// Crea directory se non esistono
foreach ($VIRTUAL_ROOTS as $name => $path) {
    if (!is_dir($path)) @mkdir($path, 0755, true);
}
if (!is_dir(TRASH_DIR)) @mkdir(TRASH_DIR, 0755, true);

// ==================== DATABASE ====================
$pdo = new PDO('sqlite:' . ONEDRIVE_DB_PATH);
$pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
$pdo->exec('PRAGMA journal_mode=WAL');
$pdo->exec('
    CREATE TABLE IF NOT EXISTS favorites (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        path TEXT NOT NULL UNIQUE,
        added_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS recent (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        path TEXT NOT NULL,
        name TEXT NOT NULL,
        action TEXT DEFAULT "open",
        accessed_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS trash (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        original_path TEXT NOT NULL,
        trash_name TEXT NOT NULL,
        original_name TEXT NOT NULL,
        size INTEGER DEFAULT 0,
        deleted_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS shares (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        path TEXT NOT NULL,
        token TEXT NOT NULL UNIQUE,
        expires_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_recent_date ON recent(accessed_at DESC);
    CREATE INDEX IF NOT EXISTS idx_trash_date ON trash(deleted_at DESC);
    CREATE INDEX IF NOT EXISTS idx_shares_token ON shares(token);
');

// ==================== ROUTING ====================
$input = json_decode(file_get_contents('php://input'), true) ?: $_POST;
// Merge GET params so that apiCall() query string params are available too
$input = array_merge($_GET, $input);
$action = $input['action'] ?? '';

// Download diretto via GET
if ($action === 'download' && isset($_GET['path'])) {
    downloadFile($_GET['path']);
    exit;
}

// Preview PDF inline (Content-Disposition: inline)
if ($action === 'preview_pdf' && isset($_GET['path'])) {
    previewPdfInline($_GET['path']);
    exit;
}

// Upload via multipart
if ($action === 'upload' || !empty($_FILES)) {
    $input['action'] = 'upload';
    $action = 'upload';
}

try {
    $result = handleAction($action, $input, $pdo);
    echo json_encode(['success' => true, 'data' => $result], JSON_UNESCAPED_UNICODE);
} catch (Exception $e) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => $e->getMessage()], JSON_UNESCAPED_UNICODE);
}

function handleAction($action, $input, $pdo) {
    global $VIRTUAL_ROOTS, $AUTH_USER;
    switch ($action) {
        case 'list': return listFiles($input, $VIRTUAL_ROOTS);
        case 'list_roots': return listRoots($VIRTUAL_ROOTS);
        case 'upload': return uploadFiles($input, $VIRTUAL_ROOTS, $AUTH_USER);
        case 'download': return ['url' => 'api.php?action=download&path=' . urlencode($input['path'] ?? '')];
        case 'create_folder': return createFolder($input, $VIRTUAL_ROOTS);
        case 'rename': return renameItem($input, $VIRTUAL_ROOTS);
        case 'delete': return deleteItem($input, $VIRTUAL_ROOTS, $pdo);
        case 'move': return moveItem($input, $VIRTUAL_ROOTS);
        case 'copy': return copyItem($input, $VIRTUAL_ROOTS);
        case 'search': return searchFiles($input, $VIRTUAL_ROOTS);
        case 'info': return fileInfo($input, $VIRTUAL_ROOTS);
        case 'preview': return filePreview($input, $VIRTUAL_ROOTS);

        // Preferiti
        case 'favorite_add': return favoriteAdd($input, $pdo);
        case 'favorite_remove': return favoriteRemove($input, $pdo);
        case 'favorite_list': return favoriteList($pdo, $VIRTUAL_ROOTS);

        // Recenti
        case 'recent_list': return recentList($pdo);
        case 'recent_add': return recentAdd($input, $pdo);

        // Cestino
        case 'trash_list': return trashList($pdo);
        case 'trash_restore': return trashRestore($input, $pdo, $VIRTUAL_ROOTS);
        case 'trash_empty': return trashEmpty($pdo);
        case 'trash_delete': return trashDeletePermanent($input, $pdo);

        // Condivisione
        case 'share_create': return shareCreate($input, $pdo);
        case 'share_list': return shareList($pdo);
        case 'share_delete': return shareDelete($input, $pdo);

        // Statistiche
        case 'storage_stats': return storageStats($VIRTUAL_ROOTS);

        default: throw new Exception("Azione non valida: $action");
    }
}

// ==================== FILE OPERATIONS ====================

function resolvePath($virtualPath, $roots) {
    $virtualPath = str_replace('\\', '/', $virtualPath);
    $virtualPath = trim($virtualPath, '/');

    if (empty($virtualPath)) return null;

    $parts = explode('/', $virtualPath);
    $rootName = $parts[0];

    if (!isset($roots[$rootName])) throw new Exception("Percorso non valido: $rootName");

    $rootPath = $roots[$rootName];
    $subPath = implode('/', array_slice($parts, 1));
    $fullPath = $rootPath . ($subPath ? '/' . $subPath : '');

    // Previeni path traversal
    $real = realpath($fullPath);
    $rootReal = realpath($rootPath);
    if ($real === false) {
        // File potrebbe non esistere ancora (es. nuovo file)
        $parentReal = realpath(dirname($fullPath));
        if ($parentReal === false || strpos($parentReal, $rootReal) !== 0) {
            throw new Exception('Percorso non consentito');
        }
        return $fullPath;
    }
    if (strpos($real, $rootReal) !== 0) {
        throw new Exception('Percorso non consentito');
    }

    return $real ?: $fullPath;
}

function listRoots($roots) {
    $result = [];
    foreach ($roots as $name => $path) {
        $fileCount = 0;
        $totalSize = 0;
        if (is_dir($path)) {
            $iter = new RecursiveIteratorIterator(
                new RecursiveDirectoryIterator($path, RecursiveDirectoryIterator::SKIP_DOTS),
                RecursiveIteratorIterator::LEAVES_ONLY
            );
            foreach ($iter as $file) {
                if ($file->isFile()) {
                    $fileCount++;
                    $totalSize += $file->getSize();
                }
            }
        }
        $result[] = [
            'name' => $name,
            'path' => $name,
            'type' => 'folder',
            'icon' => getRootIcon($name),
            'color' => getRootColor($name),
            'file_count' => $fileCount,
            'total_size' => $totalSize,
        ];
    }
    return $result;
}

function listFiles($input, $roots) {
    $path = $input['path'] ?? '';
    $sort = $input['sort'] ?? 'name';
    $order = $input['order'] ?? 'asc';

    if (empty($path)) {
        return listRoots($roots);
    }

    $realPath = resolvePath($path, $roots);
    if (!is_dir($realPath)) throw new Exception('Cartella non trovata');

    $items = [];
    $entries = scandir($realPath);

    foreach ($entries as $entry) {
        if ($entry === '.' || $entry === '..') continue;
        // Nascondi file di sistema
        if (in_array($entry, ['.htaccess', 'Thumbs.db', '.DS_Store', 'desktop.ini'])) continue;
        // Nascondi file PHP e DB nella cartella Excel
        if (preg_match('/\.(php|db|bak)$/', $entry)) continue;

        $fullPath = $realPath . '/' . $entry;
        $isDir = is_dir($fullPath);
        $stat = @stat($fullPath);

        $item = [
            'name' => $entry,
            'path' => $path . '/' . $entry,
            'type' => $isDir ? 'folder' : 'file',
            'size' => $isDir ? 0 : ($stat['size'] ?? 0),
            'modified' => date('Y-m-d H:i:s', $stat['mtime'] ?? time()),
            'created' => date('Y-m-d H:i:s', $stat['ctime'] ?? time()),
        ];

        if (!$isDir) {
            $ext = strtolower(pathinfo($entry, PATHINFO_EXTENSION));
            $item['extension'] = $ext;
            $item['mime'] = getMimeType($ext);
            $item['icon'] = getFileIconClass($ext);
            $item['app'] = getAssociatedApp($ext);
        } else {
            $item['icon'] = 'fa-folder';
        }

        $items[] = $item;
    }

    // Ordinamento: cartelle prima, poi file
    usort($items, function($a, $b) use ($sort, $order) {
        // Cartelle sempre prima
        if ($a['type'] !== $b['type']) return $a['type'] === 'folder' ? -1 : 1;

        $cmp = 0;
        switch ($sort) {
            case 'name': $cmp = strcasecmp($a['name'], $b['name']); break;
            case 'size': $cmp = ($a['size'] ?? 0) - ($b['size'] ?? 0); break;
            case 'modified': $cmp = strcmp($a['modified'] ?? '', $b['modified'] ?? ''); break;
            case 'type': $cmp = strcasecmp($a['extension'] ?? '', $b['extension'] ?? ''); break;
        }
        return $order === 'desc' ? -$cmp : $cmp;
    });

    return [
        'items' => $items,
        'path' => $path,
        'breadcrumb' => explode('/', $path),
    ];
}

function uploadFiles($input, $roots, $authUser = null) {
    $targetPath = $input['path'] ?? $_POST['path'] ?? 'I miei file';
    $realPath = resolvePath($targetPath, $roots);

    if (!is_dir($realPath)) throw new Exception('Cartella destinazione non trovata');

    // Calcola dimensione totale upload
    $totalSize = 0;
    if (!empty($_FILES['files'])) {
        $files = $_FILES['files'];
        $count = is_array($files['name']) ? count($files['name']) : 1;
        for ($i = 0; $i < $count; $i++) {
            $size = is_array($files['size']) ? $files['size'][$i] : $files['size'];
            $totalSize += $size;
        }
    }

    // Verifica quota se utente autenticato
    if ($authUser && !empty($authUser['id'])) {
        $quota = checkStorageQuota((int)$authUser['id'], $totalSize);
        if (!$quota['allowed']) {
            throw new Exception($quota['message']);
        }
    }

    $uploaded = [];
    if (!empty($_FILES['files'])) {
        $files = $_FILES['files'];
        $count = is_array($files['name']) ? count($files['name']) : 1;

        for ($i = 0; $i < $count; $i++) {
            $name = is_array($files['name']) ? $files['name'][$i] : $files['name'];
            $tmp = is_array($files['tmp_name']) ? $files['tmp_name'][$i] : $files['tmp_name'];
            $error = is_array($files['error']) ? $files['error'][$i] : $files['error'];
            $size = is_array($files['size']) ? $files['size'][$i] : $files['size'];

            if ($error !== UPLOAD_ERR_OK) continue;
            if ($size > MAX_UPLOAD_SIZE) {
                $uploaded[] = ['name' => $name, 'error' => 'File troppo grande (max 100MB)'];
                continue;
            }

            // Sanitizza nome file
            $safeName = preg_replace('/[^\w\s\-\.\(\)]/', '_', $name);
            $safeName = trim($safeName);
            if (empty($safeName)) $safeName = 'file_' . time();

            // Se esiste gia', aggiungi numero
            $dest = $realPath . '/' . $safeName;
            if (file_exists($dest)) {
                $base = pathinfo($safeName, PATHINFO_FILENAME);
                $ext = pathinfo($safeName, PATHINFO_EXTENSION);
                $counter = 1;
                while (file_exists($dest)) {
                    $safeName = $base . " ($counter)" . ($ext ? ".$ext" : '');
                    $dest = $realPath . '/' . $safeName;
                    $counter++;
                }
            }

            if (move_uploaded_file($tmp, $dest)) {
                $uploaded[] = ['name' => $safeName, 'size' => $size, 'path' => $targetPath . '/' . $safeName];
            } else {
                $uploaded[] = ['name' => $name, 'error' => 'Errore nel salvataggio'];
            }
        }
    }

    return ['uploaded' => $uploaded, 'count' => count($uploaded)];
}

function downloadFile($virtualPath) {
    global $VIRTUAL_ROOTS;
    try {
        $realPath = resolvePath($virtualPath, $VIRTUAL_ROOTS);
        if (!is_file($realPath)) { http_response_code(404); echo 'File non trovato'; exit; }

        $name = basename($realPath);
        $ext = strtolower(pathinfo($name, PATHINFO_EXTENSION));
        $mime = getMimeType($ext);

        header('Content-Type: ' . $mime);
        header('Content-Disposition: attachment; filename="' . $name . '"');
        header('Content-Length: ' . filesize($realPath));
        header('Cache-Control: no-cache');
        readfile($realPath);
    } catch (Exception $e) {
        http_response_code(400);
        echo $e->getMessage();
    }
    exit;
}

function previewPdfInline($virtualPath) {
    global $VIRTUAL_ROOTS;
    try {
        $realPath = resolvePath($virtualPath, $VIRTUAL_ROOTS);
        if (!is_file($realPath)) { http_response_code(404); echo 'File non trovato'; exit; }

        $name = basename($realPath);
        header('Content-Type: application/pdf');
        header('Content-Disposition: inline; filename="' . $name . '"');
        header('Content-Length: ' . filesize($realPath));
        header('Cache-Control: no-cache');
        readfile($realPath);
    } catch (Exception $e) {
        http_response_code(400);
        echo $e->getMessage();
    }
    exit;
}

function createFolder($input, $roots) {
    $path = $input['path'] ?? '';
    $name = $input['name'] ?? '';
    if (empty($path) || empty($name)) throw new Exception('Percorso e nome richiesti');

    $safeName = preg_replace('/[^\w\s\-\.\(\)]/', '_', $name);
    $parentPath = resolvePath($path, $roots);
    $newPath = $parentPath . '/' . $safeName;

    if (file_exists($newPath)) throw new Exception('Esiste gia un elemento con questo nome');
    if (!mkdir($newPath, 0755)) throw new Exception('Impossibile creare la cartella');

    return ['path' => $path . '/' . $safeName, 'name' => $safeName];
}

function renameItem($input, $roots) {
    $path = $input['path'] ?? '';
    $newName = $input['new_name'] ?? '';
    if (empty($path) || empty($newName)) throw new Exception('Percorso e nuovo nome richiesti');

    $safeName = preg_replace('/[^\w\s\-\.\(\)]/', '_', $newName);
    $realPath = resolvePath($path, $roots);
    $newPath = dirname($realPath) . '/' . $safeName;

    if (!file_exists($realPath)) throw new Exception('File non trovato');
    if (file_exists($newPath)) throw new Exception('Esiste gia un elemento con questo nome');
    if (!rename($realPath, $newPath)) throw new Exception('Impossibile rinominare');

    $parts = explode('/', $path);
    array_pop($parts);
    $parts[] = $safeName;
    return ['path' => implode('/', $parts), 'name' => $safeName];
}

function deleteItem($input, $roots, $pdo) {
    $path = $input['path'] ?? '';
    $permanent = $input['permanent'] ?? false;
    if (empty($path)) throw new Exception('Percorso richiesto');

    $realPath = resolvePath($path, $roots);
    if (!file_exists($realPath)) throw new Exception('File non trovato');

    $name = basename($realPath);

    if ($permanent) {
        if (is_dir($realPath)) {
            deleteDirectory($realPath);
        } else {
            unlink($realPath);
        }
        return ['deleted' => true, 'permanent' => true];
    }

    // Sposta nel cestino
    $trashName = time() . '_' . $name;
    $trashPath = TRASH_DIR . '/' . $trashName;

    if (is_dir($realPath)) {
        renameRecursive($realPath, $trashPath);
    } else {
        rename($realPath, $trashPath);
    }

    $size = is_file($trashPath) ? filesize($trashPath) : dirSize($trashPath);
    $pdo->prepare('INSERT INTO trash (original_path, trash_name, original_name, size) VALUES (?, ?, ?, ?)')
        ->execute([$path, $trashName, $name, $size]);

    return ['deleted' => true, 'recoverable' => true];
}

function moveItem($input, $roots) {
    $from = $input['from'] ?? '';
    $to = $input['to'] ?? '';
    if (empty($from) || empty($to)) throw new Exception('Origine e destinazione richiesti');

    $realFrom = resolvePath($from, $roots);
    $realTo = resolvePath($to, $roots);

    if (!file_exists($realFrom)) throw new Exception('File origine non trovato');
    if (!is_dir($realTo)) throw new Exception('Cartella destinazione non trovata');

    $name = basename($realFrom);
    $dest = $realTo . '/' . $name;
    if (file_exists($dest)) {
        $base = pathinfo($name, PATHINFO_FILENAME);
        $ext = pathinfo($name, PATHINFO_EXTENSION);
        $dest = $realTo . '/' . $base . ' (copia)' . ($ext ? ".$ext" : '');
    }

    if (!rename($realFrom, $dest)) throw new Exception('Impossibile spostare il file');
    return ['moved' => true];
}

function copyItem($input, $roots) {
    $from = $input['from'] ?? '';
    $to = $input['to'] ?? '';
    if (empty($from) || empty($to)) throw new Exception('Origine e destinazione richiesti');

    $realFrom = resolvePath($from, $roots);
    $realTo = resolvePath($to, $roots);

    if (!file_exists($realFrom)) throw new Exception('File origine non trovato');

    $name = basename($realFrom);
    $base = pathinfo($name, PATHINFO_FILENAME);
    $ext = pathinfo($name, PATHINFO_EXTENSION);
    $dest = $realTo . '/' . $base . ' - Copia' . ($ext ? ".$ext" : '');

    if (is_dir($realFrom)) {
        copyDirectory($realFrom, $dest);
    } else {
        copy($realFrom, $dest);
    }

    return ['copied' => true];
}

function searchFiles($input, $roots) {
    $query = $input['query'] ?? '';
    $rootFilter = $input['root'] ?? null;
    if (empty($query)) return ['results' => []];

    $results = [];
    $q = strtolower($query);

    $searchRoots = $rootFilter ? [$rootFilter => $roots[$rootFilter]] : $roots;

    foreach ($searchRoots as $rootName => $rootPath) {
        if (!is_dir($rootPath)) continue;
        try {
            $iter = new RecursiveIteratorIterator(
                new RecursiveDirectoryIterator($rootPath, RecursiveDirectoryIterator::SKIP_DOTS),
                RecursiveIteratorIterator::SELF_FIRST
            );
            foreach ($iter as $file) {
                $name = $file->getFilename();
                if (preg_match('/\.(php|db|bak|htaccess)$/i', $name)) continue;
                if (stripos($name, $query) !== false) {
                    $relPath = $rootName . '/' . substr($file->getPathname(), strlen($rootPath) + 1);
                    $results[] = [
                        'name' => $name,
                        'path' => str_replace('\\', '/', $relPath),
                        'type' => $file->isDir() ? 'folder' : 'file',
                        'size' => $file->isDir() ? 0 : $file->getSize(),
                        'modified' => date('Y-m-d H:i:s', $file->getMTime()),
                        'extension' => $file->isDir() ? '' : strtolower($file->getExtension()),
                        'icon' => $file->isDir() ? 'fa-folder' : getFileIconClass(strtolower($file->getExtension())),
                        'root' => $rootName,
                    ];
                }
                if (count($results) >= 100) break 2;
            }
        } catch (Exception $e) { continue; }
    }

    return ['results' => $results, 'query' => $query];
}

function fileInfo($input, $roots) {
    $path = $input['path'] ?? '';
    if (empty($path)) throw new Exception('Percorso richiesto');

    $realPath = resolvePath($path, $roots);
    if (!file_exists($realPath)) throw new Exception('File non trovato');

    $stat = stat($realPath);
    $isDir = is_dir($realPath);
    $name = basename($realPath);

    $info = [
        'name' => $name,
        'path' => $path,
        'type' => $isDir ? 'folder' : 'file',
        'size' => $isDir ? dirSize($realPath) : $stat['size'],
        'created' => date('Y-m-d H:i:s', $stat['ctime']),
        'modified' => date('Y-m-d H:i:s', $stat['mtime']),
        'permissions' => substr(sprintf('%o', fileperms($realPath)), -4),
    ];

    if (!$isDir) {
        $ext = strtolower(pathinfo($name, PATHINFO_EXTENSION));
        $info['extension'] = $ext;
        $info['mime'] = getMimeType($ext);
    } else {
        $info['item_count'] = count(array_diff(scandir($realPath), ['.', '..']));
    }

    return $info;
}

function filePreview($input, $roots) {
    $path = $input['path'] ?? '';
    if (empty($path)) throw new Exception('Percorso richiesto');

    $realPath = resolvePath($path, $roots);
    if (!is_file($realPath)) throw new Exception('File non trovato');

    $ext = strtolower(pathinfo($realPath, PATHINFO_EXTENSION));
    $size = filesize($realPath);

    // Anteprima testo
    if (in_array($ext, ['txt', 'md', 'csv', 'log', 'ini', 'cfg', 'xml', 'svg', 'css', 'js', 'php', 'py', 'java', 'c', 'cpp', 'h', 'sh', 'bat', 'sql'])) {
        $content = file_get_contents($realPath, false, null, 0, min($size, 50000));
        return ['type' => 'text', 'content' => $content, 'truncated' => $size > 50000];
    }

    // JSON
    if ($ext === 'json') {
        $content = file_get_contents($realPath, false, null, 0, min($size, 50000));
        return ['type' => 'json', 'content' => $content, 'truncated' => $size > 50000];
    }

    // HTML
    if (in_array($ext, ['html', 'htm'])) {
        $content = file_get_contents($realPath, false, null, 0, min($size, 100000));
        return ['type' => 'html', 'content' => $content];
    }

    // Immagini
    if (in_array($ext, ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'ico', 'svg'])) {
        if ($ext === 'svg') {
            return ['type' => 'image', 'src' => 'data:image/svg+xml;base64,' . base64_encode(file_get_contents($realPath))];
        }
        $mime = getMimeType($ext);
        $data = base64_encode(file_get_contents($realPath));
        return ['type' => 'image', 'src' => "data:$mime;base64,$data"];
    }

    // PDF
    if ($ext === 'pdf') {
        return ['type' => 'pdf', 'url' => 'api.php?action=preview_pdf&path=' . urlencode($path)];
    }

    return ['type' => 'unsupported', 'extension' => $ext];
}

// ==================== FAVORITES ====================
function favoriteAdd($input, $pdo) {
    $path = $input['path'] ?? '';
    if (empty($path)) throw new Exception('Percorso richiesto');
    $pdo->prepare('INSERT OR IGNORE INTO favorites (path) VALUES (?)')->execute([$path]);
    return ['added' => true];
}

function favoriteRemove($input, $pdo) {
    $path = $input['path'] ?? '';
    $pdo->prepare('DELETE FROM favorites WHERE path = ?')->execute([$path]);
    return ['removed' => true];
}

function favoriteList($pdo, $roots) {
    $stmt = $pdo->query('SELECT * FROM favorites ORDER BY added_at DESC');
    $favs = $stmt->fetchAll(PDO::FETCH_ASSOC);
    $result = [];
    foreach ($favs as $fav) {
        try {
            $realPath = resolvePath($fav['path'], $roots);
            if (file_exists($realPath)) {
                $name = basename($realPath);
                $isDir = is_dir($realPath);
                $ext = $isDir ? '' : strtolower(pathinfo($name, PATHINFO_EXTENSION));
                $result[] = [
                    'name' => $name,
                    'path' => $fav['path'],
                    'type' => $isDir ? 'folder' : 'file',
                    'size' => $isDir ? 0 : filesize($realPath),
                    'icon' => $isDir ? 'fa-folder' : getFileIconClass($ext),
                    'added_at' => $fav['added_at'],
                ];
            }
        } catch (Exception $e) { continue; }
    }
    return $result;
}

// ==================== RECENT ====================
function recentList($pdo) {
    $stmt = $pdo->query('SELECT * FROM recent ORDER BY accessed_at DESC LIMIT 50');
    return $stmt->fetchAll(PDO::FETCH_ASSOC);
}

function recentAdd($input, $pdo) {
    $path = $input['path'] ?? '';
    $name = $input['name'] ?? basename($path);
    if (empty($path)) return ['ok' => true];
    // Rimuovi duplicato vecchio
    $pdo->prepare('DELETE FROM recent WHERE path = ?')->execute([$path]);
    $pdo->prepare('INSERT INTO recent (path, name) VALUES (?, ?)')->execute([$path, $name]);
    // Limita a 100 voci
    $pdo->exec('DELETE FROM recent WHERE id NOT IN (SELECT id FROM recent ORDER BY accessed_at DESC LIMIT 100)');
    return ['added' => true];
}

// ==================== TRASH ====================
function trashList($pdo) {
    $stmt = $pdo->query('SELECT * FROM trash ORDER BY deleted_at DESC');
    return $stmt->fetchAll(PDO::FETCH_ASSOC);
}

function trashRestore($input, $pdo, $roots) {
    $id = $input['id'] ?? null;
    if (!$id) throw new Exception('ID richiesto');

    $stmt = $pdo->prepare('SELECT * FROM trash WHERE id = ?');
    $stmt->execute([$id]);
    $item = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$item) throw new Exception('Elemento non trovato nel cestino');

    $trashPath = TRASH_DIR . '/' . $item['trash_name'];
    if (!file_exists($trashPath)) throw new Exception('File nel cestino non trovato');

    try {
        $originalReal = resolvePath($item['original_path'], $roots);
        $dir = dirname($originalReal);
        if (!is_dir($dir)) @mkdir($dir, 0755, true);

        if (file_exists($originalReal)) {
            // Se esiste gia, aggiungi suffisso
            $base = pathinfo($originalReal, PATHINFO_FILENAME);
            $ext = pathinfo($originalReal, PATHINFO_EXTENSION);
            $originalReal = $dir . '/' . $base . ' (ripristinato)' . ($ext ? ".$ext" : '');
        }

        rename($trashPath, $originalReal);
        $pdo->prepare('DELETE FROM trash WHERE id = ?')->execute([$id]);
        return ['restored' => true];
    } catch (Exception $e) {
        throw new Exception('Impossibile ripristinare: ' . $e->getMessage());
    }
}

function trashEmpty($pdo) {
    // Elimina tutti i file dal cestino
    $files = glob(TRASH_DIR . '/*');
    foreach ($files as $f) {
        if (is_dir($f)) deleteDirectory($f);
        else unlink($f);
    }
    $pdo->exec('DELETE FROM trash');
    return ['emptied' => true];
}

function trashDeletePermanent($input, $pdo) {
    $id = $input['id'] ?? null;
    if (!$id) throw new Exception('ID richiesto');

    $stmt = $pdo->prepare('SELECT trash_name FROM trash WHERE id = ?');
    $stmt->execute([$id]);
    $item = $stmt->fetch(PDO::FETCH_ASSOC);
    if ($item) {
        $path = TRASH_DIR . '/' . $item['trash_name'];
        if (file_exists($path)) {
            if (is_dir($path)) deleteDirectory($path);
            else unlink($path);
        }
        $pdo->prepare('DELETE FROM trash WHERE id = ?')->execute([$id]);
    }
    return ['deleted' => true];
}

// ==================== SHARING ====================
function shareCreate($input, $pdo) {
    $path = $input['path'] ?? '';
    if (empty($path)) throw new Exception('Percorso richiesto');
    $token = bin2hex(random_bytes(16));
    $expires = $input['expires_hours'] ? date('Y-m-d H:i:s', time() + ($input['expires_hours'] * 3600)) : null;
    $pdo->prepare('INSERT INTO shares (path, token, expires_at) VALUES (?, ?, ?)')->execute([$path, $token, $expires]);
    return ['token' => $token, 'url' => 'api.php?action=download&path=' . urlencode($path)];
}

function shareList($pdo) {
    $stmt = $pdo->query('SELECT * FROM shares ORDER BY created_at DESC');
    return $stmt->fetchAll(PDO::FETCH_ASSOC);
}

function shareDelete($input, $pdo) {
    $id = $input['id'] ?? null;
    if ($id) $pdo->prepare('DELETE FROM shares WHERE id = ?')->execute([$id]);
    return ['deleted' => true];
}

// ==================== STORAGE STATS ====================
function storageStats($roots) {
    $stats = [];
    $totalSize = 0;
    $totalFiles = 0;

    foreach ($roots as $name => $path) {
        $size = 0;
        $files = 0;
        if (is_dir($path)) {
            try {
                $iter = new RecursiveIteratorIterator(
                    new RecursiveDirectoryIterator($path, RecursiveDirectoryIterator::SKIP_DOTS),
                    RecursiveIteratorIterator::LEAVES_ONLY
                );
                foreach ($iter as $file) {
                    if ($file->isFile() && !preg_match('/\.(php|db|bak)$/i', $file->getFilename())) {
                        $files++;
                        $size += $file->getSize();
                    }
                }
            } catch (Exception $e) {}
        }
        $stats[] = [
            'name' => $name,
            'size' => $size,
            'files' => $files,
            'color' => getRootColor($name),
        ];
        $totalSize += $size;
        $totalFiles += $files;
    }

    // Cestino
    $trashSize = is_dir(TRASH_DIR) ? dirSize(TRASH_DIR) : 0;

    return [
        'roots' => $stats,
        'total_size' => $totalSize,
        'total_files' => $totalFiles,
        'trash_size' => $trashSize,
    ];
}

// ==================== HELPERS ====================

function deleteDirectory($dir) {
    $files = array_diff(scandir($dir), ['.', '..']);
    foreach ($files as $file) {
        $path = "$dir/$file";
        is_dir($path) ? deleteDirectory($path) : unlink($path);
    }
    return rmdir($dir);
}

function copyDirectory($src, $dst) {
    mkdir($dst, 0755);
    $dir = opendir($src);
    while (($file = readdir($dir)) !== false) {
        if ($file === '.' || $file === '..') continue;
        $srcPath = "$src/$file";
        $dstPath = "$dst/$file";
        if (is_dir($srcPath)) copyDirectory($srcPath, $dstPath);
        else copy($srcPath, $dstPath);
    }
    closedir($dir);
}

function renameRecursive($from, $to) {
    if (!rename($from, $to) && is_dir($from)) {
        mkdir($to, 0755);
        foreach (scandir($from) as $f) {
            if ($f === '.' || $f === '..') continue;
            renameRecursive("$from/$f", "$to/$f");
        }
        rmdir($from);
    }
}

function dirSize($dir) {
    $size = 0;
    if (!is_dir($dir)) return 0;
    try {
        $iter = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($dir, RecursiveDirectoryIterator::SKIP_DOTS));
        foreach ($iter as $file) { if ($file->isFile()) $size += $file->getSize(); }
    } catch (Exception $e) {}
    return $size;
}

function getMimeType($ext) {
    $types = [
        'txt' => 'text/plain', 'html' => 'text/html', 'htm' => 'text/html', 'css' => 'text/css',
        'js' => 'application/javascript', 'json' => 'application/json', 'xml' => 'application/xml',
        'csv' => 'text/csv', 'md' => 'text/markdown',
        'jpg' => 'image/jpeg', 'jpeg' => 'image/jpeg', 'png' => 'image/png', 'gif' => 'image/gif',
        'webp' => 'image/webp', 'svg' => 'image/svg+xml', 'ico' => 'image/x-icon', 'bmp' => 'image/bmp',
        'pdf' => 'application/pdf',
        'doc' => 'application/msword', 'docx' => 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'xls' => 'application/vnd.ms-excel', 'xlsx' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'ppt' => 'application/vnd.ms-powerpoint', 'pptx' => 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'zip' => 'application/zip', 'rar' => 'application/x-rar-compressed', '7z' => 'application/x-7z-compressed',
        'tar' => 'application/x-tar', 'gz' => 'application/gzip',
        'mp3' => 'audio/mpeg', 'wav' => 'audio/wav', 'ogg' => 'audio/ogg', 'mp4' => 'video/mp4',
        'avi' => 'video/x-msvideo', 'mkv' => 'video/x-matroska', 'webm' => 'video/webm',
    ];
    return $types[$ext] ?? 'application/octet-stream';
}

function getFileIconClass($ext) {
    $map = [
        'fa-file-word' => ['doc', 'docx', 'odt', 'rtf'],
        'fa-file-excel' => ['xls', 'xlsx', 'ods', 'csv'],
        'fa-file-powerpoint' => ['ppt', 'pptx', 'odp'],
        'fa-file-pdf' => ['pdf'],
        'fa-file-image' => ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'ico', 'tiff'],
        'fa-file-video' => ['mp4', 'avi', 'mkv', 'webm', 'mov', 'wmv'],
        'fa-file-audio' => ['mp3', 'wav', 'ogg', 'flac', 'aac', 'wma'],
        'fa-file-archive' => ['zip', 'rar', '7z', 'tar', 'gz', 'bz2'],
        'fa-file-code' => ['html', 'htm', 'css', 'js', 'php', 'py', 'java', 'c', 'cpp', 'h', 'sh', 'sql', 'xml'],
        'fa-file-alt' => ['txt', 'md', 'log', 'ini', 'cfg', 'json'],
    ];
    foreach ($map as $icon => $exts) {
        if (in_array($ext, $exts)) return $icon;
    }
    return 'fa-file';
}

function getAssociatedApp($ext) {
    $apps = [
        'word' => ['doc', 'docx', 'odt', 'rtf', 'html', 'htm'],
        'excel' => ['xls', 'xlsx', 'ods', 'csv', 'json'],
        'powerpoint' => ['ppt', 'pptx', 'odp'],
        'onenote' => [],
    ];
    foreach ($apps as $app => $exts) {
        if (in_array($ext, $exts)) return $app;
    }
    return null;
}

function getRootIcon($name) {
    $map = [
        'I miei file' => 'fa-cloud',
        'Documenti Word' => 'fa-file-word',
        'Fogli Excel' => 'fa-file-excel',
        'Presentazioni' => 'fa-file-powerpoint',
        'Blocchi OneNote' => 'fa-book-open',
    ];
    return $map[$name] ?? 'fa-folder';
}

function getRootColor($name) {
    $map = [
        'I miei file' => '#0078d4',
        'Documenti Word' => '#2564c1',
        'Fogli Excel' => '#217346',
        'Presentazioni' => '#d04423',
        'Blocchi OneNote' => '#7b1fa2',
    ];
    return $map[$name] ?? '#666';
}
