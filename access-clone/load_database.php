<?php
require_once __DIR__ . '/../backend/storage.php';

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $user = requireAuth();
    $input = json_decode(file_get_contents('php://input'), true);
    $file = basename($input['filename'] ?? ''); // previene path traversal
    if ($file === '' || strtolower(pathinfo($file, PATHINFO_EXTENSION)) !== 'json') {
        echo json_encode(['success' => false, 'error' => 'File non valido']);
        exit;
    }
    try {
        $directory = getUserStorageDir((int)$user['id'], 'access');
        $filepath = $directory . '/' . $file;
        if (!is_file($filepath)) {
            echo json_encode(['success' => false, 'error' => 'File non trovato']);
            exit;
        }
        $content = file_get_contents($filepath);
        echo json_encode(['success' => true, 'data' => json_decode($content, true), 'filename' => $file]);
    } catch (Exception $e) {
        echo json_encode(['success' => false, 'error' => $e->getMessage()]);
    }
} else {
    echo json_encode(['success' => false, 'error' => 'Metodo non consentito']);
}
