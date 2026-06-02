<?php
require_once __DIR__ . '/../backend/storage.php';

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $user = requireAuth();

    try {
        $directory = getUserStorageDir((int)$user['id'], 'word');

        if (!is_dir($directory)) {
            echo json_encode([
                'success' => true,
                'documents' => [],
                'message' => 'Nessun documento salvato'
            ]);
            exit;
        }

        $documents = [];
        $files = scandir($directory);

        foreach ($files as $file) {
            $extension = strtolower(pathinfo($file, PATHINFO_EXTENSION));
            if ($file != '.' && $file != '..' && in_array($extension, ['html', 'json'])) {
                $filepath = $directory . '/' . $file;
                $documents[] = [
                    'filename' => $file,
                    'filepath' => $filepath,
                    'type' => $extension,
                    'size' => filesize($filepath),
                    'modified' => filemtime($filepath),
                    'modified_formatted' => gmdate('d/m/Y H:i:s', filemtime($filepath))
                ];
            }
        }

        // Ordina per data di modifica (più recente prima)
        usort($documents, function($a, $b) {
            return $b['modified'] - $a['modified'];
        });

        echo json_encode([
            'success' => true,
            'documents' => $documents,
            'count' => count($documents)
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
