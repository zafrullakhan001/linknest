import React from 'react';
import {
    AreaChart,
    Area,
    BarChart,
    Bar,
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Legend
} from 'recharts';

interface AreaChartProps {
    data: any[];
    dataKey: string;
    seriesKey: string;
    seriesName?: string;
    color?: string;
    height?: number;
}

export const RechartsAreaChart: React.FC<AreaChartProps> = ({
    data,
    dataKey,
    seriesKey,
    seriesName = 'Value',
    color = '#8b5cf6',
    height = 200
}) => {
    return (
        <ResponsiveContainer width="100%" height={height}>
            <AreaChart data={data} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
                <defs>
                    <linearGradient id={`gradient-${seriesKey}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={color} stopOpacity={0.3} />
                        <stop offset="95%" stopColor={color} stopOpacity={0} />
                    </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis 
                    dataKey={dataKey} 
                    tick={{ fontSize: 10 }}
                    tickMargin={5}
                    stroke="#94a3b8"
                />
                <YAxis 
                    tick={{ fontSize: 10 }}
                    stroke="#94a3b8"
                />
                <Tooltip 
                    contentStyle={{ 
                        backgroundColor: '#1e1e1e', 
                        border: '1px solid #333',
                        borderRadius: '8px',
                        fontSize: '12px'
                    }}
                />
                <Area
                    type="monotone"
                    dataKey={seriesKey}
                    name={seriesName}
                    stroke={color}
                    fillOpacity={1}
                    fill={`url(#gradient-${seriesKey})`}
                    strokeWidth={2}
                />
            </AreaChart>
        </ResponsiveContainer>
    );
};

interface BarChartProps {
    data: any[];
    dataKey: string;
    seriesKey: string;
    seriesName?: string;
    color?: string;
    height?: number;
    colors?: string[];
}

export const RechartsBarChart: React.FC<BarChartProps> = ({
    data,
    dataKey,
    seriesKey,
    seriesName = 'Value',
    color = '#8b5cf6',
    height = 200,
    colors
}) => {
    return (
        <ResponsiveContainer width="100%" height={height}>
            <BarChart data={data} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis 
                    dataKey={dataKey} 
                    tick={{ fontSize: 10 }}
                    tickMargin={5}
                    stroke="#94a3b8"
                />
                <YAxis 
                    tick={{ fontSize: 10 }}
                    stroke="#94a3b8"
                />
                <Tooltip 
                    contentStyle={{ 
                        backgroundColor: '#1e1e1e', 
                        border: '1px solid #333',
                        borderRadius: '8px',
                        fontSize: '12px'
                    }}
                />
                <Bar
                    dataKey={seriesKey}
                    name={seriesName}
                    fill={color}
                    radius={[4, 4, 0, 0]}
                />
            </BarChart>
        </ResponsiveContainer>
    );
};

interface LineChartProps {
    data: any[];
    dataKey: string;
    series: { key: string; name: string; color: string }[];
    height?: number;
    showLegend?: boolean;
}

export const RechartsLineChart: React.FC<LineChartProps> = ({
    data,
    dataKey,
    series,
    height = 200,
    showLegend = true
}) => {
    return (
        <ResponsiveContainer width="100%" height={height}>
            <LineChart data={data} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis 
                    dataKey={dataKey} 
                    tick={{ fontSize: 10 }}
                    tickMargin={5}
                    stroke="#94a3b8"
                />
                <YAxis 
                    tick={{ fontSize: 10 }}
                    stroke="#94a3b8"
                />
                <Tooltip 
                    contentStyle={{ 
                        backgroundColor: '#1e1e1e', 
                        border: '1px solid #333',
                        borderRadius: '8px',
                        fontSize: '12px'
                    }}
                />
                {showLegend && <Legend wrapperStyle={{ fontSize: '12px' }} />}
                {series.map((s) => (
                    <Line
                        key={s.key}
                        type="monotone"
                        dataKey={s.key}
                        name={s.name}
                        stroke={s.color}
                        strokeWidth={2}
                        dot={false}
                        activeDot={{ r: 4 }}
                    />
                ))}
            </LineChart>
        </ResponsiveContainer>
    );
};

// Uptime chart with multiple series
interface UptimeChartProps {
    data: {
        time: string;
        up: number;
        down: number;
        warning: number;
    }[];
    height?: number;
}

export const UptimeChart: React.FC<UptimeChartProps> = ({ data, height = 200 }) => {
    return (
        <ResponsiveContainer width="100%" height={height}>
            <AreaChart data={data} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
                <defs>
                    <linearGradient id="gradientUp" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gradientDown" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gradientWarning" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                    </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis 
                    dataKey="time" 
                    tick={{ fontSize: 10 }}
                    tickMargin={5}
                    stroke="#94a3b8"
                />
                <YAxis 
                    tick={{ fontSize: 10 }}
                    stroke="#94a3b8"
                />
                <Tooltip 
                    contentStyle={{ 
                        backgroundColor: '#1e1e1e', 
                        border: '1px solid #333',
                        borderRadius: '8px',
                        fontSize: '12px'
                    }}
                />
                <Legend wrapperStyle={{ fontSize: '12px' }} />
                <Area
                    type="monotone"
                    dataKey="up"
                    name="Up"
                    stackId="1"
                    stroke="#10b981"
                    fill="url(#gradientUp)"
                />
                <Area
                    type="monotone"
                    dataKey="down"
                    name="Down"
                    stackId="1"
                    stroke="#ef4444"
                    fill="url(#gradientDown)"
                />
                <Area
                    type="monotone"
                    dataKey="warning"
                    name="Warning"
                    stackId="1"
                    stroke="#f59e0b"
                    fill="url(#gradientWarning)"
                />
            </AreaChart>
        </ResponsiveContainer>
    );
};
