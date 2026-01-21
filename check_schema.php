<?php
$db = new PDO('sqlite:data/linknest.db');
$stmt = $db->query("PRAGMA table_info(tile_versions)");
$cols = $stmt->fetchAll(PDO::FETCH_ASSOC);
echo json_encode($cols, JSON_PRETTY_PRINT);
