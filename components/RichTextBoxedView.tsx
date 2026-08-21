import React, { useCallback, useEffect, useId, useMemo, useRef } from 'react';
import { linkifyHtml } from '../utils/richTextDisplay';
import { toSpeakableText, useReadAloud } from '../hooks/useReadAloud';
import {
  applyReadAloudTrail,
  buildSpeakableDomMap,
  clearReadAloudHighlight,
  cloneSelectionRangeInRoot,
  type DomCharMap,
} from '../utils/readAloudHighlight';
import { ReadAloudButtons, ReadAloudSettingsRow } from './ReadAloudControls';
import {
  getImportanceStyle,
  type BoxFontSize,
  type BoxFontWeight,
  type BoxImportance,
} from './RichTextBoxOptionsFields';

export type BoxAlign = 'left' | 'center' | 'right';

interface RichTextBoxedViewProps {
  content: string;
  boxed?: boolean;
  boxTitle?: string | null;
  boxFooter?: string | null;
  boxHeaderAlign?: BoxAlign | null;
  boxFooterAlign?: BoxAlign | null;
  boxHeaderBg?: string | null;
  boxFooterBg?: string | null;
  boxBodyBg?: string | null;
  boxHeaderFontWeight?: BoxFontWeight | null;
  boxFooterFontWeight?: BoxFontWeight | null;
  boxHeaderFontSize?: BoxFontSize | null;
  boxFooterFontSize?: BoxFontSize | null;
  boxHeaderEmoji?: string | null;
  boxImportance?: BoxImportance | null;
  className?: string;
  bodyClassName?: string;
}

function normalizeAlign(align?: BoxAlign | null): BoxAlign {
  return align === 'center' || align === 'right' ? align : 'left';
}

function contrastText(bg?: string | null): string {
  if (!bg || !/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(bg)) {
    return '#0f172a';
  }
  let hex = bg.slice(1);
  if (hex.length === 3) {
    hex = hex.split('').map((c) => c + c).join('');
  }
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? '#0f172a' : '#f8fafc';
}

function headerFontSizePx(size?: BoxFontSize | null): number {
  if (size === 'sm') return 12;
  if (size === 'lg') return 18;
  return 14;
}

function footerFontSizePx(size?: BoxFontSize | null): number {
  if (size === 'md') return 13;
  if (size === 'lg') return 15;
  return 12;
}

/**
 * Renders section rich text with optional styled header/footer box.
 * Always linkifies bare URLs/emails. Display styles match TinyMCE via .ln-tinymce-content.
 * Includes read-aloud (selection-aware) + speed controls in the header / toolbar.
 */
export const RichTextBoxedView: React.FC<RichTextBoxedViewProps> = ({
  content,
  boxed = false,
  boxTitle,
  boxFooter,
  boxHeaderAlign,
  boxFooterAlign,
  boxHeaderBg,
  boxFooterBg,
  boxBodyBg,
  boxHeaderFontWeight,
  boxFooterFontWeight,
  boxHeaderFontSize,
  boxFooterFontSize,
  boxHeaderEmoji,
  boxImportance,
  className = '',
  bodyClassName = '',
}) => {
  const bodyRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const cachedSelectionRef = useRef('');
  const speakingRangeRef = useRef<Range | null>(null);
  const speakMapRef = useRef<DomCharMap | null>(null);
  const settingsIdPrefix = useId();
  const html = linkifyHtml(content || '');
  const speakableText = useMemo(() => toSpeakableText(content || ''), [content]);
  const readAloud = useReadAloud({
    text: speakableText,
    active: true,
    autoStart: false,
  });

  const getSelectionInBody = useCallback((): string => {
    const body = bodyRef.current;
    if (!body || typeof window === 'undefined') return '';
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return '';
    const range = selection.getRangeAt(0);
    const common = range.commonAncestorContainer;
    const node = common.nodeType === Node.TEXT_NODE ? common.parentNode : common;
    if (!node || !body.contains(node)) return '';
    return (selection.toString() || '').replace(/\s+/g, ' ').trim();
  }, []);

  useEffect(() => {
    const onSelectionChange = () => {
      const live = getSelectionInBody();
      if (live) cachedSelectionRef.current = live;
    };
    const onMouseUp = (e: MouseEvent) => {
      const body = bodyRef.current;
      if (!body || !(e.target instanceof Node) || !body.contains(e.target)) return;
      if (!getSelectionInBody()) cachedSelectionRef.current = '';
    };
    document.addEventListener('selectionchange', onSelectionChange);
    document.addEventListener('mouseup', onMouseUp);
    return () => {
      document.removeEventListener('selectionchange', onSelectionChange);
      document.removeEventListener('mouseup', onMouseUp);
    };
  }, [getSelectionInBody]);

  useEffect(() => {
    cachedSelectionRef.current = '';
    speakingRangeRef.current = null;
    speakMapRef.current = null;
    clearReadAloudHighlight(hostRef.current);
  }, [content]);

  const captureHighlightBeforeSpeak = useCallback(() => {
    const range = cloneSelectionRangeInRoot(bodyRef.current);
    speakingRangeRef.current = range;
    speakMapRef.current = buildSpeakableDomMap(bodyRef.current, range);
    if (!speakMapRef.current) {
      speakMapRef.current = buildSpeakableDomMap(bodyRef.current, null);
    }
  }, []);

  useEffect(() => {
    if (!readAloud.isSpeaking || !readAloud.speakProgress) {
      clearReadAloudHighlight(hostRef.current);
      if (!readAloud.isSpeaking) {
        speakingRangeRef.current = null;
        speakMapRef.current = null;
      }
      return;
    }
    // Rebuild map each tick so custom-font DOM stays valid across re-renders.
    const map = buildSpeakableDomMap(bodyRef.current, speakingRangeRef.current)
      || speakMapRef.current
      || buildSpeakableDomMap(bodyRef.current, null);
    speakMapRef.current = map;
    applyReadAloudTrail(
      hostRef.current,
      map,
      readAloud.speakProgress.charIndex,
      readAloud.speakProgress.charLength
    );
  }, [readAloud.isSpeaking, readAloud.speakProgress]);

  useEffect(() => () => clearReadAloudHighlight(hostRef.current), []);

  const resolveSelectedText = useCallback(() => {
    const live = getSelectionInBody();
    if (live) return live;
    return cachedSelectionRef.current || undefined;
  }, [getSelectionInBody]);

  const bodyBg = boxBodyBg || '#ffffff';
  const bodyStyle: React.CSSProperties = {
    wordBreak: 'break-word',
    color: contrastText(bodyBg),
  };

  const readAloudButtons = (
    <div className="flex items-center gap-0.5 shrink-0" onMouseDown={(e) => e.preventDefault()}>
      <ReadAloudButtons
        readAloud={readAloud}
        theme="slate"
        resolveText={resolveSelectedText}
        onBeforeSpeak={captureHighlightBeforeSpeak}
        hideReplay
      />
    </div>
  );

  const readAloudSettings = (
    <ReadAloudSettingsRow
      readAloud={readAloud}
      idPrefix={settingsIdPrefix}
      className="w-full min-w-0"
    />
  );

  const body = (
    <div ref={hostRef} className="ln-read-aloud-host relative">
      <div
        ref={bodyRef}
        className={`rich-text-content ln-tinymce-content ${bodyClassName}`}
        style={bodyStyle}
        dangerouslySetInnerHTML={{ __html: html || '' }}
      />
    </div>
  );

  if (!boxed) {
    return (
      <div className={className}>
        <div className="flex flex-col items-stretch gap-1 mb-1.5 -mt-0.5">
          <div className="flex items-center justify-end">{readAloudButtons}</div>
          {readAloudSettings}
        </div>
        {body}
      </div>
    );
  }

  const title = (boxTitle || '').trim() || 'Notes';
  const footer = (boxFooter || '').trim();
  const headerAlign = normalizeAlign(boxHeaderAlign);
  const footerAlign = normalizeAlign(boxFooterAlign);
  const headerBg = boxHeaderBg || '#e2e8f0';
  const footerBg = boxFooterBg || '#f1f5f9';
  const headerColor = contrastText(headerBg);
  const footerColor = contrastText(footerBg);
  const headerWeight = boxHeaderFontWeight === 'normal' ? 400 : 700;
  const footerWeight = boxFooterFontWeight === 'bold' ? 700 : 400;
  const emoji = (boxHeaderEmoji || '').trim();
  const importance = getImportanceStyle(boxImportance);

  const titleRowJustify =
    headerAlign === 'center' ? 'center' : headerAlign === 'right' ? 'flex-end' : 'flex-start';

  return (
    <div
      className={`rich-text-styled-box ${className}`}
      data-boxed="true"
      data-importance={importance.value}
      style={{
        overflow: 'hidden',
        borderRadius: 12,
        border: `1px solid ${importance.border}`,
        background: bodyBg,
        boxShadow: '0 1px 3px rgba(15, 23, 42, 0.08)',
      }}
    >
      <div
        style={{
          padding: '10px 16px',
          background: headerBg,
          borderBottom: `1px solid ${importance.border}`,
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: titleRowJustify,
              gap: 8,
              flexWrap: 'wrap',
            }}
          >
            {emoji ? (
              <span style={{ fontSize: Math.max(16, headerFontSizePx(boxHeaderFontSize) + 2), lineHeight: 1 }} aria-hidden>
                {emoji}
              </span>
            ) : null}
            <h4
              style={{
                margin: 0,
                fontSize: headerFontSizePx(boxHeaderFontSize),
                fontWeight: headerWeight,
                letterSpacing: '-0.01em',
                color: headerColor,
              }}
            >
              {title}
            </h4>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                padding: '2px 8px',
                borderRadius: 999,
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: '0.02em',
                textTransform: 'uppercase',
                background: importance.bg,
                color: importance.text,
                border: `1px solid ${importance.border}`,
                whiteSpace: 'nowrap',
              }}
            >
              <span aria-hidden>{importance.emoji}</span>
              {importance.label}
            </span>
            <div style={{ marginLeft: 'auto' }}>{readAloudButtons}</div>
          </div>
          {readAloudSettings}
        </div>
      </div>
      <div style={{ padding: '12px 16px', background: bodyBg }}>{body}</div>
      {footer ? (
        <div
          style={{
            padding: '8px 16px',
            background: footerBg,
            borderTop: '1px solid rgba(15, 23, 42, 0.12)',
            textAlign: footerAlign,
          }}
        >
          <p
            style={{
              margin: 0,
              fontSize: footerFontSizePx(boxFooterFontSize),
              fontWeight: footerWeight,
              color: footerColor,
              whiteSpace: 'pre-wrap',
            }}
          >
            {footer}
          </p>
        </div>
      ) : (
        <div
          style={{
            height: 8,
            background: footerBg,
            borderTop: '1px solid rgba(15, 23, 42, 0.08)',
          }}
        />
      )}
    </div>
  );
};
