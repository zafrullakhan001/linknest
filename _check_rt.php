<?php
$db = new PDO('sqlite:' . __DIR__ . '/data/linknest.db');
echo "user_version=" . $db->query('PRAGMA user_version')->fetchColumn() . PHP_EOL;
echo "columns:\n";
foreach ($db->query('PRAGMA table_info(rich_text_content)') as $c) {
    echo "  " . $c['name'] . " " . $c['type'] . PHP_EOL;
}
echo "rows:\n";
foreach ($db->query('SELECT id, substr(content,1,50) as c, boxed, box_title, box_footer, position FROM rich_text_content') as $r) {
    echo json_encode($r) . PHP_EOL;
}
