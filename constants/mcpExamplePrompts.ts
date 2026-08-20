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
    prompt: 'List pending LinkNest users and approve jane.doe.',
  },
  {
    id: 'helpdesk-role',
    title: 'Create a role and assign it',
    need: 'admin-write',
    prompt:
      'Create role Helpdesk, assign nav tabs public and favorites, widgets clock and notes, and spaces PeopleSoft ERP and PAM. Then assign that role to user jsmith. Use add mode so existing grants are not wiped.',
  },
];
