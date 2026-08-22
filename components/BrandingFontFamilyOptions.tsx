import React from 'react';

/** Common Windows / web-safe fonts for branding (sans, serif, mono, cursive/script, display). */
export const BRANDING_FONT_FAMILIES: { value: string; label: string; group: string }[] = [
  { value: 'inherit', label: 'Inherit (Default)', group: 'Default' },
  // Sans-serif
  { value: 'Arial, sans-serif', label: 'Arial', group: 'Sans-serif' },
  { value: "'Arial Black', Gadget, sans-serif", label: 'Arial Black', group: 'Sans-serif' },
  { value: "'Helvetica Neue', Helvetica, sans-serif", label: 'Helvetica', group: 'Sans-serif' },
  { value: 'Verdana, Geneva, sans-serif', label: 'Verdana', group: 'Sans-serif' },
  { value: 'Tahoma, Geneva, sans-serif', label: 'Tahoma', group: 'Sans-serif' },
  { value: "'Trebuchet MS', Helvetica, sans-serif", label: 'Trebuchet MS', group: 'Sans-serif' },
  { value: "'Segoe UI', Tahoma, Geneva, sans-serif", label: 'Segoe UI', group: 'Sans-serif' },
  { value: 'Calibri, Candara, Segoe, sans-serif', label: 'Calibri', group: 'Sans-serif' },
  { value: 'Candara, Calibri, Segoe, sans-serif', label: 'Candara', group: 'Sans-serif' },
  { value: 'Corbel, "Century Gothic", sans-serif', label: 'Corbel', group: 'Sans-serif' },
  { value: '"Century Gothic", CenturyGothic, AppleGothic, sans-serif', label: 'Century Gothic', group: 'Sans-serif' },
  { value: "'Lucida Sans Unicode', 'Lucida Grande', sans-serif", label: 'Lucida Sans', group: 'Sans-serif' },
  { value: "'Franklin Gothic Medium', 'Arial Narrow', sans-serif", label: 'Franklin Gothic', group: 'Sans-serif' },
  { value: 'Optima, Segoe, Candara, sans-serif', label: 'Optima', group: 'Sans-serif' },
  // Serif
  { value: "'Times New Roman', Times, serif", label: 'Times New Roman', group: 'Serif' },
  { value: 'Georgia, serif', label: 'Georgia', group: 'Serif' },
  { value: "'Palatino Linotype', 'Book Antiqua', Palatino, serif", label: 'Palatino', group: 'Serif' },
  { value: "'Book Antiqua', Palatino, serif", label: 'Book Antiqua', group: 'Serif' },
  { value: 'Garamond, Baskerville, serif', label: 'Garamond', group: 'Serif' },
  { value: "'Century Schoolbook', Century, Georgia, serif", label: 'Century Schoolbook', group: 'Serif' },
  { value: 'Cambria, Georgia, serif', label: 'Cambria', group: 'Serif' },
  { value: 'Constantia, Georgia, serif', label: 'Constantia', group: 'Serif' },
  { value: "'Bookman Old Style', Georgia, serif", label: 'Bookman Old Style', group: 'Serif' },
  { value: "'Adobe Caslon Pro', 'Big Caslon', 'Book Antiqua', serif", label: 'Caslon', group: 'Serif' },
  // Monospace
  { value: "'Courier New', Courier, monospace", label: 'Courier New', group: 'Monospace' },
  { value: 'Consolas, Monaco, monospace', label: 'Consolas', group: 'Monospace' },
  { value: "'Lucida Console', Monaco, monospace", label: 'Lucida Console', group: 'Monospace' },
  { value: "'Cascadia Code', Consolas, monospace", label: 'Cascadia Code', group: 'Monospace' },
  { value: "'Cascadia Mono', Consolas, monospace", label: 'Cascadia Mono', group: 'Monospace' },
  // Cursive / script (Windows + common)
  { value: "'Segoe Script', 'Comic Sans MS', cursive", label: 'Segoe Script', group: 'Cursive / Script' },
  { value: "'Segoe Print', 'Comic Sans MS', cursive", label: 'Segoe Print', group: 'Cursive / Script' },
  { value: "'Comic Sans MS', 'Chalkboard SE', cursive", label: 'Comic Sans MS', group: 'Cursive / Script' },
  { value: "'Bradley Hand ITC', 'Segoe Print', cursive", label: 'Bradley Hand ITC', group: 'Cursive / Script' },
  { value: "'Brush Script MT', 'Segoe Script', cursive", label: 'Brush Script MT', group: 'Cursive / Script' },
  { value: "'Lucida Handwriting', 'Segoe Script', cursive", label: 'Lucida Handwriting', group: 'Cursive / Script' },
  { value: "'Lucida Calligraphy', 'Segoe Script', cursive", label: 'Lucida Calligraphy', group: 'Cursive / Script' },
  { value: "'Freestyle Script', 'Segoe Script', cursive", label: 'Freestyle Script', group: 'Cursive / Script' },
  { value: "'French Script MT', 'Segoe Script', cursive", label: 'French Script MT', group: 'Cursive / Script' },
  { value: "'Edwardian Script ITC', 'Segoe Script', cursive", label: 'Edwardian Script ITC', group: 'Cursive / Script' },
  { value: "'Kunstler Script', 'Segoe Script', cursive", label: 'Kunstler Script', group: 'Cursive / Script' },
  { value: "'Vladimir Script', 'Segoe Script', cursive", label: 'Vladimir Script', group: 'Cursive / Script' },
  { value: "'Palace Script MT', 'Segoe Script', cursive", label: 'Palace Script MT', group: 'Cursive / Script' },
  { value: "'Script MT Bold', 'Segoe Script', cursive", label: 'Script MT Bold', group: 'Cursive / Script' },
  { value: "'Vivaldi', 'Segoe Script', cursive", label: 'Vivaldi', group: 'Cursive / Script' },
  { value: "'Monotype Corsiva', 'Segoe Script', cursive", label: 'Monotype Corsiva', group: 'Cursive / Script' },
  { value: "'Mistral', 'Segoe Script', cursive", label: 'Mistral', group: 'Cursive / Script' },
  { value: "'Pristina', 'Segoe Script', cursive", label: 'Pristina', group: 'Cursive / Script' },
  { value: "'Tempus Sans ITC', 'Comic Sans MS', cursive", label: 'Tempus Sans ITC', group: 'Cursive / Script' },
  { value: "'Chalkboard', 'Comic Sans MS', cursive", label: 'Chalkboard', group: 'Cursive / Script' },
  { value: "'Apple Chancery', 'Segoe Script', cursive", label: 'Apple Chancery', group: 'Cursive / Script' },
  { value: 'cursive', label: 'Generic Cursive', group: 'Cursive / Script' },
  // Display / decorative
  { value: 'Impact, Haettenschweiler, sans-serif', label: 'Impact', group: 'Display' },
  { value: "'Bauhaus 93', Impact, sans-serif", label: 'Bauhaus 93', group: 'Display' },
  { value: "'Broadway', Impact, sans-serif", label: 'Broadway', group: 'Display' },
  { value: "'Cooper Black', Georgia, serif", label: 'Cooper Black', group: 'Display' },
  { value: "'Copperplate Gothic Bold', Copperplate, fantasy", label: 'Copperplate Gothic', group: 'Display' },
  { value: "'Gill Sans Ultra Bold', Gill Sans, sans-serif", label: 'Gill Sans Ultra Bold', group: 'Display' },
  { value: "'Haettenschweiler', Impact, sans-serif", label: 'Haettenschweiler', group: 'Display' },
  { value: "'Playbill', Impact, serif", label: 'Playbill', group: 'Display' },
  { value: "'Showcard Gothic', Impact, sans-serif", label: 'Showcard Gothic', group: 'Display' },
  { value: "'Stencil', Impact, sans-serif", label: 'Stencil', group: 'Display' },
  { value: 'fantasy', label: 'Generic Fantasy', group: 'Display' },
];

export const BrandingFontFamilyOptions: React.FC = () => {
  const groups = Array.from(new Set(BRANDING_FONT_FAMILIES.map((f) => f.group)));
  return (
    <>
      {groups.map((group) => (
        <optgroup key={group} label={group}>
          {BRANDING_FONT_FAMILIES.filter((f) => f.group === group).map((f) => (
            <option key={f.value} value={f.value} style={{ fontFamily: f.value === 'inherit' ? undefined : f.value }}>
              {f.label}
            </option>
          ))}
        </optgroup>
      ))}
    </>
  );
};
