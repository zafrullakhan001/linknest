<?php
/**
 * LinkNest ⇄ OpenLDAP settings writer (VPS deploys).
 *
 * argv: <base_dn> <login_domain> <ldap_host> <ldap_port> <service_dn> <app_root>
 * stdin: service bind password (plain text; never taken from argv)
 *
 * Uses the application's own helpers (setSetting / encryptPassword /
 * responseCacheInvalidate) so the stored value is exactly what api/auth.php expects.
 */

$base_dn  = $argv[1] ?? 'dc=oneflorida,dc=org';
$domain   = $argv[2] ?? 'oneflorida.org';
$host     = $argv[3] ?? '127.0.0.1';
$port     = $argv[4] ?? '389';
$svc_dn   = $argv[5] ?? "cn=linknest,ou=services,$base_dn";
$app_root = rtrim($argv[6] ?? '/home/linknest/htdocs', '/');

require_once $app_root . '/api/config.php';

$pw = trim((string) stream_get_contents(STDIN));
if ($pw === '') {
    fwrite(STDERR, "FATAL: no bind password received on stdin\n");
    exit(1);
}

$enc = encryptPassword($pw);
if (decryptPassword($enc) !== $pw) {
    fwrite(STDERR, "FATAL: encryption round-trip failed\n");
    exit(1);
}
echo "  bind password encrypted (AES-256-GCM, " . strlen($enc) . " chars)\n";

$people = "ou=people,$base_dn";
$groups = "ou=groups,$base_dn";

$flat = [
    'ldap_enabled'                  => '1',
    'ldap_server'                   => $host,
    'ldap_port'                     => (string) $port,
    'ldap_protocol'                 => 'ldap',
    'ldap_tls'                      => '0',
    'ldap_ssl_verify'               => '0',
    'ldap_base_dn'                  => $base_dn,
    'ldap_login_domain'             => $domain,
    'ldap_mail_domains'             => json_encode([$domain]),
    'ldap_bind_dn'                  => $svc_dn,
    'ldap_bind_password'            => $enc,
    'ldap_user_search_base'         => $people,
    'ldap_user_filter'              => '(uid={username})',
    'ldap_user_attributes'          => 'uid,cn,mail,displayName,memberOf',
    'ldap_user_dn_template'         => '',
    'ldap_group_search_base'        => $groups,
    'ldap_group_filter'             => '(objectClass=groupOfNames)',
    'ldap_group_attributes'         => 'cn,member',
    'ldap_email_attribute'          => 'mail',
    'ldap_display_name_attribute'   => 'displayName',
    'ldap_timeout'                  => '5',
    'ldap_connection_retry'         => '2',
    'ldap_retry_delay'              => '1',
    'ldap_search_scope'             => 'sub',
    'ldap_referrals'                => '0',
    'ldap_case_sensitive'           => '0',
    'ldap_auto_create_users'        => '1',
    'ldap_auto_update_users'        => '1',
    'ldap_require_group_membership' => '0',
    'ldap_required_groups'          => '',
    'ldap_denied_groups'            => '',
    'ldap_nested_groups'            => '0',
    'ldap_sync_interval'            => '3600',
    'ldap_dropdown_show_host'       => '0',
];
foreach ($flat as $k => $v) {
    setSetting($k, $v);
}
echo '  flat ldap_* settings updated: ' . count($flat) . "\n";

/* getLdapServers() prefers the multi-server JSON, so keep it in sync. */
$servers = [[
    'name'                      => 'LinkNest LDAP (local)',
    'server'                    => $host,
    'port'                      => (string) $port,
    'protocol'                  => 'ldap',
    'tls'                       => '0',
    'timeout'                   => '5',
    'bind_dn'                   => $svc_dn,
    'bind_password'             => $enc,
    'user_search_base'          => $people,
    'user_filter'               => '(uid={username})',
    'user_attributes'           => 'uid,cn,mail,displayName,memberOf',
    'user_dn_template'          => '',
    'group_search_base'         => $groups,
    'group_filter'              => '(objectClass=groupOfNames)',
    'group_attributes'          => 'cn,member',
    'require_group_membership'  => '0',
    'required_groups'           => '',
    'denied_groups'             => '',
    'search_scope'              => 'sub',
    'nested_groups'             => '0',
    'case_sensitive'            => '0',
    'ssl_verify'                => '0',
    'connection_retry'          => 2,
    'retry_delay'               => 1,
    'email_attribute'           => 'mail',
    'display_name_attribute'    => 'displayName',
    'referrals'                 => '0',
    'login_domain'              => $domain,
]];
setSetting('ldap_servers', json_encode($servers));
echo "  ldap_servers JSON updated\n";

if (function_exists('responseCacheInvalidate')) {
    responseCacheInvalidate('');
    echo "  response cache invalidated\n";
}

foreach (['ldap_enabled', 'ldap_server', 'ldap_user_filter', 'ldap_display_name_attribute'] as $k) {
    echo '  ' . str_pad($k, 29) . ' = ' . getSetting($k, '(missing)') . "\n";
}
echo '  bind_password round-trip    = ' . (decryptPassword((string) getSetting('ldap_bind_password', '')) === $pw ? 'OK' : 'FAILED') . "\n";
echo "SETTINGS OK\n";
