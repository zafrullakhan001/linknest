/**
 * Shared rich-text font catalog for TinyMCE, the simple editor, and viewers.
 * Keep `font_family_formats` in public/tinymce-editor.html in sync with this list.
 */

export type RichTextFontGroup = 'Sans-serif' | 'Serif' | 'Monospace' | 'Cursive / Script' | 'Display';

export interface RichTextFont {
  label: string;
  /** CSS font-family stack written into editor HTML. */
  cssFamily: string;
  group: RichTextFontGroup;
}

export const RICH_TEXT_FONT_GROUPS: RichTextFontGroup[] = [
  'Sans-serif',
  'Serif',
  'Monospace',
  'Cursive / Script',
  'Display',
];

export const RICH_TEXT_FONTS: RichTextFont[] = [
  // Sans-serif
  { label: 'Arial', cssFamily: 'Arial, Helvetica, sans-serif', group: 'Sans-serif' },
  { label: 'Arial Black', cssFamily: "'Arial Black', Gadget, sans-serif", group: 'Sans-serif' },
  { label: 'Calibri', cssFamily: 'Calibri, Candara, Segoe, sans-serif', group: 'Sans-serif' },
  { label: 'Century Gothic', cssFamily: "'Century Gothic', AppleGothic, sans-serif", group: 'Sans-serif' },
  { label: 'Helvetica', cssFamily: 'Helvetica, Arial, sans-serif', group: 'Sans-serif' },
  { label: 'Lato', cssFamily: 'Lato, Helvetica, sans-serif', group: 'Sans-serif' },
  { label: 'Lucida Sans', cssFamily: "'Lucida Sans Unicode', 'Lucida Grande', sans-serif", group: 'Sans-serif' },
  { label: 'Montserrat', cssFamily: "Montserrat, 'Helvetica Neue', sans-serif", group: 'Sans-serif' },
  { label: 'Nunito', cssFamily: 'Nunito, Geneva, sans-serif', group: 'Sans-serif' },
  { label: 'Open Sans', cssFamily: "'Open Sans', Arial, sans-serif", group: 'Sans-serif' },
  { label: 'Oswald', cssFamily: 'Oswald, Impact, sans-serif', group: 'Sans-serif' },
  { label: 'Poppins', cssFamily: "Poppins, 'Segoe UI', sans-serif", group: 'Sans-serif' },
  { label: 'Roboto', cssFamily: 'Roboto, Arial, sans-serif', group: 'Sans-serif' },
  { label: 'Segoe UI', cssFamily: "'Segoe UI', Tahoma, Geneva, sans-serif", group: 'Sans-serif' },
  { label: 'Tahoma', cssFamily: 'Tahoma, Geneva, sans-serif', group: 'Sans-serif' },
  { label: 'Trebuchet MS', cssFamily: "'Trebuchet MS', Helvetica, sans-serif", group: 'Sans-serif' },
  { label: 'Verdana', cssFamily: 'Verdana, Geneva, sans-serif', group: 'Sans-serif' },
  // Serif
  { label: 'Book Antiqua', cssFamily: "'Book Antiqua', Palatino, serif", group: 'Serif' },
  { label: 'Cambria', cssFamily: 'Cambria, Georgia, serif', group: 'Serif' },
  { label: 'Garamond', cssFamily: 'Garamond, Baskerville, serif', group: 'Serif' },
  { label: 'Georgia', cssFamily: "Georgia, 'Times New Roman', serif", group: 'Serif' },
  { label: 'Lora', cssFamily: 'Lora, Georgia, serif', group: 'Serif' },
  { label: 'Merriweather', cssFamily: 'Merriweather, Georgia, serif', group: 'Serif' },
  { label: 'Palatino', cssFamily: "'Palatino Linotype', Palatino, serif", group: 'Serif' },
  { label: 'Playfair Display', cssFamily: "'Playfair Display', Georgia, serif", group: 'Serif' },
  { label: 'Times New Roman', cssFamily: "'Times New Roman', Times, serif", group: 'Serif' },
  // Monospace
  { label: 'Andale Mono', cssFamily: "'Andale Mono', Monaco, monospace", group: 'Monospace' },
  { label: 'Consolas', cssFamily: 'Consolas, Monaco, monospace', group: 'Monospace' },
  { label: 'Courier New', cssFamily: "'Courier New', Courier, monospace", group: 'Monospace' },
  { label: 'Lucida Console', cssFamily: "'Lucida Console', Monaco, monospace", group: 'Monospace' },
  { label: 'Roboto Mono', cssFamily: "'Roboto Mono', Consolas, monospace", group: 'Monospace' },
  { label: 'Source Code Pro', cssFamily: "'Source Code Pro', Consolas, monospace", group: 'Monospace' },
  { label: 'Terminal', cssFamily: 'Terminal, Monaco, monospace', group: 'Monospace' },
  // Cursive / script — Google Fonts first (viewer-safe), then Windows/macOS faces with web fallbacks
  { label: 'Alex Brush', cssFamily: "'Alex Brush', 'Segoe Script', cursive", group: 'Cursive / Script' },
  { label: 'Allura', cssFamily: "Allura, 'Segoe Script', cursive", group: 'Cursive / Script' },
  { label: 'Apple Chancery', cssFamily: "'Apple Chancery', 'Dancing Script', cursive", group: 'Cursive / Script' },
  { label: 'Bradley Hand', cssFamily: "'Bradley Hand ITC', 'Segoe Print', Caveat, cursive", group: 'Cursive / Script' },
  { label: 'Brush Script', cssFamily: "'Brush Script MT', 'Segoe Script', 'Alex Brush', cursive", group: 'Cursive / Script' },
  { label: 'Caveat', cssFamily: "Caveat, 'Segoe Print', cursive", group: 'Cursive / Script' },
  { label: 'Comic Sans MS', cssFamily: "'Comic Sans MS', 'Comic Sans', cursive", group: 'Cursive / Script' },
  { label: 'Cookie', cssFamily: "Cookie, 'Segoe Script', cursive", group: 'Cursive / Script' },
  { label: 'Courgette', cssFamily: "Courgette, 'Segoe Script', cursive", group: 'Cursive / Script' },
  { label: 'Dancing Script', cssFamily: "'Dancing Script', 'Segoe Script', cursive", group: 'Cursive / Script' },
  { label: 'Edwardian Script', cssFamily: "'Edwardian Script ITC', 'Great Vibes', cursive", group: 'Cursive / Script' },
  { label: 'Freestyle Script', cssFamily: "'Freestyle Script', 'Dancing Script', cursive", group: 'Cursive / Script' },
  { label: 'French Script', cssFamily: "'French Script MT', 'Great Vibes', cursive", group: 'Cursive / Script' },
  { label: 'Great Vibes', cssFamily: "'Great Vibes', 'Segoe Script', cursive", group: 'Cursive / Script' },
  { label: 'Homemade Apple', cssFamily: "'Homemade Apple', 'Lucida Handwriting', cursive", group: 'Cursive / Script' },
  { label: 'Indie Flower', cssFamily: "'Indie Flower', 'Comic Sans MS', cursive", group: 'Cursive / Script' },
  { label: 'Kaushan Script', cssFamily: "'Kaushan Script', 'Segoe Script', cursive", group: 'Cursive / Script' },
  { label: 'Lobster', cssFamily: 'Lobster, Impact, cursive', group: 'Cursive / Script' },
  { label: 'Lucida Calligraphy', cssFamily: "'Lucida Calligraphy', 'Great Vibes', cursive", group: 'Cursive / Script' },
  { label: 'Lucida Handwriting', cssFamily: "'Lucida Handwriting', 'Dancing Script', cursive", group: 'Cursive / Script' },
  { label: 'Monotype Corsiva', cssFamily: "'Monotype Corsiva', 'Dancing Script', cursive", group: 'Cursive / Script' },
  { label: 'Pacifico', cssFamily: "Pacifico, 'Segoe Script', cursive", group: 'Cursive / Script' },
  { label: 'Pinyon Script', cssFamily: "'Pinyon Script', 'Great Vibes', cursive", group: 'Cursive / Script' },
  { label: 'Sacramento', cssFamily: "Sacramento, 'Segoe Script', cursive", group: 'Cursive / Script' },
  { label: 'Satisfy', cssFamily: "Satisfy, 'Segoe Script', cursive", group: 'Cursive / Script' },
  { label: 'Segoe Print', cssFamily: "'Segoe Print', Caveat, cursive", group: 'Cursive / Script' },
  { label: 'Segoe Script', cssFamily: "'Segoe Script', 'Dancing Script', cursive", group: 'Cursive / Script' },
  { label: 'Shadows Into Light', cssFamily: "'Shadows Into Light', 'Comic Sans MS', cursive", group: 'Cursive / Script' },
  { label: 'Tangerine', cssFamily: "Tangerine, 'Great Vibes', cursive", group: 'Cursive / Script' },
  { label: 'Yellowtail', cssFamily: "Yellowtail, 'Segoe Script', cursive", group: 'Cursive / Script' },
  // Display / symbol (TinyMCE defaults)
  { label: 'Impact', cssFamily: 'Impact, Haettenschweiler, sans-serif', group: 'Display' },
  { label: 'Symbol', cssFamily: 'Symbol, serif', group: 'Display' },
  { label: 'Webdings', cssFamily: 'Webdings, sans-serif', group: 'Display' },
  { label: 'Wingdings', cssFamily: "Wingdings, 'Zapf Dingbats'", group: 'Display' },
];

/** Google Fonts used as viewer-safe faces and as fallbacks for Windows/macOS script fonts. */
export const RICH_TEXT_GOOGLE_FONT_FAMILIES = [
  'Alex Brush',
  'Allura',
  'Caveat:wght@400;700',
  'Cookie',
  'Courgette',
  'Dancing Script:wght@400;700',
  'Great Vibes',
  'Homemade Apple',
  'Indie Flower',
  'Kaushan Script',
  'Lato:wght@400;700',
  'Lobster',
  'Lora:wght@400;700',
  'Merriweather:wght@400;700',
  'Montserrat:wght@400;700',
  'Nunito:wght@400;700',
  'Open Sans:wght@400;700',
  'Oswald:wght@400;700',
  'Pacifico',
  'Pinyon Script',
  'Playfair Display:wght@400;700',
  'Poppins:wght@400;700',
  'Roboto:wght@400;700',
  'Roboto Mono:wght@400;700',
  'Sacramento',
  'Satisfy',
  'Shadows Into Light',
  'Source Code Pro:wght@400;700',
  'Tangerine:wght@400;700',
  'Yellowtail',
];

export function buildGoogleFontsHref(families: string[] = RICH_TEXT_GOOGLE_FONT_FAMILIES): string {
  const query = families
    .map((family) => `family=${family.replace(/ /g, '+').replace(/;/g, '%3B')}`)
    .join('&');
  return `https://fonts.googleapis.com/css2?${query}&display=swap`;
}

export const RICH_TEXT_GOOGLE_FONTS_HREF = buildGoogleFontsHref();

/** TinyMCE `font_family_formats` string. */
export function toTinyMceFontFamilyFormats(fonts: RichTextFont[] = RICH_TEXT_FONTS): string {
  return fonts.map((font) => `${font.label}=${font.cssFamily}`).join(';');
}

const FONT_LINK_ID = 'linknest-rich-text-fonts';

/** Load editor/viewer Google Fonts once in the current document. */
export function ensureRichTextFontsLoaded(): void {
  if (typeof document === 'undefined') return;
  if (document.getElementById(FONT_LINK_ID)) return;
  const link = document.createElement('link');
  link.id = FONT_LINK_ID;
  link.rel = 'stylesheet';
  link.href = RICH_TEXT_GOOGLE_FONTS_HREF;
  document.head.appendChild(link);
}
