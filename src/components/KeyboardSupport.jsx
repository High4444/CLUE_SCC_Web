import React, { useEffect, useState } from 'react';
import { FiCheck } from 'react-icons/fi';

export function KeyboardSupport({ enabled, openPanel }) {
    useEffect(() => {
        document.documentElement.dataset.clueKeyboard = String(enabled);
        const shortcut = event => {
            if (event.altKey && event.shiftKey && event.code === 'KeyV') {
                if (document.querySelector('dialog[open]')) return;
                event.preventDefault(); openPanel();
            }
        };
        const focus = event => {
            if (enabled && event.target instanceof HTMLElement) event.target.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        };
        document.addEventListener('keydown', shortcut);
        document.addEventListener('focusin', focus);
        return () => { document.removeEventListener('keydown', shortcut); document.removeEventListener('focusin', focus); };
    }, [enabled, openPanel]);
    return <a href="#" className="keyboard-skip-link" onClick={event => {
        event.preventDefault();
        const content = document.querySelector('#root main') || document.querySelector('#root .workbench-layout') || document.querySelector('#root .app-container');
        if (content) { content.setAttribute('tabindex', '-1'); content.focus(); content.scrollIntoView({ block: 'start' }); }
    }}>본문 바로가기</a>;
}

export function KeyboardSection({ enabled, onChange }) {
    const [help, setHelp] = useState(false);
    return <section className="a11y-section" aria-labelledby="keyboard-title">
        <div className="a11y-toggle-row"><div><h3 id="keyboard-title">키보드 전용 사용</h3><p className="a11y-help">키보드 선택 위치를 강조해요.</p></div>
            <button type="button" role="switch" aria-labelledby="keyboard-title" aria-checked={enabled} className="a11y-switch" onClick={() => onChange(!enabled)}><span aria-hidden="true">{enabled && <FiCheck />}</span></button>
        </div>
        <p className="a11y-help">기본 키보드 조작은 항상 가능하며, 마우스도 함께 사용할 수 있어요.</p>
        <button type="button" className="keyboard-help-button" aria-expanded={help} aria-controls="keyboard-help" onClick={() => setHelp(!help)}>단축키 안내 {help ? '닫기' : '보기'}</button>
        {help && <dl id="keyboard-help" className="keyboard-help">
            <dt>Tab / Shift + Tab</dt><dd>다음 / 이전 버튼으로 이동</dd>
            <dt>Enter / Space</dt><dd>선택한 버튼 실행</dd>
            <dt>방향키</dt><dd>글씨 크기 선택 항목 변경</dd>
            <dt>Esc</dt><dd>보기 설정 닫기 · 돋보기 종료</dd>
            <dt>Alt + Shift + V</dt><dd>보기 설정 열기</dd>
            <dt>Shift + 방향키</dt><dd>텍스트 선택이 가능한 위치에서 글 선택</dd>
        </dl>}
    </section>;
}
