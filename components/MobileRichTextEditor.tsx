import React from 'react';
import { RichTextEditor } from './RichTextEditor';

interface MobileRichTextEditorProps {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    className?: string;
}

/**
 * Mobile wrapper around the TinyMCE-based RichTextEditor.
 * TinyMCE already provides a mobile-friendly sliding toolbar.
 */
export const MobileRichTextEditor: React.FC<MobileRichTextEditorProps> = ({
    value,
    onChange,
    placeholder = 'Enter text...',
    className = ''
}) => {
    return (
        <div className={`mobile-rich-text-editor ${className}`}>
            <RichTextEditor
                value={value}
                onChange={onChange}
                placeholder={placeholder}
            />
        </div>
    );
};
