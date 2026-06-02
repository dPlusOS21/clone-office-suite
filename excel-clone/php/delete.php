<?php
require_once __DIR__ . '/../../backend/storage.php';

header('Content-Type: application/json');
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: POST");
header("Access-Control-Allow-Headers: Content-Type");

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $user = requireAuth();
    $input = json_decode(file_get_contents('php://input'), true);
    $filename = $input['filename'] ?? '';

    try {
        $safeName = basename($filename);
        $filepath = getUserStorageDir((int)$user['id'], 'excel') . '/' . $safeName;

        if (!file_exists($filepath)) {
            echo json_encode(['success' => false, 'message' => 'File non trovato']);
            exit;
        }

        if (unlink($filepath)) {
            echo json_encode([
                'success' => true,
                'message' => 'File eliminato con successo',
                'filename' => $safeName
            ]);
        } else {
            echo json_encode([
                'success' => false,
                'message' => 'Errore durante l\'eliminazione del file'
            ]);
        }
    } catch (Exception $e) {
        echo json_encode([
            'success' => false,
            'message' => $e->getMessage()
        ]);
    }
} else {
    echo json_encode([
        'success' => false,
        'message' => 'Metodo non consentito'
    ]);
}
