const API_BASE = import.meta.env.VITE_API_BASE || '/api';

export type UserTransferFormat = 'json' | 'csv';

export interface UserTransferImportSummary {
  total: number;
  created: number;
  skipped: number;
  errors: number;
}

export interface UserTransferImportResultRow {
  index?: number;
  id?: number;
  username: string;
  email?: string;
  auth_source?: string;
  reason?: string;
  unknown_roles?: string[];
}

export interface UserTransferImportResponse {
  success: boolean;
  message: string;
  results: {
    success: UserTransferImportResultRow[];
    skipped: UserTransferImportResultRow[];
    errors: UserTransferImportResultRow[];
  };
  summary: UserTransferImportSummary;
}

function filenameFromContentDisposition(header: string | null, fallback: string): string {
  if (!header) return fallback;
  const match = header.match(/filename="(.+)"/i) || header.match(/filename=([^;]+)/i);
  if (!match) return fallback;
  return match[1].trim().replace(/^["']|["']$/g, '') || fallback;
}

async function downloadBlobResponse(response: Response, fallbackName: string): Promise<void> {
  const filename = filenameFromContentDisposition(
    response.headers.get('Content-Disposition'),
    fallbackName
  );
  const blob = await response.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
}

export const userTransferService = {
  async exportUsers(
    userIds: number[],
    format: UserTransferFormat,
    includePasswordHashes: boolean
  ): Promise<void> {
    const response = await fetch(`${API_BASE}/user-transfer/export`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        userIds,
        format,
        includePasswordHashes,
      }),
    });

    if (!response.ok) {
      let message = 'Failed to export users';
      try {
        const data = await response.json();
        if (data?.error) message = data.error;
      } catch {
        // keep default
      }
      throw new Error(message);
    }

    const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '').replace(/(\d{8})(\d{4})/, '$1-$2');
    await downloadBlobResponse(response, `linknest-users-${stamp}.${format}`);
  },

  async importUsers(file: File): Promise<UserTransferImportResponse> {
    const form = new FormData();
    form.append('file', file);

    const response = await fetch(`${API_BASE}/user-transfer/import`, {
      method: 'POST',
      credentials: 'include',
      body: form,
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error((data as { error?: string }).error || 'Failed to import users');
    }
    return data as UserTransferImportResponse;
  },

  downloadTemplate(format: UserTransferFormat): void {
    if (format === 'csv') {
      const csv =
        'username,email,display_name,auth_source,is_approved,is_admin,is_disabled,notes,roles,saml_nameid,password\n' +
        'new.local,new.local@localhost,New Local,local,1,0,0,Imported local user,Developer,,SecurePassword123!\n' +
        'new.ldap,new.ldap@example.com,New LDAP,ldap,1,0,0,Imported LDAP user,,,\n';
      const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'linknest-users-import-template.csv';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      return;
    }

    const doc = {
      kind: 'linknest-users',
      version: 1,
      includesPasswordHashes: false,
      users: [
        {
          username: 'new.local',
          email: 'new.local@localhost',
          display_name: 'New Local',
          auth_source: 'local',
          is_approved: true,
          is_admin: false,
          is_disabled: false,
          notes: 'Imported local user',
          roles: 'Developer',
          password: 'SecurePassword123!',
        },
        {
          username: 'new.ldap',
          email: 'new.ldap@example.com',
          display_name: 'New LDAP',
          auth_source: 'ldap',
          is_approved: true,
          is_admin: false,
          is_disabled: false,
          notes: 'Imported LDAP user',
          roles: '',
        },
      ],
    };
    const blob = new Blob([JSON.stringify(doc, null, 2) + '\n'], {
      type: 'application/json;charset=utf-8',
    });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'linknest-users-import-template.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  },
};
