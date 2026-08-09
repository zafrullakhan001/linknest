import React, { useRef, useEffect, InputHTMLAttributes, useState, useCallback } from 'react';

interface SecurePasswordInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'onChange'> {
  value?: string;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  /** When true, shows an eye icon to toggle password visibility */
  showToggle?: boolean;
}

/**
 * Secure password input that prevents console manipulation and hides password value in DOM
 * - Prevents type attribute changes
 * - Masks password value in DOM (value attribute always shows dots, never real password)
 * - Stores real password internally and provides it via onChange
 * - Optional showToggle: eye icon to reveal/hide password as user types
 */
export const SecurePasswordInput: React.FC<SecurePasswordInputProps> = ({ value = '', onChange, showToggle = false, className = '', ...props }) => {
  const [visible, setVisible] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const realPasswordRef = useRef<string>(value);
  const onChangeRef = useRef(onChange);
  const [displayLength, setDisplayLength] = useState<number>(value.length);
  const isInternalUpdateRef = useRef<boolean>(false);

  // When showToggle is true: use a single native input (type toggles password/text). Value is from parent so eye works.
  if (showToggle) {
    const inputClass = `${className} pr-10`.trim();
    return (
      <div className="relative inline-block w-full">
        <input
          {...props}
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={onChange}
          className={inputClass}
          autoComplete={props.autoComplete}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-1 dark:focus:ring-offset-slate-800"
          tabIndex={-1}
          aria-label={visible ? 'Hide password' : 'Show password'}
        >
          {visible ? (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
            </svg>
          ) : (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
          )}
        </button>
      </div>
    );
  }

  // Keep onChange ref updated (secure path only)
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  // Update when value prop changes externally (but not from internal updates)
  useEffect(() => {
    if (!isInternalUpdateRef.current && value !== realPasswordRef.current) {
      const isAllAsterisks = value.length > 0 && value.replace(/\*/g, '').length === 0;
      if (isAllAsterisks) {
        console.warn('SecurePasswordInput: Received masked value as prop, ignoring to preserve real password');
        return;
      }
      realPasswordRef.current = value;
      setDisplayLength(value.length);
      if (inputRef.current) {
        inputRef.current.value = '*'.repeat(value.length);
      }
    }
    isInternalUpdateRef.current = false;
  }, [value]);

  // Handle keydown to capture actual characters (secure path only)
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    const input = e.currentTarget;
    const key = e.key;
    const selectionStart = input.selectionStart || 0;
    const selectionEnd = input.selectionEnd || 0;
    let newPassword = realPasswordRef.current;
    let cursorPos = selectionStart;

    // Handle printable characters
    if (key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey && key !== 'Enter') {
      if (selectionStart !== selectionEnd) {
        // Replace selected text
        newPassword = realPasswordRef.current.slice(0, selectionStart) + key + realPasswordRef.current.slice(selectionEnd);
        cursorPos = selectionStart + 1;
      } else {
        // Insert at cursor
        newPassword = realPasswordRef.current.slice(0, selectionStart) + key + realPasswordRef.current.slice(selectionStart);
        cursorPos = selectionStart + 1;
      }
    } else if (key === 'Backspace') {
      if (selectionStart !== selectionEnd) {
        // Delete selection
        newPassword = realPasswordRef.current.slice(0, selectionStart) + realPasswordRef.current.slice(selectionEnd);
        cursorPos = selectionStart;
      } else if (selectionStart > 0) {
        // Delete character before cursor
        newPassword = realPasswordRef.current.slice(0, selectionStart - 1) + realPasswordRef.current.slice(selectionStart);
        cursorPos = selectionStart - 1;
      } else {
        return; // Nothing to delete
      }
    } else if (key === 'Delete') {
      if (selectionStart !== selectionEnd) {
        // Delete selection
        newPassword = realPasswordRef.current.slice(0, selectionStart) + realPasswordRef.current.slice(selectionEnd);
        cursorPos = selectionStart;
      } else if (selectionStart < realPasswordRef.current.length) {
        // Delete character after cursor
        newPassword = realPasswordRef.current.slice(0, selectionStart) + realPasswordRef.current.slice(selectionStart + 1);
        cursorPos = selectionStart;
      } else {
        return; // Nothing to delete
      }
    } else {
      // Other keys (arrows, etc.) - let them through
      return;
    }

    // Store old password before updating
    const oldPassword = realPasswordRef.current;
    
    // Update real password
    realPasswordRef.current = newPassword;
    setDisplayLength(newPassword.length);

    // Update display to show asterisks
    setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.value = '*'.repeat(newPassword.length);
        inputRef.current.setSelectionRange(cursorPos, cursorPos);
      }
    }, 0);

    // Trigger onChange - only if password actually changed
    if (onChangeRef.current && newPassword !== oldPassword) {
      // Always use realPasswordRef.current (which we just updated)
      const passwordToSend = realPasswordRef.current;
      // Only reject fully-masked placeholders (all *), not real passwords that contain *
      if (passwordToSend.length > 0 && /^[\*\u2022\u00B7\u25CF\u25E6•·]+$/.test(passwordToSend)) {
        console.error('SecurePasswordInput: Password ref is a masked placeholder! Skipping onChange.');
        return;
      }
      
      isInternalUpdateRef.current = true;
      const syntheticEvent = {
        ...e,
        target: { ...input, value: passwordToSend },
        currentTarget: { ...input, value: passwordToSend },
      } as React.ChangeEvent<HTMLInputElement>;
      onChangeRef.current(syntheticEvent);
    }
  }, []);

  // Handle paste
  const handlePaste = useCallback((e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const input = e.currentTarget;
    const pastedText = e.clipboardData.getData('text');
    const selectionStart = input.selectionStart || 0;
    const selectionEnd = input.selectionEnd || 0;

    const newPassword = realPasswordRef.current.slice(0, selectionStart) + pastedText + realPasswordRef.current.slice(selectionEnd);
    realPasswordRef.current = newPassword;
    setDisplayLength(newPassword.length);

    setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.value = '*'.repeat(newPassword.length);
        const newCursorPos = selectionStart + pastedText.length;
        inputRef.current.setSelectionRange(newCursorPos, newCursorPos);
      }
    }, 0);

    if (onChangeRef.current) {
      const passwordToSend = realPasswordRef.current;
      // Only reject fully-masked placeholders (all *), not real passwords that contain *
      if (passwordToSend.length > 0 && /^[\*\u2022\u00B7\u25CF\u25E6•·]+$/.test(passwordToSend)) {
        console.error('SecurePasswordInput: Password ref is a masked placeholder after paste! Skipping onChange.');
        return;
      }
      
      isInternalUpdateRef.current = true;
      const syntheticEvent = {
        ...e,
        target: { ...input, value: passwordToSend },
        currentTarget: { ...input, value: passwordToSend },
      } as React.ChangeEvent<HTMLInputElement>;
      onChangeRef.current(syntheticEvent);
    }
  }, []);

  // Prevent input event from showing real characters
  const handleInput = useCallback((e: React.FormEvent<HTMLInputElement>) => {
    const input = e.currentTarget;
    // Immediately replace with asterisks based on current password length
    setTimeout(() => {
      const currentLength = realPasswordRef.current.length;
      if (input.value !== '*'.repeat(currentLength)) {
        const selectionStart = input.selectionStart || 0;
        const selectionEnd = input.selectionEnd || 0;
        input.value = '*'.repeat(currentLength);
        input.setSelectionRange(selectionStart, selectionEnd);
      }
    }, 0);
  }, []);

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;

    // Ensure type is always 'password'
    const enforcePasswordType = () => {
      if (input.type !== 'password') {
        input.type = 'password';
      }
    };

    enforcePasswordType();

    // MutationObserver for type attribute
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'attributes') {
          if (mutation.attributeName === 'type') {
            enforcePasswordType();
          } else if (mutation.attributeName === 'value') {
            // Restore masked value
            const currentLength = realPasswordRef.current.length;
            if (input.value !== '*'.repeat(currentLength)) {
              input.value = '*'.repeat(currentLength);
            }
          }
        }
      });
    });

    observer.observe(input, {
      attributes: true,
      attributeFilter: ['type', 'value']
    });

    // Periodic check
    const intervalId = setInterval(() => {
      enforcePasswordType();
      const currentLength = realPasswordRef.current.length;
      if (input.value !== '*'.repeat(currentLength)) {
        const selectionStart = input.selectionStart || 0;
        const selectionEnd = input.selectionEnd || 0;
        input.value = '*'.repeat(currentLength);
        input.setSelectionRange(selectionStart, selectionEnd);
      }
    }, 100);

    // Override value property getter to always return masked value
    try {
      const valueDescriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value') ||
                              Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), 'value');

      if (valueDescriptor) {
        Object.defineProperty(input, 'value', {
          get: () => {
            return '*'.repeat(realPasswordRef.current.length);
          },
          set: (newValue: string) => {
            // Check if this is React setting the controlled value (asterisks matching expected length)
            const expectedAsterisks = '*'.repeat(displayLength);
            const isAllAsterisks = newValue.length > 0 && newValue.replace(/\*/g, '').length === 0;
            const isReactControlledUpdate = isAllAsterisks && newValue.length === displayLength;
            
            if (isReactControlledUpdate) {
              // React is syncing the controlled value - just accept it silently
              if (valueDescriptor.set) {
                valueDescriptor.set.call(input, newValue);
              }
              return; // Don't update refs or trigger onChange
            }
            
            // This is either external manipulation or a real password value
            // Only update if it's different and doesn't contain asterisks
            if (!newValue.includes('*') && newValue !== realPasswordRef.current) {
              realPasswordRef.current = newValue;
              setDisplayLength(newValue.length);
              if (valueDescriptor.set) {
                valueDescriptor.set.call(input, '*'.repeat(newValue.length));
              }
              // Only trigger onChange if not from internal update
              if (onChangeRef.current && !isInternalUpdateRef.current) {
                isInternalUpdateRef.current = true;
                const syntheticEvent = {
                  target: { ...input, value: newValue },
                  currentTarget: { ...input, value: newValue },
                } as React.ChangeEvent<HTMLInputElement>;
                onChangeRef.current(syntheticEvent);
              }
            } else if (isAllAsterisks && newValue.length !== displayLength) {
              // Asterisks but wrong length - update display length only
              setDisplayLength(newValue.length);
              if (valueDescriptor.set) {
                valueDescriptor.set.call(input, newValue);
              }
            }
          },
          configurable: true,
          enumerable: valueDescriptor.enumerable
        });
      }
    } catch (e) {
      // Continue with other protections if property override fails
    }

    // Override setAttribute
    const originalSetAttribute = input.setAttribute.bind(input);
    input.setAttribute = function(name: string, val: string) {
      if (name.toLowerCase() === 'type' && val.toLowerCase() !== 'password') {
        return;
      }
      if (name.toLowerCase() === 'value') {
        const masked = '*'.repeat(val.length);
        realPasswordRef.current = val;
        setDisplayLength(val.length);
        return originalSetAttribute(name, masked);
      }
      return originalSetAttribute(name, val);
    };

    // Initialize with masked value
    input.value = '*'.repeat(realPasswordRef.current.length);

    return () => {
      observer.disconnect();
      clearInterval(intervalId);
    };
  }, []); // Empty deps - setup once, use refs for dynamic values

  const inputClass = className;

  const secureInput = (
    <input
      {...props}
      ref={inputRef}
      type="password"
      value={'*'.repeat(displayLength)}
      onKeyDown={handleKeyDown}
      onPaste={handlePaste}
      onInput={handleInput}
      onChange={() => {}}
      className={inputClass}
    />
  );

  return secureInput;
};
