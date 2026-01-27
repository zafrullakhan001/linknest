<?php
/**
 * LinkNest portable schema (Doctrine DBAL Schema API).
 * Used to create all tables on init when they don't exist.
 */

use Doctrine\DBAL\Schema\Schema;
use Doctrine\DBAL\Schema\Table;
use Doctrine\DBAL\Types\Types;

function createLinkNestSchema(): Schema
{
    $schema = new Schema();

    // --- users ---
    $users = $schema->createTable('users');
    $users->addColumn('id', Types::INTEGER, ['autoincrement' => true, 'notnull' => true]);
    $users->addColumn('username', Types::STRING, ['length' => 255, 'notnull' => true]);
    $users->addColumn('email', Types::STRING, ['length' => 255, 'notnull' => true]);
    $users->addColumn('password_hash', Types::TEXT, ['notnull' => true]);
    $users->addColumn('is_admin', Types::INTEGER, ['default' => 0, 'notnull' => true]);
    $users->addColumn('is_approved', Types::INTEGER, ['default' => 0, 'notnull' => true]);
    $users->addColumn('created_at', Types::INTEGER, ['notnull' => true]);
    $users->addColumn('auth_source', Types::STRING, ['length' => 64, 'default' => 'local']);
    $users->addColumn('is_disabled', Types::INTEGER, ['default' => 0]);
    $users->addColumn('saml_nameid', Types::TEXT, ['notnull' => false]);
    $users->addColumn('last_login', Types::INTEGER, ['notnull' => false]);
    $users->addColumn('display_name', Types::TEXT, ['notnull' => false]);
    $users->setPrimaryKey(['id']);
    $users->addUniqueIndex(['username']);
    $users->addUniqueIndex(['email']);

    // --- tiles ---
    $tiles = $schema->createTable('tiles');
    $tiles->addColumn('id', Types::STRING, ['length' => 255, 'notnull' => true]);
    $tiles->addColumn('user_id', Types::INTEGER, ['notnull' => false]);
    $tiles->addColumn('title', Types::TEXT, ['notnull' => true]);
    $tiles->addColumn('description', Types::TEXT, ['notnull' => false]);
    $tiles->addColumn('html_content', Types::TEXT, ['notnull' => false]);
    $tiles->addColumn('emoji', Types::TEXT, ['notnull' => false]);
    $tiles->addColumn('theme_color', Types::TEXT, ['notnull' => false]);
    $tiles->addColumn('group', Types::TEXT, ['notnull' => false]); // quoted in DDL
    $tiles->addColumn('position', Types::INTEGER, ['default' => 0, 'notnull' => true]);
    $tiles->addColumn('created_at', Types::INTEGER, ['notnull' => true]);
    $tiles->addColumn('visibility', Types::TEXT, ['default' => 'public', 'notnull' => false]);
    $tiles->addColumn('allowed_users', Types::TEXT, ['notnull' => false]);
    $tiles->addColumn('allowed_groups', Types::TEXT, ['notnull' => false]);
    $tiles->addColumn('is_hyperlink', Types::INTEGER, ['default' => 0, 'notnull' => false]);
    $tiles->addColumn('hyperlink_url', Types::TEXT, ['notnull' => false]);
    $tiles->addColumn('open_in_new_tab', Types::INTEGER, ['default' => 1, 'notnull' => false]);
    $tiles->addColumn('deleted_at', Types::INTEGER, ['notnull' => false]);
    $tiles->addColumn('visible_from', Types::TEXT, ['notnull' => false]);
    $tiles->addColumn('expires_at', Types::TEXT, ['notnull' => false]);
    $tiles->addColumn('archived_at', Types::INTEGER, ['notnull' => false]);
    $tiles->addColumn('browser', Types::TEXT, ['notnull' => false]);
    $tiles->addColumn('decoration', Types::TEXT, ['notnull' => false]);
    $tiles->addColumn('tile_background_color', Types::TEXT, ['notnull' => false]);
    $tiles->addColumn('tile_gradient_enabled', Types::INTEGER, ['default' => 0, 'notnull' => false]);
    $tiles->addColumn('tile_gradient_colors', Types::TEXT, ['notnull' => false]);
    $tiles->addColumn('tile_gradient_color_positions', Types::TEXT, ['notnull' => false]);
    $tiles->addColumn('tile_gradient_direction', Types::TEXT, ['notnull' => false]);
    $tiles->addColumn('tile_gradient_type', Types::TEXT, ['notnull' => false]);
    $tiles->addColumn('tile_border_radius', Types::INTEGER, ['notnull' => false]);
    $tiles->addColumn('tile_text_color', Types::TEXT, ['notnull' => false]);
    $tiles->setPrimaryKey(['id']);
    $tiles->addForeignKeyConstraint('users', ['user_id'], ['id'], ['onDelete' => 'CASCADE']);

    // --- tile_versions ---
    $tv = $schema->createTable('tile_versions');
    $tv->addColumn('id', Types::INTEGER, ['autoincrement' => true, 'notnull' => true]);
    $tv->addColumn('tile_id', Types::STRING, ['length' => 255, 'notnull' => true]);
    $tv->addColumn('version_number', Types::INTEGER, ['notnull' => true]);
    $tv->addColumn('created_at', Types::INTEGER, ['notnull' => true]);
    $tv->addColumn('user_id', Types::INTEGER, ['notnull' => false]);
    $tv->addColumn('tile_data', Types::TEXT, ['notnull' => true]);
    $tv->addColumn('changelog_summary', Types::TEXT, ['notnull' => false]);
    $tv->addColumn('is_locked', Types::INTEGER, ['default' => 0, 'notnull' => false]);
    $tv->addColumn('is_temp', Types::INTEGER, ['default' => 0, 'notnull' => false]);
    $tv->addColumn('tags', Types::TEXT, ['notnull' => false]);
    $tv->addColumn('comments', Types::TEXT, ['notnull' => false]);
    $tv->setPrimaryKey(['id']);
    $tv->addForeignKeyConstraint('tiles', ['tile_id'], ['id'], ['onDelete' => 'CASCADE']);
    $tv->addForeignKeyConstraint('users', ['user_id'], ['id'], ['onDelete' => 'SET NULL']);
    $tv->addIndex(['tile_id']);
    $tv->addIndex(['created_at']);

    // --- tabs ---
    $tabs = $schema->createTable('tabs');
    $tabs->addColumn('id', Types::STRING, ['length' => 255, 'notnull' => true]);
    $tabs->addColumn('tile_id', Types::STRING, ['length' => 255, 'notnull' => true]);
    $tabs->addColumn('title', Types::TEXT, ['notnull' => true]);
    $tabs->addColumn('position', Types::INTEGER, ['default' => 0, 'notnull' => false]);
    $tabs->addColumn('visible_from', Types::TEXT, ['notnull' => false]);
    $tabs->addColumn('expires_at', Types::TEXT, ['notnull' => false]);
    $tabs->addColumn('text_color', Types::TEXT, ['notnull' => false]);
    $tabs->setPrimaryKey(['id']);
    $tabs->addForeignKeyConstraint('tiles', ['tile_id'], ['id'], ['onDelete' => 'CASCADE']);

    // --- sections ---
    $sections = $schema->createTable('sections');
    $sections->addColumn('id', Types::STRING, ['length' => 255, 'notnull' => true]);
    $sections->addColumn('tile_id', Types::STRING, ['length' => 255, 'notnull' => true]);
    $sections->addColumn('tab_id', Types::STRING, ['length' => 255, 'notnull' => false]);
    $sections->addColumn('title', Types::TEXT, ['notnull' => false]);
    $sections->addColumn('visible_from', Types::TEXT, ['notnull' => false]);
    $sections->addColumn('expires_at', Types::TEXT, ['notnull' => false]);
    $sections->addColumn('text_color', Types::TEXT, ['notnull' => false]);
    $sections->addColumn('force_stacked_view', Types::INTEGER, ['default' => 0, 'notnull' => false]);
    $sections->addColumn('position', Types::INTEGER, ['default' => 0, 'notnull' => false]);
    $sections->setPrimaryKey(['id']);
    $sections->addForeignKeyConstraint('tiles', ['tile_id'], ['id'], ['onDelete' => 'CASCADE']);
    $sections->addForeignKeyConstraint('tabs', ['tab_id'], ['id'], ['onDelete' => 'CASCADE']);

    // --- links ---
    $links = $schema->createTable('links');
    $links->addColumn('id', Types::STRING, ['length' => 255, 'notnull' => true]);
    $links->addColumn('section_id', Types::STRING, ['length' => 255, 'notnull' => true]);
    $links->addColumn('label', Types::TEXT, ['notnull' => true]);
    $links->addColumn('url', Types::TEXT, ['notnull' => true]);
    $links->addColumn('health_status', Types::TEXT, ['default' => 'unknown', 'notnull' => false]);
    $links->addColumn('health_checked_at', Types::INTEGER, ['notnull' => false]);
    $links->addColumn('health_http_code', Types::INTEGER, ['notnull' => false]);
    $links->addColumn('health_error', Types::TEXT, ['notnull' => false]);
    $links->addColumn('visibility', Types::TEXT, ['default' => 'public', 'notnull' => false]);
    $links->addColumn('allowed_users', Types::TEXT, ['notnull' => false]);
    $links->addColumn('allowed_groups', Types::TEXT, ['notnull' => false]);
    $links->addColumn('notes', Types::TEXT, ['notnull' => false]);
    $links->addColumn('tooltip', Types::TEXT, ['notnull' => false]);
    $links->addColumn('browser', Types::TEXT, ['notnull' => false]);
    $links->addColumn('rich_text_content', Types::TEXT, ['notnull' => false]);
    $links->addColumn('visible_from', Types::TEXT, ['notnull' => false]);
    $links->addColumn('expires_at', Types::TEXT, ['notnull' => false]);
    $links->addColumn('icon', Types::TEXT, ['notnull' => false]);
    $links->addColumn('text_color', Types::TEXT, ['notnull' => false]);
    $links->addColumn('position', Types::INTEGER, ['default' => 0, 'notnull' => false]);
    $links->setPrimaryKey(['id']);
    $links->addForeignKeyConstraint('sections', ['section_id'], ['id'], ['onDelete' => 'CASCADE']);

    // --- rich_text_content ---
    $rtc = $schema->createTable('rich_text_content');
    $rtc->addColumn('id', Types::STRING, ['length' => 255, 'notnull' => true]);
    $rtc->addColumn('section_id', Types::STRING, ['length' => 255, 'notnull' => true]);
    $rtc->addColumn('content', Types::TEXT, ['notnull' => true]);
    $rtc->addColumn('position', Types::INTEGER, ['default' => 0, 'notnull' => false]);
    $rtc->setPrimaryKey(['id']);
    $rtc->addForeignKeyConstraint('sections', ['section_id'], ['id'], ['onDelete' => 'CASCADE']);

    // --- settings ---
    $settings = $schema->createTable('settings');
    $settings->addColumn('key', Types::STRING, ['length' => 255, 'notnull' => true]);
    $settings->addColumn('value', Types::TEXT, ['notnull' => true]);
    $settings->addColumn('updated_at', Types::INTEGER, ['notnull' => true]);
    $settings->setPrimaryKey(['key']);

    // --- addon_status ---
    $addon = $schema->createTable('addon_status');
    $addon->addColumn('addon_name', Types::STRING, ['length' => 255, 'notnull' => true]);
    $addon->addColumn('is_enabled', Types::INTEGER, ['default' => 0, 'notnull' => false]);
    $addon->addColumn('is_available', Types::INTEGER, ['default' => 0, 'notnull' => false]);
    $addon->addColumn('last_check_at', Types::INTEGER, ['notnull' => false]);
    $addon->addColumn('config', Types::TEXT, ['notnull' => false]);
    $addon->addColumn('error_message', Types::TEXT, ['notnull' => false]);
    $addon->setPrimaryKey(['addon_name']);

    // --- tile_arrangements ---
    $ta = $schema->createTable('tile_arrangements');
    $ta->addColumn('user_id', Types::INTEGER, ['default' => 0, 'notnull' => true]);
    $ta->addColumn('tile_id', Types::STRING, ['length' => 255, 'notnull' => true]);
    $ta->addColumn('position', Types::INTEGER, ['notnull' => true]);
    $ta->addColumn('group_name', Types::TEXT, ['notnull' => false]);
    $ta->setPrimaryKey(['user_id', 'tile_id']);
    $ta->addForeignKeyConstraint('tiles', ['tile_id'], ['id'], ['onDelete' => 'CASCADE']);

    // --- category_arrangements ---
    $ca = $schema->createTable('category_arrangements');
    $ca->addColumn('user_id', Types::INTEGER, ['default' => 0, 'notnull' => true]);
    $ca->addColumn('category_name', Types::STRING, ['length' => 255, 'notnull' => true]);
    $ca->addColumn('position', Types::INTEGER, ['notnull' => true]);
    $ca->addColumn('visible_from', Types::TEXT, ['notnull' => false]);
    $ca->addColumn('expires_at', Types::TEXT, ['notnull' => false]);
    $ca->setPrimaryKey(['user_id', 'category_name']);

    // --- tile_messages ---
    $tm = $schema->createTable('tile_messages');
    $tm->addColumn('id', Types::STRING, ['length' => 255, 'notnull' => true]);
    $tm->addColumn('tile_id', Types::STRING, ['length' => 255, 'notnull' => true]);
    $tm->addColumn('content', Types::TEXT, ['notnull' => true]);
    $tm->addColumn('type', Types::TEXT, ['notnull' => true]);
    $tm->addColumn('start_date', Types::TEXT, ['notnull' => false]);
    $tm->addColumn('end_date', Types::TEXT, ['notnull' => false]);
    $tm->addColumn('is_active', Types::INTEGER, ['default' => 1, 'notnull' => false]);
    $tm->addColumn('priority', Types::INTEGER, ['default' => 0, 'notnull' => false]);
    $tm->addColumn('text_color', Types::TEXT, ['notnull' => false]);
    $tm->addColumn('font_style', Types::TEXT, ['notnull' => false]);
    $tm->addColumn('display_location', Types::TEXT, ['default' => 'both', 'notnull' => false]);
    $tm->addColumn('animation_type', Types::TEXT, ['default' => 'rollover', 'notnull' => false]);
    $tm->addColumn('delay_before', Types::FLOAT, ['default' => 0, 'notnull' => false]);
    $tm->setPrimaryKey(['id']);
    $tm->addForeignKeyConstraint('tiles', ['tile_id'], ['id'], ['onDelete' => 'CASCADE']);

    // --- user_tile_favorites ---
    $utf = $schema->createTable('user_tile_favorites');
    $utf->addColumn('user_id', Types::INTEGER, ['notnull' => true]);
    $utf->addColumn('tile_id', Types::STRING, ['length' => 255, 'notnull' => true]);
    $utf->addColumn('created_at', Types::INTEGER, ['notnull' => true]);
    $utf->setPrimaryKey(['user_id', 'tile_id']);
    $utf->addForeignKeyConstraint('users', ['user_id'], ['id'], ['onDelete' => 'CASCADE']);
    $utf->addForeignKeyConstraint('tiles', ['tile_id'], ['id'], ['onDelete' => 'CASCADE']);

    // --- user_link_favorites ---
    $ulf = $schema->createTable('user_link_favorites');
    $ulf->addColumn('user_id', Types::INTEGER, ['notnull' => true]);
    $ulf->addColumn('link_id', Types::STRING, ['length' => 255, 'notnull' => true]);
    $ulf->addColumn('created_at', Types::INTEGER, ['notnull' => true]);
    $ulf->addColumn('position', Types::INTEGER, ['default' => 0, 'notnull' => false]);
    $ulf->setPrimaryKey(['user_id', 'link_id']);
    $ulf->addForeignKeyConstraint('users', ['user_id'], ['id'], ['onDelete' => 'CASCADE']);
    $ulf->addForeignKeyConstraint('links', ['link_id'], ['id'], ['onDelete' => 'CASCADE']);

    // --- user_tile_permissions ---
    $utp = $schema->createTable('user_tile_permissions');
    $utp->addColumn('user_id', Types::INTEGER, ['notnull' => true]);
    $utp->addColumn('tile_id', Types::STRING, ['length' => 255, 'notnull' => true]);
    $utp->addColumn('can_view', Types::INTEGER, ['default' => 1, 'notnull' => false]);
    $utp->addColumn('can_edit', Types::INTEGER, ['default' => 0, 'notnull' => false]);
    $utp->addColumn('can_delete', Types::INTEGER, ['default' => 0, 'notnull' => false]);
    $utp->addColumn('created_at', Types::INTEGER, ['notnull' => true]);
    $utp->addColumn('updated_at', Types::INTEGER, ['notnull' => true]);
    $utp->addColumn('can_add_links', Types::INTEGER, ['default' => 1, 'notnull' => false]);
    $utp->addColumn('can_add_sections', Types::INTEGER, ['default' => 1, 'notnull' => false]);
    $utp->addColumn('can_add_tabs', Types::INTEGER, ['default' => 1, 'notnull' => false]);
    $utp->addColumn('can_edit_links', Types::INTEGER, ['default' => 1, 'notnull' => false]);
    $utp->addColumn('can_delete_links', Types::INTEGER, ['default' => 0, 'notnull' => false]);
    $utp->addColumn('can_delete_sections', Types::INTEGER, ['default' => 0, 'notnull' => false]);
    $utp->addColumn('can_delete_tabs', Types::INTEGER, ['default' => 0, 'notnull' => false]);
    $utp->addColumn('can_change_visibility', Types::INTEGER, ['default' => 0, 'notnull' => false]);
    $utp->addColumn('can_change_browser', Types::INTEGER, ['default' => 0, 'notnull' => false]);
    $utp->addColumn('can_clone_tile', Types::INTEGER, ['default' => 0, 'notnull' => false]);
    $utp->addColumn('can_view_tile_info', Types::INTEGER, ['default' => 1, 'notnull' => false]);
    $utp->addColumn('can_edit_tile', Types::INTEGER, ['default' => 1, 'notnull' => false]);
    $utp->setPrimaryKey(['user_id', 'tile_id']);
    $utp->addForeignKeyConstraint('users', ['user_id'], ['id'], ['onDelete' => 'CASCADE']);
    $utp->addForeignKeyConstraint('tiles', ['tile_id'], ['id'], ['onDelete' => 'CASCADE']);

    // --- clones ---
    $clones = $schema->createTable('clones');
    $clones->addColumn('id', Types::INTEGER, ['autoincrement' => true, 'notnull' => true]);
    $clones->addColumn('folder_name', Types::STRING, ['length' => 255, 'notnull' => true]);
    $clones->addColumn('source_path', Types::TEXT, ['notnull' => true]);
    $clones->addColumn('target_path', Types::TEXT, ['notnull' => true]);
    $clones->addColumn('full_path', Types::TEXT, ['notnull' => true]);
    $clones->addColumn('url', Types::TEXT, ['notnull' => true]);
    $clones->addColumn('status', Types::STRING, ['length' => 64, 'default' => 'pending', 'notnull' => false]);
    $clones->addColumn('progress', Types::INTEGER, ['default' => 0, 'notnull' => false]);
    $clones->addColumn('copy_assets', Types::INTEGER, ['default' => 0, 'notnull' => false]);
    $clones->addColumn('copy_database', Types::INTEGER, ['default' => 0, 'notnull' => false]);
    $clones->addColumn('created_at', Types::INTEGER, ['notnull' => true]);
    $clones->addColumn('completed_at', Types::INTEGER, ['notnull' => false]);
    $clones->addColumn('error_message', Types::TEXT, ['notnull' => false]);
    $clones->addColumn('created_by', Types::INTEGER, ['notnull' => false]);
    $clones->setPrimaryKey(['id']);
    $clones->addUniqueIndex(['folder_name']);
    $clones->addForeignKeyConstraint('users', ['created_by'], ['id'], ['onDelete' => 'SET NULL']);

    // --- user_preferences ---
    $upref = $schema->createTable('user_preferences');
    $upref->addColumn('user_id', Types::INTEGER, ['notnull' => true]);
    $upref->addColumn('preference_key', Types::STRING, ['length' => 255, 'notnull' => true]);
    $upref->addColumn('preference_value', Types::TEXT, ['notnull' => false]);
    $upref->addColumn('updated_at', Types::INTEGER, ['notnull' => true]);
    $upref->setPrimaryKey(['user_id', 'preference_key']);
    $upref->addForeignKeyConstraint('users', ['user_id'], ['id'], ['onDelete' => 'CASCADE']);

    // --- user_custom_timezones ---
    $uct = $schema->createTable('user_custom_timezones');
    $uct->addColumn('id', Types::INTEGER, ['autoincrement' => true, 'notnull' => true]);
    $uct->addColumn('user_id', Types::INTEGER, ['notnull' => true]);
    $uct->addColumn('name', Types::TEXT, ['notnull' => true]);
    $uct->addColumn('utc_offset_minutes', Types::INTEGER, ['notnull' => true]);
    $uct->addColumn('created_at', Types::INTEGER, ['notnull' => true]);
    $uct->setPrimaryKey(['id']);
    $uct->addForeignKeyConstraint('users', ['user_id'], ['id'], ['onDelete' => 'CASCADE']);

    // --- user_alarms ---
    $ua = $schema->createTable('user_alarms');
    $ua->addColumn('id', Types::INTEGER, ['autoincrement' => true, 'notnull' => true]);
    $ua->addColumn('user_id', Types::INTEGER, ['notnull' => true]);
    $ua->addColumn('time', Types::STRING, ['length' => 16, 'notnull' => true]);
    $ua->addColumn('label', Types::TEXT, ['notnull' => true]);
    $ua->addColumn('enabled', Types::INTEGER, ['default' => 1, 'notnull' => true]);
    $ua->addColumn('created_at', Types::INTEGER, ['notnull' => true]);
    $ua->addColumn('updated_at', Types::INTEGER, ['notnull' => true]);
    $ua->setPrimaryKey(['id']);
    $ua->addForeignKeyConstraint('users', ['user_id'], ['id'], ['onDelete' => 'CASCADE']);

    // --- user_notes ---
    $un = $schema->createTable('user_notes');
    $un->addColumn('id', Types::INTEGER, ['autoincrement' => true, 'notnull' => true]);
    $un->addColumn('user_id', Types::INTEGER, ['notnull' => true]);
    $un->addColumn('tab_name', Types::TEXT, ['notnull' => true]);
    $un->addColumn('content', Types::TEXT, ['notnull' => true]);
    $un->addColumn('position', Types::INTEGER, ['default' => 0, 'notnull' => false]);
    $un->addColumn('created_at', Types::INTEGER, ['notnull' => true]);
    $un->addColumn('updated_at', Types::INTEGER, ['notnull' => true]);
    $un->setPrimaryKey(['id']);
    $un->addForeignKeyConstraint('users', ['user_id'], ['id'], ['onDelete' => 'CASCADE']);

    // --- broadcast_messages ---
    $bm = $schema->createTable('broadcast_messages');
    $bm->addColumn('id', Types::INTEGER, ['autoincrement' => true, 'notnull' => true]);
    $bm->addColumn('message', Types::TEXT, ['notnull' => true]);
    $bm->addColumn('font_family', Types::TEXT, ['default' => 'Arial, sans-serif', 'notnull' => false]);
    $bm->addColumn('font_size', Types::TEXT, ['default' => '16px', 'notnull' => false]);
    $bm->addColumn('color', Types::TEXT, ['default' => '#ff0000', 'notnull' => false]);
    $bm->addColumn('is_active', Types::INTEGER, ['default' => 1, 'notnull' => false]);
    $bm->addColumn('expires_at', Types::INTEGER, ['notnull' => false]);
    $bm->addColumn('created_at', Types::INTEGER, ['notnull' => true]);
    $bm->addColumn('updated_at', Types::INTEGER, ['notnull' => true]);
    $bm->addColumn('created_by', Types::INTEGER, ['notnull' => false]);
    $bm->addColumn('scroll_speed', Types::INTEGER, ['default' => 30, 'notnull' => false]);
    $bm->setPrimaryKey(['id']);
    $bm->addForeignKeyConstraint('users', ['created_by'], ['id'], ['onDelete' => 'SET NULL']);

    // --- chat_messages ---
    $cm = $schema->createTable('chat_messages');
    $cm->addColumn('id', Types::INTEGER, ['autoincrement' => true, 'notnull' => true]);
    $cm->addColumn('user_id', Types::INTEGER, ['notnull' => true]);
    $cm->addColumn('username', Types::TEXT, ['notnull' => true]);
    $cm->addColumn('message', Types::TEXT, ['notnull' => false]);
    $cm->addColumn('message_type', Types::TEXT, ['default' => 'text', 'notnull' => false]);
    $cm->addColumn('tile_data', Types::TEXT, ['notnull' => false]);
    $cm->addColumn('recipient_user_id', Types::INTEGER, ['notnull' => false]);
    $cm->addColumn('created_at', Types::INTEGER, ['notnull' => true]);
    $cm->setPrimaryKey(['id']);
    $cm->addForeignKeyConstraint('users', ['user_id'], ['id'], ['onDelete' => 'CASCADE']);
    $cm->addForeignKeyConstraint('users', ['recipient_user_id'], ['id'], ['onDelete' => 'CASCADE']);

    // --- monitors ---
    $mon = $schema->createTable('monitors');
    $mon->addColumn('id', Types::INTEGER, ['autoincrement' => true, 'notnull' => true]);
    $mon->addColumn('name', Types::TEXT, ['notnull' => true]);
    $mon->addColumn('type', Types::TEXT, ['notnull' => true]);
    $mon->addColumn('target', Types::TEXT, ['notnull' => true]);
    $mon->addColumn('port', Types::INTEGER, ['notnull' => false]);
    $mon->addColumn('keyword', Types::TEXT, ['notnull' => false]);
    $mon->addColumn('interval', Types::INTEGER, ['default' => 5, 'notnull' => false]);
    $mon->addColumn('warning_threshold', Types::INTEGER, ['default' => 1, 'notnull' => false]);
    $mon->addColumn('consecutive_failures', Types::INTEGER, ['default' => 0, 'notnull' => false]);
    $mon->addColumn('timeout', Types::INTEGER, ['notnull' => false]);
    $mon->addColumn('permissions_mode', Types::INTEGER, ['default' => 0, 'notnull' => false]);
    $mon->addColumn('is_active', Types::INTEGER, ['default' => 1, 'notnull' => false]);
    $mon->addColumn('email_notification', Types::INTEGER, ['default' => 0, 'notnull' => false]);
    $mon->addColumn('last_notified_status', Types::TEXT, ['notnull' => false]);
    $mon->addColumn('legacy_notify_pending', Types::INTEGER, ['default' => 0, 'notnull' => false]);
    $mon->addColumn('legacy_email_disabled', Types::INTEGER, ['default' => 0, 'notnull' => false]);
    $mon->addColumn('legacy_email_to', Types::TEXT, ['notnull' => false]);
    $mon->addColumn('legacy_email_cc', Types::TEXT, ['notnull' => false]);
    $mon->addColumn('legacy_email_from_name', Types::TEXT, ['notnull' => false]);
    $mon->addColumn('legacy_email_from_email', Types::TEXT, ['notnull' => false]);
    $mon->addColumn('legacy_email_subject_template', Types::TEXT, ['notnull' => false]);
    $mon->addColumn('legacy_email_body_template', Types::TEXT, ['notnull' => false]);
    $mon->addColumn('last_checked_at', Types::INTEGER, ['notnull' => false]);
    $mon->addColumn('last_status', Types::TEXT, ['notnull' => false]);
    $mon->addColumn('last_response_time', Types::INTEGER, ['notnull' => false]);
    $mon->addColumn('created_at', Types::INTEGER, ['notnull' => true]);
    $mon->addColumn('updated_at', Types::INTEGER, ['notnull' => true]);
    $mon->addColumn('tab_name', Types::TEXT, ['notnull' => false]);
    $mon->addColumn('group_name', Types::TEXT, ['notnull' => false]);
    $mon->addColumn('maintenance_start', Types::INTEGER, ['notnull' => false]);
    $mon->addColumn('maintenance_end', Types::INTEGER, ['notnull' => false]);
    $mon->setPrimaryKey(['id']);

    // --- user_monitor_permissions ---
    $ump = $schema->createTable('user_monitor_permissions');
    $ump->addColumn('user_id', Types::INTEGER, ['notnull' => true]);
    $ump->addColumn('monitor_id', Types::INTEGER, ['notnull' => true]);
    $ump->addColumn('can_view', Types::INTEGER, ['default' => 1, 'notnull' => false]);
    $ump->addColumn('created_at', Types::INTEGER, ['notnull' => true]);
    $ump->addColumn('updated_at', Types::INTEGER, ['notnull' => true]);
    $ump->setPrimaryKey(['user_id', 'monitor_id']);
    $ump->addForeignKeyConstraint('users', ['user_id'], ['id'], ['onDelete' => 'CASCADE']);
    $ump->addForeignKeyConstraint('monitors', ['monitor_id'], ['id'], ['onDelete' => 'CASCADE']);

    // --- monitor_logs ---
    $ml = $schema->createTable('monitor_logs');
    $ml->addColumn('id', Types::INTEGER, ['autoincrement' => true, 'notnull' => true]);
    $ml->addColumn('monitor_id', Types::INTEGER, ['notnull' => true]);
    $ml->addColumn('status', Types::TEXT, ['notnull' => true]);
    $ml->addColumn('response_time', Types::INTEGER, ['notnull' => false]);
    $ml->addColumn('details', Types::TEXT, ['notnull' => false]);
    $ml->addColumn('checked_at', Types::INTEGER, ['notnull' => true]);
    $ml->setPrimaryKey(['id']);
    $ml->addForeignKeyConstraint('monitors', ['monitor_id'], ['id'], ['onDelete' => 'CASCADE']);

    // --- monitor_notification_rules ---
    $mnr = $schema->createTable('monitor_notification_rules');
    $mnr->addColumn('id', Types::INTEGER, ['autoincrement' => true, 'notnull' => true]);
    $mnr->addColumn('monitor_id', Types::INTEGER, ['notnull' => true]);
    $mnr->addColumn('name', Types::TEXT, ['notnull' => false]);
    $mnr->addColumn('sort_order', Types::INTEGER, ['default' => 0, 'notnull' => false]);
    $mnr->addColumn('status_trigger', Types::TEXT, ['notnull' => true]);
    $mnr->addColumn('time_window_start', Types::TEXT, ['notnull' => false]);
    $mnr->addColumn('time_window_end', Types::TEXT, ['notnull' => false]);
    $mnr->addColumn('days_of_week', Types::TEXT, ['notnull' => false]);
    $mnr->addColumn('subject_template', Types::TEXT, ['notnull' => true]);
    $mnr->addColumn('body_template', Types::TEXT, ['notnull' => true]);
    $mnr->addColumn('from_name', Types::TEXT, ['notnull' => false]);
    $mnr->addColumn('from_email', Types::TEXT, ['notnull' => false]);
    $mnr->addColumn('cc_emails', Types::TEXT, ['notnull' => false]);
    $mnr->addColumn('is_enabled', Types::INTEGER, ['default' => 1, 'notnull' => false]);
    $mnr->addColumn('created_at', Types::INTEGER, ['notnull' => true]);
    $mnr->addColumn('updated_at', Types::INTEGER, ['notnull' => true]);
    $mnr->setPrimaryKey(['id']);
    $mnr->addForeignKeyConstraint('monitors', ['monitor_id'], ['id'], ['onDelete' => 'CASCADE']);

    // --- smtp_servers ---
    $smtp = $schema->createTable('smtp_servers');
    $smtp->addColumn('id', Types::INTEGER, ['autoincrement' => true, 'notnull' => true]);
    $smtp->addColumn('name', Types::TEXT, ['notnull' => true]);
    $smtp->addColumn('host', Types::TEXT, ['notnull' => true]);
    $smtp->addColumn('port', Types::INTEGER, ['default' => 587, 'notnull' => true]);
    $smtp->addColumn('username', Types::TEXT, ['notnull' => false]);
    $smtp->addColumn('password', Types::TEXT, ['notnull' => false]);
    $smtp->addColumn('from_email', Types::TEXT, ['notnull' => true]);
    $smtp->addColumn('from_name', Types::TEXT, ['default' => '{app_name} Monitor', 'notnull' => true]);
    $smtp->addColumn('encryption', Types::TEXT, ['default' => 'tls', 'notnull' => true]);
    $smtp->addColumn('is_active', Types::INTEGER, ['default' => 0, 'notnull' => false]);
    $smtp->addColumn('is_enabled', Types::INTEGER, ['default' => 1, 'notnull' => false]);
    $smtp->addColumn('pause_start', Types::TEXT, ['notnull' => false]);
    $smtp->addColumn('pause_end', Types::TEXT, ['notnull' => false]);
    $smtp->addColumn('created_at', Types::INTEGER, ['notnull' => true]);
    $smtp->addColumn('updated_at', Types::INTEGER, ['notnull' => true]);
    $smtp->setPrimaryKey(['id']);

    // --- monitor_notification_recipients ---
    $mnrec = $schema->createTable('monitor_notification_recipients');
    $mnrec->addColumn('id', Types::INTEGER, ['autoincrement' => true, 'notnull' => true]);
    $mnrec->addColumn('rule_id', Types::INTEGER, ['notnull' => true]);
    $mnrec->addColumn('email', Types::TEXT, ['notnull' => true]);
    $mnrec->addColumn('created_at', Types::INTEGER, ['notnull' => true]);
    $mnrec->setPrimaryKey(['id']);
    $mnrec->addForeignKeyConstraint('monitor_notification_rules', ['rule_id'], ['id'], ['onDelete' => 'CASCADE']);

    // --- monitor_notification_logs ---
    $mnl = $schema->createTable('monitor_notification_logs');
    $mnl->addColumn('id', Types::INTEGER, ['autoincrement' => true, 'notnull' => true]);
    $mnl->addColumn('rule_id', Types::INTEGER, ['notnull' => false]);
    $mnl->addColumn('monitor_id', Types::INTEGER, ['notnull' => true]);
    $mnl->addColumn('recipient_email', Types::TEXT, ['notnull' => true]);
    $mnl->addColumn('status_trigger', Types::TEXT, ['notnull' => true]);
    $mnl->addColumn('sent_at', Types::INTEGER, ['notnull' => true]);
    $mnl->addColumn('subject', Types::TEXT, ['notnull' => true]);
    $mnl->addColumn('success', Types::INTEGER, ['default' => 1, 'notnull' => false]);
    $mnl->addColumn('error_message', Types::TEXT, ['notnull' => false]);
    $mnl->setPrimaryKey(['id']);

    // --- email_outbox ---
    $eo = $schema->createTable('email_outbox');
    $eo->addColumn('id', Types::INTEGER, ['autoincrement' => true, 'notnull' => true]);
    $eo->addColumn('created_at', Types::INTEGER, ['notnull' => true]);
    $eo->addColumn('send_after', Types::INTEGER, ['notnull' => false]);
    $eo->addColumn('monitor_id', Types::INTEGER, ['notnull' => false]);
    $eo->addColumn('rule_id', Types::INTEGER, ['notnull' => false]);
    $eo->addColumn('status_trigger', Types::TEXT, ['notnull' => false]);
    $eo->addColumn('to_emails', Types::TEXT, ['notnull' => true]);
    $eo->addColumn('cc_emails', Types::TEXT, ['notnull' => false]);
    $eo->addColumn('subject', Types::TEXT, ['notnull' => true]);
    $eo->addColumn('body', Types::TEXT, ['notnull' => true]);
    $eo->addColumn('from_name', Types::TEXT, ['notnull' => false]);
    $eo->addColumn('from_email', Types::TEXT, ['notnull' => false]);
    $eo->addColumn('attempts', Types::INTEGER, ['default' => 0, 'notnull' => false]);
    $eo->addColumn('max_attempts', Types::INTEGER, ['default' => 3, 'notnull' => false]);
    $eo->addColumn('last_error', Types::TEXT, ['notnull' => false]);
    $eo->addColumn('sent_at', Types::INTEGER, ['notnull' => false]);
    $eo->addColumn('success', Types::INTEGER, ['notnull' => false]);
    $eo->addColumn('legacy_clear_pending', Types::INTEGER, ['default' => 0, 'notnull' => false]);
    $eo->addColumn('legacy_update_last_notified_status', Types::TEXT, ['notnull' => false]);
    $eo->setPrimaryKey(['id']);

    // --- roles ---
    $roles = $schema->createTable('roles');
    $roles->addColumn('id', Types::INTEGER, ['autoincrement' => true, 'notnull' => true]);
    $roles->addColumn('name', Types::STRING, ['length' => 255, 'notnull' => true]);
    $roles->addColumn('description', Types::TEXT, ['notnull' => false]);
    $roles->addColumn('created_at', Types::INTEGER, ['notnull' => true]);
    $roles->addColumn('updated_at', Types::INTEGER, ['notnull' => true]);
    $roles->setPrimaryKey(['id']);
    $roles->addUniqueIndex(['name']);

    // --- user_roles ---
    $ur = $schema->createTable('user_roles');
    $ur->addColumn('user_id', Types::INTEGER, ['notnull' => true]);
    $ur->addColumn('role_id', Types::INTEGER, ['notnull' => true]);
    $ur->addColumn('created_at', Types::INTEGER, ['notnull' => true]);
    $ur->setPrimaryKey(['user_id', 'role_id']);
    $ur->addForeignKeyConstraint('users', ['user_id'], ['id'], ['onDelete' => 'CASCADE']);
    $ur->addForeignKeyConstraint('roles', ['role_id'], ['id'], ['onDelete' => 'CASCADE']);

    // --- role_tile_permissions ---
    $rtp = $schema->createTable('role_tile_permissions');
    $rtp->addColumn('role_id', Types::INTEGER, ['notnull' => true]);
    $rtp->addColumn('tile_id', Types::STRING, ['length' => 255, 'notnull' => true]);
    $rtp->addColumn('can_view', Types::INTEGER, ['default' => 1, 'notnull' => false]);
    $rtp->addColumn('created_at', Types::INTEGER, ['notnull' => true]);
    $rtp->addColumn('updated_at', Types::INTEGER, ['notnull' => true]);
    $rtp->setPrimaryKey(['role_id', 'tile_id']);
    $rtp->addForeignKeyConstraint('roles', ['role_id'], ['id'], ['onDelete' => 'CASCADE']);
    $rtp->addForeignKeyConstraint('tiles', ['tile_id'], ['id'], ['onDelete' => 'CASCADE']);

    // --- role_link_permissions ---
    $rlp = $schema->createTable('role_link_permissions');
    $rlp->addColumn('role_id', Types::INTEGER, ['notnull' => true]);
    $rlp->addColumn('link_id', Types::STRING, ['length' => 255, 'notnull' => true]);
    $rlp->addColumn('can_view', Types::INTEGER, ['default' => 1, 'notnull' => false]);
    $rlp->addColumn('created_at', Types::INTEGER, ['notnull' => true]);
    $rlp->addColumn('updated_at', Types::INTEGER, ['notnull' => true]);
    $rlp->setPrimaryKey(['role_id', 'link_id']);
    $rlp->addForeignKeyConstraint('roles', ['role_id'], ['id'], ['onDelete' => 'CASCADE']);
    $rlp->addForeignKeyConstraint('links', ['link_id'], ['id'], ['onDelete' => 'CASCADE']);

    // --- role_tab_permissions ---
    $rtab = $schema->createTable('role_tab_permissions');
    $rtab->addColumn('role_id', Types::INTEGER, ['notnull' => true]);
    $rtab->addColumn('tab_id', Types::STRING, ['length' => 255, 'notnull' => true]);
    $rtab->addColumn('can_view', Types::INTEGER, ['default' => 1, 'notnull' => false]);
    $rtab->addColumn('created_at', Types::INTEGER, ['notnull' => true]);
    $rtab->addColumn('updated_at', Types::INTEGER, ['notnull' => true]);
    $rtab->setPrimaryKey(['role_id', 'tab_id']);
    $rtab->addForeignKeyConstraint('roles', ['role_id'], ['id'], ['onDelete' => 'CASCADE']);

    // --- role_widget_permissions ---
    $rwp = $schema->createTable('role_widget_permissions');
    $rwp->addColumn('role_id', Types::INTEGER, ['notnull' => true]);
    $rwp->addColumn('widget_id', Types::STRING, ['length' => 255, 'notnull' => true]);
    $rwp->addColumn('can_view', Types::INTEGER, ['default' => 1, 'notnull' => false]);
    $rwp->addColumn('created_at', Types::INTEGER, ['notnull' => true]);
    $rwp->addColumn('updated_at', Types::INTEGER, ['notnull' => true]);
    $rwp->setPrimaryKey(['role_id', 'widget_id']);
    $rwp->addForeignKeyConstraint('roles', ['role_id'], ['id'], ['onDelete' => 'CASCADE']);

    // --- custom_widgets ---
    $cw = $schema->createTable('custom_widgets');
    $cw->addColumn('id', Types::INTEGER, ['autoincrement' => true, 'notnull' => true]);
    $cw->addColumn('widget_id', Types::STRING, ['length' => 255, 'notnull' => true]);
    $cw->addColumn('name', Types::TEXT, ['notnull' => true]);
    $cw->addColumn('description', Types::TEXT, ['notnull' => false]);
    $cw->addColumn('component_path', Types::TEXT, ['notnull' => true]);
    $cw->addColumn('floating_component_path', Types::TEXT, ['notnull' => false]);
    $cw->addColumn('icon_svg', Types::TEXT, ['notnull' => false]);
    $cw->addColumn('requires_auth', Types::INTEGER, ['default' => 0, 'notnull' => false]);
    $cw->addColumn('enabled', Types::INTEGER, ['default' => 1, 'notnull' => false]);
    $cw->addColumn('created_at', Types::INTEGER, ['notnull' => true]);
    $cw->addColumn('updated_at', Types::INTEGER, ['notnull' => true]);
    $cw->setPrimaryKey(['id']);
    $cw->addUniqueIndex(['widget_id']);

    // --- user_groups ---
    $ug = $schema->createTable('user_groups');
    $ug->addColumn('id', Types::INTEGER, ['autoincrement' => true, 'notnull' => true]);
    $ug->addColumn('name', Types::STRING, ['length' => 255, 'notnull' => true]);
    $ug->addColumn('description', Types::TEXT, ['notnull' => false]);
    $ug->addColumn('created_at', Types::INTEGER, ['notnull' => true]);
    $ug->addColumn('updated_at', Types::INTEGER, ['notnull' => true]);
    $ug->setPrimaryKey(['id']);
    $ug->addUniqueIndex(['name']);

    // --- user_group_members ---
    $ugm = $schema->createTable('user_group_members');
    $ugm->addColumn('user_id', Types::INTEGER, ['notnull' => true]);
    $ugm->addColumn('group_id', Types::INTEGER, ['notnull' => true]);
    $ugm->addColumn('created_at', Types::INTEGER, ['notnull' => true]);
    $ugm->setPrimaryKey(['user_id', 'group_id']);
    $ugm->addForeignKeyConstraint('users', ['user_id'], ['id'], ['onDelete' => 'CASCADE']);
    $ugm->addForeignKeyConstraint('user_groups', ['group_id'], ['id'], ['onDelete' => 'CASCADE']);

    // --- group_roles ---
    $gr = $schema->createTable('group_roles');
    $gr->addColumn('group_id', Types::INTEGER, ['notnull' => true]);
    $gr->addColumn('role_id', Types::INTEGER, ['notnull' => true]);
    $gr->addColumn('created_at', Types::INTEGER, ['notnull' => true]);
    $gr->setPrimaryKey(['group_id', 'role_id']);
    $gr->addForeignKeyConstraint('user_groups', ['group_id'], ['id'], ['onDelete' => 'CASCADE']);
    $gr->addForeignKeyConstraint('roles', ['role_id'], ['id'], ['onDelete' => 'CASCADE']);

    // --- group_tile_permissions ---
    $gtp = $schema->createTable('group_tile_permissions');
    $gtp->addColumn('group_id', Types::INTEGER, ['notnull' => true]);
    $gtp->addColumn('tile_id', Types::STRING, ['length' => 255, 'notnull' => true]);
    $gtp->addColumn('can_view', Types::INTEGER, ['default' => 1, 'notnull' => true]);
    $gtp->addColumn('can_edit', Types::INTEGER, ['default' => 0, 'notnull' => true]);
    $gtp->addColumn('can_delete', Types::INTEGER, ['default' => 0, 'notnull' => true]);
    $gtp->addColumn('can_add_links', Types::INTEGER, ['notnull' => false]);
    $gtp->addColumn('can_add_sections', Types::INTEGER, ['notnull' => false]);
    $gtp->addColumn('can_add_tabs', Types::INTEGER, ['notnull' => false]);
    $gtp->addColumn('can_edit_links', Types::INTEGER, ['notnull' => false]);
    $gtp->addColumn('can_delete_links', Types::INTEGER, ['notnull' => false]);
    $gtp->addColumn('can_delete_sections', Types::INTEGER, ['notnull' => false]);
    $gtp->addColumn('can_delete_tabs', Types::INTEGER, ['notnull' => false]);
    $gtp->addColumn('can_change_visibility', Types::INTEGER, ['notnull' => false]);
    $gtp->addColumn('can_change_browser', Types::INTEGER, ['notnull' => false]);
    $gtp->addColumn('can_clone_tile', Types::INTEGER, ['notnull' => false]);
    $gtp->addColumn('can_view_tile_info', Types::INTEGER, ['notnull' => false]);
    $gtp->addColumn('can_edit_tile', Types::INTEGER, ['notnull' => false]);
    $gtp->addColumn('created_at', Types::INTEGER, ['notnull' => true]);
    $gtp->addColumn('updated_at', Types::INTEGER, ['notnull' => true]);
    $gtp->setPrimaryKey(['group_id', 'tile_id']);
    $gtp->addForeignKeyConstraint('user_groups', ['group_id'], ['id'], ['onDelete' => 'CASCADE']);
    $gtp->addForeignKeyConstraint('tiles', ['tile_id'], ['id'], ['onDelete' => 'CASCADE']);

    // --- style_profiles ---
    $sp = $schema->createTable('style_profiles');
    $sp->addColumn('id', Types::INTEGER, ['autoincrement' => true, 'notnull' => true]);
    $sp->addColumn('name', Types::TEXT, ['notnull' => true]);
    $sp->addColumn('styles_data', Types::TEXT, ['notnull' => true]);
    $sp->addColumn('is_active', Types::INTEGER, ['default' => 0, 'notnull' => false]);
    $sp->addColumn('created_at', Types::INTEGER, ['notnull' => true]);
    $sp->addColumn('updated_at', Types::INTEGER, ['notnull' => true]);
    $sp->setPrimaryKey(['id']);
    $sp->addIndex(['is_active']);

    return $schema;
}
