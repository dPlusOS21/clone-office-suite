<?php
require_once __DIR__ . '/../backend/storage.php';

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET');

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $user = requireAuth();
    try {
        $directory = getUserStorageDir((int)$user['id'], 'powerbi');
        if (!is_dir($directory)) {
            echo json_encode(['success' => true, 'reports' => []]);
            exit;
        }
        $reports = [];
        foreach (scandir($directory) as $file) {
            if ($file === '.' || $file === '..') continue;
            if (strtolower(pathinfo($file, PATHINFO_EXTENSION)) !== 'json') continue;
            $filepath = $directory . '/' . $file;
            $reports[] = [
                'filename' => $file,
                'name' => pathinfo($file, PATHINFO_FILENAME),
                'size' => filesize($filepath),
                'modified' => filemtime($filepath),
                'modified_formatted' => date('d/m/Y H:i', filemtime($filepath))
            ];
        }
        usort($reports, function($a, $b) { return $b['modified'] - $a['modified']; });
        echo json_encode(['success' => true, 'reports' => $reports, 'count' => count($reports)]);
    } catch (Exception $e) {
        echo json_encode(['success' => false, 'error' => $e->getMessage()]);
    }
} else {
    echo json_encode(['success' => false, 'error' => 'Metodo non consentito']);
}
