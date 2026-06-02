<?php
require_once __DIR__ . '/../backend/storage.php';

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET');

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $user = requireAuth();
    $file = $_GET['file'] ?? '';
    $file = basename($file); // previene path traversal
    if ($file === '' || strtolower(pathinfo($file, PATHINFO_EXTENSION)) !== 'json') {
        echo json_encode(['success' => false, 'error' => 'File non valido']);
        exit;
    }
    try {
        $directory = getUserStorageDir((int)$user['id'], 'powerbi');
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
