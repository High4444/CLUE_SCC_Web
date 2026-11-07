// Add keyboard activation without changing the existing visual layout.
export const keyboardAction = {
    role: 'button',
    tabIndex: 0,
    onKeyDown(event) {
        if (event.target !== event.currentTarget || event.repeat) return;
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            event.currentTarget.click();
        }
    },
};
