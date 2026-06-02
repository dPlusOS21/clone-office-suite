<!DOCTYPE html>
<html lang="it">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Autenticazione Clone Office</title>
<style>
* { margin:0; padding:0; box-sizing:border-box; font-family:'Segoe UI',sans-serif; }
body { background:#f0f2f5; display:flex; align-items:center; justify-content:center; min-height:100vh; padding:20px; }
.card { background:#fff; border-radius:16px; padding:32px; max-width:420px; width:100%; box-shadow:0 8px 32px rgba(0,0,0,0.1); text-align:center; }
h1 { font-size:22px; color:#1a1a2e; margin-bottom:8px; }
p { color:#888; font-size:14px; margin-bottom:20px; line-height:1.5; }
.logo { font-size:36px; color:#e94560; margin-bottom:12px; }
.field { margin-bottom:14px; text-align:left; }
.field label { display:block; font-size:12px; font-weight:600; color:#555; margin-bottom:4px; }
.field input { width:100%; padding:10px 14px; border:1px solid #ddd; border-radius:8px; font-size:14px; outline:none; transition:border-color 0.2s; }
.field input:focus { border-color:#e94560; }
.btn { width:100%; padding:12px; background:#1a1a2e; color:#fff; border:none; border-radius:8px; font-size:15px; font-weight:600; cursor:pointer; transition:background 0.3s; }
.btn:hover { background:#0f3460; }
.btn:disabled { opacity:0.5; cursor:default; }
.error { color:#d32f2f; font-size:13px; margin-top:8px; display:none; }
.success { color:#217346; font-size:14px; font-weight:600; margin:16px 0; }
.key-box { background:#f8f8f8; border:2px dashed #ddd; border-radius:8px; padding:16px; margin:12px 0; font-family:monospace; font-size:18px; letter-spacing:2px; word-break:break-all; color:#1a1a2e; user-select:all; }
.key-note { font-size:11px; color:#999; margin-top:8px; }
.hidden { display:none; }
.spinner { display:inline-block; width:40px; height:40px; border:4px solid #f0f0f0; border-top-color:#e94560; border-radius:50%; animation:spin 0.8s linear infinite; margin:12px auto; }
@keyframes spin { to { transform:rotate(360deg); } }
</style>
</head>
<body>
<div class="card" id="app">
    <div class="logo">🔐</div>
    <h1 id="title">Verifica in corso...</h1>
    <p id="subtitle">Stabilisco la connessione sicura</p>
    <div class="spinner" id="spinner"></div>
    <div id="content"></div>
</div>

<script>
<?php
require_once __DIR__ . '/config.php';

$token = $_GET['token'] ?? '';
if (!$token) {
    echo "document.getElementById('title').textContent = 'Link non valido';";
    echo "document.getElementById('subtitle').textContent = 'Il token di autenticazione è mancante o non valido.';";
    echo "document.getElementById('spinner').classList.add('hidden');";
    exit;
}

$db = getDB();
$stmt = $db->prepare("SELECT * FROM auth_requests WHERE token = ? AND status IN ('pending','scanned') AND (expires_at IS NULL OR expires_at > datetime('now'))");
$stmt->execute([$token]);
$req = $stmt->fetch();

if (!$req) {
    $stmt2 = $db->prepare("SELECT status FROM auth_requests WHERE token = ?");
    $stmt2->execute([$token]);
    $existing = $stmt2->fetch();
    if ($existing && $existing['status'] === 'completed') {
        echo "document.getElementById('title').textContent = 'Accesso già confermato';";
        echo "document.getElementById('subtitle').textContent = 'Questo link è già stato utilizzato. Puoi chiudere questa finestra.';";
    } else {
        echo "document.getElementById('title').textContent = 'Link scaduto o non valido';";
        echo "document.getElementById('subtitle').textContent = 'Torna al computer e genera un nuovo codice QR.';";
    }
    echo "document.getElementById('spinner').classList.add('hidden');";
    exit;
}

// Marca come scansionato
$db->prepare("UPDATE auth_requests SET status = 'scanned' WHERE token = ?")->execute([$token]);
?>

document.getElementById('spinner').classList.add('hidden');
const TOKEN = <?= json_encode($token) ?>;
const API = '../backend/api.php';

// Verifica se l'utente ha già una sessione (es. ha già effettuato l'accesso dal telefono)
fetch(API + '?action=user-info', { credentials: 'include' })
.then(r => r.json())
.then(data => {
    if (data.authenticated && data.user) {
        showConfirmLogin(data.user);
    } else {
        // Controlla se esiste cookie di sessione precedente
        showRegisterForm();
    }
})
.catch(() => showRegisterForm());

function showRegisterForm() {
    document.getElementById('title').innerHTML = 'Benvenuto in <strong>Clone Office</strong>';
    document.getElementById('subtitle').textContent = 'Registrati con nome ed email per iniziare.';
    document.getElementById('content').innerHTML = `
        <div class="field">
            <label for="name">Nome</label>
            <input type="text" id="name" placeholder="Il tuo nome" autocomplete="name">
        </div>
        <div class="field">
            <label for="email">Email</label>
            <input type="email" id="email" placeholder="tua@email.com" autocomplete="email">
        </div>
        <div id="error-msg" class="error"></div>
        <button class="btn" id="btn-register">Registrati e accedi</button>
        <p style="margin-top:16px;font-size:11px;color:#aaa;">Il primo utente registrato diventa amministratore</p>
    `;
    document.getElementById('btn-register').addEventListener('click', doRegister);
    document.getElementById('name').addEventListener('keydown', e => { if (e.key === 'Enter') doRegister(); });
    document.getElementById('email').addEventListener('keydown', e => { if (e.key === 'Enter') doRegister(); });
    document.getElementById('name').focus();
}

function doRegister() {
    const name = document.getElementById('name').value.trim();
    const email = document.getElementById('email').value.trim();
    const errEl = document.getElementById('error-msg');
    errEl.style.display = 'none';

    if (!name || !email) {
        errEl.textContent = 'Compila tutti i campi.'; errEl.style.display = 'block'; return;
    }
    if (!email.includes('@')) {
        errEl.textContent = 'Inserisci un indirizzo email valido.'; errEl.style.display = 'block'; return;
    }

    const btn = document.getElementById('btn-register');
    btn.disabled = true; btn.textContent = 'Registrazione...';

    fetch(API + '?action=register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, token: TOKEN })
    })
    .then(r => r.json())
    .then(data => {
        if (data.error) {
            errEl.textContent = data.error; errEl.style.display = 'block';
            btn.disabled = false; btn.textContent = 'Registrati e accedi';
            return;
        }
        showSuccess(data.user.name, data.user.secret_key);
    })
    .catch(err => {
        errEl.textContent = 'Errore di connessione: ' + err.message; errEl.style.display = 'block';
        btn.disabled = false; btn.textContent = 'Registrati e accedi';
    });
}

function showConfirmLogin(user) {
    document.getElementById('title').textContent = 'Ciao, ' + user.name + '!';
    document.getElementById('subtitle').textContent = 'Confermi di voler accedere?';
    document.getElementById('content').innerHTML = `
        <div style="background:#f8faff;border:1px solid #e8f0fe;border-radius:8px;padding:16px;margin-bottom:16px;text-align:left;">
            <div style="font-size:13px;color:#555;margin-bottom:6px;"><strong>Nome:</strong> ${user.name}</div>
            <div style="font-size:13px;color:#555;"><strong>Email:</strong> ${user.email}</div>
        </div>
        <div id="error-msg" class="error"></div>
        <button class="btn" id="btn-confirm">Conferma accesso</button>
        <p style="margin-top:12px;font-size:12px;color:#999;">Chiudi per annullare</p>
    `;
    document.getElementById('btn-confirm').addEventListener('click', () => doConfirm(user));
}

function doConfirm(user) {
    const btn = document.getElementById('btn-confirm');
    btn.disabled = true; btn.textContent = 'Accesso in corso...';

    fetch(API + '?action=confirm-auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: TOKEN, user_id: user.id })
    })
    .then(r => r.json())
    .then(data => {
        if (data.error) {
            document.getElementById('error-msg').textContent = data.error;
            document.getElementById('error-msg').style.display = 'block';
            btn.disabled = false; btn.textContent = 'Conferma accesso';
            return;
        }
        showSuccess(user.name, null);
    })
    .catch(err => {
        document.getElementById('error-msg').textContent = 'Errore: ' + err.message;
        document.getElementById('error-msg').style.display = 'block';
        btn.disabled = false; btn.textContent = 'Conferma accesso';
    });
}

function showSuccess(name, secretKey) {
    document.getElementById('title').textContent = '✅ Accesso effettuato!';
    document.getElementById('subtitle').innerHTML = 'Ciao <strong>' + name + '</strong>, ora puoi chiudere questa finestra e tornare al computer.';
    document.getElementById('content').innerHTML = `
        <div class="success">Accesso completato con successo</div>
        ${secretKey ? `
        <div style="background:#fff8e1;border:1px solid #ffe082;border-radius:8px;padding:16px;margin:12px 0;text-align:left;">
            <div style="font-weight:600;color:#795548;margin-bottom:6px;">🔑 La tua chiave segreta</div>
            <div class="key-box">${secretKey}</div>
            <div class="key-note">Conserva questa chiave in un posto sicuro. Ti servirà per recuperare l'accesso se perdi il dispositivo.</div>
        </div>
        ` : ''}
        <p style="font-size:14px;color:#888;margin-top:8px;">✅ Puoi chiudere questa pagina</p>
    `;
}
</script>
</body>
</html>
