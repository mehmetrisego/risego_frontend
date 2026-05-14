import os

filepath = r'c:\Users\youtu\Desktop\uygulama\23.04.2026\risego_backend-main\risego_frontend\css\style.css'

new_styles = """
/* ============================================
   Withdrawal History (Optimized)
   ============================================ */

.modal-history {
    max-width: 480px;
    max-height: 80vh;
    padding: 24px 20px;
}

.history-modal-body {
    margin: 20px 0;
    max-height: 60vh;
    overflow-y: auto;
    scrollbar-width: thin;
    scrollbar-color: var(--border) transparent;
}

.history-list {
    display: flex;
    flex-direction: column;
    gap: 14px;
}

.history-item {
    background: var(--bg-elevated);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    transition: transform 0.2s ease, border-color 0.2s ease;
}

.history-item:hover {
    border-color: var(--border-hover);
    transform: translateY(-2px);
}

.history-item-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
}

.history-date {
    font-size: 12px;
    color: var(--text-muted);
    font-weight: 500;
}

.history-status {
    font-size: 10px;
    font-weight: 700;
    padding: 4px 10px;
    border-radius: 8px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
}

.history-item-body {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.history-amount {
    font-size: 20px;
    font-weight: 700;
    color: var(--text);
    display: flex;
    align-items: baseline;
    gap: 4px;
}

.history-amount::after {
    content: "TL";
    font-size: 12px;
    font-weight: 500;
    color: var(--text-secondary);
}

.history-iban {
    font-family: monospace;
    font-size: 13px;
    color: var(--text-secondary);
    background: var(--surface);
    padding: 8px 12px;
    border-radius: 8px;
    word-break: break-all;
    border: 1px solid var(--border);
    line-height: 1.4;
}

.history-error-msg {
    font-size: 12px;
    color: #f87171;
    background: rgba(239, 68, 68, 0.08);
    padding: 10px 12px;
    border-radius: 8px;
    border-left: 3px solid #ef4444;
    line-height: 1.5;
}

.status-success { background: rgba(16, 185, 129, 0.15); color: #10b981; }
.status-pending { background: rgba(245, 158, 11, 0.15); color: #f59e0b; }
.status-pending-bank { background: rgba(99, 102, 241, 0.15); color: #818cf8; }
.status-error { background: rgba(239, 68, 68, 0.15); color: #ef4444; }

.history-loading { display: flex; flex-direction: column; align-items: center; padding: 40px; color: var(--text-muted); }
.history-empty { text-align: center; padding: 40px; color: var(--text-muted); font-size: 14px; }
.history-error { text-align: center; padding: 40px; color: var(--error); font-size: 14px; }

.withdraw-history-card .history-hint {
    font-size: 13px;
    color: var(--accent);
    margin-top: 4px;
    font-weight: 500;
}
"""

with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
    content = f.read()

# Find the start of the history section and replace everything after it
if '/* ============================================\n   Withdrawal History' in content:
    parts = content.split('/* ============================================\n   Withdrawal History')
    new_content = parts[0] + new_styles
elif '/* ============================================\\n   Withdrawal History' in content:
    parts = content.split('/* ============================================\\n   Withdrawal History')
    new_content = parts[0] + new_styles
else:
    # Fallback to appending if not found (should not happen normally)
    new_content = content + new_styles

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(new_content)

print("Successfully updated CSS.")
