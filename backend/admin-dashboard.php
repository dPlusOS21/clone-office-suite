<?php
/**
 * Admin Dashboard — Gestione utenti e licenze Clone Office
 * Accessibile solo a utenti con ruolo 'admin'
 */
require_once __DIR__ . '/config.php';

$user = getAuthUser();
if (!$user || $user['role'] !== 'admin') {
    header('Content-Type: text/html; charset=utf-8');
    http_response_code(403);
    echo '<!DOCTYPE html><html lang="it"><head><meta charset="UTF-8"><title>Accesso negato</title>';
    echo '<style>body{font-family:Segoe UI,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#f0f2f5;margin:0;}';
    echo '.card{background:#fff;border-radius:16px;padding:40px;text-align:center;box-shadow:0 8px 32px rgba(0,0,0,0.1);max-width:400px;}';
    echo 'h1{color:#d32f2f;font-size:24px;}p{color:#888;font-size:14px;}a{color:#e94560;text-decoration:none;}</style></head><body>';
    echo '<div class="card"><h1>⛔ Accesso negato</h1><p>Devi essere un amministratore per accedere a questa pagina.</p>';
    echo '<p><a href="../index.html">Torna alla Home</a></p></div></body></html>';
    exit;
}

// Verifica se il database è inizializzato
$db = getDB();
$stats = [];
try {
    $stats['total_users'] = $db->query("SELECT COUNT(*) FROM users")->fetchColumn();
    $stats['active_users'] = $db->query("SELECT COUNT(*) FROM users WHERE is_active = 1")->fetchColumn();
    $stats['total_licenses'] = $db->query("SELECT COUNT(*) FROM licenses")->fetchColumn();
    $stats['active_licenses'] = $db->query("SELECT COUNT(*) FROM licenses WHERE is_active = 1")->fetchColumn();
    $stats['total_revenue'] = $db->query("SELECT COALESCE(SUM(amount), 0) FROM licenses WHERE amount IS NOT NULL")->fetchColumn();
    $stats['latest_users'] = $db->query("SELECT name, email, created_at FROM users ORDER BY id DESC LIMIT 5")->fetchAll();
} catch (Exception $e) {
    // Fallback silenzioso
}
?>
<!DOCTYPE html>
<html lang="it">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Admin Dashboard — Clone Office</title>
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
<style>
* { margin:0; padding:0; box-sizing:border-box; font-family:'Segoe UI',sans-serif; }
body { background:#f0f2f5; min-height:100vh; }
.header { background:linear-gradient(135deg,#1a1a2e,#0f3460); color:#fff; padding:16px 30px; display:flex; justify-content:space-between; align-items:center; }
.header h1 { font-size:20px; font-weight:600; }
.header h1 i { color:#e94560; margin-right:10px; }
.header .user-info { font-size:13px; opacity:0.7; }
.header a { color:#fff; text-decoration:none; font-size:13px; opacity:0.7; }
.header a:hover { opacity:1; }
.main { max-width:1200px; margin:0 auto; padding:30px; }

/* Stats */
.stats { display:grid; grid-template-columns:repeat(auto-fit,minmax(180px,1fr)); gap:16px; margin-bottom:30px; }
.stat-card { background:#fff; border-radius:12px; padding:20px; box-shadow:0 2px 8px rgba(0,0,0,0.04); border:1px solid #eee; }
.stat-card .num { font-size:28px; font-weight:700; color:#1a1a2e; }
.stat-card .label { font-size:12px; color:#999; margin-top:4px; }
.stat-card .icon { font-size:24px; float:right; opacity:0.2; }

/* Tabs */
.tabs { display:flex; gap:4px; margin-bottom:24px; border-bottom:1px solid #ddd; }
.tab { padding:10px 20px; cursor:pointer; font-size:13px; font-weight:600; color:#888; border-bottom:2px solid transparent; transition:all 0.2s; background:none; border-top:none; border-left:none; border-right:none; }
.tab:hover { color:#333; }
.tab.active { color:#e94560; border-bottom-color:#e94560; }
.tab-content { display:none; }
.tab-content.active { display:block; }

/* Table */
.table-wrap {background:#fff;border-radius:12px;box-shadow:0 2px 8px rgba(0,0,0,0.04);border:1px solid #eee;overflow:hidden;}
table {width:100%;border-collapse:collapse;font-size:13px;}
th {background:#f8f9fa;text-align:left;padding:10px 14px;font-weight:600;color:#555;border-bottom:1px solid #eee;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;}
td {padding:10px 14px;border-bottom:1px solid #f5f5f5;color:#333;}
tr:hover td {background:#fafafa;}

.badge {display:inline-block;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600;}
.badge-admin {background:#fde8e0;color:#d04423;}
.badge-user {background:#e8f0fe;color:#2564c1;}
.badge-active {background:#e6f5ea;color:#217346;}
.badge-inactive {background:#f0f0f0;color:#999;}
.badge-base {background:#f0f0f0;color:#666;}
.badge-pro {background:#fff8e1;color:#f57f17;}
.badge-enterprise {background:#f3e5f5;color:#7b1fa2;}

.btn {padding:6px 14px;border:none;border-radius:6px;cursor:pointer;font-size:12px;font-weight:600;transition:all 0.2s;}
.btn-sm {padding:4px 10px;font-size:11px;}
.btn-primary {background:#1a1a2e;color:#fff;}
.btn-primary:hover {background:#0f3460;}
.btn-danger {background:#fff;color:#d32f2f;border:1px solid #ffcdd2;}
.btn-danger:hover {background:#ffebee;}
.btn-success {background:#217346;color:#fff;}
.btn-success:hover {background:#1b5e3a;}
.btn-warning {background:#fff8e1;color:#f57f17;border:1px solid #ffe082;}

.actions {display:flex;gap:6px;}

.modal-overlay {position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;z-index:9999;}
.modal {background:#fff;border-radius:12px;padding:28px;min-width:360px;max-width:500px;box-shadow:0 8px 32px rgba(0,0,0,0.25);}
.modal h2 {font-size:18px;margin-bottom:16px;color:#1a1a2e;}
.modal .field {margin-bottom:12px;}
.modal .field label {display:block;font-size:12px;font-weight:600;color:#555;margin-bottom:4px;}
.modal .field input, .modal .field select {width:100%;padding:8px 12px;border:1px solid #ddd;border-radius:6px;font-size:13px;outline:none;}
.modal .field input:focus,.modal .field select:focus {border-color:#e94560;}
.modal .modal-btns {display:flex;justify-content:flex-end;gap:8px;margin-top:16px;}
.modal-close {position:absolute;top:16px;right:20px;background:none;border:none;font-size:22px;cursor:pointer;color:#999;}

.toast {position:fixed;bottom:30px;right:30px;padding:14px 22px;border-radius:10px;color:#fff;font-size:13px;font-weight:600;z-index:99999;box-shadow:0 4px 20px rgba(0,0,0,0.2);animation:slideIn 0.3s ease;}
.toast-success {background:#217346;}
.toast-error {background:#d32f2f;}
@keyframes slideIn {from{transform:translateX(100px);opacity:0;}to{transform:translateX(0);opacity:1;}}

.empty {padding:40px;text-align:center;color:#999;font-size:14px;}

@media(max-width:768px) {
    .main {padding:16px;}
    .stats {grid-template-columns:repeat(2,1fr);}
    .header {padding:12px 16px;flex-wrap:wrap;gap:8px;}
    table {font-size:12px;}
    th,td {padding:8px 10px;}
}
</style>
</head>
<body>

<div class="header">
    <div>
        <h1><i class="fas fa-shield-alt"></i> Admin Dashboard</h1>
        <div class="user-info"><?= htmlspecialchars($user['name']) ?> · <?= htmlspecialchars($user['email']) ?></div>
    </div>
    <div style="display:flex;gap:14px;align-items:center;">
        <a href="#" onclick="goBackFromDashboard();return false;" title="Torna alla pagina da cui sei arrivato"><i class="fas fa-arrow-left"></i> Indietro</a>
        <a href="../index.html"><i class="fas fa-home"></i> Home</a>
    </div>
</div>
<script>
// Torna al punto da cui è stata richiamata la dashboard (referrer), con fallback
function goBackFromDashboard() {
    var ref = document.referrer;
    if (ref) {
        try {
            var u = new URL(ref);
            // stesso sito e non la dashboard stessa
            if (u.origin === location.origin && u.pathname.indexOf('admin-dashboard.php') === -1) {
                location.href = ref;
                return;
            }
        } catch (e) {}
    }
    if (history.length > 1) { history.back(); return; }
    location.href = '../index.html';
}
</script>

<div class="main">

    <!-- Statistiche -->
    <div class="stats">
        <div class="stat-card"><i class="fas fa-users icon"></i><div class="num"><?= $stats['total_users'] ?? 0 ?></div><div class="label">Utenti totali</div></div>
        <div class="stat-card"><i class="fas fa-user-check icon"></i><div class="num"><?= $stats['active_users'] ?? 0 ?></div><div class="label">Utenti attivi</div></div>
        <div class="stat-card"><i class="fas fa-key icon"></i><div class="num"><?= $stats['active_licenses'] ?? 0 ?></div><div class="label">Licenze attive</div></div>
        <div class="stat-card"><i class="fas fa-euro-sign icon"></i><div class="num">&euro;<?= number_format($stats['total_revenue'] ?? 0, 2) ?></div><div class="label">Ricavi totali</div></div>
    </div>

    <!-- Tabs -->
    <div class="tabs">
        <button class="tab active" data-tab="users"><i class="fas fa-users"></i> Utenti</button>
        <button class="tab" data-tab="licenses"><i class="fas fa-key"></i> Licenze</button>
        <button class="tab" data-tab="sessions"><i class="fas fa-laptop"></i> Sessioni attive</button>
        <button class="tab" data-tab="settings"><i class="fas fa-gear"></i> Impostazioni</button>
    </div>

    <!-- Tab Utenti -->
    <div class="tab-content active" id="tab-users">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
            <span style="font-size:14px;color:#888;" id="user-count">Caricamento...</span>
            <button class="btn btn-primary" onclick="addUser()"><i class="fas fa-plus"></i> Nuovo utente</button>
        </div>
        <div class="table-wrap">
            <table>
                <thead><tr>
                    <th>ID</th><th>Nome</th><th>Email</th><th>Ruolo</th><th>Licenze</th><th>Sessioni</th><th>Stato</th><th>Storage</th><th>Registrato</th><th>Ultimo accesso</th><th>Azioni</th>
                </tr></thead>
                <tbody id="users-tbody">
                    <tr><td colspan="11" style="text-align:center;color:#999;padding:30px;">Caricamento...</td></tr>
                </tbody>
            </table>
        </div>
    </div>

    <!-- Tab Licenze -->
    <div class="tab-content" id="tab-licenses">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
            <span style="font-size:14px;color:#888;" id="license-count">Caricamento...</span>
            <button class="btn btn-primary" onclick="addLicense()"><i class="fas fa-plus"></i> Nuova licenza</button>
        </div>
        <div class="table-wrap">
            <table>
                <thead><tr>
                    <th>ID</th><th>Utente</th><th>Chiave</th><th>Piano</th><th>Dispositivi</th><th>Importo</th><th>Stato</th><th>Data</th>
                </tr></thead>
                <tbody id="licenses-tbody">
                    <tr><td colspan="8" style="text-align:center;color:#999;padding:30px;">Caricamento...</td></tr>
                </tbody>
            </table>
        </div>
    </div>

    <!-- Tab Sessioni Attive -->
    <div class="tab-content" id="tab-sessions">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
            <span style="font-size:14px;color:#888;" id="session-count">Caricamento...</span>
            <button class="btn btn-sm" style="background:#f0f0f0;color:#666;border:1px solid #ddd;" onclick="loadSessions()"><i class="fas fa-sync"></i> Aggiorna</button>
        </div>
        <div class="table-wrap">
            <table>
                <thead><tr>
                    <th>ID</th><th>Utente</th><th>Dispositivo</th><th>IP</th><th>App</th><th>Iniziata</th><th>Ultimo heartbeat</th>
                </tr></thead>
                <tbody id="sessions-tbody">
                    <tr><td colspan="7" style="text-align:center;color:#999;padding:30px;">Caricamento...</td></tr>
                </tbody>
            </table>
        </div>
    </div>

    <!-- Tab Impostazioni -->
    <div class="tab-content" id="tab-settings">
        <div style="background:#fff;border-radius:12px;box-shadow:0 2px 8px rgba(0,0,0,0.04);border:1px solid #eee;padding:24px;margin-bottom:24px;max-width:640px;">
            <h2 style="font-size:17px;margin-bottom:6px;"><i class="fas fa-envelope" style="color:#e94560;"></i> Email per i feedback</h2>
            <p style="font-size:13px;color:#888;margin-bottom:16px;">Indirizzo a cui inviare i commenti inviati dagli utenti dalle guide delle app (Excel, Word, PowerPoint). I commenti vengono comunque sempre salvati qui sotto. L'invio usa la funzione <code>mail()</code> di PHP del server.</p>
            <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;">
                <input type="email" id="feedbackEmail" placeholder="destinatario@esempio.com" style="flex:1;min-width:240px;padding:10px 12px;border:1px solid #ccc;border-radius:8px;font-size:14px;">
                <button class="btn btn-primary" onclick="saveFeedbackEmail()"><i class="fas fa-save"></i> Salva</button>
            </div>
            <div id="feedbackEmailMsg" style="font-size:13px;margin-top:10px;color:#2e7d32;display:none;"></div>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
            <span style="font-size:14px;color:#888;" id="feedback-count">Feedback ricevuti</span>
            <button class="btn btn-sm" style="background:#f0f0f0;color:#666;border:1px solid #ddd;" onclick="loadFeedback()"><i class="fas fa-sync"></i> Aggiorna</button>
        </div>
        <div class="table-wrap">
            <table>
                <thead><tr>
                    <th>ID</th><th>App</th><th>Tipo</th><th>Messaggio</th><th>Email</th><th>Inviata</th><th>Data</th>
                </tr></thead>
                <tbody id="feedback-tbody">
                    <tr><td colspan="7" style="text-align:center;color:#999;padding:30px;">Caricamento...</td></tr>
                </tbody>
            </table>
        </div>
    </div>

</div>

<script>
const API = '../backend/api.php';

// --- Toast ---
function toast(msg, type) {
    const t = document.createElement('div');
    t.className = 'toast toast-' + (type||'success');
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 3000);
}

// --- Carica utenti ---
function loadUsers() {
    fetch(API + '?action=admin-users', { credentials: 'include' })
    .then(r => r.json())
    .then(data => {
        const tbody = document.getElementById('users-tbody');
        if (!data.users || data.users.length === 0) {
            tbody.innerHTML = '<tr><td colspan="10" class="empty">Nessun utente registrato</td></tr>';
            document.getElementById('user-count').textContent = '0 utenti';
            return;
        }
        document.getElementById('user-count').textContent = data.users.length + ' utenti';
        tbody.innerHTML = data.users.map(u => {
            const roleBadge = u.role === 'admin' ? 'badge-admin' : 'badge-user';
            const roleText = u.role === 'admin' ? 'Admin' : 'Utente';
            const statusBadge = u.is_active == 1 ? 'badge-active' : 'badge-inactive';
            const statusText = u.is_active == 1 ? 'Attivo' : 'Disabilitato';
            const lastLogin = u.last_login ? new Date(u.last_login + 'Z').toLocaleString('it-IT') : 'Mai';
            const regDate = u.created_at ? new Date(u.created_at + 'Z').toLocaleDateString('it-IT') : '-';

            // Licenze badge
            const licCount = parseInt(u.license_count || 0);

            // Sessioni
            const sessCount = parseInt(u.active_session_count || 0);
            const maxDev = parseInt(u.max_devices_allowed || 1);
            const limitReached = sessCount >= maxDev;
            const limitBadge = limitReached
                ? '<span class="badge" style="background:#fde8e0;color:#d32f2f;" title="Limite raggiunto">🔴 ' + sessCount + '/' + maxDev + '</span>'
                : '<span class="badge" style="background:#e6f5ea;color:#217346;" title="Sotto il limite">🟢 ' + sessCount + '/' + maxDev + '</span>';

            // Storage
            const storageLimit = parseInt(u.storage_limit_mb || 100);
            const storageUsed = parseInt(u.storage_used || 0);
            const storageUsedMB = (storageUsed / (1024 * 1024)).toFixed(1);
            const storagePct = Math.min(100, (storageUsed / (storageLimit * 1024 * 1024)) * 100);
            const storageColor = storagePct > 90 ? '#d32f2f' : storagePct > 70 ? '#f57f17' : '#217346';
            const storageBar = `<div style="display:flex;align-items:center;gap:6px;">
                <div style="flex:1;height:6px;background:#eee;border-radius:3px;overflow:hidden;min-width:60px;">
                    <div style="height:100%;width:${Math.min(storagePct, 100)}%;background:${storageColor};border-radius:3px;transition:width 0.3s;"></div>
                </div>
                <span style="font-size:10px;color:#888;white-space:nowrap;">${storageUsedMB}/${storageLimit} MB</span>
            </div>`;

            return `<tr>
                <td><strong>#${u.id}</strong></td>
                <td>${u.name}</td>
                <td>${u.email}</td>
                <td><span class="badge ${roleBadge}">${roleText}</span></td>
                <td><span class="badge badge-base">${licCount}</span></td>
                <td><span class="badge" style="background:#e8f0fe;color:#2564c1;cursor:help;" title="Sessioni attive: ${sessCount}">${sessCount}</span></td>
                <td>${limitBadge}</td>
                <td>${storageBar}</td>
                <td>${regDate}</td>
                <td style="font-size:11px;color:#888;">${lastLogin}</td>
                <td class="actions">
                    <button class="btn btn-sm btn-warning" onclick="editUser(${u.id},'${u.name.replace(/'/g,"\\'")}','${u.email}','${u.role}',${u.is_active},${storageLimit})"><i class="fas fa-edit"></i></button>
                    <button class="btn btn-sm btn-danger" onclick="deleteUser(${u.id},'${u.name.replace(/'/g,"\\'")}')"><i class="fas fa-trash"></i></button>
                </td>
            </tr>`;
        }).join('');
    })
    .catch(err => {
        document.getElementById('users-tbody').innerHTML = '<tr><td colspan="10" class="empty">Errore caricamento</td></tr>';
    });
}

// --- Carica licenze ---
function loadLicenses() {
    fetch(API + '?action=admin-licenses', { credentials: 'include' })
    .then(r => r.json())
    .then(data => {
        const tbody = document.getElementById('licenses-tbody');
        if (!data.licenses || data.licenses.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" class="empty">Nessuna licenza</td></tr>';
            document.getElementById('license-count').textContent = '0 licenze';
            return;
        }
        document.getElementById('license-count').textContent = data.licenses.length + ' licenze';
        tbody.innerHTML = data.licenses.map(l => {
            const planBadge = 'badge-' + l.plan;
            const statusBadge = l.is_active == 1 ? 'badge-active' : 'badge-inactive';
            const statusText = l.is_active == 1 ? 'Attiva' : 'Disabilitata';
            const date = l.created_at ? new Date(l.created_at + 'Z').toLocaleDateString('it-IT') : '-';
            return `<tr>
                <td>#${l.id}</td>
                <td>${l.user_name}<br><span style="font-size:11px;color:#999;">${l.user_email}</span></td>
                <td style="font-family:monospace;font-size:11px;">${l.license_key}</td>
                <td><span class="badge ${planBadge}">${l.plan.charAt(0).toUpperCase()+l.plan.slice(1)}</span></td>
                <td>${l.device_count}/${l.max_devices}</td>
                <td>${l.amount ? '€' + parseFloat(l.amount).toFixed(2) : '-'}</td>
                <td><span class="badge ${statusBadge}">${statusText}</span></td>
                <td>${date}</td>
            </tr>`;
        }).join('');
    })
    .catch(() => {
        document.getElementById('licenses-tbody').innerHTML = '<tr><td colspan="8" class="empty">Errore caricamento</td></tr>';
    });
}

// --- Aggiungi utente ---
function addUser() {
    showModal('Nuovo utente', `
        <div class="field"><label>Nome</label><input type="text" id="m-name" placeholder="Nome completo"></div>
        <div class="field"><label>Email</label><input type="email" id="m-email" placeholder="email@esempio.com"></div>
        <div class="field"><label>Ruolo</label><select id="m-role"><option value="user">Utente</option><option value="admin">Admin</option></select></div>
        <div class="field"><label>Limite storage (MB)</label><input type="number" id="m-storage-limit" value="100" min="1" max="999999"></div>
    `, () => {
        const name = document.getElementById('m-name').value.trim();
        const email = document.getElementById('m-email').value.trim();
        const role = document.getElementById('m-role').value;
        const storage_limit_mb = parseInt(document.getElementById('m-storage-limit').value) || 100;
        if (!name || !email) { toast('Compila tutti i campi', 'error'); return; }

        fetch(API + '?action=admin-user-add', {
            method: 'POST', headers: {'Content-Type':'application/json'},
            body: JSON.stringify({name, email, role, storage_limit_mb}),
            credentials: 'include'
        })
        .then(r => r.json())
        .then(d => {
            if (d.error) { toast(d.error, 'error'); return; }
            toast('Utente creato! Chiave segreta: ' + d.secret_key);
            closeModal();
            loadUsers();
        });
    });
}

// --- Modifica utente ---
function editUser(id, name, email, role, isActive, storageLimit) {
    showModal('Modifica utente #' + id, `
        <div class="field"><label>Nome</label><input type="text" id="m-name" value="${name}"></div>
        <div class="field"><label>Email</label><input type="email" id="m-email" value="${email}"></div>
        <div class="field"><label>Ruolo</label><select id="m-role"><option value="user" ${role==='user'?'selected':''}>Utente</option><option value="admin" ${role==='admin'?'selected':''}>Admin</option></select></div>
        <div class="field"><label>Stato</label><select id="m-active"><option value="1" ${isActive?'selected':''}>Attivo</option><option value="0" ${!isActive?'selected':''}>Disabilitato</option></select></div>
        <div class="field"><label>Limite storage (MB)</label><input type="number" id="m-storage-limit" value="${storageLimit || 100}" min="1" max="999999"></div>
        <div class="field"><label><input type="checkbox" id="m-reset-secret"> Rigenera chiave segreta</label></div>
    `, () => {
        const body = {
            id: id,
            name: document.getElementById('m-name').value.trim(),
            email: document.getElementById('m-email').value.trim(),
            role: document.getElementById('m-role').value,
            is_active: parseInt(document.getElementById('m-active').value),
            storage_limit_mb: parseInt(document.getElementById('m-storage-limit').value) || 100,
            reset_secret: document.getElementById('m-reset-secret').checked
        };
        if (!body.name || !body.email) { toast('Compila tutti i campi', 'error'); return; }

        fetch(API + '?action=admin-user-edit', {
            method: 'POST', headers: {'Content-Type':'application/json'},
            body: JSON.stringify(body),
            credentials: 'include'
        })
        .then(r => r.json())
        .then(d => {
            if (d.error) { toast(d.error, 'error'); return; }
            if (d.new_secret_key) toast('Chiave rigenerata: ' + d.new_secret_key);
            else toast('Utente aggiornato');
            closeModal();
            loadUsers();
        });
    });
}

// --- Elimina utente ---
function deleteUser(id, name) {
    if (!confirm('Eliminare l\'utente "' + name + '" (#'.concat(id, ')?\nVerranno eliminate anche le sue licenze e i dispositivi associati.'))) return;

    fetch(API + '?action=admin-user-del', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({id}),
        credentials: 'include'
    })
    .then(r => r.json())
    .then(d => {
        if (d.error) { toast(d.error, 'error'); return; }
        toast('Utente eliminato');
        loadUsers();
        loadLicenses();
    });
}

// --- Aggiungi licenza ---
function addLicense() {
    // Carica lista utenti per il select
    fetch(API + '?action=admin-users', { credentials: 'include' })
    .then(r => r.json())
    .then(data => {
        const users = data.users || [];
        const opts = users.map(u => `<option value="${u.id}">${u.name} (${u.email})</option>`).join('') || '<option value="">Nessun utente</option>';

        showModal('Nuova licenza', `
            <div class="field"><label>Utente</label><select id="m-user">${opts}</select></div>
            <div class="field"><label>Piano</label><select id="m-plan"><option value="base">Base</option><option value="pro" selected>Pro</option><option value="enterprise">Enterprise</option></select></div>
            <div class="field"><label>Dispositivi max</label><input type="number" id="m-devices" value="1" min="1" max="99"></div>
            <div class="field"><label>Importo (€) — opzionale</label><input type="number" id="m-amount" value="0" min="0" step="0.01"></div>
        `, () => {
            const user_id = parseInt(document.getElementById('m-user').value);
            const plan = document.getElementById('m-plan').value;
            const max_devices = parseInt(document.getElementById('m-devices').value);
            const amount = parseFloat(document.getElementById('m-amount').value) || null;
            if (!user_id) { toast('Seleziona un utente', 'error'); return; }

            fetch(API + '?action=admin-license-add', {
                method: 'POST', headers: {'Content-Type':'application/json'},
                body: JSON.stringify({user_id, plan, max_devices, amount}),
                credentials: 'include'
            })
            .then(r => r.json())
            .then(d => {
                if (d.error) { toast(d.error, 'error'); return; }
                toast('Licenza creata: ' + d.license_key);
                closeModal();
                loadLicenses();
            });
        });
    });
}

// --- Tabs ---
document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        tab.classList.add('active');
        document.getElementById('tab-' + tab.dataset.tab).classList.add('active');
        if (tab.dataset.tab === 'settings') { loadFeedbackEmail(); loadFeedback(); }
    });
});

// --- Impostazioni: email feedback ---
function loadFeedbackEmail() {
    fetch(API + '?action=admin-get-settings', { credentials: 'include' })
    .then(r => r.json())
    .then(data => {
        if (data.settings) document.getElementById('feedbackEmail').value = data.settings.feedback_email || '';
    });
}
function saveFeedbackEmail() {
    const email = document.getElementById('feedbackEmail').value.trim();
    fetch(API + '?action=admin-set-feedback-email', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
    })
    .then(r => r.json())
    .then(data => {
        const m = document.getElementById('feedbackEmailMsg');
        m.style.display = 'block';
        if (data.error) { m.style.color = '#c62828'; m.textContent = '⚠️ ' + data.error; }
        else { m.style.color = '#2e7d32'; m.textContent = email ? '✓ Email salvata: i feedback verranno inviati a ' + email : '✓ Invio email disattivato (nessun destinatario).'; toast('Impostazione salvata', 'success'); }
    });
}
function loadFeedback() {
    fetch(API + '?action=admin-feedback-list', { credentials: 'include' })
    .then(r => r.json())
    .then(data => {
        const tb = document.getElementById('feedback-tbody');
        const rows = data.feedback || [];
        document.getElementById('feedback-count').textContent = rows.length + ' feedback ricevuti';
        if (!rows.length) { tb.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#999;padding:30px;">Nessun feedback ancora.</td></tr>'; return; }
        tb.innerHTML = rows.map(f => `<tr>
            <td>${f.id}</td>
            <td>${esc(f.app || '')}</td>
            <td>${esc(f.type || '')}</td>
            <td style="max-width:320px;white-space:normal;">${esc(f.message || '')}</td>
            <td>${esc(f.email || '—')}</td>
            <td>${f.mailed == 1 ? '<span style="color:#2e7d32;">✓ sì</span>' : '<span style="color:#999;">no</span>'}</td>
            <td>${esc(f.created_at || '')}</td>
        </tr>`).join('');
    });
}
function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

// --- Modal ---
let _modalCallback = null;
function showModal(title, body, onConfirm) {
    _modalCallback = onConfirm;
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'modal-overlay';
    overlay.innerHTML = `<div class="modal" style="position:relative;">
        <button class="modal-close" onclick="closeModal()">✕</button>
        <h2>${title}</h2>
        ${body}
        <div class="modal-btns">
            <button class="btn" style="background:#fff;border:1px solid #ddd;color:#333;" onclick="closeModal()">Annulla</button>
            <button class="btn btn-primary" id="modal-confirm">Salva</button>
        </div>
    </div>`;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });
    document.getElementById('modal-confirm').addEventListener('click', () => {
        if (_modalCallback) _modalCallback();
    });
    // Enter per conferma
    overlay.querySelector('.modal')?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') {
            e.preventDefault();
            if (_modalCallback) _modalCallback();
        }
    });
}

function closeModal() {
    const m = document.getElementById('modal-overlay');
    if (m) m.remove();
    _modalCallback = null;
}

// --- Carica sessioni attive ---
function loadSessions() {
    fetch(API + '?action=admin-sessions', { credentials: 'include' })
    .then(r => r.json())
    .then(data => {
        const tbody = document.getElementById('sessions-tbody');
        if (!data.sessions || data.sessions.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="empty">Nessuna sessione attiva</td></tr>';
            document.getElementById('session-count').textContent = '0 sessioni attive';
            return;
        }
        document.getElementById('session-count').textContent = data.sessions.length + ' sessioni attive';
        tbody.innerHTML = data.sessions.map(s => {
            const started = s.started_at ? new Date(s.started_at + 'Z').toLocaleString('it-IT') : '-';
            const heartbeat = s.last_heartbeat ? new Date(s.last_heartbeat + 'Z').toLocaleString('it-IT') : '-';
            const deviceName = s.device_name || s.device_fingerprint || 'Sconosciuto';
            const appBadge = s.app_name && s.app_name !== 'index'
                ? '<span class="badge badge-pro">' + s.app_name + '</span>'
                : '<span class="badge badge-base">Home</span>';
            return `<tr>
                <td>#${s.id}</td>
                <td>${s.user_name}<br><span style="font-size:11px;color:#999;">${s.user_email}</span></td>
                <td style="font-size:12px;" title="Fingerprint: ${s.device_fingerprint || ''}">
                    <i class="fas fa-laptop" style="margin-right:4px;color:#888;"></i>${deviceName}
                </td>
                <td style="font-size:11px;font-family:monospace;">${s.ip_address || '-'}</td>
                <td>${appBadge}</td>
                <td style="font-size:11px;color:#888;">${started}</td>
                <td style="font-size:11px;color:#888;">${heartbeat}</td>
            </tr>`;
        }).join('');
    })
    .catch(() => {
        document.getElementById('sessions-tbody').innerHTML = '<tr><td colspan="7" class="empty">Errore caricamento</td></tr>';
    });
}

// --- Init ---
document.addEventListener('DOMContentLoaded', () => {
    loadUsers();
    loadLicenses();
    loadSessions();
});
</script>
</body>
</html>
