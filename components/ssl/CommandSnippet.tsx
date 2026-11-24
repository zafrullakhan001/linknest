import React, { useState } from 'react';
import { Copy, Check } from 'lucide-react';

type CommandSnippetProps = {
  title: string;
  description?: string;
  linuxCommand: string;
  windowsCommand: string;
};

const CommandSnippet: React.FC<CommandSnippetProps> = ({ title, description, linuxCommand, windowsCommand }) => {
  const [copied, setCopied] = useState<'linux' | 'windows' | null>(null);

  const copy = (text: string, target: 'linux' | 'windows') => {
    navigator.clipboard.writeText(text);
    setCopied(target);
    setTimeout(() => setCopied(null), 1800);
  };

  const renderBlock = (label: string, command: string, target: 'linux' | 'windows') => (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-3 bg-gray-50 dark:bg-gray-900/45">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-gray-600 dark:text-gray-300">{label}</span>
        <button
          onClick={() => copy(command, target)}
          className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 transition-colors"
        >
          {copied === target ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
          {copied === target ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="text-[11px] font-mono text-gray-800 dark:text-gray-200 whitespace-pre-wrap leading-5">{command}</pre>
    </div>
  );

  return (
    <div className="bg-white dark:bg-gray-800/95 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4 space-y-3">
      <div>
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{title}</h3>
        {description && <p className="text-xs text-gray-600 dark:text-gray-300 mt-1">{description}</p>}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {renderBlock('Linux / macOS', linuxCommand, 'linux')}
        {renderBlock('Windows (PowerShell / cmd)', windowsCommand, 'windows')}
      </div>
    </div>
  );
};

export default CommandSnippet;






