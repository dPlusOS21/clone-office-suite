<?php
/**
 * Diagnostica — Verifica requisiti autenticazione
 *
 * Accedi a: backend/diagnostica.php
 */
header('Content-Type: text/html; charset=utf-8');
?>
<!DOCTYPE html>
<html lang="it">
<head><meta charset="UTF-8"><title>Diagnostica Clone Office</title>
<style>
body { font-family: 'Segoe UI', sans-serif; background: #f0f2f5; padding: 40px; max-width: 700px; margin: 0 auto; }
h1 { color: #1a1a2e; font-size: 24px; }
.card { background: #fff; border-radius: 12px; padding: 20px; margin: 12px 0; box-shadow: 0 2px 8px rgba(0,0,0,0.06); }
.pass { color: #217346; }
.fail { color: #d32f2f; }
.warn { color: #e65100; }
code { background: #f5f5f5; padding: 2px 6px; border-radius: 4px; font-size: 13px; }
</style>
</head>
<body>
<h1>🔍 Diagnostica sistema autenticazione</h1>

<div class="card">
    <h3>📋 Informazioni server</h3>
    <p><strong>PHP Version:</strong> <?= phpversion() ?></p>
    <p><strong>Server Software:</strong> <?= $_SERVER['SERVER_SOFTWARE'] ?? 'N/A' ?></p>
    <p><strong>Document Root:</strong> <?= $_SERVER['DOCUMENT_ROOT'] ?? 'N/A' ?></p>
    <p><strong>__DIR__:</strong> <?= __DIR__ ?></p>
</div>

<div class="card">
    <h3>🔌 Estensioni PHP</h3>
    <?php
    $checks = [
        'PDO' => extension_loaded('pdo'),
        'PDO SQLite' => extension_loaded('pdo_sqlite'),
        'SQLite3' => extension_loaded('sqlite3'),
        'JSON' => extension_loaded('json'),
        'Session' => extension_loaded('session'),
    ];
    foreach ($checks as $name => $ok) {
        $icon = $ok ? '✅' : '❌';
        $cls = $ok ? 'pass' : 'fail';
        echo "<p class=\"$cls\">$icon <strong>$name</strong> — " . ($ok ? 'Disponibile' : 'NON disponibile') . "</p>";
    }
    ?>
</div>

<div class="card">
    <h3>📂 Permessi directory data/</h3>
    <?php
    $dataDir = dirname(__DIR__) . '/data';
    if (!file_exists($dataDir)) {
        echo '<p class="fail">❌ La cartella <code>/data</code> NON esiste</p>';
        $created = @mkdir($dataDir, 0755, true);
        echo $created ? '<p class="pass">✅ Cartella creata con successo</p>' : '<p class="fail">❌ Impossibile creare la cartella (permessi?)</p>';
    } else {
        echo '<p class="pass">✅ La cartella <code>/data</code> esiste</p>';
        echo '<p>Permessi attuali: <code>' . substr(sprintf('%o', fileperms($dataDir)), -4) . '</code></p>';
        echo '<p>Scrivibile: ' . (is_writable($dataDir) ? '<span class="pass">✅ Sì</span>' : '<span class="fail">❌ No</span>') . '</p>';
    }
    ?>
</div>

<div class="card">
    <h3>🗄️ Test database SQLite</h3>
    <?php
    if (extension_loaded('pdo_sqlite')) {
        try {
            $testDb = new PDO('sqlite:' . dirname(__DIR__) . '/data/test_write.db');
            $testDb->exec('CREATE TABLE IF NOT EXISTS test (id INTEGER PRIMARY KEY, val TEXT)');
            $testDb->exec('INSERT INTO test (val) VALUES (\'OK\')');
            $val = $testDb->query('SELECT val FROM test LIMIT 1')->fetchColumn();
            unset($testDb);
            unlink(dirname(__DIR__) . '/data/test_write.db');
            echo "<p class=\"pass\">✅ Database SQLite: scrittura/lettura OK (valore: $val)</p>";
        } catch (Exception $e) {
            echo '<p class="fail">❌ Errore database: ' . htmlspecialchars($e->getMessage()) . '</p>';
        }
    } else {
        echo '<p class="fail">❌ PDO SQLite non disponibile — impossibile testare</p>';
        echo '<p class="warn">⚠️ Soluzione: passa a MySQL o contatta Altervista per abilitare SQLite</p>';
    }
    ?>
</div>

<div class="card">
    <h3>🔗 Test API</h3>
    <?php
    $apiUrl = (isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] === 'on' ? 'https' : 'http') . '://' . $_SERVER['HTTP_HOST'] . dirname($_SERVER['SCRIPT_NAME']) . '/api.php?action=user-info';
    echo "<p>URL API testata: <code>$apiUrl</code></p>";

    $ctx = stream_context_create(['http' => ['timeout' => 5]]);
    $result = @file_get_contents($apiUrl, false, $ctx);
    if ($result === false) {
        echo '<p class="fail">❌ API non raggiungibile — verifica il percorso</p>';
    } else {
        $data = json_decode($result, true);
        if ($data) {
            echo '<p class="pass">✅ API risponde correttamente</p>';
            echo '<p>Risposta: <code>' . htmlspecialchars($result) . '</code></p>';
        } else {
            echo '<p class="fail">❌ API risposta non JSON valida: <code>' . htmlspecialchars($result) . '</code></p>';
        }
    }
    ?>
</div>

<div class="card">
    <h3>📝 Sessioni PHP</h3>
    <?php
    $sessPath = session_save_path() ?: 'default';
    echo "<p>Salvataggio sessioni: <code>$sessPath</code></p>";

    $sessWritable = is_writable($sessPath) || $sessPath === 'default';
    echo $sessWritable ? '<p class="pass">✅ Scrivibile</p>' : '<p class="fail">❌ Non scrivibile</p>';

    session_name('CLONE_OFFICE_SID');
    session_start();
    $_SESSION['test'] = 'funziona';
    echo '<p class="pass">✅ Sessioni PHP funzionanti (ID: ' . session_id() . ')</p>';
    session_write_close();
    ?>
</div>

<div class="card">
    <h3>✅ Consigli</h3>
    <?php
    if (!extension_loaded('pdo_sqlite')) {
        echo '<p class="warn">⚠️ SQLite non è disponibile su questo server. Dobbiamo migrare a MySQL.</p>';
        echo '<p>Altervista fornisce MySQL. Controlla le credenziali nel pannello di controllo e le trovi anche tramite phpMyAdmin. Dobbiamo aggiornare config.php per usare MySQL.</p>';
    } elseif (!is_writable(dirname(__DIR__) . '/data')) {
        echo '<p class="warn">⚠️ La cartella /data/ non è scrivibile. Imposta permessi 755 o 777 tramite FTP.</p>';
    } else {
        echo '<p class="pass">✅ Tutto OK! Il sistema di autenticazione dovrebbe funzionare.</p>';
    }
    ?>
</div>
</body>
</html>
