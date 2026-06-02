<?php
require_once __DIR__ . '/../../backend/storage.php';

header('Content-Type: application/json');
header("Access-Control-Allow-Origin: *");

$user = requireAuth();
$storageDir = getUserStorageDir((int)$user['id'], 'excel');

$files = [];
if (is_dir($storageDir)) {
    $fileList = scandir($storageDir);
    foreach ($fileList as $file) {
        if (pathinfo($file, PATHINFO_EXTENSION) === 'json') {
            $filepath = $storageDir . '/' . $file;
            $files[] = [
                'filename' => $file,
                'name' => pathinfo($file, PATHINFO_FILENAME),
                'type' => 'json',
                'size' => filesize($filepath),
                'modified' => filemtime($filepath),
                'modified_formatted' => date('d/m/Y H:i:s', filemtime($filepath))
            ];
        }
    }
}

echo json_encode([
    'success' => true,
    'files' => $files
]);
