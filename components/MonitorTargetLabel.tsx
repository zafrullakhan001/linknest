import React from 'react';
import { formatMonitorTargetFull } from '../utils/monitorDisplay';

type MonitorTargetLabelProps = {
    target: string;
    port?: number | null;
    /** tile = card body; inline = status bar; table = grid row; compact = narrow capsule row */
    variant?: 'tile' | 'inline' | 'table' | 'compact';
    className?: string;
    style?: React.CSSProperties;
    as?: 'span' | 'code' | 'div';
};

const VARIANT_CLASS: Record<NonNullable<MonitorTargetLabelProps['variant']>, string> = {
    tile: 'block w-full min-w-0 truncate whitespace-nowrap overflow-hidden',
    inline: 'block max-w-[200px] sm:max-w-[320px] min-w-0 truncate whitespace-nowrap overflow-hidden',
    table: 'block max-w-[280px] min-w-0 truncate whitespace-nowrap overflow-hidden',
    compact: 'block max-w-[120px] min-w-0 truncate whitespace-nowrap overflow-hidden',
};

export const MonitorTargetLabel: React.FC<MonitorTargetLabelProps> = ({
    target,
    port,
    variant = 'tile',
    className = '',
    style,
    as: Tag = 'span',
}) => {
    const full = formatMonitorTargetFull(target, port);
    return (
        <Tag
            className={`font-mono ${VARIANT_CLASS[variant]} ${className}`}
            title={full}
            style={style}
        >
            {full}
        </Tag>
    );
};
