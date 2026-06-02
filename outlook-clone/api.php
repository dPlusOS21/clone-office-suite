<?php
/**
 * Outlook Clone - API REST
 * Gestisce IMAP, SMTP, e operazioni database
 */

// Fuso orario esplicito: evita il warning/crash di PHP su date()
date_default_timezone_set('Europe/Rome');

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

require_once __DIR__ . '/db.php';
require_once __DIR__ . '/../backend/storage.php';

// Autenticazione obbligatoria: blocca le richieste anonime (401).
$AUTH_USER = requireAuth();
$UID = (int)$AUTH_USER['id'];

// Database PER-UTENTE: ogni utente ha il proprio file SQLite isolato.
// Così nessun utente può vedere account/email/contatti di un altro.
$outlookDir = getUserStorageDir($UID, 'outlook');
$db = OutlookDB::getInstance($outlookDir . '/outlook_data.db');
$pdo = $db->getDb();

$input = json_decode(file_get_contents('php://input'), true) ?: $_POST;
$action = $input['action'] ?? $_GET['action'] ?? '';

try {
    $result = handleAction($action, $input, $pdo, $db);
    echo json_encode(['success' => true, 'data' => $result]);
} catch (Exception $e) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => $e->getMessage()]);
}

function handleAction($action, $input, $pdo, $db) {
    switch ($action) {
        // ===== ACCOUNT =====
        case 'account_list':
            return accountList($pdo);
        case 'account_add':
            return accountAdd($input, $pdo, $db);
        case 'account_update':
            return accountUpdate($input, $pdo);
        case 'account_delete':
            return accountDelete($input, $pdo);
        case 'account_test':
            return accountTest($input);

        // ===== CARTELLE =====
        case 'folder_list':
            return folderList($input, $pdo);
        case 'folder_create':
            return folderCreate($input, $pdo);
        case 'folder_delete':
            return folderDelete($input, $pdo);
        case 'folder_sync':
            return folderSyncFromServer($input, $pdo, $db);

        // ===== EMAIL =====
        case 'email_fetch':
            return emailFetch($input, $pdo, $db);
        case 'email_list':
            return emailList($input, $pdo);
        case 'email_get':
            return emailGet($input, $pdo);
        case 'email_delete':
            return emailDelete($input, $pdo);
        case 'email_move':
            return emailMove($input, $pdo, $db);
        case 'email_mark_read':
            return emailMarkRead($input, $pdo, $db);
        case 'email_star':
            return emailStar($input, $pdo);
        case 'email_search':
            return emailSearch($input, $pdo);
        case 'email_send':
            return emailSend($input, $pdo, $db);
        case 'email_save_draft':
            return emailSaveDraft($input, $pdo, $db);
        case 'email_delete_server':
            return emailDeleteFromServer($input, $pdo);

        // ===== CONTATTI =====
        case 'contact_list':
            return contactList($input, $pdo);
        case 'contact_add':
            return contactAdd($input, $pdo);
        case 'contact_update':
            return contactUpdate($input, $pdo);
        case 'contact_delete':
            return contactDelete($input, $pdo);

        // ===== IMPOSTAZIONI =====
        case 'settings_get':
            return settingsGet($pdo);
        case 'settings_set':
            return settingsSet($input, $pdo);

        // ===== ATTACHMENT =====
        case 'attachment_get':
            return attachmentGet($input, $pdo);

        default:
            throw new Exception("Azione non valida: $action");
    }
}

// ==================== ACCOUNT ====================

function accountList($pdo) {
    $stmt = $pdo->query('SELECT id, name, email, imap_host, imap_port, imap_encryption, smtp_host, smtp_port, smtp_encryption, username, delete_from_server, is_default, signature, last_sync, created_at FROM accounts ORDER BY is_default DESC, name');
    return $stmt->fetchAll(PDO::FETCH_ASSOC);
}

function accountAdd($input, $pdo, $db) {
    $required = ['name', 'email', 'imap_host', 'smtp_host', 'username', 'password'];
    foreach ($required as $f) {
        if (empty($input[$f])) throw new Exception("Campo obbligatorio mancante: $f");
    }

    $encPass = OutlookDB::encryptPassword($input['password']);

    // Se e' il primo account, impostalo come default
    $count = $pdo->query('SELECT COUNT(*) FROM accounts')->fetchColumn();
    $isDefault = ($count == 0) ? 1 : ($input['is_default'] ?? 0);

    if ($isDefault) {
        $pdo->exec('UPDATE accounts SET is_default = 0');
    }

    $stmt = $pdo->prepare('INSERT INTO accounts (name, email, imap_host, imap_port, imap_encryption, smtp_host, smtp_port, smtp_encryption, username, password_enc, delete_from_server, is_default, signature) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    $stmt->execute([
        $input['name'],
        $input['email'],
        $input['imap_host'],
        $input['imap_port'] ?? 993,
        $input['imap_encryption'] ?? 'ssl',
        $input['smtp_host'],
        $input['smtp_port'] ?? 587,
        $input['smtp_encryption'] ?? 'tls',
        $input['username'],
        $encPass,
        $input['delete_from_server'] ?? 0,
        $isDefault,
        $input['signature'] ?? ''
    ]);

    $accountId = $pdo->lastInsertId();
    $db->createDefaultFolders($accountId);

    return ['id' => $accountId];
}

function accountUpdate($input, $pdo) {
    if (empty($input['id'])) throw new Exception('ID account mancante');

    $fields = [];
    $values = [];
    $allowed = ['name', 'email', 'imap_host', 'imap_port', 'imap_encryption', 'smtp_host', 'smtp_port', 'smtp_encryption', 'username', 'delete_from_server', 'is_default', 'signature'];

    foreach ($allowed as $f) {
        if (isset($input[$f])) {
            $fields[] = "$f = ?";
            $values[] = $input[$f];
        }
    }

    if (!empty($input['password'])) {
        $fields[] = 'password_enc = ?';
        $values[] = OutlookDB::encryptPassword($input['password']);
    }

    if (!empty($input['is_default'])) {
        $pdo->exec('UPDATE accounts SET is_default = 0');
    }

    $values[] = $input['id'];
    $pdo->prepare('UPDATE accounts SET ' . implode(', ', $fields) . ' WHERE id = ?')->execute($values);

    return ['updated' => true];
}

function accountDelete($input, $pdo) {
    if (empty($input['id'])) throw new Exception('ID account mancante');
    $pdo->prepare('DELETE FROM accounts WHERE id = ?')->execute([$input['id']]);
    return ['deleted' => true];
}

function accountTest($input) {
    $required = ['imap_host', 'imap_port', 'imap_encryption', 'username', 'password'];
    foreach ($required as $f) {
        if (empty($input[$f])) throw new Exception("Campo mancante: $f");
    }

    if (!function_exists('imap_open')) {
        throw new Exception('Estensione PHP IMAP non disponibile sul server. Contattare l\'amministratore.');
    }

    $flags = '/' . $input['imap_encryption'];
    if ($input['imap_encryption'] === 'ssl') $flags .= '/novalidate-cert';
    $mailbox = '{' . $input['imap_host'] . ':' . $input['imap_port'] . $flags . '}INBOX';

    $password = isset($input['password_enc']) ? OutlookDB::decryptPassword($input['password_enc']) : $input['password'];
    $imap = @imap_open($mailbox, $input['username'], $password, OP_READONLY | OP_HALFOPEN, 1);

    if (!$imap) {
        $err = imap_last_error();
        throw new Exception("Connessione IMAP fallita: $err");
    }

    $check = imap_check($imap);
    imap_close($imap);

    // Test SMTP
    $smtpOk = testSmtp($input);

    return [
        'imap' => true,
        'smtp' => $smtpOk,
        'messages' => $check->Nmsgs ?? 0
    ];
}

function testSmtp($input) {
    $host = $input['smtp_host'] ?? '';
    $port = $input['smtp_port'] ?? 587;
    $encryption = $input['smtp_encryption'] ?? 'tls';

    if (empty($host)) return false;

    $prefix = ($encryption === 'ssl') ? 'ssl://' : '';
    $fp = @fsockopen($prefix . $host, $port, $errno, $errstr, 10);
    if (!$fp) return false;

    $response = fgets($fp, 1024);
    if (strpos($response, '220') === false) { fclose($fp); return false; }

    fputs($fp, "EHLO localhost\r\n");
    $ehlo = '';
    while ($line = fgets($fp, 1024)) {
        $ehlo .= $line;
        if (substr($line, 3, 1) === ' ') break;
    }

    fputs($fp, "QUIT\r\n");
    fclose($fp);
    return true;
}

// ==================== CARTELLE ====================

function folderList($input, $pdo) {
    $accountId = $input['account_id'] ?? null;
    if ($accountId) {
        $stmt = $pdo->prepare('SELECT * FROM folders WHERE account_id = ? ORDER BY sort_order, name');
        $stmt->execute([$accountId]);
    } else {
        $stmt = $pdo->query('SELECT f.*, a.email as account_email FROM folders f JOIN accounts a ON f.account_id = a.id ORDER BY a.is_default DESC, f.sort_order, f.name');
    }
    return $stmt->fetchAll(PDO::FETCH_ASSOC);
}

function folderCreate($input, $pdo) {
    if (empty($input['account_id']) || empty($input['name'])) {
        throw new Exception('Account e nome cartella richiesti');
    }
    $stmt = $pdo->prepare('INSERT INTO folders (account_id, name, type, icon, sort_order) VALUES (?, ?, "custom", "fa-folder", 100)');
    $stmt->execute([$input['account_id'], $input['name']]);
    return ['id' => $pdo->lastInsertId()];
}

function folderDelete($input, $pdo) {
    if (empty($input['id'])) throw new Exception('ID cartella mancante');
    // Non eliminare cartelle di sistema
    $folder = $pdo->prepare('SELECT type FROM folders WHERE id = ?');
    $folder->execute([$input['id']]);
    $f = $folder->fetch(PDO::FETCH_ASSOC);
    if ($f && $f['type'] !== 'custom') {
        throw new Exception('Non puoi eliminare una cartella di sistema');
    }
    $pdo->prepare('DELETE FROM folders WHERE id = ? AND type = "custom"')->execute([$input['id']]);
    return ['deleted' => true];
}

function folderSyncFromServer($input, $pdo, $db) {
    $accountId = $input['account_id'] ?? null;
    if (!$accountId) throw new Exception('Account ID richiesto');

    $account = getAccount($accountId, $pdo);
    $imap = imapConnect($account);
    if (!$imap) throw new Exception('Connessione IMAP fallita');

    $folders = imap_list($imap, '{' . $account['imap_host'] . ':' . $account['imap_port'] . '/' . $account['imap_encryption'] . '}', '*');
    $result = [];

    if ($folders) {
        foreach ($folders as $folder) {
            $name = preg_replace('/^\{[^}]+\}/', '', $folder);
            $result[] = $name;
        }
    }

    imap_close($imap);
    return $result;
}

// ==================== EMAIL ====================

function emailFetch($input, $pdo, $db) {
    $accountId = $input['account_id'] ?? null;
    $folderId = $input['folder_id'] ?? null;
    $limit = $input['limit'] ?? 50;

    if (!$accountId) throw new Exception('Account ID richiesto');

    $account = getAccount($accountId, $pdo);

    if (!function_exists('imap_open')) {
        throw new Exception('Estensione PHP IMAP non disponibile');
    }

    // Determina cartella IMAP
    $imapFolder = 'INBOX';
    if ($folderId) {
        $stmt = $pdo->prepare('SELECT imap_name FROM folders WHERE id = ?');
        $stmt->execute([$folderId]);
        $f = $stmt->fetch(PDO::FETCH_ASSOC);
        if ($f && $f['imap_name']) $imapFolder = $f['imap_name'];
    } else {
        // Prendi la Posta in arrivo
        $stmt = $pdo->prepare('SELECT id, imap_name FROM folders WHERE account_id = ? AND type = "inbox" LIMIT 1');
        $stmt->execute([$accountId]);
        $f = $stmt->fetch(PDO::FETCH_ASSOC);
        if ($f) {
            $folderId = $f['id'];
            $imapFolder = $f['imap_name'] ?: 'INBOX';
        }
    }

    $imap = imapConnect($account, $imapFolder);
    if (!$imap) throw new Exception('Connessione IMAP fallita: ' . imap_last_error());

    // Ottieni UID gia' presenti nel DB per evitare duplicati
    $existingUids = [];
    $stmt = $pdo->prepare('SELECT uid FROM emails WHERE account_id = ? AND folder_id = ?');
    $stmt->execute([$accountId, $folderId]);
    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        $existingUids[$row['uid']] = true;
    }

    // Scarica email - usa PEEK per non segnarle come lette sul server
    $check = imap_check($imap);
    $totalMessages = $check->Nmsgs;
    $fetched = 0;
    $startMsg = max(1, $totalMessages - $limit + 1);

    $insertStmt = $pdo->prepare('INSERT INTO emails (account_id, folder_id, message_id, uid, from_name, from_email, to_addresses, cc_addresses, subject, body_text, body_html, date, is_read, has_attachments, priority, size) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');

    $pdo->beginTransaction();

    for ($i = $totalMessages; $i >= $startMsg && $fetched < $limit; $i--) {
        $uid = imap_uid($imap, $i);

        // Salta se gia' presente
        if (isset($existingUids[$uid])) continue;

        // PEEK: FT_PEEK non segna come letto sul server
        $header = imap_headerinfo($imap, $i);
        if (!$header) continue;

        $overview = imap_fetch_overview($imap, (string)$i, 0);
        $ov = $overview[0] ?? null;

        // Decodifica soggetto
        $subject = isset($header->subject) ? decodeMimeStr($header->subject) : '(nessun oggetto)';

        // Mittente
        $fromName = '';
        $fromEmail = '';
        if (!empty($header->from)) {
            $from = $header->from[0];
            $fromName = isset($from->personal) ? decodeMimeStr($from->personal) : '';
            $fromEmail = ($from->mailbox ?? '') . '@' . ($from->host ?? '');
        }

        // Destinatari
        $toAddresses = formatAddressList($header->to ?? []);
        $ccAddresses = formatAddressList($header->cc ?? []);

        // Data
        $date = isset($header->date) ? date('Y-m-d H:i:s', strtotime($header->date)) : date('Y-m-d H:i:s');

        // Corpo - usa PEEK
        $bodyText = '';
        $bodyHtml = '';
        $structure = imap_fetchstructure($imap, $i);
        $parts = flattenParts($structure, $i, $imap);

        foreach ($parts as $part) {
            if ($part['type'] === 'text') $bodyText = $part['content'];
            if ($part['type'] === 'html') $bodyHtml = $part['content'];
        }

        if (empty($bodyHtml) && !empty($bodyText)) {
            $bodyHtml = '<pre>' . htmlspecialchars($bodyText) . '</pre>';
        }

        // Allegati
        $hasAttachments = 0;
        if ($structure) {
            $hasAttachments = checkHasAttachments($structure) ? 1 : 0;
        }

        // Priorita'
        $priority = 3;
        if (isset($header->Xpriority)) {
            $priority = intval($header->Xpriority);
        }

        // Letto sul server?
        $isRead = ($ov && isset($ov->seen) && $ov->seen) ? 1 : 0;

        $messageId = $header->message_id ?? '';
        $size = $ov->size ?? 0;

        $insertStmt->execute([
            $accountId, $folderId, $messageId, $uid,
            $fromName, $fromEmail, $toAddresses, $ccAddresses,
            $subject, $bodyText, $bodyHtml, $date,
            $isRead, $hasAttachments, $priority, $size
        ]);

        $emailId = $pdo->lastInsertId();

        // Salva allegati
        if ($hasAttachments) {
            saveAttachments($imap, $i, $structure, $emailId, $pdo);
        }

        $fetched++;
    }

    $pdo->commit();

    // Aggiorna conteggi
    $db->updateFolderCounts($folderId);

    // Aggiorna last_sync
    $pdo->prepare('UPDATE accounts SET last_sync = datetime("now") WHERE id = ?')->execute([$accountId]);

    imap_close($imap);

    return ['fetched' => $fetched, 'total_on_server' => $totalMessages];
}

function emailList($input, $pdo) {
    $folderId = $input['folder_id'] ?? null;
    $accountId = $input['account_id'] ?? null;
    $page = max(1, $input['page'] ?? 1);
    $perPage = $input['per_page'] ?? 50;
    $offset = ($page - 1) * $perPage;

    $where = [];
    $params = [];

    if ($folderId) {
        $where[] = 'e.folder_id = ?';
        $params[] = $folderId;
    }
    if ($accountId) {
        $where[] = 'e.account_id = ?';
        $params[] = $accountId;
    }

    if (isset($input['is_starred'])) {
        $where[] = 'e.is_starred = ?';
        $params[] = $input['is_starred'];
    }

    $whereStr = !empty($where) ? 'WHERE ' . implode(' AND ', $where) : '';

    // Conteggio totale
    $countStmt = $pdo->prepare("SELECT COUNT(*) FROM emails e $whereStr");
    $countStmt->execute($params);
    $total = $countStmt->fetchColumn();

    // Email
    $params[] = $perPage;
    $params[] = $offset;
    $stmt = $pdo->prepare("SELECT e.id, e.account_id, e.folder_id, e.uid, e.from_name, e.from_email, e.to_addresses, e.subject, e.date, e.is_read, e.is_starred, e.is_flagged, e.has_attachments, e.priority, e.size, SUBSTR(e.body_text, 1, 200) as preview FROM emails e $whereStr ORDER BY e.date DESC LIMIT ? OFFSET ?");
    $stmt->execute($params);

    return [
        'emails' => $stmt->fetchAll(PDO::FETCH_ASSOC),
        'total' => $total,
        'page' => $page,
        'per_page' => $perPage,
        'pages' => ceil($total / $perPage)
    ];
}

function emailGet($input, $pdo) {
    if (empty($input['id'])) throw new Exception('ID email mancante');

    $stmt = $pdo->prepare('SELECT * FROM emails WHERE id = ?');
    $stmt->execute([$input['id']]);
    $email = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$email) throw new Exception('Email non trovata');

    // Carica allegati
    $attStmt = $pdo->prepare('SELECT id, filename, mime_type, size, cid FROM attachments WHERE email_id = ?');
    $attStmt->execute([$email['id']]);
    $email['attachments'] = $attStmt->fetchAll(PDO::FETCH_ASSOC);

    return $email;
}

function emailDelete($input, $pdo) {
    if (empty($input['id'])) throw new Exception('ID email mancante');
    $ids = is_array($input['id']) ? $input['id'] : [$input['id']];
    $placeholders = implode(',', array_fill(0, count($ids), '?'));
    $pdo->prepare("DELETE FROM emails WHERE id IN ($placeholders)")->execute($ids);
    return ['deleted' => count($ids)];
}

function emailMove($input, $pdo, $db) {
    if (empty($input['id']) || empty($input['folder_id'])) {
        throw new Exception('ID email e cartella destinazione richiesti');
    }
    $ids = is_array($input['id']) ? $input['id'] : [$input['id']];
    $oldFolders = [];

    // Trova cartelle originali
    $placeholders = implode(',', array_fill(0, count($ids), '?'));
    $stmt = $pdo->prepare("SELECT DISTINCT folder_id FROM emails WHERE id IN ($placeholders)");
    $stmt->execute($ids);
    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        $oldFolders[] = $row['folder_id'];
    }

    // Sposta
    $pdo->prepare("UPDATE emails SET folder_id = ? WHERE id IN ($placeholders)")
        ->execute(array_merge([$input['folder_id']], $ids));

    // Aggiorna conteggi
    foreach ($oldFolders as $fid) {
        $db->updateFolderCounts($fid);
    }
    $db->updateFolderCounts($input['folder_id']);

    return ['moved' => count($ids)];
}

function emailMarkRead($input, $pdo, $db) {
    if (empty($input['id'])) throw new Exception('ID email mancante');
    $ids = is_array($input['id']) ? $input['id'] : [$input['id']];
    $isRead = $input['is_read'] ?? 1;
    $placeholders = implode(',', array_fill(0, count($ids), '?'));
    $pdo->prepare("UPDATE emails SET is_read = ? WHERE id IN ($placeholders)")
        ->execute(array_merge([$isRead], $ids));

    // Aggiorna conteggi
    $stmt = $pdo->prepare("SELECT DISTINCT folder_id FROM emails WHERE id IN ($placeholders)");
    $stmt->execute($ids);
    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        $db->updateFolderCounts($row['folder_id']);
    }

    return ['updated' => count($ids)];
}

function emailStar($input, $pdo) {
    if (empty($input['id'])) throw new Exception('ID email mancante');
    $stmt = $pdo->prepare('UPDATE emails SET is_starred = ? WHERE id = ?');
    $stmt->execute([$input['is_starred'] ?? 1, $input['id']]);
    return ['updated' => true];
}

function emailSearch($input, $pdo) {
    $query = $input['query'] ?? '';
    $accountId = $input['account_id'] ?? null;
    $limit = $input['limit'] ?? 50;

    if (empty($query)) return ['emails' => []];

    // Prova FTS5
    try {
        $ftsQuery = str_replace('"', '""', $query);
        $sql = 'SELECT e.id, e.account_id, e.folder_id, e.from_name, e.from_email, e.to_addresses, e.subject, e.date, e.is_read, e.is_starred, e.has_attachments, SUBSTR(e.body_text, 1, 200) as preview FROM emails e INNER JOIN emails_fts fts ON e.id = fts.rowid WHERE emails_fts MATCH ?';
        $params = ['"' . $ftsQuery . '"'];

        if ($accountId) {
            $sql .= ' AND e.account_id = ?';
            $params[] = $accountId;
        }
        $sql .= ' ORDER BY e.date DESC LIMIT ?';
        $params[] = $limit;

        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        return ['emails' => $stmt->fetchAll(PDO::FETCH_ASSOC)];
    } catch (Exception $e) {
        // Fallback a LIKE
        $like = '%' . $query . '%';
        $sql = 'SELECT id, account_id, folder_id, from_name, from_email, to_addresses, subject, date, is_read, is_starred, has_attachments, SUBSTR(body_text, 1, 200) as preview FROM emails WHERE (subject LIKE ? OR from_name LIKE ? OR from_email LIKE ? OR body_text LIKE ?)';
        $params = [$like, $like, $like, $like];

        if ($accountId) {
            $sql .= ' AND account_id = ?';
            $params[] = $accountId;
        }
        $sql .= ' ORDER BY date DESC LIMIT ?';
        $params[] = $limit;

        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        return ['emails' => $stmt->fetchAll(PDO::FETCH_ASSOC)];
    }
}

function emailSend($input, $pdo, $db) {
    $accountId = $input['account_id'] ?? null;
    if (!$accountId) throw new Exception('Account non selezionato');

    $account = getAccount($accountId, $pdo);
    $to = $input['to'] ?? '';
    $cc = $input['cc'] ?? '';
    $bcc = $input['bcc'] ?? '';
    $subject = $input['subject'] ?? '';
    $bodyHtml = $input['body_html'] ?? $input['body'] ?? '';
    $bodyText = strip_tags($bodyHtml);
    $inReplyTo = $input['in_reply_to'] ?? '';

    if (empty($to)) throw new Exception('Destinatario richiesto');

    $password = OutlookDB::decryptPassword($account['password_enc']);

    // Verifica se ci sono allegati
    $hasAttachments = !empty($_FILES['attachments']);
    $attachments = [];
    if ($hasAttachments) {
        $files = $_FILES['attachments'];
        $count = is_array($files['name']) ? count($files['name']) : 1;
        for ($i = 0; $i < $count; $i++) {
            $name = is_array($files['name']) ? $files['name'][$i] : $files['name'];
            $tmp = is_array($files['tmp_name']) ? $files['tmp_name'][$i] : $files['tmp_name'];
            $type = is_array($files['type']) ? $files['type'][$i] : $files['type'];
            $size = is_array($files['size']) ? $files['size'][$i] : $files['size'];
            $error = is_array($files['error']) ? $files['error'][$i] : $files['error'];
            if ($error === UPLOAD_ERR_OK && $tmp && is_uploaded_file($tmp)) {
                $attachments[] = [
                    'name' => $name,
                    'type' => $type ?: 'application/octet-stream',
                    'size' => $size,
                    'content' => file_get_contents($tmp)
                ];
            }
        }
    }

    // Costruisci messaggio MIME
    $messageId = '<' . md5(uniqid()) . '@' . preg_replace('/^[^.]+\./', '', $account['smtp_host']) . '>';

    $headers = "From: =?UTF-8?B?" . base64_encode($account['name']) . "?= <{$account['email']}>\r\n";
    $headers .= "To: $to\r\n";
    if ($cc) $headers .= "Cc: $cc\r\n";
    $headers .= "Subject: =?UTF-8?B?" . base64_encode($subject) . "?=\r\n";
    $headers .= "Message-ID: $messageId\r\n";
    if ($inReplyTo) $headers .= "In-Reply-To: $inReplyTo\r\n";
    $headers .= "MIME-Version: 1.0\r\n";
    $headers .= "Date: " . date('r') . "\r\n";
    $headers .= "X-Mailer: Outlook Clone\r\n";

    if (count($attachments) > 0) {
        // multipart/mixed (testo + allegati)
        $mixedBoundary = '----=_Mixed_' . md5(uniqid(time()));
        $altBoundary = '----=_Alt_' . md5(uniqid(time() + 1));
        $headers .= "Content-Type: multipart/mixed; boundary=\"$mixedBoundary\"\r\n";

        $body = "--$mixedBoundary\r\n";
        $body .= "Content-Type: multipart/alternative; boundary=\"$altBoundary\"\r\n\r\n";
        $body .= "--$altBoundary\r\n";
        $body .= "Content-Type: text/plain; charset=UTF-8\r\n";
        $body .= "Content-Transfer-Encoding: base64\r\n\r\n";
        $body .= chunk_split(base64_encode($bodyText)) . "\r\n";
        $body .= "--$altBoundary\r\n";
        $body .= "Content-Type: text/html; charset=UTF-8\r\n";
        $body .= "Content-Transfer-Encoding: base64\r\n\r\n";
        $body .= chunk_split(base64_encode($bodyHtml)) . "\r\n";
        $body .= "--$altBoundary--\r\n\r\n";

        // Allegati
        foreach ($attachments as $att) {
            $encodedName = '=?UTF-8?B?' . base64_encode($att['name']) . '?=';
            $body .= "--$mixedBoundary\r\n";
            $body .= "Content-Type: {$att['type']}; name=\"{$att['name']}\"\r\n";
            $body .= "Content-Disposition: attachment; filename=\"$encodedName\"\r\n";
            $body .= "Content-Transfer-Encoding: base64\r\n\r\n";
            $body .= chunk_split(base64_encode($att['content'])) . "\r\n";
        }
        $body .= "--$mixedBoundary--\r\n";
    } else {
        // Solo testo, senza allegati
        $altBoundary = '----=_Alt_' . md5(uniqid(time()));
        $headers .= "Content-Type: multipart/alternative; boundary=\"$altBoundary\"\r\n";

        $body = "--$altBoundary\r\n";
        $body .= "Content-Type: text/plain; charset=UTF-8\r\n";
        $body .= "Content-Transfer-Encoding: base64\r\n\r\n";
        $body .= chunk_split(base64_encode($bodyText)) . "\r\n";
        $body .= "--$altBoundary\r\n";
        $body .= "Content-Type: text/html; charset=UTF-8\r\n";
        $body .= "Content-Transfer-Encoding: base64\r\n\r\n";
        $body .= chunk_split(base64_encode($bodyHtml)) . "\r\n";
        $body .= "--$altBoundary--\r\n";
    }

    $fullMessage = $headers . "\r\n" . $body;

    // Invia via SMTP
    $sent = smtpSend($account, $password, $to, $cc, $bcc, $fullMessage);

    if (!$sent) throw new Exception('Invio email fallito');

    // Salva in Posta inviata
    $sentFolder = $pdo->prepare('SELECT id FROM folders WHERE account_id = ? AND type = "sent" LIMIT 1');
    $sentFolder->execute([$accountId]);
    $sf = $sentFolder->fetch(PDO::FETCH_ASSOC);

    if ($sf) {
        $hasAtt = count($attachments) > 0 ? 1 : 0;
        $stmt = $pdo->prepare('INSERT INTO emails (account_id, folder_id, message_id, from_name, from_email, to_addresses, cc_addresses, bcc_addresses, subject, body_text, body_html, date, is_read, has_attachments, in_reply_to) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime("now"), 1, ?, ?)');
        $stmt->execute([
            $accountId, $sf['id'], $messageId,
            $account['name'], $account['email'],
            $to, $cc, $bcc, $subject, $bodyText, $bodyHtml, $hasAtt, $inReplyTo
        ]);
        $emailId = $pdo->lastInsertId();

        // Salva allegati nel DB
        if (count($attachments) > 0) {
            $attStmt = $pdo->prepare('INSERT INTO attachments (email_id, filename, mime_type, size, content) VALUES (?, ?, ?, ?, ?)');
            foreach ($attachments as $att) {
                $attStmt->execute([$emailId, $att['name'], $att['type'], $att['size'], $att['content']]);
            }
        }

        $db->updateFolderCounts($sf['id']);
    }

    // Aggiorna contatti usati
    $addresses = array_merge(
        parseEmailAddresses($to),
        parseEmailAddresses($cc),
        parseEmailAddresses($bcc)
    );
    foreach ($addresses as $addr) {
        $pdo->prepare('INSERT OR IGNORE INTO contacts (account_id, email, name, last_used) VALUES (?, ?, ?, datetime("now"))')
            ->execute([$accountId, $addr['email'], $addr['name'] ?: $addr['email']]);
        $pdo->prepare('UPDATE contacts SET last_used = datetime("now") WHERE email = ?')
            ->execute([$addr['email']]);
    }

    return ['sent' => true, 'message_id' => $messageId];
}

function emailSaveDraft($input, $pdo, $db) {
    $accountId = $input['account_id'] ?? null;
    if (!$accountId) throw new Exception('Account non selezionato');

    $account = getAccount($accountId, $pdo);

    $draftFolder = $pdo->prepare('SELECT id FROM folders WHERE account_id = ? AND type = "drafts" LIMIT 1');
    $draftFolder->execute([$accountId]);
    $df = $draftFolder->fetch(PDO::FETCH_ASSOC);
    if (!$df) throw new Exception('Cartella Bozze non trovata');

    $bodyHtml = $input['body_html'] ?? $input['body'] ?? '';
    $bodyText = strip_tags($bodyHtml);

    if (!empty($input['draft_id'])) {
        // Aggiorna bozza esistente
        $stmt = $pdo->prepare('UPDATE emails SET to_addresses = ?, cc_addresses = ?, bcc_addresses = ?, subject = ?, body_text = ?, body_html = ?, date = datetime("now") WHERE id = ?');
        $stmt->execute([
            $input['to'] ?? '', $input['cc'] ?? '', $input['bcc'] ?? '',
            $input['subject'] ?? '', $bodyText, $bodyHtml, $input['draft_id']
        ]);
        return ['id' => $input['draft_id']];
    } else {
        $stmt = $pdo->prepare('INSERT INTO emails (account_id, folder_id, from_name, from_email, to_addresses, cc_addresses, bcc_addresses, subject, body_text, body_html, date, is_read, is_draft) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime("now"), 1, 1)');
        $stmt->execute([
            $accountId, $df['id'],
            $account['name'], $account['email'],
            $input['to'] ?? '', $input['cc'] ?? '', $input['bcc'] ?? '',
            $input['subject'] ?? '', $bodyText, $bodyHtml
        ]);
        $db->updateFolderCounts($df['id']);
        return ['id' => $pdo->lastInsertId()];
    }
}

function emailDeleteFromServer($input, $pdo) {
    if (empty($input['id'])) throw new Exception('ID email mancante');

    $stmt = $pdo->prepare('SELECT e.*, a.* FROM emails e JOIN accounts a ON e.account_id = a.id WHERE e.id = ?');
    $stmt->execute([$input['id']]);
    $email = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$email) throw new Exception('Email non trovata');
    if (!$email['uid']) throw new Exception('UID non disponibile');

    $account = getAccount($email['account_id'], $pdo);
    $folder = $pdo->prepare('SELECT imap_name FROM folders WHERE id = ?');
    $folder->execute([$email['folder_id']]);
    $f = $folder->fetch(PDO::FETCH_ASSOC);

    $imap = imapConnect($account, $f['imap_name'] ?? 'INBOX');
    if (!$imap) throw new Exception('Connessione IMAP fallita');

    $msgNo = imap_msgno($imap, $email['uid']);
    if ($msgNo) {
        imap_delete($imap, $msgNo);
        imap_expunge($imap);
    }

    imap_close($imap);
    return ['deleted_from_server' => true];
}

// ==================== CONTATTI ====================

function contactList($input, $pdo) {
    $accountId = $input['account_id'] ?? null;
    $search = $input['search'] ?? '';

    $sql = 'SELECT * FROM contacts';
    $params = [];
    $where = [];

    if ($accountId) {
        $where[] = 'account_id = ?';
        $params[] = $accountId;
    }
    if ($search) {
        $where[] = '(name LIKE ? OR email LIKE ?)';
        $params[] = "%$search%";
        $params[] = "%$search%";
    }

    if (!empty($where)) $sql .= ' WHERE ' . implode(' AND ', $where);
    $sql .= ' ORDER BY is_favorite DESC, last_used DESC, name';

    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    return $stmt->fetchAll(PDO::FETCH_ASSOC);
}

function contactAdd($input, $pdo) {
    if (empty($input['email'])) throw new Exception('Email richiesta');
    $stmt = $pdo->prepare('INSERT INTO contacts (account_id, name, email, phone, company, notes, is_favorite) VALUES (?, ?, ?, ?, ?, ?, ?)');
    $stmt->execute([
        $input['account_id'] ?? null,
        $input['name'] ?? '',
        $input['email'],
        $input['phone'] ?? '',
        $input['company'] ?? '',
        $input['notes'] ?? '',
        $input['is_favorite'] ?? 0
    ]);
    return ['id' => $pdo->lastInsertId()];
}

function contactUpdate($input, $pdo) {
    if (empty($input['id'])) throw new Exception('ID contatto mancante');
    $stmt = $pdo->prepare('UPDATE contacts SET name = ?, email = ?, phone = ?, company = ?, notes = ?, is_favorite = ? WHERE id = ?');
    $stmt->execute([
        $input['name'] ?? '', $input['email'] ?? '', $input['phone'] ?? '',
        $input['company'] ?? '', $input['notes'] ?? '', $input['is_favorite'] ?? 0, $input['id']
    ]);
    return ['updated' => true];
}

function contactDelete($input, $pdo) {
    if (empty($input['id'])) throw new Exception('ID contatto mancante');
    $pdo->prepare('DELETE FROM contacts WHERE id = ?')->execute([$input['id']]);
    return ['deleted' => true];
}

// ==================== IMPOSTAZIONI ====================

function settingsGet($pdo) {
    $stmt = $pdo->query('SELECT key, value FROM settings');
    $settings = [];
    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        $settings[$row['key']] = $row['value'];
    }
    return $settings;
}

function settingsSet($input, $pdo) {
    if (empty($input['key'])) throw new Exception('Chiave mancante');
    $stmt = $pdo->prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
    $stmt->execute([$input['key'], $input['value'] ?? '']);
    return ['saved' => true];
}

// ==================== ALLEGATI ====================

function attachmentGet($input, $pdo) {
    if (empty($input['id'])) throw new Exception('ID allegato mancante');
    $stmt = $pdo->prepare('SELECT * FROM attachments WHERE id = ?');
    $stmt->execute([$input['id']]);
    $att = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$att) throw new Exception('Allegato non trovato');

    if ($att['content']) {
        return [
            'filename' => $att['filename'],
            'mime_type' => $att['mime_type'],
            'size' => $att['size'],
            'content_base64' => base64_encode($att['content'])
        ];
    }
    return $att;
}

// ==================== FUNZIONI HELPER ====================

function getAccount($accountId, $pdo) {
    $stmt = $pdo->prepare('SELECT * FROM accounts WHERE id = ?');
    $stmt->execute([$accountId]);
    $account = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$account) throw new Exception('Account non trovato');
    return $account;
}

function imapConnect($account, $folder = 'INBOX') {
    if (!function_exists('imap_open')) return false;

    $enc = $account['imap_encryption'] ?: 'ssl';
    $flags = "/$enc";
    if ($enc === 'ssl') $flags .= '/novalidate-cert';
    $mailbox = '{' . $account['imap_host'] . ':' . $account['imap_port'] . $flags . '}' . $folder;

    $password = OutlookDB::decryptPassword($account['password_enc']);

    // OP_READONLY: non modifica le flag sul server (PEEK behavior)
    $imap = @imap_open($mailbox, $account['username'], $password, 0, 1);
    return $imap;
}

function smtpSend($account, $password, $to, $cc, $bcc, $message) {
    $host = $account['smtp_host'];
    $port = $account['smtp_port'] ?: 587;
    $encryption = $account['smtp_encryption'] ?: 'tls';
    $username = $account['username'];

    $prefix = ($encryption === 'ssl') ? 'ssl://' : '';
    $fp = @fsockopen($prefix . $host, $port, $errno, $errstr, 30);
    if (!$fp) return false;

    // Leggi banner
    $response = smtpRead($fp);
    if (strpos($response, '220') === false) { fclose($fp); return false; }

    // EHLO
    smtpCmd($fp, "EHLO " . gethostname());

    // STARTTLS se richiesto
    if ($encryption === 'tls') {
        smtpCmd($fp, "STARTTLS");
        stream_socket_enable_crypto($fp, true, STREAM_CRYPTO_METHOD_TLSv1_2_CLIENT);
        smtpCmd($fp, "EHLO " . gethostname());
    }

    // AUTH LOGIN
    smtpCmd($fp, "AUTH LOGIN");
    smtpCmd($fp, base64_encode($username));
    $authResp = smtpCmd($fp, base64_encode($password));
    if (strpos($authResp, '235') === false) { fclose($fp); return false; }

    // MAIL FROM
    smtpCmd($fp, "MAIL FROM:<{$account['email']}>");

    // RCPT TO
    $allRecipients = array_merge(
        parseEmailAddresses($to),
        parseEmailAddresses($cc),
        parseEmailAddresses($bcc)
    );
    foreach ($allRecipients as $r) {
        smtpCmd($fp, "RCPT TO:<{$r['email']}>");
    }

    // DATA
    smtpCmd($fp, "DATA");
    fputs($fp, $message . "\r\n.\r\n");
    $dataResp = smtpRead($fp);

    // QUIT
    smtpCmd($fp, "QUIT");
    fclose($fp);

    return strpos($dataResp, '250') !== false;
}

function smtpCmd($fp, $cmd) {
    fputs($fp, "$cmd\r\n");
    return smtpRead($fp);
}

function smtpRead($fp) {
    $response = '';
    while ($line = fgets($fp, 1024)) {
        $response .= $line;
        if (substr($line, 3, 1) === ' ' || strlen($line) < 4) break;
    }
    return $response;
}

function decodeMimeStr($string) {
    $result = '';
    $elements = imap_mime_header_decode($string);
    if ($elements) {
        foreach ($elements as $element) {
            $charset = ($element->charset === 'default') ? 'UTF-8' : $element->charset;
            $text = $element->text;
            if (strtoupper($charset) !== 'UTF-8') {
                $text = @mb_convert_encoding($text, 'UTF-8', $charset);
            }
            $result .= $text;
        }
    }
    return $result ?: $string;
}

function formatAddressList($addresses) {
    if (!is_array($addresses)) return '';
    $list = [];
    foreach ($addresses as $addr) {
        $name = isset($addr->personal) ? decodeMimeStr($addr->personal) : '';
        $email = ($addr->mailbox ?? '') . '@' . ($addr->host ?? '');
        $list[] = $name ? "$name <$email>" : $email;
    }
    return implode(', ', $list);
}

function parseEmailAddresses($str) {
    if (empty($str)) return [];
    $result = [];
    $parts = preg_split('/[,;]/', $str);
    foreach ($parts as $part) {
        $part = trim($part);
        if (empty($part)) continue;
        if (preg_match('/^(.+?)\s*<(.+?)>$/', $part, $m)) {
            $result[] = ['name' => trim($m[1], '" '), 'email' => trim($m[2])];
        } else {
            $result[] = ['name' => '', 'email' => trim($part)];
        }
    }
    return $result;
}

function flattenParts($structure, $msgNo, $imap, $partNum = '') {
    $parts = [];

    if (!$structure) return $parts;

    if (isset($structure->parts) && count($structure->parts)) {
        foreach ($structure->parts as $index => $part) {
            $subPartNum = $partNum ? ($partNum . '.' . ($index + 1)) : (string)($index + 1);
            $subParts = flattenParts($part, $msgNo, $imap, $subPartNum);
            $parts = array_merge($parts, $subParts);
        }
    } else {
        $body = $partNum ? imap_fetchbody($imap, $msgNo, $partNum, FT_PEEK) : imap_body($imap, $msgNo, FT_PEEK);

        // Decodifica
        $encoding = $structure->encoding ?? 0;
        switch ($encoding) {
            case 3: $body = base64_decode($body); break;
            case 4: $body = quoted_printable_decode($body); break;
        }

        // Converti charset
        $charset = 'UTF-8';
        if (!empty($structure->parameters)) {
            foreach ($structure->parameters as $param) {
                if (strtolower($param->attribute) === 'charset') {
                    $charset = $param->value;
                    break;
                }
            }
        }
        if (strtoupper($charset) !== 'UTF-8') {
            $body = @mb_convert_encoding($body, 'UTF-8', $charset);
        }

        $type = $structure->type ?? 0;
        $subtype = strtolower($structure->subtype ?? 'plain');

        if ($type === 0 && $subtype === 'plain') {
            $parts[] = ['type' => 'text', 'content' => $body];
        } elseif ($type === 0 && $subtype === 'html') {
            $parts[] = ['type' => 'html', 'content' => $body];
        }
    }

    return $parts;
}

function checkHasAttachments($structure) {
    if (!empty($structure->parts)) {
        foreach ($structure->parts as $part) {
            $disposition = '';
            if (!empty($part->disposition)) {
                $disposition = strtolower($part->disposition);
            }
            if ($disposition === 'attachment') return true;
            if (isset($part->type) && $part->type >= 3 && $disposition !== 'inline') return true;
            if (!empty($part->parts) && checkHasAttachments($part)) return true;
        }
    }
    return false;
}

function saveAttachments($imap, $msgNo, $structure, $emailId, $pdo) {
    if (empty($structure->parts)) return;

    $stmt = $pdo->prepare('INSERT INTO attachments (email_id, filename, mime_type, size, content, cid) VALUES (?, ?, ?, ?, ?, ?)');

    foreach ($structure->parts as $index => $part) {
        $partNum = (string)($index + 1);
        $disposition = !empty($part->disposition) ? strtolower($part->disposition) : '';

        $filename = '';
        if (!empty($part->dparameters)) {
            foreach ($part->dparameters as $p) {
                if (strtolower($p->attribute) === 'filename') {
                    $filename = decodeMimeStr($p->value);
                }
            }
        }
        if (!$filename && !empty($part->parameters)) {
            foreach ($part->parameters as $p) {
                if (strtolower($p->attribute) === 'name') {
                    $filename = decodeMimeStr($p->value);
                }
            }
        }

        if ($disposition === 'attachment' || ($filename && $part->type >= 3)) {
            $body = imap_fetchbody($imap, $msgNo, $partNum, FT_PEEK);
            $encoding = $part->encoding ?? 0;
            switch ($encoding) {
                case 3: $body = base64_decode($body); break;
                case 4: $body = quoted_printable_decode($body); break;
            }

            $types = ['text', 'multipart', 'message', 'application', 'audio', 'image', 'video', 'model', 'other'];
            $mimeType = ($types[$part->type] ?? 'application') . '/' . strtolower($part->subtype ?? 'octet-stream');

            $cid = '';
            if (!empty($part->id)) {
                $cid = trim($part->id, '<>');
            }

            $stmt->execute([$emailId, $filename ?: 'allegato', $mimeType, strlen($body), $body, $cid]);
        }
    }
}
