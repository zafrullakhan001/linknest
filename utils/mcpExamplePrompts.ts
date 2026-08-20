export type McpExampleNeed = 'read' | 'write' | 'admin-read' | 'admin-write';

export interface McpExamplePrompt {
  id: string;
  title: string;
  need: McpExampleNeed;
  prompt: string;
}

export const MCP_EXAMPLE_NEED_LABEL: Record<McpExampleNeed, string> = {
  read: 'Read token',
  write: 'Write token',
  'admin-read': 'Admin token',
  'admin-write': 'Admin + write token',
};

/** Paste-ready statements for Cursor / Claude after LinkNest MCP is connected. */
export const MCP_EXAMPLE_PROMPTS: McpExamplePrompt[] = [
  {
    id: 'whoami-spaces',
    title: 'Who am I, then list spaces',
    need: 'read',
    prompt: 'Use the LinkNest MCP. Call whoami, then list_spaces.',
  },
  {
    id: 'search-workday',
    title: 'Search links',
    need: 'read',
    prompt: 'Search my LinkNest spaces for Workday and list the matching URLs with space titles.',
  },
  {
    id: 'create-helpdesk',
    title: 'Create a space with links',
    need: 'write',
    prompt: `Create a LinkNest space titled Helpdesk Tools in category BUSINESS IT SERVICES, visibility public, emoji 🎫.

Add these links:
- ServiceNow — https://servicenow.adventhealth.com/now/sdw/home (tab Production, section Portals)
- Hub — https://hub.adventhealth.com/ (tab Production, section Portals)
- PAM — https://pam.adventhealth.com/webconsole/login (tab Production, section Security)`,
  },
  {
    id: 'add-url',
    title: 'Add a URL to an existing space',
    need: 'write',
    prompt: 'Add this URL to Helpdesk Tools under tab Production, section Portals: https://example.com/runbook',
  },
  {
    id: 'auth-status',
    title: 'LDAP / SAML status',
    need: 'admin-read',
    prompt: 'Show LDAP/SAML status and whether the PHP LDAP extension is loaded. Do not print any passwords or certificates.',
  },
  {
    id: 'ldap-setup',
    title: 'Set LDAP then test',
    need: 'admin-write',
    prompt:
      'Set LDAP host to dc.corp.example.com port 389, bind DN CN=svc,OU=Service Accounts,DC=corp,DC=example,DC=com, search base DC=corp,DC=example,DC=com, then test the connection. Do not print the bind password.',
  },
  {
    id: 'approve-user',
    title: 'Approve a pending user',
    need: 'admin-write',
    prompt: 'Use admin_query with tool list_pending_users, then admin_manage with tool set_user_status to approve jane.doe.',
  },
  {
    id: 'create-local-user',
    title: 'Create and approve a local user',
    need: 'admin-write',
    prompt: 'Create a local LinkNest user named helpdesk1 with email helpdesk1@example.com, auto-approve them, then list their profile with get_user. Do not print the password you set.',
  },
  {
    id: 'reset-password',
    title: 'Reset a local user password',
    need: 'admin-write',
    prompt: 'Reset the password for local user helpdesk1. Do not echo the new password in the chat.',
  },
  {
    id: 'promote-admin',
    title: 'Promote user to admin',
    need: 'admin-write',
    prompt: 'Promote user jsmith to administrator using set_user_admin.',
  },
  {
    id: 'transfer-ownership',
    title: 'Transfer space ownership',
    need: 'admin-write',
    prompt: 'Transfer space PeopleSoft ERP to user jsmith. Keep the previous owner as a space editor.',
  },
  {
    id: 'helpdesk-role',
    title: 'Create a role and assign it',
    need: 'admin-write',
    prompt:
      'Create role Helpdesk, assign nav tabs public and favorites, widgets clock and notes, and spaces PeopleSoft ERP and PAM. Then assign that role to user jsmith. Use add mode so existing grants are not wiped.',
  },
  {
    id: 'export-database',
    title: 'Export the database',
    need: 'admin-read',
    prompt:
      'Export the LinkNest database to a JSON backup file. Then tell me the filename, size, and row counts. Do not print or read the file contents.',
  },
  {
    id: 'import-database',
    title: 'Import a database export',
    need: 'admin-write',
    prompt:
      'List LinkNest database export files in data/exports. Import the latest JSON backup. This replaces all existing data — confirm that, and keep backup_first true. Do not paste the JSON into chat.',
  },
  {
    id: 'list-device-presets',
    title: 'List device presets',
    need: 'write',
    prompt:
      'Use the LinkNest MCP. Call whoami, then list_device_presets. Summarize by group with width × height, and say whether the catalog is custom or built-in defaults. Then show which ids are on the quick bar.',
  },
  {
    id: 'add-device-preset',
    title: 'Add a device preset',
    need: 'write',
    prompt:
      'Add a LinkNest Device Preview preset using manage_device_presets action add: id iphone-17, label iPhone 17, width 402, height 874, group iPhone, variant iphone-island. Put it on the quick bar.',
  },
];
