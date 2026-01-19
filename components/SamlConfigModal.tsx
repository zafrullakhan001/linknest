import React, { useEffect, useState, useRef } from 'react';
import { settingsService } from '../services/settingsService';
import { AppSettings } from '../services/settingsService';

interface SamlConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const API_BASE = import.meta.env.VITE_API_BASE || '/api';

const SamlConfigModal: React.FC<SamlConfigModalProps> = ({ isOpen, onClose }) => {
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('authentication');
  const modalRef = useRef<HTMLDivElement>(null);
  const [message, setMessage] = useState<{ type: string; text: string }>({ type: '', text: '' });
  const [testResults, setTestResults] = useState<any[]>([]);
  const [testing, setTesting] = useState(false);
  const [testStatus, setTestStatus] = useState<{ type: string; text: string }>({ type: '', text: '' });
  const [settings, setSettings] = useState<Partial<AppSettings>>({
    saml_enabled: '0',
    local_auth_enabled: '1',
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
    auto_provision: '1'
  });

  useEffect(() => {
    if (!isOpen) return;
    const load = async () => {
      setLoading(true);
      setMessage({ type: '', text: '' });
      try {
        const result = await settingsService.getSettings(true);
        setSettings(prev => ({
          ...prev,
          saml_enabled: result.saml_enabled || '0',
          local_auth_enabled: result.local_auth_enabled || '1',
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
          auto_provision: result.auto_provision || '1'
        }));
      } catch (e) {
        setMessage({ type: 'error', text: 'Failed to load settings' });
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [isOpen]);

  // Handle ESC key to close modal
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


  // Export SAML configuration to JSON file
  const exportConfiguration = () => {
    try {
      const configData = {
        version: '1.0',
        timestamp: new Date().toISOString(),
        settings: settings,
        metadata: {
          exported_by: 'LinkNest SAML Configuration Tool',
          description: 'SAML 2.0 Configuration Export'
        }
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

  // Import SAML configuration from JSON file
  const importConfiguration = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const configData = JSON.parse(e.target?.result as string);
        
        // Validate the imported data
        if (!configData.settings || typeof configData.settings !== 'object') {
          throw new Error('Invalid configuration file format');
        }
        
        // Check if it's a SAML configuration file
        if (!configData.metadata || !configData.metadata.description?.includes('SAML')) {
          if (!window.confirm('This file may not be a SAML configuration file. Do you want to continue?')) {
            return;
          }
        }
        
        // Update settings with imported data
        setSettings(prevSettings => ({
          ...prevSettings,
          ...configData.settings
        }));
        
        setMessage({ 
          type: 'success', 
          text: `Configuration imported successfully! ${configData.timestamp ? `Exported on: ${new Date(configData.timestamp).toLocaleString()}` : ''}` 
        });
        
        // Reset file input
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
        body: JSON.stringify({ action: 'test_configuration' })
      });

      const result = await response.json();
      
      if (result.success && result.data) {
        setTestResults(result.data.results || []);
        setTestStatus({ 
          type: result.data.allPassed ? 'success' : 'warning', 
          text: result.message 
        });
      } else {
        setTestStatus({ type: 'error', text: result.message || 'Test failed' });
      }
    } catch (error) {
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
        body: JSON.stringify({ action: 'test_metadata' })
      });

      const result = await response.json();
      
      if (result.success) {
        setTestStatus({ type: 'success', text: 'Metadata test passed!' });
        setTestResults([{
          test: 'Metadata Generation',
          status: 'pass',
          message: result.message,
          icon: '✓'
        }]);
      } else {
        setTestStatus({ type: 'error', text: result.message });
      }
    } catch (error) {
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
        body: JSON.stringify({ action: 'test_idp_connectivity' })
      });

      const result = await response.json();
      
      if (result.success) {
        const idpName = result.data?.idp_name || 'Unknown IdP';
        setTestStatus({ type: 'success', text: `IdP "${idpName}" is reachable!` });
        setTestResults([{
          test: 'IdP Connectivity',
          status: 'pass',
          message: result.data?.message,
          icon: '✓'
        }]);
      } else {
        setTestStatus({ type: 'error', text: result.message });
        if (result.data) {
          const idpName = result.data?.idp_name || 'Unknown IdP';
          const errorMsg = result.data?.error 
            ? `${result.data.error} (IdP: ${idpName})` 
            : result.message;
          setTestResults([{
            test: 'IdP Connectivity',
            status: 'fail',
            message: errorMsg,
            icon: '✗'
          }]);
        }
      }
    } catch (error) {
      setTestStatus({ type: 'error', text: 'IdP connectivity test failed' });
    } finally {
      setTesting(false);
    }
  };

  const renderServiceProviderTab = () => (
    <div className="space-y-6">
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
        <div className="flex items-start space-x-3">
          <svg className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div className="flex-1">
            <h4 className="text-sm font-semibold text-blue-800 dark:text-blue-200 mb-1">Service Provider Settings</h4>
            <p className="text-xs text-blue-700 dark:text-blue-300">
              Configure your application's SAML service provider metadata. These URLs must be registered with your Identity Provider.
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4">
        <div>
          <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
            Entity ID (SP Issuer)
          </label>
          <input 
            type="text"
            className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="https://your-app.com/saml/metadata"
            value={settings.sp_entity_id || ''} 
            onChange={e => setSettings(s => ({...s, sp_entity_id: e.target.value}))} 
          />
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Unique identifier for this application (leave blank for auto-generated)
          </p>
        </div>

        <div>
          <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
            Assertion Consumer Service (ACS) URL
          </label>
          <input 
            type="text"
            className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="https://your-app.com/api/saml?action=acs"
            value={settings.sp_assertion_consumer_service || ''} 
            onChange={e => setSettings(s => ({...s, sp_assertion_consumer_service: e.target.value}))} 
          />
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Where IdP sends SAML assertions (leave blank for auto-generated)
          </p>
        </div>

        <div>
          <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
            Single Logout Service (SLO) URL
          </label>
          <input 
            type="text"
            className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="https://your-app.com/api/saml?action=logout"
            value={settings.sp_single_logout_service || ''} 
            onChange={e => setSettings(s => ({...s, sp_single_logout_service: e.target.value}))} 
          />
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Endpoint for single logout (leave blank for auto-generated)
          </p>
        </div>

        <div>
          <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
            Application Site URL
          </label>
          <input 
            type="text"
            className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="https://your-app.com/"
            value={settings.sp_site_url || ''} 
            onChange={e => setSettings(s => ({...s, sp_site_url: e.target.value}))} 
          />
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Base URL of your application (e.g., https://your-app.com/)
          </p>
        </div>
      </div>

      <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
        <div className="flex items-start space-x-3">
          <svg className="w-5 h-5 text-green-600 dark:text-green-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <div className="flex-1">
            <h4 className="text-sm font-semibold text-green-800 dark:text-green-200 mb-1">SP Metadata</h4>
            <p className="text-xs text-green-700 dark:text-green-300 mb-2">
              Provide this metadata XML to your Identity Provider administrator.
            </p>
            <a 
              href={`${API_BASE}/saml?action=metadata`}
              target="_blank" 
              rel="noreferrer" 
              className="inline-flex items-center space-x-1 px-3 py-1.5 bg-green-600 text-white text-xs font-medium rounded-lg hover:bg-green-700 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
              <span>View SP Metadata XML</span>
            </a>
          </div>
        </div>
      </div>
    </div>
  );

  const renderIdentityProviderTab = () => (
    <div className="space-y-6">
      <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg p-4">
        <div className="flex items-start space-x-3">
          <svg className="w-5 h-5 text-purple-600 dark:text-purple-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div className="flex-1">
            <h4 className="text-sm font-semibold text-purple-800 dark:text-purple-200 mb-1">Identity Provider Settings</h4>
            <p className="text-xs text-purple-700 dark:text-purple-300">
              Obtain these values from your IdP administrator or IdP metadata XML (Azure AD, Okta, Auth0, etc.)
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4">
        <div>
          <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
            IdP Entity ID <span className="text-red-500">*</span>
          </label>
          <input 
            type="text"
            className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="https://sts.windows.net/your-tenant-id/"
            value={settings.idp_entity_id || ''} 
            onChange={e => setSettings(s => ({...s, idp_entity_id: e.target.value}))} 
          />
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Unique identifier provided by your Identity Provider
          </p>
        </div>

        <div>
          <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
            Single Sign-On (SSO) URL <span className="text-red-500">*</span>
          </label>
          <input 
            type="text"
            className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="https://login.microsoftonline.com/your-tenant-id/saml2"
            value={settings.idp_sso_url || ''} 
            onChange={e => setSettings(s => ({...s, idp_sso_url: e.target.value}))} 
          />
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            SAML SSO endpoint URL provided by your IdP
          </p>
        </div>

        <div>
          <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
            Single Logout (SLO) URL
          </label>
          <input 
            type="text"
            className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="https://login.microsoftonline.com/your-tenant-id/saml2"
            value={settings.idp_slo_url || ''} 
            onChange={e => setSettings(s => ({...s, idp_slo_url: e.target.value}))} 
          />
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Optional: SAML logout endpoint URL
          </p>
        </div>

        <div>
          <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
            X.509 Certificate <span className="text-red-500">*</span>
          </label>
          <textarea 
            className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-xs"
            rows={8}
            placeholder="-----BEGIN CERTIFICATE-----&#10;MIIDdzCCAl+gAwIBAgIEAgAAuTANBgkqhkiG9...&#10;-----END CERTIFICATE-----"
            value={settings.idp_x509cert || ''} 
            onChange={e => setSettings(s => ({...s, idp_x509cert: e.target.value}))} 
          />
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Public certificate from your IdP (paste entire certificate including headers)
          </p>
        </div>
      </div>
    </div>
  );

  const renderAuthenticationTab = () => (
    <div className="space-y-6">
      <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
        <div className="flex items-start space-x-3">
          <svg className="w-5 h-5 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
          <div className="flex-1">
            <h4 className="text-sm font-semibold text-amber-800 dark:text-amber-200 mb-1">Authentication Control</h4>
            <p className="text-xs text-amber-700 dark:text-amber-300">
              Control which authentication methods are enabled for your application. Users will see enabled options on the login page.
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-lg flex items-center justify-center">
                <span className="text-xl">🔑</span>
              </div>
              <div>
                <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-200">SAML 2.0 Authentication</h4>
                <p className="text-xs text-slate-500 dark:text-slate-400">Enterprise single sign-on</p>
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input 
                type="checkbox" 
                className="sr-only peer" 
                checked={settings.saml_enabled === '1'} 
                onChange={e => setSettings(s => ({...s, saml_enabled: e.target.checked ? '1' : '0'}))} 
              />
              <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-slate-600 peer-checked:bg-blue-600"></div>
            </label>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-gradient-to-br from-slate-500 to-slate-600 rounded-lg flex items-center justify-center">
                <span className="text-xl">👤</span>
              </div>
              <div>
                <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Local Authentication</h4>
                <p className="text-xs text-slate-500 dark:text-slate-400">Username and password login</p>
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input 
                type="checkbox" 
                className="sr-only peer" 
                checked={settings.local_auth_enabled === '1'} 
                onChange={e => setSettings(s => ({...s, local_auth_enabled: e.target.checked ? '1' : '0'}))} 
              />
              <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-slate-600 peer-checked:bg-blue-600"></div>
            </label>
          </div>
        </div>
      </div>
    </div>
  );

  const renderAttributeMappingTab = () => (
    <div className="space-y-6">
      <div className="bg-teal-50 dark:bg-teal-900/20 border border-teal-200 dark:border-teal-800 rounded-lg p-4">
        <div className="flex items-start space-x-3">
          <svg className="w-5 h-5 text-teal-600 dark:text-teal-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
          </svg>
          <div className="flex-1">
            <h4 className="text-sm font-semibold text-teal-800 dark:text-teal-200 mb-1">SAML Attribute Mapping</h4>
            <p className="text-xs text-teal-700 dark:text-teal-300">
              Map SAML assertion attributes to user fields. Use exact attribute names from your IdP (case-sensitive).
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
            Username Attribute <span className="text-red-500">*</span>
          </label>
          <input 
            type="text"
            className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="username, uid, sAMAccountName"
            value={settings.map_name_to || ''} 
            onChange={e => setSettings(s => ({...s, map_name_to: e.target.value}))} 
          />
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">SAML attribute for username</p>
        </div>

        <div>
          <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
            Email Attribute <span className="text-red-500">*</span>
          </label>
          <input 
            type="text"
            className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="email, mail, emailAddress"
            value={settings.map_email_to || ''} 
            onChange={e => setSettings(s => ({...s, map_email_to: e.target.value}))} 
          />
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">SAML attribute for email</p>
        </div>

        <div>
          <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
            Display Name Attribute
          </label>
          <input 
            type="text"
            className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="displayName, cn, name"
            value={settings.map_display_name_to || ''} 
            onChange={e => setSettings(s => ({...s, map_display_name_to: e.target.value}))} 
          />
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">SAML attribute for display name</p>
        </div>
      </div>

      <div>
        <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
          NameID Format
        </label>
        <select 
          className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          value={settings.nameid_format || 'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress'} 
          onChange={e => setSettings(s => ({...s, nameid_format: e.target.value}))}
        >
          <option value="urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress">Email Address</option>
          <option value="urn:oasis:names:tc:SAML:1.1:nameid-format:unspecified">Unspecified</option>
          <option value="urn:oasis:names:tc:SAML:2.0:nameid-format:persistent">Persistent</option>
          <option value="urn:oasis:names:tc:SAML:2.0:nameid-format:transient">Transient</option>
        </select>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          Format for the NameID element in SAML assertions
        </p>
      </div>
    </div>
  );

  const renderTestTab = () => (
    <div className="space-y-6">
      <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
        <div className="flex items-start space-x-3">
          <svg className="w-5 h-5 text-green-600 dark:text-green-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div className="flex-1">
            <h4 className="text-sm font-semibold text-green-800 dark:text-green-200 mb-1">Test & Validation</h4>
            <p className="text-xs text-green-700 dark:text-green-300">
              Verify your SAML configuration is correct and working. Run tests before going live.
            </p>
          </div>
        </div>
      </div>

      {/* Test Status Message */}
      {testStatus.text && (
        <div className={`p-4 rounded-lg border-l-4 ${
          testStatus.type === 'success' 
            ? 'bg-green-50 dark:bg-green-900/20 border-green-500 text-green-800 dark:text-green-200'
            : testStatus.type === 'warning'
            ? 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-500 text-yellow-800 dark:text-yellow-200'
            : 'bg-red-50 dark:bg-red-900/20 border-red-500 text-red-800 dark:text-red-200'
        }`}>
          <div className="flex items-center">
            <div className="flex-shrink-0">
              {testStatus.type === 'success' ? (
                <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
              ) : (
                <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
              )}
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium">{testStatus.text}</p>
            </div>
          </div>
        </div>
      )}

      {/* Test Buttons */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <button
          onClick={runTests}
          disabled={testing}
          className="flex items-center justify-center space-x-2 px-4 py-3 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-lg hover:from-blue-700 hover:to-blue-800 disabled:opacity-50 transition-all shadow-md hover:shadow-lg"
        >
          {testing ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
              <span>Testing...</span>
            </>
          ) : (
            <>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>Run All Tests</span>
            </>
          )}
        </button>

        <button
          onClick={testMetadata}
          disabled={testing}
          className="flex items-center justify-center space-x-2 px-4 py-3 bg-gradient-to-r from-purple-600 to-purple-700 text-white rounded-lg hover:from-purple-700 hover:to-purple-800 disabled:opacity-50 transition-all shadow-md hover:shadow-lg"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <span>Test Metadata</span>
        </button>

        <button
          onClick={testIdpConnectivity}
          disabled={testing}
          className="flex items-center justify-center space-x-2 px-4 py-3 bg-gradient-to-r from-green-600 to-green-700 text-white rounded-lg hover:from-green-700 hover:to-green-800 disabled:opacity-50 transition-all shadow-md hover:shadow-lg"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
          </svg>
          <span>Test IdP Connectivity</span>
        </button>

        <a
          href={`${API_BASE}/saml?action=metadata`}
          target="_blank"
          rel="noreferrer"
          className="flex items-center justify-center space-x-2 px-4 py-3 bg-gradient-to-r from-teal-600 to-teal-700 text-white rounded-lg hover:from-teal-700 hover:to-teal-800 transition-all shadow-md hover:shadow-lg"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
          <span>View Metadata XML</span>
        </a>
      </div>

      {/* Test Results */}
      {testResults.length > 0 && (
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-4">
          <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-3">Test Results</h4>
          <div className="space-y-2">
            {testResults.map((result, index) => (
              <div 
                key={index}
                className={`flex items-center space-x-3 p-3 rounded-lg border ${
                  result.status === 'pass'
                    ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
                    : result.status === 'warning'
                    ? 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800'
                    : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
                }`}
              >
                <div className={`text-lg font-bold ${
                  result.status === 'pass' ? 'text-green-600 dark:text-green-400' :
                  result.status === 'warning' ? 'text-yellow-600 dark:text-yellow-400' :
                  'text-red-600 dark:text-red-400'
                }`}>
                  {result.icon}
                </div>
                <div className="flex-1">
                  <h5 className={`text-sm font-medium ${
                    result.status === 'pass' ? 'text-green-800 dark:text-green-200' :
                    result.status === 'warning' ? 'text-yellow-800 dark:text-yellow-200' :
                    'text-red-800 dark:text-red-200'
                  }`}>
                    {result.test}
                  </h5>
                  <p className={`text-xs ${
                    result.status === 'pass' ? 'text-green-700 dark:text-green-300' :
                    result.status === 'warning' ? 'text-yellow-700 dark:text-yellow-300' :
                    'text-red-700 dark:text-red-300'
                  }`}>
                    {result.message}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Quick Tips */}
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
        <h4 className="text-sm font-semibold text-blue-800 dark:text-blue-200 mb-2">💡 Testing Tips</h4>
        <ul className="text-xs text-blue-700 dark:text-blue-300 space-y-1">
          <li>• <strong>Run All Tests</strong>: Validates configuration, database, and library</li>
          <li>• <strong>Test Metadata</strong>: Verifies SP metadata XML generation</li>
          <li>• <strong>Test IdP Connectivity</strong>: Checks if IdP URL is reachable</li>
          <li>• <strong>View Metadata XML</strong>: Opens your metadata in new tab (give to IdP admin)</li>
          <li>• <strong>Before going live</strong>: Ensure all tests pass</li>
          <li>• <strong>Using MockSAML</strong>: IdP connectivity test will succeed</li>
        </ul>
      </div>
    </div>
  );

  const renderAdvancedTab = () => (
    <div className="space-y-6">
      <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg p-4">
        <div className="flex items-start space-x-3">
          <svg className="w-5 h-5 text-orange-600 dark:text-orange-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <div className="flex-1">
            <h4 className="text-sm font-semibold text-orange-800 dark:text-orange-200 mb-1">Advanced Settings</h4>
            <p className="text-xs text-orange-700 dark:text-orange-300">
              Security and provisioning options. Use caution when modifying these settings.
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              </div>
              <div>
                <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Strict Mode</h4>
                <p className="text-xs text-slate-500 dark:text-slate-400">Validate SAML responses strictly</p>
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input 
                type="checkbox" 
                className="sr-only peer" 
                checked={settings.strict === '1'} 
                onChange={e => setSettings(s => ({...s, strict: e.target.checked ? '1' : '0'}))} 
              />
              <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-slate-600 peer-checked:bg-blue-600"></div>
            </label>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-gradient-to-br from-yellow-500 to-yellow-600 rounded-lg flex items-center justify-center">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Debug Mode</h4>
                <p className="text-xs text-slate-500 dark:text-slate-400">Enable detailed SAML logging</p>
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input 
                type="checkbox" 
                className="sr-only peer" 
                checked={settings.debug === '1'} 
                onChange={e => setSettings(s => ({...s, debug: e.target.checked ? '1' : '0'}))} 
              />
              <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-slate-600 peer-checked:bg-blue-600"></div>
            </label>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-4 md:col-span-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-gradient-to-br from-green-500 to-green-600 rounded-lg flex items-center justify-center">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                </svg>
              </div>
              <div>
                <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Auto-Provision Users</h4>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Automatically create user accounts on first SAML login
                </p>
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input 
                type="checkbox" 
                className="sr-only peer" 
                checked={settings.auto_provision === '1'} 
                onChange={e => setSettings(s => ({...s, auto_provision: e.target.checked ? '1' : '0'}))} 
              />
              <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-slate-600 peer-checked:bg-blue-600"></div>
            </label>
          </div>
        </div>
      </div>
    </div>
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[10010]">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-gradient-to-br from-slate-900/50 to-slate-800/50"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="flex min-h-full items-center justify-center p-6">
        <div 
          ref={modalRef}
          className="relative bg-white dark:bg-slate-800 rounded-xl shadow-xl flex flex-col border border-slate-200 dark:border-slate-700 w-full max-w-4xl max-h-[90vh] overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700">
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                SAML 2.0 Configuration
              </h2>
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                Manage enterprise single sign-on settings
              </p>
            </div>
            <div className="flex items-center space-x-2">
              {/* Export Button */}
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  exportConfiguration();
                }}
                className="flex items-center space-x-1 px-3 py-1.5 text-xs bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded-lg hover:bg-green-200 dark:hover:bg-green-900/50 transition-colors"
                title="Export SAML Configuration to JSON file"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <span>Export</span>
              </button>

              {/* Import Button */}
              <label 
                className="flex items-center space-x-1 px-3 py-1.5 text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-lg hover:bg-blue-200 dark:hover:bg-blue-900/50 transition-colors cursor-pointer"
                htmlFor="saml-import-file"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                <span>Import</span>
              </label>
              <input
                id="saml-import-file"
                type="file"
                accept=".json"
                onChange={importConfiguration}
                className="hidden"
                title="Import SAML Configuration from JSON file"
              />

              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (window.confirm('Are you sure you want to reset all SAML configuration to default values? This will clear all current settings.')) {
                    setSettings({
                      saml_enabled: '0',
                      local_auth_enabled: '1',
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
                      auto_provision: '1'
                    });
                    setMessage({ type: 'info', text: 'SAML configuration reset to defaults' });
                  }
                }}
                className="px-3 py-1.5 text-xs bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 rounded-lg hover:bg-amber-200 dark:hover:bg-amber-900/50 transition-colors"
                title="Reset SAML Configuration to Defaults"
              >
                Reset Config
              </button>
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onClose();
                }}
                className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
                title="Close"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* Tabs - Matching Access Manager Style */}
          <div className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 px-6 pt-1">
            <div className="flex gap-1">
              {[
                { id: 'authentication', label: 'Authentication', icon: '🔐' },
                { id: 'service-provider', label: 'Service Provider', icon: '🏢' },
                { id: 'identity-provider', label: 'Identity Provider', icon: '🛡️' },
                { id: 'attribute-mapping', label: 'Attributes', icon: '🏷️' },
                { id: 'test', label: 'Test & Validate', icon: '🧪' },
                { id: 'advanced', label: 'Advanced', icon: '⚙️' }
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex-1 px-4 py-2 text-sm font-medium transition-colors rounded-lg ${
                    activeTab === tab.id
                      ? 'bg-brand-600 text-white'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-center space-x-2">
                    <span>{tab.icon}</span>
                    <span>{tab.label}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
          
          {/* Content */}
          <div className="flex-1 p-6 bg-white dark:bg-slate-800 overflow-y-auto min-h-0">
            {loading ? (
              <div className="flex items-center justify-center py-16">
                <div className="flex flex-col items-center space-y-4">
                  <div className="animate-spin rounded-full h-12 w-12 border-4 border-indigo-200 border-t-indigo-600"></div>
                  <span className="text-slate-600 dark:text-slate-400 font-medium">Loading configuration...</span>
                </div>
              </div>
            ) : (
              <>
                {message.text && (
                  <div className={`mb-4 p-3 rounded-lg border-l-4 shadow-sm ${
                    message.type === 'success' 
                      ? 'bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-200 border-green-400 border-l-green-500'
                      : message.type === 'info'
                      ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-800 dark:text-blue-200 border-blue-400 border-l-blue-500'
                      : 'bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-200 border-red-400 border-l-red-500'
                  }`}>
                    <div className="flex items-center">
                      <div className="flex-shrink-0">
                        {message.type === 'success' ? (
                          <svg className="h-5 w-5 text-green-400" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                          </svg>
                        ) : message.type === 'info' ? (
                          <svg className="h-5 w-5 text-blue-400" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                          </svg>
                        ) : (
                          <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                          </svg>
                        )}
                      </div>
                      <div className="ml-3">
                        <p className="text-sm font-medium">{message.text}</p>
                      </div>
                    </div>
                  </div>
                )}

                <div className="space-y-6">
                  {activeTab === 'authentication' && renderAuthenticationTab()}
                  {activeTab === 'service-provider' && renderServiceProviderTab()}
                  {activeTab === 'identity-provider' && renderIdentityProviderTab()}
                  {activeTab === 'attribute-mapping' && renderAttributeMappingTab()}
                  {activeTab === 'test' && renderTestTab()}
                  {activeTab === 'advanced' && renderAdvancedTab()}
                </div>
              </>
            )}
          </div>
          
          {/* Footer */}
          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
            >
              Cancel
            </button>
            
            <button
              onClick={save}
              disabled={saving}
              className="px-4 py-2 text-sm font-medium bg-brand-600 hover:bg-brand-500 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {saving ? (
                <>
                  <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white"></div>
                  <span>Saving...</span>
                </>
              ) : 'Save Configuration'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SamlConfigModal;
