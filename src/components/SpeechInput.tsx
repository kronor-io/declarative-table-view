import { useState, useRef, useEffect } from 'react';
import { InputText } from 'primereact/inputtext';

interface SpeechInputProps {
    value: string;
    onChange: (value: string) => void;
}

function SpeechInput({ value, onChange }: SpeechInputProps) {
    const [isListening, setIsListening] = useState(false);
    const recognitionRef = useRef<SpeechRecognition | null>(null);

    useEffect(() => {
        if (!('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) return;
        recognitionRef.current = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
        recognitionRef.current.continuous = false;
        recognitionRef.current.interimResults = false;
        recognitionRef.current.lang = 'en-US';
        recognitionRef.current.onresult = (event: SpeechRecognitionEvent) => {
            const transcript = event.results[0][0].transcript;
            onChange(transcript);
            setIsListening(false);
        };
        recognitionRef.current.onend = () => setIsListening(false);
        recognitionRef.current.onerror = () => setIsListening(false);
    }, [onChange]);

    const handleMicClick = () => {
        if (!recognitionRef.current) return;
        if (isListening) {
            recognitionRef.current.stop();
            setIsListening(false);
        } else {
            onChange('');
            setIsListening(true);
            recognitionRef.current.start();
        }
    };

    return (
        <div className="flex items-center gap-2">
            <InputText
                value={value}
                onChange={e => onChange(e.target.value)}
                placeholder="Speak or type here..."
                className="flex-1 min-w-6xl"
            />
            <button
                type="button"
                onClick={handleMicClick}
                className={`rounded-full p-2 border ${isListening ? 'bg-red-500 text-white' : 'bg-gray-200 text-black'} transition`}
                aria-label={isListening ? 'Stop listening' : 'Start listening'}
            >
                {/* Mic icon: classic microphone shape */}
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5">
                    <rect x="9" y="2" width="6" height="12" rx="3" />
                    <path d="M5 10v2a7 7 0 0 0 14 0v-2" />
                    <line x1="12" y1="19" x2="12" y2="22" />
                    <line x1="8" y1="22" x2="16" y2="22" />
                </svg>
            </button>
            <span className="text-s ml-2">{isListening ? 'Listening...' : ''}</span>
        </div>
    );
}

export default SpeechInput;
