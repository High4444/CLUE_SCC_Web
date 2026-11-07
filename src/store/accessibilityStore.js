export const ACCESSIBILITY_KEY = 'clue_scc_accessibility';
export const TEXT_SIZES = [100, 120, 150, 200];
export const DEFAULT_ACCESSIBILITY = { textSize: 100, highContrast: false, readAloud: false, keyboardOnly: false };

export function normalizeAccessibility(value) {
    return {
        textSize: TEXT_SIZES.includes(value?.textSize) ? value.textSize : 100,
        highContrast: value?.highContrast === true,
        readAloud: value?.readAloud === true,
        keyboardOnly: value?.keyboardOnly === true,
    };
}

export function readAccessibility() {
    try {
        return normalizeAccessibility(JSON.parse(localStorage.getItem(ACCESSIBILITY_KEY)));
    } catch {
        return { ...DEFAULT_ACCESSIBILITY };
    }
}

export function saveAccessibility(value) {
    try {
        localStorage.setItem(ACCESSIBILITY_KEY, JSON.stringify(normalizeAccessibility(value)));
        return true;
    } catch {
        return false;
    }
}
