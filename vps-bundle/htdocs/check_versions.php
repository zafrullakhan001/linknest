<?php
$db = new PDO('sqlite:data/linknest.db');
$stmt = $db->query("SELECT id, tile_id, version_number, is_temp, changelog_summary FROM tile_versions ORDER BY id DESC LIMIT 20");
$versions = $stmt->fetchAll(PDO::FETCH_ASSOC);
echo json_encode($versions, JSON_PRETTY_PRINT);
