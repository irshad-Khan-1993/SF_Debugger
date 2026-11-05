import React, { useRef, useEffect, useState, useImperativeHandle, forwardRef } from 'react';
import { createRoot } from 'react-dom/client';
import { useVirtualizer } from '@tanstack/react-virtual';

const VirtualLogViewer = forwardRef(function VirtualLogViewer(props, ref) {
    const {
        lines = [],
        textSearch = '',
        lineErrorMap = [],
        lineUserDebugMap = [],
        formatLine = (l) => l,
        emptyMessage = 'No matching log lines for current filter selection.'
    } = props;

    const parentRef = useRef(null);
    const [focusedLineIndex, setFocusedLineIndex] = useState(null);

    const virtualizer = useVirtualizer({
        count: lines.length,
        getScrollElement: () => parentRef.current,
        estimateSize: () => 24,
        overscan: 20
    });

    // Reset scroll when lines or search changes
    useEffect(() => {
        if (parentRef.current && !focusedLineIndex) {
            parentRef.current.scrollTop = 0;
        }
    }, [lines, textSearch]);

    useImperativeHandle(ref, () => ({
        scrollToLine(lineIndex) {
            if (lineIndex >= 0 && lineIndex < lines.length) {
                setFocusedLineIndex(lineIndex);
                virtualizer.scrollToIndex(lineIndex, { align: 'center', behavior: 'auto' });
                setTimeout(() => {
                    setFocusedLineIndex(null);
                }, 2000);
            }
        },
        scrollToTop() {
            if (parentRef.current) {
                parentRef.current.scrollTop = 0;
            }
        },
        getScrollElement() {
            return parentRef.current;
        }
    }), [lines.length, virtualizer]);

    if (!lines || lines.length === 0) {
        if (textSearch) {
            return (
                <div className="viewer_empty_state" style={{ padding: '40px 20px', textAlign: 'center' }}>
                    <i className="fa fa-search" style={{ fontSize: '32px', marginBottom: '12px', color: '#94a3b8', display: 'block' }}></i>
                    <div style={{ fontSize: '15px', fontWeight: 600, marginBottom: '6px' }}>
                        No lines matching "<strong>{textSearch}</strong>" in this log
                    </div>
                    <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '16px' }}>
                        Click any of the red-highlighted logs in the right table to view its matches, or clear the search filter.
                    </div>
                    <button
                        type="button"
                        className="btn_viewer_clear_search"
                        style={{
                            background: '#0284c7',
                            color: '#fff',
                            border: 'none',
                            padding: '6px 16px',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontWeight: 600,
                            fontSize: '12px'
                        }}
                    >
                        Clear Search
                    </button>
                </div>
            );
        }
        return (
            <div className="viewer_empty_state">
                {emptyMessage}
            </div>
        );
    }

    const items = virtualizer.getVirtualItems();

    return (
        <div
            ref={parentRef}
            className="virtual_log_viewport"
            style={{
                height: '100%',
                width: '100%',
                overflowX: 'auto',
                overflowY: 'auto',
                position: 'relative',
                contain: 'strict'
            }}
        >
            <div
                style={{
                    height: `${virtualizer.getTotalSize()}px`,
                    width: '100%',
                    minWidth: 'max-content',
                    position: 'relative'
                }}
            >
                {items.map((virtualRow) => {
                    const idx = virtualRow.index;
                    const line = lines[idx];
                    const isError = Boolean(lineErrorMap && lineErrorMap[idx]);
                    const isUserDebug = Boolean(lineUserDebugMap && lineUserDebugMap[idx]);

                    let formattedResult = formatLine(line, idx, isError, isUserDebug, textSearch);
                    let formattedHtml = '';
                    let isTree = false;

                    if (formattedResult && typeof formattedResult === 'object') {
                        formattedHtml = formattedResult.html || '';
                        isTree = Boolean(formattedResult.isTree);
                    } else {
                        formattedHtml = formattedResult || '';
                    }

                    const isFocused = (focusedLineIndex === idx);
                    const rowClass = `log_row ${isTree ? 'row_has_tree' : ''} ${isError ? 'log_row_error' : ''} ${isUserDebug ? 'log_row_user_debug' : ''} ${isFocused ? 'error_focus_target' : ''}`;

                    return (
                        <div
                            key={virtualRow.key}
                            ref={virtualizer.measureElement}
                            data-index={idx}
                            data-line-num={idx + 1}
                            className={rowClass}
                            style={{
                                position: 'absolute',
                                top: 0,
                                left: 0,
                                width: '100%',
                                minWidth: 'max-content',
                                transform: `translateY(${virtualRow.start}px)`
                            }}
                            dangerouslySetInnerHTML={{ __html: formattedHtml }}
                        />
                    );
                })}
            </div>
        </div>
    );
});

// Standalone Global API mounted on window
let globalRoot = null;
let currentUpdateFn = null;
let viewerRef = null;

window.ApexLogVirtualizer = {
    isAvailable: true,

    isMounted() {
        return Boolean(globalRoot && currentUpdateFn);
    },

    mount(containerEl, initialProps = {}) {
        if (!containerEl) return null;
        if (this.isMounted()) {
            this.update(initialProps);
            return this;
        }

        const AppWrapper = () => {
            const [currentProps, setCurrentProps] = useState(initialProps);
            viewerRef = useRef(null);

            useEffect(() => {
                currentUpdateFn = (newProps) => {
                    setCurrentProps((prev) => ({ ...prev, ...newProps }));
                };
                return () => {
                    currentUpdateFn = null;
                };
            }, []);

            return <VirtualLogViewer ref={viewerRef} {...currentProps} />;
        };

        globalRoot = createRoot(containerEl);
        globalRoot.render(<AppWrapper />);
        return this;
    },

    update(props) {
        if (typeof currentUpdateFn === 'function') {
            currentUpdateFn(props);
        }
    },

    scrollToLine(lineIndex) {
        if (viewerRef && viewerRef.current) {
            viewerRef.current.scrollToLine(lineIndex);
        }
    },

    scrollToTop() {
        if (viewerRef && viewerRef.current) {
            viewerRef.current.scrollToTop();
        }
    }
};
