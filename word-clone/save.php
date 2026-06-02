<?php
require_once __DIR__ . '/../backend/storage.php';

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $user = requireAuth();
    $input = json_decode(file_get_contents('php://input'), true);
    $content = $input['content'] ?? '';
    $filename = $input['filename'] ?? 'document_' . date('Y-m-d_H-i-s');
    $format = $input['format'] ?? 'html';
    $metadata = $input['metadata'] ?? null;

    // Pulisci il nome del file
    $filename = preg_replace('/[^a-zA-Z0-9_-]/', '_', $filename);

    try {
        $storageDir = getUserStorageDir((int)$user['id'], 'word');
        $filepath = '';
        $contentToSave = '';

        // Gestione del formato
        if ($format === 'json') {
            $documentData = [
                'name' => $metadata['name'] ?? $filename,
                'content' => $content,
                'wordCount' => $metadata['wordCount'] ?? 0,
                'orientation' => $metadata['orientation'] ?? 'portrait',
                'margins' => $metadata['margins'] ?? ['top' => 25, 'right' => 25, 'bottom' => 25, 'left' => 25],
                'savedAt' => $metadata['savedAt'] ?? date('Y-m-d H:i:s')
            ];
            $filepath = $storageDir . '/' . $filename . '.json';
            $contentToSave = json_encode($documentData, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
        } else {
            $filepath = $storageDir . '/' . $filename . '.html';
            $contentToSave = $content;
        }

        // Verifica quota
        $size = strlen($contentToSave);
        $quota = checkStorageQuota((int)$user['id'], $size);
        if (!$quota['allowed']) {
            echo json_encode(['success' => false, 'error' => $quota['message']]);
            exit;
        }

        // Salva il file
        if (file_put_contents($filepath, $contentToSave)) {
            echo json_encode([
                'success' => true,
                'message' => 'Documento salvato con successo',
                'filepath' => $filepath,
                'format' => $format,
                'saved_at' => date('Y-m-d H:i:s'),
                'filename' => basename($filepath)
            ]);
        } else {
            throw new Exception('Errore nel salvataggio del file');
        }

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
