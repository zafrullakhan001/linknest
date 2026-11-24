import React from 'react';
import { HelpMermaidDiagram } from './HelpMermaidDiagram';
import {
  EMAIL_SENDER_SEQ,
  MONITOR_ARCH_FLOW,
  MONITOR_RUNNER_SEQ,
} from '../utils/monitorArchitectureMermaid';

interface HelpMonitorArchitectureProps {
  /** About tab shows the overview only. */
  compact?: boolean;
}

export const HelpMonitorArchitecture: React.FC<HelpMonitorArchitectureProps> = ({
  compact = false,
}) => {
  return (
    <div className="space-y-3">
      <HelpMermaidDiagram
        title="Overview"
        source={MONITOR_ARCH_FLOW}
        caption="Apache/PHP serves the dashboard. Python workers run on the OS scheduler and share SQLite only."
      />
      {compact ? null : (
        <>
          <HelpMermaidDiagram
            title="monitor_runner.py"
            source={MONITOR_RUNNER_SEQ}
            caption="Network probes run outside Apache. Mail is queued, not sent, in this process."
          />
          <HelpMermaidDiagram
            title="email_sender.py"
            source={EMAIL_SENDER_SEQ}
            caption="A second process sends SMTP so slow mail cannot freeze checks or PHP."
          />
        </>
      )}
    </div>
  );
};
