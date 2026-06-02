<?php
require_once __DIR__ . '/../../backend/storage.php';

header('Content-Type: application/json');
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: POST");
header("Access-Control-Allow-Headers: Content-Type");

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $user = requireAuth();
    $input = json_decode(file_get_contents('php://input'), true);

    if (isset($input['filename']) && isset($input['content'])) {
        $safeName = preg_replace('/[^a-zA-Z0-9_-]/', '_', $input['filename']) . '.json';
        $storageDir = getUserStorageDir((int)$user['id'], 'excel');
        $filepath = $storageDir . '/' . $safeName;

        $content = json_encode($input['content'], JSON_PRETTY_PRINT);
        $size = strlen($content);

        // Verifica quota
        $quota = checkStorageQuota((int)$user['id'], $size);
        if (!$quota['allowed']) {
            echo json_encode(['success' => false, 'message' => $quota['message']]);
            exit;
        }

        if (file_put_contents($filepath, $content)) {
            echo json_encode([
                'success' => true,
                'message' => 'File salvato con successo',
                'filename' => basename($filepath)
            ]);
        } else {
            echo json_encode([
                'success' => false,
                'message' => 'Errore nel salvataggio del file'
            ]);
        }
    } else {
        echo json_encode([
            'success' => false,
            'message' => 'Dati mancanti: filename e content sono obbligatori'
        ]);
    }
} else {
    echo json_encode([
        'success' => false,
        'message' => 'Metodo non consentito. Usa POST.'
    ]);
}
