<?php
/**
 * SAML Configuration Loader
 * Reads SAML settings from the database `settings` table.
 * Compatible with PHP 8+.
 */

require_once __DIR__ . '/../api/config.php';

class SamlConfig {
    private $conn;

    public function __construct() {
        $db = getDB();
        $this->conn = $db;
    }

    public function isEnabled(): bool {
        try {
            $stmt = $this->conn->prepare("SELECT value FROM settings WHERE key = 'saml_enabled'");
            $stmt->execute();
            $value = $stmt->fetchColumn();
            return $value === '1' || $value === 1 || $value === true;
        } catch (Exception $e) {
            error_log('SamlConfig::isEnabled error: ' . $e->getMessage());
            return false;
        }
    }

    public function getSettings(): array {
        $defaults = [
            'saml_enabled' => '0',
            'local_auth_enabled' => '1',
            'sp_entity_id' => '',
            'sp_assertion_consumer_service' => '',
            'sp_single_logout_service' => '',
            'sp_site_url' => '',
            'idp_entity_id' => '',
            'idp_sso_url' => '',
            'idp_slo_url' => '',
            'idp_x509cert' => '',
            'nameid_format' => 'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress',
            'strict' => '1',
            'debug' => '0',
            'map_name_to' => 'uid',
            'map_email_to' => 'email',
            'map_display_name_to' => 'cn',
            'auto_provision' => '1',
        ];

        try {
            $keys = array_keys($defaults);
            $placeholders = implode(',', array_fill(0, count($keys), '?'));
            $stmt = $this->conn->prepare("SELECT key, value FROM settings WHERE key IN ($placeholders)");
            $stmt->execute($keys);
            $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
            $values = [];
            foreach ($rows as $row) {
                $values[$row['key']] = $row['value'];
            }
            return array_merge($defaults, $values);
        } catch (Exception $e) {
            error_log('SamlConfig::getSettings error: ' . $e->getMessage());
            return $defaults;
        }
    }
}

?>
