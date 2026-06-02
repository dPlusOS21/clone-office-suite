<?php
require_once __DIR__ . '/../backend/storage.php';

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $user = requireAuth();
    $input = json_decode(file_get_contents('php://input'), true);
    $filename = $input['filename'] ?? '';

    try {
        $safeName = basename($filename);
        $filepath = getUserStorageDir((int)$user['id'], 'word') . '/' . $safeName;

        if (!file_exists($filepath)) {
            throw new Exception('File non trovato');
        }

        $content = file_get_contents($filepath);

        if ($content === false) {
            throw new Exception('Errore nella lettura del file');
        }

        echo json_encode([
            'success' => true,
            'content' => $content,
            'filename' => basename($filename, '.html'),
            'filepath' => $filepath,
            'loaded_at' => gmdate('Y-m-d H:i:s')
        ]);

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
