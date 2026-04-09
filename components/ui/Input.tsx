'use client';

import { InputHTMLAttributes, forwardRef } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, className = '', ...props }, ref) => {
    return (
      <div className="w-full">
        {label && (
          <label className="block text-sm font-medium text-moon-dim mb-1.5">
            {label}
          </label>
        )}
        <input
          ref={ref}
          className={`
            w-full min-h-[44px] px-4 py-2.5 rounded-lg
            bg-charcoal-light border border-moon-dim/20
            text-moon placeholder:text-moon-dim/50
            focus:outline-none focus:ring-2 focus:ring-gold/50 focus:border-gold
            transition-colors
            ${error ? 'border-blood ring-1 ring-blood/50' : ''}
            ${className}
          `}
          {...props}
        />
        {error && (
          <p className="mt-1 text-sm text-blood-light">{error}</p>
        )}
      </div>
    );
  },
);

Input.displayName = 'Input';
export default Input;
