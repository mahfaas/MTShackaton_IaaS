import { useEffect, useRef, useState } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import 'xterm/css/xterm.css';
import { X } from 'lucide-react';

export default function TerminalModal({ isOpen, onClose, instanceId, instanceName }) {
    const terminalRef = useRef(null);
    const termRef = useRef(null);
    const wsRef = useRef(null);
    const fitAddonRef = useRef(null);
    const [status, setStatus] = useState('connecting');

    useEffect(() => {
        if (!isOpen || !instanceId) return;

        // Create terminal
        const term = new Terminal({
            cursorBlink: true,
            cursorStyle: 'bar',
            fontSize: 14,
            fontFamily: '"JetBrains Mono", "Fira Code", "Cascadia Code", monospace',
            theme: {
                background: '#0d1117',
                foreground: '#c9d1d9',
                cursor: '#58a6ff',
                selectionBackground: '#264f78',
                black: '#484f58',
                red: '#ff7b72',
                green: '#3fb950',
                yellow: '#d29922',
                blue: '#58a6ff',
                magenta: '#bc8cff',
                cyan: '#39c5cf',
                white: '#b1bac4',
            },
            scrollback: 1000,
        });

        const fitAddon = new FitAddon();
        term.loadAddon(fitAddon);

        termRef.current = term;
        fitAddonRef.current = fitAddon;

        // Wait for DOM update
        setTimeout(() => {
            if (terminalRef.current) {
                term.open(terminalRef.current);
                fitAddon.fit();
                term.write('\x1b[1;36m⚡ Connecting to server...\x1b[0m\r\n');
            }

            // Connect WebSocket
            const token = sessionStorage.getItem('token');
            const wsUrl = `ws://localhost:8000/api/v1/terminal/ws/${instanceId}?token=${token}`;
            const ws = new WebSocket(wsUrl);
            wsRef.current = ws;

            ws.binaryType = 'arraybuffer';

            ws.onopen = () => {
                setStatus('connected');
                term.write('\x1b[1;32m✓ Connected!\x1b[0m\r\n\r\n');
            };

            ws.onmessage = (event) => {
                if (event.data instanceof ArrayBuffer) {
                    term.write(new Uint8Array(event.data));
                } else {
                    term.write(event.data);
                }
            };

            ws.onclose = (event) => {
                setStatus('disconnected');
                term.write('\r\n\x1b[1;31m✗ Connection closed\x1b[0m\r\n');
            };

            ws.onerror = () => {
                setStatus('error');
                term.write('\r\n\x1b[1;31m✗ Connection error\x1b[0m\r\n');
            };

            // Send user input to WebSocket
            term.onData((data) => {
                if (ws.readyState === WebSocket.OPEN) {
                    ws.send(new TextEncoder().encode(data));
                }
            });
        }, 100);

        // Handle resize
        const handleResize = () => {
            if (fitAddonRef.current) {
                fitAddonRef.current.fit();
            }
        };
        window.addEventListener('resize', handleResize);

        return () => {
            window.removeEventListener('resize', handleResize);
            if (wsRef.current) {
                wsRef.current.close();
                wsRef.current = null;
            }
            if (termRef.current) {
                termRef.current.dispose();
                termRef.current = null;
            }
        };
    }, [isOpen, instanceId]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-[#0d1117] rounded-2xl w-full max-w-4xl h-[70vh] flex flex-col overflow-hidden shadow-2xl border border-gray-800">
                {/* Title bar */}
                <div className="bg-[#161b22] px-4 py-3 flex items-center justify-between border-b border-gray-800">
                    <div className="flex items-center gap-3">
                        <div className="flex gap-1.5">
                            <div className="w-3 h-3 rounded-full bg-red-500/80"></div>
                            <div className="w-3 h-3 rounded-full bg-yellow-500/80"></div>
                            <div className="w-3 h-3 rounded-full bg-green-500/80"></div>
                        </div>
                        <span className="text-gray-400 text-sm font-mono">
                            {instanceName || instanceId} — /bin/sh
                        </span>
                    </div>
                    <div className="flex items-center gap-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${status === 'connected' ? 'bg-green-500/20 text-green-400' :
                                status === 'connecting' ? 'bg-yellow-500/20 text-yellow-400' :
                                    'bg-red-500/20 text-red-400'
                            }`}>
                            {status === 'connected' ? '● Connected' :
                                status === 'connecting' ? '○ Connecting...' :
                                    '● Disconnected'}
                        </span>
                        <button
                            onClick={onClose}
                            className="text-gray-400 hover:text-white transition-colors p-1 hover:bg-gray-700 rounded"
                        >
                            <X size={18} />
                        </button>
                    </div>
                </div>

                {/* Terminal */}
                <div ref={terminalRef} className="flex-1 p-2" />
            </div>
        </div>
    );
}
