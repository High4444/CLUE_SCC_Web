import React, { useState, useRef, useEffect } from 'react';
import './ChatPage.css';

const PREDEFINED_QUESTIONS = [
    "내 스펙에 맞는 주거 공고 추천해줘",
    "청년 월세 지원 대상자야?",
    "지원금 신청 방법 알려줘",
];

const INITIAL_MESSAGE = {
    id: 1,
    role: 'ai',
    text: '안녕하세요! 각종 정책과 지원금에 대해 무엇이든 물어보세요.',
    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
};

const ChatPage = ({ onClose }) => {
    const [messages, setMessages] = useState([INITIAL_MESSAGE]);
    const [inputValue, setInputValue] = useState('');
    const [isTyping, setIsTyping] = useState(false);
    const messagesEndRef = useRef(null);

    const scrollToBottom = () => {
        if (messagesEndRef.current) {
            messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages, isTyping]);

    const handleSendMessage = (text) => {
        if (!text.trim()) return;

        const newUserMsg = {
            id: Date.now(),
            role: 'user',
            text: text,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };

        setMessages(prev => [...prev, newUserMsg]);
        setInputValue('');
        setIsTyping(true);

        // Mock AI response
        setTimeout(() => {
            setIsTyping(false);
            const newAiMsg = {
                id: Date.now() + 1,
                role: 'ai',
                text: `'${text}'에 대한 답변입니다.\n분석 결과, 현재 조건에서 지원 가능한 정책들이 확인되었습니다. 더 자세한 내용이 궁금하시면 말씀해주세요!`,
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            };
            setMessages(prev => [...prev, newAiMsg]);
        }, 1200);
    };

    const onSubmit = (e) => {
        e.preventDefault();
        handleSendMessage(inputValue);
    };

    return (
        <div className="chat-popup-container">
            <header className="chat-header">
                <div className="chat-title-box">
                    <div className="bot-avatar">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="white"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-2-11.5c.83 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5-1.5-.67-1.5-1.5.67-1.5 1.5-1.5zm4 0c.83 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5-1.5-.67-1.5-1.5.67-1.5 1.5-1.5zm-2 5c2.33 0 4.31 1.46 5.11 3.5H6.89c.8-2.04 2.78-3.5 5.11-3.5z"/></svg>
                    </div>
                    <div>
                        <h2>CLUE AI 멀티 상담</h2>
                        <span className="status-indicator">베타 준비 중</span>
                    </div>
                </div>
                <button className="close-popup-btn" onClick={onClose}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                </button>
            </header>

            <main className="chat-messages-area">
                <div className="chat-message-list">
                    {messages.map((msg) => (
                        <div key={msg.id} className={`chat-bubble-wrapper ${msg.role === 'user' ? 'user-wrapper' : 'ai-wrapper'}`}>
                            <div className="chat-bubble-content">
                                <div className={`chat-bubble ${msg.role === 'user' ? 'bubble-user' : 'bubble-ai'}`}>
                                    {msg.text.split('\n').map((line, i) => (
                                        <React.Fragment key={i}>
                                            {line}
                                            {i !== msg.text.split('\n').length - 1 && <br />}
                                        </React.Fragment>
                                    ))}
                                </div>
                                <span className="bubble-time">{msg.timestamp}</span>
                            </div>
                        </div>
                    ))}
                    
                    {isTyping && (
                        <div className="chat-bubble-wrapper ai-wrapper">
                            <div className="chat-bubble-content">
                                <div className="chat-bubble bubble-ai typing-bubble">
                                    <div className="typing-dot"></div>
                                    <div className="typing-dot"></div>
                                    <div className="typing-dot"></div>
                                </div>
                            </div>
                        </div>
                    )}
                    <div ref={messagesEndRef} />
                </div>
            </main>

            <footer className="chat-input-area">
                <div className="suggested-chips">
                    {PREDEFINED_QUESTIONS.map((q, idx) => (
                        <button key={idx} className="chip-btn" onClick={() => handleSendMessage(q)}>
                            {q}
                        </button>
                    ))}
                </div>
                <form className="chat-input-wrapper" onSubmit={onSubmit}>
                    <input 
                        type="text" 
                        placeholder="메시지를 입력하세요..." 
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                    />
                    <button type="submit" className={`send-btn ${inputValue.trim() ? 'active' : ''}`} disabled={!inputValue.trim() && !isTyping}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
                    </button>
                </form>
            </footer>
        </div>
    );
};

export default ChatPage;
