<?php
/**
 * API unificata — backend per autenticazione QR e gestione utenti
 *
 * Endpoint: /backend/api.php?action=<azione>
 *
 * Azioni pubbliche:
 *   new-auth        — Genera nuovo token QR e restituisce URL + token
 *   check-auth      — Controlla se un token QR è stato scansionato/completato
 *   user-info       — Restituisce i dati dell'utente autenticato (se sessione attiva)
 *   register        — Registra nuovo utente (primo utente = admin)
 *   confirm-auth    — Conferma autenticazione per utente esistente
 *   logout          — Termina la sessione
 *   recovery        — Recupera account tramite secret_key
 *
 * Azioni admin (richiedono ruolo admin):
 *   admin-users     — Elenco utenti
 *   admin-user-add  — Aggiunge utente
 *   admin-user-edit — Modifica utente
 *   admin-user-del  — Elimina utente
 *   admin-stats     — Statistiche dashboard
 *   admin-licenses  — Elenco licenze
 *   admin-license-add — Aggiunge licenza
 */

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/storage.php';

$action = $_GET['action'] ?? '';

switch ($action) {

    // ──────────────────────────────────────────────
    // NUOVA RICHIESTA DI AUTENTICAZIONE (genera QR)
    // ──────────────────────────────────────────────
    case 'new-auth':
        $token = generateToken(24);
        $ip    = $_SERVER['REMOTE_ADDR'] ?? '';
        $ua    = $_SERVER['HTTP_USER_AGENT'] ?? '';

        $db = getDB();
        $stmt = $db->prepare("INSERT INTO auth_requests (token, status, ip_address, user_agent, expires_at) VALUES (?, 'pending', ?, ?, datetime('now', '+10 minutes'))");
        $stmt->execute([$token, $ip, $ua]);

        // Costruisce URL per il QR code
        $baseUrl = (isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] === 'on' ? 'https' : 'http') . '://' . $_SERVER['HTTP_HOST'];
        $qrUrl   = $baseUrl . rtrim(dirname($_SERVER['SCRIPT_NAME']), '/') . '/auth-handler.php?token=' . $token;

        jsonResponse([
            'token' => $token,
            'qr_url' => $qrUrl,
            'expires_in' => 600
        ]);
        break;

    // ──────────────────────────────────────────────
    // VERIFICA STATO AUTENTICAZIONE (polling)
    // ──────────────────────────────────────────────
    case 'check-auth':
        $token = $_GET['token'] ?? '';
        if (!$token) jsonResponse(['error' => 'Token mancante'], 400);

        $db = getDB();
        $stmt = $db->prepare("SELECT status, user_id FROM auth_requests WHERE token = ?");
        $stmt->execute([$token]);
        $req = $stmt->fetch();

        if (!$req) jsonResponse(['error' => 'Token non valido'], 404);

        if ($req['status'] === 'completed' && $req['user_id']) {
            // Recupera utente
            $stmt2 = $db->prepare("SELECT id, name, email, role, secret_key FROM users WHERE id = ?");
            $stmt2->execute([$req['user_id']]);
            $user = $stmt2->fetch();

            if ($user) {
                // Crea sessione PHP
                $_SESSION['user_id'] = $user['id'];

                // Aggiorna last_login
                $db->prepare("UPDATE users SET last_login = datetime('now') WHERE id = ?")->execute([$user['id']]);

                jsonResponse([
                    'status' => 'completed',
                    'user' => [
                        'id' => $user['id'],
                        'name' => $user['name'],
                        'email' => $user['email'],
                        'role' => $user['role'],
                        'secret_key' => $user['secret_key']
                    ]
                ]);
            }
        }

        jsonResponse(['status' => $req['status']]);
        break;

    // ──────────────────────────────────────────────
    // REGISTRA NUOVO UTENTE (da QR code)
    // ──────────────────────────────────────────────
    case 'register':
        $input = json_decode(file_get_contents('php://input'), true);
        $name  = trim($input['name'] ?? '');
        $email = trim($input['email'] ?? '');
        $token = $input['token'] ?? '';
        if (!$name || !$email || !$token) jsonResponse(['error' => 'Nome, email e token obbligatori'], 400);
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) jsonResponse(['error' => 'Email non valida'], 400);

        $db = getDB();

        // Verifica token valido
        $stmt = $db->prepare("SELECT id FROM auth_requests WHERE token = ? AND status IN ('pending','scanned') AND (expires_at IS NULL OR expires_at > datetime('now'))");
        $stmt->execute([$token]);
        if (!$stmt->fetch()) jsonResponse(['error' => 'Token non valido o scaduto'], 400);

        // Verifica email unica
        $check = $db->prepare("SELECT id FROM users WHERE email = ?");
        $check->execute([$email]);
        if ($check->fetch()) jsonResponse(['error' => 'Email già registrata. Usa "Recupera accesso" con la tua chiave segreta.'], 409);

        // Determina ruolo: primo utente → admin
        $userCount = $db->query("SELECT COUNT(*) FROM users")->fetchColumn();
        $role = ($userCount == 0) ? 'admin' : 'user';

        $secretKey = generateSecretKey();
        $db->prepare("INSERT INTO users (name, email, secret_key, role) VALUES (?, ?, ?, ?)")->execute([$name, $email, $secretKey, $role]);
        $userId = $db->lastInsertId();

        // Marca token come completato e associa user_id
        $db->prepare("UPDATE auth_requests SET status = 'completed', user_id = ? WHERE token = ?")->execute([$userId, $token]);

        // Crea sessione
        $_SESSION['user_id'] = $userId;
        $db->prepare("UPDATE users SET last_login = datetime('now') WHERE id = ?")->execute([$userId]);

        jsonResponse([
            'status' => 'registered',
            'user' => [
                'id' => $userId,
                'name' => $name,
                'email' => $email,
                'role' => $role,
                'secret_key' => $secretKey
            ]
        ], 201);
        break;

    // ──────────────────────────────────────────────
    // CONFERMA AUTENTICAZIONE (utente esistente da QR)
    // ──────────────────────────────────────────────
    case 'confirm-auth':
        $input = json_decode(file_get_contents('php://input'), true);
        $token = $input['token'] ?? '';
        $userId = (int)($input['user_id'] ?? 0);
        if (!$token || !$userId) jsonResponse(['error' => 'Token e user_id obbligatori'], 400);

        $db = getDB();

        // Verifica token
        $stmt = $db->prepare("SELECT id FROM auth_requests WHERE token = ? AND status IN ('pending','scanned') AND (expires_at IS NULL OR expires_at > datetime('now'))");
        $stmt->execute([$token]);
        if (!$stmt->fetch()) jsonResponse(['error' => 'Token non valido o scaduto'], 400);

        // Verifica utente
        $stmt2 = $db->prepare("SELECT id, name, email, role, secret_key FROM users WHERE id = ? AND is_active = 1");
        $stmt2->execute([$userId]);
        $user = $stmt2->fetch();
        if (!$user) jsonResponse(['error' => 'Utente non trovato'], 404);

        // Marca token completato
        $db->prepare("UPDATE auth_requests SET status = 'completed', user_id = ? WHERE token = ?")->execute([$userId, $token]);

        // Crea sessione
        $_SESSION['user_id'] = $userId;
        $db->prepare("UPDATE users SET last_login = datetime('now') WHERE id = ?")->execute([$userId]);

        jsonResponse([
            'status' => 'confirmed',
            'user' => [
                'id' => $user['id'],
                'name' => $user['name'],
                'email' => $user['email'],
                'role' => $user['role'],
                'secret_key' => $user['secret_key']
            ]
        ]);
        break;

    // ──────────────────────────────────────────────
    // INFORMAZIONI UTENTE CORRENTE
    // ──────────────────────────────────────────────
    case 'user-info':
        $user = getAuthUser();
        if (!$user) jsonResponse(['authenticated' => false], 200);
        jsonResponse([
            'authenticated' => true,
            'user' => $user
        ]);
        break;

    // ──────────────────────────────────────────────
    // LOGOUT
    // ──────────────────────────────────────────────
    case 'logout':
        $_SESSION = [];
        if (ini_get('session.use_cookies')) {
            $params = session_get_cookie_params();
            setcookie(session_name(), '', time() - 86400, $params['path'], $params['domain'], $params['secure'], $params['httponly']);
        }
        session_destroy();
        jsonResponse(['status' => 'ok']);
        break;

    // ──────────────────────────────────────────────
    // RECUPERO TRAMITE SECRET KEY
    // ──────────────────────────────────────────────
    case 'recovery':
        $input = json_decode(file_get_contents('php://input'), true) ?: $_POST;
        $secretKey = $input['secret_key'] ?? '';
        if (!$secretKey) jsonResponse(['error' => 'Inserisci la chiave segreta'], 400);

        $db = getDB();
        $stmt = $db->prepare("SELECT * FROM users WHERE secret_key = ? AND is_active = 1");
        $stmt->execute([strtoupper($secretKey)]);
        $user = $stmt->fetch();

        if (!$user) jsonResponse(['error' => 'Chiave segreta non valida'], 404);

        $_SESSION['user_id'] = $user['id'];
        $db->prepare("UPDATE users SET last_login = datetime('now') WHERE id = ?")->execute([$user['id']]);

        jsonResponse([
            'status' => 'recovered',
            'user' => [
                'id' => $user['id'],
                'name' => $user['name'],
                'email' => $user['email'],
                'role' => $user['role'],
                'secret_key' => $user['secret_key']
            ]
        ]);
        break;

    // ══════════════════════════════════════════════
    // SEZIONE ADMIN
    // ══════════════════════════════════════════════

    // ──────────────────────────────────────────────
    // ELENCO UTENTI (admin)
    // ──────────────────────────────────────────────
    case 'admin-users':
        requireAdmin();
        $db = getDB();
        $users = $db->query("
            SELECT u.id, u.name, u.email, u.role, u.is_active, u.storage_limit_mb, u.created_at, u.last_login,
                   (SELECT COUNT(*) FROM licenses WHERE user_id = u.id) AS license_count,
                   (SELECT COUNT(*) FROM sessions WHERE user_id = u.id AND is_active = 1) AS active_session_count,
                   (SELECT COALESCE(MAX(max_devices), 1) FROM licenses WHERE user_id = u.id AND is_active = 1) AS max_devices_allowed
            FROM users u
            ORDER BY u.id ASC
        ")->fetchAll();
        // Aggiunge storage_used per ogni utente
        foreach ($users as &$u) {
            $u['storage_used'] = getStorageUsage((int)$u['id']);
        }
        unset($u);
        jsonResponse(['users' => $users]);
        break;

    // ──────────────────────────────────────────────
    // AGGIUNGI UTENTE (admin)
    // ──────────────────────────────────────────────
    case 'admin-user-add':
        requireAdmin();
        $input = json_decode(file_get_contents('php://input'), true);
        $name  = trim($input['name'] ?? '');
        $email = trim($input['email'] ?? '');
        $role  = $input['role'] ?? 'user';
        if (!$name || !$email) jsonResponse(['error' => 'Nome ed email obbligatori'], 400);

        $db = getDB();
        // Verifica email unica
        $check = $db->prepare("SELECT id FROM users WHERE email = ?");
        $check->execute([$email]);
        if ($check->fetch()) jsonResponse(['error' => 'Email già registrata'], 409);

        $secretKey = generateSecretKey();
        $stmt = $db->prepare("INSERT INTO users (name, email, secret_key, role) VALUES (?, ?, ?, ?)");
        $stmt->execute([$name, $email, $secretKey, $role]);

        $userId = $db->lastInsertId();

        // Imposta storage_limit_mb se fornito
        if (isset($input['storage_limit_mb'])) {
            $db->prepare("UPDATE users SET storage_limit_mb = ? WHERE id = ?")->execute([max(1, (int)$input['storage_limit_mb']), $userId]);
        }

        jsonResponse(['status' => 'ok', 'user_id' => $userId, 'secret_key' => $secretKey], 201);
        break;

    // ──────────────────────────────────────────────
    // MODIFICA UTENTE (admin)
    // ──────────────────────────────────────────────
    case 'admin-user-edit':
        requireAdmin();
        $input = json_decode(file_get_contents('php://input'), true);
        $id    = (int)($input['id'] ?? 0);
        if (!$id) jsonResponse(['error' => 'ID mancante'], 400);

        $db = getDB();
        $fields = [];
        $params = [];
        if (!empty($input['name'])) { $fields[] = 'name = ?'; $params[] = $input['name']; }
        if (!empty($input['email'])) { $fields[] = 'email = ?'; $params[] = $input['email']; }
        if (isset($input['role'])) { $fields[] = 'role = ?'; $params[] = $input['role']; }
        if (isset($input['is_active'])) { $fields[] = 'is_active = ?'; $params[] = $input['is_active'] ? 1 : 0; }
        if (isset($input['storage_limit_mb'])) { $fields[] = 'storage_limit_mb = ?'; $params[] = max(1, (int)$input['storage_limit_mb']); }

        if (empty($fields)) jsonResponse(['error' => 'Nessun campo da aggiornare'], 400);

        // Rigenera secret key se richiesto
        if (!empty($input['reset_secret'])) {
            $newKey = generateSecretKey();
            $fields[] = 'secret_key = ?';
            $params[] = $newKey;
        }

        $params[] = $id;
        $db->prepare("UPDATE users SET " . implode(', ', $fields) . " WHERE id = ?")->execute($params);

        $resp = ['status' => 'ok'];
        if (!empty($newKey)) $resp['new_secret_key'] = $newKey;
        jsonResponse($resp);
        break;

    // ──────────────────────────────────────────────
    // ELIMINA UTENTE (admin)
    // ──────────────────────────────────────────────
    case 'admin-user-del':
        requireAdmin();
        $input = json_decode(file_get_contents('php://input'), true);
        $id = (int)($input['id'] ?? 0);
        if (!$id) jsonResponse(['error' => 'ID mancante'], 400);
        if ($id === $_SESSION['user_id']) jsonResponse(['error' => 'Non puoi eliminare te stesso'], 400);

        $db = getDB();
        $db->prepare("DELETE FROM devices WHERE license_id IN (SELECT id FROM licenses WHERE user_id = ?)")->execute([$id]);
        $db->prepare("DELETE FROM licenses WHERE user_id = ?")->execute([$id]);
        $db->prepare("DELETE FROM auth_requests WHERE user_id = ?")->execute([$id]);
        $db->prepare("DELETE FROM users WHERE id = ?")->execute([$id]);
        jsonResponse(['status' => 'ok']);
        break;

    // ──────────────────────────────────────────────
    // STATISTICHE (admin)
    // ──────────────────────────────────────────────
    case 'admin-stats':
        requireAdmin();
        $db = getDB();
        $stats = [];
        $stats['total_users'] = $db->query("SELECT COUNT(*) FROM users")->fetchColumn();
        $stats['active_users'] = $db->query("SELECT COUNT(*) FROM users WHERE is_active = 1")->fetchColumn();
        $stats['total_licenses'] = $db->query("SELECT COUNT(*) FROM licenses")->fetchColumn();
        $stats['active_licenses'] = $db->query("SELECT COUNT(*) FROM licenses WHERE is_active = 1")->fetchColumn();
        $stats['total_revenue'] = $db->query("SELECT COALESCE(SUM(amount), 0) FROM licenses WHERE amount IS NOT NULL")->fetchColumn();
        $stats['latest_users'] = $db->query("SELECT name, email, created_at FROM users ORDER BY id DESC LIMIT 5")->fetchAll();
        jsonResponse($stats);
        break;

    // ──────────────────────────────────────────────
    // ELENCO LICENZE (admin)
    // ──────────────────────────────────────────────
    case 'admin-licenses':
        requireAdmin();
        $db = getDB();
        $licenses = $db->query("
            SELECT l.*, u.name AS user_name, u.email AS user_email,
                   (SELECT COUNT(*) FROM devices WHERE license_id = l.id) AS device_count
            FROM licenses l
            JOIN users u ON u.id = l.user_id
            ORDER BY l.id DESC
        ")->fetchAll();
        jsonResponse(['licenses' => $licenses]);
        break;

    // ──────────────────────────────────────────────
    // AGGIUNGI LICENZA (admin)
    // ──────────────────────────────────────────────
    case 'admin-license-add':
        requireAdmin();
        $input = json_decode(file_get_contents('php://input'), true);
        $userId = (int)($input['user_id'] ?? 0);
        $plan   = $input['plan'] ?? 'base';
        $maxDevices = (int)($input['max_devices'] ?? 1);
        $amount = $input['amount'] ? (float)$input['amount'] : null;
        if (!$userId) jsonResponse(['error' => 'ID utente mancante'], 400);

        $licenseKey = strtoupper('CLOFF-' . implode('-', [
            bin2hex(random_bytes(4)),
            bin2hex(random_bytes(4)),
            bin2hex(random_bytes(4))
        ]));

        $db = getDB();
        $stmt = $db->prepare("INSERT INTO licenses (user_id, license_key, plan, max_devices, amount) VALUES (?, ?, ?, ?, ?)");
        $stmt->execute([$userId, $licenseKey, $plan, $maxDevices, $amount]);
        jsonResponse(['status' => 'ok', 'license_key' => $licenseKey], 201);
        break;

    // ──────────────────────────────────────────────
    // RIGENERA SECRET KEY (admin o proprietario)
    // ──────────────────────────────────────────────
    case 'admin-regenerate-secret':
        $user = requireAuth();
        $input = json_decode(file_get_contents('php://input'), true);
        $id = (int)($input['id'] ?? 0);
        if (!$id) jsonResponse(['error' => 'ID mancante'], 400);
        if ($user['role'] !== 'admin' && $user['id'] !== $id) jsonResponse(['error' => 'Non autorizzato'], 403);

        $db = getDB();
        $newKey = generateSecretKey();
        $db->prepare("UPDATE users SET secret_key = ? WHERE id = ?")->execute([$newKey, $id]);
        jsonResponse(['status' => 'ok', 'secret_key' => $newKey]);
        break;

    // ──────────────────────────────────────────────
    // AVVIA SESSIONE (con controllo licenze)
    // ──────────────────────────────────────────────
    case 'session-start':
        $user = requireAuth();
        $input = json_decode(file_get_contents('php://input'), true);
        $fingerprint = $input['fingerprint'] ?? '';
        $deviceName = $input['device_name'] ?? '';
        $appName = $input['app'] ?? 'index';
        if (!$fingerprint) jsonResponse(['error' => 'Fingerprint mancante'], 400);

        $db = getDB();
        cleanupStaleSessions();

        // Controlla se esiste già sessione attiva per questo fingerprint
        $existing = $db->prepare("SELECT id FROM sessions WHERE user_id = ? AND device_fingerprint = ? AND is_active = 1");
        $existing->execute([$user['id'], $fingerprint]);
        if ($row = $existing->fetch()) {
            // Aggiorna heartbeat
            $db->prepare("UPDATE sessions SET last_heartbeat = datetime('now'), app_name = ?, php_session_id = ? WHERE id = ?")
                ->execute([$appName, session_id(), $row['id']]);
            jsonResponse(['status' => 'ok', 'session_id' => $row['id'], 'renewed' => true]);
            break;
        }

        // Conta sessioni attive
        $activeCount = $db->prepare("SELECT COUNT(*) FROM sessions WHERE user_id = ? AND is_active = 1");
        $activeCount->execute([$user['id']]);
        $count = $activeCount->fetchColumn();

        // Ottiene il massimo dispositivi dalle licenze dell'utente
        $maxLic = $db->prepare("SELECT COALESCE(MAX(max_devices), 1) FROM licenses WHERE user_id = ? AND is_active = 1");
        $maxLic->execute([$user['id']]);
        $maxDevices = (int)$maxLic->fetchColumn();

        if ($count >= $maxDevices) {
            jsonResponse([
                'status' => 'limit_reached',
                'error' => 'Limite dispositivi raggiunto',
                'message' => "Hai già $count sessione/i attiva/e su un massimo di $maxDevices consentiti dalla licenza.",
                'active_sessions' => $count,
                'max_devices' => $maxDevices
            ], 403);
            break;
        }

        // Crea nuova sessione
        $db->prepare("INSERT INTO sessions (user_id, php_session_id, device_fingerprint, device_name, ip_address, user_agent, app_name) VALUES (?, ?, ?, ?, ?, ?, ?)")
            ->execute([$user['id'], session_id(), $fingerprint, $deviceName, $_SERVER['REMOTE_ADDR'] ?? '', $_SERVER['HTTP_USER_AGENT'] ?? '', $appName]);
        $sessId = $db->lastInsertId();

        jsonResponse([
            'status' => 'ok',
            'session_id' => $sessId,
            'active_sessions' => $count + 1,
            'max_devices' => $maxDevices
        ]);
        break;

    // ──────────────────────────────────────────────
    // HEARTBEAT SESSIONE
    // ──────────────────────────────────────────────
    case 'session-heartbeat':
        $user = requireAuth();
        $input = json_decode(file_get_contents('php://input'), true);
        $fingerprint = $input['fingerprint'] ?? '';
        if (!$fingerprint) jsonResponse(['error' => 'Fingerprint mancante'], 400);

        $db = getDB();
        $db->prepare("UPDATE sessions SET last_heartbeat = datetime('now') WHERE user_id = ? AND device_fingerprint = ? AND is_active = 1")
            ->execute([$user['id'], $fingerprint]);
        jsonResponse(['status' => 'ok']);
        break;

    // ──────────────────────────────────────────────
    // TERMINA SESSIONE
    // ──────────────────────────────────────────────
    case 'session-end':
        $user = requireAuth();
        $input = json_decode(file_get_contents('php://input'), true);
        $fingerprint = $input['fingerprint'] ?? '';
        if (!$fingerprint) jsonResponse(['error' => 'Fingerprint mancante'], 400);

        getDB()->prepare("UPDATE sessions SET is_active = 0, last_heartbeat = datetime('now') WHERE user_id = ? AND device_fingerprint = ?")
            ->execute([$user['id'], $fingerprint]);
        jsonResponse(['status' => 'ok']);
        break;

    // ──────────────────────────────────────────────
    // DETTAGLIO UTENTE (admin, con licenze e sessioni)
    // ──────────────────────────────────────────────
    case 'admin-user-detail':
        requireAdmin();
        $id = (int)($_GET['id'] ?? 0);
        if (!$id) jsonResponse(['error' => 'ID mancante'], 400);

        $db = getDB();
        $user = $db->prepare("SELECT id, name, email, role, is_active, created_at, last_login FROM users WHERE id = ?");
        $user->execute([$id]);
        $userData = $user->fetch();
        if (!$userData) jsonResponse(['error' => 'Utente non trovato'], 404);

        $licenses = $db->prepare("SELECT * FROM licenses WHERE user_id = ? ORDER BY id DESC");
        $licenses->execute([$id]);
        $userData['licenses'] = $licenses->fetchAll();
        $userData['total_licenses'] = count($userData['licenses']);
        $stmtMax = $db->prepare("SELECT COALESCE(MAX(max_devices), 1) FROM licenses WHERE user_id = ? AND is_active = 1");
        $stmtMax->execute([$id]);
        $userData['max_devices_allowed'] = (int)$stmtMax->fetchColumn();

        $sessions = $db->prepare("SELECT id, device_fingerprint, device_name, ip_address, app_name, started_at, last_heartbeat FROM sessions WHERE user_id = ? AND is_active = 1 ORDER BY last_heartbeat DESC");
        $sessions->execute([$id]);
        $userData['active_sessions'] = $sessions->fetchAll();
        $userData['active_session_count'] = count($userData['active_sessions']);

        // Storage info
        $userData['storage_limit_mb'] = (int)($userData['storage_limit_mb'] ?? 100);
        $userData['storage_used'] = getStorageUsage((int)$id);
        $userData['storage_used_formatted'] = formatBytes($userData['storage_used']);
        $userData['storage_limit_formatted'] = $userData['storage_limit_mb'] . ' MB';
        $userData['storage_percent'] = $userData['storage_limit_mb'] > 0
            ? round(($userData['storage_used'] / ($userData['storage_limit_mb'] * 1024 * 1024)) * 100, 1)
            : 0;

        jsonResponse($userData);
        break;

    // ──────────────────────────────────────────────
    // ELENCO SESSIONI ATTIVE (admin)
    // ──────────────────────────────────────────────
    case 'admin-sessions':
        requireAdmin();
        $db = getDB();
        cleanupStaleSessions();
        $sessions = $db->query("
            SELECT s.*, u.name AS user_name, u.email AS user_email
            FROM sessions s
            JOIN users u ON u.id = s.user_id
            WHERE s.is_active = 1
            ORDER BY s.last_heartbeat DESC
            LIMIT 100
        ")->fetchAll();
        jsonResponse(['sessions' => $sessions]);
        break;

    // ──────────────────────────────────────────────
    // INVIO FEEDBACK dalle guide (pubblico) — salva + email via mail()
    // ──────────────────────────────────────────────
    case 'send-feedback':
        $input = json_decode(file_get_contents('php://input'), true) ?: [];
        $app   = trim($input['app'] ?? 'Clone Office');
        $type  = trim($input['type'] ?? 'Commento');
        $msg   = trim($input['msg'] ?? $input['message'] ?? '');
        $from  = trim($input['email'] ?? '');
        if ($msg === '') jsonResponse(['error' => 'Il messaggio è obbligatorio'], 400);
        if ($from !== '' && !filter_var($from, FILTER_VALIDATE_EMAIL)) jsonResponse(['error' => 'Email non valida'], 400);

        // Salva sempre nel DB (così l'admin li vede anche se la mail non parte)
        $db = getDB();
        $stmt = $db->prepare("INSERT INTO feedback (app, type, message, email, mailed) VALUES (?, ?, ?, ?, 0)");
        $stmt->execute([$app, $type, $msg, $from]);
        $fid = $db->lastInsertId();

        // Invia email se è configurato un destinatario
        $recipient = getSetting('feedback_email', '');
        $mailed = false;
        if ($recipient !== '' && filter_var($recipient, FILTER_VALIDATE_EMAIL)) {
            $subject = "[Feedback $app] $type";
            $body = "Tipo: $type\nApp: $app\nDa: " . ($from ?: 'anonimo') . "\nData: " . gmdate('Y-m-d H:i:s') . "\n\nMessaggio:\n$msg\n";
            $headers = "From: noreply@" . ($_SERVER['HTTP_HOST'] ?? 'localhost') . "\r\n";
            if ($from !== '') $headers .= "Reply-To: $from\r\n";
            $headers .= "Content-Type: text/plain; charset=UTF-8\r\n";
            $mailed = @mail($recipient, $subject, $body, $headers);
            if ($mailed) $db->prepare("UPDATE feedback SET mailed = 1 WHERE id = ?")->execute([$fid]);
        }
        jsonResponse(['ok' => true, 'mailed' => $mailed, 'configured' => $recipient !== '']);
        break;

    // ──────────────────────────────────────────────
    // IMPOSTAZIONI (admin): leggi tutte
    // ──────────────────────────────────────────────
    case 'admin-get-settings':
        requireAdmin();
        jsonResponse(['settings' => [
            'feedback_email' => getSetting('feedback_email', '')
        ]]);
        break;

    // ──────────────────────────────────────────────
    // IMPOSTAZIONI (admin): imposta email destinatario feedback
    // ──────────────────────────────────────────────
    case 'admin-set-feedback-email':
        requireAdmin();
        $input = json_decode(file_get_contents('php://input'), true) ?: [];
        $email = trim($input['email'] ?? '');
        if ($email !== '' && !filter_var($email, FILTER_VALIDATE_EMAIL)) jsonResponse(['error' => 'Email non valida'], 400);
        setSetting('feedback_email', $email);
        jsonResponse(['ok' => true, 'feedback_email' => $email]);
        break;

    // ──────────────────────────────────────────────
    // ELENCO FEEDBACK ricevuti (admin)
    // ──────────────────────────────────────────────
    case 'admin-feedback-list':
        requireAdmin();
        $rows = getDB()->query("SELECT id, app, type, message, email, mailed, created_at FROM feedback ORDER BY id DESC LIMIT 200")->fetchAll();
        jsonResponse(['feedback' => $rows]);
        break;

    default:
        jsonResponse(['error' => 'Azione non valida', 'available_actions' => [
            'new-auth', 'check-auth', 'user-info', 'logout', 'recovery',
            'admin-users', 'admin-user-add', 'admin-user-edit', 'admin-user-del',
            'admin-stats', 'admin-licenses', 'admin-license-add', 'admin-regenerate-secret',
            'session-start', 'session-heartbeat', 'session-end',
            'admin-user-detail', 'admin-sessions',
            'send-feedback', 'admin-get-settings', 'admin-set-feedback-email', 'admin-feedback-list'
        ]], 404);
}
