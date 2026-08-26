import React, { useEffect, useState } from 'react';
import { settingsService, AppSettings, applyAuthMethodToggle, isAuthMethodEnabled, countEnabledAuthMethods, AUTH_METHOD_KEEP_ONE_WARNING } from '../services/settingsService';
import { WizardNavButton } from './AccessWizardShell';

interface SamlConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const API_BASE = import.meta.env.VITE_API_BASE || '/api';

const TABS = [
  { id: 'authentication', label: 'Authentication', emoji: '🔐' },
  { id: 'service-provider', label: 'Service Provider', emoji: '🏠' },
  { id: 'identity-provider', label: 'Identity Provider', emoji: '🏛️' },
  { id: 'attribute-mapping', label: 'Attributes', emoji: '🗺️' },
  { id: 'test', label: 'Test & Validate', emoji: '🧪' },
  { id: 'advanced', label: 'Advanced', emoji: '⚙️' },
] as const;

type TabId = (typeof TABS)[number]['id'];

const fieldClassName =
  'w-full bg-slate-50 dark:bg-slate-900/50 border border-sky-200/70 dark:border-sky-800/40 rounded-xl px-3 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-400/50 focus:border-sky-400';

const labelClassName = 'block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2';
const helpClassName = 'text-xs text-slate-500 dark:text-slate-400 mt-1';
const cardClassName =
  'rounded-xl border border-sky-100 dark:border-sky-900/40 bg-gradient-to-br from-sky-50/40 to-white dark:from-sky-950/20 dark:to-slate-800 p-4';
const infoBoxClassName =
  'rounded-xl border border-sky-200/70 dark:border-sky-800/40 bg-gradient-to-r from-sky-50/80 to-teal-50/50 dark:from-sky-950/30 dark:to-teal-950/20 px-4 py-3 text-sm text-sky-900/80 dark:text-sky-200/80';
const brandInfoBoxClassName =
  'rounded-xl border border-sky-200 dark:border-sky-800 bg-sky-50 dark:bg-sky-900/20 px-4 py-3 text-sm text-sky-900 dark:text-sky-100';

const toggleTrackClassName =
  'w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-sky-300 dark:peer-focus:ring-sky-800 rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[\'\'] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-slate-600 peer-checked:bg-sky-600';

const DEFAULT_SETTINGS: Partial<AppSettings> = {
  saml_enabled: '0',
  local_auth_enabled: '1',
  ldap_enabled: '0',
  sp_entity_id: '',
  sp_assertion_consumer_service: '',
  sp_single_logout_service: '',
  sp_site_url: '',
  idp_entity_id: '',
  idp_sso_url: '',
  idp_slo_url: '',
  idp_x509cert: '',
  nameid_format: 'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress',
  strict: '1',
  debug: '0',
  map_name_to: 'uid',
  map_email_to: 'email',
  map_display_name_to: 'cn',
  auto_provision: '1',
};

const SamlConfigModal: React.FC<SamlConfigModalProps> = ({ isOpen, onClose }) => {
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>('authentication');
  const [message, setMessage] = useState<{ type: string; text: string }>({ type: '', text: '' });
  const [testResults, setTestResults] = useState<any[]>([]);
  const [testing, setTesting] = useState(false);
  const [testStatus, setTestStatus] = useState<{ type: string; text: string }>({ type: '', text: '' });
  const [settings, setSettings] = useState<Partial<AppSettings>>(DEFAULT_SETTINGS);

  useEffect(() => {
    if (!isOpen) return;
    setActiveTab('authentication');
    const load = async () => {
      setLoading(true);
      setMessage({ type: '', text: '' });
      try {
        const result = await settingsService.getSettings(true);
        setSettings({
          ...DEFAULT_SETTINGS,
          saml_enabled: result.saml_enabled || '0',
          local_auth_enabled: result.local_auth_enabled || '1',
          ldap_enabled: result.ldap_enabled || '0',
          sp_entity_id: result.sp_entity_id || '',
          sp_assertion_consumer_service: result.sp_assertion_consumer_service || '',
          sp_single_logout_service: result.sp_single_logout_service || '',
          sp_site_url: result.sp_site_url || '',
          idp_entity_id: result.idp_entity_id || '',
          idp_sso_url: result.idp_sso_url || '',
          idp_slo_url: result.idp_slo_url || '',
          idp_x509cert: result.idp_x509cert || '',
          nameid_format: result.nameid_format || 'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress',
          strict: result.strict || '1',
          debug: result.debug || '0',
          map_name_to: result.map_name_to || 'uid',
          map_email_to: result.map_email_to || 'email',
          map_display_name_to: result.map_display_name_to || 'cn',
          auto_provision: result.auto_provision || '1',
        });
      } catch {
        setMessage({ type: 'error', text: 'Failed to load settings' });
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [isOpen]);

  useEffect(() => {
    const handleEscKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscKey);
    }

    return () => {
      document.removeEventListener('keydown', handleEscKey);
    };
  }, [isOpen, onClose]);

  const exportConfiguration = () => {
    try {
      const configData = {
        version: '1.0',
        timestamp: new Date().toISOString(),
        settings,
        metadata: {
          exported_by: 'LinkNest SAML Configuration Tool',
          description: 'SAML 2.0 Configuration Export',
        },
      };

      const dataStr = JSON.stringify(configData, null, 2);
      const dataBlob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(dataBlob);

      const link = document.createElement('a');
      link.href = url;
      link.download = `saml-config-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      setMessage({ type: 'success', text: 'SAML configuration exported successfully!' });
    } catch (error) {
      console.error('Export error:', error);
      setMessage({ type: 'error', text: 'Failed to export configuration' });
    }
  };

  const importConfiguration = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const configData = JSON.parse(e.target?.result as string);

        if (!configData.settings || typeof configData.settings !== 'object') {
          throw new Error('Invalid configuration file format');
        }

        if (!configData.metadata || !configData.metadata.description?.includes('SAML')) {
          if (!window.confirm('This file may not be a SAML configuration file. Do you want to continue?')) {
            return;
          }
        }

        setSettings((prevSettings) => ({
          ...prevSettings,
          ...configData.settings,
        }));

        setMessage({
          type: 'success',
          text: `Configuration imported successfully! ${
            configData.timestamp ? `Exported on: ${new Date(configData.timestamp).toLocaleString()}` : ''
          }`,
        });

        event.target.value = '';
      } catch (error) {
        console.error('Import error:', error);
        setMessage({ type: 'error', text: 'Failed to import configuration. Please check the file format.' });
        event.target.value = '';
      }
    };

    reader.readAsText(file);
  };

  const save = async () => {
    setSaving(true);
    setMessage({ type: '', text: '' });
    try {
      await settingsService.updateSettings(settings);
      setMessage({ type: 'success', text: 'SAML settings saved successfully!' });
    } catch (e: any) {
      setMessage({ type: 'error', text: e.message || 'Failed to save settings' });
    } finally {
      setSaving(false);
    }
  };

  const runTests = async () => {
    setTesting(true);
    setTestStatus({ type: '', text: '' });
    setTestResults([]);

    try {
      const response = await fetch(`${API_BASE}/saml-test.php?action=test_configuration`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ action: 'test_configuration' }),
      });

      const result = await response.json();

      if (result.success && result.data) {
        setTestResults(result.data.results || []);
        setTestStatus({
          type: result.data.allPassed ? 'success' : 'warning',
          text: result.message,
        });
      } else {
        setTestStatus({ type: 'error', text: result.message || 'Test failed' });
      }
    } catch {
      setTestStatus({ type: 'error', text: 'Failed to run tests' });
    } finally {
      setTesting(false);
    }
  };

  const testMetadata = async () => {
    setTesting(true);
    try {
      const response = await fetch(`${API_BASE}/saml-test.php?action=test_metadata`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ action: 'test_metadata' }),
      });

      const result = await response.json();

      if (result.success) {
        setTestStatus({ type: 'success', text: 'Metadata test passed!' });
        setTestResults([
          {
            test: 'Metadata Generation',
            status: 'pass',
            message: result.message,
            icon: '✓',
          },
        ]);
      } else {
        setTestStatus({ type: 'error', text: result.message });
      }
    } catch {
      setTestStatus({ type: 'error', text: 'Metadata test failed' });
    } finally {
      setTesting(false);
    }
  };

  const testIdpConnectivity = async () => {
    setTesting(true);
    try {
      const response = await fetch(`${API_BASE}/saml-test.php?action=test_idp_connectivity`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ action: 'test_idp_connectivity' }),
      });

      const result = await response.json();

      if (result.success) {
        const idpName = result.data?.idp_name || 'Unknown IdP';
        setTestStatus({ type: 'success', text: `IdP "${idpName}" is reachable!` });
        setTestResults([
          {
            test: 'IdP Connectivity',
            status: 'pass',
            message: result.data?.message,
            icon: '✓',
          },
        ]);
      } else {
        setTestStatus({ type: 'error', text: result.message });
        if (result.data) {
          const idpName = result.data?.idp_name || 'Unknown IdP';
          const errorMsg = result.data?.error
            ? `${result.data.error} (IdP: ${idpName})`
            : result.message;
          setTestResults([
            {
              test: 'IdP Connectivity',
              status: 'fail',
              message: errorMsg,
              icon: '✗',
            },
          ]);
        }
      }
    } catch {
      setTestStatus({ type: 'error', text: 'IdP connectivity test failed' });
    } finally {
      setTesting(false);
    }
  };

  const renderToggleRow = (
    title: string,
    description: string,
    checked: boolean,
    onChange: (checked: boolean) => void,
    iconBg: string,
    icon: React.ReactNode,
    disabled = false
  ) => (
    <div className={`${cardClassName} ${disabled ? 'opacity-90' : ''}`}>
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${iconBg}`}>
            {icon}
          </div>
          <div className="min-w-0">
            <h4 className="text-sm font-semibold text-slate-900 dark:text-white">{title}</h4>
            <p className="text-xs text-slate-500 dark:text-slate-400">{description}</p>
          </div>
        </div>
        <label className={`relative inline-flex items-center shrink-0 ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
          <input
            type="checkbox"
            className="sr-only peer"
            checked={checked}
            disabled={disabled}
            onChange={(e) => onChange(e.target.checked)}
          />
          <div className={toggleTrackClassName}></div>
        </label>
      </div>
    </div>
  );

  const setAuthMethod = (key: 'local_auth_enabled' | 'ldap_enabled' | 'saml_enabled', checked: boolean) => {
    setSettings((prev) => {
      const patch = applyAuthMethodToggle(prev as AppSettings, key, checked);
      if (!patch) {
        alert(AUTH_METHOD_KEEP_ONE_WARNING);
        return prev;
      }
      return { ...prev, ...patch };
    });
  };

  const renderServiceProviderTab = () => (
    <div className="space-y-5">
      <div className={infoBoxClassName}>
        <span className="mr-1.5" aria-hidden>🏠</span>
        Configure your application&apos;s SAML service provider metadata. These URLs must be registered with your Identity Provider.
      </div>

      <div className="grid grid-cols-1 gap-4 rounded-xl bg-sky-50/40 dark:bg-sky-950/15 border border-sky-100 dark:border-sky-900/40 p-4">
        <div>
          <label className={labelClassName}><span className="mr-1" aria-hidden>🆔</span>Entity ID (SP Issuer)</label>
          <input
            type="text"
            className={fieldClassName}
            placeholder="https://your-app.com/saml/metadata"
            value={settings.sp_entity_id || ''}
            onChange={(e) => setSettings((s) => ({ ...s, sp_entity_id: e.target.value }))}
          />
          <p className={helpClassName}>Unique identifier for this application (leave blank for auto-generated)</p>
        </div>

        <div>
          <label className={labelClassName}><span className="mr-1" aria-hidden>📥</span>Assertion Consumer Service (ACS) URL</label>
          <input
            type="text"
            className={fieldClassName}
            placeholder="https://your-app.com/api/saml?action=acs"
            value={settings.sp_assertion_consumer_service || ''}
            onChange={(e) => setSettings((s) => ({ ...s, sp_assertion_consumer_service: e.target.value }))}
          />
          <p className={helpClassName}>Where IdP sends SAML assertions (leave blank for auto-generated)</p>
        </div>

        <div>
          <label className={labelClassName}><span className="mr-1" aria-hidden>🚪</span>Single Logout Service (SLO) URL</label>
          <input
            type="text"
            className={fieldClassName}
            placeholder="https://your-app.com/api/saml?action=logout"
            value={settings.sp_single_logout_service || ''}
            onChange={(e) => setSettings((s) => ({ ...s, sp_single_logout_service: e.target.value }))}
          />
          <p className={helpClassName}>Endpoint for single logout (leave blank for auto-generated)</p>
        </div>

        <div>
          <label className={labelClassName}><span className="mr-1" aria-hidden>🌐</span>Application Site URL</label>
          <input
            type="text"
            className={fieldClassName}
            placeholder="https://your-app.com/"
            value={settings.sp_site_url || ''}
            onChange={(e) => setSettings((s) => ({ ...s, sp_site_url: e.target.value }))}
          />
          <p className={helpClassName}>Base URL of your application (e.g., https://your-app.com/)</p>
        </div>
      </div>

      <div className={brandInfoBoxClassName}>
        <div className="text-xs font-semibold uppercase tracking-wide text-sky-600 dark:text-sky-300 mb-1 flex items-center gap-1.5">
          <span aria-hidden>📄</span> SP Metadata
        </div>
        <p className="text-sm mb-3">
          Provide this metadata XML to your Identity Provider administrator.
        </p>
        <a
          href={`${API_BASE}/saml?action=metadata`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-sky-600 hover:bg-sky-500 text-white transition-colors shadow-sm shadow-sky-500/20"
        >
          <span aria-hidden>🔗</span>
          View SP Metadata XML
        </a>
      </div>
    </div>
  );

  const renderIdentityProviderTab = () => (
    <div className="space-y-5">
      <div className={infoBoxClassName}>
        <span className="mr-1.5" aria-hidden>🏛️</span>
        Obtain these values from your IdP administrator or IdP metadata XML (Azure AD, Okta, Auth0, etc.)
      </div>

      <div className="grid grid-cols-1 gap-4 rounded-xl bg-teal-50/40 dark:bg-teal-950/15 border border-teal-100 dark:border-teal-900/40 p-4">
        <div>
          <label className={labelClassName}>
            <span className="mr-1" aria-hidden>🆔</span>IdP Entity ID <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            className={fieldClassName}
            placeholder="https://sts.windows.net/your-tenant-id/"
            value={settings.idp_entity_id || ''}
            onChange={(e) => setSettings((s) => ({ ...s, idp_entity_id: e.target.value }))}
          />
          <p className={helpClassName}>Unique identifier provided by your Identity Provider</p>
        </div>

        <div>
          <label className={labelClassName}>
            <span className="mr-1" aria-hidden>🔑</span>Single Sign-On (SSO) URL <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            className={fieldClassName}
            placeholder="https://login.microsoftonline.com/your-tenant-id/saml2"
            value={settings.idp_sso_url || ''}
            onChange={(e) => setSettings((s) => ({ ...s, idp_sso_url: e.target.value }))}
          />
          <p className={helpClassName}>SAML SSO endpoint URL provided by your IdP</p>
        </div>

        <div>
          <label className={labelClassName}><span className="mr-1" aria-hidden>🚪</span>Single Logout (SLO) URL</label>
          <input
            type="text"
            className={fieldClassName}
            placeholder="https://login.microsoftonline.com/your-tenant-id/saml2"
            value={settings.idp_slo_url || ''}
            onChange={(e) => setSettings((s) => ({ ...s, idp_slo_url: e.target.value }))}
          />
          <p className={helpClassName}>Optional: SAML logout endpoint URL</p>
        </div>

        <div>
          <label className={labelClassName}>
            <span className="mr-1" aria-hidden>📜</span>X.509 Certificate <span className="text-red-500">*</span>
          </label>
          <textarea
            className={`${fieldClassName} font-mono text-xs`}
            rows={8}
            placeholder="-----BEGIN CERTIFICATE-----&#10;MIIDdzCCAl+gAwIBAgIEAgAAuTANBgkqhkiG9...&#10;-----END CERTIFICATE-----"
            value={settings.idp_x509cert || ''}
            onChange={(e) => setSettings((s) => ({ ...s, idp_x509cert: e.target.value }))}
          />
          <p className={helpClassName}>Public certificate from your IdP (paste entire certificate including headers)</p>
        </div>
      </div>
    </div>
  );

  const renderAuthenticationTab = () => (
    <div className="space-y-5">
      <div className={infoBoxClassName}>
        <span className="mr-1.5" aria-hidden>🔐</span>
        Control which authentication methods are enabled for your application. Users will see enabled options on the login page.
      </div>

      <div className="rounded-xl border border-amber-200 dark:border-amber-800/60 bg-amber-50/80 dark:bg-amber-950/30 px-4 py-3 text-sm text-amber-900 dark:text-amber-100">
        <span className="mr-1.5" aria-hidden>⚠️</span>
        {AUTH_METHOD_KEEP_ONE_WARNING} At least one method must stay on.
      </div>

      <div className="space-y-3">
        {renderToggleRow(
          'Local Authentication',
          'Username and password login',
          isAuthMethodEnabled(settings, 'local_auth_enabled'),
          (checked) => setAuthMethod('local_auth_enabled', checked),
          'bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-200',
          <span className="text-lg" aria-hidden>👤</span>,
          isAuthMethodEnabled(settings, 'local_auth_enabled') && countEnabledAuthMethods(settings) === 1
        )}

        {renderToggleRow(
          'LDAP Authentication',
          'Enterprise directory / Active Directory',
          isAuthMethodEnabled(settings, 'ldap_enabled'),
          (checked) => setAuthMethod('ldap_enabled', checked),
          'bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-200',
          <span className="text-lg" aria-hidden>🏢</span>,
          isAuthMethodEnabled(settings, 'ldap_enabled') && countEnabledAuthMethods(settings) === 1
        )}

        {renderToggleRow(
          'SAML 2.0 Authentication',
          'Enterprise single sign-on',
          isAuthMethodEnabled(settings, 'saml_enabled'),
          (checked) => setAuthMethod('saml_enabled', checked),
          'bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-200',
          <span className="text-lg" aria-hidden>🔐</span>,
          isAuthMethodEnabled(settings, 'saml_enabled') && countEnabledAuthMethods(settings) === 1
        )}
      </div>
    </div>
  );

  const renderAttributeMappingTab = () => (
    <div className="space-y-5">
      <div className={infoBoxClassName}>
        <span className="mr-1.5" aria-hidden>🗺️</span>
        Map SAML assertion attributes to user fields. Use exact attribute names from your IdP (case-sensitive).
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 rounded-xl bg-blue-50/40 dark:bg-blue-950/15 border border-blue-100 dark:border-blue-900/40 p-4">
        <div>
          <label className={labelClassName}>
            <span className="mr-1" aria-hidden>👤</span>Username Attribute <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            className={fieldClassName}
            placeholder="username, uid, sAMAccountName"
            value={settings.map_name_to || ''}
            onChange={(e) => setSettings((s) => ({ ...s, map_name_to: e.target.value }))}
          />
          <p className={helpClassName}>SAML attribute for username</p>
        </div>

        <div>
          <label className={labelClassName}>
            <span className="mr-1" aria-hidden>✉️</span>Email Attribute <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            className={fieldClassName}
            placeholder="email, mail, emailAddress"
            value={settings.map_email_to || ''}
            onChange={(e) => setSettings((s) => ({ ...s, map_email_to: e.target.value }))}
          />
          <p className={helpClassName}>SAML attribute for email</p>
        </div>

        <div>
          <label className={labelClassName}><span className="mr-1" aria-hidden>🏷️</span>Display Name Attribute</label>
          <input
            type="text"
            className={fieldClassName}
            placeholder="displayName, cn, name"
            value={settings.map_display_name_to || ''}
            onChange={(e) => setSettings((s) => ({ ...s, map_display_name_to: e.target.value }))}
          />
          <p className={helpClassName}>SAML attribute for display name</p>
        </div>
      </div>

      <div>
        <label className={labelClassName}><span className="mr-1" aria-hidden>📋</span>NameID Format</label>
        <select
          className={fieldClassName}
          value={settings.nameid_format || 'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress'}
          onChange={(e) => setSettings((s) => ({ ...s, nameid_format: e.target.value }))}
        >
          <option value="urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress">Email Address</option>
          <option value="urn:oasis:names:tc:SAML:1.1:nameid-format:unspecified">Unspecified</option>
          <option value="urn:oasis:names:tc:SAML:2.0:nameid-format:persistent">Persistent</option>
          <option value="urn:oasis:names:tc:SAML:2.0:nameid-format:transient">Transient</option>
        </select>
        <p className={helpClassName}>Format for the NameID element in SAML assertions</p>
      </div>
    </div>
  );

  const renderTestTab = () => (
    <div className="space-y-5">
      <div className={infoBoxClassName}>
        <span className="mr-1.5" aria-hidden>🧪</span>
        Verify your SAML configuration is correct and working. Run tests before going live.
      </div>

      {testStatus.text && (
        <div
          className={`px-4 py-3 rounded-xl border text-sm flex items-start gap-2 ${
            testStatus.type === 'success'
              ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800 text-green-700 dark:text-green-400'
              : testStatus.type === 'warning'
                ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400'
                : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-700 dark:text-red-400'
          }`}
        >
          <span aria-hidden>{testStatus.type === 'success' ? '✅' : testStatus.type === 'warning' ? '⚠️' : '❌'}</span>
          <span>{testStatus.text}</span>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <WizardNavButton onClick={runTests} disabled={testing}>
          {testing ? 'Testing…' : '🧪 Run All Tests'}
        </WizardNavButton>

        <WizardNavButton variant="secondary" onClick={testMetadata} disabled={testing}>
          📄 Test Metadata
        </WizardNavButton>

        <WizardNavButton variant="secondary" onClick={testIdpConnectivity} disabled={testing}>
          🏛️ Test IdP Connectivity
        </WizardNavButton>

        <a
          href={`${API_BASE}/saml?action=metadata`}
          target="_blank"
          rel="noreferrer"
          className="px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors bg-sky-50 dark:bg-sky-950/30 border border-sky-200 dark:border-sky-800 text-sky-800 dark:text-sky-200 hover:bg-sky-100 dark:hover:bg-sky-900/40 text-center"
        >
          🔗 View Metadata XML
        </a>
      </div>

      {testResults.length > 0 && (
        <div className={cardClassName}>
          <h4 className="text-sm font-semibold text-slate-900 dark:text-white mb-3 flex items-center gap-1.5">
            <span aria-hidden>📊</span> Test Results
          </h4>
          <div className="space-y-2">
            {testResults.map((result, index) => (
              <div
                key={index}
                className={`flex items-start gap-3 p-3 rounded-xl border ${
                  result.status === 'pass'
                    ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
                    : result.status === 'warning'
                      ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800'
                      : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
                }`}
              >
                <div
                  className={`text-sm font-bold mt-0.5 ${
                    result.status === 'pass'
                      ? 'text-green-600 dark:text-green-400'
                      : result.status === 'warning'
                        ? 'text-amber-600 dark:text-amber-400'
                        : 'text-red-600 dark:text-red-400'
                  }`}
                >
                  {result.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <h5
                    className={`text-sm font-medium ${
                      result.status === 'pass'
                        ? 'text-green-800 dark:text-green-200'
                        : result.status === 'warning'
                          ? 'text-amber-800 dark:text-amber-200'
                          : 'text-red-800 dark:text-red-200'
                    }`}
                  >
                    {result.test}
                  </h5>
                  <p
                    className={`text-xs mt-0.5 ${
                      result.status === 'pass'
                        ? 'text-green-700 dark:text-green-300'
                        : result.status === 'warning'
                          ? 'text-amber-700 dark:text-amber-300'
                          : 'text-red-700 dark:text-red-300'
                    }`}
                  >
                    {result.message}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className={infoBoxClassName}>
        <div className="text-xs font-semibold uppercase tracking-wide text-sky-600 dark:text-sky-300 mb-2 flex items-center gap-1.5">
          <span aria-hidden>💡</span> Testing tips
        </div>
        <ul className="space-y-1 text-sm">
          <li>
            <strong className="font-semibold text-sky-900 dark:text-sky-100">Run All Tests</strong> — validates
            configuration, database, and library
          </li>
          <li>
            <strong className="font-semibold text-sky-900 dark:text-sky-100">Test Metadata</strong> — verifies SP
            metadata XML generation
          </li>
          <li>
            <strong className="font-semibold text-sky-900 dark:text-sky-100">Test IdP Connectivity</strong> — checks
            if IdP URL is reachable
          </li>
          <li>
            <strong className="font-semibold text-sky-900 dark:text-sky-100">View Metadata XML</strong> — opens your
            metadata in a new tab to share with the IdP admin
          </li>
        </ul>
      </div>
    </div>
  );

  const renderAdvancedTab = () => (
    <div className="space-y-5">
      <div className={infoBoxClassName}>
        <span className="mr-1.5" aria-hidden>⚙️</span>
        Security and provisioning options. Use caution when modifying these settings.
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {renderToggleRow(
          'Strict Mode',
          'Validate SAML responses strictly',
          settings.strict === '1',
          (checked) => setSettings((s) => ({ ...s, strict: checked ? '1' : '0' })),
          'bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-300',
          <span className="text-lg" aria-hidden>🛡️</span>
        )}

        {renderToggleRow(
          'Debug Mode',
          'Enable detailed SAML logging',
          settings.debug === '1',
          (checked) => setSettings((s) => ({ ...s, debug: checked ? '1' : '0' })),
          'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300',
          <span className="text-lg" aria-hidden>🐛</span>
        )}

        <div className="md:col-span-2">
          {renderToggleRow(
            'Auto-Provision Users',
            'Automatically create user accounts on first SAML login',
            settings.auto_provision === '1',
            (checked) => setSettings((s) => ({ ...s, auto_provision: checked ? '1' : '0' })),
            'bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300',
            <span className="text-lg" aria-hidden>✨</span>
          )}
        </div>
      </div>
    </div>
  );

  const activeTabMeta = TABS.find((tab) => tab.id === activeTab);
  const activeTabLabel = activeTabMeta?.label || 'Configuration';
  const activeTabEmoji = activeTabMeta?.emoji || '🔐';

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[10010] p-4">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden border border-sky-200/70 dark:border-sky-800/40 shadow-sky-500/10">
        {/* Header */}
        <div className="px-6 pt-5 pb-4 border-b border-sky-100 dark:border-sky-900/40 bg-gradient-to-r from-sky-50 via-teal-50/80 to-cyan-50/60 dark:from-sky-950/40 dark:via-teal-950/30 dark:to-cyan-950/20">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <span aria-hidden>🔐</span> SAML 2.0 Configuration
              </h2>
              <p className="text-sm text-sky-800/70 dark:text-sky-200/70 mt-1">
                Manage enterprise single sign-on settings · {activeTabEmoji} {activeTabLabel}
              </p>
            </div>
            <div className="flex items-center flex-wrap justify-end gap-2 shrink-0">
              <WizardNavButton variant="secondary" onClick={exportConfiguration}>
                📦 Export
              </WizardNavButton>

              <label
                htmlFor="saml-import-file"
                className="px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors cursor-pointer bg-white/80 dark:bg-slate-800/80 border border-sky-200 dark:border-sky-700 text-sky-800 dark:text-sky-200 hover:bg-sky-50 dark:hover:bg-sky-950/40"
              >
                📥 Import
              </label>
              <input
                id="saml-import-file"
                type="file"
                accept=".json"
                onChange={importConfiguration}
                className="hidden"
                title="Import SAML Configuration from JSON file"
              />

              <WizardNavButton
                variant="secondary"
                onClick={() => {
                  if (
                    window.confirm(
                      'Are you sure you want to reset all SAML configuration to default values? This will clear all current settings.'
                    )
                  ) {
                    setSettings(DEFAULT_SETTINGS);
                    setMessage({ type: 'info', text: 'SAML configuration reset to defaults' });
                  }
                }}
              >
                ♻️ Reset
              </WizardNavButton>

              <button
                type="button"
                onClick={onClose}
                className="text-sky-400 hover:text-sky-700 dark:hover:text-sky-200 transition-colors shrink-0"
                aria-label="Close"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* Tabs */}
          <div className="mt-5 bg-white/70 dark:bg-slate-900/40 border border-sky-200/70 dark:border-sky-800/40 rounded-xl p-1">
            <div className="flex flex-wrap gap-1">
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex-1 min-w-[7rem] px-3 py-2 text-sm font-medium transition-colors rounded-lg ${
                    activeTab === tab.id
                      ? 'bg-sky-600 text-white shadow-sm shadow-sky-500/25'
                      : 'text-sky-800/70 dark:text-sky-200/70 hover:bg-sky-100/80 dark:hover:bg-sky-900/40'
                  }`}
                >
                  <span className="mr-1" aria-hidden>{tab.emoji}</span>
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="px-6 py-5 overflow-y-auto flex-1 space-y-5">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="flex flex-col items-center gap-3">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sky-500"></div>
                <span className="text-sm text-sky-700 dark:text-sky-300">Loading configuration…</span>
              </div>
            </div>
          ) : (
            <>
              {message.text && (
                <div
                  className={`px-4 py-3 rounded-lg border text-sm flex items-start gap-2 ${
                    message.type === 'success'
                      ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800 text-green-700 dark:text-green-400'
                      : message.type === 'info'
                        ? 'bg-sky-50 dark:bg-sky-900/20 border-sky-200 dark:border-sky-800 text-sky-800 dark:text-sky-200'
                        : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-700 dark:text-red-400'
                  }`}
                >
                  <span aria-hidden>
                    {message.type === 'success' ? '✅' : message.type === 'info' ? '💡' : '⚠️'}
                  </span>
                  <span>{message.text}</span>
                </div>
              )}

              {activeTab === 'authentication' && renderAuthenticationTab()}
              {activeTab === 'service-provider' && renderServiceProviderTab()}
              {activeTab === 'identity-provider' && renderIdentityProviderTab()}
              {activeTab === 'attribute-mapping' && renderAttributeMappingTab()}
              {activeTab === 'test' && renderTestTab()}
              {activeTab === 'advanced' && renderAdvancedTab()}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-sky-100 dark:border-sky-900/40 flex items-center justify-between gap-3 bg-gradient-to-r from-sky-50/80 to-teal-50/60 dark:from-sky-950/30 dark:to-teal-950/20">
          <WizardNavButton variant="ghost" onClick={onClose}>
            Cancel
          </WizardNavButton>
          <WizardNavButton onClick={save} disabled={saving || loading}>
            {saving ? 'Saving…' : '💾 Save Configuration'}
          </WizardNavButton>
        </div>
      </div>
    </div>
  );
};

export default SamlConfigModal;
