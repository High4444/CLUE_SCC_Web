import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { FiVolume2, FiPlay, FiPause, FiSquare, FiCheck } from 'react-icons/fi';

export function useReadAloud(enabled, pathname) {
    const supported = typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
    const [status, setStatus] = useState('idle');
    const [message, setMessage] = useState('읽고 싶은 글을 선택한 뒤 재생해 주세요.');
    const [selected, setSelected] = useState('');
    const [reading, setReading] = useState('');
    const [progress, setProgress] = useState(0);
    const selection = useRef('');
    const run = useRef(0);
    const utterance = useRef(null);
    const timer = useRef(null);
    const voices = useRef([]);
    const stop = useCallback(() => {
        run.current += 1;
        clearTimeout(timer.current);
        if (supported) window.speechSynthesis.cancel();
        utterance.current = null;
        setStatus('idle'); setProgress(0); setMessage('읽기를 멈췄어요.');
    }, [supported]);

    useEffect(() => {
        if (!supported) return;
        const update = () => { voices.current = window.speechSynthesis.getVoices(); };
        update(); window.speechSynthesis.addEventListener('voiceschanged', update);
        return () => window.speechSynthesis.removeEventListener('voiceschanged', update);
    }, [supported]);
    useEffect(() => {
        function rememberSelection() {
            const range = window.getSelection();
            const anchor = range?.anchorNode?.parentElement;
            const focus = range?.focusNode?.parentElement;
            if (!anchor?.closest('#root') || !focus?.closest('#root') || anchor.closest('input, textarea, [contenteditable]')) return;
            const text = range.toString().trim();
            if (text) { selection.current = text; setSelected(text); }
        }
        document.addEventListener('selectionchange', rememberSelection);
        document.addEventListener('pointerup', rememberSelection);
        document.addEventListener('keyup', rememberSelection);
        return () => {
            document.removeEventListener('selectionchange', rememberSelection);
            document.removeEventListener('pointerup', rememberSelection);
            document.removeEventListener('keyup', rememberSelection);
        };
    }, []);
    useEffect(() => { stop(); selection.current = ''; setSelected(''); setReading(''); }, [pathname, stop]);
    useEffect(() => { if (!enabled) stop(); }, [enabled, stop]);
    useEffect(() => () => { run.current += 1; clearTimeout(timer.current); if (supported) window.speechSynthesis.cancel(); }, [supported]);

    function start(kind) {
        if (!supported || !enabled) return;
        let text = selection.current;
        if (kind === 'page') {
            const root = document.querySelector('#root main') || document.querySelector('#root .workbench-layout') || document.getElementById('root');
            const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
            const parts = [];
            while (walker.nextNode()) {
                const node = walker.currentNode;
                const parent = node.parentElement;
                if (!parent || parent.closest('script, style, input, textarea, select, button, nav, header, .clue-sidebar-wrapper, .clue-view-standalone, .keyboard-skip-link, [aria-hidden="true"], [hidden], [inert]')) continue;
                if (!parent.getClientRects().length || getComputedStyle(parent).visibility === 'hidden') continue;
                const value = node.textContent.trim();
                if (value) parts.push(value);
            }
            text = parts.join(' ');
        }
        if (!text?.trim()) { setMessage(kind === 'page' ? '읽을 수 있는 본문이 없어요. PDF 원본이나 이미지의 글씨는 지원하지 않아요.' : '먼저 화면에서 읽고 싶은 글을 선택해 주세요.'); return; }
        if (text.length > 20000) { setMessage('한 번에 20,000자까지 읽을 수 있어요. 필요한 부분을 나누어 선택해 주세요.'); return; }
        stop();
        const id = run.current;
        const chunks = text.match(/[\s\S]{1,180}/g) || [];
        let offset = 0;
        setReading(text); setStatus('starting'); setMessage('음성을 준비하고 있어요.');
        function next(index) {
            if (id !== run.current) return;
            if (index >= chunks.length) { setStatus('idle'); setProgress(100); setMessage('끝까지 읽었어요.'); utterance.current = null; return; }
            const speech = new SpeechSynthesisUtterance(chunks[index]);
            utterance.current = speech;
            speech.lang = 'ko-KR'; speech.rate = 1;
            const korean = voices.current.filter(voice => /^ko(?:-|_)/i.test(voice.lang));
            speech.voice = korean.find(voice => voice.localService) || korean[0] || null;
            speech.onstart = () => { if (id !== run.current) return; clearTimeout(timer.current); setStatus('speaking'); setMessage('읽는 중이에요.'); };
            speech.onboundary = event => { if (id === run.current) setProgress(Math.round((offset + event.charIndex) / text.length * 100)); };
            speech.onend = () => { if (id !== run.current) return; offset += chunks[index].length; setProgress(Math.round(offset / text.length * 100)); next(index + 1); };
            speech.onerror = () => { if (id !== run.current) return; clearTimeout(timer.current); run.current += 1; setStatus('error'); setMessage('음성을 재생하지 못했어요. 기기의 한국어 음성 설정이나 다른 브라우저를 확인해 주세요.'); };
            clearTimeout(timer.current);
            timer.current = window.setTimeout(() => { if (id !== run.current) return; run.current += 1; window.speechSynthesis.cancel(); setStatus('error'); setMessage('음성을 시작하지 못했어요. 기기의 음성 설정을 확인한 뒤 다시 재생해 주세요.'); }, 8000);
            window.speechSynthesis.resume();
            window.speechSynthesis.speak(speech);
        }
        next(0);
    }
    function pauseResume() {
        if (status === 'speaking') { window.speechSynthesis.pause(); setStatus('paused'); setMessage('일시정지했어요.'); }
        else if (status === 'paused') { window.speechSynthesis.resume(); setStatus('speaking'); setMessage('읽는 중이에요.'); }
    }
    function clearSelection() {
        stop(); selection.current = ''; setSelected(''); setReading('');
        window.getSelection()?.removeAllRanges();
        setMessage('읽고 싶은 글을 드래그해 선택해 주세요.');
    }
    return { supported, status, message, selected, reading, progress, start, stop, pauseResume, clearSelection };
}

export function ReadAloudControls({ reader, floating = false }) {
    const active = ['starting', 'speaking', 'paused'].includes(reader.status);
    return <div className={floating ? 'speech-floating' : 'speech-player'} role={floating ? 'region' : undefined} aria-label={floating ? '읽어주기 재생 조작' : undefined}>
        <p className="speech-text"><FiVolume2 aria-hidden="true" /> {reader.reading ? reader.reading.slice(0, 90) + (reader.reading.length > 90 ? '…' : '') : '선택한 글을 음성으로 들어보세요.'}</p>
        <progress max="100" value={reader.progress} aria-label="읽기 진행률" />
        <div className="speech-buttons">
            {!floating && <><button type="button" onClick={() => reader.start('selection')} disabled={!reader.selected}><FiPlay aria-hidden="true" />선택한 글 읽기</button>
            <button type="button" onClick={() => reader.start('page')}>현재 화면 읽기</button></>}
            <button type="button" disabled={!['speaking', 'paused'].includes(reader.status)} onClick={reader.pauseResume}>{reader.status === 'paused' ? <FiPlay aria-hidden="true" /> : <FiPause aria-hidden="true" />}{reader.status === 'paused' ? '이어서 읽기' : '일시정지'}</button>
            <button type="button" disabled={!active} onClick={reader.stop}><FiSquare aria-hidden="true" />정지</button>
        </div>
        <p className="a11y-help" role="status">{reader.message}</p>
    </div>;
}

export function ReadAloudSection({ enabled, onChange, reader, onSelectText }) {
    return <section className="a11y-section" aria-labelledby="speech-title">
        <div className="a11y-toggle-row"><div><h3 id="speech-title">읽어주기 기능</h3><p className="a11y-help">선택한 글이나 현재 화면의 본문을 음성으로 들을 수 있어요.</p></div>
            <button type="button" role="switch" aria-labelledby="speech-title" aria-checked={enabled} disabled={!reader.supported} className="a11y-switch" onClick={() => onChange(!enabled)}><span aria-hidden="true">{enabled && <FiCheck />}</span></button>
        </div>
        {!reader.supported && <p className="a11y-help">이 브라우저에서는 읽어주기를 지원하지 않아요.</p>}
        {enabled && reader.supported && <><button type="button" className="keyboard-help-button" onClick={onSelectText}>읽을 글 선택하기</button><ReadAloudControls reader={reader} /><p className="a11y-help">‘읽을 글 선택하기’를 누르면 패널이 닫혀요. 본문을 선택한 뒤 표시되는 읽기 버튼을 누르세요. 음성은 기기·브라우저에 따라 달라요. PDF 원본·이미지의 글씨는 제외됩니다.</p></>}
    </section>;
}

export function FloatingReadAloud({ reader, visible }) {
    return visible && ['starting', 'speaking', 'paused'].includes(reader.status) ? createPortal(<ReadAloudControls reader={reader} floating />, document.body) : null;
}

export function SelectionReadPrompt({ reader, visible, onClose }) {
    if (!visible) return null;
    return createPortal(<div className="speech-floating speech-selection-prompt" role="region" aria-label="읽을 글 선택">
        <p className="speech-text" role="status">{reader.selected ? `선택한 글: ${reader.selected.slice(0, 100)}${reader.selected.length > 100 ? '…' : ''}` : '읽고 싶은 본문을 드래그해서 선택해 주세요.'}</p>
        <div className="speech-buttons">
            <button type="button" disabled={!reader.selected} onClick={() => { reader.start('selection'); onClose(); }}>선택한 글 읽기</button>
            <button type="button" onClick={onClose}>선택 취소</button>
        </div>
        <p className="a11y-help">모바일은 글을 길게 눌러 선택하세요. PDF 원본·이미지 속 글씨는 선택할 수 없어요.</p>
    </div>, document.body);
}
