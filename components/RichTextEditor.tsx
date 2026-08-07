import React, { useMemo, useRef, useEffect, useLayoutEffect, useState, useCallback } from 'react';
import { Editor } from '@tinymce/tinymce-react';
import type { Editor as TinyMCEEditor } from 'tinymce';

interface RichTextEditorProps {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    className?: string;
    /** When true, editor fills parent flex height (full-viewport shell). */
    fillHeight?: boolean;
    /** Hide TinyMCE fullscreen control (shell already fills the viewport). */
    hideFullscreen?: boolean;
}

function resolveApiBase(): string {
    let apiBase = '/api';
    if (typeof window !== 'undefined') {
        const path = window.location.pathname || '';
        if (path !== '/' && path.length > 1) {
            const cleanPath = path.replace(/\/[^/]*$/, '').replace(/\/$/, '');
            if (cleanPath && cleanPath !== '/') {
                apiBase = `${cleanPath}/api`;
            }
        }
    }
    return apiBase;
}

/**
 * App may be at / or /linknest/ (XAMPP). Prefer Vite BASE_URL when set,
 * otherwise infer from the current pathname so /tinymce resolves under the app.
 */
function getAppBasePath(): string {
    const envBase = (import.meta as any)?.env?.BASE_URL || '/';
    if (envBase && envBase !== '/') {
        return envBase.endsWith('/') ? envBase.slice(0, -1) : envBase;
    }
    if (typeof window === 'undefined') return '';

    let path = window.location.pathname || '';
    path = path.replace(/\/index\.html$/i, '').replace(/\/$/, '');
    path = path.replace(/\/dist$/i, '');
    if (!path || path === '/') return '';

    const parts = path.split('/').filter(Boolean);
    if (parts.length && /\.[a-z0-9]+$/i.test(parts[parts.length - 1])) {
        parts.pop();
    }
    return parts.length ? `/${parts.join('/')}` : '';
}

function getTinyMceBaseUrl(): string {
    return `${getAppBasePath()}/tinymce`;
}

function isDarkMode(): boolean {
    if (typeof document === 'undefined') return false;
    return document.documentElement.classList.contains('dark');
}

/**
 * Nested editors share one zoom/scroll lock. LinkNest applies html{zoom} and
 * body{position:relative}. TinyMCE menus use absolute coords vs scrollY; opening
 * a fixed shell while the page is scrolled displaces menus. Reset scroll to 0
 * while any editor is mounted, and force zoom to 1 for measurement consistency.
 */
let tinymceZoomLockCount = 0;
let tinymceSavedInlineZoom: string | null = null;
let tinymceSavedScrollX = 0;
let tinymceSavedScrollY = 0;

function acquireTinyMceZoomLock() {
    if (typeof document === 'undefined') return;
    tinymceZoomLockCount += 1;
    if (tinymceZoomLockCount === 1) {
        const html = document.documentElement;
        const body = document.body;
        tinymceSavedInlineZoom = html.style.getPropertyValue('zoom') || html.style.zoom || null;
        tinymceSavedScrollX = window.scrollX || window.pageXOffset || 0;
        tinymceSavedScrollY = window.scrollY || window.pageYOffset || 0;
        html.style.setProperty('zoom', '1', 'important');
        // Absolute menu math requires document scroll at origin while the shell is fixed.
        window.scrollTo(0, 0);
        html.scrollTop = 0;
        html.scrollLeft = 0;
        body.scrollTop = 0;
        body.scrollLeft = 0;
        body.dataset.linknestPrevOverflow = body.style.overflow || '';
        html.dataset.linknestPrevOverflow = html.style.overflow || '';
        body.style.setProperty('overflow', 'hidden', 'important');
        html.style.setProperty('overflow', 'hidden', 'important');
        document.body.classList.add('linknest-tinymce-editing');
    }
}

function releaseTinyMceZoomLock() {
    if (typeof document === 'undefined') return;
    tinymceZoomLockCount = Math.max(0, tinymceZoomLockCount - 1);
    if (tinymceZoomLockCount === 0) {
        const html = document.documentElement;
        const body = document.body;
        html.style.removeProperty('zoom');
        if (tinymceSavedInlineZoom) {
            html.style.setProperty('zoom', tinymceSavedInlineZoom);
        }
        tinymceSavedInlineZoom = null;
        body.style.overflow = body.dataset.linknestPrevOverflow || '';
        html.style.overflow = html.dataset.linknestPrevOverflow || '';
        delete body.dataset.linknestPrevOverflow;
        delete html.dataset.linknestPrevOverflow;
        document.body.classList.remove('linknest-tinymce-editing');
        window.scrollTo(tinymceSavedScrollX, tinymceSavedScrollY);
        tinymceSavedScrollX = 0;
        tinymceSavedScrollY = 0;
    }
}

function ensureTinyMceAuxStyles() {
    // Remove older workaround stylesheets that forced sink position:fixed
    [
        'linknest-tinymce-aux-styles',
        'linknest-tinymce-aux-styles-v2',
        'linknest-tinymce-aux-styles-v4',
        'linknest-tinymce-aux-styles-v5',
        'linknest-tinymce-aux-styles-v6'
    ].forEach((id) => document.getElementById(id)?.remove());

    const styleId = 'linknest-tinymce-aux-styles-v7';
    let style = document.getElementById(styleId) as HTMLStyleElement | null;
    if (!style) {
        style = document.createElement('style');
        style.id = styleId;
        document.head.appendChild(style);
    }
    // Zoom/scroll lock + keep popup sinks above shell. Do not force position:fixed
    // on .tox-tinymce-aux (that fights TinyMCE's own coord modes).
    style.textContent = `
        html:has(body.linknest-tinymce-editing) {
            zoom: 1 !important;
            overflow: hidden !important;
        }
        body.linknest-tinymce-editing {
            overflow: hidden !important;
        }
        body.linknest-tinymce-editing .linknest-app-container {
            overflow: hidden !important;
        }
        .tox.tox-tinymce-aux {
            z-index: 16000 !important;
        }
        .linknest-tinymce-editor .tox-tinymce {
            border: none !important;
        }
        .linknest-tinymce-host.fill-height {
            position: relative;
        }
        .linknest-tinymce-host.fill-height,
        .linknest-tinymce-host.fill-height .tox-tinymce {
            height: 100% !important;
        }
        .linknest-tinymce-shell {
            overflow: hidden !important;
        }
    `;
}

/**
 * Joomla-style TinyMCE rich text editor for LinkNest.
 * Loads TinyMCE from /public/tinymce so skins/menus load correctly.
 */
export const RichTextEditor: React.FC<RichTextEditorProps> = ({
    value,
    onChange,
    placeholder = 'Enter text...',
    className = '',
    fillHeight = false,
    hideFullscreen = false
}) => {
    const editorRef = useRef<TinyMCEEditor | null>(null);
    const hostRef = useRef<HTMLDivElement | null>(null);
    const initHeightRef = useRef(420);
    const [dark, setDark] = useState(isDarkMode);
    const [scriptBase, setScriptBase] = useState(() => getTinyMceBaseUrl());
    const [editorReady, setEditorReady] = useState(false);

    useLayoutEffect(() => {
        ensureTinyMceAuxStyles();
        acquireTinyMceZoomLock();
        setScriptBase(getTinyMceBaseUrl());

        let cancelled = false;
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                if (cancelled) return;
                if (fillHeight && hostRef.current) {
                    initHeightRef.current = Math.max(280, Math.floor(hostRef.current.clientHeight));
                } else {
                    initHeightRef.current = 420;
                }
                setEditorReady(true);
            });
        });
        return () => {
            cancelled = true;
            setEditorReady(false);
            releaseTinyMceZoomLock();
        };
    }, [fillHeight]);

    useEffect(() => {
        if (!fillHeight || !hostRef.current || !editorReady) return;
        const el = hostRef.current;
        const update = () => {
            const next = Math.max(280, Math.floor(el.clientHeight));
            const ed = editorRef.current;
            if (ed && !ed.removed) {
                try {
                    // Prefer public API when available
                    (ed as any).theme?.resizeTo?.(undefined, next);
                } catch {
                    /* ignore */
                }
            }
        };
        update();
        const ro = new ResizeObserver(update);
        ro.observe(el);
        return () => ro.disconnect();
    }, [fillHeight, editorReady]);

    useEffect(() => {
        const root = document.documentElement;
        const updateTheme = () => setDark(root.classList.contains('dark'));
        updateTheme();
        const observer = new MutationObserver(updateTheme);
        observer.observe(root, { attributes: true, attributeFilter: ['class'] });
        return () => observer.disconnect();
    }, []);

    const uploadImage = useCallback(async (blobInfo: { blob: () => Blob; filename: () => string }) => {
        const formData = new FormData();
        formData.append('image', blobInfo.blob(), blobInfo.filename());

        const response = await fetch(`${resolveApiBase()}/uploads.php/rich-text-image`, {
            method: 'POST',
            body: formData,
            credentials: 'include'
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({ error: 'Upload failed' }));
            throw new Error(error.error || 'Upload failed');
        }

        const data = await response.json();
        if (!data.success || !data.url) {
            throw new Error(data.error || 'Upload failed');
        }
        return data.url as string;
    }, []);

    const toolbar = hideFullscreen
        ? 'undo redo | blocks fontfamily fontsize | bold italic underline strikethrough | ' +
          'forecolor backcolor | alignleft aligncenter alignright alignjustify | ' +
          'bullist numlist outdent indent | link image media table emoticons | ' +
          'removeformat code'
        : 'undo redo | blocks fontfamily fontsize | bold italic underline strikethrough | ' +
          'forecolor backcolor | alignleft aligncenter alignright alignjustify | ' +
          'bullist numlist outdent indent | link image media table emoticons | ' +
          'removeformat code fullscreen';

    const plugins = hideFullscreen
        ? [
            'advlist', 'autolink', 'lists', 'link', 'image', 'charmap', 'preview',
            'anchor', 'searchreplace', 'visualblocks', 'code',
            'insertdatetime', 'media', 'table', 'help', 'wordcount', 'emoticons',
            'quickbars', 'directionality', 'pagebreak', 'nonbreaking', 'codesample',
            'accordion'
          ]
        : [
            'advlist', 'autolink', 'lists', 'link', 'image', 'charmap', 'preview',
            'anchor', 'searchreplace', 'visualblocks', 'code', 'fullscreen',
            'insertdatetime', 'media', 'table', 'help', 'wordcount', 'emoticons',
            'quickbars', 'directionality', 'pagebreak', 'nonbreaking', 'codesample',
            'accordion'
          ];

    const init = useMemo(() => ({
        license_key: 'gpl',
        base_url: scriptBase,
        suffix: '.min',
        promotion: false,
        branding: false,
        // Keep popup sinks adjacent to the editor so menus share its fixed-shell
        // geometry instead of document-body absolute+scrollY coords.
        ui_mode: 'split' as const,
        menubar: 'file edit view insert format tools table help',
        plugins,
        toolbar,
        toolbar_mode: 'wrap' as const,
        font_family_formats:
            'Andale Mono=andale mono,monospace; Arial=arial,helvetica,sans-serif; ' +
            'Arial Black=arial black,sans-serif; Book Antiqua=book antiqua,palatino,serif; ' +
            'Comic Sans MS=comic sans ms,sans-serif; Courier New=courier new,courier,monospace; ' +
            'Georgia=georgia,palatino,serif; Helvetica=helvetica,arial,sans-serif; ' +
            'Impact=impact,sans-serif; Symbol=symbol; Tahoma=tahoma,arial,helvetica,sans-serif; ' +
            'Terminal=terminal,monaco,monospace; Times New Roman=times new roman,times,serif; ' +
            'Trebuchet MS=trebuchet ms,geneva,sans-serif; Verdana=verdana,geneva,sans-serif',
        font_size_formats: '8pt 10pt 12pt 14pt 16pt 18pt 24pt 36pt 48pt',
        block_formats: 'Paragraph=p; Heading 1=h1; Heading 2=h2; Heading 3=h3; Heading 4=h4; Heading 5=h5; Heading 6=h6; Preformatted=pre',
        quickbars_selection_toolbar: 'bold italic | quicklink h2 h3 blockquote',
        quickbars_insert_toolbar: 'quickimage quicktable',
        contextmenu: 'link image table',
        skin: dark ? 'oxide-dark' : 'oxide',
        content_css: dark ? 'dark' : 'default',
        content_style: `
            body {
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
                font-size: 14px;
                line-height: 1.6;
                padding: 12px;
            }
            img { max-width: 100%; height: auto; }
            table { border-collapse: collapse; width: 100%; }
            table td, table th { border: 1px solid #cbd5e1; padding: 6px 8px; }
            h1,h2,h3,h4,h5,h6 { line-height: 1.25; margin: 0.75em 0 0.4em; }
            p { margin: 0 0 0.75em; }
        `,
        placeholder,
        height: fillHeight ? initHeightRef.current : 420,
        min_height: 280,
        resize: !fillHeight,
        browser_spellcheck: true,
        convert_urls: false,
        relative_urls: false,
        remove_script_host: false,
        entity_encoding: 'raw' as const,
        images_upload_handler: uploadImage,
        file_picker_types: 'image',
        automatic_uploads: true,
        paste_data_images: true,
        image_caption: true,
        image_advtab: true,
        link_default_target: '_blank',
        link_assume_external_targets: true,
        table_toolbar: 'tableprops tabledelete | tableinsertrowbefore tableinsertrowafter tabledeleterow | tableinsertcolbefore tableinsertcolafter tabledeletecol',
        setup: (editor: TinyMCEEditor) => {
            editorRef.current = editor;
            editor.on('remove', () => {
                if (editorRef.current === editor) editorRef.current = null;
            });
        }
    }), [dark, placeholder, uploadImage, scriptBase, fillHeight, toolbar, plugins, editorReady]);

    return (
        <div
            ref={hostRef}
            className={`linknest-tinymce-editor linknest-tinymce-host rounded-lg border border-slate-300 dark:border-slate-600 overflow-hidden bg-white dark:bg-slate-900 ${fillHeight ? 'fill-height h-full min-h-0' : ''} ${className}`}
        >
            {!editorReady ? (
                <div
                    className="flex items-center justify-center text-sm text-slate-500 dark:text-slate-400"
                    style={{ height: fillHeight ? '100%' : 420 }}
                >
                    Loading editor…
                </div>
            ) : (
                <Editor
                    key={`${dark ? 'dark' : 'light'}-${scriptBase}-${fillHeight ? 'shell' : 'compact'}`}
                    licenseKey="gpl"
                    tinymceScriptSrc={`${scriptBase}/tinymce.min.js`}
                    value={value || ''}
                    onEditorChange={(content) => onChange(content)}
                    init={init}
                />
            )}
        </div>
    );
};
