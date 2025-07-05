document.addEventListener('DOMContentLoaded', function() {
    // PWAのためのサービスワーカーを登録
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('/service-worker.js').then(reg => console.log('SW registered.')).catch(err => console.log('SW registration failed: ', err));
        });
    }

    // HTML要素の取得
    const toastContainer = document.getElementById('toast-container');
    const appContainer = document.getElementById('app-container');
    const eventTypeInput = document.getElementById('eventTypeInput'), eventTypeColor = document.getElementById('eventTypeColor'), addEventTypeBtn = document.getElementById('addEventTypeBtn'), externalEventsContainer = document.getElementById('external-events'), taskInput = document.getElementById('taskInput'), startButton = document.getElementById('startButton'), stopButton = document.getElementById('stopButton'), timerDisplay = document.getElementById('timerDisplay'), recordList = document.getElementById('recordList'), showListBtn = document.getElementById('showMainBtn'), showCalendarBtn = document.getElementById('showCalendarBtn'), listView = document.getElementById('list-view'), calendarWrapper = document.getElementById('calendar-wrapper'), calendarEl = document.getElementById('calendar'), eventChoiceModal = document.getElementById('event-choice-modal'), modalEventList = document.getElementById('modal-event-list'), modalCloseBtn = document.getElementById('modal-close-btn'), confirmModal = document.getElementById('confirm-modal'), confirmModalMessage = document.getElementById('confirm-modal-message'), confirmOkBtn = document.getElementById('confirm-ok-btn'), confirmCancelBtn = document.getElementById('confirm-cancel-btn'),printContainer = document.getElementById('print-container');
    
    let timerId = null, startTime = 0, records = [], eventTypes = [], calendar = null;

    const showMainView = () => {
        document.body.classList.remove('calendar-mode');
    };
    const showCalendarView = () => {
        document.body.classList.add('calendar-mode');
        if (calendar) { setTimeout(() => calendar.updateSize(), 0); }
    };

    const closeModal = () => { eventChoiceModal.style.display = 'none'; };
    const showConfirm = (message, onConfirm) => {
        confirmModalMessage.textContent = message;
        confirmModal.style.display = 'flex';
        let okListener, cancelListener;
        const closeConfirm = () => { confirmModal.style.display = 'none'; confirmOkBtn.removeEventListener('click', okListener); confirmCancelBtn.removeEventListener('click', cancelListener); };
        okListener = () => { onConfirm(); closeConfirm(); };
        cancelListener = () => { closeConfirm(); };
        confirmOkBtn.addEventListener('click', okListener);
        confirmCancelBtn.addEventListener('click', cancelListener); 
    };

     // ★★★ トースト通知を表示する機能を追加 ★★★
    const showToast = (message) => {
        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.textContent = message;
        toastContainer.appendChild(toast);

        // アニメーションが終わったら要素を削除
        setTimeout(() => {
            toast.remove();
        }, 3000); // 3秒後に削除
    };

    const renderEventTypes = () => {
        externalEventsContainer.innerHTML = '<p>↓のブロックをカレンダーにドラッグ＆ドロップ（またはタップで作成）</p>';
        eventTypes.forEach((eventType, index) => {
            const wrapperEl = document.createElement('div');
            wrapperEl.className = 'palette-event-wrapper fc-event';
            // ★ 変更点：色をブレンドして適用
             const displayColor = blendColors(eventType.color, '#FFFFFF', 0.65);
            wrapperEl.style.backgroundColor = displayColor;
            wrapperEl.style.borderColor = displayColor;

            wrapperEl.dataset.event = JSON.stringify({ title: eventType.title, duration: '01:00', backgroundColor: eventType.color, borderColor: eventType.color });
            const titleEl = document.createElement('span');
            titleEl.textContent = eventType.title;
            const deleteBtn = document.createElement('button');
            deleteBtn.innerHTML = '&times;';
            deleteBtn.className = 'palette-delete-btn';
            deleteBtn.addEventListener('click', (e) => { e.stopPropagation(); deleteEventType(index); });
            wrapperEl.appendChild(titleEl);
            wrapperEl.appendChild(deleteBtn);
            externalEventsContainer.appendChild(wrapperEl);
        });
    };
    const saveEventTypes = () => { localStorage.setItem('myEventTypes', JSON.stringify(eventTypes));showToast('予定ブロックを更新しました'); // ★通知を呼び出し
    };
    const loadEventTypes = () => { const savedTypes = localStorage.getItem('myEventTypes'); if (savedTypes) { eventTypes = JSON.parse(savedTypes); } else { eventTypes = [{title: '課題', color: '#dc3545'}, {title: 'バイト', color: '#28a745'}]; } renderEventTypes(); };
    const deleteEventType = (indexToDelete) => { showConfirm(`「${eventTypes[indexToDelete].title}」の予定ブロックを削除しますか？`, () => { eventTypes.splice(indexToDelete, 1); saveEventTypes(); renderEventTypes(); }); };
    const renderListView = () => {
        recordList.innerHTML = ''; 
        const sortedRecords = [...records].sort((a,b) => b.createdAt - a.createdAt);
        sortedRecords.forEach(record => {
            const originalIndex = records.indexOf(record);
            const li = document.createElement('li');
            const textSpan = document.createElement('span');
            textSpan.className = 'record-text';
            const endDate = new Date(record.createdAt);
            const startDate = new Date(record.createdAt - record.duration);
            const dateStr = `${startDate.getFullYear()}/${String(startDate.getMonth() + 1).padStart(2, '0')}/${String(startDate.getDate()).padStart(2, '0')}`;
            const startTimeStr = `${String(startDate.getHours()).padStart(2, '0')}:${String(startDate.getMinutes()).padStart(2, '0')}`;
            const endTimeStr = `${String(endDate.getHours()).padStart(2, '0')}:${String(endDate.getMinutes()).padStart(2, '0')}`;
            textSpan.textContent = `[${dateStr} ${startTimeStr}～${endTimeStr}] ${record.task} - ${formatTime(record.duration)}`;
            if (record.source === 'palette') { textSpan.style.color = record.color; textSpan.style.fontWeight = 'bold'; } else { textSpan.style.color = '#333'; }
            const deleteButton = document.createElement('button');
            deleteButton.textContent = '削除';
            deleteButton.className = 'delete-button';
             // ★★★ ここからが今回の修正箇所 ★★★
                    deleteButton.addEventListener('click', () => {
                        // 1. まず確認ダイアログを表示
                        showConfirm(`この記録を本当に削除しますか？\n「${record.task}」`, () => {
                            // 2. OKが押されたら、その記録のIDを使って削除関数を呼び出す
                            deleteRecord(record.createdAt);
                        });
                    });
            li.appendChild(textSpan);
            li.appendChild(deleteButton);
            recordList.appendChild(li);
        });
    };
    const convertRecordsToEvents = () => {
                return records.map(record => {
                    // ★ 変更点：色をブレンドして適用
                    const displayColor = record.source === 'palette' ? blendColors(record.color, '#FFFFFF', 0.65) : record.color;
                    
                    return {
                        title: record.task,
                        start: new Date(record.createdAt - record.duration),
                        end: new Date(record.createdAt),
                        id: record.createdAt,
                        backgroundColor: displayColor,
                        borderColor: displayColor
                    };
                });
            };

    const initializeCalendar = () => {
        calendar = new FullCalendar.Calendar(calendarEl, {
            locale: 'ja', firstDay: 1, initialView: 'timeGridWeek',
            
            headerToolbar: {
                left: 'backToListBtn prev,next today',
                center: 'title',
                right: 'exportPdfBtn dayGridMonth,timeGridWeek' // 'day' を削除
            },
            buttonText: {
                month: '月', // 表示を日本語に
                week: '週'   // 表示を日本語に
            },
            titleFormat: { year: 'numeric', month: 'numeric' }, // 年と月だけの表示に変更

            // --- script.js の initializeCalendar 関数内、customButtons ブロックを、以下で置き換える ---

                    customButtons: {
                        backToListBtn: {
                            text: 'メインに戻る',
                            click: showMainView
                        },
                        exportPdfBtn: {
                            text: 'PDF出力',
                            click: () => {
                                showToast('PDFを生成中です...');
                                try {
                                    const { jsPDF } = window.jspdf;
                                    const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
                                    
                                    const page_w = doc.internal.pageSize.getWidth();
                                    const margin = 30;
                                    const body_w = page_w - (margin * 2);
                                    
                                    // --- SVG生成のためのパラメータ定義 ---
                                    const svg_w = 800; // SVG全体の幅
                                    const hour_col_w = 45; // 時間列の幅
                                    const day_col_w = (svg_w - hour_col_w) / 7; // 1日の幅
                                    const header_h = 40; // ヘッダーの高さ
                                    const hour_h = 40;   // 1時間の高さ

                                    let svgContent = ''; // SVGの中身をここに組み立てていく

                                    // 1. 曜日ヘッダーと背景の描画
                                    const view = calendar.view;
                                    const weekStartDate = view.activeStart;
                                    const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
                                    for (let i = 0; i < 7; i++) {
                                        const d = new Date(weekStartDate);
                                        d.setDate(d.getDate() + i);
                                        const x = hour_col_w + (i * day_col_w);
                                        svgContent += `<rect x="${x}" y="0" width="${day_col_w}" height="${header_h}" fill="#f7f7f7" stroke="#e0e0e0" stroke-width="1"></rect>`;
                                        svgContent += `<text x="${x + day_col_w / 2}" y="${header_h / 2 + 5}" font-family="sans-serif" font-size="12" text-anchor="middle">${d.getMonth() + 1}/${d.getDate()}(${weekdays[d.getDay()]})</text>`;
                                    }
                                    svgContent += `<line x1="${hour_col_w}" y1="${header_h}" x2="${svg_w}" y2="${header_h}" stroke="black" stroke-width="2"></line>`;

                                    // 2. 時間列と罫線の描画
                                    for (let hour = 0; hour <= 23; hour++) {
                                        const y = header_h + (hour) * hour_h;
                                        svgContent += `<text x="${hour_col_w - 5}" y="${y + 14}" font-family="sans-serif" font-size="12" text-anchor="end">${hour}:00</text>`;
                                        
                                        let stroke_w = '1'; let stroke_color = '#e0e0e0'; let stroke_dash = '3, 3';
                                        if (hour % 6 === 0) { stroke_w = '2'; stroke_color = 'black'; stroke_dash = ''; }
                                        else if (hour % 2 === 0) { stroke_w = '1'; stroke_color = 'black'; stroke_dash = ''; }
                                        
                                        svgContent += `<line x1="${hour_col_w}" y1="${y}" x2="${svg_w}" y2="${y}" stroke="${stroke_color}" stroke-width="${stroke_w}" stroke-dasharray="${stroke_dash}"></line>`;
                                    }

                                    // 3. 予定ブロックの描画
                                    const allRecords = JSON.parse(localStorage.getItem('myTimerRecords') || '[]');
                                    allRecords.forEach(record => {
                                        const eventStartDate = new Date(record.createdAt - record.duration);
                                        if (eventStartDate >= weekStartDate && eventStartDate < view.activeEnd) {
                                            // タイムゾーンのずれを考慮し、曜日を正しく計算する
                                            const dayOfWeek = (eventStartDate.getDay() + 6) % 7; // 月曜=0, 日曜=6 に変換
                                            const startHour = eventStartDate.getHours();
                                            //if (startHour < 6) return;

                                            const startMinute = eventStartDate.getMinutes();
                                            const durationMinutes = record.duration / 1000 / 60;
                                            
                                            const x = hour_col_w + (dayOfWeek * day_col_w);
                                            const y = header_h + ((startHour ) * hour_h) + ((startMinute / 60) * hour_h);
                                            const h = (durationMinutes / 60) * hour_h;
                                            const w = day_col_w;

                                            const displayColor = record.source === 'palette' ? blendColors(record.color, '#FFFFFF', 0.6) : record.color;
                                            const startTimeStr = `${String(startHour).padStart(2, '0')}:${String(startMinute).padStart(2, '0')}`;
                                            const endTimeStr = `${String(new Date(record.createdAt).getHours()).padStart(2, '0')}:${String(new Date(record.createdAt).getMinutes()).padStart(2, '0')}`;

                                            // 四角形を描画
                                            svgContent += `<rect x="${x + 2}" y="${y + 1}" width="${w - 4}" height="${h - 2}" rx="3" ry="3" fill="${displayColor}" stroke="rgba(0,0,0,0.3)" stroke-width="1"></rect>`;
                                            
                                            // テキストを描画（クリッピングパスを使ってはみ出さないように）
                                            const clipId = `clip-${record.createdAt}`;
                                            svgContent += `<defs><clipPath id="${clipId}"><rect x="${x + 2}" y="${y + 1}" width="${w - 4}" height="${h - 2}"></rect></clipPath></defs>`;
                                            svgContent += `<text x="${x + 5}" y="${y + 12}" font-family="sans-serif" font-size="10" font-weight="bold" fill="white" clip-path="url(#${clipId})">${startTimeStr}-${endTimeStr} ${record.task}</text>`;
                                        }
                                    });

                                    // 4. SVG全体を組み立てて、PDFに追加
                                    const finalSvg = `<svg width="${svg_w}" height="${header_h + (24 * hour_h)}" xmlns="http://www.w3.org/2000/svg">${svgContent}</svg>`;
                                    const svgBlob = new Blob([finalSvg], {type: 'image/svg+xml;charset=utf-8'});
                                    const url = URL.createObjectURL(svgBlob);
                                    
                                    const img = new Image();
                                    img.onload = function() {
                                        const canvas = document.createElement('canvas');
                                        canvas.width = this.width;
                                        canvas.height = this.height;
                                        const ctx = canvas.getContext('2d');
                                        ctx.drawImage(this, 0, 0);
                                        const dataUrl = canvas.toDataURL('image/png');
                                        
                                        const pdfWidth = doc.internal.pageSize.getWidth();
                                        const pdfHeight = (this.height * pdfWidth) / this.width;
                                        doc.addImage(dataUrl, 'PNG', 0, 40, pdfWidth, pdfHeight);
                                        doc.save("calendar.pdf");
                                        URL.revokeObjectURL(url); // 後片付け
                                    }
                                    img.src = url;

                                } catch(e) {
                                    console.error(e);
                                    alert('PDFの生成に失敗しました。');
                                }
                            }
                        }
                    },
            allDaySlot: false, events: convertRecordsToEvents(), height: '100%', editable: true, droppable: true,
            stickyHeaderDates: true,
            // イベントの長さ変更を開始した瞬間の処理
            eventResizeStart: function(info) {
                // 操作中のイベント要素に、特別なクラスを追加する
                info.el.classList.add('is-resizing');
            },

            // イベントの長さ変更が終了した瞬間の処理
            eventResizeEnd: function(info) {
                // 操作が終わったら、クラスを削除して元の見た目に戻す
                info.el.classList.remove('is-resizing');
            },
            dateClick: function(info) {
                modalEventList.innerHTML = '';
                eventTypes.forEach(eventType => {
                    const button = document.createElement('button');
                    button.textContent = eventType.title;
                    button.style.backgroundColor = eventType.color;
                    button.style.borderColor = eventType.color;
                    button.addEventListener('click', () => {
                        const startTime = info.date;
                        const endTime = new Date(startTime.getTime() + 60 * 60 * 1000);
                        const newRecord = { task: eventType.title, duration: endTime - startTime, createdAt: endTime.getTime(), color: eventType.color, source: 'palette' };
                        records.push(newRecord);
                        saveRecords();
                        renderListView();
                        updateCalendarEvents();
                        closeModal();
                    });
                    modalEventList.appendChild(button);
                });
                eventChoiceModal.style.display = 'flex';
            },
            eventReceive: (info) => {
                const newRecord = { task: info.event.title, duration: info.event.end - info.event.start, createdAt: info.event.end.getTime(), color: info.event.backgroundColor, source: 'palette' };
                records.push(newRecord);
                saveRecords();
                renderListView();
                info.event.setProp('id', newRecord.createdAt);
            },
            eventDrop: (info) => {
                const record = records.find(r => r.createdAt == info.event.id);
                if (record) {
                    const newEndTime = info.event.end.getTime();
                    record.createdAt = newEndTime;
                    record.duration = newEndTime - info.event.start.getTime();
                    info.event.setProp('id', newEndTime);
                    saveRecords();
                    renderListView();
                }
            },
            eventResize: (info) => {
                const record = records.find(r => r.createdAt == info.event.id);
                if (record) {
                    record.createdAt = info.event.end.getTime();
                    record.duration = info.event.end - info.event.start.getTime();
                    info.event.setProp('id', info.event.end.getTime());
                    saveRecords();
                    renderListView();
                }
            }
        });
        calendar.render();
        new FullCalendar.Draggable(externalEventsContainer, { itemSelector: '.palette-event-wrapper' });
    };
    
    const updateCalendarEvents = () => { if (calendar) { const events = convertRecordsToEvents(); calendar.getEventSources().forEach(source => source.remove()); calendar.addEventSource(events); } };
    const saveRecords = () => { try { localStorage.setItem('myTimerRecords', JSON.stringify(records)); showToast('記録を保存しました'); /*★通知を呼び出し*/} catch (e) { console.error("記録の保存に失敗しました:", e); } };
    const loadRecords = () => { try { const savedRecords = localStorage.getItem('myTimerRecords'); if (savedRecords) { records = JSON.parse(savedRecords); } } catch (e) { console.error("記録の読み込みに失敗しました:", e); records = []; } renderListView(); if (calendar) { updateCalendarEvents(); } };
    const deleteRecord = (idToDelete) => {
                // 記録のIDを元に、配列から該当の要素を削除する
                records = records.filter(record => record.createdAt !== idToDelete);
                
                // 変更を保存し、表示を更新する
                saveRecords();
                renderListView();
                updateCalendarEvents();
            };
    const formatTime = (milliseconds) => { if (milliseconds < 0) milliseconds = 0; const totalSeconds = Math.floor(milliseconds / 1000); const hours = Math.floor(totalSeconds / 3600); const minutes = Math.floor((totalSeconds % 3600) / 60); const seconds = totalSeconds % 60; return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`; };
    
    // ★★★ 追加：2つの色を混ぜ合わせる関数 ★★★
    // color1が元の色, color2が混ぜる色(白), ratioが元の色の割合(0.3 = 30%)
    const blendColors = (color1, color2, ratio) => {
        const r1 = parseInt(color1.slice(1, 3), 16);
        const g1 = parseInt(color1.slice(3, 5), 16);
        const b1 = parseInt(color1.slice(5, 7), 16);

        const r2 = parseInt(color2.slice(1, 3), 16);
        const g2 = parseInt(color2.slice(3, 5), 16);
        const b2 = parseInt(color2.slice(5, 7), 16);

        const r = Math.round(r1 * ratio + r2 * (1 - ratio));
        const g = Math.round(g1 * ratio + g2 * (1 - ratio));
        const b = Math.round(b1 * ratio + b2 * (1 - ratio));

        return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
    };

    // イベントリスナー設定
    modalCloseBtn.addEventListener('click', closeModal);
    eventChoiceModal.addEventListener('click', (e) => { if (e.target === eventChoiceModal) { closeModal(); } });
    confirmCancelBtn.addEventListener('click', () => { confirmModal.style.display = 'none'; });
    addEventTypeBtn.addEventListener('click', () => { const newTitle = eventTypeInput.value.trim(); const newColor = eventTypeColor.value; if (newTitle) { if (eventTypes.some(type => type.title === newTitle)) { alert('同じ名前の予定ブロックが既に存在します。'); return; } eventTypes.push({ title: newTitle, color: newColor }); saveEventTypes(); renderEventTypes(); eventTypeInput.value = ''; } else { alert('予定名を入力してください'); } });
    stopButton.addEventListener('click', () => { if (timerId === null) return; clearInterval(timerId); const elapsedTime = Date.now() - startTime; records.push({ task: taskInput.value, duration: elapsedTime, createdAt: Date.now(), color: '#3788d8', source: 'timer' }); saveRecords(); renderListView(); updateCalendarEvents(); timerId = null; taskInput.value = ''; timerDisplay.textContent = '00:00:00'; });
    startButton.addEventListener('click', () => { if (timerId !== null) return; if (taskInput.value.trim() === '') { alert('実施内容が入力されていません！'); return; } startTime = Date.now(); timerId = setInterval(() => { timerDisplay.textContent = formatTime(Date.now() - startTime); }, 1000); });
    showListBtn.addEventListener('click', showMainView);
    showCalendarBtn.addEventListener('click', showCalendarView);

    // アプリケーションの初期化
    loadEventTypes();
    initializeCalendar();
    loadRecords();
});
