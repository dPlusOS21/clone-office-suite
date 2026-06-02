<?php
require_once __DIR__ . '/../backend/storage.php';

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, DELETE');

$user = requireAuth();
$file = $_GET['file'] ?? '';
$file = basename($file);
if ($file === '' || strtolower(pathinfo($file, PATHINFO_EXTENSION)) !== 'json') {
    echo json_encode(['success' => false, 'error' => 'File non valido']);
    exit;
}
try {
    $directory = getUserStorageDir((int)$user['id'], 'powerbi');
    $filepath = $directory . '/' . $file;
    if (is_file($filepath) && unlink($filepath)) {
        echo json_encode(['success' => true, 'message' => 'Report eliminato']);
    } else {
        echo json_encode(['success' => false, 'error' => 'File non trovato']);
    }
} catch (Exception $e) {
    echo json_encode(['success' => false, 'error' => $e->getMessage()]);
}
