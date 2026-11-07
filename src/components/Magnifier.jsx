import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import './Magnifier.css';

// A non-interactive visual copy: never changes the source page or sends its content away.
export default function Magnifier({ zoom, onZoom, onClose, suspended }) {
    const lens = useRef(null);
    const stage = useRef(null);
    const controls = useRef(null);
    const point = useRef({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
    const move = useRef(() => {});

    useEffect(() => {
        if (suspended) return;
        const source = document.getElementById('root');
        let timer;
        let frame;
        let disposed = false;
        let rootRect;
        const position = () => {
            if (!lens.current || !rootRect) return;
            const { x, y } = point.current;
            const width = lens.current.clientWidth;
            const height = lens.current.clientHeight;
            // Keep the lens away from the pointer, inside the viewport.
            const left = Math.max(8, Math.min(window.innerWidth - width - 12, x + 24));
            const top = y - height - 24 >= 8 ? y - height - 24 : Math.min(window.innerHeight - height - 12, y + 32);
            lens.current.style.left = `${left}px`;
            lens.current.style.top = `${Math.max(8, top)}px`;
            stage.current.style.transform = `translate(${width / 2 - x * zoom}px, ${height / 2 - y * zoom}px) scale(${zoom})`;
        };
        move.current = position;
        function snapshot() {
            if (disposed || !stage.current) return;
            rootRect = source.getBoundingClientRect();
            const copy = source.cloneNode(true);
            const originals = [source, ...source.querySelectorAll('*')];
            const copies = [copy, ...copy.querySelectorAll('*')];
            copy.style.width = `${rootRect.width}px`;
            copy.style.position = 'absolute';
            copy.style.left = `${rootRect.left}px`;
            copy.style.top = `${rootRect.top}px`;
            const scrolls = [];
            originals.forEach((node, index) => {
                const clone = copies[index];
                clone.removeAttribute('id');
                clone.removeAttribute('autofocus');
                if (clone.hasAttribute('name')) clone.removeAttribute('name');
                if (node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement) {
                    clone.value = node.value;
                    if (node instanceof HTMLInputElement) clone.checked = node.checked;
                }
                if (node instanceof HTMLSelectElement) clone.selectedIndex = node.selectedIndex;
                if (node.scrollTop || node.scrollLeft) scrolls.push([clone, node.scrollTop, node.scrollLeft]);
                if (node instanceof HTMLCanvasElement) {
                    try { clone.getContext('2d')?.drawImage(node, 0, 0); } catch { /* Browser-owned surfaces may be unavailable. */ }
                }
                // Do not load embedded documents a second time or duplicate active media.
                if (['IFRAME', 'OBJECT', 'EMBED', 'VIDEO', 'SCRIPT'].includes(node.tagName)) {
                    const placeholder = document.createElement('div');
                    placeholder.textContent = '이 영역은 원본 뷰어에서 확대해 주세요.';
                    const rect = node.getBoundingClientRect();
                    placeholder.style.cssText = `width:${rect.width}px;height:${rect.height}px;padding:16px;`;
                    clone.replaceWith(placeholder);
                }
            });
            stage.current.style.width = `${window.innerWidth}px`;
            stage.current.style.height = `${window.innerHeight}px`;
            stage.current.replaceChildren(copy);
            scrolls.forEach(([node, top, left]) => { node.scrollTop = top; node.scrollLeft = left; });
            position();
        }
        function scheduleSnapshot() {
            if (timer) return;
            timer = window.setTimeout(() => { timer = null; snapshot(); }, 120);
        }
        function pointer(event) {
            if (event.target.closest?.('.mag-controls')) return;
            point.current = { x: event.clientX, y: event.clientY };
            cancelAnimationFrame(frame);
            frame = requestAnimationFrame(position);
        }
        function key(event) { if (event.key === 'Escape') { event.preventDefault(); onClose(); } }
        snapshot();
        const observer = new MutationObserver(scheduleSnapshot);
        observer.observe(source, { childList: true, subtree: true, attributes: true, characterData: true });
        window.addEventListener('pointermove', pointer, { passive: true });
        window.addEventListener('pointerdown', pointer, { passive: true });
        window.addEventListener('scroll', scheduleSnapshot, true);
        window.addEventListener('resize', scheduleSnapshot);
        document.addEventListener('keydown', key);
        return () => {
            disposed = true; observer.disconnect(); clearTimeout(timer); cancelAnimationFrame(frame);
            window.removeEventListener('pointermove', pointer);
            window.removeEventListener('pointerdown', pointer);
            window.removeEventListener('scroll', scheduleSnapshot, true);
            window.removeEventListener('resize', scheduleSnapshot);
            document.removeEventListener('keydown', key);
        };
    }, [zoom, onClose, suspended]);

    if (suspended) return null;
    return createPortal(<>
        <div className="mag-lens" ref={lens} aria-hidden="true" inert={true}>
            <div className="mag-stage" ref={stage} />
            <span className="mag-badge">{zoom}배 확대</span>
        </div>
        <div className="mag-controls" ref={controls} role="region" aria-label="돋보기 조작"
            onKeyDown={event => {
                const delta = { ArrowLeft: [-24, 0], ArrowRight: [24, 0], ArrowUp: [0, -24], ArrowDown: [0, 24] }[event.key];
                if (!delta) return;
                event.preventDefault();
                point.current = { x: Math.max(0, Math.min(window.innerWidth, point.current.x + delta[0])), y: Math.max(0, Math.min(window.innerHeight, point.current.y + delta[1])) };
                move.current();
            }}>
            <span className="mag-instructions">돋보기 켜짐 · 마우스를 움직이거나 화면을 짚어보세요</span>
            <button type="button" aria-label="돋보기 배율 변경" onClick={() => onZoom(zoom === 2 ? 3 : 2)}>{zoom}배</button>
            <button type="button" onClick={onClose}>돋보기 끄기 <span aria-hidden="true">×</span></button>
            <span className="mag-key-help">Esc로 끄기 · 이 버튼에서 방향키로 위치 이동</span>
        </div>
    </>, document.body);
}
