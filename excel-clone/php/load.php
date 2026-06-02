<?php
require_once __DIR__ . '/../../backend/storage.php';

header('Content-Type: application/json');
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: POST");
header("Access-Control-Allow-Headers: Content-Type");

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $user = requireAuth();
    $input = json_decode(file_get_contents('php://input'), true);

    if (isset($input['filename'])) {
        $safeName = preg_replace('/[^a-zA-Z0-9_-]/', '_', $input['filename']) . '.json';
        $filepath = getUserStorageDir((int)$user['id'], 'excel') . '/' . $safeName;

        if (file_exists($filepath)) {
            $content = file_get_contents($filepath);
            $data = json_decode($content, true);

            if ($data !== null) {
                echo json_encode([
                    'success' => true,
                    'content' => $data,
                    'message' => 'File caricato con successo'
                ]);
            } else {
                echo json_encode([
                    'success' => false,
                    'message' => 'Errore nella decodifica del file JSON'
                ]);
            }
        } else {
            echo json_encode([
                'success' => false,
                'message' => 'File non trovato'
            ]);
        }
    } else {
        echo json_encode([
            'success' => false,
            'message' => 'Nome file mancante'
        ]);
    }
} else {
    echo json_encode([
        'success' => false,
        'message' => 'Metodo non consentito. Usa POST.'
    ]);
}
