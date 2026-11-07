import React, { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'react-router-dom';
import { FiX, FiRotateCcw, FiCheck, FiSearch } from 'react-icons/fi';
import { ACCESSIBILITY_KEY, DEFAULT_ACCESSIBILITY, TEXT_SIZES, readAccessibility, saveAccessibility } from '../store/accessibilityStore';
import '../components/AccessibilityPanel.css';
import Magnifier from '../components/Magnifier';
import { useReadAloud, ReadAloudSection, FloatingReadAloud, SelectionReadPrompt } from '../components/ReadAloud';
import { KeyboardSupport, KeyboardSection } from '../components/KeyboardSupport';

const AccessibilityContext = createContext(null);
export const useAccessibility = () => useContext(AccessibilityContext);

export function AccessibilityProvider({ children }) {
    const [settings, setSettings] = useState(readAccessibility);
    const [isOpen, setIsOpen] = useState(false);
    const [saved, setSaved] = useState(true);
    const [selectingText, setSelectingText] = useState(false);
    const [magnifierOn, setMagnifierOn] = useState(false);
    const [magnifierZoom, setMagnifierZoom] = useState(2);
    const stopMagnifier = useCallback(() => setMagnifierOn(false), []);
    const dialog = useRef(null);
    const trigger = useRef(null);
    const { pathname } = useLocation();
    const reader = useReadAloud(settings.readAloud, pathname);
    useEffect(() => { setSelectingText(false); }, [pathname]);
    const hasSidebar = /^\/(dashboard|history|saved|recent|applied|calendar|compare|diagnosis|my)(\/|$)/.test(pathname);

    useLayoutEffect(() => {
        const root = document.documentElement;
        root.style.fontSize = `${settings.textSize}%`;
        root.dataset.clueContrast = settings.highContrast ? 'high' : 'normal';
        root.dataset.clueLargeText = String(settings.textSize > 100);
    }, [settings]);

    useEffect(() => {
        const sync = (event) => {
            if (event.key === ACCESSIBILITY_KEY || event.key === null) setSettings(readAccessibility());
        };
        window.addEventListener('storage', sync);
        return () => window.removeEventListener('storage', sync);
    }, []);

    useEffect(() => {
        if (!isOpen) return;
        const previous = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => { document.body.style.overflow = previous; };
    }, [isOpen]);

    const openPanel = useCallback(() => {
        trigger.current = document.activeElement;
        dialog.current.showModal();
        setIsOpen(true);
    }, []);
    function closePanel() { dialog.current.close(); }
    function changeSettings(next) {
        setSettings(next);
        setSaved(saveAccessibility(next));
    }

    return (
        <AccessibilityContext.Provider value={{ openPanel, isOpen, magnifierOn, toggleMagnifier: () => setMagnifierOn(value => !value) }}>
            <KeyboardSupport enabled={settings.keyboardOnly} openPanel={openPanel} />
            {children}
            <FloatingReadAloud reader={reader} visible={settings.readAloud && !isOpen && !selectingText} />
            <SelectionReadPrompt reader={reader} visible={settings.readAloud && selectingText && !isOpen} onClose={() => setSelectingText(false)} />
            {!hasSidebar && <div className="clue-view-standalone"><ViewSettingsButton /><MagnifierButton /></div>}
            {magnifierOn && <Magnifier zoom={magnifierZoom} onZoom={setMagnifierZoom} onClose={stopMagnifier} suspended={isOpen} />}
            {createPortal(
                <dialog ref={dialog} id="clue-accessibility-panel" className="a11y-panel"
                    aria-labelledby="a11y-title"
                    onKeyDown={(event) => {
                        if (event.key !== 'Tab') return;
                        const controls = [...dialog.current.querySelectorAll('button:not(:disabled), input:not(:disabled), a[href], [tabindex="0"]')]
                            .filter(node => node.getClientRects().length && (node.type !== 'radio' || node.checked));
                        const first = controls[0];
                        const last = controls[controls.length - 1];
                        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
                        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
                    }}
                    onClose={() => { setIsOpen(false); if (trigger.current?.isConnected) trigger.current.focus(); }}
                    onClick={(event) => { if (event.target === dialog.current) {
                        const rect = dialog.current.getBoundingClientRect();
                        if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) closePanel();
                    } }}>
                    <div className="a11y-panel-content">
                        <header className="a11y-header">
                            <div><h2 id="a11y-title">나에게 맞춘 보기 설정</h2></div>
                            <button autoFocus type="button" className="a11y-close" onClick={closePanel} aria-label="보기 설정 닫기"><FiX aria-hidden="true" /></button>
                        </header>
                        <fieldset className="a11y-section">
                            <legend>글씨 크기</legend>
                            <p className="a11y-help">메뉴와 본문 글씨를 함께 키웁니다.</p>
                            <div className="a11y-sizes">
                                {TEXT_SIZES.map(size => <label key={size} className={`a11y-size ${settings.textSize === size ? 'is-selected' : ''}`}>
                                    <input type="radio" name="a11y-text-size" value={size} checked={settings.textSize === size}
                                        onChange={() => changeSettings({ ...settings, textSize: size })} />
                                    <span>{size}%</span><small>{size === 100 ? '기본' : size === 120 ? '크게' : size === 150 ? '더 크게' : '가장 크게'}</small>
                                </label>)}
                            </div>
                            <div className="a11y-preview"><span className="a11y-preview-label">미리보기</span><p>나에게 필요한 공고를<br />편하게 읽고 준비하세요.</p></div>
                            <p className="a11y-help">이미지·PDF 원본 속 글씨는 문서 뷰어의 확대 기능을 이용해 주세요.</p>
                        </fieldset>
                        <section className="a11y-section" aria-labelledby="a11y-contrast-label">
                            <div className="a11y-toggle-row"><div><h3 id="a11y-contrast-label">고대비 모드</h3><p id="a11y-contrast-help" className="a11y-help">밝은 배경과 진한 글씨로<br />내용과 버튼을 또렷하게 표시합니다.</p></div>
                                <button type="button" role="switch" aria-checked={settings.highContrast} aria-labelledby="a11y-contrast-label" aria-describedby="a11y-contrast-help"
                                    className="a11y-switch" onClick={() => changeSettings({ ...settings, highContrast: !settings.highContrast })}>
                                    <span aria-hidden="true">{settings.highContrast ? <FiCheck /> : null}</span>
                                </button>
                            </div>
                        </section>
                        <ReadAloudSection onSelectText={() => { reader.clearSelection(); setSelectingText(true); closePanel(); }} enabled={settings.readAloud} onChange={value => changeSettings({ ...settings, readAloud: value })} reader={reader} />
                        <KeyboardSection enabled={settings.keyboardOnly} onChange={value => changeSettings({ ...settings, keyboardOnly: value })} />
                        <footer className="a11y-footer">
                            <p role="status" className="a11y-help">{saved ? '이 브라우저에 자동 저장됩니다.' : '설정은 적용됐지만 저장하지 못했어요. 새로고침하면 초기화될 수 있습니다.'}</p>
                            <button type="button" className="a11y-reset" onClick={() => { changeSettings({ ...DEFAULT_ACCESSIBILITY }); setMagnifierOn(false); }}><FiRotateCcw aria-hidden="true" />기본 설정으로 초기화</button>
                            <p className="a11y-keyboard">Tab으로 이동 · Esc로 닫기</p>
                        </footer>
                    </div>
                </dialog>, document.body)}
        </AccessibilityContext.Provider>
    );
}

export function ViewSettingsButton() {
    const { openPanel, isOpen } = useAccessibility();
    return <button type="button" className="clue-view-button" onClick={openPanel}
        aria-haspopup="dialog" aria-controls="clue-accessibility-panel" aria-expanded={isOpen}>
        <span aria-hidden="true" className="clue-view-symbol">가＋</span><span>보기 설정</span>
    </button>;
}

export function MagnifierButton() {
    const { magnifierOn, toggleMagnifier } = useAccessibility();
    return <button type="button" className="clue-view-button clue-magnifier-button"
        onClick={toggleMagnifier} aria-pressed={magnifierOn} aria-label={magnifierOn ? '돋보기 끄기' : '돋보기 켜기'}>
        <FiSearch className="clue-view-symbol" aria-hidden="true" />
        <span>{magnifierOn ? '돋보기 끄기' : '돋보기'}</span>
    </button>;
}
