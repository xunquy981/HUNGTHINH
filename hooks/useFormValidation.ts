
import { useState, useRef, useCallback } from 'react';

export const useFormValidation = <T extends Record<string, any>>() => {
    const [errors, setErrors] = useState<Partial<Record<keyof T, string>>>({});
    const fieldRefs = useRef<Partial<Record<keyof T, HTMLElement | null>>>({});

    const register = useCallback((key: keyof T) => (el: HTMLElement | null) => {
        fieldRefs.current[key] = el;
    }, []);

    const focusFirstError = useCallback((currentErrors: Partial<Record<keyof T, string>>) => {
        const keys = Object.keys(currentErrors) as Array<keyof T>;
        if (keys.length > 0) {
            const firstKey = keys[0];
            const el = fieldRefs.current[firstKey];
            if (el) {
                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                el.focus();
            }
        }
    }, []);

    const clearErrors = useCallback((key?: keyof T) => {
        if (key) {
            setErrors(prev => {
                const next = { ...prev };
                delete next[key];
                return next;
            });
        } else {
            setErrors({});
        }
    }, []);

    return { errors, setErrors, register, focusFirstError, clearErrors };
};
