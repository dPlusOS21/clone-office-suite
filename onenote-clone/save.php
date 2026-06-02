<?php
require_once __DIR__ . '/../backend/storage.php';

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $user = requireAuth();
    $input = json_decode(file_get_contents('php://input'), true);
    $data = $input['data'] ?? '';
    $filename = $input['filename'] ?? 'notebook_' . date('Y-m-d_H-i-s');

    $filename = preg_replace('/[^a-zA-Z0-9_-]/', '_', $filename);

    try {
        $storageDir = getUserStorageDir((int)$user['id'], 'onenote');
        $filepath = $storageDir . '/' . $filename . '.json';
        $contentToSave = is_string($data) ? $data : json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);

        // Verifica quota
        $size = strlen($contentToSave);
        $quota = checkStorageQuota((int)$user['id'], $size);
        if (!$quota['allowed']) {
            echo json_encode(['success' => false, 'error' => $quota['message']]);
            exit;
        }

        if (file_put_contents($filepath, $contentToSave)) {
            echo json_encode([
                'success' => true,
                'message' => 'Blocco appunti salvato con successo',
                'filepath' => $filepath,
                'saved_at' => date('Y-m-d H:i:s'),
                'filename' => basename($filepath)
            ]);
        } else {
            throw new Exception('Errore nel salvataggio del file');
        }
    } catch (Exception $e) {
        echo json_encode([
            'success' => false,
            'error' => $e->getMessage()
        ]);
    }
} else {
    echo json_encode([
        'success' => false,
        'error' => 'Metodo non consentito'
    ]);
}
