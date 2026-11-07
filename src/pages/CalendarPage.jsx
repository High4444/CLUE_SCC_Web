import { keyboardAction } from '../utils/keyboardAction';
import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import logoImg from '../assets/logo.png';
import { useNavigate } from 'react-router-dom';
import PersonaWidget from '../components/PersonaWidget';
import HeaderAuthButton from '../components/HeaderAuthButton';
import { listEvents, removeEventForDoc } from '../store/calendarStore';
import { updateDeadline } from '../store/documentStore';
import './CalendarPage.css';

const HOLIDAYS_2026 = {
    0: { 1: '신정' },
    1: { 16: '설날 연휴', 17: '설날', 18: '설날 연휴', 19: '대체공휴일' },
    2: { 1: '삼일절' },
    4: { 5: '어린이날', 24: '부처님오신날' },
    5: { 3: '지방선거일', 6: '현충일' },
    7: { 15: '광복절' },
    8: { 24: '추석 연휴', 25: '추석', 26: '추석 연휴', 28: '대체공휴일' },
    9: { 3: '개천절', 9: '한글날' },
    11: { 25: '성탄절' }
};

function CalendarPage() {
    const navigate = useNavigate();
    const today = new Date();
    const [currentDate, setCurrentDate] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
    const [addedEvents, setAddedEvents] = useState([]);
    const [contextMenu, setContextMenu] = useState({ isOpen: false, x: 0, y: 0, targetDeadline: null });

    useEffect(() => {
        setAddedEvents(listEvents());
    }, []);

    // close context menu on click anywhere
    useEffect(() => {
        const hideMenu = () => setContextMenu(prev => ({ ...prev, isOpen: false }));
        window.addEventListener('click', hideMenu);
        return () => window.removeEventListener('click', hideMenu);
    }, []);

    const weekDays = ['일', '월', '화', '수', '목', '금', '토'];

    // 현재 월의 정보 계산
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth(); // 0-11

    const getHolidayName = (d) => {
        if (year === 2026 && HOLIDAYS_2026[month] && HOLIDAYS_2026[month][d]) {
            return HOLIDAYS_2026[month][d];
        }
        return null;
    };

    const isToday = (d) => {
        const now = new Date();
        return year === now.getFullYear() && month === now.getMonth() && d === now.getDate();
    };

    const colorPalette = ['#F59E0B', '#8B5CF6', '#EC4899', '#06B6D4'];

    const dynamicDeadlines = (Array.isArray(addedEvents) ? addedEvents : [])
        .filter(ev => ev && typeof ev.deadline === 'string')
        .map((ev, idx) => {
            const parts = ev.deadline.split('.'); // e.g. "2026.07.31"
            const evYear = parseInt(parts[0] || '0', 10);
            const evMonth = parseInt(parts[1] || '1', 10) - 1;
            const evDate = parseInt(parts[2] || '1', 10);
            
            return {
                id: `dynamic-${ev.id || Math.random()}`,
                rawEvent: ev,
                isDynamic: true,
                date: evDate,
                month: evMonth,
                year: evYear,
                title: ev.name || '알 수 없는 공고',
                // 결정③: 자동 추정 마감일이면 "추정" 표기(수동 수정 이벤트는 estimated=false).
                estimated: ev.estimated === true,
                color: colorPalette[idx % colorPalette.length]
            };
        });

    // 실이벤트만 표시(F4-c): 사용자가 추가/분석으로 자동 등록된 clue_added_events. 공휴일은 별도.
    const allDeadlines = dynamicDeadlines;
    
    // 현재 달력에 보여질 마감일 필터링
    const currentMonthDeadlines = allDeadlines.filter(d => d.year === year && d.month === month);

    // 해당 월의 1일의 요일 (0:일, 1:월 ...)
    const firstDayOfMonth = new Date(year, month, 1).getDay();
    // 해당 월의 전체 일 수
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    // 캘린더 그리드를 채울 전체 날짜 배열 생성 (빈 칸 포함)
    const calendarDays = [];
    // 1일 이전의 빈 칸들
    for (let i = 0; i < firstDayOfMonth; i++) {
        calendarDays.push({ day: null, type: 'empty' });
    }
    // 실제 날짜들
    for (let i = 1; i <= daysInMonth; i++) {
        calendarDays.push({ day: i, type: 'day' });
    }
    // 마지막 주 나머지 빈 칸들 (7의 배수로 맞춤)
    const remaining = 7 - (calendarDays.length % 7);
    if (remaining < 7) {
        for (let i = 0; i < remaining; i++) {
            calendarDays.push({ day: null, type: 'empty' });
        }
    }

    const prevMonth = () => {
        setCurrentDate(new Date(year, month - 1, 1));
    };

    const nextMonth = () => {
        setCurrentDate(new Date(year, month + 1, 1));
    };

    const handleContextMenu = (e, deadline) => {
        e.preventDefault();
        setContextMenu({
            isOpen: true,
            x: e.clientX,
            y: e.clientY,
            targetDeadline: deadline
        });
    };

    const handleDeleteEvent = () => {
        const { targetDeadline } = contextMenu;
        if (!targetDeadline) { setContextMenu(prev => ({ ...prev, isOpen: false })); return; }

        if (targetDeadline.isDynamic) {
            const ev = targetDeadline.rawEvent;
            const docId = ev.docId || (typeof ev.id === 'string' && ev.id.startsWith('doc-') ? ev.id.slice(4) : null);
            if (docId) {
                // 문서 파생 이벤트(doc-*): 삭제 시 해당 문서의 마감일도 함께 제거(B8 역방향 동기화).
                if (!window.confirm('이 일정을 삭제하면 문서의 마감일 정보도 함께 삭제됩니다. 삭제할까요?')) {
                    setContextMenu(prev => ({ ...prev, isOpen: false }));
                    return;
                }
                updateDeadline(docId, null);   // documentStore: 마감일 제거
                removeEventForDoc(docId);       // 파생 이벤트 제거
                setAddedEvents(listEvents());
            } else {
                // 수동 이벤트: 현행 유지(캘린더에서만 제거).
                const updated = addedEvents.filter(e => e.id !== ev.id);
                setAddedEvents(updated);
                localStorage.setItem('clue_added_events', JSON.stringify(updated));
            }
        }
        setContextMenu(prev => ({ ...prev, isOpen: false }));
    };

    return (
        <div className="cp-page-wrapper">
            {/* 1. Header (Matched to Dashboard System) */}
            <header className="cp-header">
                <div className="cp-header-left">
                    <div {...keyboardAction} className="cp-logo cursor-pointer" onClick={() => navigate('/dashboard')} style={{ display: 'flex', alignItems: 'center' }}>
                        <img src={logoImg} alt="CLUE Logo" style={{ height: '32px' }} />
                    </div>
                </div>

                <div className="cp-header-right">
                    <PersonaWidget />
                    <HeaderAuthButton onLoginSuccess={() => setAddedEvents(listEvents())} />
                </div>
            </header>

            {/* Main Content Area */}
            <main className="cp-main">
                {/* 2. Page Header & Title Section */}
                <div className="cp-page-header">
                    <div className="cp-title-group">
                        <div className="cp-title-row">
                            <h1>정책 캘린더</h1>
                        </div>
                        <p>분석한 공고의 마감일을 한눈에 놓치지 말고 관리하세요.</p>
                    </div>
                </div>

                <div className="cp-content-grid">
                    {/* Left: Calendar Body */}
                    <div className="cp-calendar-section">
                        <div className="cp-calendar-controls">
                            <h3>{year}년 {month + 1}월</h3>
                            <div className="cp-ctrl-btns">
                                <button className="cp-ctrl-btn" onClick={prevMonth}>
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
                                </button>
                                <button className="cp-ctrl-btn" onClick={nextMonth}>
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
                                </button>
                            </div>
                        </div>

                        <div className="cp-calendar-grid">
                            {weekDays.map((day, idx) => {
                                let dayClass = '';
                                if (idx === 0) dayClass = 'sunday';
                                else if (idx === 6) dayClass = 'saturday';
                                return (
                                    <div key={day} className={`cp-day-label ${dayClass}`}>
                                        {day}
                                    </div>
                                );
                            })}
                            {calendarDays.map((item, index) => {
                                const dayDeadlines = item.type === 'day' ? currentMonthDeadlines.filter(d => d.date === item.day) : [];
                                const isSunday = index % 7 === 0;
                                const isSaturday = index % 7 === 6;
                                const holidayName = item.type === 'day' ? getHolidayName(item.day) : null;
                                
                                let cellClass = '';
                                if (item.type === 'empty') {
                                    cellClass = 'empty';
                                } else {
                                    if (isSunday) cellClass = 'sunday';
                                    else if (isSaturday) cellClass = 'saturday';
                                    
                                    if (holidayName) {
                                        cellClass += ' holiday';
                                    }
                                }
                                
                                const isDayToday = item.type === 'day' && isToday(item.day);
                                if (isDayToday) {
                                    cellClass += ' today-cell';
                                }

                                return (
                                    <div key={index} className={`cp-day-cell ${cellClass}`}>
                                        {item.type === 'day' && (
                                            <>
                                                <div className="cp-day-header">
                                                    <span className={`cp-day-num ${isDayToday ? 'today' : ''}`}>{item.day}</span>
                                                    {holidayName && <span className="cp-holiday-name">{holidayName}</span>}
                                                </div>
                                                {dayDeadlines.map((deadline, idx) => (
                                                    <div
                                                        key={`dl-${idx}`}
                                                        className="cp-deadline-bar"
                                                        onContextMenu={(e) => handleContextMenu(e, deadline)}
                                                        style={{
                                                            backgroundColor: `${deadline.color}10`,
                                                            borderLeftColor: deadline.color,
                                                            color: deadline.color,
                                                            marginTop: idx > 0 ? '4px' : '0'
                                                        }}
                                                    >
                                                        {deadline.title}
                                                    </div>
                                                ))}
                                            </>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Right Side Panel */}
                    <aside className="cp-side-panel">
                        <div className="cp-side-card">
                            <h4>이번 달 주요 일정</h4>
                            <div className="cp-deadline-list">
                                {currentMonthDeadlines.slice(0, 5).map((d, i) => (
                                    <div key={i} className="cp-deadline-item">
                                        <div
                                            className="cp-item-date"
                                            style={{ background: `${d.color}10`, color: d.color }}
                                        >
                                            {d.date}
                                        </div>
                                        <div className="cp-item-info">
                                            <div className="cp-item-title">{d.title}</div>
                                            <div className="cp-item-time">{d.estimated ? '해당일 마감 (추정)' : '해당일 마감'}</div>
                                        </div>
                                    </div>
                                ))}
                                {currentMonthDeadlines.length === 0 && (
                                    <div className="cp-item-info" style={{ textAlign: 'center', padding: '20px 0', color: '#94A3B8' }}>
                                        이번 달 일정이 없습니다.
                                    </div>
                                )}
                            </div>
                        </div>
                    </aside>
                </div>
            </main>

            {/* Context Menu for Deletion */}
            {contextMenu.isOpen && (
                <div
                    className="cp-context-menu"
                    style={{ top: contextMenu.y, left: contextMenu.x }}
                    onClick={(e) => e.stopPropagation()}
                >
                    <button className="cp-cm-btn delete" onClick={handleDeleteEvent}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"></path><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                        삭제하기
                    </button>
                </div>
            )}
        </div>
    );
}

export default CalendarPage;
