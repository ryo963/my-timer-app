// CSSをインターネットから動的に読み込む
const fcCssLink = document.createElement('link');
fcCssLink.rel = 'stylesheet';
fcCssLink.href = 'https://cdn.jsdelivr.net/npm/fullcalendar@6.1.17/main.min.css';
document.head.appendChild(fcCssLink);

// PWAのためのサービスワーカーを登録
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/service-worker.js').then(reg => console.log('SW registered.')).catch(err => console.log('SW registration failed: ', err));
    });
}

// HTMLの準備が完了するのを待ってから、すべての処理を開始する
document.addEventListener('DOMContentLoaded', function() {
    
    // HTML要素の取得
    const eventTypeInput = document.getElementById('eventTypeInput'),
        eventTypeColor = document.getElementById('eventTypeColor'),
        addEventTypeBtn = document.getElementById('addEventTypeBtn'),
        externalEventsContainer = document.getElementById('external-events'),
        taskInput = document.getElementById('taskInput'),
        startButton = document.getElementById('startButton'),
        stopButton = document.getElementById('stopButton'),
        timerDisplay = document.getElementById('timerDisplay'),
        recordList = document.getElementById('recordList'),
        showListBtn = document.getElementById('showListBtn'),
        showCalendarBtn = document.getElementById('showCalendarBtn'),
        listView = document.getElementById('list-view'),
        calendarWrapper = document.getElementById('calendar-wrapper'),
        calendarEl = document.getElementById('calendar'),
        eventChoiceModal = document.getElementById('event-choice-modal'),
        modalEventList = document.getElementById('modal-event-list'),
        modalCloseBtn = document.getElementById('modal-close-btn'),
        confirmModal = document.getElementById('confirm-modal'),
        confirmModalMessage = document.getElementById('confirm-modal-message'),
        confirmOkBtn = document.getElementById('confirm-ok-btn'),
        confirmCancelBtn = document.getElementById('confirm-cancel-btn');
    
    // アプリケーションの状態管理
    let timerId = null, startTime = 0, records = [], eventTypes = [], calendar = null;

    // 機能定義
    const closeModal = () => { eventChoiceModal.style.display = 'none'; };

    const showConfirm = (message, onConfirm) => {
        confirmModalMessage.textContent = message;
        confirmModal.style.display = 'flex';
        let okListener, cancelListener;
        const closeConfirm = () => {
            confirmModal.style.display = 'none';
            confirmOkBtn.removeEventListener('click', okListener);
            confirmCancelBtn.removeEventListener('click', cancelListener);
        };
        okListener = () => { onConfirm(); closeConfirm(); };
        cancelListener = () => { closeConfirm(); };
        confirmOkBtn.addEventListener('click', okListener);
        confirmCancelBtn.addEventListener('click', cancelListener);
    };

    const renderEventTypes = () => {
        externalEventsContainer.innerHTML = '<p>↓のブロックをカレンダーにドラッグ＆ドロップ（またはタップで作成）</p>';
        eventTypes.forEach((eventType, index) => {
            const wrapperEl = document.createElement('div');
            wrapperEl.className = 'palette-event-wrapper';
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

    const saveEventTypes = () => { localStorage.setItem('myEventTypes', JSON.stringify(eventTypes)); };
    const loadEventTypes = () => {
        const savedTypes = localStorage.getItem('myEventTypes');
        if (savedTypes) { eventTypes = JSON.parse(savedTypes); } else { eventTypes = [{title: '課題', color: '#dc3545'}, {title: 'バイト', color: '#28a745'}]; }
        renderEventTypes();
    };
    const deleteEventType = (indexToDelete) => {
        showConfirm(`「${eventTypes[indexToDelete].title}」の予定ブロックを削除しますか？`, () => {
            eventTypes.splice(indexToDelete, 1);
            saveEventTypes();
            renderEventTypes();
        });
    };

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
            deleteButton.addEventListener('click', () => {
                showConfirm(`この記録を本当に削除しますか？\n「${record.task}」`, () => {
                    deleteRecord(originalIndex);
                });
            });
            li.appendChild(textSpan);
            li.appendChild(deleteButton);
            recordList.appendChild(li);
        });
    };

    const convertRecordsToEvents = () => { return records.map(record => ({ title: record.task, start: new Date(record.createdAt - record.duration), end: new Date(record.createdAt), id: record.createdAt, backgroundColor: record.color, borderColor: record.color })); };
    
    const initializeCalendar = () => {
        calendar = new FullCalendar.Calendar(calendarEl, {
            locale: 'ja', firstDay: 1, initialView: 'timeGridWeek',
            headerToolbar: { left: 'prev,next today', center: 'title', right: 'dayGridMonth,timeGridWeek,timeGridDay' },
            allDaySlot: false, events: [], height: 'auto', editable: true, droppable: true,
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
    };
    
    const updateCalendarEvents = () => { if (calendar) { const events = convertRecordsToEvents(); calendar.getEventSources().forEach(source => source.remove()); calendar.addEventSource(events); } };
    const saveRecords = () => { try { localStorage.setItem('myTimerRecords', JSON.stringify(records)); } catch (e) { console.error("記録の保存に失敗しました:", e); } };
    const loadRecords = () => {
        try {
            const savedRecords = localStorage.getItem('myTimerRecords');
            if (savedRecords) { records = JSON.parse(savedRecords); }
        } catch (e) { console.error("記録の読み込みに失敗しました:", e); records = []; }
        renderListView();
        if (calendar) { updateCalendarEvents(); }
    };
    const deleteRecord = (indexToDelete) => { records.splice(indexToDelete, 1); saveRecords(); renderListView(); updateCalendarEvents(); };
    const formatTime = (milliseconds) => {
        if (milliseconds < 0) milliseconds = 0;
        const totalSeconds = Math.floor(milliseconds / 1000);
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;
        return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    };
    
    // イベントリスナー設定
    modalCloseBtn.addEventListener('click', closeModal);
    eventChoiceModal.addEventListener('click', (e) => { if (e.target === eventChoiceModal) { closeModal(); } });
    confirmCancelBtn.addEventListener('click', () => { confirmModal.style.display = 'none'; });
    addEventTypeBtn.addEventListener('click', () => {
        const newTitle = eventTypeInput.value.trim();
        const newColor = eventTypeColor.value;
        if (newTitle) {
            if (eventTypes.some(type => type.title === newTitle)) { alert('同じ名前の予定ブロックが既に存在します。'); return; }
            eventTypes.push({ title: newTitle, color: newColor });
            saveEventTypes();
            renderEventTypes();
            eventTypeInput.value = '';
        } else { alert('予定名を入力してください'); }
    });
    stopButton.addEventListener('click', () => {
        if (timerId === null) return;
        clearInterval(timerId);
        const elapsedTime = Date.now() - startTime;
        records.push({ task: taskInput.value, duration: elapsedTime, createdAt: Date.now(), color: '#3788d8', source: 'timer' });
        saveRecords();
        renderListView();
        updateCalendarEvents();
        timerId = null;
        taskInput.value = '';
        timerDisplay.textContent = '00:00:00';
    });
    startButton.addEventListener('click', () => { if (timerId !== null) return; if (taskInput.value.trim() === '') { alert('実施内容が入力されていません！'); return; } startTime = Date.now(); timerId = setInterval(() => { timerDisplay.textContent = formatTime(Date.now() - startTime); }, 1000); });
    showListBtn.addEventListener('click', () => { listView.style.display = 'block'; calendarWrapper.style.display = 'none'; showListBtn.classList.add('active'); showCalendarBtn.classList.remove('active'); });
    showCalendarBtn.addEventListener('click', () => { listView.style.display = 'none'; calendarWrapper.style.display = 'block'; showListBtn.classList.remove('active'); showCalendarBtn.classList.add('active'); if (calendar) { calendar.updateSize(); } });

    // アプリケーションの初期化
    new FullCalendar.Draggable(externalEventsContainer, { itemSelector: '.palette-event-wrapper' });
    initializeCalendar();
    loadEventTypes();
    loadRecords();
});