import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useEscapeToClose } from '../hooks/useEscapeToClose';
import { hasVisibleRichText, looksLikeHtml, plainNotesToHtml } from '../utils/richTextDisplay';

export type NotesPresetFormValues = {
  ownerInfo: string;
  supportTeamInfo: string;
  serviceNowGroupInfo: string;
  businessOwner: string;
  productOwner: string;
  architect: string;
  vendorDetails: string;
  serviceNowDemand: string;
  serviceNowProject: string;
  serviceNowTask: string;
  goLiveInfo: string;
  majorUpgradeInfo: string;
  serviceDeliveryManager: string;
  businessRelationshipManager: string;
  technologyRelationshipManager: string;
};

export const EMPTY_NOTES_PRESET_FORM: NotesPresetFormValues = {
  ownerInfo: '',
  supportTeamInfo: '',
  serviceNowGroupInfo: '',
  businessOwner: '',
  productOwner: '',
  architect: '',
  vendorDetails: '',
  serviceNowDemand: '',
  serviceNowProject: '',
  serviceNowTask: '',
  goLiveInfo: '',
  majorUpgradeInfo: '',
  serviceDeliveryManager: '',
  businessRelationshipManager: '',
  technologyRelationshipManager: '',
};

const DEMO_NOTES_PRESET_FORM: NotesPresetFormValues = {
  ownerInfo: 'IT Operations Team - John Smith (john.smith@company.com)',
  supportTeamInfo: 'Level 1 Support - support@company.com | Level 2 Support - l2support@company.com',
  serviceNowGroupInfo: 'IT Operations Group (it-ops-group@company.com)',
  businessOwner: 'Sarah Johnson - Director of IT Operations (sarah.johnson@company.com, ext. 1234)',
  productOwner: 'Michael Chen - Senior Product Manager (michael.chen@company.com, ext. 5678)',
  architect: 'David Williams - Solutions Architect (david.williams@company.com, ext. 9012)',
  vendorDetails: 'TechCorp Solutions - Vendor Contact: vendor@techcorp.com | Support: support@techcorp.com | Phone: +1-555-0100',
  serviceNowDemand: 'DEM-2024-001234',
  serviceNowProject: 'PROJ-2024-005678',
  serviceNowTask: 'TASK-2024-009012',
  goLiveInfo: 'Planned Go-Live: Q2 2024 | Target Date: June 15, 2024 | Status: On Track',
  majorUpgradeInfo: 'Next Major Upgrade: Version 3.0 | Scheduled: Q3 2024 | Upgrade Window: September 2024',
  serviceDeliveryManager: 'Emily Davis - SDM (emily.davis@company.com, ext. 3456)',
  businessRelationshipManager: 'Robert Martinez - BRM (robert.martinez@company.com, ext. 7890)',
  technologyRelationshipManager: 'Jennifer Lee - TRM (jennifer.lee@company.com, ext. 2468)',
};

const inputClass =
  'w-full bg-slate-50 dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/50 transition-all';

function formatPresetNotes(form: NotesPresetFormValues): string {
  const sections: string[] = [];

  if (form.ownerInfo) sections.push(`Owner Information:\n${form.ownerInfo}`);
  if (form.supportTeamInfo) sections.push(`Support Team Information:\n${form.supportTeamInfo}`);
  if (form.serviceNowGroupInfo) sections.push(`Service Now Group Information:\n${form.serviceNowGroupInfo}`);

  const contacts: string[] = [];
  if (form.businessOwner) contacts.push(`Business Owner: ${form.businessOwner}`);
  if (form.productOwner) contacts.push(`Product Owner: ${form.productOwner}`);
  if (form.architect) contacts.push(`Architect: ${form.architect}`);
  if (form.vendorDetails) contacts.push(`Vendor Details: ${form.vendorDetails}`);
  if (contacts.length > 0) sections.push(`Contact Information:\n${contacts.join('\n')}`);

  const tickets: string[] = [];
  if (form.serviceNowDemand) tickets.push(`Demand: ${form.serviceNowDemand}`);
  if (form.serviceNowProject) tickets.push(`Project: ${form.serviceNowProject}`);
  if (form.serviceNowTask) tickets.push(`Task: ${form.serviceNowTask}`);
  if (tickets.length > 0) sections.push(`Service Now Ticket Information:\n${tickets.join('\n')}`);

  if (form.goLiveInfo) sections.push(`Go-Live Information:\n${form.goLiveInfo}`);
  if (form.majorUpgradeInfo) sections.push(`Major Upgrade Information:\n${form.majorUpgradeInfo}`);

  const managers: string[] = [];
  if (form.serviceDeliveryManager) managers.push(`Service Delivery Manager: ${form.serviceDeliveryManager}`);
  if (form.businessRelationshipManager) managers.push(`Business Relationship Manager: ${form.businessRelationshipManager}`);
  if (form.technologyRelationshipManager) managers.push(`Technology Relationship Manager: ${form.technologyRelationshipManager}`);
  if (managers.length > 0) sections.push(`Manager Information:\n${managers.join('\n')}`);

  return sections.join('\n\n');
}

export function mergePresetNotesIntoHtml(currentNotes: string, formattedNotes: string): string {
  const additionHtml = plainNotesToHtml(formattedNotes);
  if (!formattedNotes.trim()) return currentNotes;
  const currentHtml = looksLikeHtml(currentNotes) ? currentNotes : plainNotesToHtml(currentNotes);
  return hasVisibleRichText(currentNotes) ? `${currentHtml}${additionHtml}` : additionHtml;
}

export type NotesPresetFormDialogProps = {
  open: boolean;
  onClose: () => void;
  onAddToNotes: (formattedNotes: string) => void;
};

export const NotesPresetFormDialog: React.FC<NotesPresetFormDialogProps> = ({
  open,
  onClose,
  onAddToNotes,
}) => {
  const [form, setForm] = useState<NotesPresetFormValues>(EMPTY_NOTES_PRESET_FORM);

  useEffect(() => {
    if (open) setForm(EMPTY_NOTES_PRESET_FORM);
  }, [open]);

  useEscapeToClose(open, () => {
    setForm(EMPTY_NOTES_PRESET_FORM);
    onClose();
  });

  if (!open || typeof document === 'undefined') return null;

  const closeAndReset = () => {
    setForm(EMPTY_NOTES_PRESET_FORM);
    onClose();
  };

  const update = <K extends keyof NotesPresetFormValues>(key: K, value: NotesPresetFormValues[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  return createPortal(
    // Above EditLinkForm dialog-tabs (zIndex 100060)
    <div className="fixed inset-0 z-[100080] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm overflow-y-auto">
      <div
        className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 max-w-3xl w-full max-h-[90vh] flex flex-col my-8"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between sticky top-0 bg-white dark:bg-slate-800 z-10">
          <div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">Notes Preset Form</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">Fill in the fields below (all optional)</p>
          </div>
          <button
            type="button"
            onClick={closeAndReset}
            className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-6 py-4 flex-1 overflow-y-auto">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Owner Information</label>
              <input type="text" value={form.ownerInfo} onChange={(e) => update('ownerInfo', e.target.value)} placeholder="Enter owner information..." className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Support Team Information</label>
              <input type="text" value={form.supportTeamInfo} onChange={(e) => update('supportTeamInfo', e.target.value)} placeholder="Enter support team information..." className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Service Now Group Information</label>
              <input type="text" value={form.serviceNowGroupInfo} onChange={(e) => update('serviceNowGroupInfo', e.target.value)} placeholder="Enter Service Now group information..." className={inputClass} />
            </div>

            <div className="border-t border-slate-200 dark:border-slate-700 pt-4">
              <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-3">Contact Information</h4>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">Business Owner</label>
                  <input type="text" value={form.businessOwner} onChange={(e) => update('businessOwner', e.target.value)} placeholder="Business owner details..." className={inputClass} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">Product Owner</label>
                  <input type="text" value={form.productOwner} onChange={(e) => update('productOwner', e.target.value)} placeholder="Product owner details..." className={inputClass} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">Architect</label>
                  <input type="text" value={form.architect} onChange={(e) => update('architect', e.target.value)} placeholder="Architect details..." className={inputClass} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">Vendor Details</label>
                  <input type="text" value={form.vendorDetails} onChange={(e) => update('vendorDetails', e.target.value)} placeholder="Vendor details..." className={inputClass} />
                </div>
              </div>
            </div>

            <div className="border-t border-slate-200 dark:border-slate-700 pt-4">
              <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-3">Service Now Ticket Information</h4>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">Demand Ticket</label>
                  <input type="text" value={form.serviceNowDemand} onChange={(e) => update('serviceNowDemand', e.target.value)} placeholder="Service Now demand ticket..." className={inputClass} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">Project Ticket</label>
                  <input type="text" value={form.serviceNowProject} onChange={(e) => update('serviceNowProject', e.target.value)} placeholder="Service Now project ticket..." className={inputClass} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">Task Ticket</label>
                  <input type="text" value={form.serviceNowTask} onChange={(e) => update('serviceNowTask', e.target.value)} placeholder="Service Now task ticket..." className={inputClass} />
                </div>
              </div>
            </div>

            <div className="border-t border-slate-200 dark:border-slate-700 pt-4">
              <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-3">Project Information</h4>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">Go-Live Information</label>
                  <input type="text" value={form.goLiveInfo} onChange={(e) => update('goLiveInfo', e.target.value)} placeholder="Go-live date and details..." className={inputClass} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">Major Upgrade Information</label>
                  <input type="text" value={form.majorUpgradeInfo} onChange={(e) => update('majorUpgradeInfo', e.target.value)} placeholder="Major upgrade information..." className={inputClass} />
                </div>
              </div>
            </div>

            <div className="border-t border-slate-200 dark:border-slate-700 pt-4">
              <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-3">Manager Information</h4>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">Service Delivery Manager</label>
                  <input type="text" value={form.serviceDeliveryManager} onChange={(e) => update('serviceDeliveryManager', e.target.value)} placeholder="Service Delivery Manager details..." className={inputClass} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">Business Relationship Manager</label>
                  <input type="text" value={form.businessRelationshipManager} onChange={(e) => update('businessRelationshipManager', e.target.value)} placeholder="Business Relationship Manager details..." className={inputClass} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">Technology Relationship Manager</label>
                  <input type="text" value={form.technologyRelationshipManager} onChange={(e) => update('technologyRelationshipManager', e.target.value)} placeholder="Technology Relationship Manager details..." className={inputClass} />
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-700 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={closeAndReset}
            className="px-4 py-2 bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-lg font-medium transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => setForm(DEMO_NOTES_PRESET_FORM)}
            className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg font-medium transition-colors"
          >
            Demo Fill
          </button>
          <button
            type="button"
            onClick={() => {
              onAddToNotes(formatPresetNotes(form));
              closeAndReset();
            }}
            className="px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white rounded-lg font-medium transition-colors"
          >
            Add to Notes
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default NotesPresetFormDialog;
