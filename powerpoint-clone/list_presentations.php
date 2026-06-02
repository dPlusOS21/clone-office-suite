<?php
require_once __DIR__ . '/../backend/storage.php';

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $user = requireAuth();

    try {
        $directory = getUserStorageDir((int)$user['id'], 'powerpoint');

        if (!is_dir($directory)) {
            echo json_encode([
                'success' => true,
                'presentations' => [],
                'message' => 'Nessuna presentazione salvata'
            ]);
            exit;
        }

        $presentations = [];
        $files = scandir($directory);

        foreach ($files as $file) {
            $extension = strtolower(pathinfo($file, PATHINFO_EXTENSION));
            if ($file != '.' && $file != '..' && $extension === 'json') {
                $filepath = $directory . '/' . $file;
                $presentations[] = [
                    'filename' => $file,
                    'name' => pathinfo($file, PATHINFO_FILENAME),
                    'type' => $extension,
                    'filepath' => $filepath,
                    'size' => filesize($filepath),
                    'modified' => filemtime($filepath),
                    'modified_formatted' => date('d/m/Y H:i:s', filemtime($filepath))
                ];
            }
        }

        usort($presentations, function($a, $b) {
            return $b['modified'] - $a['modified'];
        });

        echo json_encode([
            'success' => true,
            'presentations' => $presentations,
            'count' => count($presentations)
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
