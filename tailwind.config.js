/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
    "./contexts/**/*.{js,ts,jsx,tsx}",
    "./services/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  safelist: [
    // Dynamic color classes used in COLOR_STYLES
    // Base colors
    'bg-blue-600', 'bg-emerald-600', 'bg-violet-600', 'bg-amber-600', 'bg-rose-600',
    'bg-cyan-600', 'bg-fuchsia-600', 'bg-orange-600', 'bg-red-600', 'bg-indigo-600',
    'bg-lime-600', 'bg-sky-600', 'bg-slate-600', 'bg-teal-600', 'bg-pink-600',
    'bg-purple-600', 'bg-yellow-600', 'bg-zinc-600',
    // Soft backgrounds
    'bg-blue-50', 'bg-emerald-50', 'bg-violet-50', 'bg-amber-50', 'bg-rose-50',
    'bg-cyan-50', 'bg-fuchsia-50', 'bg-orange-50', 'bg-red-50', 'bg-indigo-50',
    'bg-lime-50', 'bg-sky-50', 'bg-slate-50', 'bg-teal-50', 'bg-pink-50',
    'bg-purple-50', 'bg-yellow-50', 'bg-zinc-50',
    // Text colors
    'text-blue-600', 'text-blue-700', 'text-blue-400',
    'text-emerald-600', 'text-emerald-700', 'text-emerald-400',
    'text-violet-600', 'text-violet-700', 'text-violet-400',
    'text-amber-600', 'text-amber-700', 'text-amber-400',
    'text-rose-600', 'text-rose-700', 'text-rose-400',
    'text-cyan-600', 'text-cyan-700', 'text-cyan-400',
    'text-fuchsia-600', 'text-fuchsia-700', 'text-fuchsia-400',
    'text-orange-600', 'text-orange-700', 'text-orange-400',
    'text-red-600', 'text-red-700', 'text-red-400',
    'text-indigo-600', 'text-indigo-700', 'text-indigo-400',
    'text-lime-600', 'text-lime-700', 'text-lime-400',
    'text-sky-600', 'text-sky-700', 'text-sky-400',
    'text-slate-600', 'text-slate-700', 'text-slate-400',
    'text-teal-600', 'text-teal-700', 'text-teal-400',
    'text-pink-600', 'text-pink-700', 'text-pink-400',
    'text-purple-600', 'text-purple-700', 'text-purple-400',
    'text-yellow-600', 'text-yellow-700', 'text-yellow-400',
    'text-zinc-600', 'text-zinc-700', 'text-zinc-400',
    // Border colors
    'border-blue-200', 'border-blue-400', 'border-blue-500',
    'border-emerald-200', 'border-emerald-400', 'border-emerald-500',
    'border-violet-200', 'border-violet-400', 'border-violet-500',
    'border-amber-200', 'border-amber-400', 'border-amber-500',
    'border-rose-200', 'border-rose-400', 'border-rose-500',
    'border-cyan-200', 'border-cyan-400', 'border-cyan-500',
    'border-fuchsia-200', 'border-fuchsia-400', 'border-fuchsia-500',
    'border-orange-200', 'border-orange-400', 'border-orange-500',
    'border-red-200', 'border-red-400', 'border-red-500',
    'border-indigo-200', 'border-indigo-400', 'border-indigo-500',
    'border-lime-200', 'border-lime-400', 'border-lime-500',
    'border-sky-200', 'border-sky-400', 'border-sky-500',
    'border-slate-200', 'border-slate-400', 'border-slate-500',
    'border-teal-200', 'border-teal-400', 'border-teal-500',
    'border-pink-200', 'border-pink-400', 'border-pink-500',
    'border-purple-200', 'border-purple-400', 'border-purple-500',
    'border-yellow-200', 'border-yellow-400', 'border-yellow-500',
    'border-zinc-200', 'border-zinc-400', 'border-zinc-500',
    // Gradient from colors
    'from-blue-600', 'from-emerald-600', 'from-violet-600', 'from-amber-600',
    'from-rose-600', 'from-cyan-600', 'from-fuchsia-600', 'from-orange-600',
    'from-red-600', 'from-indigo-600', 'from-lime-600', 'from-sky-600',
    'from-slate-600', 'from-teal-600', 'from-pink-600', 'from-purple-600',
    'from-yellow-600', 'from-zinc-600',
    // Gradient to colors
    'to-indigo-600', 'to-teal-600', 'to-purple-600', 'to-orange-600',
    'to-pink-600', 'to-blue-600', 'to-rose-600', 'to-red-600',
    'to-blue-600', 'to-green-600', 'to-sky-600', 'to-gray-600',
    'to-emerald-600', 'to-rose-600', 'to-indigo-600', 'to-orange-600',
    'to-neutral-600',
    // Dark mode variants with opacity
    'dark:bg-blue-500/10', 'dark:bg-blue-500/20', 'dark:text-blue-300',
    'dark:bg-emerald-500/10', 'dark:bg-emerald-500/20', 'dark:text-emerald-300',
    'dark:bg-violet-500/10', 'dark:bg-violet-500/20', 'dark:text-violet-300',
    'dark:bg-amber-500/10', 'dark:bg-amber-500/20', 'dark:text-amber-300',
    'dark:bg-rose-500/10', 'dark:bg-rose-500/20', 'dark:text-rose-300',
    'dark:bg-cyan-500/10', 'dark:bg-cyan-500/20', 'dark:text-cyan-300',
    'dark:bg-fuchsia-500/10', 'dark:bg-fuchsia-500/20', 'dark:text-fuchsia-300',
    'dark:bg-orange-500/10', 'dark:bg-orange-500/20', 'dark:text-orange-300',
    'dark:bg-red-500/10', 'dark:bg-red-500/20', 'dark:text-red-300',
    'dark:bg-indigo-500/10', 'dark:bg-indigo-500/20', 'dark:text-indigo-300',
    'dark:bg-lime-500/10', 'dark:bg-lime-500/20', 'dark:text-lime-300',
    'dark:bg-sky-500/10', 'dark:bg-sky-500/20', 'dark:text-sky-300',
    'dark:bg-slate-500/10', 'dark:bg-slate-500/20', 'dark:text-slate-300',
    'dark:bg-teal-500/10', 'dark:bg-teal-500/20', 'dark:text-teal-300',
    'dark:bg-pink-500/10', 'dark:bg-pink-500/20', 'dark:text-pink-300',
    'dark:bg-purple-500/10', 'dark:bg-purple-500/20', 'dark:text-purple-300',
    'dark:bg-yellow-500/10', 'dark:bg-yellow-500/20', 'dark:text-yellow-300',
    'dark:bg-zinc-500/10', 'dark:bg-zinc-500/20', 'dark:text-zinc-300',
    // Border opacity variants
    'dark:border-blue-500/30', 'dark:border-emerald-500/30', 'dark:border-violet-500/30',
    'dark:border-amber-500/30', 'dark:border-rose-500/30', 'dark:border-cyan-500/30',
    'dark:border-fuchsia-500/30', 'dark:border-orange-500/30', 'dark:border-red-500/30',
    'dark:border-indigo-500/30', 'dark:border-lime-500/30', 'dark:border-sky-500/30',
    'dark:border-slate-500/30', 'dark:border-teal-500/30', 'dark:border-pink-500/30',
    'dark:border-purple-500/30', 'dark:border-yellow-500/30', 'dark:border-zinc-500/30',
    // Gradient dark variants
    'dark:to-indigo-900', 'dark:to-teal-900', 'dark:to-purple-900', 'dark:to-orange-900',
    'dark:to-pink-900', 'dark:to-blue-900', 'dark:to-rose-900', 'dark:to-red-900',
    'dark:to-blue-900', 'dark:to-green-900', 'dark:to-sky-900', 'dark:to-gray-900',
    'dark:to-emerald-900', 'dark:to-rose-900', 'dark:to-indigo-900', 'dark:to-orange-900',
    'dark:to-neutral-900',
    // Icon backgrounds
    'bg-blue-100', 'bg-emerald-100', 'bg-violet-100', 'bg-amber-100',
    'bg-rose-100', 'bg-cyan-100', 'bg-fuchsia-100', 'bg-orange-100',
    'bg-red-100', 'bg-indigo-100', 'bg-lime-100', 'bg-sky-100',
    'bg-slate-100', 'bg-teal-100', 'bg-pink-100', 'bg-purple-100',
    'bg-yellow-100', 'bg-zinc-100',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
      },
      colors: {
        brand: {
          50: '#eff6ff',
          100: '#dbeafe',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
          900: '#1e3a8a',
        }
      },
      maxWidth: {
        '6xl-plus': '93.6rem', // 30% larger than default 6xl (72rem)
        // Wider shell for Admin (tables, settings) — keeps home/tile pages on 6xl-plus
        admin: '120rem',
      }
    },
  },
  plugins: [],
}

