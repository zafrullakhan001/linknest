import React, { useRef, useEffect, InputHTMLAttributes, useState, useCallback } from 'react';

interface SecurePasswordInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'onChange'> {
  value?: string;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

/**
 * Secure password input that prevents console manipulation and hides password value in DOM
 * - Prevents type attribute changes
 * - Masks password value in DOM (value attribute always shows dots, never real password)
 * - Stores real password internally and provides it via onChange
 */
export const SecurePasswordInput: React.FC<SecurePasswordInputProps> = ({ value = '', onChange, ...props }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const realPasswordRef = useRef<string>(value);
  const onChangeRef = useRef(onChange);
  const [displayLength, setDisplayLength] = useState<number>(value.length);
  const isInternalUpdateRef = useRef<boolean>(false);

  // Keep onChange ref updated
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  // Update when value prop changes externally (but not from internal updates)
  useEffect(() => {
    if (!isInternalUpdateRef.current && value !== realPasswordRef.current) {
      realPasswordRef.current = value;
      setDisplayLength(value.length);
      if (inputRef.current) {
        inputRef.current.value = '•'.repeat(value.length);
      }
    }
    isInternalUpdateRef.current = false;
  }, [value]);

  // Handle keydown to capture actual characters
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

    // Update real password
    realPasswordRef.current = newPassword;
    setDisplayLength(newPassword.length);

    // Update display to show dots
    setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.value = '•'.repeat(newPassword.length);
        inputRef.current.setSelectionRange(cursorPos, cursorPos);
      }
    }, 0);

    // Trigger onChange
    if (onChangeRef.current) {
      isInternalUpdateRef.current = true;
      const syntheticEvent = {
        ...e,
        target: { ...input, value: newPassword },
        currentTarget: { ...input, value: newPassword },
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
        inputRef.current.value = '•'.repeat(newPassword.length);
        const newCursorPos = selectionStart + pastedText.length;
        inputRef.current.setSelectionRange(newCursorPos, newCursorPos);
      }
    }, 0);

    if (onChangeRef.current) {
      isInternalUpdateRef.current = true;
      const syntheticEvent = {
        ...e,
        target: { ...input, value: newPassword },
        currentTarget: { ...input, value: newPassword },
      } as React.ChangeEvent<HTMLInputElement>;
      onChangeRef.current(syntheticEvent);
    }
  }, []);

  // Prevent input event from showing real characters
  const handleInput = useCallback((e: React.FormEvent<HTMLInputElement>) => {
    const input = e.currentTarget;
    // Immediately replace with dots based on current password length
    setTimeout(() => {
      const currentLength = realPasswordRef.current.length;
      if (input.value !== '•'.repeat(currentLength)) {
        const selectionStart = input.selectionStart || 0;
        const selectionEnd = input.selectionEnd || 0;
        input.value = '•'.repeat(currentLength);
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
            if (input.value !== '•'.repeat(currentLength)) {
              input.value = '•'.repeat(currentLength);
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
      if (input.value !== '•'.repeat(currentLength)) {
        const selectionStart = input.selectionStart || 0;
        const selectionEnd = input.selectionEnd || 0;
        input.value = '•'.repeat(currentLength);
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
            return '•'.repeat(realPasswordRef.current.length);
          },
          set: (newValue: string) => {
            realPasswordRef.current = newValue;
            setDisplayLength(newValue.length);
            if (valueDescriptor.set) {
              valueDescriptor.set.call(input, '•'.repeat(newValue.length));
            }
            if (onChangeRef.current) {
              isInternalUpdateRef.current = true;
              const syntheticEvent = {
                target: { ...input, value: newValue },
                currentTarget: { ...input, value: newValue },
              } as React.ChangeEvent<HTMLInputElement>;
              onChangeRef.current(syntheticEvent);
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
        const masked = '•'.repeat(val.length);
        realPasswordRef.current = val;
        setDisplayLength(val.length);
        return originalSetAttribute(name, masked);
      }
      return originalSetAttribute(name, val);
    };

    // Initialize with masked value
    input.value = '•'.repeat(realPasswordRef.current.length);

    return () => {
      observer.disconnect();
      clearInterval(intervalId);
    };
  }, []); // Empty deps - setup once, use refs for dynamic values

  return (
    <input
      {...props}
      ref={inputRef}
      type="password"
      value={'•'.repeat(displayLength)}
      onKeyDown={handleKeyDown}
      onPaste={handlePaste}
      onInput={handleInput}
      onChange={() => {}} // Prevent default onChange
    />
  );
};
