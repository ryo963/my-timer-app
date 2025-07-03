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
            wrapperEl.style.backgroundColor = eventType.color;
            wrapperEl.style.borderColor = eventType.color;
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
            deleteButton.addEventListener('click', () => { showConfirm(`この記録を本当に削除しますか？\n「${record.task}」`, () => { deleteRecord(originalIndex); }); });
            li.appendChild(textSpan);
            li.appendChild(deleteButton);
            recordList.appendChild(li);
        });
    };
    const convertRecordsToEvents = () => { return records.map(record => ({ title: record.task, start: new Date(record.createdAt - record.duration), end: new Date(record.createdAt), id: record.createdAt, backgroundColor: record.color, borderColor: record.color })); };

    const initializeCalendar = () => {
        calendar = new FullCalendar.Calendar(calendarEl, {
            locale: 'ja', firstDay: 1, initialView: 'timeGridWeek',
            
            headerToolbar: {
                left: 'backToListBtn prev,next today exportPdfBtn',
                center: 'title',
                right: 'dayGridMonth,timeGridWeek' // 'day' を削除
            },
            buttonText: {
                month: '月', // 表示を日本語に
                week: '週'   // 表示を日本語に
            },
            titleFormat: { year: 'numeric', month: 'numeric' }, // 年と月だけの表示に変更

            // --- script.js の initializeCalendar 関数内、customButtons ブロックを、以下で置き換える ---

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

                                // 1. 印刷用のスタイルとHTMLの骨組みを作成
                                // ★ あなたが完成させた横実線CSSをここに適用
                                let printHtml = `
                                    <style>
                                        .print-table { width: 100%; border-collapse: collapse; font-size: 8pt; table-layout: fixed; }
                                        .print-table th, .print-table td { border-left: 1px solid #e0e0e0; border-right: 1px solid #e0e0e0; text-align: center; vertical-align: top; }
                                        .print-table th { background-color: #f7f7f7; height: 40px; padding-top: 10px; border-bottom: 3px solid black; }
                                        .print-table td { padding: 0; position: relative; } /* ★padding:0は維持 */
                                        .hour-col { width: 45px; font-size: 9pt; vertical-align: top; text-align: right; padding-top: -2px; padding-right: 5px; border: none; }
                                        .day-cell { position: relative; }
                                        .hour-slot { height: 40px; box-sizing: border-box; } /* ★1時間の高さを定義 */
                                        .line-odd { border-bottom: 2px dotted grey; }
                                        .line-even { border-bottom: 2px solid black; }
                                        .line-12multiple { border-bottom: 3px solid black; }
                                        .event-block {
                                            position: absolute;
                                            width: calc(100% - 4px);
                                            left: 2px;
                                            color: white;
                                            padding: 2px 4px;
                                            border-radius: 4px;
                                            font-size: 8pt;
                                            font-weight: bold;
                                            overflow: hidden;
                                            box-sizing: border-box;
                                            z-index: 10;
                                            border: 1px solid rgba(0,0,0,0.3);
                                            /* ★★★ ここからが今回の修正箇所 ★★★ */
                                            color: white !important; /* 文字色を強制的に白に */
                                            -webkit-print-color-adjust: exact !important; /* Chrome, Safariでの印刷色を強制 */
                                            print-color-adjust: exact !important; /* 標準の印刷色強制プロパティ */
                                        }
                                    </style>
                                    <h2>${calendar.view.title}</h2>
                                    <table class="print-table">
                                        <thead>
                                            <tr>
                                                <th class="hour-col"></th>
                                `;

                                // 2. 曜日ヘッダーを生成
                                const view = calendar.view;
                                const weekStartDate = view.activeStart;
                                const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
                                for (let i = 0; i < 7; i++) {
                                    const d = new Date(weekStartDate);
                                    d.setDate(d.getDate() + i);
                                    printHtml += `<th>${d.getMonth() + 1}/${d.getDate()}(${weekdays[d.getDay()]})</th>`;
                                }
                                printHtml += '</tr></thead><tbody>';

                                // 3. 6時から23時までの行とセル、罫線を生成
                                for (let hour = 6; hour <= 23; hour++) {
                                    let lineClass = 'hour-slot ';
                                    if (hour % 12 === 0) { lineClass += 'line-12multiple'; }
                                    else if (hour % 4 === 0) { lineClass += 'line-even'; }
                                    else { lineClass += 'line-odd'; }

                                    printHtml += `<tr><td class="hour-col">${hour}:00</td>`;
                                    for (let day = 0; day < 7; day++) {
                                        printHtml += `<td class="day-cell" id="print-cell-${day}-${hour}"><div class="${lineClass}"></div></td>`;
                                    }
                                    printHtml += `</tr>`;
                                }
                                printHtml += '</tbody></table>';
                                
                                printContainer.innerHTML = printHtml;

                                // 4. 全記録データからイベントを配置
                                const allRecords = JSON.parse(localStorage.getItem('myTimerRecords') || '[]');
                                allRecords.forEach(record => {
                                    const eventStartDate = new Date(record.createdAt - record.duration);
                                    
                                    if (eventStartDate >= weekStartDate && eventStartDate < view.activeEnd) {
                                        const dayOfWeek = eventStartDate.getDay();
                                        const startHour = eventStartDate.getHours();
                                        
                                        // イベントを配置すべき親のセルを見つける
                                        const parentCell = printContainer.querySelector(`#print-cell-${dayOfWeek}-${startHour}`);
                                        if (parentCell) {
                                            const eventDiv = document.createElement('div');
                                            eventDiv.className = 'event-block';
                                            
                                            const PIXELS_PER_HOUR = 40; // 1時間の高さを40pxに設定
                                            const startMinute = eventStartDate.getMinutes();
                                            const durationMinutes = record.duration / 1000 / 60;
                                            
                                            // ★★★ 修正点：インラインスタイルで、位置、高さ、色を強制的に指定 ★★★
                                            eventDiv.style.top = `${(startMinute / 60) * PIXELS_PER_HOUR}px`;
                                            eventDiv.style.height = `${(durationMinutes / 60) * PIXELS_PER_HOUR}px`;
                                            eventDiv.style.backgroundColor = record.color;

                                            const startTimeStr = `${String(startHour).padStart(2, '0')}:${String(startMinute).padStart(2, '0')}`;
                                            const endTimeStr = `${String(new Date(record.createdAt).getHours()).padStart(2, '0')}:${String(new Date(record.createdAt).getMinutes()).padStart(2, '0')}`;
                                            eventDiv.innerHTML = `<strong>${startTimeStr}-${endTimeStr}</strong><br>${record.task}`;
                                            
                                            parentCell.appendChild(eventDiv);
                                        }
                                    }
                                });

                                // 5. 印刷機能を呼び出す
                                window.print();

                                // 6. 後片付け
                                printContainer.innerHTML = '';
                            }
                        }
                    },
            allDaySlot: false, events: convertRecordsToEvents(), height: '100%', editable: true, droppable: true,
            stickyHeaderDates: true,
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
    const deleteRecord = (indexToDelete) => { showConfirm(`この記録を本当に削除しますか？\n「${records[indexToDelete].task}」`, () => { records.splice(indexToDelete, 1); saveRecords(); renderListView(); updateCalendarEvents(); }); };
    const formatTime = (milliseconds) => { if (milliseconds < 0) milliseconds = 0; const totalSeconds = Math.floor(milliseconds / 1000); const hours = Math.floor(totalSeconds / 3600); const minutes = Math.floor((totalSeconds % 3600) / 60); const seconds = totalSeconds % 60; return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`; };
    
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
